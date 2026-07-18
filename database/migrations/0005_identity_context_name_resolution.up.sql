CREATE OR REPLACE FUNCTION app_private.verify_tenant_context(
  signed_payload text,
  signed_signature text,
  signing_key_id text,
  expected_purpose text,
  require_session boolean
)
RETURNS TABLE (
  authorized_user_id uuid,
  authorized_workspace_id text,
  authorized_role text,
  authorized_employee_id text,
  authorized_session_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app_private
AS $$
DECLARE
  context jsonb;
  context_key app_private.tenant_context_keys%ROWTYPE;
  identity app_private.identity_principals%ROWTYPE;
  local_session app_private.auth_sessions%ROWTYPE;
  member workspace_members%ROWTYPE;
  workspace_status text;
  user_status text;
  now_epoch bigint := extract(epoch FROM clock_timestamp())::bigint;
  context_issued_at bigint;
  context_expires_at bigint;
  token_issued_at bigint;
  token_expires_at bigint;
  context_session_expires_at bigint;
  context_nonce uuid;
  expected_signature bytea;
  received_signature bytea;
BEGIN
  IF char_length(signed_payload) NOT BETWEEN 16 AND 8192
     OR char_length(signed_signature) NOT BETWEEN 40 AND 64 THEN
    PERFORM app_private.raise_auth_error('TENANT_CONTEXT_INVALID');
  END IF;
  SELECT * INTO context_key
    FROM app_private.tenant_context_keys AS signing_key
   WHERE signing_key.key_id = signing_key_id
     AND signing_key.status = 'active'
     AND signing_key.not_before <= clock_timestamp()
     AND signing_key.expires_at > clock_timestamp();
  IF NOT FOUND THEN PERFORM app_private.raise_auth_error('TENANT_CONTEXT_KEY_INVALID'); END IF;

  BEGIN
    context := convert_from(app_private.base64url_decode(signed_payload), 'UTF8')::jsonb;
    received_signature := app_private.base64url_decode(signed_signature);
  EXCEPTION WHEN OTHERS THEN
    PERFORM app_private.raise_auth_error('TENANT_CONTEXT_INVALID');
  END;
  expected_signature := hmac(convert_to(signed_payload, 'UTF8'), context_key.secret, 'sha256');
  IF octet_length(received_signature) <> 32 OR received_signature <> expected_signature THEN
    PERFORM app_private.raise_auth_error('TENANT_CONTEXT_SIGNATURE_INVALID');
  END IF;
  IF context->>'v' <> '1' OR context->>'purpose' <> expected_purpose
     OR context->>'issuer' IS NULL OR context->>'subject' IS NULL
     OR context->>'sessionId' IS NULL OR context->>'workspaceId' IS NULL
     OR context->>'nonce' IS NULL THEN
    PERFORM app_private.raise_auth_error('TENANT_CONTEXT_INVALID');
  END IF;
  BEGIN
    context_issued_at := (context->>'issuedAt')::bigint;
    context_expires_at := (context->>'expiresAt')::bigint;
    token_issued_at := (context->>'tokenIssuedAt')::bigint;
    token_expires_at := (context->>'tokenExpiresAt')::bigint;
    context_session_expires_at := (context->>'sessionExpiresAt')::bigint;
    context_nonce := (context->>'nonce')::uuid;
  EXCEPTION WHEN OTHERS THEN
    PERFORM app_private.raise_auth_error('TENANT_CONTEXT_INVALID');
  END;
  IF context_issued_at < now_epoch - 30 OR context_issued_at > now_epoch + 30
     OR context_expires_at < now_epoch OR context_expires_at > now_epoch + 60
     OR token_issued_at > now_epoch + 30 OR token_expires_at < now_epoch - 30
     OR context_session_expires_at <= now_epoch OR context_session_expires_at > now_epoch + 86400 THEN
    PERFORM app_private.raise_auth_error('TENANT_CONTEXT_EXPIRED');
  END IF;
  IF context->>'workspaceId' !~ '^ws_[a-f0-9]{32}$' THEN
    PERFORM app_private.raise_auth_error('WORKSPACE_ACCESS_DENIED');
  END IF;

  DELETE FROM app_private.tenant_context_nonces AS expired_nonce
   WHERE expired_nonce.expires_at < clock_timestamp();
  BEGIN
    INSERT INTO app_private.tenant_context_nonces(nonce, expires_at)
    VALUES (context_nonce, to_timestamp(context_expires_at));
  EXCEPTION WHEN unique_violation THEN
    PERFORM app_private.raise_auth_error('TENANT_CONTEXT_REPLAYED');
  END;

  SELECT * INTO identity
    FROM app_private.identity_principals AS principal
   WHERE principal.issuer = context->>'issuer'
     AND principal.subject = context->>'subject'
     AND principal.status = 'active';
  IF NOT FOUND THEN PERFORM app_private.raise_auth_error('IDENTITY_ACCESS_DENIED'); END IF;
  SELECT account.status INTO user_status FROM users AS account WHERE account.id = identity.user_id;
  IF user_status IS DISTINCT FROM 'active' THEN PERFORM app_private.raise_auth_error('IDENTITY_ACCESS_DENIED'); END IF;

  PERFORM set_config('app.current_workspace_id', context->>'workspaceId', true);
  PERFORM set_config('app.current_user_id', identity.user_id::text, true);
  SELECT tenant.status INTO workspace_status FROM workspaces AS tenant WHERE tenant.id = context->>'workspaceId';
  SELECT * INTO member
    FROM workspace_members AS membership
   WHERE membership.workspace_id = context->>'workspaceId'
     AND membership.user_id = identity.user_id
     AND membership.status = 'active'
     AND membership.auth_status = 'active';
  IF workspace_status IS DISTINCT FROM 'active' OR NOT FOUND THEN
    PERFORM app_private.raise_auth_error('WORKSPACE_ACCESS_DENIED');
  END IF;
  PERFORM set_config('app.current_role', member.role, true);

  IF require_session THEN
    SELECT * INTO local_session
      FROM app_private.auth_sessions AS active_session
     WHERE active_session.issuer = context->>'issuer'
       AND active_session.provider_session_id = context->>'sessionId'
       AND active_session.user_id = identity.user_id;
    IF NOT FOUND OR local_session.status <> 'active'
       OR local_session.expires_at <= clock_timestamp()
       OR local_session.valid_after > to_timestamp(token_issued_at) THEN
      PERFORM app_private.raise_auth_error('SESSION_INVALID');
    END IF;
    UPDATE app_private.auth_sessions AS seen_session
       SET last_seen_at = clock_timestamp()
     WHERE seen_session.id = local_session.id;
    UPDATE app_private.tenant_context_nonces AS used_nonce
       SET session_id = local_session.id
     WHERE used_nonce.nonce = context_nonce;
  END IF;

  RETURN QUERY SELECT identity.user_id, context->>'workspaceId', member.role, member.employee_id, local_session.id;
END
$$;
