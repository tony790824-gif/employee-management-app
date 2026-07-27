CREATE TABLE time_off_requests (
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  id uuid NOT NULL,
  employee_id text NOT NULL,
  requester_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  request_kind text NOT NULL CHECK (request_kind IN ('schedule_leave', 'ad_hoc_leave')),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled', 'superseded')),
  schedule_month text CHECK (schedule_month IS NULL OR schedule_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  leave_type text CHECK (leave_type IS NULL OR char_length(btrim(leave_type)) BETWEEN 1 AND 60),
  reason text CHECK (reason IS NULL OR char_length(reason) BETWEEN 1 AND 2000),
  reviewed_by_user_id uuid REFERENCES users(id) ON DELETE RESTRICT,
  reviewed_at timestamptz,
  review_note text NOT NULL DEFAULT '' CHECK (char_length(review_note) <= 1000),
  revision integer NOT NULL DEFAULT 0 CHECK (revision >= 0),
  submitted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (workspace_id, id),
  FOREIGN KEY (workspace_id, employee_id)
    REFERENCES employees(workspace_id, id) ON DELETE RESTRICT,
  CHECK (
    (request_kind = 'schedule_leave'
      AND schedule_month IS NOT NULL
      AND leave_type IS NULL
      AND reason IS NULL)
    OR
    (request_kind = 'ad_hoc_leave'
      AND schedule_month IS NULL
      AND leave_type IS NOT NULL
      AND reason IS NOT NULL)
  ),
  CHECK (
    (status = 'pending' AND reviewed_by_user_id IS NULL AND reviewed_at IS NULL)
    OR
    (status IN ('approved', 'rejected') AND reviewed_by_user_id IS NOT NULL AND reviewed_at IS NOT NULL)
    OR
    (status IN ('cancelled', 'superseded'))
  )
);

CREATE TABLE time_off_request_dates (
  workspace_id text NOT NULL,
  request_id uuid NOT NULL,
  leave_date date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (workspace_id, request_id, leave_date),
  FOREIGN KEY (workspace_id, request_id)
    REFERENCES time_off_requests(workspace_id, id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX time_off_one_pending_schedule_month_idx
  ON time_off_requests (workspace_id, employee_id, schedule_month)
  WHERE request_kind = 'schedule_leave' AND status = 'pending';
CREATE UNIQUE INDEX time_off_one_approved_schedule_month_idx
  ON time_off_requests (workspace_id, employee_id, schedule_month)
  WHERE request_kind = 'schedule_leave' AND status = 'approved';
CREATE INDEX time_off_requests_workspace_status_idx
  ON time_off_requests (workspace_id, status, request_kind, submitted_at DESC);
CREATE INDEX time_off_requests_employee_idx
  ON time_off_requests (workspace_id, employee_id, submitted_at DESC);
CREATE INDEX time_off_dates_workspace_date_idx
  ON time_off_request_dates (workspace_id, leave_date, request_id);

CREATE TRIGGER time_off_requests_touch_updated_at
BEFORE UPDATE ON time_off_requests
FOR EACH ROW EXECUTE FUNCTION app_private.touch_updated_at();

ALTER TABLE time_off_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_off_requests FORCE ROW LEVEL SECURITY;
ALTER TABLE time_off_request_dates ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_off_request_dates FORCE ROW LEVEL SECURITY;

CREATE POLICY time_off_requests_tenant_isolation ON time_off_requests
USING (workspace_id = app_private.current_workspace_id())
WITH CHECK (workspace_id = app_private.current_workspace_id());

CREATE POLICY time_off_request_dates_tenant_isolation ON time_off_request_dates
USING (workspace_id = app_private.current_workspace_id())
WITH CHECK (workspace_id = app_private.current_workspace_id());

CREATE OR REPLACE FUNCTION app_private.api_list_time_off_requests(
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
  own_rows jsonb;
  pending_rows jsonb := '[]'::jsonb;
  processed_rows jsonb := '[]'::jsonb;
  approved_schedule_rows jsonb;
  approved_leave_coverage jsonb;
BEGIN
  SELECT * INTO auth_context
    FROM app_private.verify_tenant_context(
      signed_payload, signed_signature, signing_key_id, 'read', true
    );

  normalized_role := CASE
    WHEN auth_context.authorized_role IN ('boss', 'manager') THEN 'boss'
    WHEN auth_context.authorized_role = 'employee' THEN 'employee'
    ELSE NULL
  END;
  IF normalized_role IS NULL THEN
    PERFORM app_private.raise_auth_error('WORKSPACE_ACCESS_DENIED');
  END IF;
  IF normalized_role = 'employee' AND auth_context.authorized_employee_id IS NULL THEN
    PERFORM app_private.raise_auth_error('EMPLOYEE_SCOPE_VIOLATION');
  END IF;

  SELECT coalesce(jsonb_agg(row_body ORDER BY submitted_at DESC, id), '[]'::jsonb)
    INTO own_rows
    FROM (
      SELECT request.id,
             request.submitted_at,
             jsonb_build_object(
               'id', request.id,
               'employeeId', request.employee_id,
               'employeeName', employee.name,
               'requestKind', request.request_kind,
               'status', request.status,
               'scheduleMonth', request.schedule_month,
               'leaveType', request.leave_type,
               'reason', request.reason,
               'reviewNote', request.review_note,
               'revision', request.revision,
               'submittedAt', request.submitted_at,
               'reviewedAt', request.reviewed_at,
               'dates', coalesce((
                 SELECT jsonb_agg(to_char(day.leave_date, 'YYYY-MM-DD') ORDER BY day.leave_date)
                   FROM time_off_request_dates day
                  WHERE day.workspace_id = request.workspace_id
                    AND day.request_id = request.id
               ), '[]'::jsonb)
             ) AS row_body
        FROM time_off_requests request
        JOIN employees employee
          ON employee.workspace_id = request.workspace_id
         AND employee.id = request.employee_id
       WHERE request.workspace_id = auth_context.authorized_workspace_id
         AND request.requester_user_id = auth_context.authorized_user_id
    ) rows_for_actor;

  IF normalized_role = 'boss' THEN
    SELECT coalesce(jsonb_agg(row_body ORDER BY submitted_at, id), '[]'::jsonb)
      INTO pending_rows
      FROM (
        SELECT request.id,
               request.submitted_at,
               jsonb_build_object(
                 'id', request.id,
                 'employeeId', request.employee_id,
                 'employeeName', employee.name,
                 'requestKind', request.request_kind,
                 'status', request.status,
                 'scheduleMonth', request.schedule_month,
                 'leaveType', request.leave_type,
                 'reason', request.reason,
                 'reviewNote', request.review_note,
                 'revision', request.revision,
                 'submittedAt', request.submitted_at,
                 'dates', coalesce((
                   SELECT jsonb_agg(to_char(day.leave_date, 'YYYY-MM-DD') ORDER BY day.leave_date)
                     FROM time_off_request_dates day
                    WHERE day.workspace_id = request.workspace_id
                      AND day.request_id = request.id
                 ), '[]'::jsonb)
               ) AS row_body
          FROM time_off_requests request
          JOIN employees employee
            ON employee.workspace_id = request.workspace_id
           AND employee.id = request.employee_id
         WHERE request.workspace_id = auth_context.authorized_workspace_id
           AND request.status = 'pending'
      ) pending_for_review;

    SELECT coalesce(jsonb_agg(row_body ORDER BY reviewed_at DESC, id), '[]'::jsonb)
      INTO processed_rows
      FROM (
        SELECT request.id,
               request.reviewed_at,
               jsonb_build_object(
                 'id', request.id,
                 'employeeId', request.employee_id,
                 'employeeName', employee.name,
                 'requestKind', request.request_kind,
                 'status', request.status,
                 'scheduleMonth', request.schedule_month,
                 'leaveType', request.leave_type,
                 'reason', request.reason,
                 'reviewNote', request.review_note,
                 'revision', request.revision,
                 'submittedAt', request.submitted_at,
                 'reviewedAt', request.reviewed_at,
                 'dates', coalesce((
                   SELECT jsonb_agg(to_char(day.leave_date, 'YYYY-MM-DD') ORDER BY day.leave_date)
                     FROM time_off_request_dates day
                    WHERE day.workspace_id = request.workspace_id
                      AND day.request_id = request.id
                 ), '[]'::jsonb)
               ) AS row_body
          FROM time_off_requests request
          JOIN employees employee
            ON employee.workspace_id = request.workspace_id
           AND employee.id = request.employee_id
         WHERE request.workspace_id = auth_context.authorized_workspace_id
           AND request.status IN ('approved', 'rejected', 'cancelled', 'superseded')
      ) processed_for_review;
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'employeeId', request.employee_id,
    'employeeName', employee.name,
    'date', to_char(day.leave_date, 'YYYY-MM-DD')
  ) ORDER BY day.leave_date, employee.name, request.employee_id), '[]'::jsonb)
    INTO approved_schedule_rows
    FROM time_off_requests request
    JOIN employees employee
      ON employee.workspace_id = request.workspace_id
     AND employee.id = request.employee_id
    JOIN time_off_request_dates day
      ON day.workspace_id = request.workspace_id
     AND day.request_id = request.id
   WHERE request.workspace_id = auth_context.authorized_workspace_id
     AND request.request_kind = 'schedule_leave'
     AND request.status = 'approved';

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'date', to_char(coverage.leave_date, 'YYYY-MM-DD'),
    'approvedCount', coverage.approved_count
  ) ORDER BY coverage.leave_date), '[]'::jsonb)
    INTO approved_leave_coverage
    FROM (
      SELECT day.leave_date, count(*) AS approved_count
        FROM time_off_requests request
        JOIN time_off_request_dates day
          ON day.workspace_id = request.workspace_id
         AND day.request_id = request.id
       WHERE request.workspace_id = auth_context.authorized_workspace_id
         AND request.request_kind = 'ad_hoc_leave'
         AND request.status = 'approved'
       GROUP BY day.leave_date
    ) coverage;

  RETURN jsonb_build_object(
    'ok', true,
    'workspaceId', auth_context.authorized_workspace_id,
    'role', normalized_role,
    'ownRequests', own_rows,
    'pendingReview', pending_rows,
    'processed', processed_rows,
    'approvedSchedule', approved_schedule_rows,
    'approvedLeaveCoverage', approved_leave_coverage
  );
