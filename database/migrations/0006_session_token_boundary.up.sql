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
BEGIN
  SELECT * INTO auth_context
    FROM app_private.verify_tenant_context(signed_payload, signed_signature, signing_key_id, 'establish', false);
  context := convert_from(app_private.base64url_decode(signed_payload), 'UTF8')::jsonb;
  BEGIN
    token_issued_at := (context->>'tokenIssuedAt')::bigint;
  EXCEPTION WHEN OTHERS THEN
    PERFORM app_private.raise_auth_error('TENANT_CONTEXT_INVALID');
  END;
  SELECT * INTO local_session
    FROM app_private.auth_sessions AS existing_session
   WHERE existing_session.issuer = context->>'issuer'
     AND existing_session.provider_session_id = context->>'sessionId';
  IF FOUND AND (local_session.status <> 'active' OR local_session.user_id <> auth_context.authorized_user_id) THEN
    PERFORM app_private.raise_auth_error('SESSION_INVALID');
  END IF;
  IF NOT FOUND THEN
    INSERT INTO app_private.auth_sessions(
      issuer, subject, provider_session_id, user_id, valid_after, expires_at
    ) VALUES (
      context->>'issuer', context->>'subject', context->>'sessionId', auth_context.authorized_user_id,
      to_timestamp(token_issued_at), to_timestamp((context->>'sessionExpiresAt')::bigint)
    ) RETURNING * INTO local_session;
  ELSE
    UPDATE app_private.auth_sessions AS seen_session
       SET last_seen_at = clock_timestamp()
     WHERE seen_session.id = local_session.id;
  END IF;
  RETURN jsonb_build_object('ok', true, 'sessionExpiresAt', extract(epoch FROM local_session.expires_at)::bigint);
END
$$;
