import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import {
  createApiServer,
  stagingAuthorizationDiagnostic,
  stagingCommandDiagnostic
} from '../server/app.mjs';
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
assert.deepEqual(validateCommand('schedule-leave-requests.submit', {
  month: '2026-08',
  dates: ['2026-08-02', '2026-08-09']
}), { month: '2026-08', dates: ['2026-08-02', '2026-08-09'] });
assert.throws(() => validateCommand('schedule-leave-requests.submit', {
  month: '2026-08',
  dates: ['2026-08-02', '2026-08-02']
}), error => error.code === 'COMMAND_INVALID');
assert.deepEqual(validateCommand('leave-requests.submit', {
  startDate: '2026-08-12',
  endDate: '2026-08-13',
  leaveType: 'Personal',
  reason: 'Synthetic reason'
}), {
  startDate: '2026-08-12',
  endDate: '2026-08-13',
  leaveType: 'Personal',
  reason: 'Synthetic reason'
});
assert.throws(() => validateCommand('leave-requests.submit', {
  startDate: '2026-08-13',
  endDate: '2026-08-12',
  leaveType: 'Personal',
  reason: 'Synthetic reason'
}), error => error.code === 'COMMAND_INVALID');
assert.deepEqual(validateCommand('time-off-requests.approve', {
  requestId: '00000000-0000-4000-8000-000000000010',
  baseRevision: 0
}), {
  requestId: '00000000-0000-4000-8000-000000000010',
  baseRevision: 0,
  reviewNote: ''
});
assert.deepEqual(validateCommand('notifications.mark-read', {
  notificationId: '00000000-0000-4000-8000-000000000011',
  baseRevision: 2
}), {
  notificationId: '00000000-0000-4000-8000-000000000011',
  baseRevision: 2
});
assert.deepEqual(validateCommand('notifications.mark-all-read', {}), {});
assert.throws(() => validateCommand('notifications.mark-read', {
  notificationId: 'not-a-notification',
  baseRevision: 0
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
const originalWarn = console.warn;
const diagnosticLines = [];
console.warn = line => diagnosticLines.push(String(line));
try {
  assert.equal(stagingAuthorizationDiagnostic({
    environment: 'production',
    requestId: 'request-production-0001',
    route: '/v1/bootstrap',
    code: 'WORKSPACE_ACCESS_DENIED'
  }), null, 'Production must not emit Staging authorization diagnostics');
  const diagnostic = stagingAuthorizationDiagnostic({
    environment: 'staging',
    requestId: 'request-staging-0001',
    route: '/v1/bootstrap',
    code: 'WORKSPACE_ACCESS_DENIED'
  });
  assert.equal(diagnostic.code, 'WORKSPACE_ACCESS_DENIED');
  assert.equal(diagnostic.identityIdentification, 'resolved');
  assert.equal(diagnostic.workspaceMembership, 'denied');
  assert.equal(diagnostic.session, 'not_evaluated');
  assert.equal(diagnosticLines.length, 1);
  assert.doesNotMatch(diagnosticLines[0], /bearer|cookie|secret|password|access.?token|refresh.?token/i,
    'Staging diagnostic must not include credentials or token material');
  assert.equal(stagingCommandDiagnostic({
    environment: 'production',
    requestId: 'request-production-0002',
    status: 403,
    code: 'COMMAND_FORBIDDEN',
    commandName: 'shifts.create'
  }), null, 'Production must not emit Staging command diagnostics');
  const commandDiagnostic = stagingCommandDiagnostic({
    environment: 'staging',
    requestId: 'request-staging-0002',
    status: 403,
    code: 'COMMAND_FORBIDDEN',
    commandName: 'shifts.create'
  });
  assert.deepEqual(
    Object.keys(commandDiagnostic).sort(),
    ['code', 'commandName', 'requestId', 'status'],
    'Staging command diagnostics must contain only approved fields'
  );
  assert.deepEqual(commandDiagnostic, {
    requestId: 'request-staging-0002',
    status: 403,
    code: 'COMMAND_FORBIDDEN',
    commandName: 'shifts.create'
  });
  assert.doesNotMatch(diagnosticLines.at(-1), /bearer|cookie|secret|password|access.?token|refresh.?token|email|payload/i,
    'Staging command diagnostic must not include credentials, personal data or payloads');
} finally {
  console.warn = originalWarn;
}
const queries = [];
let databaseBootstrap = {
  ok: true,
  workspaceId,
  role: 'boss',
  employeeId: null,
  currentUser: { displayName: 'Synthetic Manager', role: 'boss', employeeId: null, workspaceId },
  data: {
    workspace: { id: workspaceId },
    employees: [],
    shifts: [],
    attendance: [],
    leaves: {},
    sync: { revision: 0, schemaVersion: 1 }
  }
};
const databaseTimeOff = {
  ok: true,
  workspaceId,
  role: 'boss',
  ownRequests: [],
  pendingReview: [],
  processed: [],
  approvedSchedule: [],
  approvedLeaveCoverage: []
};
let databaseNotificationRevision = {
  count: 0,
  unreadCount: 0,
  revisionTotal: 0,
  latestCreatedAt: null
};
const databaseNotifications = {
  ok: true,
  workspaceId,
  items: [],
  unreadCount: 0
};
let notificationSchemaAvailable = true;
const pool = {
  async query(sql, params = []) {
    queries.push({ sql, params });
    if (sql.includes('api_establish_session')) return { rows: [{ result: { ok: true, sessionExpiresAt: 1_800_028_800 } }] };
    if (sql.includes('api_logout_session')) return { rows: [{ result: { ok: true } }] };
    if (sql.includes('api_list_employees')) return { rows: [{ result: { ok: true, data: [] } }] };
    if (sql.includes('api_bootstrap')) return { rows: [{ result: structuredClone(databaseBootstrap) }] };
    if (sql.includes('api_list_time_off_requests')) return { rows: [{ result: structuredClone(databaseTimeOff) }] };
    if (sql.includes('api_notification_revision')) {
      if (!notificationSchemaAvailable) throw Object.assign(new Error('undefined function'), { code: '42883' });
      return { rows: [{ result: structuredClone(databaseNotificationRevision) }] };
    }
    if (sql.includes('api_list_notifications')) {
      if (!notificationSchemaAvailable) throw Object.assign(new Error('undefined function'), { code: '42883' });
      return { rows: [{ result: structuredClone(databaseNotifications) }] };
    }
    if (sql.includes('api_execute_notification_command')) {
      if (!notificationSchemaAvailable) throw Object.assign(new Error('undefined function'), { code: '42883' });
      return { rows: [{ result: { ok: true, data: { updatedCount: 1 } } }] };
    }
    if (sql.includes('api_execute_time_off_command')) return { rows: [{ result: { ok: true, data: { id: 'synthetic-time-off' } } }] };
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
const firstBootstrap = await service.bootstrap({ identity, workspaceId });
const secondBootstrap = await service.bootstrap({ identity, workspaceId });
assert.equal(Number.isSafeInteger(firstBootstrap.data.sync.revision), true,
  'bootstrap must expose a server-derived safe integer revision');
assert.equal(secondBootstrap.data.sync.revision, firstBootstrap.data.sync.revision,
  'identical canonical bootstrap content must keep the same revision');
databaseBootstrap.data.employees.push({ id: 'employee-a', name: 'Synthetic employee' });
const changedBootstrap = await service.bootstrap({ identity, workspaceId });
assert.notEqual(changedBootstrap.data.sync.revision, firstBootstrap.data.sync.revision,
  'visible bootstrap data changes must change the server-derived revision');
databaseTimeOff.pendingReview.push({
  id: 'request-a',
  employeeId: 'employee-a',
  requestKind: 'ad_hoc_leave',
  status: 'pending',
  dates: ['2026-08-03']
});
const changedTimeOffRevision = await service.bootstrapRevision({ identity, workspaceId });
assert.notEqual(changedTimeOffRevision.revision, changedBootstrap.data.sync.revision,
  'role-visible time-off changes must change the unified revision');
databaseBootstrap.data.leaves['employee-a-2026-08'] = ['2026-08-08'];
const changedDirectLeaveRevision = await service.bootstrapRevision({ identity, workspaceId });
assert.notEqual(changedDirectLeaveRevision.revision, changedTimeOffRevision.revision,
  'a boss direct leave change must increase the role-visible bootstrap revision');
databaseNotificationRevision = {
  count: 1,
  unreadCount: 1,
  revisionTotal: 0,
  latestCreatedAt: '2026-08-01T00:00:00.000Z'
};
const changedNotificationRevision = await service.bootstrapRevision({ identity, workspaceId });
assert.notEqual(changedNotificationRevision.revision, changedDirectLeaveRevision.revision,
  'a recipient-visible notification must change the unified bootstrap revision');
await service.listTimeOffRequests({ identity, workspaceId });
await service.listNotifications({ identity, workspaceId });
notificationSchemaAvailable = false;
const bootstrapWithoutNotificationSchema = await service.bootstrap({ identity, workspaceId });
assert.equal(bootstrapWithoutNotificationSchema.ok, true,
  'the accepted bootstrap remains available before the additive notification migration is applied');
assert.deepEqual(await service.listNotifications({ identity, workspaceId }), {
  ok: true,
  workspaceId,
  items: [],
  unreadCount: 0,
  available: false
});
await assert.rejects(service.execute({
  identity,
  workspaceId,
  commandName: 'notifications.mark-all-read',
  idempotencyKey: 'notification-unavailable-0001',
  requestId: 'request-unavailable-0001',
  input: {}
}), error => error.code === 'NOTIFICATION_CENTER_UNAVAILABLE' && error.status === 503);
notificationSchemaAvailable = true;
await service.execute({
  identity,
  workspaceId,
  commandName: 'schedule-leave-requests.submit',
  idempotencyKey: 'schedule-leave-submit-0001',
  requestId: 'request-0002',
  input: { month: '2026-08', dates: ['2026-08-02'] }
});
await service.execute({
  identity,
  workspaceId,
  commandName: 'notifications.mark-all-read',
  idempotencyKey: 'notification-read-all-0001',
  requestId: 'request-0003',
  input: {}
});
await service.logout({ identity, workspaceId });
assert.equal(queries.length, 31);
assert.ok(queries.some(item => item.sql.includes('api_execute_time_off_command')),
  'Time-off commands use their controlled database function');
assert.ok(queries.some(item => item.sql.includes('api_execute_notification_command')),
  'Notification commands use their controlled database function');
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
    bootstrap: async () => ({
      ok: true,
      role: 'boss',
      data: { employees: [], sync: { revision: 122 } }
    }),
    bootstrapRevision: async () => ({ ok: true, workspaceId, revision: 123 }),
    listTimeOffRequests: async () => ({ ok: true, ownRequests: [], approvedSchedule: [] }),
    listNotifications: async () => ({ ok: true, items: [], unreadCount: 0 })
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
  assert.equal(bootstrapResponse.headers.get('x-bootstrap-revision'), '122');
  assert.match(bootstrapResponse.headers.get('access-control-expose-headers'), /X-Bootstrap-Revision/);
  assert.equal((await bootstrapResponse.json()).role, 'boss');
  const revisionResponse = await fetch(`${base}/v1/bootstrap/revision`, { headers: commonHeaders });
  assert.equal(revisionResponse.status, 200);
  assert.equal(revisionResponse.headers.get('x-bootstrap-revision'), '123');
  assert.equal((await revisionResponse.json()).revision, 123);
  const timeOffResponse = await fetch(`${base}/v1/time-off-requests`, { headers: commonHeaders });
  assert.equal(timeOffResponse.status, 200);
  assert.deepEqual((await timeOffResponse.json()).approvedSchedule, []);
  const notificationResponse = await fetch(`${base}/v1/notifications`, { headers: commonHeaders });
  assert.equal(notificationResponse.status, 200);
  assert.deepEqual((await notificationResponse.json()).items, []);
  const cancelLeaveResponse = await fetch(`${base}/v1/commands/leaves.replace-month`, {
    method: 'POST',
    headers: {
      ...commonHeaders,
      'Content-Type': 'application/json',
      'Idempotency-Key': 'leave-cancel-0001'
    },
    body: JSON.stringify({ employeeId: 'employee-1', month: '2026-07', dates: [] })
  });
  assert.equal(cancelLeaveResponse.status, 201);
  assert.equal(cancelLeaveResponse.headers.get('x-bootstrap-revision'), '123');
  assert.deepEqual((await cancelLeaveResponse.json()).data, {
    employeeId: 'employee-1',
    month: '2026-07',
    dates: []
  });
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
