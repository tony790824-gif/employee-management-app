import { createPublicKey, verify } from 'node:crypto';
import { ApiError, assert } from './errors.mjs';

function decodeJson(value, label) {
  try {
    return JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
  } catch {
    throw new ApiError(401, 'TOKEN_INVALID', `${label} 格式不正確。`);
  }
}

function audienceMatches(value, expected) {
  return Array.isArray(value) ? value.includes(expected) : value === expected;
}

export function createJwtVerifier({ publicKeyPem, issuer, audience, clockToleranceSeconds = 30, now = () => Date.now() }) {
  assert(typeof publicKeyPem === 'string' && publicKeyPem.includes('PUBLIC KEY'), 500, 'AUTH_CONFIG_INVALID', 'JWT public key 尚未設定。');
  assert(typeof issuer === 'string' && issuer.length > 0, 500, 'AUTH_CONFIG_INVALID', 'JWT issuer 尚未設定。');
  assert(typeof audience === 'string' && audience.length > 0, 500, 'AUTH_CONFIG_INVALID', 'JWT audience 尚未設定。');
  const publicKey = createPublicKey(publicKeyPem);
  return token => {
    assert(typeof token === 'string' && token.length <= 8192, 401, 'TOKEN_INVALID', 'Access token 格式不正確。');
    const parts = token.split('.');
    assert(parts.length === 3, 401, 'TOKEN_INVALID', 'Access token 格式不正確。');
    const [encodedHeader, encodedPayload, encodedSignature] = parts;
    const header = decodeJson(encodedHeader, 'JWT header');
    const claims = decodeJson(encodedPayload, 'JWT payload');
    assert(header.alg === 'RS256' && header.typ === 'JWT', 401, 'TOKEN_INVALID', 'JWT 演算法不允許。');
    let signature;
    try { signature = Buffer.from(encodedSignature, 'base64url'); }
    catch { throw new ApiError(401, 'TOKEN_INVALID', 'JWT signature 格式不正確。'); }
    const validSignature = verify('RSA-SHA256', Buffer.from(`${encodedHeader}.${encodedPayload}`), publicKey, signature);
    assert(validSignature, 401, 'TOKEN_INVALID', 'Access token 簽章無效。');
    const timestamp = Math.floor(now() / 1000);
    assert(claims.iss === issuer && audienceMatches(claims.aud, audience), 401, 'TOKEN_INVALID', 'Access token 發行者或受眾不正確。');
    assert(Number.isSafeInteger(claims.exp) && claims.exp + clockToleranceSeconds >= timestamp, 401, 'TOKEN_EXPIRED', 'Access token 已過期。');
    assert(claims.nbf === undefined || (Number.isSafeInteger(claims.nbf) && claims.nbf <= timestamp + clockToleranceSeconds), 401, 'TOKEN_INVALID', 'Access token 尚未生效。');
    assert(typeof claims.sub === 'string' && typeof claims.workspace_id === 'string', 401, 'TOKEN_INVALID', 'Access token 缺少必要 claims。');
    return Object.freeze({ userId: claims.sub, workspaceId: claims.workspace_id, tokenId: claims.jti || '' });
  };
}

export function bearerToken(headers) {
  const value = String(headers.authorization || '');
  const match = /^Bearer ([A-Za-z0-9._~-]+)$/.exec(value);
  if (!match) throw new ApiError(401, 'TOKEN_REQUIRED', '需要 Bearer access token。');
  return match[1];
}
