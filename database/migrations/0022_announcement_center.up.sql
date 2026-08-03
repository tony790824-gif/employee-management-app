CREATE TABLE announcement (
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120 AND title = btrim(title)),
  content text NOT NULL CHECK (char_length(content) BETWEEN 1 AND 10000 AND content = btrim(content)),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  published_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  audience text NOT NULL CHECK (audience IN ('ALL', 'MANAGER', 'EMPLOYEE')),
  deleted_at timestamptz,
  revision integer NOT NULL DEFAULT 0 CHECK (revision >= 0),
  PRIMARY KEY (workspace_id, id),
  FOREIGN KEY (workspace_id, created_by)
    REFERENCES workspace_members(workspace_id, user_id) ON DELETE RESTRICT
);

CREATE TABLE announcement_read (
  workspace_id text NOT NULL,
  announcement_id uuid NOT NULL,
  user_id uuid NOT NULL,
  read_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (workspace_id, announcement_id, user_id),
  FOREIGN KEY (workspace_id, announcement_id)
    REFERENCES announcement(workspace_id, id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id, user_id)
    REFERENCES workspace_members(workspace_id, user_id) ON DELETE CASCADE
);

CREATE INDEX announcement_workspace_published_idx
  ON announcement(workspace_id, published_at DESC, id DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX announcement_read_user_idx
  ON announcement_read(workspace_id, user_id, read_at DESC);

CREATE TRIGGER announcement_touch_updated_at
BEFORE UPDATE ON announcement
FOR EACH ROW EXECUTE FUNCTION app_private.touch_updated_at();

ALTER TABLE announcement ENABLE ROW LEVEL SECURITY;
ALTER TABLE announcement FORCE ROW LEVEL SECURITY;
CREATE POLICY announcement_tenant_isolation ON announcement
  USING (workspace_id = app_private.current_workspace_id())
  WITH CHECK (workspace_id = app_private.current_workspace_id());

ALTER TABLE announcement_read ENABLE ROW LEVEL SECURITY;
ALTER TABLE announcement_read FORCE ROW LEVEL SECURITY;
CREATE POLICY announcement_read_tenant_isolation ON announcement_read
  USING (workspace_id = app_private.current_workspace_id())
  WITH CHECK (workspace_id = app_private.current_workspace_id());

ALTER TABLE notifications
  DROP CONSTRAINT notifications_notification_type_check,
  ADD CONSTRAINT notifications_notification_type_check CHECK (notification_type IN (
    'time_off_submitted', 'time_off_cancelled', 'time_off_approved',
    'time_off_rejected', 'schedule_updated',
    'clock_in', 'clock_out', 'leave_requested', 'leave_approved',
    'leave_rejected', 'shift_updated', 'announcement_created'
  ));

CREATE OR REPLACE FUNCTION app_private.announcement_visible_to_role(
  target_audience text,
  target_role text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = pg_catalog
AS $$
  SELECT CASE
    WHEN target_role IN ('boss', 'manager') THEN true
    WHEN target_role = 'employee' THEN target_audience IN ('ALL', 'EMPLOYEE')
    ELSE false
  END
$$;

CREATE OR REPLACE FUNCTION app_private.api_list_announcements(
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
  items jsonb;
  unread_count integer;
BEGIN
  SELECT * INTO auth_context
    FROM app_private.verify_tenant_context(
      signed_payload, signed_signature, signing_key_id, 'read', true
    );
  IF auth_context.authorized_role NOT IN ('boss', 'manager', 'employee') THEN
    PERFORM app_private.raise_auth_error('COMMAND_FORBIDDEN');
  END IF;

  SELECT coalesce(jsonb_agg(item ORDER BY published_at DESC, id DESC), '[]'::jsonb),
         count(*) FILTER (WHERE unread)
    INTO items, unread_count
    FROM (
      SELECT item.id, item.published_at, read_marker.read_at IS NULL AS unread,
             jsonb_build_object(
               'id', item.id,
               'title', item.title,
               'content', item.content,
               'audience', item.audience,
               'publishedAt', item.published_at,
               'updatedAt', item.updated_at,
               'readAt', read_marker.read_at,
               'revision', item.revision
             ) AS item
        FROM announcement item
        LEFT JOIN announcement_read read_marker
          ON read_marker.workspace_id = item.workspace_id
         AND read_marker.announcement_id = item.id
         AND read_marker.user_id = auth_context.authorized_user_id
       WHERE item.workspace_id = auth_context.authorized_workspace_id
         AND item.deleted_at IS NULL
         AND item.published_at <= clock_timestamp()
         AND app_private.announcement_visible_to_role(
           item.audience, auth_context.authorized_role
         )
       ORDER BY item.published_at DESC, item.id DESC
       LIMIT 100
    ) visible_announcements;

  RETURN jsonb_build_object(
    'ok', true,
    'workspaceId', auth_context.authorized_workspace_id,
    'items', items,
    'unreadCount', coalesce(unread_count, 0)
  );
END
$$;

CREATE OR REPLACE FUNCTION app_private.api_get_announcement(
  signed_payload text,
  signed_signature text,
  signing_key_id text,
  announcement_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app_private
AS $$
DECLARE
  auth_context record;
  target announcement%ROWTYPE;
  read_at timestamptz;
BEGIN
  SELECT * INTO auth_context
    FROM app_private.verify_tenant_context(
      signed_payload, signed_signature, signing_key_id, 'read', true
    );
  IF auth_context.authorized_role NOT IN ('boss', 'manager', 'employee') THEN
    PERFORM app_private.raise_auth_error('COMMAND_FORBIDDEN');
  END IF;
  SELECT * INTO target
    FROM announcement item
   WHERE item.workspace_id = auth_context.authorized_workspace_id
     AND item.id = announcement_id
     AND item.deleted_at IS NULL
     AND item.published_at <= clock_timestamp()
     AND app_private.announcement_visible_to_role(
       item.audience, auth_context.authorized_role
     );
  IF NOT FOUND THEN
    PERFORM app_private.raise_auth_error('ANNOUNCEMENT_NOT_FOUND');
  END IF;
  SELECT marker.read_at INTO read_at
    FROM announcement_read marker
   WHERE marker.workspace_id = target.workspace_id
     AND marker.announcement_id = target.id
     AND marker.user_id = auth_context.authorized_user_id;

  RETURN jsonb_build_object(
    'ok', true,
    'workspaceId', auth_context.authorized_workspace_id,
    'item', jsonb_build_object(
      'id', target.id,
      'title', target.title,
      'content', target.content,
      'audience', target.audience,
      'publishedAt', target.published_at,
      'updatedAt', target.updated_at,
      'readAt', read_at,
      'revision', target.revision
    )
  );
END
$$;

CREATE OR REPLACE FUNCTION app_private.api_announcement_revision(
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
  latest_updated_at timestamptz;
BEGIN
  SELECT * INTO auth_context
    FROM app_private.verify_tenant_context(
      signed_payload, signed_signature, signing_key_id, 'read', true
    );
  IF auth_context.authorized_role NOT IN ('boss', 'manager', 'employee') THEN
    PERFORM app_private.raise_auth_error('COMMAND_FORBIDDEN');
  END IF;
  SELECT count(*),
         count(*) FILTER (WHERE marker.read_at IS NULL),
         coalesce(sum(item.revision), 0),
         max(greatest(item.updated_at, coalesce(marker.read_at, '-infinity'::timestamptz)))
    INTO row_count, unread_count, revision_total, latest_updated_at
    FROM announcement item
    LEFT JOIN announcement_read marker
      ON marker.workspace_id = item.workspace_id
     AND marker.announcement_id = item.id
     AND marker.user_id = auth_context.authorized_user_id
   WHERE item.workspace_id = auth_context.authorized_workspace_id
     AND item.deleted_at IS NULL
     AND item.published_at <= clock_timestamp()
     AND app_private.announcement_visible_to_role(
       item.audience, auth_context.authorized_role
     );
  RETURN jsonb_build_object(
    'count', row_count,
    'unreadCount', unread_count,
    'revisionTotal', revision_total,
    'latestUpdatedAt', latest_updated_at
  );
END
$$;

CREATE OR REPLACE FUNCTION app_private.api_execute_announcement_command(
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
  target announcement%ROWTYPE;
  response jsonb;
BEGIN
  SELECT * INTO auth_context
    FROM app_private.verify_tenant_context(
      signed_payload, signed_signature, signing_key_id, 'command', true
    );
  IF auth_context.authorized_role NOT IN ('boss', 'manager') THEN
    PERFORM app_private.raise_auth_error('COMMAND_FORBIDDEN');
  END IF;
  IF command_name NOT IN ('announcements.create', 'announcements.update', 'announcements.delete')
     OR command_input IS NULL OR jsonb_typeof(command_input) <> 'object'
     OR idempotency_key !~ '^[A-Za-z0-9._:-]{8,128}$'
     OR request_hash !~ '^[a-f0-9]{64}$'
     OR request_id !~ '^[A-Za-z0-9._:-]{8,128}$' THEN
    PERFORM app_private.raise_auth_error('COMMAND_INVALID');
  END IF;
  SELECT * INTO prior
    FROM command_receipts receipt
   WHERE receipt.workspace_id = auth_context.authorized_workspace_id
     AND receipt.idempotency_key = api_execute_announcement_command.idempotency_key
   FOR UPDATE;
  IF FOUND THEN
    IF prior.command_name <> api_execute_announcement_command.command_name
       OR prior.request_hash <> api_execute_announcement_command.request_hash THEN
      PERFORM app_private.raise_auth_error('IDEMPOTENCY_KEY_REUSED');
    END IF;
    RETURN prior.response_body || jsonb_build_object('replayed', true);
  END IF;

  IF command_name = 'announcements.create' THEN
    IF command_input - 'generatedId' - 'title' - 'content' - 'audience' - 'occurredAt' <> '{}'::jsonb
       OR NOT (command_input ? 'generatedId' AND command_input ? 'title'
         AND command_input ? 'content' AND command_input ? 'audience' AND command_input ? 'occurredAt')
       OR command_input->>'generatedId' !~
         '^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
       OR char_length(btrim(command_input->>'title')) NOT BETWEEN 1 AND 120
       OR char_length(btrim(command_input->>'content')) NOT BETWEEN 1 AND 10000
       OR command_input->>'audience' NOT IN ('ALL', 'MANAGER', 'EMPLOYEE') THEN
      PERFORM app_private.raise_auth_error('COMMAND_INVALID');
    END IF;
    INSERT INTO announcement(
      workspace_id, id, title, content, created_by, published_at, audience
    ) VALUES (
      auth_context.authorized_workspace_id,
      (command_input->>'generatedId')::uuid,
      btrim(command_input->>'title'),
      btrim(command_input->>'content'),
      auth_context.authorized_user_id,
      (command_input->>'occurredAt')::timestamptz,
      command_input->>'audience'
    ) RETURNING * INTO target;
  ELSE
    IF command_input->>'announcementId' !~
         '^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
       OR jsonb_typeof(command_input->'baseRevision') <> 'number'
       OR command_input->>'baseRevision' !~ '^(0|[1-9][0-9]*)$' THEN
      PERFORM app_private.raise_auth_error('COMMAND_INVALID');
    END IF;
    SELECT * INTO target
      FROM announcement item
     WHERE item.workspace_id = auth_context.authorized_workspace_id
       AND item.id = (command_input->>'announcementId')::uuid
       AND item.deleted_at IS NULL
     FOR UPDATE;
    IF NOT FOUND THEN PERFORM app_private.raise_auth_error('ANNOUNCEMENT_NOT_FOUND'); END IF;
    IF target.revision <> (command_input->>'baseRevision')::integer THEN
      PERFORM app_private.raise_auth_error('REVISION_CONFLICT');
    END IF;
    IF command_name = 'announcements.update' THEN
      IF command_input - 'announcementId' - 'baseRevision' - 'title' - 'content' - 'audience' <> '{}'::jsonb
         OR NOT (command_input ? 'title' AND command_input ? 'content' AND command_input ? 'audience')
         OR char_length(btrim(command_input->>'title')) NOT BETWEEN 1 AND 120
         OR char_length(btrim(command_input->>'content')) NOT BETWEEN 1 AND 10000
         OR command_input->>'audience' NOT IN ('ALL', 'MANAGER', 'EMPLOYEE') THEN
        PERFORM app_private.raise_auth_error('COMMAND_INVALID');
      END IF;
      UPDATE announcement item
         SET title = btrim(command_input->>'title'),
             content = btrim(command_input->>'content'),
             audience = command_input->>'audience',
             revision = item.revision + 1
       WHERE item.workspace_id = target.workspace_id AND item.id = target.id
       RETURNING * INTO target;
    ELSE
      IF command_input - 'announcementId' - 'baseRevision' <> '{}'::jsonb THEN
        PERFORM app_private.raise_auth_error('COMMAND_INVALID');
      END IF;
      UPDATE announcement item
         SET deleted_at = clock_timestamp(), revision = item.revision + 1
       WHERE item.workspace_id = target.workspace_id AND item.id = target.id
       RETURNING * INTO target;
    END IF;
  END IF;

  response := jsonb_build_object('ok', true, 'data', jsonb_build_object(
    'id', target.id,
    'title', target.title,
    'content', target.content,
    'audience', target.audience,
    'publishedAt', target.published_at,
    'updatedAt', target.updated_at,
    'deletedAt', target.deleted_at,
    'revision', target.revision
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
    command_name, 'announcement', target.id::text, request_id,
    jsonb_build_object('idempotencyKey', idempotency_key, 'audience', target.audience)
  );
  IF command_name = 'announcements.create' THEN
    INSERT INTO outbox_events(
      workspace_id, event_type, aggregate_type, aggregate_id, payload
    ) VALUES (
      auth_context.authorized_workspace_id, 'ANNOUNCEMENT_CREATED',
      'announcement', target.id::text,
      jsonb_build_object('announcementId', target.id, 'audience', target.audience)
    );
  END IF;
  RETURN response;
END
$$;

CREATE OR REPLACE FUNCTION app_private.api_mark_announcement_read(
  signed_payload text,
  signed_signature text,
  signing_key_id text,
  announcement_id uuid,
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
  target announcement%ROWTYPE;
  marker announcement_read%ROWTYPE;
  response jsonb;
BEGIN
  SELECT * INTO auth_context
    FROM app_private.verify_tenant_context(
      signed_payload, signed_signature, signing_key_id, 'command', true
    );
  IF auth_context.authorized_role NOT IN ('boss', 'manager', 'employee')
     OR idempotency_key !~ '^[A-Za-z0-9._:-]{8,128}$'
     OR request_hash !~ '^[a-f0-9]{64}$'
     OR request_id !~ '^[A-Za-z0-9._:-]{8,128}$' THEN
    PERFORM app_private.raise_auth_error('COMMAND_INVALID');
  END IF;
  SELECT * INTO prior FROM command_receipts receipt
   WHERE receipt.workspace_id = auth_context.authorized_workspace_id
     AND receipt.idempotency_key = api_mark_announcement_read.idempotency_key
   FOR UPDATE;
  IF FOUND THEN
    IF prior.command_name <> 'announcements.mark-read'
       OR prior.request_hash <> api_mark_announcement_read.request_hash THEN
      PERFORM app_private.raise_auth_error('IDEMPOTENCY_KEY_REUSED');
    END IF;
    RETURN prior.response_body || jsonb_build_object('replayed', true);
  END IF;
  SELECT * INTO target FROM announcement item
   WHERE item.workspace_id = auth_context.authorized_workspace_id
     AND item.id = announcement_id
     AND item.deleted_at IS NULL
     AND item.published_at <= clock_timestamp()
     AND app_private.announcement_visible_to_role(item.audience, auth_context.authorized_role);
  IF NOT FOUND THEN PERFORM app_private.raise_auth_error('ANNOUNCEMENT_NOT_FOUND'); END IF;

  INSERT INTO announcement_read(workspace_id, announcement_id, user_id)
  VALUES (auth_context.authorized_workspace_id, target.id, auth_context.authorized_user_id)
  ON CONFLICT ON CONSTRAINT announcement_read_pkey
  DO UPDATE SET read_at = announcement_read.read_at
  RETURNING * INTO marker;

  UPDATE notifications notification
     SET read_at = coalesce(notification.read_at, marker.read_at),
         revision = CASE WHEN notification.read_at IS NULL
           THEN notification.revision + 1 ELSE notification.revision END
   WHERE notification.workspace_id = auth_context.authorized_workspace_id
     AND notification.recipient_user_id = auth_context.authorized_user_id
     AND notification.resource_type = 'announcement'
     AND notification.resource_id = target.id::text;

  response := jsonb_build_object('ok', true, 'data', jsonb_build_object(
    'id', target.id, 'readAt', marker.read_at
  ));
  INSERT INTO command_receipts(
    workspace_id, idempotency_key, command_name, request_hash, response_body, actor_user_id
  ) VALUES (
    auth_context.authorized_workspace_id, idempotency_key, 'announcements.mark-read',
    request_hash, response, auth_context.authorized_user_id
  );
  INSERT INTO audit_logs(
    workspace_id, actor_user_id, action, resource_type, resource_id, request_id, payload
  ) VALUES (
    auth_context.authorized_workspace_id, auth_context.authorized_user_id,
    'announcements.mark-read', 'announcement', target.id::text, request_id,
    jsonb_build_object('idempotencyKey', idempotency_key)
  );
  RETURN response;
END
$$;

CREATE OR REPLACE FUNCTION app_private.create_announcement_notifications_from_outbox()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app_private
AS $$
DECLARE
  target announcement%ROWTYPE;
BEGIN
  IF NEW.event_type <> 'ANNOUNCEMENT_CREATED' OR NEW.aggregate_type <> 'announcement' THEN
    RETURN NEW;
  END IF;
  SELECT * INTO target FROM announcement item
   WHERE item.workspace_id = NEW.workspace_id
     AND item.id::text = NEW.aggregate_id
     AND item.deleted_at IS NULL;
  IF NOT FOUND THEN RETURN NEW; END IF;

  INSERT INTO notifications(
    workspace_id, recipient_user_id, source_event_id, notification_type,
    title, body, resource_type, resource_id, actor_user_id, destination,
    deduplication_key, metadata
  )
  SELECT NEW.workspace_id, member.user_id, NEW.id, 'announcement_created',
         '📢 新公告', target.title, 'announcement', target.id::text,
         target.created_by, '/announcements/' || target.id::text,
         encode(digest(concat_ws('|', NEW.workspace_id, 'announcement_created',
           target.id::text, NEW.id::text, member.user_id::text), 'sha256'), 'hex'),
         jsonb_build_object(
           'eventType', 'ANNOUNCEMENT_CREATED',
           'entityType', 'announcement',
           'entityId', target.id::text
         )
    FROM workspace_members member
    JOIN users app_user ON app_user.id = member.user_id AND app_user.status = 'active'
    JOIN workspaces workspace ON workspace.id = member.workspace_id AND workspace.status = 'active'
   WHERE member.workspace_id = NEW.workspace_id
     AND member.status = 'active'
     AND member.auth_status = 'active'
     AND (
       target.audience = 'ALL'
       OR (target.audience = 'MANAGER' AND member.role IN ('boss', 'manager'))
       OR (target.audience = 'EMPLOYEE' AND member.role = 'employee')
     )
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END
$$;

CREATE TRIGGER outbox_events_create_announcement_notifications
AFTER INSERT ON outbox_events
FOR EACH ROW EXECUTE FUNCTION app_private.create_announcement_notifications_from_outbox();

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
  items jsonb;
  unread_count integer;
  preference notification_preferences%ROWTYPE;
BEGIN
  SELECT * INTO auth_context
    FROM app_private.verify_tenant_context(
      signed_payload, signed_signature, signing_key_id, 'read', true
    );
  SELECT coalesce(jsonb_agg(item ORDER BY unread DESC, created_at DESC, id DESC), '[]'::jsonb),
         count(*) FILTER (WHERE unread)
    INTO items, unread_count
    FROM (
      SELECT notification.id, notification.created_at,
             notification.read_at IS NULL AS unread,
             jsonb_build_object(
               'id', notification.id,
               'type', notification.notification_type,
               'title', notification.title,
               'body', notification.body,
               'resourceType', notification.resource_type,
               'resourceId', notification.resource_id,
               'destination', notification.destination,
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
  SELECT * INTO preference FROM notification_preferences
   WHERE workspace_id = auth_context.authorized_workspace_id
     AND user_id = auth_context.authorized_user_id;
  RETURN jsonb_build_object(
    'ok', true,
    'workspaceId', auth_context.authorized_workspace_id,
    'items', items,
    'unreadCount', coalesce(unread_count, 0),
    'preferences', jsonb_build_object(
      'clockEvents', coalesce(preference.clock_events, true),
      'leaveEvents', coalesce(preference.leave_events, true),
      'shiftEvents', coalesce(preference.shift_events, true),
      'revision', coalesce(preference.revision, 0)
    )
  );
END
$$;

CREATE OR REPLACE FUNCTION app_private.enqueue_notification_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app_private
AS $$
BEGIN
  INSERT INTO push_deliveries(
    workspace_id, notification_id, recipient_user_id, subscription_id,
    delivery_type, payload
  )
  WITH eligible AS MATERIALIZED (
    SELECT subscription.*
      FROM push_subscriptions subscription
      JOIN app_private.auth_sessions session
        ON session.id = subscription.session_id
       AND session.user_id = subscription.user_id
       AND session.status = 'active'
       AND session.expires_at > clock_timestamp()
      JOIN users app_user ON app_user.id = subscription.user_id AND app_user.status = 'active'
      JOIN workspaces workspace ON workspace.id = subscription.workspace_id AND workspace.status = 'active'
      JOIN workspace_members member
        ON member.workspace_id = subscription.workspace_id
       AND member.user_id = subscription.user_id
       AND member.status = 'active'
       AND member.auth_status = 'active'
     WHERE subscription.workspace_id = NEW.workspace_id
       AND subscription.user_id = NEW.recipient_user_id
       AND subscription.revoked_at IS NULL
       AND (subscription.expiration_at IS NULL OR subscription.expiration_at > clock_timestamp())
  )
  SELECT NEW.workspace_id, NEW.id, NEW.recipient_user_id, subscription.id,
         'notification',
         jsonb_build_object(
           'notificationId', NEW.id,
           'type', NEW.notification_type,
           'title', NEW.title,
           'body', NEW.body,
           'resourceId', NEW.resource_id,
           'url', NEW.destination
         )
    FROM eligible subscription
   WHERE subscription.client_mode = 'pwa'
      OR NOT EXISTS (SELECT 1 FROM eligible preferred WHERE preferred.client_mode = 'pwa')
  ON CONFLICT (workspace_id, notification_id, subscription_id)
    WHERE notification_id IS NOT NULL
  DO NOTHING;
  RETURN NEW;
END
$$;

REVOKE ALL ON TABLE announcement, announcement_read FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.announcement_visible_to_role(text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.api_list_announcements(text,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.api_get_announcement(text,text,text,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.api_announcement_revision(text,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.api_execute_announcement_command(
  text,text,text,text,jsonb,text,text,text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.api_mark_announcement_read(
  text,text,text,uuid,text,text,text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.create_announcement_notifications_from_outbox() FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.api_list_notifications(text,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.enqueue_notification_push() FROM PUBLIC;
