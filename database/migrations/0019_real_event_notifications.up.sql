ALTER FUNCTION app_private.create_notifications_from_outbox()
  RENAME TO create_notifications_from_outbox_v1;
ALTER FUNCTION app_private.api_list_notifications(text,text,text)
  RENAME TO api_list_notifications_v1;

ALTER TABLE notifications
  DROP CONSTRAINT notifications_notification_type_check,
  ADD COLUMN actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN destination text NOT NULL DEFAULT '/?open=notifications'
    CHECK (destination ~ '^/[A-Za-z0-9/?=&._-]{0,240}$' AND destination !~ '^//'),
  ADD COLUMN deduplication_key text
    CHECK (deduplication_key IS NULL OR deduplication_key ~ '^[a-f0-9]{64}$'),
  ADD COLUMN metadata jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (
      jsonb_typeof(metadata) = 'object'
      AND octet_length(metadata::text) <= 2048
      AND metadata - 'eventType' - 'entityType' - 'entityId' = '{}'::jsonb
    ),
  ADD CONSTRAINT notifications_notification_type_check CHECK (notification_type IN (
    'time_off_submitted', 'time_off_cancelled', 'time_off_approved',
    'time_off_rejected', 'schedule_updated',
    'clock_in', 'clock_out', 'leave_requested', 'leave_approved',
    'leave_rejected', 'shift_updated'
  ));

CREATE UNIQUE INDEX notifications_recipient_deduplication_uidx
  ON notifications(workspace_id, recipient_user_id, deduplication_key)
  WHERE deduplication_key IS NOT NULL;

