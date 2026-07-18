import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { once } from 'node:events';
import { createApiServer } from '../server/app.mjs';
import { createCommandService } from '../server/commands.mjs';
import { withTenantTransaction } from '../server/db.mjs';
import { createJwtVerifier } from '../server/jwt-verifier.mjs';
import { validateCommand } from '../server/validation.mjs';

assert.equal(validateCommand('employees.create', {
  name: '王小明', phone: '0912345678', hourlyRate: 200
}).leaveQuota, 8);
assert.throws(() => validateCommand('employees.create', {
  name: '王小明', phone: '0912345678', hourlyRate: 200, workspaceId: 'attacker'
}), error => error.code === 'COMMAND_INVALID');
assert.throws(() => validateCommand('shifts.create', {
  employeeId: 'employee-1', date: '2026-02-30', startTime: '09:00', endTime: '18:00'
}), error => error.code === 'COMMAND_INVALID');
assert.throws(() => validateCommand('attendance.approve-hours', {
  attendanceId: 'attendance-1', hours: -1, baseRevision: 0
}), error => error.code === 'COMMAND_INVALID');

const queries = [];
const client = {
  async query(sql, params = []) {
    queries.push({ sql, params });
    if (/SELECT command_name/.test(sql)) return { rows: [] };
    if (/INSERT INTO employees/.test(sql)) return { rows: [{ id: params[1], name: params[2], phone: params[4] }] };
    return { rows: [] };
  }
};
const transactionRunner = async (_pool, principal, callback) => callback({
  client, member: { role: 'boss', employee_id: null },
  workspaceId: principal.workspaceId, userId: principal.userId
});
const service = createCommandService({
  pool: {}, transactionRunner, idFactory: () => '00000000-0000-4000-8000-000000000001'
});
const principal = {
  workspaceId: 'ws_0123456789abcdef0123456789abcdef',
  userId: '11111111-1111-4111-8111-111111111111'
};
const created = await service.execute({
  principal, commandName: 'employees.create', idempotencyKey: 'employee-create-0001', requestId: 'request-0001',
  input: { name: '王小明', phone: '0912345678', hourlyRate: 200 }
});
assert.equal(created.ok, true);
for (const marker of ['INSERT INTO employees', 'INSERT INTO command_receipts', 'INSERT INTO audit_logs', 'INSERT INTO outbox_events']) {
  assert.ok(queries.some(item => item.sql.includes(marker)), `${marker} must be part of the same transaction callback`);
}
assert.ok(queries.filter(item => /INSERT INTO (employees|command_receipts|audit_logs|outbox_events)/.test(item.sql))
  .every(item => item.params[0] === principal.workspaceId), 'all writes must carry the authenticated workspace');

const transactionQueries = [];
let released = false;
const transactionClient = {
  async query(sql, params = []) {
    transactionQueries.push({ sql, params });
    if (/SELECT wm\.role/.test(sql)) {
      return { rows: [{ role: 'boss', employee_id: null, status: 'active', workspace_status: 'active' }] };
    }
    return { rows: [] };
  },
  release() { released = true; }
};
const transactionPool = { connect: async () => transactionClient };
const transactionResult = await withTenantTransaction(transactionPool, principal, async context => {
  assert.equal(context.workspaceId, principal.workspaceId);
  return 'committed';
});
assert.equal(transactionResult, 'committed');
assert.equal(released, true);
const workspaceContextIndex = transactionQueries.findIndex(item => item.sql.includes("app.current_workspace_id"));
const membershipIndex = transactionQueries.findIndex(item => /SELECT wm\.role/.test(item.sql));
assert.ok(workspaceContextIndex >= 0 && workspaceContextIndex < membershipIndex,
  'tenant context must be established before RLS-protected membership lookup');
assert.equal(transactionQueries.at(-1).sql, 'COMMIT');

const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
const nowSeconds = 1_800_000_000;
const header = encode({ alg: 'RS256', typ: 'JWT' });
const payload = encode({
  iss: 'https://identity.example', aud: 'banke-api', sub: principal.userId,
  workspace_id: principal.workspaceId, exp: nowSeconds + 300
});
const signature = sign('RSA-SHA256', Buffer.from(`${header}.${payload}`), privateKey).toString('base64url');
const verifier = createJwtVerifier({
  publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }),
  issuer: 'https://identity.example', audience: 'banke-api', now: () => nowSeconds * 1000
});
assert.deepEqual(verifier(`${header}.${payload}.${signature}`), { ...principal, tokenId: '' });
assert.throws(() => verifier(`${header}.${payload}.invalid`), error => error.code === 'TOKEN_INVALID');

const api = createApiServer({
  pool: { query: async () => ({ rows: [{ '?column?': 1 }] }) },
  allowedOrigins: ['https://staging.example'],
  verifyAccessToken: () => principal,
  commandService: { execute: async ({ input }) => ({ ok: true, data: input }), listEmployees: async () => ({ ok: true, data: [] }) }
});
api.listen(0, '127.0.0.1');
await once(api, 'listening');
const base = `http://127.0.0.1:${api.address().port}`;
try {
  const exactPrefix = '{"value":"';
  const exactSuffix = '"}';
  const exactBody = exactPrefix + 'a'.repeat(1_048_576 - Buffer.byteLength(exactPrefix + exactSuffix)) + exactSuffix;
  assert.equal(Buffer.byteLength(exactBody), 1_048_576);
  const accepted = await fetch(`${base}/v1/commands/attendance.clock-in`, {
    method: 'POST', headers: {
      Origin: 'https://staging.example', Authorization: 'Bearer a.b.c',
      'Content-Type': 'application/json', 'Idempotency-Key': 'clock-in-0001'
    }, body: exactBody
  });
  assert.equal(accepted.status, 201, 'exactly 1 MiB is allowed');
  const unicodeBody = JSON.stringify({ value: '班'.repeat(349_524) });
  assert.ok(unicodeBody.length < 1_048_576 && Buffer.byteLength(unicodeBody) > 1_048_576);
  const rejected = await fetch(`${base}/v1/commands/attendance.clock-in`, {
    method: 'POST', headers: {
      Origin: 'https://staging.example', Authorization: 'Bearer a.b.c',
      'Content-Type': 'application/json', 'Idempotency-Key': 'clock-in-0002'
    }, body: unicodeBody
  });
  assert.equal(rejected.status, 413, 'UTF-8 bytes, not JavaScript characters, enforce the limit');
  assert.equal((await rejected.json()).code, 'REQUEST_PAYLOAD_TOO_LARGE');
  const wrongOrigin = await fetch(`${base}/v1/health`, { headers: { Origin: 'https://production.example' } });
  assert.equal(wrongOrigin.status, 403);
} finally {
  api.close();
  await once(api, 'close');
}

console.log('PostgreSQL command validation, JWT, tenant writes and API boundaries passed');
