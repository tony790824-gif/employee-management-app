-- Pending product migration: NOT in the immutable Production execution manifest.
-- Apply only in an explicitly authorized transaction. Existing migrations/0010 are untouched.
-- Runtime EXECUTE grants for the two new entrypoints require separate reviewed authorization.
-- No Auth0 accounts, identity_principals, global users or global sessions are created/modified.
ALTER TABLE employees ADD COLUMN employment_status text NOT NULL DEFAULT 'active'
  CHECK (employment_status IN ('active', 'inactive', 'departed'));
UPDATE employees SET employment_status = 'inactive' WHERE status = 'archived';
ALTER TABLE employees ADD CONSTRAINT employee_employment_status_consistent
  CHECK ((employment_status = 'active') = (status = 'active'));
ALTER TABLE workspace_members ADD COLUMN employee_access_suspended boolean NOT NULL DEFAULT false;

CREATE FUNCTION app_private.api_employee_administration(p_payload text, p_signature text, p_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, app_private, pg_temp AS $$
DECLARE auth record; staff jsonb; accounts jsonb;
BEGIN
  SELECT * INTO auth FROM app_private.verify_tenant_context(p_payload, p_signature, p_key, 'read', true);
  IF auth.authorized_role NOT IN ('boss', 'manager') THEN
    PERFORM app_private.raise_auth_error('COMMAND_FORBIDDEN');
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', e.id, 'name', e.name, 'phone', e.phone, 'role', e.job_title,
    'rate', e.hourly_rate, 'leaveQuota', e.leave_quota, 'revision', e.revision,
    'status', e.employment_status, 'accountUserId', m.user_id,
    'accountPhone', u.phone, 'accountRole', m.role,
    'accountStatus', CASE
      WHEN m.user_id IS NULL THEN 'UNLINKED'
      WHEN m.role <> 'employee' THEN 'PRIVILEGED'
      WHEN e.status <> 'active' OR m.status <> 'active' OR m.auth_status <> 'active'
        OR u.status <> 'active' THEN 'DISABLED'
      WHEN NOT EXISTS (SELECT 1 FROM app_private.identity_principals i
        WHERE i.user_id = m.user_id AND i.status = 'active') THEN 'IDENTITY_MISSING'
      ELSE 'READY' END,
    'canResumeAccount', m.employee_access_suspended
  ) ORDER BY e.created_at, e.id), '[]'::jsonb) INTO staff
  FROM employees e LEFT JOIN workspace_members m ON m.workspace_id=e.workspace_id AND m.employee_id=e.id
  LEFT JOIN users u ON u.id=m.user_id
  WHERE e.workspace_id=auth.authorized_workspace_id;

  SELECT coalesce(jsonb_agg(jsonb_build_object('userId', m.user_id,
    'displayName', coalesce(m.display_name, u.phone), 'phone', u.phone) ORDER BY u.phone), '[]'::jsonb)
  INTO accounts FROM workspace_members m JOIN users u ON u.id=m.user_id
  WHERE m.workspace_id=auth.authorized_workspace_id AND m.role='employee'
    AND m.employee_id IS NULL AND m.status IN ('active', 'invited') AND m.auth_status='active'
    AND NOT m.employee_access_suspended AND u.status='active'
    AND EXISTS (SELECT 1 FROM app_private.identity_principals i WHERE i.user_id=m.user_id AND i.status='active');
  RETURN jsonb_build_object('ok', true, 'data', staff, 'accounts', accounts);
END $$;
REVOKE ALL ON FUNCTION app_private.api_employee_administration(text,text,text) FROM PUBLIC;

