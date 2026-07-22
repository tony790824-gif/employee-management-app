(() => {
  'use strict';

  const environment = window.shiftEnvironment;
  if (environment?.dataBackend !== 'postgres') return;

  const stateStore = window.shiftStateStore;
  const workspacePattern = /^ws_[a-f0-9]{32}$/;
  let client = null;
  let currentSession = null;

  function validateBootstrap(payload) {
    if (!payload || payload.ok !== true || !payload.data || typeof payload.data !== 'object') {
      throw new Error('PostgreSQL bootstrap 回應格式不正確。');
    }
    if (payload.workspaceId !== environment.postgresWorkspaceId || !workspacePattern.test(payload.workspaceId)) {
      throw new Error('PostgreSQL bootstrap 工作區不一致。');
    }
    if (!['boss', 'employee'].includes(payload.role)) throw new Error('PostgreSQL bootstrap 角色不正確。');
    if (payload.role === 'employee' && typeof payload.employeeId !== 'string') {
      throw new Error('PostgreSQL bootstrap 缺少員工身份。');
    }
    const normalized = stateStore.normalize(payload.data);
    if (normalized.workspace.id !== payload.workspaceId) throw new Error('PostgreSQL bootstrap 資料邊界不一致。');
    return { ...payload, data: normalized };
  }

  async function connect({ getAccessToken }) {
    if (typeof getAccessToken !== 'function') throw new Error('PostgreSQL 登入缺少 Access Token provider。');
    client = window.BankePostgresApi.createClient({
      baseUrl: environment.postgresApiUrl,
      getAccessToken,
      getWorkspaceId: async () => environment.postgresWorkspaceId
    });
    await client.readiness();
    await client.establishSession();
    const bootstrap = validateBootstrap(await client.bootstrap());
    stateStore.write(bootstrap.data);
    currentSession = Object.freeze({ role: bootstrap.role, employeeId: bootstrap.employeeId || '' });
    sessionStorage.setItem(environment.storageKey('shift-postgres-auth'), JSON.stringify(currentSession));
    return bootstrap;
  }

  async function logout() {
    if (client) await client.logout();
    currentSession = null;
    sessionStorage.removeItem(environment.storageKey('shift-postgres-auth'));
    stateStore.clearSensitive();
  }

  window.shiftPostgresCloud = Object.freeze({
    connect,
    logout,
    isConnected: () => Boolean(currentSession),
    getSession: () => currentSession
  });
})();
