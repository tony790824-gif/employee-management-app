DROP TRIGGER IF EXISTS outbox_events_create_notifications ON outbox_events;
DROP FUNCTION IF EXISTS app_private.create_notifications_from_outbox();
DROP FUNCTION IF EXISTS app_private.api_execute_notification_command(
  text,text,text,text,jsonb,text,text,text
);
DROP FUNCTION IF EXISTS app_private.api_notification_revision(text,text,text);
DROP FUNCTION IF EXISTS app_private.api_list_notifications(text,text,text);
DROP TABLE IF EXISTS notifications;
