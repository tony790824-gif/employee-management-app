CREATE OR REPLACE FUNCTION app_private.api_execute_command(
  signed_payload text,
  signed_signature text,
  signing_key_id text,
  command_name text,
  command_input jsonb,
  idempotency_key text,
  request_hash text,
  request_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app_private
AS $$
DECLARE
  auth_context record;
  prior command_receipts%ROWTYPE;
  response jsonb;
  body jsonb;
  resource_type text;
  resource_id text;
  target_employee_id text;
  occurred_at timestamptz;
  month_start date;
  leave_count integer;
BEGIN
  SELECT * INTO auth_context
    FROM app_private.verify_tenant_context(signed_payload, signed_signature, signing_key_id, 'command', true);
  IF command_name NOT IN (
    'employees.create', 'shifts.create', 'leaves.replace-month',
    'attendance.clock-in', 'attendance.clock-out', 'attendance.approve-hours'
  ) OR command_input IS NULL OR jsonb_typeof(command_input) <> 'object'
     OR idempotency_key !~ '^[A-Za-z0-9._:-]{8,128}$'
     OR request_hash !~ '^[a-f0-9]{64}$'
     OR request_id !~ '^[A-Za-z0-9._:-]{8,128}$' THEN
    PERFORM app_private.raise_auth_error('COMMAND_INVALID');
  END IF;
  SELECT * INTO prior FROM command_receipts
   WHERE workspace_id = auth_context.authorized_workspace_id
     AND command_receipts.idempotency_key = api_execute_command.idempotency_key
   FOR UPDATE;
  IF FOUND THEN
    IF prior.command_name <> api_execute_command.command_name
       OR prior.request_hash <> api_execute_command.request_hash THEN
      PERFORM app_private.raise_auth_error('IDEMPOTENCY_KEY_REUSED');
    END IF;
    RETURN prior.response_body || jsonb_build_object('replayed', true);
  END IF;

  IF command_name = 'employees.create' THEN
    IF auth_context.authorized_role NOT IN ('boss', 'manager') THEN
      PERFORM app_private.raise_auth_error('COMMAND_FORBIDDEN');
    END IF;
    INSERT INTO employees(workspace_id, id, name, job_title, phone, hourly_rate, leave_quota)
    VALUES (auth_context.authorized_workspace_id, command_input->>'generatedId', command_input->>'name',
      command_input->>'jobTitle', command_input->>'phone', (command_input->>'hourlyRate')::integer,
      (command_input->>'leaveQuota')::smallint)
    RETURNING jsonb_build_object('id', id, 'name', name, 'jobTitle', job_title, 'phone', phone,
      'hourlyRate', hourly_rate, 'leaveQuota', leave_quota, 'status', status, 'revision', revision) INTO body;
    resource_type := 'employee';
    resource_id := body->>'id';

  ELSIF command_name = 'shifts.create' THEN
    IF auth_context.authorized_role NOT IN ('boss', 'manager') THEN
      PERFORM app_private.raise_auth_error('COMMAND_FORBIDDEN');
    END IF;
    INSERT INTO shifts(workspace_id, id, employee_id, work_date, start_time, end_time, note)
    VALUES (auth_context.authorized_workspace_id, command_input->>'generatedId', command_input->>'employeeId',
      (command_input->>'date')::date, (command_input->>'startTime')::time, (command_input->>'endTime')::time,
      command_input->>'note')
    RETURNING jsonb_build_object('id', id, 'employeeId', employee_id, 'date', to_char(work_date, 'YYYY-MM-DD'),
      'startTime', to_char(start_time, 'HH24:MI'), 'endTime', to_char(end_time, 'HH24:MI'),
      'note', note, 'revision', revision) INTO body;
    resource_type := 'shift';
    resource_id := body->>'id';

  ELSIF command_name = 'leaves.replace-month' THEN
    IF auth_context.authorized_role NOT IN ('boss', 'manager', 'employee') THEN
      PERFORM app_private.raise_auth_error('COMMAND_FORBIDDEN');
    END IF;
    target_employee_id := CASE WHEN auth_context.authorized_role = 'employee'
      THEN auth_context.authorized_employee_id ELSE command_input->>'employeeId' END;
    IF target_employee_id IS NULL OR (auth_context.authorized_role = 'employee'
       AND command_input ? 'employeeId' AND command_input->>'employeeId' <> target_employee_id) THEN
      PERFORM app_private.raise_auth_error('EMPLOYEE_SCOPE_VIOLATION');
    END IF;
    month_start := ((command_input->>'month') || '-01')::date;
    SELECT count(*) INTO leave_count FROM jsonb_array_elements_text(command_input->'dates');
    IF leave_count > (SELECT leave_quota FROM employees
      WHERE workspace_id = auth_context.authorized_workspace_id
        AND id = target_employee_id AND status = 'active') THEN
      PERFORM app_private.raise_auth_error('LEAVE_QUOTA_EXCEEDED');
    END IF;
    DELETE FROM leave_selections
     WHERE workspace_id = auth_context.authorized_workspace_id
       AND leave_selections.employee_id = target_employee_id
       AND leave_date >= month_start AND leave_date < month_start + interval '1 month';
    INSERT INTO leave_selections(workspace_id, employee_id, leave_date)
    SELECT auth_context.authorized_workspace_id, target_employee_id, value::date
      FROM jsonb_array_elements_text(command_input->'dates') value;
    body := jsonb_build_object('employeeId', target_employee_id, 'month', command_input->>'month',
      'dates', command_input->'dates');
    resource_type := 'leave_selection';
    resource_id := target_employee_id || ':' || (command_input->>'month');

  ELSIF command_name = 'attendance.clock-in' THEN
    IF auth_context.authorized_role <> 'employee' OR auth_context.authorized_employee_id IS NULL THEN
      PERFORM app_private.raise_auth_error('COMMAND_FORBIDDEN');
    END IF;
    occurred_at := (command_input->>'occurredAt')::timestamptz;
    INSERT INTO attendance_records(workspace_id, id, employee_id, work_date, clock_in, note)
    VALUES (auth_context.authorized_workspace_id, command_input->>'generatedId',
      auth_context.authorized_employee_id, (occurred_at AT TIME ZONE 'Asia/Taipei')::date,
      occurred_at, 'employee clock-in')
    RETURNING jsonb_build_object('id', id, 'employeeId', employee_id, 'date', to_char(work_date, 'YYYY-MM-DD'),
      'hours', hours, 'clockIn', clock_in, 'clockOut', clock_out, 'revision', revision) INTO body;
    resource_type := 'attendance';
    resource_id := body->>'id';

  ELSIF command_name = 'attendance.clock-out' THEN
    IF auth_context.authorized_role <> 'employee' OR auth_context.authorized_employee_id IS NULL THEN
      PERFORM app_private.raise_auth_error('COMMAND_FORBIDDEN');
    END IF;
    occurred_at := (command_input->>'occurredAt')::timestamptz;
    UPDATE attendance_records SET clock_out = occurred_at,
      hours = greatest(0.5, round((extract(epoch FROM (occurred_at - clock_in)) / 3600) * 2) / 2),
      revision = revision + 1, note = 'employee clock-out'
    WHERE workspace_id = auth_context.authorized_workspace_id
      AND attendance_records.employee_id = auth_context.authorized_employee_id
      AND clock_in IS NOT NULL AND clock_out IS NULL
    RETURNING jsonb_build_object('id', id, 'employeeId', employee_id, 'date', to_char(work_date, 'YYYY-MM-DD'),
      'hours', hours, 'clockIn', clock_in, 'clockOut', clock_out, 'revision', revision) INTO body;
    IF body IS NULL THEN PERFORM app_private.raise_auth_error('ATTENDANCE_NOT_CLOCKED_IN'); END IF;
    resource_type := 'attendance';
    resource_id := body->>'id';

  ELSIF command_name = 'attendance.approve-hours' THEN
    IF auth_context.authorized_role NOT IN ('boss', 'manager') THEN
      PERFORM app_private.raise_auth_error('COMMAND_FORBIDDEN');
    END IF;
    UPDATE attendance_records SET hours = (command_input->>'hours')::numeric, revision = revision + 1
    WHERE workspace_id = auth_context.authorized_workspace_id
      AND id = command_input->>'attendanceId'
      AND revision = (command_input->>'baseRevision')::integer
    RETURNING jsonb_build_object('id', id, 'employeeId', employee_id, 'date', to_char(work_date, 'YYYY-MM-DD'),
      'hours', hours, 'clockIn', clock_in, 'clockOut', clock_out, 'revision', revision) INTO body;
    IF body IS NULL THEN PERFORM app_private.raise_auth_error('REVISION_CONFLICT'); END IF;
    resource_type := 'attendance';
    resource_id := body->>'id';
  END IF;

  response := jsonb_build_object('ok', true, 'data', body);
  INSERT INTO command_receipts(workspace_id, idempotency_key, command_name, request_hash, response_body, actor_user_id)
  VALUES (auth_context.authorized_workspace_id, idempotency_key, command_name, request_hash,
    response, auth_context.authorized_user_id);
  INSERT INTO audit_logs(workspace_id, actor_user_id, action, resource_type, resource_id, request_id, payload)
  VALUES (auth_context.authorized_workspace_id, auth_context.authorized_user_id, command_name,
    resource_type, resource_id, request_id, jsonb_build_object('idempotencyKey', idempotency_key));
  INSERT INTO outbox_events(workspace_id, event_type, aggregate_type, aggregate_id, payload)
  VALUES (auth_context.authorized_workspace_id, command_name || '.completed', resource_type, resource_id, body);
  RETURN response;
END
$$;
