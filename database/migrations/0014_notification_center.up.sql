CREATE TABLE notifications (
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  recipient_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_event_id uuid NOT NULL,
  notification_type text NOT NULL CHECK (notification_type IN (
    'time_off_submitted',
    'time_off_cancelled',
    'time_off_approved',
    'time_off_rejected',
    'schedule_updated'
  )),
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 500),
  resource_type text CHECK (resource_type IS NULL OR char_length(resource_type) BETWEEN 1 AND 120),
  resource_id text CHECK (resource_id IS NULL OR char_length(resource_id) BETWEEN 1 AND 128),
  read_at timestamptz,
  revision integer NOT NULL DEFAULT 0 CHECK (revision >= 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (workspace_id, id),
  UNIQUE (workspace_id, recipient_user_id, source_event_id),
  FOREIGN KEY (workspace_id, source_event_id)
    REFERENCES outbox_events(workspace_id, id) ON DELETE CASCADE
);

CREATE INDEX notifications_recipient_sort_idx
  ON notifications(workspace_id, recipient_user_id, created_at DESC, id DESC);
CREATE INDEX notifications_recipient_unread_idx
  ON notifications(workspace_id, recipient_user_id, created_at DESC)
  WHERE read_at IS NULL;

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications FORCE ROW LEVEL SECURITY;
CREATE POLICY notifications_tenant_isolation ON notifications
  USING (workspace_id = app_private.current_workspace_id())
  WITH CHECK (workspace_id = app_private.current_workspace_id());

CREATE OR REPLACE FUNCTION app_private.create_notifications_from_outbox()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app_private
AS $$
DECLARE
  target_employee_id text;
  request_kind text;
BEGIN
  IF NEW.event_type IN (
    'schedule-leave-requests.submit.completed',
    'leave-requests.submit.completed',
    'schedule-leave-requests.cancel.completed',
    'leave-requests.cancel.completed'
  ) THEN
    INSERT INTO notifications(
      workspace_id, recipient_user_id, source_event_id, notification_type,
      title, body, resource_type, resource_id
    )
    SELECT NEW.workspace_id, member.user_id, NEW.id,
           CASE WHEN NEW.event_type LIKE '%.cancel.completed'
             THEN 'time_off_cancelled' ELSE 'time_off_submitted' END,
           CASE WHEN NEW.event_type LIKE 'schedule-leave-requests.%'
             THEN '排休申請更新' ELSE '請假申請更新' END,
           CASE WHEN NEW.event_type LIKE '%.cancel.completed'
             THEN '員工已取消一筆待處理申請。' ELSE '有新的申請等待審核。' END,
           'time_off_request', NEW.aggregate_id
      FROM workspace_members member
     WHERE member.workspace_id = NEW.workspace_id
       AND member.role IN ('boss', 'manager')
       AND member.status = 'active'
       AND member.auth_status = 'active'
    ON CONFLICT (workspace_id, recipient_user_id, source_event_id) DO NOTHING;

  ELSIF NEW.event_type IN (
    'time-off-requests.approve.completed',
    'time-off-requests.reject.completed'
  ) THEN
    SELECT request.employee_id, request.request_kind
      INTO target_employee_id, request_kind
      FROM time_off_requests request
     WHERE request.workspace_id = NEW.workspace_id
       AND request.id::text = NEW.aggregate_id;

    IF target_employee_id IS NOT NULL THEN
      INSERT INTO notifications(
        workspace_id, recipient_user_id, source_event_id, notification_type,
        title, body, resource_type, resource_id
      )
      SELECT NEW.workspace_id, member.user_id, NEW.id,
             CASE WHEN NEW.event_type = 'time-off-requests.approve.completed'
               THEN 'time_off_approved' ELSE 'time_off_rejected' END,
             CASE WHEN request_kind = 'schedule_leave'
               THEN '排休審核結果' ELSE '請假審核結果' END,
             CASE WHEN NEW.event_type = 'time-off-requests.approve.completed'
               THEN '您的申請已核准。' ELSE '您的申請未獲核准。' END,
             'time_off_request', NEW.aggregate_id
        FROM workspace_members member
       WHERE member.workspace_id = NEW.workspace_id
         AND member.employee_id = target_employee_id
         AND member.status = 'active'
         AND member.auth_status = 'active'
      ON CONFLICT (workspace_id, recipient_user_id, source_event_id) DO NOTHING;
    END IF;

  ELSIF NEW.event_type IN ('shifts.create.completed', 'leaves.replace-month.completed') THEN
    target_employee_id := NEW.payload->>'employeeId';
    IF target_employee_id IS NOT NULL THEN
      INSERT INTO notifications(
        workspace_id, recipient_user_id, source_event_id, notification_type,
        title, body, resource_type, resource_id
      )
      SELECT NEW.workspace_id, member.user_id, NEW.id, 'schedule_updated',
             '班表已更新', '您的班表或排休資料已更新。',
             NEW.aggregate_type, NEW.aggregate_id
        FROM workspace_members member
       WHERE member.workspace_id = NEW.workspace_id
         AND member.employee_id = target_employee_id
         AND member.status = 'active'
         AND member.auth_status = 'active'
      ON CONFLICT (workspace_id, recipient_user_id, source_event_id) DO NOTHING;
    END IF;
  END IF;
  RETURN NEW;
