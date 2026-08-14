import { EventEmitter } from 'node:events';
import { createApiRuntime } from './runtime.mjs';

const FUNCTION_PREFIX = '/.netlify/functions/api';

function requestPath(url) {
  if (!url.pathname.startsWith(FUNCTION_PREFIX)) return `${url.pathname}${url.search}`;
  const suffix = url.pathname.slice(FUNCTION_PREFIX.length);
  return `/v1${suffix || '/'}${url.search}`;
}

function requestHeaders(headers) {
  const result = {};
  for (const [name, value] of headers.entries()) result[name.toLowerCase()] = value;
  return result;
}

class BufferedResponse extends EventEmitter {
  constructor() {
    super();
    this.statusCode = 200;
    this.headers = new Headers();
    this.body = Buffer.alloc(0);
    this.finished = false;
  }

  setHeader(name, value) {
    if (Array.isArray(value)) {
      this.headers.delete(name);
      for (const item of value) this.headers.append(name, String(item));
      return;
    }
    this.headers.set(name, String(value));
  }

  end(body = '') {
    if (this.finished) throw new Error('Response already finished.');
    this.body = Buffer.isBuffer(body) ? body : Buffer.from(String(body), 'utf8');
    this.finished = true;
    this.emit('finish');
  }

  toResponse(method) {
    if (!this.finished) throw new Error('Request handler did not finish the response.');
    const bodyAllowed = method !== 'HEAD' && ![204, 304].includes(this.statusCode);
    return new Response(bodyAllowed ? this.body : null, {
      status: this.statusCode,
      headers: this.headers
    });
  }
}

export async function invokeRequestHandler(requestHandler, request, context = {}) {
  if (!(request instanceof Request)) throw new Error('Netlify API adapter requires a Request.');
  const url = new URL(request.url);
  const body = Buffer.from(await request.arrayBuffer());
  const nodeRequest = {
    method: request.method,
    url: requestPath(url),
    headers: requestHeaders(request.headers),
    socket: Object.freeze({ remoteAddress: String(context.ip || '') }),
    async *[Symbol.asyncIterator]() {
      if (body.length) yield body;
    }
  };
  const nodeResponse = new BufferedResponse();
  await requestHandler(nodeRequest, nodeResponse);
  return nodeResponse.toResponse(request.method);
}

function unavailableResponse() {
  return new Response(JSON.stringify({
    ok: false,
    error: '服務尚未就緒。',
    code: 'SERVICE_NOT_READY'
  }), {
    status: 503,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff'
    }
  });
}

export function createNetlifyApiHandler({
  runtimeFactory = () => createApiRuntime(),
  logger = console
} = {}) {
  let runtimePromise = null;

  async function readyRuntime() {
    runtimePromise ||= (async () => {
      const runtime = runtimeFactory();
      await runtime.ensureReady();
      return runtime;
    })().catch(error => {
      runtimePromise = null;
      throw error;
    });
    return runtimePromise;
  }

  return async (request, context) => {
    try {
      const runtime = await readyRuntime();
      return await invokeRequestHandler(runtime.requestHandler, request, context);
    } catch {
      logger.error(JSON.stringify({
        level: 'error',
        event: 'netlify_api_invocation',
        outcome: 'failed_closed',
        errorCode: 'SERVICE_NOT_READY'
      }));
      return unavailableResponse();
    }
  };
}
