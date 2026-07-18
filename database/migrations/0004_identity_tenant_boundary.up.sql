CREATE TABLE app_private.identity_principals (
  issuer text NOT NULL CHECK (issuer ~ '^https://'),
  subject text NOT NULL CHECK (char_length(subject) BETWEEN 3 AND 256),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'deleted')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (issuer, subject)
);

CREATE TABLE app_private.auth_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  issuer text NOT NULL,
  subject text NOT NULL,
  provider_session_id text NOT NULL CHECK (char_length(provider_session_id) BETWEEN 8 AND 256),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked', 'compromised', 'expired')),
  valid_after timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  revoked_at timestamptz,
  revoke_reason text NOT NULL DEFAULT '' CHECK (char_length(revoke_reason) <= 120),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (issuer, subject) REFERENCES app_private.identity_principals(issuer, subject) ON DELETE CASCADE,
  UNIQUE (issuer, provider_session_id),
  CHECK (expires_at > created_at),
  CHECK ((status = 'active' AND revoked_at IS NULL) OR status <> 'active')
);

CREATE TABLE app_private.tenant_context_keys (
  key_id text PRIMARY KEY CHECK (key_id ~ '^[A-Za-z0-9._-]{1,64}$'),
  secret bytea NOT NULL CHECK (octet_length(secret) >= 32),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'retired', 'revoked')),
  not_before timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (expires_at > not_before)
);

