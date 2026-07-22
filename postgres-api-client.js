(() => {
  const MAX_REQUEST_BYTES = 1_048_576;
  const MAX_RESPONSE_BYTES = 2_097_152;
  const DEFAULT_TIMEOUT_MS = 15_000;
  const WORKSPACE_PATTERN = /^ws_[a-f0-9]{32}$/;
  const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/;
  const COMMAND_NAMES = Object.freeze([
    'employees.create',
    'shifts.create',
    'leaves.replace-month',
    'attendance.clock-in',
    'attendance.clock-out',
    'attendance.approve-hours'
  ]);

  class PostgresApiError extends Error {
    constructor(message, { code = 'POSTGRES_API_REQUEST_FAILED', status = 0, requestId = '' } = {}) {
      super(message);
      this.name = 'PostgresApiError';
      this.code = code;
      this.status = status;
      this.requestId = requestId;
    }
  }

  const byteLength = value => new TextEncoder().encode(value).byteLength;
  const isLoopback = hostname => ['localhost', '127.0.0.1', '[::1]', '::1'].includes(hostname.toLowerCase());

  function normalizeBaseUrl(value) {
    let url;
    try {
      url = new URL(String(value || '').trim());
    } catch {
      throw new PostgresApiError('PostgreSQL API URL 格式不正確。', { code: 'POSTGRES_API_CONFIG_INVALID' });
    }
    if (url.username || url.password || url.search || url.hash) {
      throw new PostgresApiError('PostgreSQL API URL 不得包含憑證、查詢參數或 fragment。', { code: 'POSTGRES_API_CONFIG_INVALID' });
    }
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLoopback(url.hostname))) {
      throw new PostgresApiError('PostgreSQL API 僅允許 HTTPS；本機 loopback 可使用 HTTP。', { code: 'POSTGRES_API_CONFIG_INVALID' });
    }
    url.pathname = url.pathname.replace(/\/$/, '');
    return url.href.replace(/\/$/, '');
  }

  function createPostgresApiClient({
    baseUrl,
    getAccessToken,
    getWorkspaceId,
    fetchImpl = globalThis.fetch,
    cryptoImpl = globalThis.crypto,
    eventTarget = globalThis,
    timeoutMs = DEFAULT_TIMEOUT_MS
  }) {
    const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
    if (typeof getAccessToken !== 'function' || typeof getWorkspaceId !== 'function' || typeof fetchImpl !== 'function') {
      throw new PostgresApiError('PostgreSQL API Client 缺少必要依賴。', { code: 'POSTGRES_API_CONFIG_INVALID' });
    }
    if (!cryptoImpl || typeof cryptoImpl.randomUUID !== 'function') {
      throw new PostgresApiError('瀏覽器不支援安全的 request ID。', { code: 'POSTGRES_API_CONFIG_INVALID' });
    }
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 60_000) {
      throw new PostgresApiError('PostgreSQL API timeout 設定不正確。', { code: 'POSTGRES_API_CONFIG_INVALID' });
    }

    async function request(path, { method = 'GET', body, idempotencyKey = '', authenticated = true } = {}) {
      const headers = { Accept: 'application/json', 'X-Request-Id': cryptoImpl.randomUUID() };
      if (authenticated) {
        const token = String(await getAccessToken() || '').trim();
        const workspaceId = String(await getWorkspaceId() || '').trim();
        if (!token || token.length > 16_384) {
          throw new PostgresApiError('登入狀態無法使用。', { code: 'ACCESS_TOKEN_INVALID' });
        }
        if (!WORKSPACE_PATTERN.test(workspaceId)) {
          throw new PostgresApiError('工作區識別碼格式不正確。', { code: 'WORKSPACE_ID_INVALID' });
        }
        headers.Authorization = `Bearer ${token}`;
        // This is only a requested scope. The API/database must re-authorize live membership.
        headers['X-Workspace-Id'] = workspaceId;
      }
      if (idempotencyKey) {
        if (!IDEMPOTENCY_KEY_PATTERN.test(idempotencyKey)) {
          throw new PostgresApiError('Idempotency key 格式不正確。', { code: 'IDEMPOTENCY_KEY_INVALID' });
        }
        headers['Idempotency-Key'] = idempotencyKey;
      }

      let serializedBody;
      if (body !== undefined) {
        serializedBody = JSON.stringify(body);
        if (byteLength(serializedBody) > MAX_REQUEST_BYTES) {
          throw new PostgresApiError('Request 不得超過 1 MiB。', { code: 'REQUEST_PAYLOAD_TOO_LARGE', status: 413 });
        }
        headers['Content-Type'] = 'application/json';
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      let response;
      try {
        response = await fetchImpl(`${normalizedBaseUrl}${path}`, {
          method,
          headers,
          body: serializedBody,
          signal: controller.signal,
          credentials: 'omit',
          cache: 'no-store',
          redirect: 'error'
        });
      } catch (error) {
        if (error?.name === 'AbortError') {
          throw new PostgresApiError('PostgreSQL API 連線逾時。', { code: 'POSTGRES_API_TIMEOUT' });
        }
        throw new PostgresApiError('PostgreSQL API 無法連線。', { code: 'POSTGRES_API_UNAVAILABLE' });
      } finally {
        clearTimeout(timer);
      }

      const contentLength = Number(response.headers?.get?.('content-length') || 0);
      if (Number.isFinite(contentLength) && contentLength > MAX_RESPONSE_BYTES) {
        throw new PostgresApiError('PostgreSQL API 回應過大。', { code: 'POSTGRES_API_RESPONSE_TOO_LARGE' });
      }
      const text = await response.text();
      if (byteLength(text) > MAX_RESPONSE_BYTES) {
        throw new PostgresApiError('PostgreSQL API 回應過大。', { code: 'POSTGRES_API_RESPONSE_TOO_LARGE' });
      }

      let payload = {};
      if (text) {
        try {
          payload = JSON.parse(text);
        } catch {
          throw new PostgresApiError('PostgreSQL API 回應格式不正確。', {
            code: 'POSTGRES_API_RESPONSE_INVALID', status: response.status
          });
        }
      }
      if (!response.ok) {
        const error = new PostgresApiError(
          typeof payload?.error === 'string' && payload.error ? payload.error : 'PostgreSQL API request failed.',
          {
            code: typeof payload?.code === 'string' && payload.code ? payload.code : 'POSTGRES_API_REQUEST_FAILED',
            status: response.status,
            requestId: typeof payload?.requestId === 'string' ? payload.requestId : ''
          }
        );
        if ([401, 403].includes(response.status) && typeof eventTarget?.dispatchEvent === 'function') {
          eventTarget.dispatchEvent(new CustomEvent('shift-postgres-session-invalid', {
            detail: Object.freeze({ code: error.code, status: error.status })
          }));
        }
        throw error;
      }
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        throw new PostgresApiError('PostgreSQL API 回應格式不正確。', {
          code: 'POSTGRES_API_RESPONSE_INVALID', status: response.status
        });
      }
      return payload;
    }

    return Object.freeze({
      health: () => request('/health', { authenticated: false }),
      readiness: () => request('/readiness', { authenticated: false }),
      establishSession: () => request('/auth/session', { method: 'POST' }),
      logout: () => request('/auth/logout', { method: 'POST' }),
      listEmployees: () => request('/employees'),
      bootstrap: () => request('/bootstrap'),
      executeCommand(commandName, input, { idempotencyKey = cryptoImpl.randomUUID() } = {}) {
        if (!COMMAND_NAMES.includes(commandName)) {
          throw new PostgresApiError('Command 不在允許清單。', { code: 'COMMAND_NOT_FOUND', status: 404 });
        }
        return request(`/commands/${commandName}`, { method: 'POST', body: input, idempotencyKey });
      }
    });
  }

  globalThis.BankePostgresApi = Object.freeze({ createClient: createPostgresApiClient, PostgresApiError, commandNames: COMMAND_NAMES });
})();
