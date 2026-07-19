CREATE TABLE app_private.security_event_inbox (
  environment text NOT NULL CHECK (environment IN ('staging', 'production')),
  issuer text NOT NULL CHECK (issuer ~ '^https://'),
  event_id text NOT NULL CHECK (event_id ~ '^[A-Za-z0-9._:-]{8,160}$'),
  event_type text NOT NULL CHECK (event_type ~ '^[A-Za-z0-9._:-]{1,120}$'),
  action text NOT NULL CHECK (action IN ('compromise_session', 'revoke_session', 'revoke_user_sessions', 'ignore')),
  subject text CHECK (subject IS NULL OR (char_length(subject) BETWEEN 3 AND 256 AND subject !~ '[[:space:]]')),
  provider_session_id text CHECK (provider_session_id IS NULL OR (char_length(provider_session_id) BETWEEN 8 AND 256 AND provider_session_id !~ '[[:space:]]')),
  occurred_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  processed_at timestamptz,
  payload_sha256 text NOT NULL CHECK (payload_sha256 ~ '^[a-f0-9]{64}$'),
  status text NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'processed', 'ignored', 'unmatched')),
  sessions_affected integer NOT NULL DEFAULT 0 CHECK (sessions_affected >= 0),
  PRIMARY KEY (environment, issuer, event_id)
);

CREATE INDEX security_event_inbox_received_idx
  ON app_private.security_event_inbox (received_at DESC);
CREATE INDEX security_event_inbox_subject_idx
  ON app_private.security_event_inbox (issuer, subject, received_at DESC)
  WHERE subject IS NOT NULL;

CREATE OR REPLACE FUNCTION app_private.ingest_auth0_security_event(
  event_environment text,
  event_issuer text,
  event_id text,
  event_type text,
  event_action text,
  event_subject text,
  event_provider_session_id text,
  event_occurred_at timestamptz,
  event_payload_sha256 text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, app_private
AS $$
DECLARE
  inserted boolean;
  affected integer := 0;
  final_status text;
BEGIN
  IF event_environment NOT IN ('staging', 'production')
     OR event_issuer !~ '^https://'
     OR event_id !~ '^[A-Za-z0-9._:-]{8,160}$'
     OR event_type !~ '^[A-Za-z0-9._:-]{1,120}$'
     OR event_action NOT IN ('compromise_session', 'revoke_session', 'revoke_user_sessions', 'ignore')
     OR event_payload_sha256 !~ '^[a-f0-9]{64}$'
     OR event_occurred_at < clock_timestamp() - interval '25 hours'
     OR event_occurred_at > clock_timestamp() + interval '2 minutes'
     OR (event_subject IS NOT NULL AND (char_length(event_subject) NOT BETWEEN 3 AND 256 OR event_subject ~ '[[:space:]]'))
     OR (event_provider_session_id IS NOT NULL AND (char_length(event_provider_session_id) NOT BETWEEN 8 AND 256 OR event_provider_session_id ~ '[[:space:]]'))
     OR (event_action <> 'ignore' AND event_subject IS NULL AND event_provider_session_id IS NULL)
     OR (event_action = 'revoke_user_sessions' AND event_subject IS NULL) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SECURITY_EVENT_INVALID';
  END IF;

  INSERT INTO app_private.security_event_inbox(
    environment, issuer, event_id, event_type, action, subject,
    provider_session_id, occurred_at, payload_sha256
  ) VALUES (
    event_environment, event_issuer, event_id, event_type, event_action, event_subject,
    event_provider_session_id, event_occurred_at, event_payload_sha256
  ) ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS affected = ROW_COUNT;
  inserted := affected = 1;
  IF NOT inserted THEN
    SELECT inbox.status, inbox.sessions_affected
      INTO final_status, affected
      FROM app_private.security_event_inbox AS inbox
     WHERE inbox.environment = event_environment
       AND inbox.issuer = event_issuer
       AND inbox.event_id = event_id;
    RETURN jsonb_build_object('ok', true, 'duplicate', true, 'status', final_status, 'sessionsAffected', affected);
  END IF;

  affected := 0;
  IF event_action = 'compromise_session' THEN
    UPDATE app_private.auth_sessions AS session
       SET status = 'compromised', revoked_at = coalesce(session.revoked_at, clock_timestamp()), revoke_reason = 'auth0_refresh_reuse'
     WHERE session.issuer = event_issuer
       AND session.status = 'active'
       AND (event_subject IS NULL OR session.subject = event_subject)
       AND (event_provider_session_id IS NULL OR session.provider_session_id = event_provider_session_id);
    GET DIAGNOSTICS affected = ROW_COUNT;
  ELSIF event_action IN ('revoke_session', 'revoke_user_sessions') THEN
    UPDATE app_private.auth_sessions AS session
       SET status = 'revoked', revoked_at = coalesce(session.revoked_at, clock_timestamp()), revoke_reason =
         CASE WHEN event_action = 'revoke_user_sessions' THEN 'auth0_account_disabled' ELSE 'auth0_refresh_revoked' END
     WHERE session.issuer = event_issuer
       AND session.status = 'active'
       AND (event_subject IS NULL OR session.subject = event_subject)
       AND (event_action = 'revoke_user_sessions' OR event_provider_session_id IS NULL OR session.provider_session_id = event_provider_session_id);
    GET DIAGNOSTICS affected = ROW_COUNT;
  END IF;

  final_status := CASE
    WHEN event_action = 'ignore' THEN 'ignored'
    WHEN affected = 0 THEN 'unmatched'
    ELSE 'processed'
  END;
  UPDATE app_private.security_event_inbox AS inbox
     SET status = final_status, processed_at = clock_timestamp(), sessions_affected = affected
   WHERE inbox.environment = event_environment
     AND inbox.issuer = event_issuer
     AND inbox.event_id = event_id;
  RETURN jsonb_build_object('ok', true, 'duplicate', false, 'status', final_status, 'sessionsAffected', affected);
END
$$;

REVOKE ALL ON TABLE app_private.security_event_inbox FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.ingest_auth0_security_event(text,text,text,text,text,text,text,timestamptz,text) FROM PUBLIC;
