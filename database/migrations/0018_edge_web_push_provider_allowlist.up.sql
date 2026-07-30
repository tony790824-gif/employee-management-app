ALTER TABLE push_subscriptions
  DROP CONSTRAINT push_subscriptions_endpoint_check;

ALTER TABLE push_subscriptions
  ADD CONSTRAINT push_subscriptions_endpoint_check CHECK (
    char_length(endpoint) BETWEEN 32 AND 2048
    AND endpoint ~ '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|([a-z0-9-]+\.)*push\.apple\.com|([a-z0-9-]+\.)*notify\.windows\.com)/'
  );

DO $migration$
DECLARE
  function_body text;
  old_register_check text := $old$OR target_endpoint !~
         '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|([a-z0-9-]+\.)*push\.apple\.com)/'$old$;
  new_register_check text := $new$OR target_endpoint !~
         '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|([a-z0-9-]+\.)*push\.apple\.com|([a-z0-9-]+\.)*notify\.windows\.com)/'$new$;
  unregister_target text := $old$    target_endpoint := command_input->>'endpoint';
    UPDATE push_subscriptions subscription$old$;
  unregister_replacement text := $new$    target_endpoint := command_input->>'endpoint';
    IF target_endpoint !~
       '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|([a-z0-9-]+\.)*push\.apple\.com|([a-z0-9-]+\.)*notify\.windows\.com)/' THEN
      PERFORM app_private.raise_auth_error('COMMAND_INVALID');
    END IF;
    UPDATE push_subscriptions subscription$new$;
  test_target text := $old$    target_endpoint := command_input->>'endpoint';
    IF (
      SELECT count(*)$old$;
  test_replacement text := $new$    target_endpoint := command_input->>'endpoint';
    IF target_endpoint !~
       '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|([a-z0-9-]+\.)*push\.apple\.com|([a-z0-9-]+\.)*notify\.windows\.com)/' THEN
      PERFORM app_private.raise_auth_error('COMMAND_INVALID');
    END IF;
    IF (
      SELECT count(*)$new$;
BEGIN
  SELECT procedure.prosrc
    INTO function_body
    FROM pg_proc procedure
    JOIN pg_namespace namespace ON namespace.oid = procedure.pronamespace
   WHERE namespace.nspname = 'app_private'
     AND procedure.proname = 'api_execute_push_command'
     AND pg_get_function_identity_arguments(procedure.oid) =
       'signed_payload text, signed_signature text, signing_key_id text, command_name text, command_input jsonb, idempotency_key text, request_hash text, request_id text';

  IF function_body IS NULL
     OR position(old_register_check IN function_body) = 0
     OR position(unregister_target IN function_body) = 0
     OR position(test_target IN function_body) = 0 THEN
    RAISE EXCEPTION '0018 expected push command validation source was not found';
  END IF;

  function_body := replace(function_body, old_register_check, new_register_check);
  function_body := replace(function_body, unregister_target, unregister_replacement);
  function_body := replace(function_body, test_target, test_replacement);

  EXECUTE format(
    'CREATE OR REPLACE FUNCTION app_private.api_execute_push_command(signed_payload text,signed_signature text,signing_key_id text,command_name text,command_input jsonb,idempotency_key text,request_hash text,request_id text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, app_private AS %L',
    function_body
  );
END
$migration$;

REVOKE ALL ON FUNCTION app_private.api_execute_push_command(
  text,text,text,text,jsonb,text,text,text
) FROM PUBLIC;
