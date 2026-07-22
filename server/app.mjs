import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { ApiError } from './errors.mjs';
import { bearerToken } from './jwt-verifier.mjs';
import { requestedWorkspace } from './tenant-context.mjs';

const MAX_BODY_BYTES = 1_048_576;

function securityHeaders(response) {
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
}

function json(response, status, body, requestId) {
  securityHeaders(response);
  response.statusCode = status;
  response.setHeader('X-Request-Id', requestId);
  response.end(JSON.stringify(body));
}

async function readJson(request) {
  const contentType = String(request.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
  if (contentType !== 'application/json') throw new ApiError(415, 'CONTENT_TYPE_INVALID', 'Content-Type 必須是 application/json。');
  const contentLengthHeader = String(request.headers['content-length'] || '').trim();
  if (contentLengthHeader) {
    const contentLength = Number(contentLengthHeader);
    if (!Number.isSafeInteger(contentLength) || contentLength < 0) {
      throw new ApiError(400, 'CONTENT_LENGTH_INVALID', 'Content-Length 格式不正確。');
    }
    if (contentLength > MAX_BODY_BYTES) {
      throw new ApiError(413, 'REQUEST_PAYLOAD_TOO_LARGE', 'Request 不得超過 1 MiB。');
    }
  }
  const chunks = [];
  let total = 0;
  for await (const chunk of request) {
    total += chunk.length;
    if (total > MAX_BODY_BYTES) throw new ApiError(413, 'REQUEST_PAYLOAD_TOO_LARGE', 'Request 超過 1 MiB。');
    chunks.push(chunk);
  }
  try {
    const raw = Buffer.concat(chunks).toString('utf8');
    return raw ? JSON.parse(raw) : {};
  } catch {
    throw new ApiError(400, 'JSON_INVALID', 'Request JSON 格式不正確。');
  }
}

function originAllowed(origin, allowedOrigins) {
  return !origin || allowedOrigins.has(origin);
}

export function createRequestHandler({ commandService, verifyAccessToken, pool, allowedOrigins = [] }) {
  const origins = new Set(allowedOrigins);
  return async (request, response) => {
    const requestId = /^[A-Za-z0-9._:-]{8,128}$/.test(String(request.headers['x-request-id'] || ''))
      ? String(request.headers['x-request-id']) : randomUUID();
    try {
      const url = new URL(request.url || '/', 'http://localhost');
      const origin = String(request.headers.origin || '');
      if (!originAllowed(origin, origins)) throw new ApiError(403, 'ORIGIN_NOT_ALLOWED', 'Origin 不允許。');
      if (origin) {
        response.setHeader('Access-Control-Allow-Origin', origin);
        response.setHeader('Vary', 'Origin');
      }
      if (request.method === 'OPTIONS') {
        response.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
        response.setHeader('Access-Control-Allow-Headers', 'Authorization,Content-Type,Idempotency-Key,X-Request-Id,X-Workspace-Id');
        response.statusCode = 204;
        response.end();
        return;
      }
      if (request.method === 'GET' && url.pathname === '/v1/health') {
        json(response, 200, { ok: true }, requestId);
        return;
      }
      if (request.method === 'GET' && url.pathname === '/v1/readiness') {
        await pool.query('SELECT 1');
        json(response, 200, { ok: true }, requestId);
        return;
      }
      const identity = await verifyAccessToken(bearerToken(request.headers));
      const workspaceId = requestedWorkspace(request.headers);
      if (request.method === 'POST' && url.pathname === '/v1/auth/session') {
        json(response, 201, await commandService.establishSession({ identity, workspaceId }), requestId);
        return;
      }
      if (request.method === 'POST' && url.pathname === '/v1/auth/logout') {
        json(response, 200, await commandService.logout({ identity, workspaceId }), requestId);
        return;
      }
      if (request.method === 'GET' && url.pathname === '/v1/employees') {
        json(response, 200, await commandService.listEmployees({ identity, workspaceId }), requestId);
        return;
      }
      if (request.method === 'GET' && url.pathname === '/v1/bootstrap') {
        json(response, 200, await commandService.bootstrap({ identity, workspaceId }), requestId);
        return;
      }
      const match = request.method === 'POST' && /^\/v1\/commands\/([a-z.-]+)$/.exec(url.pathname);
      if (match) {
        const input = await readJson(request);
        const result = await commandService.execute({
          identity,
          workspaceId,
          commandName: match[1],
          input,
          idempotencyKey: String(request.headers['idempotency-key'] || ''),
          requestId
        });
        json(response, result.replayed ? 200 : 201, result, requestId);
        return;
      }
      throw new ApiError(404, 'ROUTE_NOT_FOUND', '找不到 API route。');
    } catch (error) {
      const status = error instanceof ApiError ? error.status : 500;
      const code = error instanceof ApiError ? error.code : 'INTERNAL_ERROR';
      const message = error instanceof ApiError ? error.message : '伺服器發生未預期錯誤。';
      if (!(error instanceof ApiError)) console.error(JSON.stringify({ level: 'error', requestId, code, message: error.message }));
      json(response, status, { ok: false, error: message, code, requestId, ...(error.details ? { details: error.details } : {}) }, requestId);
    }
  };
}

export function createApiServer(options) {
  return createServer(createRequestHandler(options));
}