END
$$;

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
  auth_context record;
  rows jsonb;
  unread_count integer;
BEGIN
  SELECT * INTO auth_context
    FROM app_private.verify_tenant_context(
      signed_payload, signed_signature, signing_key_id, 'read', true
    );

  SELECT coalesce(jsonb_agg(item ORDER BY unread DESC, created_at DESC, id DESC), '[]'::jsonb),
         count(*) FILTER (WHERE unread)
    INTO rows, unread_count
    FROM (
      SELECT notification.id,
             notification.created_at,
             notification.read_at IS NULL AS unread,
             jsonb_build_object(
               'id', notification.id,
               'type', notification.notification_type,
               'title', notification.title,
               'body', notification.body,
               'resourceType', notification.resource_type,
               'resourceId', notification.resource_id,
               'readAt', notification.read_at,
               'createdAt', notification.created_at,
               'revision', notification.revision
             ) AS item
        FROM notifications notification
       WHERE notification.workspace_id = auth_context.authorized_workspace_id
         AND notification.recipient_user_id = auth_context.authorized_user_id
       ORDER BY notification.read_at IS NULL DESC, notification.created_at DESC, notification.id DESC
       LIMIT 100
    ) visible_notifications;

  RETURN jsonb_build_object(
    'ok', true,
    'workspaceId', auth_context.authorized_workspace_id,
    'items', rows,
    'unreadCount', coalesce(unread_count, 0)
  );
END
$$;

