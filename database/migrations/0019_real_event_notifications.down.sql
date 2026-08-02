DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM notifications
     WHERE notification_type IN (
       'clock_in', 'clock_out', 'leave_requested',
       'leave_approved', 'leave_rejected', 'shift_updated'
     )
  ) THEN
    RAISE EXCEPTION '0019 rollback requires Sprint 31 notifications to be removed by an approved Staging cleanup first';
  END IF;
END
$$;

DROP TRIGGER outbox_events_create_notifications ON outbox_events;
DROP FUNCTION app_private.create_notifications_from_outbox();
ALTER FUNCTION app_private.create_notifications_from_outbox_v1()
  RENAME TO create_notifications_from_outbox;
CREATE TRIGGER outbox_events_create_notifications
AFTER INSERT ON outbox_events
FOR EACH ROW EXECUTE FUNCTION app_private.create_notifications_from_outbox();

DROP FUNCTION app_private.api_list_notifications(text,text,text);
ALTER FUNCTION app_private.api_list_notifications_v1(text,text,text)
  RENAME TO api_list_notifications;
DROP FUNCTION app_private.api_update_notification_preferences(
  text,text,text,text,jsonb,text,text,text
);

DROP FUNCTION app_private.resolve_notification_recipients(text,text,uuid,text);
DROP TRIGGER notification_preferences_touch_updated_at ON notification_preferences;
DROP TABLE notification_preferences;
DROP INDEX notifications_recipient_deduplication_uidx;
ALTER TABLE notifications
  DROP CONSTRAINT notifications_notification_type_check,
  DROP COLUMN metadata,
  DROP COLUMN deduplication_key,
  DROP COLUMN destination,
  DROP COLUMN actor_user_id,
  ADD CONSTRAINT notifications_notification_type_check CHECK (notification_type IN (
    'time_off_submitted', 'time_off_cancelled', 'time_off_approved',
    'time_off_rejected', 'schedule_updated'
  ));

REVOKE ALL ON FUNCTION app_private.create_notifications_from_outbox() FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.api_list_notifications(text,text,text) FROM PUBLIC;