CREATE FUNCTION app_private.api_execute_employee_command(
  p_payload text, p_signature text, p_key text, p_command text, p_input jsonb,
  p_idempotency text, p_hash text, p_request text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, app_private, pg_temp AS $$
DECLARE
  auth record; e employees%ROWTYPE; m workspace_members%ROWTYPE;
  prior command_receipts%ROWTYPE; result jsonb; required text[];
BEGIN
  SELECT * INTO auth FROM app_private.verify_tenant_context(p_payload, p_signature, p_key, 'command', true);
  IF auth.authorized_role NOT IN ('boss', 'manager') THEN
    PERFORM app_private.raise_auth_error('COMMAND_FORBIDDEN');
  END IF;
  IF p_command IS NULL OR p_command NOT IN ('employees.update','employees.set-status','employees.link-account')
    OR p_input IS NULL OR jsonb_typeof(p_input) <> 'object'
    OR p_idempotency IS NULL OR p_idempotency !~ '^[A-Za-z0-9._:-]{8,128}$'
    OR p_hash IS NULL OR p_hash !~ '^[a-f0-9]{64}$'
    OR p_request IS NULL OR p_request !~ '^[A-Za-z0-9._:-]{8,128}$' THEN
    PERFORM app_private.raise_auth_error('COMMAND_INVALID');
  END IF;
  required := ARRAY['employeeId','baseRevision'] || CASE p_command
    WHEN 'employees.update' THEN ARRAY['name','phone','jobTitle','hourlyRate','leaveQuota']
    WHEN 'employees.set-status' THEN ARRAY['status'] ELSE ARRAY['userId'] END;
  IF NOT p_input ?& required OR EXISTS (SELECT 1 FROM jsonb_object_keys(p_input) k WHERE NOT k=ANY(required))
    OR jsonb_typeof(p_input->'employeeId') IS DISTINCT FROM 'string'
    OR p_input->>'employeeId' !~ '^[A-Za-z0-9._:-]{1,128}$'
    OR jsonb_typeof(p_input->'baseRevision') IS DISTINCT FROM 'number'
    OR p_input->>'baseRevision' !~ '^[0-9]{1,9}$' THEN
    PERFORM app_private.raise_auth_error('COMMAND_INVALID');
  END IF;
  -- Serialize retries before checking the target revision; exactly one receipt per workspace/key.
  PERFORM pg_advisory_xact_lock(hashtextextended(auth.authorized_workspace_id || ':' || p_idempotency, 0));
  SELECT * INTO prior FROM command_receipts
    WHERE workspace_id=auth.authorized_workspace_id AND idempotency_key=p_idempotency;
  IF FOUND THEN
    IF prior.command_name<>p_command OR prior.request_hash<>p_hash THEN
      PERFORM app_private.raise_auth_error('IDEMPOTENCY_KEY_REUSED');
    END IF;
    RETURN prior.response_body || jsonb_build_object('replayed',true);
  END IF;
  SELECT * INTO e FROM employees WHERE workspace_id=auth.authorized_workspace_id AND id=p_input->>'employeeId' FOR UPDATE;
  IF NOT FOUND THEN PERFORM app_private.raise_auth_error('EMPLOYEE_NOT_FOUND'); END IF;
  IF e.revision<>(p_input->>'baseRevision')::integer THEN
    PERFORM app_private.raise_auth_error('REVISION_CONFLICT');
  END IF;
  SELECT * INTO m FROM workspace_members
    WHERE workspace_id=e.workspace_id AND employee_id=e.id FOR UPDATE;
  IF FOUND AND m.role<>'employee' THEN
    PERFORM app_private.raise_auth_error('EMPLOYEE_PRIVILEGED_ACCOUNT');
  END IF;

  IF p_command='employees.update' THEN
    IF jsonb_typeof(p_input->'name') IS DISTINCT FROM 'string'
      OR length(btrim(p_input->>'name')) NOT BETWEEN 1 AND 120
      OR jsonb_typeof(p_input->'phone') IS DISTINCT FROM 'string' OR p_input->>'phone' !~ '^[0-9]{8,15}$'
      OR jsonb_typeof(p_input->'jobTitle') IS DISTINCT FROM 'string' OR length(p_input->>'jobTitle')>120
      OR jsonb_typeof(p_input->'hourlyRate') IS DISTINCT FROM 'number' OR p_input->>'hourlyRate' !~ '^[0-9]{1,9}$'
      OR jsonb_typeof(p_input->'leaveQuota') IS DISTINCT FROM 'number' OR p_input->>'leaveQuota' !~ '^[0-9]{1,2}$'
      OR (p_input->>'leaveQuota')::integer>31 THEN
      PERFORM app_private.raise_auth_error('COMMAND_INVALID');
    END IF;
    UPDATE employees SET name=btrim(p_input->>'name'), phone=p_input->>'phone', job_title=btrim(p_input->>'jobTitle'),
      hourly_rate=(p_input->>'hourlyRate')::integer, leave_quota=(p_input->>'leaveQuota')::smallint,
      revision=revision+1 WHERE workspace_id=e.workspace_id AND id=e.id RETURNING * INTO e;
  ELSIF p_command='employees.set-status' THEN
    IF jsonb_typeof(p_input->'status') IS DISTINCT FROM 'string'
      OR p_input->>'status' NOT IN ('active','inactive','departed') THEN
      PERFORM app_private.raise_auth_error('COMMAND_INVALID');
    END IF;
    IF p_input->>'status'<>'active' THEN
      IF EXISTS(SELECT 1 FROM attendance_records WHERE workspace_id=e.workspace_id AND employee_id=e.id
        AND clock_in IS NOT NULL AND clock_out IS NULL) THEN
        PERFORM app_private.raise_auth_error('EMPLOYEE_ATTENDANCE_OPEN');
      END IF;
      -- Only mark access that this operation actually suspended. Do not clear independent security suspensions.
      UPDATE workspace_members SET status='suspended', auth_status='disabled',
        employee_access_suspended=employee_access_suspended OR (status='active' AND auth_status='active')
        WHERE workspace_id=e.workspace_id AND employee_id=e.id;
    END IF;
    UPDATE employees SET employment_status=p_input->>'status',
      status=CASE WHEN p_input->>'status'='active' THEN 'active' ELSE 'archived' END,
      deleted_at=CASE WHEN p_input->>'status'='active' THEN NULL ELSE clock_timestamp() END,
      purge_after=NULL, revision=revision+1 WHERE workspace_id=e.workspace_id AND id=e.id RETURNING * INTO e;
  ELSE
    IF e.status<>'active' OR jsonb_typeof(p_input->'userId') IS DISTINCT FROM 'string'
      OR p_input->>'userId' !~ '^[a-fA-F0-9-]{36}$' THEN
      PERFORM app_private.raise_auth_error('EMPLOYEE_ACCOUNT_NOT_ELIGIBLE');
    END IF;
    -- Never replace another linked identity, promote a manager, create an identity, or cross workspace boundaries.
    IF m.user_id IS NOT NULL AND m.user_id::text<>p_input->>'userId' THEN
      PERFORM app_private.raise_auth_error('EMPLOYEE_ACCOUNT_NOT_ELIGIBLE');
    END IF;
    SELECT * INTO m FROM workspace_members WHERE workspace_id=e.workspace_id
      AND user_id=(p_input->>'userId')::uuid FOR UPDATE;
    IF NOT FOUND OR m.role<>'employee' OR (m.employee_id IS NOT NULL AND m.employee_id<>e.id)
      OR NOT ((m.status IN ('active','invited') AND m.auth_status='active' AND NOT m.employee_access_suspended)
        OR (m.employee_id=e.id AND m.employee_access_suspended AND m.status='suspended' AND m.auth_status='disabled'))
      OR NOT EXISTS(SELECT 1 FROM users WHERE id=m.user_id AND status='active')
      OR NOT EXISTS(SELECT 1 FROM app_private.identity_principals WHERE user_id=m.user_id AND status='active') THEN
      PERFORM app_private.raise_auth_error('EMPLOYEE_ACCOUNT_NOT_ELIGIBLE');
    END IF;
    UPDATE workspace_members SET employee_id=e.id, status='active', auth_status='active', employee_access_suspended=false
      WHERE workspace_id=e.workspace_id AND user_id=m.user_id;
    UPDATE employees SET revision=revision+1 WHERE workspace_id=e.workspace_id AND id=e.id RETURNING * INTO e;
  END IF;
  result:=jsonb_build_object('ok',true,'data',jsonb_build_object('id',e.id,'revision',e.revision,'status',e.employment_status));
  INSERT INTO command_receipts(workspace_id,idempotency_key,command_name,request_hash,response_body,actor_user_id)
    VALUES(e.workspace_id,p_idempotency,p_command,p_hash,result,auth.authorized_user_id);
  INSERT INTO audit_logs(workspace_id,actor_user_id,action,resource_type,resource_id,request_id,payload)
    VALUES(e.workspace_id,auth.authorized_user_id,p_command,'employee',e.id,p_request,
      jsonb_build_object('idempotencyKey',p_idempotency,'revision',e.revision));
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION app_private.api_execute_employee_command(text,text,text,text,jsonb,text,text,text) FROM PUBLIC;
