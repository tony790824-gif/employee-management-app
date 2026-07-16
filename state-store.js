(() => {
  const CURRENT_KEY = 'shift-app-data-v3';
  const PRIOR_KEYS = ['shift-app-data-v2', 'shift-app-data-v1'];
  const CORRUPT_BACKUP_KEY = 'shift-app-data-corrupt-backup';
  const SYNC_CONFLICT_BACKUP_KEY = 'shift-sync-conflict-backup';
  const SCHEMA_VERSION = 1;
  const ARRAY_FIELDS = ['employees', 'shifts', 'attendance', 'leaveHistory', 'removedEmployees'];
  const OBJECT_FIELDS = ['workspace', 'sync', 'leaves', 'leaveRequests', 'access', 'payrollAdjustments'];
  let recovery = null;

  const objectValue = value => value && typeof value === 'object' && !Array.isArray(value);

  function migrate(data) {
    const version = Number(data && data.sync && data.sync.schemaVersion) || 0;
    if (version >= SCHEMA_VERSION) return data;
    if (version === 0) {
      data.sync = data.sync || {};
      data.sync.schemaVersion = 1;
    }
    return data;
  }

  function normalize(value, fallback = {}) {
    const migrated = migrate(objectValue(value) ? value : objectValue(fallback) ? fallback : {});
    const state = { ...migrated };
    ARRAY_FIELDS.forEach(field => { if (!Array.isArray(state[field])) state[field] = []; });
    OBJECT_FIELDS.forEach(field => { if (!objectValue(state[field])) state[field] = {}; });
    const revision = Number(state.sync.revision);
    const schemaVersion = Number(state.sync.schemaVersion);
    state.sync = {
      revision: Number.isSafeInteger(revision) && revision >= 0 ? revision : 0,
      schemaVersion: Number.isSafeInteger(schemaVersion) && schemaVersion >= 0 ? schemaVersion : SCHEMA_VERSION
    };
    state.removedEmployees = state.removedEmployees.filter(record => record && typeof record === 'object');
    return state;
  }

  function quarantine(sourceKey, raw, error) {
    if (recovery) return;
    const record = {
      sourceKey,
      capturedAt: new Date().toISOString(),
      raw,
      reason: error instanceof Error ? error.message : 'Invalid JSON'
    };
    let backupSaved = false;
    try {
      localStorage.setItem(CORRUPT_BACKUP_KEY, JSON.stringify(record));
      backupSaved = true;
    } catch {}
    recovery = { sourceKey, backupSaved };
  }

  function write(value) {
    const state = normalize(value);
    localStorage.setItem(CURRENT_KEY, JSON.stringify(state));
    return state;
  }

  function read(fallback = {}) {
    for (const sourceKey of [CURRENT_KEY, ...PRIOR_KEYS]) {
      const raw = localStorage.getItem(sourceKey);
      if (raw === null) continue;
      try {
        const parsed = JSON.parse(raw);
        if (!objectValue(parsed)) throw new TypeError('State root must be an object');
        const state = normalize(parsed, fallback);
        if (sourceKey !== CURRENT_KEY || JSON.stringify(state) !== raw) write(state);
        return state;
      } catch (error) {
        quarantine(sourceKey, raw, error);
      }
    }
    return write(normalize(recovery ? {} : fallback));
  }

  function consumeRecovery() {
    const result = recovery;
    recovery = null;
    return result;
  }

  function clearSensitive() {
    [CURRENT_KEY, ...PRIOR_KEYS, CORRUPT_BACKUP_KEY, SYNC_CONFLICT_BACKUP_KEY].forEach(key => localStorage.removeItem(key));
    recovery = null;
  }

  window.shiftStateStore = Object.freeze({
    key: CURRENT_KEY,
    corruptBackupKey: CORRUPT_BACKUP_KEY,
    syncConflictBackupKey: SYNC_CONFLICT_BACKUP_KEY,
    schemaVersion: SCHEMA_VERSION,
    normalize,
    read,
    write,
    clearSensitive,
    consumeRecovery
  });
})();
