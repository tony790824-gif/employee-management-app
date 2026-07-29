DROP TRIGGER IF EXISTS notifications_enqueue_web_push ON notifications;
DROP FUNCTION IF EXISTS app_private.enqueue_notification_push();
DROP FUNCTION IF EXISTS app_private.api_push_status(text,text,text);
DROP FUNCTION IF EXISTS app_private.api_execute_push_command(
  text,text,text,text,jsonb,text,text,text
);
DROP FUNCTION IF EXISTS app_private.worker_claim_push_deliveries(text,integer);
DROP FUNCTION IF EXISTS app_private.worker_complete_push_delivery(uuid,text,integer,text);
DROP TABLE IF EXISTS push_deliveries;
DROP TABLE IF EXISTS push_subscriptions;
