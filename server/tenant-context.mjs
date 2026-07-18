import { createHmac, randomUUID } from 'node:crypto';
import { ApiError, assert } from './errors.mjs';

const WORKSPACE_PATTERN = /^ws_[a-f0-9]{32}$/;
const KID_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;

function encode(value) {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function decodeKey(value) {
  try {
    const key = Buffer.from(String(value || ''), 'base64url');
    assert(key.length >= 32, 500, 'TENANT_CONTEXT_CONFIG_INVALID', 'Tenant context signing key must contain at least 256 bits.');
    return key;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(500, 'TENANT_CONTEXT_CONFIG_INVALID', 'Tenant context signing key is invalid.');
  }
}

export function requestedWorkspace(headers) {
  const value = String(headers['x-workspace-id'] || '').trim();
  assert(WORKSPACE_PATTERN.test(value), 400, 'WORKSPACE_REQUIRED', 'A valid X-Workspace-Id header is required.');
  return value;
}

export function createTenantContextSigner({
  key,
  keyId,
  now = () => Date.now(),
  nonceFactory = randomUUID,
  assertionLifetimeSeconds = 30,
  sessionLifetimeSeconds = 8 * 60 * 60
}) {
  const secret = decodeKey(key);
  assert(KID_PATTERN.test(String(keyId || '')), 500, 'TENANT_CONTEXT_CONFIG_INVALID', 'Tenant context key ID is invalid.');
  assert(Number.isSafeInteger(assertionLifetimeSeconds) && assertionLifetimeSeconds >= 5 && assertionLifetimeSeconds <= 60,
    500, 'TENANT_CONTEXT_CONFIG_INVALID', 'Tenant context assertion lifetime is invalid.');
  assert(Number.isSafeInteger(sessionLifetimeSeconds) && sessionLifetimeSeconds >= 300 && sessionLifetimeSeconds <= 86_400,
    500, 'TENANT_CONTEXT_CONFIG_INVALID', 'Session lifetime is invalid.');

  return Object.freeze({
    keyId,
    sign({ identity, workspaceId, purpose }) {
      assert(identity && typeof identity.issuer === 'string' && typeof identity.subject === 'string',
        401, 'AUTH_CONTEXT_INVALID', 'Verified identity is required.');
      assert(typeof identity.sessionId === 'string' && identity.sessionId.length >= 8 && identity.sessionId.length <= 256,
        401, 'AUTH_CONTEXT_INVALID', 'Verified session identity is required.');
      assert(Number.isSafeInteger(identity.issuedAt) && Number.isSafeInteger(identity.expiresAt),
        401, 'AUTH_CONTEXT_INVALID', 'Verified token timestamps are required.');
      assert(WORKSPACE_PATTERN.test(String(workspaceId || '')), 400, 'WORKSPACE_REQUIRED', 'A valid workspace is required.');
      assert(['establish', 'command', 'read', 'logout'].includes(purpose),
        500, 'TENANT_CONTEXT_PURPOSE_INVALID', 'Tenant context purpose is invalid.');
      const issuedAt = Math.floor(now() / 1000);
      const payload = JSON.stringify({
        v: 1,
        purpose,
        issuer: identity.issuer,
        subject: identity.subject,
        sessionId: identity.sessionId,
        tokenId: identity.tokenId || '',
        tokenIssuedAt: identity.issuedAt,
        tokenExpiresAt: identity.expiresAt,
        workspaceId,
        issuedAt,
        expiresAt: issuedAt + assertionLifetimeSeconds,
        sessionExpiresAt: issuedAt + sessionLifetimeSeconds,
        nonce: nonceFactory()
      });
      const encodedPayload = encode(payload);
      const signature = createHmac('sha256', secret).update(encodedPayload, 'utf8').digest('base64url');
      return Object.freeze({ keyId, payload: encodedPayload, signature });
    }
  });
}
