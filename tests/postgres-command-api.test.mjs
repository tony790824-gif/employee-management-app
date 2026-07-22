import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { createApiServer } from '../server/app.mjs';
import { createCommandService } from '../server/commands.mjs';
import { assertApiDatabaseTarget, createPool, expectedApiDatabase } from '../server/db.mjs';
import { createOidcVerifier } from '../server/jwt-verifier.mjs';
import { createTenantContextSigner } from '../server/tenant-context.mjs';
import { validateCommand } from '../server/validation.mjs';

const serverEntry = await readFile('server/index.mjs', 'utf8');
assert.match(serverEntry, /BANK_API_BIND_HOST/);
assert.match(serverEntry, /\['127\.0\.0\.1', '0\.0\.0\.0'\]/,
  'API bind host must remain an explicit allowlist');

assert.equal(validateCommand('employees.create', {
  name: 'Synthetic employee', phone: '0912345678', hourlyRate: 200
}).leaveQuota, 8);
assert.throws(() => validateCommand('employees.create', {
  name: 'Synthetic employee', phone: '0912345678', hourlyRate: 200, workspaceId: 'attacker'
}), error => error.code === 'COMMAND_INVALID');

const workspaceId = 'ws_0123456789abcdef0123456789abcdef';
const identity = Object.freeze({
  issuer: 'https://identity.test.invalid/', subject: 'auth0|synthetic-user', sessionId: 'session-synthetic-001',
  tokenId: 'token-001', issuedAt: 1_800_000_000, expiresAt: 1_800_000_300
});
const contextSigner = createTenantContextSigner({
  key: Buffer.alloc(32, 7).toString('base64url'), keyId: 'local-test-v1',
  now: () => 1_800_000_000_000, nonceFactory: () => '00000000-0000-4000-8000-000000000001'
});
const queries = [];
const pool = {
  async query(sql, params = []) {
    queries.push({ sql, params });
    if (sql.includes('api_establish_session')) return { rows: [{ result: { ok: true, sessionExpiresAt: 1_800_028_800 } }] };
    if (sql.includes('api_logout_session')) return { rows: [{ result: { ok: true } }] };
    if (sql.includes('api_list_employees')) return { rows: [{ result: { ok: true, data: [] } }] };
    if (sql.includes('api_bootstrap')) return { rows: [{ result: { ok: true, role: 'boss', data: {} } }] };
    if (sql.includes('api_execute_command')) return { rows: [{ result: { ok: true, data: { id: 'synthetic' } } }] };
    throw new Error(`Unexpected SQL: ${sql}`);
  }
};
const service = createCommandService({
  pool, tenantContextSigner: contextSigner, idFactory: () => '00000000-0000-4000-8000-000000000002',
  clock: () => new Date('2027-01-15T08:00:00.000Z')
});
await service.establishSession({ identity, workspaceId });
await service.execute({
  identity, workspaceId, commandName: 'employees.create', idempotencyKey: 'employee-create-0001', requestId: 'request-0001',
  input: { name: 'Synthetic employee', phone: '0912345678', hourlyRate: 200 }
});
await service.listEmployees({ identity, workspaceId });
await service.bootstrap({ identity, workspaceId });
await service.logout({ identity, workspaceId });
assert.equal(queries.length, 5);
assert.ok(queries.every(item => item.sql.includes('app_private.api_')), 'API uses only controlled database functions');
assert.ok(queries.every(item => !/\b(?:FROM|INTO|UPDATE|DELETE FROM)\s+(?:employees|workspaces|workspace_members)\b/i.test(item.sql)),
  'API never directly queries tenant tables');

