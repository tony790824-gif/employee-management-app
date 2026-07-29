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
       OR command_input - 'notificationId' - 'baseRevision' <> '{}'::jsonb
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

REVOKE ALL ON FUNCTION app_private.api_execute_notification_command(
  text,text,text,text,jsonb,text,text,text
) FROM PUBLIC;
