DO $migration$
DECLARE
  function_body text;
  old_allowed_keys text := $old$- 'auth' - 'userAgent' - 'platform' <> '{}'::jsonb$old$;
  new_allowed_keys text := $new$- 'auth' - 'userAgent' - 'platform' - 'clientMode' <> '{}'::jsonb$new$;
  old_type_checks text := $old$       OR jsonb_typeof(command_input->'platform') <> 'string'
       OR ($old$;
  new_type_checks text := $new$       OR jsonb_typeof(command_input->'platform') <> 'string'
       OR (command_input ? 'clientMode'
         AND jsonb_typeof(command_input->'clientMode') <> 'string')
       OR ($new$;
  old_platform_checks text := $old$       OR command_input->>'platform' NOT IN (
         'windows', 'macos', 'android', 'ios', 'ipados', 'linux', 'unknown'
       )
       OR ($old$;
  new_platform_checks text := $new$       OR command_input->>'platform' NOT IN (
         'windows', 'macos', 'android', 'ios', 'ipados', 'linux', 'unknown'
       )
       OR coalesce(command_input->>'clientMode', 'browser') NOT IN ('pwa', 'browser')
       OR ($new$;
  old_update text := $old$             platform = command_input->>'platform',
             expiration_at = CASE$old$;
  new_update text := $new$             platform = command_input->>'platform',
             client_mode = coalesce(command_input->>'clientMode', 'browser'),
             expiration_at = CASE$new$;
  old_insert_columns text := $old$        user_agent, platform, expiration_at
      ) VALUES ($old$;
  new_insert_columns text := $new$        user_agent, platform, client_mode, expiration_at
      ) VALUES ($new$;
  old_insert_values text := $old$        command_input->>'userAgent',
        command_input->>'platform',
        CASE$old$;
  new_insert_values text := $new$        command_input->>'userAgent',
        command_input->>'platform',
        coalesce(command_input->>'clientMode', 'browser'),
        CASE$new$;
BEGIN
  SELECT procedure.prosrc INTO function_body
    FROM pg_proc procedure
    JOIN pg_namespace namespace ON namespace.oid = procedure.pronamespace
   WHERE namespace.nspname = 'app_private'
     AND procedure.proname = 'api_execute_push_command'
     AND pg_get_function_identity_arguments(procedure.oid) =
       'signed_payload text, signed_signature text, signing_key_id text, command_name text, command_input jsonb, idempotency_key text, request_hash text, request_id text';

  IF function_body IS NULL
     OR position(new_allowed_keys IN function_body) = 0
     OR position(new_type_checks IN function_body) = 0
     OR position(new_platform_checks IN function_body) = 0
     OR position(new_update IN function_body) = 0
     OR position(new_insert_columns IN function_body) = 0
     OR position(new_insert_values IN function_body) = 0 THEN
    RAISE EXCEPTION '0020 expected subscription priority source was not found';
  END IF;

  function_body := replace(function_body, new_allowed_keys, old_allowed_keys);
  function_body := replace(function_body, new_type_checks, old_type_checks);
  function_body := replace(function_body, new_platform_checks, old_platform_checks);
  function_body := replace(function_body, new_update, old_update);
  function_body := replace(function_body, new_insert_columns, old_insert_columns);
  function_body := replace(function_body, new_insert_values, old_insert_values);

  EXECUTE format(
    'CREATE OR REPLACE FUNCTION app_private.api_execute_push_command(signed_payload text,signed_signature text,signing_key_id text,command_name text,command_input jsonb,idempotency_key text,request_hash text,request_id text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, app_private AS %L',
    function_body
  );
END
$migration$;

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
  SELECT NEW.workspace_id, NEW.id, NEW.recipient_user_id, subscription.id,
         'notification',
         jsonb_build_object(
           'notificationId', NEW.id,
           'type', NEW.notification_type,
           'title', NEW.title,
           'body', NEW.body,
           'url', '/?open=notifications'
         )
    FROM push_subscriptions subscription
    JOIN app_private.auth_sessions session
      ON session.id = subscription.session_id
     AND session.user_id = subscription.user_id
     AND session.status = 'active'
     AND session.expires_at > clock_timestamp()
    JOIN users app_user
      ON app_user.id = subscription.user_id
     AND app_user.status = 'active'
    JOIN workspaces workspace
      ON workspace.id = subscription.workspace_id
     AND workspace.status = 'active'
    JOIN workspace_members member
      ON member.workspace_id = subscription.workspace_id
     AND member.user_id = subscription.user_id
     AND member.status = 'active'
     AND member.auth_status = 'active'
   WHERE subscription.workspace_id = NEW.workspace_id
     AND subscription.user_id = NEW.recipient_user_id
     AND subscription.revoked_at IS NULL
     AND (subscription.expiration_at IS NULL OR subscription.expiration_at > clock_timestamp())
  ON CONFLICT (workspace_id, notification_id, subscription_id)
    WHERE notification_id IS NOT NULL
  DO NOTHING;
  RETURN NEW;
END
$$;

DROP INDEX push_subscriptions_recipient_mode_active_idx;

ALTER TABLE push_subscriptions
  DROP COLUMN client_mode;

REVOKE ALL ON FUNCTION app_private.enqueue_notification_push() FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.api_execute_push_command(
  text,text,text,text,jsonb,text,text,text
) FROM PUBLIC;
