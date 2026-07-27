ALTER TABLE workspace_members
  ADD COLUMN display_name text
  CHECK (
    display_name IS NULL
    OR (
      display_name = btrim(display_name)
      AND char_length(display_name) BETWEEN 1 AND 120
    )
  );

CREATE OR REPLACE FUNCTION app_private.api_bootstrap(
  signed_payload text,
  signed_signature text,
  signing_key_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app_private
AS $$
DECLARE
  auth_context record;
  normalized_role text;
  employee_scope text;
  current_display_name text;
  employee_rows jsonb;
  shift_rows jsonb;
  attendance_rows jsonb;
  leave_rows jsonb;
  adjustment_rows jsonb;
  leave_map jsonb := '{}'::jsonb;
  adjustment_map jsonb := '{}'::jsonb;
  item record;
BEGIN
  SELECT * INTO auth_context
    FROM app_private.verify_tenant_context(signed_payload, signed_signature, signing_key_id, 'read', true);

  normalized_role := CASE
    WHEN auth_context.authorized_role IN ('boss', 'manager') THEN 'boss'
    WHEN auth_context.authorized_role = 'employee' THEN 'employee'
    ELSE NULL
  END;
  IF normalized_role IS NULL THEN
    PERFORM app_private.raise_auth_error('WORKSPACE_ACCESS_DENIED');
  END IF;

  employee_scope := CASE WHEN normalized_role = 'employee'
    THEN auth_context.authorized_employee_id ELSE NULL END;
  IF normalized_role = 'employee' AND employee_scope IS NULL THEN
    PERFORM app_private.raise_auth_error('EMPLOYEE_SCOPE_VIOLATION');
  END IF;

  IF normalized_role = 'employee' THEN
    SELECT employee.name
      INTO current_display_name
      FROM employees employee
     WHERE employee.workspace_id = auth_context.authorized_workspace_id
       AND employee.id = employee_scope
       AND employee.status = 'active';
  ELSE
    SELECT member.display_name
      INTO current_display_name
      FROM workspace_members member
     WHERE member.workspace_id = auth_context.authorized_workspace_id
       AND member.user_id = auth_context.authorized_user_id
       AND member.status = 'active'
       AND member.auth_status = 'active';
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', employee.id,
    'name', employee.name,
    'phone', employee.phone,
    'role', employee.job_title,
    'rate', employee.hourly_rate,
    'leaveQuota', employee.leave_quota,
    'revision', employee.revision
  ) ORDER BY employee.created_at, employee.id), '[]'::jsonb)
  INTO employee_rows
  FROM employees employee
  WHERE employee.workspace_id = auth_context.authorized_workspace_id
    AND employee.status = 'active'
    AND (employee_scope IS NULL OR employee.id = employee_scope);

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', shift.id,
    'employeeId', shift.employee_id,
    'date', to_char(shift.work_date, 'YYYY-MM-DD'),
    'start', to_char(shift.start_time, 'HH24:MI'),
    'end', to_char(shift.end_time, 'HH24:MI'),
    'note', shift.note,
    'revision', shift.revision
  ) ORDER BY shift.work_date, shift.start_time, shift.id), '[]'::jsonb)
  INTO shift_rows
  FROM shifts shift
  WHERE shift.workspace_id = auth_context.authorized_workspace_id
    AND (employee_scope IS NULL OR shift.employee_id = employee_scope);

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', attendance.id,
    'employeeId', attendance.employee_id,
    'date', to_char(attendance.work_date, 'YYYY-MM-DD'),
    'type', attendance.attendance_type,
    'hours', attendance.hours,
    'clockIn', attendance.clock_in,
    'clockOut', attendance.clock_out,
    'note', attendance.note,
    'revision', attendance.revision
  ) ORDER BY attendance.work_date, attendance.created_at, attendance.id), '[]'::jsonb)
  INTO attendance_rows
  FROM attendance_records attendance
  WHERE attendance.workspace_id = auth_context.authorized_workspace_id
    AND (employee_scope IS NULL OR attendance.employee_id = employee_scope);

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'employeeId', selection.employee_id,
    'date', to_char(selection.leave_date, 'YYYY-MM-DD')
  ) ORDER BY selection.employee_id, selection.leave_date), '[]'::jsonb)
  INTO leave_rows
  FROM leave_selections selection
  WHERE selection.workspace_id = auth_context.authorized_workspace_id
    AND selection.status = 'approved'
    AND (employee_scope IS NULL OR selection.employee_id = employee_scope);

  FOR item IN SELECT value FROM jsonb_array_elements(leave_rows) value LOOP
    leave_map := jsonb_set(
      leave_map,
      ARRAY[(item.value->>'employeeId') || '-' || left(item.value->>'date', 7)],
      coalesce(leave_map->((item.value->>'employeeId') || '-' || left(item.value->>'date', 7)), '[]'::jsonb)
        || jsonb_build_array(item.value->>'date'),
      true
    );
  END LOOP;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'employeeId', adjustment.employee_id,
    'month', adjustment.payroll_month,
    'amount', adjustment.amount,
    'date', to_char(adjustment.adjustment_date, 'YYYY-MM-DD'),
    'note', adjustment.note,
    'revision', adjustment.revision
  ) ORDER BY adjustment.employee_id, adjustment.payroll_month, adjustment.adjustment_date, adjustment.id), '[]'::jsonb)
  INTO adjustment_rows
  FROM payroll_adjustments adjustment
  WHERE adjustment.workspace_id = auth_context.authorized_workspace_id
    AND (employee_scope IS NULL OR adjustment.employee_id = employee_scope);

  FOR item IN SELECT value FROM jsonb_array_elements(adjustment_rows) value LOOP
    adjustment_map := jsonb_set(
      adjustment_map,
      ARRAY[(item.value->>'employeeId') || '-' || (item.value->>'month')],
      coalesce(adjustment_map->((item.value->>'employeeId') || '-' || (item.value->>'month')), '[]'::jsonb)
        || jsonb_build_array(item.value - 'employeeId' - 'month'),
      true
    );
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'workspaceId', auth_context.authorized_workspace_id,
    'role', normalized_role,
    'employeeId', employee_scope,
    'currentUser', jsonb_build_object(
      'displayName', current_display_name,
      'role', normalized_role,
      'employeeId', employee_scope,
      'workspaceId', auth_context.authorized_workspace_id
    ),
    'data', jsonb_build_object(
      'workspace', jsonb_build_object(
        'id', auth_context.authorized_workspace_id,
        'name', (SELECT workspace.name FROM workspaces workspace
                 WHERE workspace.id = auth_context.authorized_workspace_id)
      ),
      'sync', jsonb_build_object('revision', 0, 'schemaVersion', 1),
      'employees', employee_rows,
      'shifts', shift_rows,
      'attendance', attendance_rows,
      'leaves', leave_map,
      'payrollAdjustments', adjustment_map,
      'leaveRequests', '{}'::jsonb,
      'leaveHistory', '[]'::jsonb,
      'removedEmployees', '[]'::jsonb,
      'access', '{}'::jsonb
    )
  );
END
$$;

REVOKE ALL ON FUNCTION app_private.api_bootstrap(text,text,text) FROM PUBLIC;
