import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { TextEncoder } from 'node:util';
import { createApiServer } from '../server/app.mjs';
import {
  validateAnnouncementId,
  validateAnnouncementMutation
} from '../server/validation.mjs';

const workspaceId = 'ws_0123456789abcdef0123456789abcdef';
const announcementId = '00000000-0000-4000-8000-000000000022';
const identity = Object.freeze({ subject: 'auth0|synthetic', sessionId: 'session-synthetic' });

assert.equal(validateAnnouncementId(announcementId), announcementId);
assert.deepEqual(validateAnnouncementMutation('announcements.create', {
  title: ' Staging announcement ', content: ' Synthetic content ', audience: 'ALL'
}), { title: 'Staging announcement', content: 'Synthetic content', audience: 'ALL' });
assert.deepEqual(validateAnnouncementMutation('announcements.update', {
  title: 'Updated', content: 'Updated content', audience: 'EMPLOYEE', baseRevision: 1
}, announcementId), {
  announcementId, title: 'Updated', content: 'Updated content', audience: 'EMPLOYEE', baseRevision: 1
});
assert.deepEqual(validateAnnouncementMutation('announcements.delete', {
  baseRevision: 2
}, announcementId), { announcementId, baseRevision: 2 });
assert.throws(() => validateAnnouncementMutation('announcements.create', {
  title: 'Unsafe', content: 'Unsafe', audience: 'ALL', workspaceId: 'attacker'
}), error => error.code === 'COMMAND_INVALID');
assert.throws(() => validateAnnouncementMutation('announcements.create', {
  title: 'Unsafe', content: 'Unsafe', audience: 'OUTSIDER'
}), error => error.code === 'COMMAND_INVALID');

const calls = [];
const commandService = {
  listAnnouncements: args => (calls.push(['list', args]), Promise.resolve({
    ok: true, workspaceId, items: [], unreadCount: 0
  })),
  getAnnouncement: args => (calls.push(['get', args]), Promise.resolve({
    ok: true, workspaceId, item: { id: announcementId }
  })),
  createAnnouncement: args => (calls.push(['create', args]), Promise.resolve({
    ok: true, data: { id: announcementId }
  })),
  updateAnnouncement: args => (calls.push(['update', args]), Promise.resolve({
    ok: true, data: { id: announcementId, revision: 1 }
  })),
  deleteAnnouncement: args => (calls.push(['delete', args]), Promise.resolve({
    ok: true, data: { id: announcementId, revision: 2 }
  })),
  markAnnouncementRead: args => (calls.push(['read', args]), Promise.resolve({
    ok: true, data: { id: announcementId }
  })),
  bootstrapRevision: () => Promise.resolve({ ok: true, workspaceId, revision: 42 })
};
const server = createApiServer({
  commandService,
  verifyAccessToken: async () => identity,
  pool: { query: async () => ({ rows: [{ '?column?': 1 }] }) },
  allowedOrigins: ['https://staging.example'],
  environment: 'staging'
});
server.listen(0, '127.0.0.1');
await once(server, 'listening');
const address = server.address();
const base = `http://127.0.0.1:${address.port}/v1`;
const headers = {
  Authorization: 'Bearer synthetic',
  Origin: 'https://staging.example',
  'X-Workspace-Id': workspaceId,
  'X-Request-Id': 'announcement-test-request-0001'
};
try {
  let response = await fetch(`${base}/announcements`, { headers });
  assert.equal(response.status, 200);
  response = await fetch(`${base}/announcements/${announcementId}`, { headers });
  assert.equal(response.status, 200);
  response = await fetch(`${base}/announcements`, {
    method: 'POST', headers: { ...headers, 'Content-Type': 'application/json', 'Idempotency-Key': 'announcement-create-0001' },
    body: JSON.stringify({ title: 'Announcement', content: 'Content', audience: 'ALL' })
  });
  assert.equal(response.status, 201);
  assert.equal(response.headers.get('x-bootstrap-revision'), '42');
  response = await fetch(`${base}/announcements/${announcementId}`, {
    method: 'PUT', headers: { ...headers, 'Content-Type': 'application/json', 'Idempotency-Key': 'announcement-update-0001' },
    body: JSON.stringify({ title: 'Updated', content: 'Content', audience: 'EMPLOYEE', baseRevision: 0 })
  });
  assert.equal(response.status, 200);
  response = await fetch(`${base}/announcements/${announcementId}/read`, {
    method: 'POST', headers: { ...headers, 'Content-Type': 'application/json', 'Idempotency-Key': 'announcement-read-0001' },
    body: '{}'
  });
  assert.equal(response.status, 200);
  response = await fetch(`${base}/announcements/${announcementId}`, {
    method: 'DELETE', headers: { ...headers, 'Content-Type': 'application/json', 'Idempotency-Key': 'announcement-delete-0001' },
    body: JSON.stringify({ baseRevision: 1 })
  });
  assert.equal(response.status, 200);
  response = await fetch(`${base}/announcements`, {
    method: 'OPTIONS', headers: { Origin: 'https://staging.example' }
  });
  assert.equal(response.status, 204);
  assert.match(response.headers.get('access-control-allow-methods'), /PUT/);
  assert.match(response.headers.get('access-control-allow-methods'), /DELETE/);
} finally {
  await new Promise(resolve => server.close(resolve));
}
assert.deepEqual(calls.map(([name]) => name), ['list', 'get', 'create', 'update', 'read', 'delete']);
for (const [, args] of calls) {
  assert.equal(args.workspaceId, workspaceId, 'Every Announcement API call keeps the requested Workspace boundary.');
  assert.equal(args.identity, identity, 'Every Announcement API call uses the verified identity.');
}

