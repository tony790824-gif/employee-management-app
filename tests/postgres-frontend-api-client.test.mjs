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
const commandRevisions = [];
const client = createClient({
  ...baseConfig,
  baseUrl: 'https://api.staging.example/v1/',
  onCommandRevision: revision => commandRevisions.push(revision),
  fetchImpl: async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith('/employees')) return response(200, { employees: [] });
    if (url.endsWith('/bootstrap')) return response(200, {
      ok: true, role: 'boss', data: { sync: { revision: 122 } }
    }, { 'x-bootstrap-revision': '122' });
    if (url.endsWith('/bootstrap/revision')) return response(200, {
      ok: true, workspaceId, revision: 123
    }, { 'x-bootstrap-revision': '123' });
    if (url.endsWith('/time-off-requests')) return response(200, {
      ok: true,
      workspaceId,
      role: 'employee',
      ownRequests: [],
      pendingReview: [],
      processed: [],
      approvedSchedule: [],
      approvedLeaveCoverage: []
    });
    if (url.endsWith('/notifications')) return response(200, {
      ok: true,
      workspaceId,
      items: [],
      unreadCount: 0
    });
    if (url.includes('/commands/')) {
      return response(201, { ok: true, replayed: false }, { 'x-bootstrap-revision': '124' });
    }
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

const revisionPayload = await client.bootstrapRevision();
assert.equal(revisionPayload.revision, 123);
assert.equal(calls[3].url, 'https://api.staging.example/v1/bootstrap/revision');
assert.equal(calls[3].options.method, 'GET');
assert.equal(calls[3].options.headers.Authorization, `Bearer ${accessToken}`);
assert.equal(calls[3].options.headers['X-Workspace-Id'], workspaceId);

const mismatchedRevisionClient = createClient({
  ...baseConfig,
  baseUrl: 'https://api.staging.example/v1',
  fetchImpl: async () => response(200, {
    ok: true, workspaceId, revision: 124
  }, { 'x-bootstrap-revision': '125' })
});
await assert.rejects(mismatchedRevisionClient.bootstrapRevision(), error =>
  error instanceof PostgresApiError && error.code === 'POSTGRES_API_RESPONSE_INVALID');

const timeOffPayload = await client.listTimeOffRequests();
assert.equal(timeOffPayload.role, 'employee');
assert.equal(Array.isArray(timeOffPayload.ownRequests), true);
assert.equal(timeOffPayload.ownRequests.length, 0);
assert.equal(calls[4].url, 'https://api.staging.example/v1/time-off-requests');
assert.equal(calls[4].options.method, 'GET');
assert.equal(calls[4].options.headers.Authorization, `Bearer ${accessToken}`);
assert.equal(calls[4].options.headers['X-Workspace-Id'], workspaceId);
assert.equal(calls[4].options.body, undefined, 'The read route does not accept client-defined query or body data.');

const notificationPayload = await client.listNotifications();
assert.equal(notificationPayload.unreadCount, 0);
assert.equal(Array.isArray(notificationPayload.items), true);
assert.equal(calls[5].url, 'https://api.staging.example/v1/notifications');
assert.equal(calls[5].options.method, 'GET');
assert.equal(calls[5].options.headers.Authorization, `Bearer ${accessToken}`);
assert.equal(calls[5].options.headers['X-Workspace-Id'], workspaceId);

const commandPayload = await client.executeCommand(
  'attendance.clock-in', {}, { idempotencyKey: 'clock-in-0001' }
);
assert.equal(commandPayload.ok, true);
assert.equal(commandPayload.replayed, false);
assert.deepEqual(commandRevisions, [124]);
assert.equal(calls[6].options.method, 'POST');
assert.equal(calls[6].options.headers['Idempotency-Key'], 'clock-in-0001');
assert.equal(calls[6].options.headers['Content-Type'], 'application/json');
assert.equal(calls[6].options.body, '{}');
const timeOffCommandNames = [
  'schedule-leave-requests.submit',
  'schedule-leave-requests.cancel',
  'leave-requests.submit',
  'leave-requests.cancel',
  'time-off-requests.approve',
  'time-off-requests.reject'
];
assert.equal(commandNames.length, 14);
for (const commandName of timeOffCommandNames) {
  assert.ok(commandNames.includes(commandName), `${commandName} must be in the browser command allowlist`);
  const responsePayload = await client.executeCommand(commandName, {}, {
    idempotencyKey: `time-off-${commandName.replaceAll('.', '-').replaceAll('_', '-')}`
  });
  assert.equal(responsePayload.ok, true);
  assert.match(calls.at(-1).url, new RegExp(`/commands/${commandName.replace('.', '\\.')}$`));
}
for (const commandName of ['notifications.mark-read', 'notifications.mark-all-read']) {
  assert.ok(commandNames.includes(commandName), `${commandName} must be in the browser command allowlist`);
  const responsePayload = await client.executeCommand(commandName, {}, {
    idempotencyKey: `notification-${commandName.replaceAll('.', '-')}`
  });
  assert.equal(responsePayload.ok, true);
}
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
await assert.rejects(rejectedClient.listTimeOffRequests(), error => {
  assert.equal(error.code, 'SESSION_INVALID');
  assert.equal(error.status, 401);
  assert.equal(error.requestId, 'safe-request-id');
  assert.doesNotMatch(`${error.message}${JSON.stringify(error)}`, /synthetic-access-token/);
  return true;
});
assert.equal(rejectedEvents.length, 1);
assert.equal(rejectedEvents[0].type, 'shift-session-invalid');
assert.equal(rejectedEvents[0].detail.code, 'SESSION_INVALID');
assert.equal(rejectedEvents[0].detail.status, 401);

for (const { status, code } of [
  { status: 400, code: 'COMMAND_INVALID' },
  { status: 403, code: 'COMMAND_FORBIDDEN' },
  { status: 403, code: 'WORKSPACE_ACCESS_DENIED' },
  { status: 404, code: 'RELATED_RESOURCE_NOT_FOUND' },
  { status: 409, code: 'REVISION_CONFLICT' }
]) {
  const events = [];
  const ordinaryErrorClient = createClient({
    ...baseConfig,
    baseUrl: 'https://api.staging.example/v1',
    fetchImpl: async () => response(status, { error: 'safe error', code, requestId: 'safe-request-id' }),
    eventTarget: { dispatchEvent: event => events.push(event) }
  });
  await assert.rejects(
    ordinaryErrorClient.executeCommand('shifts.create', {}, { idempotencyKey: `ordinary-${status}-${code}` }),
    error => error.code === code && error.status === status
  );
  assert.equal(events.length, 0, `${status} ${code} must not invalidate the signed-in session`);
}

const tokenSessionEvents = [];
const tokenSessionClient = createClient({
  ...baseConfig,
  baseUrl: 'https://api.staging.example/v1',
  fetchImpl: async () => response(401, {
    error: 'token session invalid', code: 'TOKEN_SESSION_INVALID', requestId: 'safe-request-id'
  }),
  eventTarget: { dispatchEvent: event => tokenSessionEvents.push(event) }
});
await assert.rejects(tokenSessionClient.bootstrap(), error => error.code === 'TOKEN_SESSION_INVALID');
assert.equal(tokenSessionEvents.length, 1);
assert.equal(tokenSessionEvents[0].type, 'shift-session-invalid');
assert.equal(tokenSessionEvents[0].detail.code, 'TOKEN_SESSION_INVALID');

const invalidCodeWithBusinessStatusEvents = [];
const invalidCodeWithBusinessStatusClient = createClient({
  ...baseConfig,
  baseUrl: 'https://api.staging.example/v1',
  fetchImpl: async () => response(400, {
    error: 'invalid command', code: 'SESSION_INVALID', requestId: 'safe-request-id'
  }),
  eventTarget: { dispatchEvent: event => invalidCodeWithBusinessStatusEvents.push(event) }
});
await assert.rejects(
  invalidCodeWithBusinessStatusClient.executeCommand(
    'employees.create', {}, { idempotencyKey: 'employee-create-400-session-code' }
  ),
  error => error.code === 'SESSION_INVALID' && error.status === 400
);
assert.equal(
  invalidCodeWithBusinessStatusEvents.length,
  0,
  'a business-validation response must not invalidate the session even if its code is malformed'
);

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