CREATE TABLE app_private.tenant_context_nonces (
  nonce uuid PRIMARY KEY,
  session_id uuid REFERENCES app_private.auth_sessions(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX identity_principals_user_idx ON app_private.identity_principals(user_id);
CREATE INDEX auth_sessions_user_status_idx ON app_private.auth_sessions(user_id, status, expires_at);
CREATE INDEX tenant_context_nonces_expiry_idx ON app_private.tenant_context_nonces(expires_at);

CREATE OR REPLACE FUNCTION app_private.base64url_decode(value text)
RETURNS bytea
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = pg_catalog
AS $$
  SELECT decode(
    translate(value, '-_', '+/') || repeat('=', (4 - length(value) % 4) % 4),
    'base64'
  )
$$;

CREATE OR REPLACE FUNCTION app_private.raise_auth_error(code text)
RETURNS void
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog
AS $$
BEGIN
  RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = code;
END
$$;

CREATE OR REPLACE FUNCTION app_private.verify_tenant_context(
  signed_payload text,
  signed_signature text,
  signing_key_id text,
  expected_purpose text,
  require_session boolean
)
RETURNS TABLE (
  authorized_user_id uuid,
  authorized_workspace_id text,
  authorized_role text,
  authorized_employee_id text,
  authorized_session_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app_private
AS $$
DECLARE
  context jsonb;
  context_key app_private.tenant_context_keys%ROWTYPE;
  identity app_private.identity_principals%ROWTYPE;
  local_session app_private.auth_sessions%ROWTYPE;
  member workspace_members%ROWTYPE;
  workspace_status text;
  user_status text;
  now_epoch bigint := extract(epoch FROM clock_timestamp())::bigint;
  issued_at bigint;
  expires_at bigint;
  token_issued_at bigint;
  token_expires_at bigint;
  session_expires_at bigint;
  context_nonce uuid;
  expected_signature bytea;
  received_signature bytea;
BEGIN
  IF char_length(signed_payload) NOT BETWEEN 16 AND 8192
     OR char_length(signed_signature) NOT BETWEEN 40 AND 64 THEN
    PERFORM app_private.raise_auth_error('TENANT_CONTEXT_INVALID');
  END IF;
  SELECT * INTO context_key
    FROM app_private.tenant_context_keys
   WHERE key_id = signing_key_id
     AND status = 'active'
     AND not_before <= clock_timestamp()
     AND expires_at > clock_timestamp();
  IF NOT FOUND THEN PERFORM app_private.raise_auth_error('TENANT_CONTEXT_KEY_INVALID'); END IF;

  BEGIN
    context := convert_from(app_private.base64url_decode(signed_payload), 'UTF8')::jsonb;
    received_signature := app_private.base64url_decode(signed_signature);
  EXCEPTION WHEN OTHERS THEN
    PERFORM app_private.raise_auth_error('TENANT_CONTEXT_INVALID');
  END;
  expected_signature := hmac(convert_to(signed_payload, 'UTF8'), context_key.secret, 'sha256');
  IF octet_length(received_signature) <> 32 OR received_signature <> expected_signature THEN
    PERFORM app_private.raise_auth_error('TENANT_CONTEXT_SIGNATURE_INVALID');
  END IF;
  IF context->>'v' <> '1' OR context->>'purpose' <> expected_purpose
     OR context->>'issuer' IS NULL OR context->>'subject' IS NULL
     OR context->>'sessionId' IS NULL OR context->>'workspaceId' IS NULL
     OR context->>'nonce' IS NULL THEN
    PERFORM app_private.raise_auth_error('TENANT_CONTEXT_INVALID');
  END IF;
  BEGIN
    issued_at := (context->>'issuedAt')::bigint;
    expires_at := (context->>'expiresAt')::bigint;
    token_issued_at := (context->>'tokenIssuedAt')::bigint;
    token_expires_at := (context->>'tokenExpiresAt')::bigint;
    session_expires_at := (context->>'sessionExpiresAt')::bigint;
    context_nonce := (context->>'nonce')::uuid;
  EXCEPTION WHEN OTHERS THEN
    PERFORM app_private.raise_auth_error('TENANT_CONTEXT_INVALID');
  END;
  IF issued_at < now_epoch - 30 OR issued_at > now_epoch + 30
     OR expires_at < now_epoch OR expires_at > now_epoch + 60
     OR token_issued_at > now_epoch + 30 OR token_expires_at < now_epoch - 30
     OR session_expires_at <= now_epoch OR session_expires_at > now_epoch + 86400 THEN
    PERFORM app_private.raise_auth_error('TENANT_CONTEXT_EXPIRED');
  END IF;
  IF context->>'workspaceId' !~ '^ws_[a-f0-9]{32}$' THEN
    PERFORM app_private.raise_auth_error('WORKSPACE_ACCESS_DENIED');
  END IF;

  DELETE FROM app_private.tenant_context_nonces WHERE expires_at < clock_timestamp();
  BEGIN
    INSERT INTO app_private.tenant_context_nonces(nonce, expires_at)
    VALUES (context_nonce, to_timestamp(expires_at));
  EXCEPTION WHEN unique_violation THEN
    PERFORM app_private.raise_auth_error('TENANT_CONTEXT_REPLAYED');
  END;

  SELECT * INTO identity
    FROM app_private.identity_principals
   WHERE issuer = context->>'issuer' AND subject = context->>'subject' AND status = 'active';
  IF NOT FOUND THEN PERFORM app_private.raise_auth_error('IDENTITY_ACCESS_DENIED'); END IF;
  SELECT status INTO user_status FROM users WHERE id = identity.user_id;
  IF user_status IS DISTINCT FROM 'active' THEN PERFORM app_private.raise_auth_error('IDENTITY_ACCESS_DENIED'); END IF;

  PERFORM set_config('app.current_workspace_id', context->>'workspaceId', true);
  PERFORM set_config('app.current_user_id', identity.user_id::text, true);
  SELECT status INTO workspace_status FROM workspaces WHERE id = context->>'workspaceId';
  SELECT * INTO member
    FROM workspace_members
   WHERE workspace_id = context->>'workspaceId'
     AND user_id = identity.user_id
     AND status = 'active'
     AND auth_status = 'active';
  IF workspace_status IS DISTINCT FROM 'active' OR NOT FOUND THEN
    PERFORM app_private.raise_auth_error('WORKSPACE_ACCESS_DENIED');
  END IF;
  PERFORM set_config('app.current_role', member.role, true);

  IF require_session THEN
    SELECT * INTO local_session
      FROM app_private.auth_sessions
     WHERE issuer = context->>'issuer'
       AND provider_session_id = context->>'sessionId'
       AND user_id = identity.user_id;
    IF NOT FOUND OR local_session.status <> 'active'
       OR local_session.expires_at <= clock_timestamp()
       OR local_session.valid_after > to_timestamp(token_issued_at) THEN
      PERFORM app_private.raise_auth_error('SESSION_INVALID');
    END IF;
    UPDATE app_private.auth_sessions SET last_seen_at = clock_timestamp() WHERE id = local_session.id;
    UPDATE app_private.tenant_context_nonces SET session_id = local_session.id WHERE nonce = context_nonce;
  END IF;

  RETURN QUERY SELECT identity.user_id, context->>'workspaceId', member.role, member.employee_id, local_session.id;
END
$$;

CREATE OR REPLACE FUNCTION app_private.api_establish_session(
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
  context jsonb;
  local_session app_private.auth_sessions%ROWTYPE;
BEGIN
  SELECT * INTO auth_context
    FROM app_private.verify_tenant_context(signed_payload, signed_signature, signing_key_id, 'establish', false);
  context := convert_from(app_private.base64url_decode(signed_payload), 'UTF8')::jsonb;
  SELECT * INTO local_session
    FROM app_private.auth_sessions
   WHERE issuer = context->>'issuer' AND provider_session_id = context->>'sessionId';
  IF FOUND AND (local_session.status <> 'active' OR local_session.user_id <> auth_context.authorized_user_id) THEN
    PERFORM app_private.raise_auth_error('SESSION_INVALID');
  END IF;
  IF NOT FOUND THEN
    INSERT INTO app_private.auth_sessions(
      issuer, subject, provider_session_id, user_id, expires_at
    ) VALUES (
      context->>'issuer', context->>'subject', context->>'sessionId', auth_context.authorized_user_id,
      to_timestamp((context->>'sessionExpiresAt')::bigint)
    ) RETURNING * INTO local_session;
  ELSE
    UPDATE app_private.auth_sessions SET last_seen_at = clock_timestamp() WHERE id = local_session.id;
  END IF;
  RETURN jsonb_build_object('ok', true, 'sessionExpiresAt', extract(epoch FROM local_session.expires_at)::bigint);
END
$$;

CREATE OR REPLACE FUNCTION app_private.api_logout_session(
  signed_payload text,
  signed_signature text,
  signing_key_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app_private
AS $$
DECLARE auth_context record;
BEGIN
  SELECT * INTO auth_context
    FROM app_private.verify_tenant_context(signed_payload, signed_signature, signing_key_id, 'logout', true);
  UPDATE app_private.auth_sessions
     SET status = 'revoked', revoked_at = clock_timestamp(), revoke_reason = 'logout'
   WHERE id = auth_context.authorized_session_id;
  RETURN jsonb_build_object('ok', true);
END
$$;

CREATE OR REPLACE FUNCTION app_private.api_list_employees(
  signed_payload text,
  signed_signature text,
  signing_key_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app_private
AS $$
DECLARE auth_context record; result jsonb;
BEGIN
  SELECT * INTO auth_context
    FROM app_private.verify_tenant_context(signed_payload, signed_signature, signing_key_id, 'read', true);
  IF auth_context.authorized_role NOT IN ('boss', 'manager') THEN PERFORM app_private.raise_auth_error('COMMAND_FORBIDDEN'); END IF;
  SELECT coalesce(jsonb_agg(to_jsonb(item) - 'created_at' ORDER BY item.created_at, item.id), '[]'::jsonb) INTO result
    FROM (
      SELECT id, name, job_title AS "jobTitle", phone, hourly_rate AS "hourlyRate",
             leave_quota AS "leaveQuota", status, revision, created_at
        FROM employees
       WHERE workspace_id = auth_context.authorized_workspace_id AND status = 'active'
    ) item;
  RETURN jsonb_build_object('ok', true, 'data', result);
END
$$;

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
   WHERE workspace_id = auth_context.authorized_workspace_id AND command_receipts.idempotency_key = api_execute_command.idempotency_key
   FOR UPDATE;
  IF FOUND THEN
    IF prior.command_name <> api_execute_command.command_name OR prior.request_hash <> api_execute_command.request_hash THEN
      PERFORM app_private.raise_auth_error('IDEMPOTENCY_KEY_REUSED');
    END IF;
    RETURN prior.response_body || jsonb_build_object('replayed', true);
  END IF;

  IF command_name = 'employees.create' THEN
    IF auth_context.authorized_role NOT IN ('boss', 'manager') THEN PERFORM app_private.raise_auth_error('COMMAND_FORBIDDEN'); END IF;
    INSERT INTO employees(workspace_id, id, name, job_title, phone, hourly_rate, leave_quota)
    VALUES (auth_context.authorized_workspace_id, command_input->>'generatedId', command_input->>'name',
      command_input->>'jobTitle', command_input->>'phone', (command_input->>'hourlyRate')::integer,
      (command_input->>'leaveQuota')::smallint)
    RETURNING jsonb_build_object('id', id, 'name', name, 'jobTitle', job_title, 'phone', phone,
      'hourlyRate', hourly_rate, 'leaveQuota', leave_quota, 'status', status, 'revision', revision) INTO body;
    resource_type := 'employee'; resource_id := body->>'id';

  ELSIF command_name = 'shifts.create' THEN
    IF auth_context.authorized_role NOT IN ('boss', 'manager') THEN PERFORM app_private.raise_auth_error('COMMAND_FORBIDDEN'); END IF;
    INSERT INTO shifts(workspace_id, id, employee_id, work_date, start_time, end_time, note)
    VALUES (auth_context.authorized_workspace_id, command_input->>'generatedId', command_input->>'employeeId',
      (command_input->>'date')::date, (command_input->>'startTime')::time, (command_input->>'endTime')::time, command_input->>'note')
    RETURNING jsonb_build_object('id', id, 'employeeId', employee_id, 'date', to_char(work_date, 'YYYY-MM-DD'),
      'startTime', to_char(start_time, 'HH24:MI'), 'endTime', to_char(end_time, 'HH24:MI'), 'note', note, 'revision', revision) INTO body;
    resource_type := 'shift'; resource_id := body->>'id';

  ELSIF command_name = 'leaves.replace-month' THEN
    IF auth_context.authorized_role NOT IN ('boss', 'manager', 'employee') THEN PERFORM app_private.raise_auth_error('COMMAND_FORBIDDEN'); END IF;
    target_employee_id := CASE WHEN auth_context.authorized_role = 'employee' THEN auth_context.authorized_employee_id ELSE command_input->>'employeeId' END;
    IF target_employee_id IS NULL OR (auth_context.authorized_role = 'employee' AND command_input ? 'employeeId'
       AND command_input->>'employeeId' <> target_employee_id) THEN PERFORM app_private.raise_auth_error('EMPLOYEE_SCOPE_VIOLATION'); END IF;
    month_start := ((command_input->>'month') || '-01')::date;
    SELECT count(*) INTO leave_count FROM jsonb_array_elements_text(command_input->'dates');
    IF leave_count > (SELECT leave_quota FROM employees WHERE workspace_id = auth_context.authorized_workspace_id AND id = target_employee_id AND status = 'active') THEN
      PERFORM app_private.raise_auth_error('LEAVE_QUOTA_EXCEEDED');
    END IF;
    DELETE FROM leave_selections WHERE workspace_id = auth_context.authorized_workspace_id AND leave_selections.employee_id = target_employee_id
      AND leave_date >= month_start AND leave_date < month_start + interval '1 month';
    INSERT INTO leave_selections(workspace_id, employee_id, leave_date)
    SELECT auth_context.authorized_workspace_id, target_employee_id, value::date FROM jsonb_array_elements_text(command_input->'dates') value;
    body := jsonb_build_object('employeeId', target_employee_id, 'month', command_input->>'month', 'dates', command_input->'dates');
    resource_type := 'leave_selection'; resource_id := target_employee_id || ':' || command_input->>'month';

  ELSIF command_name = 'attendance.clock-in' THEN
    IF auth_context.authorized_role <> 'employee' OR auth_context.authorized_employee_id IS NULL THEN PERFORM app_private.raise_auth_error('COMMAND_FORBIDDEN'); END IF;
    occurred_at := (command_input->>'occurredAt')::timestamptz;
    INSERT INTO attendance_records(workspace_id, id, employee_id, work_date, clock_in, note)
    VALUES (auth_context.authorized_workspace_id, command_input->>'generatedId', auth_context.authorized_employee_id,
      (occurred_at AT TIME ZONE 'Asia/Taipei')::date, occurred_at, 'employee clock-in')
    RETURNING jsonb_build_object('id', id, 'employeeId', employee_id, 'date', to_char(work_date, 'YYYY-MM-DD'),
      'hours', hours, 'clockIn', clock_in, 'clockOut', clock_out, 'revision', revision) INTO body;
    resource_type := 'attendance'; resource_id := body->>'id';

  ELSIF command_name = 'attendance.clock-out' THEN
    IF auth_context.authorized_role <> 'employee' OR auth_context.authorized_employee_id IS NULL THEN PERFORM app_private.raise_auth_error('COMMAND_FORBIDDEN'); END IF;
    occurred_at := (command_input->>'occurredAt')::timestamptz;
    UPDATE attendance_records SET clock_out = occurred_at,
      hours = greatest(0.5, round((extract(epoch FROM (occurred_at - clock_in)) / 3600) * 2) / 2),
      revision = revision + 1, note = 'employee clock-out'
    WHERE workspace_id = auth_context.authorized_workspace_id AND attendance_records.employee_id = auth_context.authorized_employee_id
      AND clock_in IS NOT NULL AND clock_out IS NULL
    RETURNING jsonb_build_object('id', id, 'employeeId', employee_id, 'date', to_char(work_date, 'YYYY-MM-DD'),
      'hours', hours, 'clockIn', clock_in, 'clockOut', clock_out, 'revision', revision) INTO body;
    IF body IS NULL THEN PERFORM app_private.raise_auth_error('ATTENDANCE_NOT_CLOCKED_IN'); END IF;
    resource_type := 'attendance'; resource_id := body->>'id';

  ELSIF command_name = 'attendance.approve-hours' THEN
    IF auth_context.authorized_role NOT IN ('boss', 'manager') THEN PERFORM app_private.raise_auth_error('COMMAND_FORBIDDEN'); END IF;
    UPDATE attendance_records SET hours = (command_input->>'hours')::numeric, revision = revision + 1
    WHERE workspace_id = auth_context.authorized_workspace_id AND id = command_input->>'attendanceId'
      AND revision = (command_input->>'baseRevision')::integer
    RETURNING jsonb_build_object('id', id, 'employeeId', employee_id, 'date', to_char(work_date, 'YYYY-MM-DD'),
      'hours', hours, 'clockIn', clock_in, 'clockOut', clock_out, 'revision', revision) INTO body;
    IF body IS NULL THEN PERFORM app_private.raise_auth_error('REVISION_CONFLICT'); END IF;
    resource_type := 'attendance'; resource_id := body->>'id';
  END IF;

  response := jsonb_build_object('ok', true, 'data', body);
  INSERT INTO command_receipts(workspace_id, idempotency_key, command_name, request_hash, response_body, actor_user_id)
  VALUES (auth_context.authorized_workspace_id, idempotency_key, command_name, request_hash, response, auth_context.authorized_user_id);
  INSERT INTO audit_logs(workspace_id, actor_user_id, action, resource_type, resource_id, request_id, payload)
  VALUES (auth_context.authorized_workspace_id, auth_context.authorized_user_id, command_name, resource_type, resource_id, request_id,
    jsonb_build_object('idempotencyKey', idempotency_key));
  INSERT INTO outbox_events(workspace_id, event_type, aggregate_type, aggregate_id, payload)
  VALUES (auth_context.authorized_workspace_id, command_name || '.completed', resource_type, resource_id, body);
  RETURN response;
END
$$;

REVOKE ALL ON ALL TABLES IN SCHEMA app_private FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA app_private FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA app_private REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
