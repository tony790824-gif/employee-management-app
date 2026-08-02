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
  target_client_mode text;
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
  SELECT subscription.client_mode INTO target_client_mode
    FROM push_subscriptions subscription
   WHERE subscription.workspace_id = target.workspace_id
     AND subscription.id = target.subscription_id
   FOR UPDATE;
  IF NOT FOUND THEN
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

  IF outcome = 'expired'
     AND target.notification_id IS NOT NULL
     AND target_client_mode = 'pwa' THEN
    INSERT INTO push_deliveries(
      workspace_id, notification_id, recipient_user_id, subscription_id,
      delivery_type, payload
    )
    SELECT target.workspace_id, target.notification_id, target.recipient_user_id,
           subscription.id, target.delivery_type, target.payload
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
     WHERE subscription.workspace_id = target.workspace_id
       AND subscription.user_id = target.recipient_user_id
       AND subscription.client_mode = 'browser'
       AND subscription.revoked_at IS NULL
       AND (subscription.expiration_at IS NULL
         OR subscription.expiration_at > clock_timestamp())
       AND NOT EXISTS (
         SELECT 1
           FROM push_subscriptions preferred
           JOIN app_private.auth_sessions preferred_session
             ON preferred_session.id = preferred.session_id
            AND preferred_session.user_id = preferred.user_id
            AND preferred_session.status = 'active'
            AND preferred_session.expires_at > clock_timestamp()
          WHERE preferred.workspace_id = target.workspace_id
            AND preferred.user_id = target.recipient_user_id
            AND preferred.client_mode = 'pwa'
            AND preferred.revoked_at IS NULL
            AND (preferred.expiration_at IS NULL
              OR preferred.expiration_at > clock_timestamp())
       )
    ON CONFLICT (workspace_id, notification_id, subscription_id)
      WHERE notification_id IS NOT NULL
    DO NOTHING;
  END IF;

  RETURN jsonb_build_object('ok', true, 'status', final_status);
END
$$;

REVOKE ALL ON FUNCTION app_private.worker_complete_push_delivery(uuid,text,integer,text) FROM PUBLIC;
