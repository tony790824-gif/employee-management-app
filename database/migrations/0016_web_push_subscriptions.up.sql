CREATE TABLE push_subscriptions (
  workspace_id text NOT NULL,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  session_id uuid NOT NULL REFERENCES app_private.auth_sessions(id) ON DELETE CASCADE,
  endpoint text NOT NULL CHECK (
    char_length(endpoint) BETWEEN 32 AND 2048
    AND endpoint ~ '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|([a-z0-9-]+\.)*push\.apple\.com)/'
  ),
  endpoint_hash bytea GENERATED ALWAYS AS (digest(endpoint, 'sha256')) STORED,
  p256dh_key text NOT NULL CHECK (p256dh_key ~ '^[A-Za-z0-9_-]{80,120}$'),
  auth_key text NOT NULL CHECK (auth_key ~ '^[A-Za-z0-9_-]{16,64}$'),
  user_agent text NOT NULL DEFAULT '' CHECK (char_length(user_agent) <= 256),
  platform text NOT NULL CHECK (platform IN (
    'windows', 'macos', 'android', 'ios', 'ipados', 'linux', 'unknown'
  )),
  expiration_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  last_seen_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  revoked_at timestamptz,
  failure_count integer NOT NULL DEFAULT 0 CHECK (failure_count BETWEEN 0 AND 1000),
  last_failure_at timestamptz,
  PRIMARY KEY (workspace_id, id),
  UNIQUE (endpoint_hash),
  FOREIGN KEY (workspace_id, user_id)
    REFERENCES workspace_members(workspace_id, user_id) ON DELETE CASCADE
);

CREATE INDEX push_subscriptions_recipient_active_idx
  ON push_subscriptions(workspace_id, user_id, updated_at DESC)
  WHERE revoked_at IS NULL;
CREATE INDEX push_subscriptions_session_idx
  ON push_subscriptions(session_id, workspace_id)
  WHERE revoked_at IS NULL;

CREATE TRIGGER push_subscriptions_touch_updated_at
BEFORE UPDATE ON push_subscriptions
FOR EACH ROW EXECUTE FUNCTION app_private.touch_updated_at();

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_subscriptions FORCE ROW LEVEL SECURITY;
CREATE POLICY push_subscriptions_tenant_isolation ON push_subscriptions
  USING (
    workspace_id = app_private.current_workspace_id()
    AND user_id = app_private.current_user_id()
  )
  WITH CHECK (
    workspace_id = app_private.current_workspace_id()
    AND user_id = app_private.current_user_id()
  );

CREATE TABLE push_deliveries (
  workspace_id text NOT NULL,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  notification_id uuid,
  recipient_user_id uuid NOT NULL,
  subscription_id uuid NOT NULL,
  delivery_type text NOT NULL CHECK (delivery_type IN ('notification', 'push_test')),
  payload jsonb NOT NULL CHECK (
    jsonb_typeof(payload) = 'object'
    AND octet_length(payload::text) BETWEEN 2 AND 3072
  ),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'delivered', 'dead')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count BETWEEN 0 AND 10),
  next_attempt_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  claimed_at timestamptz,
  delivered_at timestamptz,
  last_status_code integer CHECK (last_status_code IS NULL OR last_status_code BETWEEN 100 AND 599),
  last_error_code text NOT NULL DEFAULT ''
    CHECK (last_error_code ~ '^[A-Z0-9_]{0,64}$'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (workspace_id, id),
  FOREIGN KEY (workspace_id, recipient_user_id)
    REFERENCES workspace_members(workspace_id, user_id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id, subscription_id)
    REFERENCES push_subscriptions(workspace_id, id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id, notification_id)
    REFERENCES notifications(workspace_id, id) ON DELETE CASCADE,
  CHECK (
    (delivery_type = 'notification' AND notification_id IS NOT NULL)
    OR (delivery_type = 'push_test' AND notification_id IS NULL)
  )
);

CREATE UNIQUE INDEX push_deliveries_notification_subscription_uidx
  ON push_deliveries(workspace_id, notification_id, subscription_id)
  WHERE notification_id IS NOT NULL;
CREATE INDEX push_deliveries_pending_idx
  ON push_deliveries(next_attempt_at, created_at, id)
  WHERE status = 'pending';