assert.throws(() => createPool({
  BANK_ENV: 'staging', DATABASE_MIGRATOR_URL: 'postgres://owner@direct.example/db',
  DATABASE_API_URL: 'postgres://owner@direct-pooler.example/db', DATABASE_SSL: 'require',
  BANK_STAGING_DATABASE_HOST: 'direct.example'
}), /API.*Migration/);
assert.throws(() => createPool({
  BANK_ENV: 'production', DATABASE_API_URL: 'postgres://api@production-pooler.example/neondb', DATABASE_SSL: 'require'
}), /BANK_PRODUCTION_DATABASE_HOST/);
assert.throws(() => createPool({
  BANK_ENV: 'production', DATABASE_API_URL: 'postgres://api@other-pooler.example/neondb', DATABASE_SSL: 'require',
  BANK_PRODUCTION_DATABASE_HOST: 'production.example'
}), /approved Production PostgreSQL host/);
assert.throws(() => createPool({
  BANK_ENV: 'production', DATABASE_MIGRATOR_URL: 'postgres://owner@production.example/other',
  DATABASE_API_URL: 'postgres://api@production-pooler.example/neondb', DATABASE_SSL: 'require',
  BANK_PRODUCTION_DATABASE_HOST: 'production.example'
}), /same approved database/);
assert.throws(() => createPool({
  BANK_ENV: 'production', DATABASE_MIGRATOR_URL: 'postgres://owner@production.example/other',
  DATABASE_API_URL: 'postgres://api@production-pooler.example/other', DATABASE_SSL: 'require',
  BANK_PRODUCTION_DATABASE_HOST: 'production.example'
}), /explicitly target neondb/);
const productionPool = createPool({
  BANK_ENV: 'production', DATABASE_MIGRATOR_URL: 'postgres://owner@production.example/neondb',
  DATABASE_API_URL: 'postgres://api@production-pooler.example/neondb', DATABASE_SSL: 'require',
  BANK_PRODUCTION_DATABASE_HOST: 'production.example'
});
await productionPool.end();
assert.equal(expectedApiDatabase({
  BANK_ENV: 'production', DATABASE_API_URL: 'postgres://api@production.example/neondb'
}), 'neondb');
assert.equal(await assertApiDatabaseTarget({
  query: async () => ({ rows: [{ name: 'neondb' }] })
}, {
  BANK_ENV: 'production', DATABASE_API_URL: 'postgres://api@production.example/neondb'
}), 'neondb');
await assert.rejects(() => assertApiDatabaseTarget({
  query: async () => ({ rows: [{ name: 'postgres' }] })
}, {
  BANK_ENV: 'production', DATABASE_API_URL: 'postgres://api@production.example/neondb'
}), /startup target verification failed/);

function keyPair(kid) {
  const pair = generateKeyPairSync('rsa', { modulusLength: 2048 });
  return { ...pair, kid, jwk: { ...pair.publicKey.export({ format: 'jwk' }), kid, use: 'sig', alg: 'RS256' } };
}
function token(pair, claims) {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const header = encode({ alg: 'RS256', typ: 'JWT', kid: pair.kid });
  const payload = encode(claims);
  const signature = sign('RSA-SHA256', Buffer.from(`${header}.${payload}`), pair.privateKey).toString('base64url');
  return `${header}.${payload}.${signature}`;
}
const first = keyPair('key-1');
const second = keyPair('key-2');
const unknown = keyPair('unknown-key');
let published = [first.jwk];
let fetches = 0;
const fetcher = async () => ({
  ok: true,
  headers: { get: name => name.toLowerCase() === 'cache-control' ? 'public, max-age=300' : null },
  async json() { fetches += 1; return { keys: published }; }
});
const nowSeconds = 1_800_000_000;
const verifier = createOidcVerifier({
  issuer: identity.issuer, audience: 'banke-api', jwksUri: 'https://identity.test.invalid/.well-known/jwks.json',
  fetcher, now: () => nowSeconds * 1000
});
const validClaims = {
  iss: identity.issuer, aud: 'banke-api', sub: identity.subject,
  'https://banke.tw/session_id': identity.sessionId, jti: identity.tokenId,
  iat: nowSeconds, nbf: nowSeconds - 1, exp: nowSeconds + 300
};
assert.deepEqual(await verifier(token(first, validClaims)), identity);
assert.equal(fetches, 1, 'JWKS is cached');
assert.deepEqual(await verifier(token(first, validClaims)), identity);
assert.equal(fetches, 1, 'cached key avoids a second fetch');
await assert.rejects(() => verifier(token(first, { ...validClaims, iss: 'https://evil.invalid/' })), error => error.code === 'TOKEN_ISSUER_INVALID');
await assert.rejects(() => verifier(token(first, { ...validClaims, aud: 'other-api' })), error => error.code === 'TOKEN_AUDIENCE_INVALID');
await assert.rejects(() => verifier(token(first, { ...validClaims, exp: nowSeconds - 31 })), error => error.code === 'TOKEN_EXPIRED');
await assert.rejects(() => verifier(token(first, { ...validClaims, nbf: nowSeconds + 31 })), error => error.code === 'TOKEN_NOT_ACTIVE');
await assert.rejects(() => verifier(token(first, { ...validClaims, iat: nowSeconds + 31 })), error => error.code === 'TOKEN_INVALID');
const claimsWithoutSession = { ...validClaims };
delete claimsWithoutSession['https://banke.tw/session_id'];
await assert.rejects(() => verifier(token(first, claimsWithoutSession)), error => error.code === 'TOKEN_SESSION_INVALID');
await assert.rejects(() => verifier(token(first, { ...validClaims, workspace_id: workspaceId })), error => error.code === 'TOKEN_TENANT_CLAIM_REJECTED');