CREATE TABLE notification_preferences (
  workspace_id text NOT NULL,
  user_id uuid NOT NULL,
  clock_events boolean NOT NULL DEFAULT true,
  leave_events boolean NOT NULL DEFAULT true,
  shift_events boolean NOT NULL DEFAULT true,
  revision integer NOT NULL DEFAULT 0 CHECK (revision >= 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (workspace_id, user_id),
  FOREIGN KEY (workspace_id, user_id)
    REFERENCES workspace_members(workspace_id, user_id) ON DELETE CASCADE
);

CREATE TRIGGER notification_preferences_touch_updated_at
BEFORE UPDATE ON notification_preferences
FOR EACH ROW EXECUTE FUNCTION app_private.touch_updated_at();

ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_preferences FORCE ROW LEVEL SECURITY;
CREATE POLICY notification_preferences_recipient_isolation ON notification_preferences
  USING (
    workspace_id = app_private.current_workspace_id()
    AND user_id = app_private.current_user_id()
  )
  WITH CHECK (
    workspace_id = app_private.current_workspace_id()
    AND user_id = app_private.current_user_id()
  );

CREATE OR REPLACE FUNCTION app_private.resolve_notification_recipients(
  source_event_type text,
  source_workspace_id text,
  actor_user_id uuid,
  target_employee_id text
)
RETURNS TABLE(user_id uuid)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = pg_catalog, public, app_private
AS $$
  SELECT member.user_id
    FROM workspace_members member
    JOIN workspaces workspace ON workspace.id = member.workspace_id
    LEFT JOIN notification_preferences preference
      ON preference.workspace_id = member.workspace_id
     AND preference.user_id = member.user_id
   WHERE member.workspace_id = source_workspace_id
     AND workspace.status = 'active'
     AND member.status = 'active'
     AND member.auth_status = 'active'
     AND member.user_id IS DISTINCT FROM actor_user_id
     AND (
       (
         source_event_type IN (
           'attendance.clock-in.completed', 'attendance.clock-out.completed',
           'schedule-leave-requests.submit.completed', 'leave-requests.submit.completed',
           'schedule-leave-requests.cancel.completed', 'leave-requests.cancel.completed'
         )
         AND member.role IN ('boss', 'manager')
       )
       OR (
         source_event_type IN (
           'time-off-requests.approve.completed', 'time-off-requests.reject.completed',
           'shifts.create.completed', 'leaves.replace-month.completed'
         )
         AND target_employee_id IS NOT NULL
         AND member.employee_id = target_employee_id
       )
     )
     AND CASE
       WHEN source_event_type LIKE 'attendance.%'
         THEN coalesce(preference.clock_events, true)
       WHEN source_event_type LIKE 'shifts.%' OR source_event_type = 'leaves.replace-month.completed'
         THEN coalesce(preference.shift_events, true)
       ELSE coalesce(preference.leave_events, true)
     END
$$;

CREATE OR REPLACE FUNCTION app_private.create_notifications_from_outbox()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app_private
AS $$
DECLARE
  actor uuid := app_private.current_user_id();
  target_employee_id text;
  request_kind text;
  normalized_type text;
  notification_title text;
  notification_body text;
BEGIN
  IF NEW.event_type IN (
    'time-off-requests.approve.completed', 'time-off-requests.reject.completed',
    'schedule-leave-requests.submit.completed', 'leave-requests.submit.completed',
    'schedule-leave-requests.cancel.completed', 'leave-requests.cancel.completed'
  ) THEN
    SELECT request.employee_id, request.request_kind
      INTO target_employee_id, request_kind
      FROM time_off_requests request
     WHERE request.workspace_id = NEW.workspace_id
       AND request.id::text = NEW.aggregate_id;
  ELSIF NEW.event_type IN ('shifts.create.completed', 'leaves.replace-month.completed') THEN
    target_employee_id := NEW.payload->>'employeeId';
  END IF;

  normalized_type := CASE NEW.event_type
    WHEN 'attendance.clock-in.completed' THEN 'clock_in'
    WHEN 'attendance.clock-out.completed' THEN 'clock_out'
    WHEN 'schedule-leave-requests.submit.completed' THEN 'leave_requested'
    WHEN 'leave-requests.submit.completed' THEN 'leave_requested'
    WHEN 'schedule-leave-requests.cancel.completed' THEN 'time_off_cancelled'
    WHEN 'leave-requests.cancel.completed' THEN 'time_off_cancelled'
    WHEN 'time-off-requests.approve.completed' THEN 'leave_approved'
    WHEN 'time-off-requests.reject.completed' THEN 'leave_rejected'
    WHEN 'shifts.create.completed' THEN 'shift_updated'
    WHEN 'leaves.replace-month.completed' THEN 'shift_updated'
    ELSE NULL
  END;

  IF normalized_type IS NULL OR actor IS NULL THEN RETURN NEW; END IF;

  notification_title := CASE normalized_type
    WHEN 'clock_in' THEN '員工已打卡上班'
    WHEN 'clock_out' THEN '員工已打卡下班'
    WHEN 'leave_requested' THEN CASE WHEN request_kind = 'schedule_leave'
      THEN '新的排休申請' ELSE '新的請假申請' END
    WHEN 'time_off_cancelled' THEN CASE WHEN request_kind = 'schedule_leave'
      THEN '排休申請已取消' ELSE '請假申請已取消' END
    WHEN 'leave_approved' THEN CASE WHEN request_kind = 'schedule_leave'
      THEN '排休申請已核准' ELSE '請假申請已核准' END
    WHEN 'leave_rejected' THEN CASE WHEN request_kind = 'schedule_leave'
      THEN '排休申請未獲核准' ELSE '請假申請未獲核准' END
    ELSE '班表已更新'
  END;
  notification_body := CASE normalized_type
    WHEN 'clock_in' THEN '有員工完成上班打卡。'
    WHEN 'clock_out' THEN '有員工完成下班打卡。'
    WHEN 'leave_requested' THEN '有新的申請等待審核。'
    WHEN 'time_off_cancelled' THEN '一筆待處理申請已取消。'
    WHEN 'leave_approved' THEN '您的申請已核准。'
    WHEN 'leave_rejected' THEN '您的申請未獲核准。'
    ELSE '您的班表或排休資料已更新。'
  END;

  INSERT INTO notifications(
    workspace_id, recipient_user_id, source_event_id, notification_type,
    title, body, resource_type, resource_id, actor_user_id, destination,
    deduplication_key, metadata
  )
  SELECT NEW.workspace_id, recipient.user_id, NEW.id, normalized_type,
         notification_title, notification_body, NEW.aggregate_type, NEW.aggregate_id,
         actor, '/?open=notifications',
         encode(digest(concat_ws('|', NEW.workspace_id, normalized_type,
           NEW.aggregate_type, NEW.aggregate_id, NEW.id::text, recipient.user_id::text), 'sha256'), 'hex'),
         jsonb_build_object(
           'eventType', normalized_type,
           'entityType', NEW.aggregate_type,
           'entityId', NEW.aggregate_id
         )
    FROM app_private.resolve_notification_recipients(
      NEW.event_type, NEW.workspace_id, actor, target_employee_id
    ) recipient
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END
$$;

DROP TRIGGER outbox_events_create_notifications ON outbox_events;
CREATE TRIGGER outbox_events_create_notifications
AFTER INSERT ON outbox_events
FOR EACH ROW EXECUTE FUNCTION app_private.create_notifications_from_outbox();

CREATE OR REPLACE FUNCTION app_private.api_list_notifications(
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
  result jsonb;
  preference notification_preferences%ROWTYPE;
BEGIN
  result := app_private.api_list_notifications_v1(
    signed_payload, signed_signature, signing_key_id
  );
  SELECT * INTO preference
    FROM notification_preferences
   WHERE workspace_id = app_private.current_workspace_id()
     AND user_id = app_private.current_user_id();
  RETURN result || jsonb_build_object(
    'preferences', jsonb_build_object(
      'clockEvents', coalesce(preference.clock_events, true),
      'leaveEvents', coalesce(preference.leave_events, true),
      'shiftEvents', coalesce(preference.shift_events, true),
      'revision', coalesce(preference.revision, 0)
    )
  );
END
$$;

CREATE OR REPLACE FUNCTION app_private.api_update_notification_preferences(
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
  preference notification_preferences%ROWTYPE;
  response jsonb;
BEGIN
  SELECT * INTO auth_context
    FROM app_private.verify_tenant_context(
      signed_payload, signed_signature, signing_key_id, 'command', true
    );
  IF command_name <> 'notifications.update-preferences'
     OR command_input IS NULL OR jsonb_typeof(command_input) <> 'object'
     OR command_input - 'clockEvents' - 'leaveEvents' - 'shiftEvents' <> '{}'::jsonb
     OR NOT (command_input ? 'clockEvents' AND command_input ? 'leaveEvents' AND command_input ? 'shiftEvents')
     OR jsonb_typeof(command_input->'clockEvents') <> 'boolean'
     OR jsonb_typeof(command_input->'leaveEvents') <> 'boolean'
     OR jsonb_typeof(command_input->'shiftEvents') <> 'boolean'
     OR idempotency_key !~ '^[A-Za-z0-9._:-]{8,128}$'
     OR request_hash !~ '^[a-f0-9]{64}$'
     OR request_id !~ '^[A-Za-z0-9._:-]{8,128}$' THEN
    PERFORM app_private.raise_auth_error('COMMAND_INVALID');
  END IF;

  SELECT * INTO prior FROM command_receipts receipt
   WHERE receipt.workspace_id = auth_context.authorized_workspace_id
     AND receipt.idempotency_key = api_update_notification_preferences.idempotency_key
   FOR UPDATE;
  IF FOUND THEN
    IF prior.command_name <> api_update_notification_preferences.command_name
       OR prior.request_hash <> api_update_notification_preferences.request_hash THEN
      PERFORM app_private.raise_auth_error('IDEMPOTENCY_KEY_REUSED');
    END IF;
    RETURN prior.response_body || jsonb_build_object('replayed', true);
  END IF;

  INSERT INTO notification_preferences(
    workspace_id, user_id, clock_events, leave_events, shift_events
  ) VALUES (
    auth_context.authorized_workspace_id, auth_context.authorized_user_id,
    (command_input->>'clockEvents')::boolean,
    (command_input->>'leaveEvents')::boolean,
    (command_input->>'shiftEvents')::boolean
  )
  ON CONFLICT (workspace_id, user_id) DO UPDATE
    SET clock_events = EXCLUDED.clock_events,
        leave_events = EXCLUDED.leave_events,
        shift_events = EXCLUDED.shift_events,
        revision = notification_preferences.revision + 1
  RETURNING * INTO preference;

  response := jsonb_build_object('ok', true, 'data', jsonb_build_object(
    'clockEvents', preference.clock_events,
    'leaveEvents', preference.leave_events,
    'shiftEvents', preference.shift_events,
    'revision', preference.revision
  ));
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
    command_name, 'notification_preference', auth_context.authorized_user_id::text,
    request_id, jsonb_build_object('idempotencyKey', idempotency_key)
  );
  RETURN response;
END
$$;

REVOKE ALL ON TABLE notification_preferences FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.resolve_notification_recipients(text,text,uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.create_notifications_from_outbox() FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.api_list_notifications(text,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.api_update_notification_preferences(
  text,text,text,text,jsonb,text,text,text
) FROM PUBLIC;