CREATE OR REPLACE FUNCTION app_private.api_notification_revision(
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
  row_count bigint;
  unread_count bigint;
  revision_total bigint;
  latest_created_at timestamptz;
BEGIN
  SELECT * INTO auth_context
    FROM app_private.verify_tenant_context(
      signed_payload, signed_signature, signing_key_id, 'read', true
    );

  SELECT count(*),
         count(*) FILTER (WHERE notification.read_at IS NULL),
         coalesce(sum(notification.revision), 0),
         max(notification.created_at)
    INTO row_count, unread_count, revision_total, latest_created_at
    FROM notifications notification
   WHERE notification.workspace_id = auth_context.authorized_workspace_id
     AND notification.recipient_user_id = auth_context.authorized_user_id;

  RETURN jsonb_build_object(
    'count', row_count,
    'unreadCount', unread_count,
    'revisionTotal', revision_total,
    'latestCreatedAt', latest_created_at
  );
END
$$;

CREATE OR REPLACE FUNCTION app_private.api_execute_notification_command(
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
  target notifications%ROWTYPE;
  updated_count integer := 0;
  response jsonb;
BEGIN
  SELECT * INTO auth_context
    FROM app_private.verify_tenant_context(
      signed_payload, signed_signature, signing_key_id, 'command', true
    );

  IF command_name NOT IN ('notifications.mark-read', 'notifications.mark-all-read')
     OR command_input IS NULL
     OR jsonb_typeof(command_input) <> 'object'
     OR idempotency_key !~ '^[A-Za-z0-9._:-]{8,128}$'
     OR request_hash !~ '^[a-f0-9]{64}$'
     OR request_id !~ '^[A-Za-z0-9._:-]{8,128}$' THEN
    PERFORM app_private.raise_auth_error('COMMAND_INVALID');
  END IF;

  SELECT * INTO prior
    FROM command_receipts receipt
   WHERE receipt.workspace_id = auth_context.authorized_workspace_id
     AND receipt.idempotency_key = api_execute_notification_command.idempotency_key
   FOR UPDATE;
  IF FOUND THEN
    IF prior.command_name <> api_execute_notification_command.command_name
       OR prior.request_hash <> api_execute_notification_command.request_hash THEN
      PERFORM app_private.raise_auth_error('IDEMPOTENCY_KEY_REUSED');
    END IF;
    RETURN prior.response_body || jsonb_build_object('replayed', true);
  END IF;

  IF command_name = 'notifications.mark-read' THEN
    IF NOT (command_input ? 'notificationId' AND command_input ? 'baseRevision')
       OR jsonb_object_length(command_input) <> 2
       OR command_input->>'notificationId' !~
         '^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[1-5][a-fA-F0-9]{3}-[89aAbB][a-fA-F0-9]{3}-[a-fA-F0-9]{12}$'
       OR jsonb_typeof(command_input->'baseRevision') <> 'number'
       OR command_input->>'baseRevision' !~ '^(0|[1-9][0-9]*)$'
       OR (command_input->>'baseRevision')::numeric > 2147483647 THEN
      PERFORM app_private.raise_auth_error('COMMAND_INVALID');
    END IF;

    UPDATE notifications notification
       SET read_at = coalesce(notification.read_at, clock_timestamp()),
           revision = CASE WHEN notification.read_at IS NULL
             THEN notification.revision + 1 ELSE notification.revision END
     WHERE notification.workspace_id = auth_context.authorized_workspace_id
       AND notification.recipient_user_id = auth_context.authorized_user_id
       AND notification.id = (command_input->>'notificationId')::uuid
       AND notification.revision = (command_input->>'baseRevision')::integer
     RETURNING * INTO target;

    IF NOT FOUND THEN
      IF EXISTS (
        SELECT 1
          FROM notifications notification
         WHERE notification.workspace_id = auth_context.authorized_workspace_id
           AND notification.recipient_user_id = auth_context.authorized_user_id
           AND notification.id = (command_input->>'notificationId')::uuid
      ) THEN
        PERFORM app_private.raise_auth_error('REVISION_CONFLICT');
      END IF;
      PERFORM app_private.raise_auth_error('NOTIFICATION_NOT_FOUND');
    END IF;

    response := jsonb_build_object(
      'ok', true,
      'data', jsonb_build_object(
        'id', target.id,
        'readAt', target.read_at,
        'revision', target.revision
      )
    );
  ELSE
    IF command_input <> '{}'::jsonb THEN
      PERFORM app_private.raise_auth_error('COMMAND_INVALID');
    END IF;
    UPDATE notifications notification
       SET read_at = clock_timestamp(),
           revision = notification.revision + 1
     WHERE notification.workspace_id = auth_context.authorized_workspace_id
       AND notification.recipient_user_id = auth_context.authorized_user_id
       AND notification.read_at IS NULL;
    GET DIAGNOSTICS updated_count = ROW_COUNT;
    response := jsonb_build_object(
      'ok', true,
      'data', jsonb_build_object('updatedCount', updated_count)
    );
  END IF;

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
    command_name, 'notification',
    coalesce(target.id::text, 'all'), request_id,
    jsonb_build_object('idempotencyKey', idempotency_key, 'updatedCount', updated_count)
  );
  RETURN response;
END
$$;

REVOKE ALL ON TABLE notifications FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.create_notifications_from_outbox() FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.api_list_notifications(text,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.api_notification_revision(text,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.api_execute_notification_command(
  text,text,text,text,jsonb,text,text,text
) FROM PUBLIC;