const navigationSource = await readFile('notification-navigation.js', 'utf8');
const navigationContext = { window: {} };
navigationContext.self = navigationContext.window;
vm.createContext(navigationContext);
vm.runInContext(navigationSource, navigationContext);
const navigation = navigationContext.window.shiftNotificationNavigation;
assert.equal(navigation.pathForNotification({
  type: 'announcement_created', resourceId: announcementId
}), `/announcements/${announcementId}`);
assert.equal(navigation.pathForNotification({
  type: 'announcement_created', resourceId: 'javascript:alert(1)', destination: 'https://attacker.invalid'
}), '/announcements');
assert.equal(navigation.targetForPath(`/announcements/${announcementId}`), 'announcements');
assert.equal(navigation.announcementIdForPath(`/announcements/${announcementId}`), announcementId);

const [uiSource, notificationSource, workerSource, clientSource] = await Promise.all([
  readFile('announcement-center.js', 'utf8'),
  readFile('notification-center.js', 'utf8'),
  readFile('service-worker.js', 'utf8'),
  readFile('postgres-api-client.js', 'utf8')
]);
assert.match(uiSource, /cloud\.listAnnouncements\(\)/);
assert.match(uiSource, /cloud\.markAnnouncementRead\(item\.id\)/);
assert.match(uiSource, /\['boss', 'manager'\]\.includes/);
assert.doesNotMatch(uiSource, /fetch\(|attendance|leave_selections|localStorage/,
  'Announcement UI must use the controlled client and not write unrelated data directly.');
assert.match(notificationSource, /navigation\.pathForNotification\(item\)/,
  'Notification Center and Service Worker share the navigation allowlist.');
assert.match(workerSource, /pathForNotification/);
assert.match(workerSource, /resourceId:payload\.resourceId/);
assert.match(clientSource, /credentials: 'omit'/);
assert.match(clientSource, /redirect: 'error'/);

const clientCalls = [];
let requestSequence = 0;
const clientContext = vm.createContext({
  URL, TextEncoder, AbortController, CustomEvent: class {}, setTimeout, clearTimeout,
  fetch: async (url, options) => {
    clientCalls.push({ url, options });
    return {
      ok: true,
      status: options.method === 'POST' ? 201 : 200,
      headers: { get: name => name.toLowerCase() === 'x-bootstrap-revision' ? '8' : null },
      text: async () => JSON.stringify({ ok: true, data: { sync: { revision: 8 } }, items: [] })
    };
  },
  crypto: { randomUUID: () => `announcement-request-${++requestSequence}` }
});
vm.runInContext(clientSource, clientContext);
const browserClient = clientContext.BankePostgresApi.createClient({
  baseUrl: 'https://api.staging.example/v1',
  getAccessToken: async () => 'synthetic-token',
  getWorkspaceId: async () => workspaceId,
  fetchImpl: clientContext.fetch,
  cryptoImpl: clientContext.crypto
});
await browserClient.listAnnouncements();
await browserClient.getAnnouncement(announcementId);
await browserClient.createAnnouncement({ title: 'Title', content: 'Content', audience: 'ALL' });
await browserClient.updateAnnouncement(announcementId, {
  title: 'Title', content: 'Content', audience: 'EMPLOYEE', baseRevision: 0
});
await browserClient.markAnnouncementRead(announcementId);
await browserClient.deleteAnnouncement(announcementId, 1);
assert.deepEqual(clientCalls.map(call => [new URL(call.url).pathname, call.options.method]), [
  ['/v1/announcements', 'GET'],
  [`/v1/announcements/${announcementId}`, 'GET'],
  ['/v1/announcements', 'POST'],
  [`/v1/announcements/${announcementId}`, 'PUT'],
  [`/v1/announcements/${announcementId}/read`, 'POST'],
  [`/v1/announcements/${announcementId}`, 'DELETE']
]);
assert.ok(clientCalls.slice(2).every(call => call.options.headers['Idempotency-Key']),
  'Every Announcement mutation uses an Idempotency-Key.');
assert.ok(clientCalls.every(call => call.options.headers['X-Workspace-Id'] === workspaceId));

function uiNode() {
  const listeners = new Map();
  return {
    hidden: false,
    disabled: false,
    open: false,
    value: '',
    textContent: '',
    children: [],
    attributes: new Map(),
    append(...children) { this.children.push(...children); },
    replaceChildren(...children) { this.children = children; },
    setAttribute(name, value) {
      this.attributes.set(name, String(value));
      if (name === 'open') this.open = true;
    },
    addEventListener(type, listener) { listeners.set(type, listener); },
    dispatch(type, event = {}) { return listeners.get(type)?.({ target: this, ...event }); },
    click() { return this.dispatch('click'); },
    showModal() { this.open = true; },
    close() { this.open = false; },
    focus() {}
  };
}

const announcementSelectors = [
  '#announcementButton', '#announcementBadge', '#announcementDialog', '#announcementClose',
  '#announcementSummary', '#announcementMessage', '#announcementList', '#announcementDetail',
  '#announcementDetailTitle', '#announcementDetailContent', '#announcementDetailMeta',
  '#announcementBack', '#announcementManagerActions', '#announcementEdit', '#announcementDelete',
  '#announcementEditor', '#announcementEditId', '#announcementEditRevision', '#announcementTitle',
  '#announcementContent', '#announcementAudience', '#announcementCancelEdit', '#announcementSave'
];
const announcementElements = new Map(announcementSelectors.map(selector => [selector, uiNode()]));
announcementElements.get('#announcementButton').hidden = true;
announcementElements.get('#announcementBadge').hidden = true;
announcementElements.get('#announcementMessage').hidden = true;
const announcementDocumentListeners = new Map();
const announcementItem = {
  id: announcementId,
  title: 'Sprint 32 測試',
  content: 'Synthetic announcement detail',
  audience: 'ALL',
  publishedAt: '2026-08-03T00:00:00.000Z',
  readAt: null,
  revision: 0
};
const announcementUiDom = {
  element(tag, options = {}, children = []) {
    const item = uiNode();
    item.tag = tag;
    item.className = options.className || '';
    item.textContent = options.text ?? '';
    Object.entries(options.attributes || {}).forEach(([name, value]) => item.setAttribute(name, value));
    item.append(...children);
    return item;
  },
  replace(target, ...children) { target.replaceChildren(...children); }
};
const announcementUiContext = {
  Intl,
  Date,
  Promise,
  window: {
    location: { pathname: '/' },
    addEventListener() {},
    confirm: () => true,
    shiftEnvironment: { dataBackend: 'postgres' },
    shiftDomSafety: announcementUiDom,
    shiftPostgresCloud: {
      isConnected: () => true,
      getCurrentUser: () => ({ role: 'employee' }),
      listAnnouncements: async () => ({ ok: true, items: [announcementItem], unreadCount: 1 }),
      markAnnouncementRead: async () => ({ ok: true }),
      createAnnouncement: async () => ({ ok: true }),
      updateAnnouncement: async () => ({ ok: true }),
      deleteAnnouncement: async () => ({ ok: true })
    }
  },
  document: {
    querySelector: selector => announcementElements.get(selector) || null,
    addEventListener(type, listener) { announcementDocumentListeners.set(type, listener); }
  }
};
announcementUiContext.window.window = announcementUiContext.window;
vm.runInNewContext(navigationSource, announcementUiContext, { filename: 'notification-navigation.js' });
assert.equal(announcementUiContext.window.shiftNotificationNavigation.openAnnouncement(
  `/announcements/${announcementId}`
), false, 'A safe Announcement destination waits until the authenticated UI has registered its opener.');
vm.runInNewContext(uiSource, announcementUiContext, { filename: 'announcement-center.js' });
await new Promise(resolve => setImmediate(resolve));
assert.equal(announcementElements.get('#announcementDialog').open, true,
  'A queued notification destination opens after Announcement Center initialization.');
assert.equal(announcementElements.get('#announcementDetail').hidden, false);
assert.equal(announcementElements.get('#announcementDetailTitle').textContent, 'Sprint 32 測試');

announcementElements.get('#announcementDialog').close();
await announcementElements.get('#announcementButton').click();
assert.equal(announcementElements.get('#announcementDialog').open, true,
  'The top Announcement button opens the Announcement list.');
assert.equal(announcementElements.get('#announcementList').hidden, false);
assert.equal(announcementElements.get('#announcementList').children.length, 1);

announcementElements.get('#announcementDialog').close();
await announcementUiContext.window.shiftNotificationNavigation.openAnnouncement(
  `/announcements/${announcementId}`
);
assert.equal(announcementElements.get('#announcementDialog').open, true,
  'An announcement_created destination opens the same Announcement dialog.');
assert.equal(announcementElements.get('#announcementDetail').hidden, false);
assert.equal(announcementElements.get('#announcementDetailTitle').textContent, 'Sprint 32 測試');
assert.equal(announcementUiContext.window.shiftNotificationNavigation.openAnnouncement(
  '/announcements/javascript:alert(1)'
), false, 'Unsafe or invalid Announcement destinations fail closed.');

console.log('Announcement REST API, client navigation, read marker, and frontend boundary tests passed.');