CREATE INDEX push_deliveries_recipient_idx
  ON push_deliveries(workspace_id, recipient_user_id, created_at DESC);

CREATE TRIGGER push_deliveries_touch_updated_at
BEFORE UPDATE ON push_deliveries
FOR EACH ROW EXECUTE FUNCTION app_private.touch_updated_at();

ALTER TABLE push_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_deliveries FORCE ROW LEVEL SECURITY;
CREATE POLICY push_deliveries_tenant_isolation ON push_deliveries
  USING (
    workspace_id = app_private.current_workspace_id()
    AND recipient_user_id = app_private.current_user_id()
  )
  WITH CHECK (
    workspace_id = app_private.current_workspace_id()
    AND recipient_user_id = app_private.current_user_id()
  );

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

CREATE TRIGGER notifications_enqueue_web_push
AFTER INSERT ON notifications
FOR EACH ROW EXECUTE FUNCTION app_private.enqueue_notification_push();

CREATE OR REPLACE FUNCTION app_private.api_push_status(
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
  active_count integer;
BEGIN
  SELECT * INTO auth_context
    FROM app_private.verify_tenant_context(
      signed_payload, signed_signature, signing_key_id, 'read', true
    );

  SELECT count(*)
    INTO active_count
    FROM push_subscriptions subscription
   WHERE subscription.workspace_id = auth_context.authorized_workspace_id
     AND subscription.user_id = auth_context.authorized_user_id
     AND subscription.session_id = auth_context.authorized_session_id
     AND subscription.revoked_at IS NULL
     AND (subscription.expiration_at IS NULL OR subscription.expiration_at > clock_timestamp());

  RETURN jsonb_build_object(
    'ok', true,
    'workspaceId', auth_context.authorized_workspace_id,
    'activeSubscriptionCount', active_count
  );
END
$$;

CREATE OR REPLACE FUNCTION app_private.api_execute_push_command(
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
  existing_subscription push_subscriptions%ROWTYPE;
  target_endpoint text;
  updated_count integer := 0;
  queued_count integer := 0;
  response jsonb;
BEGIN
  SELECT * INTO auth_context
    FROM app_private.verify_tenant_context(
      signed_payload, signed_signature, signing_key_id, 'command', true
    );

  IF command_name NOT IN ('push.register', 'push.unregister', 'push.test')
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
     AND receipt.idempotency_key = api_execute_push_command.idempotency_key
   FOR UPDATE;
  IF FOUND THEN
    IF prior.command_name <> api_execute_push_command.command_name
       OR prior.request_hash <> api_execute_push_command.request_hash THEN
      PERFORM app_private.raise_auth_error('IDEMPOTENCY_KEY_REUSED');
    END IF;
    RETURN prior.response_body || jsonb_build_object('replayed', true);
  END IF;

  IF command_name = 'push.register' THEN
    IF NOT (
      command_input ? 'endpoint'
      AND command_input ? 'expirationTime'
      AND command_input ? 'p256dh'
      AND command_input ? 'auth'
      AND command_input ? 'userAgent'
      AND command_input ? 'platform'
    )
       OR command_input - 'endpoint' - 'expirationTime' - 'p256dh'
         - 'auth' - 'userAgent' - 'platform' <> '{}'::jsonb
       OR jsonb_typeof(command_input->'endpoint') <> 'string'
       OR jsonb_typeof(command_input->'p256dh') <> 'string'
       OR jsonb_typeof(command_input->'auth') <> 'string'
       OR jsonb_typeof(command_input->'userAgent') <> 'string'
       OR jsonb_typeof(command_input->'platform') <> 'string'
       OR (
         command_input->'expirationTime' <> 'null'::jsonb
         AND jsonb_typeof(command_input->'expirationTime') <> 'number'
       ) THEN
      PERFORM app_private.raise_auth_error('COMMAND_INVALID');
    END IF;

    target_endpoint := command_input->>'endpoint';
    IF char_length(target_endpoint) NOT BETWEEN 32 AND 2048
       OR target_endpoint !~
         '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|([a-z0-9-]+\.)*push\.apple\.com)/'
       OR command_input->>'p256dh' !~ '^[A-Za-z0-9_-]{80,120}$'
       OR command_input->>'auth' !~ '^[A-Za-z0-9_-]{16,64}$'
       OR char_length(command_input->>'userAgent') > 256
       OR command_input->>'platform' NOT IN (
         'windows', 'macos', 'android', 'ios', 'ipados', 'linux', 'unknown'
       )
       OR (
         command_input->'expirationTime' <> 'null'::jsonb
         AND (
           command_input->>'expirationTime' !~ '^[0-9]{10,16}$'
           OR (command_input->>'expirationTime')::numeric > 8640000000000000
         )
       ) THEN
      PERFORM app_private.raise_auth_error('COMMAND_INVALID');
    END IF;

    SELECT * INTO existing_subscription
      FROM push_subscriptions subscription
     WHERE subscription.endpoint_hash = digest(target_endpoint, 'sha256')
     FOR UPDATE;
    IF FOUND
       AND (
         existing_subscription.workspace_id <> auth_context.authorized_workspace_id
         OR existing_subscription.user_id <> auth_context.authorized_user_id
       ) THEN
      PERFORM app_private.raise_auth_error('PUSH_SUBSCRIPTION_CONFLICT');
    END IF;

    IF FOUND THEN
      UPDATE push_subscriptions subscription
         SET session_id = auth_context.authorized_session_id,
             endpoint = target_endpoint,
             p256dh_key = command_input->>'p256dh',
             auth_key = command_input->>'auth',
             user_agent = command_input->>'userAgent',
             platform = command_input->>'platform',
             expiration_at = CASE
               WHEN command_input->'expirationTime' = 'null'::jsonb THEN NULL
               ELSE to_timestamp((command_input->>'expirationTime')::numeric / 1000)
             END,
             last_seen_at = clock_timestamp(),
             revoked_at = NULL,
             failure_count = 0,
             last_failure_at = NULL
       WHERE subscription.workspace_id = existing_subscription.workspace_id
         AND subscription.id = existing_subscription.id;
    ELSE
      INSERT INTO push_subscriptions(
        workspace_id, user_id, session_id, endpoint, p256dh_key, auth_key,
        user_agent, platform, expiration_at
      ) VALUES (
        auth_context.authorized_workspace_id,
        auth_context.authorized_user_id,
        auth_context.authorized_session_id,
        target_endpoint,
        command_input->>'p256dh',
        command_input->>'auth',
        command_input->>'userAgent',
        command_input->>'platform',
        CASE
          WHEN command_input->'expirationTime' = 'null'::jsonb THEN NULL
          ELSE to_timestamp((command_input->>'expirationTime')::numeric / 1000)
        END
      );
    END IF;
    response := jsonb_build_object('ok', true, 'data', jsonb_build_object('registered', true));

  ELSIF command_name = 'push.unregister' THEN
    IF NOT (command_input ? 'endpoint')
       OR command_input - 'endpoint' <> '{}'::jsonb
       OR jsonb_typeof(command_input->'endpoint') <> 'string'
       OR char_length(command_input->>'endpoint') NOT BETWEEN 32 AND 2048 THEN
      PERFORM app_private.raise_auth_error('COMMAND_INVALID');
    END IF;
    target_endpoint := command_input->>'endpoint';
    UPDATE push_subscriptions subscription
       SET revoked_at = coalesce(subscription.revoked_at, clock_timestamp())
     WHERE subscription.workspace_id = auth_context.authorized_workspace_id
       AND subscription.user_id = auth_context.authorized_user_id
       AND subscription.endpoint_hash = digest(target_endpoint, 'sha256')
       AND subscription.revoked_at IS NULL;
    GET DIAGNOSTICS updated_count = ROW_COUNT;
    UPDATE push_deliveries delivery
       SET status = 'dead',
           last_error_code = 'SUBSCRIPTION_REVOKED'
     WHERE delivery.workspace_id = auth_context.authorized_workspace_id
       AND delivery.recipient_user_id = auth_context.authorized_user_id
       AND delivery.status IN ('pending', 'processing')
       AND EXISTS (
         SELECT 1
           FROM push_subscriptions subscription
          WHERE subscription.workspace_id = delivery.workspace_id
            AND subscription.id = delivery.subscription_id
            AND subscription.endpoint_hash = digest(target_endpoint, 'sha256')
       );
    response := jsonb_build_object(
      'ok', true,
      'data', jsonb_build_object('unregistered', true, 'updatedCount', updated_count)
    );

  ELSE
    IF NOT (command_input ? 'endpoint')
       OR command_input - 'endpoint' <> '{}'::jsonb
       OR jsonb_typeof(command_input->'endpoint') <> 'string'
       OR char_length(command_input->>'endpoint') NOT BETWEEN 32 AND 2048 THEN
      PERFORM app_private.raise_auth_error('COMMAND_INVALID');
    END IF;
    target_endpoint := command_input->>'endpoint';
    IF (
      SELECT count(*)
        FROM push_deliveries delivery
       WHERE delivery.workspace_id = auth_context.authorized_workspace_id
         AND delivery.recipient_user_id = auth_context.authorized_user_id
         AND delivery.delivery_type = 'push_test'
         AND delivery.created_at > clock_timestamp() - interval '10 minutes'
    ) >= 3 THEN
      PERFORM app_private.raise_auth_error('PUSH_RATE_LIMITED');
    END IF;

    INSERT INTO push_deliveries(
      workspace_id, recipient_user_id, subscription_id, delivery_type, payload
    )
    SELECT subscription.workspace_id, subscription.user_id, subscription.id, 'push_test',
           jsonb_build_object(
             'type', 'push_test',
             'title', '班客邦測試通知',
             'body', '這是一則 Staging 測試推播。',
             'url', '/?open=notifications'
           )
      FROM push_subscriptions subscription
     WHERE subscription.workspace_id = auth_context.authorized_workspace_id
       AND subscription.user_id = auth_context.authorized_user_id
       AND subscription.session_id = auth_context.authorized_session_id
       AND subscription.endpoint_hash = digest(target_endpoint, 'sha256')
       AND subscription.revoked_at IS NULL
       AND (subscription.expiration_at IS NULL OR subscription.expiration_at > clock_timestamp());
    GET DIAGNOSTICS queued_count = ROW_COUNT;
    IF queued_count <> 1 THEN
      PERFORM app_private.raise_auth_error('PUSH_SUBSCRIPTION_NOT_FOUND');
    END IF;
    response := jsonb_build_object(
      'ok', true,
      'data', jsonb_build_object('queued', true, 'queuedCount', queued_count)
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
    auth_context.authorized_workspace_id,
    auth_context.authorized_user_id,
    command_name,
    'push_subscription',
    'self',
    request_id,
    jsonb_build_object(
      'idempotencyKey', idempotency_key,
      'updatedCount', updated_count,
      'queuedCount', queued_count
    )
  );
  RETURN response;
END
$$;

CREATE OR REPLACE FUNCTION app_private.worker_claim_push_deliveries(
  worker_id text,
  batch_size integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app_private
AS $$
DECLARE
  rows jsonb;
BEGIN
  IF worker_id !~ '^[A-Za-z0-9._:-]{8,64}$'
     OR batch_size NOT BETWEEN 1 AND 50 THEN
    PERFORM app_private.raise_auth_error('COMMAND_INVALID');
  END IF;

  UPDATE push_deliveries delivery
     SET status = 'pending',
         claimed_at = NULL,
         next_attempt_at = clock_timestamp(),
         last_error_code = 'CLAIM_TIMEOUT'
   WHERE delivery.status = 'processing'
     AND delivery.claimed_at < clock_timestamp() - interval '2 minutes'
     AND delivery.attempt_count < 3;

  UPDATE push_deliveries delivery
     SET status = 'dead',
         claimed_at = NULL,
         last_error_code = 'AUTHORIZATION_INVALID'
   WHERE delivery.status IN ('pending', 'processing')
     AND NOT EXISTS (
       SELECT 1
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
        WHERE subscription.workspace_id = delivery.workspace_id
          AND subscription.id = delivery.subscription_id
          AND subscription.user_id = delivery.recipient_user_id
          AND subscription.revoked_at IS NULL
          AND (subscription.expiration_at IS NULL OR subscription.expiration_at > clock_timestamp())
     );

  WITH candidates AS (
    SELECT delivery.workspace_id, delivery.id
      FROM push_deliveries delivery
     WHERE delivery.status = 'pending'
       AND delivery.next_attempt_at <= clock_timestamp()
       AND delivery.attempt_count < 3
     ORDER BY delivery.next_attempt_at, delivery.created_at, delivery.id
     LIMIT batch_size
     FOR UPDATE SKIP LOCKED
  ),
  claimed AS (
    UPDATE push_deliveries delivery
       SET status = 'processing',
           claimed_at = clock_timestamp(),
           attempt_count = delivery.attempt_count + 1,
           last_error_code = ''
      FROM candidates
     WHERE delivery.workspace_id = candidates.workspace_id
       AND delivery.id = candidates.id
    RETURNING delivery.*
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'id', claimed.id,
           'endpoint', subscription.endpoint,
           'p256dh', subscription.p256dh_key,
           'auth', subscription.auth_key,
           'payload', claimed.payload,
           'attempt', claimed.attempt_count
         ) ORDER BY claimed.created_at, claimed.id), '[]'::jsonb)
    INTO rows
    FROM claimed
    JOIN push_subscriptions subscription
      ON subscription.workspace_id = claimed.workspace_id
     AND subscription.id = claimed.subscription_id;

  RETURN jsonb_build_object('ok', true, 'workerId', worker_id, 'items', rows);
END
$$;

CREATE OR REPLACE FUNCTION app_private.worker_complete_push_delivery(
  delivery_id uuid,
  outcome text,
  status_code integer,
  error_code text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app_private
AS $$
DECLARE
  target push_deliveries%ROWTYPE;
  final_status text;
BEGIN
  IF outcome NOT IN ('delivered', 'retry', 'expired', 'dead')
     OR (status_code IS NOT NULL AND status_code NOT BETWEEN 100 AND 599)
     OR coalesce(error_code, '') !~ '^[A-Z0-9_]{0,64}$' THEN
    PERFORM app_private.raise_auth_error('COMMAND_INVALID');
  END IF;
  SELECT * INTO target
    FROM push_deliveries delivery
   WHERE delivery.id = delivery_id
   FOR UPDATE;
  IF NOT FOUND OR target.status <> 'processing' THEN
    PERFORM app_private.raise_auth_error('PUSH_DELIVERY_NOT_FOUND');
  END IF;

  final_status := CASE
    WHEN outcome = 'delivered' THEN 'delivered'
    WHEN outcome IN ('expired', 'dead') OR target.attempt_count >= 3 THEN 'dead'
    ELSE 'pending'
  END;
  UPDATE push_deliveries delivery
     SET status = final_status,
         delivered_at = CASE WHEN final_status = 'delivered' THEN clock_timestamp() ELSE NULL END,
         claimed_at = NULL,
         next_attempt_at = CASE
           WHEN final_status <> 'pending' THEN delivery.next_attempt_at
           WHEN target.attempt_count = 1 THEN clock_timestamp() + interval '1 minute'
           WHEN target.attempt_count = 2 THEN clock_timestamp() + interval '5 minutes'
           ELSE clock_timestamp() + interval '15 minutes'
         END,
         last_status_code = status_code,
         last_error_code = coalesce(error_code, '')
   WHERE delivery.workspace_id = target.workspace_id
     AND delivery.id = target.id;

  IF outcome = 'delivered' THEN
    UPDATE push_subscriptions subscription
       SET last_seen_at = clock_timestamp(),
           failure_count = 0,
           last_failure_at = NULL
     WHERE subscription.workspace_id = target.workspace_id
       AND subscription.id = target.subscription_id;
  ELSE
    UPDATE push_subscriptions subscription
       SET failure_count = least(subscription.failure_count + 1, 1000),
           last_failure_at = clock_timestamp(),
           revoked_at = CASE
             WHEN outcome = 'expired' THEN coalesce(subscription.revoked_at, clock_timestamp())
             ELSE subscription.revoked_at
           END
     WHERE subscription.workspace_id = target.workspace_id
       AND subscription.id = target.subscription_id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'status', final_status);
END
$$;

REVOKE ALL ON TABLE push_subscriptions, push_deliveries FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.enqueue_notification_push() FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.api_push_status(text,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.api_execute_push_command(
  text,text,text,text,jsonb,text,text,text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.worker_claim_push_deliveries(text,integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.worker_complete_push_delivery(uuid,text,integer,text) FROM PUBLIC;
