(() => {
  'use strict';

  const environment = window.shiftEnvironment;
  if (environment?.dataBackend !== 'postgres') return;

  const stateStore = window.shiftStateStore;
  const workspacePattern = /^ws_[a-f0-9]{32}$/;
  let client = null;
  let currentSession = null;

  const isEmployeeSession = () => currentSession?.role === 'employee' && Boolean(currentSession.employeeId);

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

  async function refreshBootstrap() {
    if (!client) throw new Error('PostgreSQL Staging 尚未連線。');
    const bootstrap = validateBootstrap(await client.bootstrap());
    stateStore.write(bootstrap.data);
    currentSession = Object.freeze({ role: bootstrap.role, employeeId: bootstrap.employeeId || '' });
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
    if (client) await client.logout();
    currentSession = null;
    sessionStorage.removeItem(environment.storageKey('shift-postgres-auth'));
    stateStore.clearSensitive();
  }

  window.shiftPostgresCloud = Object.freeze({
    connect,
    logout,
    refreshBootstrap,
    saveEmployeeLeave,
    clockInEmployee,
    clockOutEmployee,
    createEmployee,
    createShift,
    approveAttendanceHours,
    hasEmployeeSession: isEmployeeSession,
    isConnected: () => Boolean(currentSession),
    getSession: () => currentSession
  });

  const cloudStatus = document.querySelector('#cloudStatus');
  if (cloudStatus) cloudStatus.textContent = 'PostgreSQL Staging';
})();