END
$$;

CREATE OR REPLACE FUNCTION app_private.api_execute_time_off_command(
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
  target time_off_requests%ROWTYPE;
  response jsonb;
  body jsonb;
  new_request_id uuid;
  target_employee_id text;
  month_start date;
  start_date date;
  end_date date;
  request_dates text[];
  date_count integer;
  quota integer;
  next_status text;
BEGIN
  SELECT * INTO auth_context
    FROM app_private.verify_tenant_context(
      signed_payload, signed_signature, signing_key_id, 'command', true
    );

  IF command_name NOT IN (
      'schedule-leave-requests.submit',
      'schedule-leave-requests.cancel',
      'leave-requests.submit',
      'leave-requests.cancel',
      'time-off-requests.approve',
      'time-off-requests.reject'
    )
    OR command_input IS NULL
    OR jsonb_typeof(command_input) <> 'object'
    OR idempotency_key !~ '^[A-Za-z0-9._:-]{8,128}$'
    OR request_hash !~ '^[a-f0-9]{64}$'
    OR request_id !~ '^[A-Za-z0-9._:-]{8,128}$' THEN
    PERFORM app_private.raise_auth_error('COMMAND_INVALID');
  END IF;

  SELECT * INTO prior
    FROM command_receipts
   WHERE workspace_id = auth_context.authorized_workspace_id
     AND command_receipts.idempotency_key = api_execute_time_off_command.idempotency_key
   FOR UPDATE;
  IF FOUND THEN
    IF prior.command_name <> api_execute_time_off_command.command_name
       OR prior.request_hash <> api_execute_time_off_command.request_hash THEN
      PERFORM app_private.raise_auth_error('IDEMPOTENCY_KEY_REUSED');
    END IF;
    RETURN prior.response_body || jsonb_build_object('replayed', true);
  END IF;

  IF command_name IN ('schedule-leave-requests.submit', 'leave-requests.submit') THEN
    IF auth_context.authorized_role <> 'employee'
       OR auth_context.authorized_employee_id IS NULL THEN
      PERFORM app_private.raise_auth_error('COMMAND_FORBIDDEN');
    END IF;
    target_employee_id := auth_context.authorized_employee_id;

    IF command_name = 'schedule-leave-requests.submit' THEN
      IF command_input->>'month' !~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
         OR jsonb_typeof(command_input->'dates') <> 'array'
         OR jsonb_array_length(command_input->'dates') > 31 THEN
        PERFORM app_private.raise_auth_error('COMMAND_INVALID');
      END IF;
      month_start := ((command_input->>'month') || '-01')::date;
      SELECT array_agg(value ORDER BY value), count(*), count(DISTINCT value)
        INTO request_dates, date_count, quota
        FROM jsonb_array_elements_text(command_input->'dates') value;
      IF date_count = 0
         OR date_count <> quota
         OR EXISTS (
           SELECT 1 FROM unnest(request_dates) value
            WHERE value !~ '^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'
               OR value::date < month_start
               OR value::date >= month_start + interval '1 month'
         ) THEN
        PERFORM app_private.raise_auth_error('COMMAND_INVALID');
      END IF;
      SELECT employee.leave_quota
        INTO quota
        FROM employees employee
       WHERE employee.workspace_id = auth_context.authorized_workspace_id
         AND employee.id = target_employee_id
         AND employee.status = 'active'
       FOR UPDATE;
      IF NOT FOUND THEN
        PERFORM app_private.raise_auth_error('EMPLOYEE_SCOPE_VIOLATION');
      END IF;
      IF date_count > quota THEN
        PERFORM app_private.raise_auth_error('LEAVE_QUOTA_EXCEEDED');
      END IF;
    ELSE
      IF command_input->>'startDate' !~ '^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'
         OR command_input->>'endDate' !~ '^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'
         OR char_length(btrim(coalesce(command_input->>'leaveType', ''))) NOT BETWEEN 1 AND 60
         OR char_length(coalesce(command_input->>'reason', '')) NOT BETWEEN 1 AND 2000 THEN
        PERFORM app_private.raise_auth_error('COMMAND_INVALID');
      END IF;
      start_date := (command_input->>'startDate')::date;
      end_date := (command_input->>'endDate')::date;
      IF end_date < start_date OR end_date - start_date > 30 THEN
        PERFORM app_private.raise_auth_error('COMMAND_INVALID');
      END IF;
      SELECT array_agg(to_char(day, 'YYYY-MM-DD') ORDER BY day)
        INTO request_dates
        FROM generate_series(start_date, end_date, interval '1 day') day;
      date_count := cardinality(request_dates);
    END IF;

    IF command_input ? 'requestId' THEN
      SELECT * INTO target
        FROM time_off_requests request
       WHERE request.workspace_id = auth_context.authorized_workspace_id
         AND request.id = (command_input->>'requestId')::uuid
       FOR UPDATE;
      IF NOT FOUND
         OR target.requester_user_id <> auth_context.authorized_user_id
         OR target.employee_id <> target_employee_id THEN
        PERFORM app_private.raise_auth_error('TIME_OFF_REQUEST_NOT_FOUND');
      END IF;
      IF target.status <> 'pending' THEN
        PERFORM app_private.raise_auth_error('TIME_OFF_REQUEST_ALREADY_PROCESSED');
      END IF;
      IF target.revision <> (command_input->>'baseRevision')::integer
         OR target.request_kind <> (CASE
           WHEN command_name = 'schedule-leave-requests.submit' THEN 'schedule_leave'
           ELSE 'ad_hoc_leave'
         END) THEN
        PERFORM app_private.raise_auth_error('REVISION_CONFLICT');
      END IF;
      UPDATE time_off_requests request
         SET schedule_month = CASE
               WHEN command_name = 'schedule-leave-requests.submit' THEN command_input->>'month'
               ELSE NULL
             END,
             leave_type = CASE
               WHEN command_name = 'leave-requests.submit' THEN btrim(command_input->>'leaveType')
               ELSE NULL
             END,
             reason = CASE
               WHEN command_name = 'leave-requests.submit' THEN command_input->>'reason'
               ELSE NULL
             END,
             revision = request.revision + 1,
             submitted_at = clock_timestamp()
       WHERE request.workspace_id = auth_context.authorized_workspace_id
         AND request.id = target.id
       RETURNING * INTO target;
      DELETE FROM time_off_request_dates day
       WHERE day.workspace_id = auth_context.authorized_workspace_id
         AND day.request_id = target.id;
    ELSE
      IF command_input->>'generatedId'
           !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$' THEN
        PERFORM app_private.raise_auth_error('COMMAND_INVALID');
      END IF;
      new_request_id := (command_input->>'generatedId')::uuid;
      INSERT INTO time_off_requests(
        workspace_id, id, employee_id, requester_user_id, request_kind,
        schedule_month, leave_type, reason
      ) VALUES (
        auth_context.authorized_workspace_id,
        new_request_id,
        target_employee_id,
        auth_context.authorized_user_id,
        CASE WHEN command_name = 'schedule-leave-requests.submit'
          THEN 'schedule_leave' ELSE 'ad_hoc_leave' END,
        CASE WHEN command_name = 'schedule-leave-requests.submit'
          THEN command_input->>'month' ELSE NULL END,
        CASE WHEN command_name = 'leave-requests.submit'
          THEN btrim(command_input->>'leaveType') ELSE NULL END,
        CASE WHEN command_name = 'leave-requests.submit'
          THEN command_input->>'reason' ELSE NULL END
      ) RETURNING * INTO target;
    END IF;

    INSERT INTO time_off_request_dates(workspace_id, request_id, leave_date)
    SELECT auth_context.authorized_workspace_id, target.id, value::date
      FROM unnest(request_dates) value;

  ELSIF command_name IN ('schedule-leave-requests.cancel', 'leave-requests.cancel') THEN
    IF auth_context.authorized_role <> 'employee'
       OR auth_context.authorized_employee_id IS NULL THEN
      PERFORM app_private.raise_auth_error('COMMAND_FORBIDDEN');
    END IF;
    SELECT * INTO target
      FROM time_off_requests request
     WHERE request.workspace_id = auth_context.authorized_workspace_id
       AND request.id = (command_input->>'requestId')::uuid
     FOR UPDATE;
    IF NOT FOUND
       OR target.requester_user_id <> auth_context.authorized_user_id
       OR target.employee_id <> auth_context.authorized_employee_id THEN
      PERFORM app_private.raise_auth_error('TIME_OFF_REQUEST_NOT_FOUND');
    END IF;
    IF target.status <> 'pending' THEN
      PERFORM app_private.raise_auth_error('TIME_OFF_REQUEST_ALREADY_PROCESSED');
    END IF;
    IF target.revision <> (command_input->>'baseRevision')::integer
       OR target.request_kind <> (CASE
         WHEN command_name = 'schedule-leave-requests.cancel' THEN 'schedule_leave'
         ELSE 'ad_hoc_leave'
       END) THEN
      PERFORM app_private.raise_auth_error('REVISION_CONFLICT');
    END IF;
    UPDATE time_off_requests request
       SET status = 'cancelled', revision = request.revision + 1
     WHERE request.workspace_id = auth_context.authorized_workspace_id
       AND request.id = target.id
     RETURNING * INTO target;

  ELSE
    IF auth_context.authorized_role NOT IN ('boss', 'manager') THEN
      PERFORM app_private.raise_auth_error('COMMAND_FORBIDDEN');
    END IF;
    SELECT * INTO target
      FROM time_off_requests request
     WHERE request.workspace_id = auth_context.authorized_workspace_id
       AND request.id = (command_input->>'requestId')::uuid
     FOR UPDATE;
    IF NOT FOUND THEN
      PERFORM app_private.raise_auth_error('TIME_OFF_REQUEST_NOT_FOUND');
    END IF;
    IF target.status <> 'pending' THEN
      PERFORM app_private.raise_auth_error('TIME_OFF_REQUEST_ALREADY_PROCESSED');
    END IF;
    IF target.revision <> (command_input->>'baseRevision')::integer THEN
      PERFORM app_private.raise_auth_error('REVISION_CONFLICT');
    END IF;
    next_status := CASE WHEN command_name = 'time-off-requests.approve'
      THEN 'approved' ELSE 'rejected' END;

    IF next_status = 'approved' AND target.request_kind = 'schedule_leave' THEN
      SELECT employee.leave_quota
        INTO quota
        FROM employees employee
       WHERE employee.workspace_id = auth_context.authorized_workspace_id
         AND employee.id = target.employee_id
         AND employee.status = 'active'
       FOR UPDATE;
      SELECT count(*) INTO date_count
        FROM time_off_request_dates day
       WHERE day.workspace_id = auth_context.authorized_workspace_id
         AND day.request_id = target.id;
      IF quota IS NULL OR date_count = 0 OR date_count > quota THEN
        PERFORM app_private.raise_auth_error('LEAVE_QUOTA_EXCEEDED');
      END IF;

      UPDATE time_off_requests request
         SET status = 'superseded', revision = request.revision + 1
       WHERE request.workspace_id = auth_context.authorized_workspace_id
         AND request.employee_id = target.employee_id
         AND request.request_kind = 'schedule_leave'
         AND request.schedule_month = target.schedule_month
         AND request.status = 'approved'
         AND request.id <> target.id;

      month_start := (target.schedule_month || '-01')::date;
      DELETE FROM leave_selections selection
       WHERE selection.workspace_id = auth_context.authorized_workspace_id
         AND selection.employee_id = target.employee_id
         AND selection.leave_date >= month_start
         AND selection.leave_date < month_start + interval '1 month';
      INSERT INTO leave_selections(workspace_id, employee_id, leave_date, status)
      SELECT auth_context.authorized_workspace_id, target.employee_id, day.leave_date, 'approved'
        FROM time_off_request_dates day
       WHERE day.workspace_id = auth_context.authorized_workspace_id
         AND day.request_id = target.id;
    END IF;

    UPDATE time_off_requests request
       SET status = next_status,
           reviewed_by_user_id = auth_context.authorized_user_id,
           reviewed_at = clock_timestamp(),
           review_note = coalesce(command_input->>'reviewNote', ''),
           revision = request.revision + 1
     WHERE request.workspace_id = auth_context.authorized_workspace_id
       AND request.id = target.id
     RETURNING * INTO target;
  END IF;

  body := jsonb_build_object(
    'id', target.id,
    'employeeId', target.employee_id,
    'requestKind', target.request_kind,
    'status', target.status,
    'scheduleMonth', target.schedule_month,
    'leaveType', target.leave_type,
    'revision', target.revision,
    'dates', coalesce((
      SELECT jsonb_agg(to_char(day.leave_date, 'YYYY-MM-DD') ORDER BY day.leave_date)
        FROM time_off_request_dates day
       WHERE day.workspace_id = target.workspace_id
         AND day.request_id = target.id
    ), '[]'::jsonb)
  );
  response := jsonb_build_object('ok', true, 'data', body);

  INSERT INTO command_receipts(
    workspace_id, idempotency_key, command_name, request_hash, response_body, actor_user_id
  ) VALUES (
    auth_context.authorized_workspace_id, idempotency_key, command_name,
    request_hash, response, auth_context.authorized_user_id
  );
  INSERT INTO audit_logs(
    workspace_id, actor_user_id, action, resource_type, resource_id, request_id, payload
  ) VALUES (
    auth_context.authorized_workspace_id, auth_context.authorized_user_id,
    command_name, 'time_off_request', target.id::text, request_id,
    jsonb_build_object('idempotencyKey', idempotency_key)
  );
  INSERT INTO outbox_events(
    workspace_id, event_type, aggregate_type, aggregate_id, payload
  ) VALUES (
    auth_context.authorized_workspace_id, command_name || '.completed',
    'time_off_request', target.id::text,
    body - 'leaveType'
  );
  RETURN response;
END
$$;

REVOKE ALL ON TABLE time_off_requests, time_off_request_dates FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.api_list_time_off_requests(text,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.api_execute_time_off_command(
  text,text,text,text,jsonb,text,text,text
) FROM PUBLIC;
