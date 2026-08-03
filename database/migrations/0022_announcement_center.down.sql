DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM announcement LIMIT 1)
     OR EXISTS (SELECT 1 FROM notifications WHERE notification_type = 'announcement_created' LIMIT 1) THEN
    RAISE EXCEPTION '0022 rollback requires announcement data to be archived explicitly';
  END IF;
END
$$;

DROP TRIGGER IF EXISTS outbox_events_create_announcement_notifications ON outbox_events;
DROP FUNCTION IF EXISTS app_private.create_announcement_notifications_from_outbox();

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
           'url', '/?open=notifications'
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

ALTER TABLE notifications
  DROP CONSTRAINT notifications_notification_type_check,
  ADD CONSTRAINT notifications_notification_type_check CHECK (notification_type IN (
    'time_off_submitted', 'time_off_cancelled', 'time_off_approved',
    'time_off_rejected', 'schedule_updated',
    'clock_in', 'clock_out', 'leave_requested', 'leave_approved',
    'leave_rejected', 'shift_updated'
  ));

DROP FUNCTION IF EXISTS app_private.api_mark_announcement_read(text,text,text,uuid,text,text,text);
DROP FUNCTION IF EXISTS app_private.api_execute_announcement_command(text,text,text,text,jsonb,text,text,text);
DROP FUNCTION IF EXISTS app_private.api_announcement_revision(text,text,text);
DROP FUNCTION IF EXISTS app_private.api_get_announcement(text,text,text,uuid);
DROP FUNCTION IF EXISTS app_private.api_list_announcements(text,text,text);
DROP FUNCTION IF EXISTS app_private.announcement_visible_to_role(text,text);
DROP TABLE IF EXISTS announcement_read;
DROP TABLE IF EXISTS announcement;

REVOKE ALL ON FUNCTION app_private.api_list_notifications(text,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.enqueue_notification_push() FROM PUBLIC;