assert.throws(() => createOidcVerifier({
  issuer: identity.issuer, audience: 'banke-api', jwksUri: 'https://untrusted.invalid/.well-known/jwks.json'
}), error => error.code === 'AUTH_CONFIG_INVALID');

published = [first.jwk, second.jwk];
assert.equal((await verifier(token(second, validClaims))).subject, identity.subject, 'unknown kid triggers one safe refresh for rotation');
await assert.rejects(() => verifier(token(unknown, validClaims)), error => error.code === 'TOKEN_KEY_UNKNOWN');

const api = createApiServer({
  pool: { query: async () => ({ rows: [{ '?column?': 1 }] }) },
  allowedOrigins: ['https://staging.example'],
  verifyAccessToken: async () => identity,
  commandService: {
    establishSession: async () => ({ ok: true }), logout: async () => ({ ok: true }),
    execute: async ({ input }) => ({ ok: true, data: input }), listEmployees: async () => ({ ok: true, data: [] }),
    bootstrap: async () => ({ ok: true, role: 'boss', data: { employees: [] } })
  }
});
api.listen(0, '127.0.0.1');
await once(api, 'listening');
const base = `http://127.0.0.1:${api.address().port}`;
try {
  const commonHeaders = {
    Origin: 'https://staging.example', Authorization: 'Bearer a.b.c', 'X-Workspace-Id': workspaceId
  };
  const sessionResponse = await fetch(`${base}/v1/auth/session`, { method: 'POST', headers: commonHeaders });
  assert.equal(sessionResponse.status, 201);
  const bootstrapResponse = await fetch(`${base}/v1/bootstrap`, { headers: commonHeaders });
  assert.equal(bootstrapResponse.status, 200);
  assert.equal((await bootstrapResponse.json()).role, 'boss');
  const missingWorkspace = await fetch(`${base}/v1/employees`, { headers: {
    Origin: 'https://staging.example', Authorization: 'Bearer a.b.c'
  } });
  assert.equal(missingWorkspace.status, 400);
  assert.equal((await missingWorkspace.json()).code, 'WORKSPACE_REQUIRED');

  const exactPrefix = '{"value":"';
  const exactSuffix = '"}';
  const exactBody = exactPrefix + 'a'.repeat(1_048_576 - Buffer.byteLength(exactPrefix + exactSuffix)) + exactSuffix;
  const accepted = await fetch(`${base}/v1/commands/attendance.clock-in`, {
    method: 'POST', headers: { ...commonHeaders, 'Content-Type': 'application/json', 'Idempotency-Key': 'clock-in-0001' }, body: exactBody
  });
  assert.equal(accepted.status, 201);
  const unicodeBody = JSON.stringify({ value: '測'.repeat(349_524) });
  const rejected = await fetch(`${base}/v1/commands/attendance.clock-in`, {
    method: 'POST', headers: { ...commonHeaders, 'Content-Type': 'application/json', 'Idempotency-Key': 'clock-in-0002' }, body: unicodeBody
  });
  assert.equal(rejected.status, 413);
  assert.equal((await rejected.json()).code, 'REQUEST_PAYLOAD_TOO_LARGE');
} finally {
  api.close();
  await once(api, 'close');
}

console.log('PostgreSQL OIDC, signed tenant context, controlled function and API boundary tests passed');
