(() => {
  'use strict';

  const environment = window.shiftEnvironment;
  if (environment?.dataBackend !== 'postgres') return;

  const stateStore = window.shiftStateStore;
  const workspacePattern = /^ws_[a-f0-9]{32}$/;
  let client = null;
  let currentSession = null;
  let currentUser = null;

  const isEmployeeSession = () => currentSession?.role === 'employee' && Boolean(currentSession.employeeId);

  function validateCurrentUser(value, payload) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('PostgreSQL bootstrap currentUser format is invalid.');
    }
    const displayName = value.displayName === null
      ? null
      : typeof value.displayName === 'string' && value.displayName === value.displayName.trim()
        && value.displayName.length > 0 && value.displayName.length <= 120
        ? value.displayName
        : undefined;
    if (displayName === undefined) throw new Error('PostgreSQL bootstrap currentUser display name is invalid.');
    if (!['boss', 'employee'].includes(value.role) || value.role !== payload.role) {
      throw new Error('PostgreSQL bootstrap currentUser role is inconsistent.');
    }
    const employeeId = value.employeeId === null ? null : value.employeeId;
    if (value.role === 'employee' && (typeof employeeId !== 'string' || employeeId !== payload.employeeId)) {
      throw new Error('PostgreSQL bootstrap currentUser employee identity is inconsistent.');
    }
    if (value.role === 'boss' && employeeId !== null) {
      throw new Error('PostgreSQL bootstrap currentUser manager identity is invalid.');
    }
    if (value.workspaceId !== payload.workspaceId || !workspacePattern.test(value.workspaceId)) {
      throw new Error('PostgreSQL bootstrap currentUser Workspace is inconsistent.');
    }
    return Object.freeze({ displayName, role: value.role, employeeId, workspaceId: value.workspaceId });
  }

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
    return { ...payload, currentUser: validateCurrentUser(payload.currentUser, payload), data: normalized };
  }

  async function refreshBootstrap() {
    if (!client) throw new Error('PostgreSQL Staging 尚未連線。');
    const bootstrap = validateBootstrap(await client.bootstrap());
    stateStore.write(bootstrap.data);
    currentSession = Object.freeze({ role: bootstrap.role, employeeId: bootstrap.employeeId || '' });
    currentUser = bootstrap.currentUser;
    sessionStorage.setItem(environment.storageKey('shift-postgres-auth'), JSON.stringify(currentSession));
    document.dispatchEvent(new CustomEvent('postgres-bootstrap-refreshed'));
    return bootstrap;
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
    return refreshBootstrap();
  }

  async function executeAndRefresh(commandName, input) {
    if (!client || !currentSession) throw new Error('PostgreSQL Staging 登入狀態已失效，請重新登入。');
    const result = await client.executeCommand(commandName, input);
    await refreshBootstrap();
    return result;
  }

  const saveEmployeeLeave = (month, dates) => executeAndRefresh('leaves.replace-month', { month, dates });
  const saveBossLeave = (employeeId, month, dates) => executeAndRefresh(
    'leaves.replace-month',
    { employeeId, month, dates }
  );
  const clockInEmployee = () => executeAndRefresh('attendance.clock-in', {});
  const clockOutEmployee = () => executeAndRefresh('attendance.clock-out', {});
  const createEmployee = employee => executeAndRefresh('employees.create', {
    name: employee.name,
    phone: employee.phone,
    jobTitle: employee.role || '',
    hourlyRate: Number(employee.rate),
    leaveQuota: Number(employee.leaveQuota ?? 8)
  });
  const createShift = shift => executeAndRefresh('shifts.create', {
    employeeId: shift.employeeId,
    date: shift.date,
    startTime: shift.start,
    endTime: shift.end,
    note: shift.note || ''
  });
  const approveAttendanceHours = (attendanceId, hours, baseRevision) => executeAndRefresh(
    'attendance.approve-hours',
    { attendanceId, hours, baseRevision }
  );

  async function logout() {
    const activeClient = client;
    client = null;
    currentSession = null;
    currentUser = null;
    sessionStorage.removeItem(environment.storageKey('shift-postgres-auth'));
    stateStore.clearSensitive();
    document.dispatchEvent(new CustomEvent('postgres-session-cleared'));
    if (activeClient) await activeClient.logout();
  }

  window.shiftPostgresCloud = Object.freeze({
    connect,
    logout,
    refreshBootstrap,
    saveEmployeeLeave,
    saveBossLeave,
    clockInEmployee,
    clockOutEmployee,
    createEmployee,
    createShift,
    approveAttendanceHours,
    hasEmployeeSession: isEmployeeSession,
    isConnected: () => Boolean(currentSession),
    getSession: () => currentSession,
    getCurrentUser: () => currentUser
  });

  const cloudStatus = document.querySelector('#cloudStatus');
  if (cloudStatus) cloudStatus.textContent = 'PostgreSQL Staging';
})();
