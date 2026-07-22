import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { TextDecoder, TextEncoder } from 'node:util';

class TestCustomEvent {
  constructor(type, init = {}) {
    this.type = type;
    this.detail = init.detail;
  }
}

const source = await readFile('postgres-api-client.js', 'utf8');
const context = vm.createContext({
  URL,
  TextDecoder,
  TextEncoder,
  AbortController,
  CustomEvent: TestCustomEvent,
  setTimeout,
  clearTimeout,
  console
});
vm.runInContext(source, context, { filename: 'postgres-api-client.js' });
const { createClient, PostgresApiError, commandNames } = context.BankePostgresApi;
const workspaceId = `ws_${'a'.repeat(32)}`;
const accessToken = 'synthetic-access-token';
let requestCounter = 0;
const cryptoImpl = { randomUUID: () => `request-${String(++requestCounter).padStart(4, '0')}` };

function response(status, payload, headers = {}) {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: name => headers[String(name).toLowerCase()] || null },
    text: async () => typeof payload === 'string' ? payload : JSON.stringify(payload)
  };
}

const baseConfig = {
  getAccessToken: async () => accessToken,
  getWorkspaceId: async () => workspaceId,
  cryptoImpl
};

assert.throws(() => createClient({
  ...baseConfig,
  baseUrl: 'http://api.example.com/v1',
  fetchImpl: async () => response(200, {})
}), error => error instanceof PostgresApiError && error.code === 'POSTGRES_API_CONFIG_INVALID');
assert.throws(() => createClient({
  ...baseConfig,
  baseUrl: 'https://user:secret@api.example.com/v1',
  fetchImpl: async () => response(200, {})
}), error => error instanceof PostgresApiError && error.code === 'POSTGRES_API_CONFIG_INVALID');

const calls = [];
const client = createClient({
  ...baseConfig,
  baseUrl: 'https://api.staging.example/v1/',
  fetchImpl: async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith('/employees')) return response(200, { employees: [] });
    if (url.endsWith('/bootstrap')) return response(200, { ok: true, role: 'boss', data: {} });
    if (url.endsWith('/commands/attendance.clock-in')) return response(201, { ok: true, replayed: false });
    if (url.endsWith('/health')) return response(200, { ok: true });
    return response(404, { error: 'not found', code: 'ROUTE_NOT_FOUND', requestId: 'safe-request-id' });
  }
});

const healthPayload = await client.health();
assert.equal(healthPayload.ok, true);
assert.equal(calls[0].url, 'https://api.staging.example/v1/health');
assert.equal(Object.hasOwn(calls[0].options.headers, 'Authorization'), false);
assert.equal(calls[0].options.credentials, 'omit');
assert.equal(calls[0].options.cache, 'no-store');
assert.equal(calls[0].options.redirect, 'error');

const employeePayload = await client.listEmployees();
assert.ok(Array.isArray(employeePayload.employees));
assert.equal(employeePayload.employees.length, 0);
assert.equal(calls[1].url, 'https://api.staging.example/v1/employees');
assert.equal(calls[1].options.headers.Authorization, `Bearer ${accessToken}`);
assert.equal(calls[1].options.headers['X-Workspace-Id'], workspaceId);
assert.match(calls[1].options.headers['X-Request-Id'], /^request-\d{4}$/);

const bootstrapPayload = await client.bootstrap();
assert.equal(bootstrapPayload.role, 'boss');
assert.equal(calls[2].url, 'https://api.staging.example/v1/bootstrap');

const commandPayload = await client.executeCommand(
  'attendance.clock-in', {}, { idempotencyKey: 'clock-in-0001' }
);
assert.equal(commandPayload.ok, true);
assert.equal(commandPayload.replayed, false);
assert.equal(calls[3].options.method, 'POST');
assert.equal(calls[3].options.headers['Idempotency-Key'], 'clock-in-0001');
assert.equal(calls[3].options.headers['Content-Type'], 'application/json');
assert.equal(calls[3].options.body, '{}');
assert.equal(commandNames.length, 6);
assert.throws(() => client.executeCommand('admin.drop-all', {}), error =>
  error instanceof PostgresApiError && error.code === 'COMMAND_NOT_FOUND');

let payloadFetchCalled = false;
const payloadClient = createClient({
  ...baseConfig,
  baseUrl: 'http://127.0.0.1:8080/v1',
  fetchImpl: async () => { payloadFetchCalled = true; return response(200, {}); }
});
await assert.rejects(
  payloadClient.executeCommand(
    'shifts.create', { note: '\u6f22'.repeat(400_000) }, { idempotencyKey: 'shift-create-0001' }
  ),
  error => error instanceof PostgresApiError && error.code === 'REQUEST_PAYLOAD_TOO_LARGE' && error.status === 413
);
assert.equal(payloadFetchCalled, false, 'oversized payload must fail before network I/O');

const rejectedEvents = [];
const rejectedClient = createClient({
  ...baseConfig,
  baseUrl: 'https://api.staging.example/v1',
  fetchImpl: async () => response(401, {
    error: 'session revoked', code: 'SESSION_INVALID', requestId: 'safe-request-id'
  }),
  eventTarget: { dispatchEvent: event => rejectedEvents.push(event) }
});
await assert.rejects(rejectedClient.listEmployees(), error => {
  assert.equal(error.code, 'SESSION_INVALID');
  assert.equal(error.status, 401);
  assert.equal(error.requestId, 'safe-request-id');
  assert.doesNotMatch(`${error.message}${JSON.stringify(error)}`, /synthetic-access-token/);
  return true;
});
assert.equal(rejectedEvents.length, 1);
assert.equal(rejectedEvents[0].type, 'shift-postgres-session-invalid');
assert.equal(rejectedEvents[0].detail.code, 'SESSION_INVALID');
assert.equal(rejectedEvents[0].detail.status, 401);

const invalidWorkspaceClient = createClient({
  ...baseConfig,
  baseUrl: 'https://api.staging.example/v1',
  getWorkspaceId: async () => 'ws_attacker',
  fetchImpl: async () => response(200, {})
});
await assert.rejects(invalidWorkspaceClient.listEmployees(), error =>
  error instanceof PostgresApiError && error.code === 'WORKSPACE_ID_INVALID');

const oversizedResponseClient = createClient({
  ...baseConfig,
  baseUrl: 'https://api.staging.example/v1',
  fetchImpl: async () => response(200, {}, { 'content-length': '2097153' })
});
await assert.rejects(oversizedResponseClient.listEmployees(), error =>
  error instanceof PostgresApiError && error.code === 'POSTGRES_API_RESPONSE_TOO_LARGE');

const unavailableClient = createClient({
  ...baseConfig,
  baseUrl: 'https://api.staging.example/v1',
  fetchImpl: async () => { throw new TypeError('synthetic network failure'); }
});
await assert.rejects(unavailableClient.bootstrap(), error =>
  error instanceof PostgresApiError && error.code === 'POSTGRES_API_UNAVAILABLE');

const timeoutClient = createClient({
  ...baseConfig,
  baseUrl: 'https://api.staging.example/v1',
  timeoutMs: 1_000,
  fetchImpl: async (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => {
      const error = new Error('synthetic timeout');
      error.name = 'AbortError';
      reject(error);
    }, { once: true });
  })
});
await assert.rejects(timeoutClient.bootstrap(), error =>
  error instanceof PostgresApiError && error.code === 'POSTGRES_API_TIMEOUT');

console.log('PostgreSQL frontend API client tests passed.');
