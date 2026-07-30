CREATE OR REPLACE FUNCTION app_private.api_establish_session(
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
  context jsonb;
  local_session app_private.auth_sessions%ROWTYPE;
  token_issued_at bigint;
  requested_expires_at bigint;
  established_at timestamptz := clock_timestamp();
  session_was_expired boolean;
BEGIN
  SELECT * INTO auth_context
    FROM app_private.verify_tenant_context(
      signed_payload, signed_signature, signing_key_id, 'establish', false
    );
  context := convert_from(app_private.base64url_decode(signed_payload), 'UTF8')::jsonb;
  BEGIN
    token_issued_at := (context->>'tokenIssuedAt')::bigint;
    requested_expires_at := (context->>'sessionExpiresAt')::bigint;
  EXCEPTION WHEN OTHERS THEN
    PERFORM app_private.raise_auth_error('TENANT_CONTEXT_INVALID');
  END;

  PERFORM pg_advisory_xact_lock(
    hashtextextended((context->>'issuer') || E'\n' || (context->>'sessionId'), 0)
  );
  SELECT * INTO local_session
    FROM app_private.auth_sessions AS existing_session
   WHERE existing_session.issuer = context->>'issuer'
     AND existing_session.provider_session_id = context->>'sessionId'
   FOR UPDATE;

  IF FOUND AND (
       local_session.status <> 'active'
       OR local_session.user_id <> auth_context.authorized_user_id
       OR local_session.subject <> context->>'subject'
       OR local_session.valid_after > to_timestamp(token_issued_at)
     ) THEN
    PERFORM app_private.raise_auth_error('SESSION_INVALID');
  END IF;

  IF NOT FOUND THEN
    INSERT INTO app_private.auth_sessions(
      issuer, subject, provider_session_id, user_id, valid_after, expires_at
    ) VALUES (
      context->>'issuer',
      context->>'subject',
      context->>'sessionId',
      auth_context.authorized_user_id,
      to_timestamp(token_issued_at),
      to_timestamp(requested_expires_at)
    )
    RETURNING * INTO local_session;
  ELSE
    session_was_expired := local_session.expires_at <= established_at;
    IF session_was_expired
       AND to_timestamp(token_issued_at) < local_session.expires_at THEN
      PERFORM app_private.raise_auth_error('SESSION_INVALID');
    END IF;

    UPDATE app_private.auth_sessions AS renewed_session
       SET valid_after = CASE
             WHEN session_was_expired THEN to_timestamp(token_issued_at)
             ELSE renewed_session.valid_after
           END,
           expires_at = greatest(
             renewed_session.expires_at,
             to_timestamp(requested_expires_at)
           ),
           last_seen_at = established_at
     WHERE renewed_session.id = local_session.id
    RETURNING * INTO local_session;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'sessionExpiresAt', extract(epoch FROM local_session.expires_at)::bigint
  );
END
$$;

REVOKE ALL ON FUNCTION app_private.api_establish_session(text,text,text) FROM PUBLIC;
