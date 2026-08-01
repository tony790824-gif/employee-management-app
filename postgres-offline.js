(() => {
  'use strict';

  const VERSION = 1;
  const MAX_QUEUE_ITEMS = 100;
  const MAX_RECORD_BYTES = 131_072;
  const MAX_STORE_BYTES = 2_097_152;
  const BASE_RETRY_MS = 1_000;
  const MAX_RETRY_MS = 60_000;
  const RESOURCE_NAMES = new Set(['bootstrap', 'timeOff', 'notifications']);
  const QUEUEABLE_COMMANDS = new Set([
    'attendance.clock-in',
    'attendance.clock-out',
    'leaves.replace-month',
    'shifts.create',
    'schedule-leave-requests.submit',
    'schedule-leave-requests.cancel',
    'leave-requests.submit',
    'leave-requests.cancel'
  ]);
  const NETWORK_ERROR_CODES = new Set(['POSTGRES_API_TIMEOUT', 'POSTGRES_API_UNAVAILABLE']);

  class OfflineRuntimeError extends Error {
    constructor(message, code) {
      super(message);
      this.name = 'OfflineRuntimeError';
      this.code = code;
    }
  }

  const byteLength = value => new TextEncoder().encode(value).byteLength;
  const objectValue = value => value && typeof value === 'object' && !Array.isArray(value);
  const stableJson = value => {
    if (value === undefined) return 'null';
    if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
    if (objectValue(value)) {
      return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
    }
    return JSON.stringify(value);
  };
  const clone = value => JSON.parse(JSON.stringify(value));
  const emptyState = ownerKey => ({ version: VERSION, ownerKey, resources: {}, queue: [] });

  function create({
    storage = globalThis.localStorage,
    storageKey,
    cryptoImpl = globalThis.crypto,
    now = () => Date.now()
  } = {}) {
    if (!storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function'
      || typeof storage.removeItem !== 'function' || typeof storageKey !== 'string' || !storageKey) {
      throw new OfflineRuntimeError('離線儲存設定不完整。', 'OFFLINE_STORAGE_UNAVAILABLE');
    }
    if (!cryptoImpl || typeof cryptoImpl.randomUUID !== 'function') {
      throw new OfflineRuntimeError('瀏覽器不支援安全的離線操作識別碼。', 'OFFLINE_STORAGE_UNAVAILABLE');
    }

    let ownerKey = '';
    let drainPromise = null;

    function parseState() {
      const raw = storage.getItem(storageKey);
      if (!raw) return emptyState(ownerKey);
      try {
        const parsed = JSON.parse(raw);
        if (!objectValue(parsed) || parsed.version !== VERSION || typeof parsed.ownerKey !== 'string'
          || !objectValue(parsed.resources) || !Array.isArray(parsed.queue)) {
          throw new TypeError('Invalid offline state');
        }
        return parsed;
      } catch {
        storage.removeItem(storageKey);
        return emptyState(ownerKey);
      }
    }

    function writeState(state) {
      const serialized = JSON.stringify(state);
      if (byteLength(serialized) > MAX_STORE_BYTES) {
        throw new OfflineRuntimeError('離線資料空間已滿，請連線後再操作。', 'OFFLINE_STORAGE_FULL');
      }
      try {
        storage.setItem(storageKey, serialized);
      } catch {
        throw new OfflineRuntimeError('瀏覽器無法安全保存離線操作。', 'OFFLINE_STORAGE_UNAVAILABLE');
      }
      return state;
    }

    function bindOwner(value) {
      if (!/^[a-f0-9]{64}$/.test(String(value || ''))) {
        throw new OfflineRuntimeError('離線使用者綁定無效。', 'OFFLINE_OWNER_INVALID');
      }
      ownerKey = value;
      const state = parseState();
      if (state.ownerKey && state.ownerKey !== ownerKey) writeState(emptyState(ownerKey));
      else if (!state.ownerKey) {
        state.ownerKey = ownerKey;
        writeState(state);
      }
      return ownerKey;
    }

    function requireOwner() {
      if (!ownerKey) throw new OfflineRuntimeError('離線使用者尚未綁定。', 'OFFLINE_OWNER_INVALID');
      const state = parseState();
      if (state.ownerKey !== ownerKey) {
        throw new OfflineRuntimeError('離線資料不屬於目前登入者。', 'OFFLINE_OWNER_MISMATCH');
      }
      return state;
    }

    function cacheResource(name, payload) {
      if (!RESOURCE_NAMES.has(name)) throw new OfflineRuntimeError('離線資源不在允許清單。', 'OFFLINE_RESOURCE_INVALID');
      const serialized = JSON.stringify(payload);
      if (byteLength(serialized) > MAX_RECORD_BYTES * 8) {
        throw new OfflineRuntimeError('離線資源過大。', 'OFFLINE_STORAGE_FULL');
      }
      const state = requireOwner();
      state.resources[name] = { cachedAt: now(), payload: clone(payload) };
      writeState(state);
      return payload;
    }

    function readResource(name) {
      if (!RESOURCE_NAMES.has(name) || !ownerKey) return null;
      const state = requireOwner();
      return state.resources[name] ? clone(state.resources[name].payload) : null;
    }

    function enqueue({ commandName, input, baseRevision, idempotencyKey }) {
      if (!QUEUEABLE_COMMANDS.has(commandName)) {
        throw new OfflineRuntimeError('這項操作不支援離線送出。', 'OFFLINE_COMMAND_NOT_ALLOWED');
      }
      if (!Number.isSafeInteger(baseRevision) || baseRevision < 0) {
        throw new OfflineRuntimeError('離線操作缺少有效資料版本。', 'OFFLINE_REVISION_INVALID');
      }
      const normalizedInput = clone(objectValue(input) ? input : {});
      if (byteLength(JSON.stringify(normalizedInput)) > MAX_RECORD_BYTES) {
        throw new OfflineRuntimeError('離線操作資料過大。', 'OFFLINE_COMMAND_TOO_LARGE');
      }
      const state = requireOwner();
      const fingerprint = stableJson({ commandName, input: normalizedInput });
      const duplicate = state.queue.find(item => item.status === 'pending' && item.fingerprint === fingerprint);
      if (duplicate) return { ...clone(duplicate), duplicate: true };
      if (state.queue.length >= MAX_QUEUE_ITEMS) {
        throw new OfflineRuntimeError('待同步操作過多，請恢復網路後再操作。', 'OFFLINE_QUEUE_FULL');
      }
      const record = {
        id: cryptoImpl.randomUUID(),
        commandName,
        input: normalizedInput,
        idempotencyKey: String(idempotencyKey || cryptoImpl.randomUUID()),
        fingerprint,
        baseRevision,
        attempts: 0,
        nextAttemptAt: now(),
        createdAt: now(),
        status: 'pending'
      };
      state.queue.push(record);
      writeState(state);
      return clone(record);
    }

    function queueSnapshot() {
      if (!ownerKey) return [];
      return clone(requireOwner().queue);
    }

    function clearQueue() {
      if (!ownerKey) return;
      const state = requireOwner();
      state.queue = [];
      writeState(state);
    }

    function clearAll() {
      ownerKey = '';
      drainPromise = null;
      storage.removeItem(storageKey);
    }

    async function drain({ getRevision, execute, onChange } = {}) {
      if (drainPromise) return drainPromise;
      if (typeof getRevision !== 'function' || typeof execute !== 'function') {
        throw new OfflineRuntimeError('離線同步缺少必要處理器。', 'OFFLINE_DRAIN_INVALID');
      }
      drainPromise = (async () => {
        let completed = 0;
        while (true) {
          const state = requireOwner();
          const record = state.queue.find(item => item.status === 'pending');
          if (!record) return { completed, pending: state.queue.length, retryAt: 0 };
          if (record.nextAttemptAt > now()) {
            return { completed, pending: state.queue.length, retryAt: record.nextAttemptAt };
          }

          let remoteRevision;
          try {
            remoteRevision = await getRevision();
          } catch (error) {
            if (!NETWORK_ERROR_CODES.has(error?.code)) throw error;
            record.attempts += 1;
            record.nextAttemptAt = now() + Math.min(MAX_RETRY_MS, BASE_RETRY_MS * (2 ** Math.min(record.attempts - 1, 6)));
            writeState(state);
            onChange?.({ type: 'retry', record: clone(record) });
            return { completed, pending: state.queue.length, retryAt: record.nextAttemptAt };
          }
          if (!Number.isSafeInteger(remoteRevision) || remoteRevision < 0) {
            throw new OfflineRuntimeError('伺服器資料版本無效。', 'OFFLINE_REVISION_INVALID');
          }
          if (remoteRevision !== record.baseRevision) {
            record.status = 'conflict';
            record.remoteRevision = remoteRevision;
            writeState(state);
            onChange?.({ type: 'conflict', record: clone(record) });
            return { completed, pending: state.queue.length, conflict: true, retryAt: 0 };
          }

          try {
            const outcome = await execute(clone(record));
            const nextRevision = Number(outcome?.revision);
            if (!Number.isSafeInteger(nextRevision) || nextRevision < remoteRevision) {
              throw new OfflineRuntimeError('操作完成後缺少有效資料版本。', 'OFFLINE_REVISION_INVALID');
            }
            const latest = requireOwner();
            latest.queue = latest.queue.filter(item => item.id !== record.id);
            latest.queue.forEach(item => {
              if (item.status === 'pending' && item.baseRevision === remoteRevision) item.baseRevision = nextRevision;
            });
            writeState(latest);
            completed += 1;
            onChange?.({ type: 'completed', record: clone(record), revision: nextRevision });
          } catch (error) {
            const latest = requireOwner();
            const target = latest.queue.find(item => item.id === record.id);
            if (!target) throw error;
            if (NETWORK_ERROR_CODES.has(error?.code)) {
              target.attempts += 1;
              target.nextAttemptAt = now() + Math.min(MAX_RETRY_MS, BASE_RETRY_MS * (2 ** Math.min(target.attempts - 1, 6)));
              writeState(latest);
              onChange?.({ type: 'retry', record: clone(target) });
              return { completed, pending: latest.queue.length, retryAt: target.nextAttemptAt };
            }
            target.status = 'failed';
            target.errorCode = String(error?.code || 'OFFLINE_COMMAND_FAILED').slice(0, 64);
            writeState(latest);
            onChange?.({ type: 'failed', record: clone(target) });
            return { completed, pending: latest.queue.length, failed: true, retryAt: 0 };
          }
        }
      })().finally(() => { drainPromise = null; });
      return drainPromise;
    }

    return Object.freeze({
      bindOwner,
      cacheResource,
      readResource,
      enqueue,
      drain,
      queueSnapshot,
      clearQueue,
      clearAll,
      isQueueable: commandName => QUEUEABLE_COMMANDS.has(commandName),
      isNetworkError: error => NETWORK_ERROR_CODES.has(error?.code),
      isDraining: () => Boolean(drainPromise)
    });
  }

  window.BankePostgresOffline = Object.freeze({ create, OfflineRuntimeError });
})();
