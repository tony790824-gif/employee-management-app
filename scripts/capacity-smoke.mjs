import process from 'node:process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function capacityConfig(env = process.env) {
  if (String(env.BANK_ENV || '').toLowerCase() !== 'staging') {
    throw new Error('Capacity smoke is restricted to BANK_ENV=staging.');
  }
  const target = new URL(String(env.BANK_CAPACITY_TARGET_URL || '').trim());
  if (target.protocol !== 'https:' || target.username || target.password || target.search || target.hash) {
    throw new Error('BANK_CAPACITY_TARGET_URL must be a credential-free HTTPS Staging URL.');
  }
  const approvedHost = String(env.BANK_CAPACITY_STAGING_HOST || '').trim().toLowerCase();
  if (!approvedHost || target.hostname.toLowerCase() !== approvedHost || /production|prod\./i.test(target.hostname)) {
    throw new Error('Capacity target does not match the approved Staging host.');
  }
  const requests = Number(env.BANK_CAPACITY_REQUESTS || 60);
  const concurrency = Number(env.BANK_CAPACITY_CONCURRENCY || 5);
  const route = String(env.BANK_CAPACITY_ROUTE || '/v1/readiness').trim();
  if (!['/v1/readiness', '/v1/bootstrap/revision'].includes(route)) {
    throw new Error('Capacity route must be readiness or bootstrap revision.');
  }
  if (!Number.isSafeInteger(requests) || requests < 1 || requests > 600
    || !Number.isSafeInteger(concurrency) || concurrency < 1 || concurrency > 20) {
    throw new Error('Capacity request/concurrency limits are invalid.');
  }
  const accessToken = String(env.BANK_CAPACITY_ACCESS_TOKEN || '').trim();
  const workspaceId = String(env.BANK_CAPACITY_WORKSPACE_ID || '').trim();
  if (route === '/v1/bootstrap/revision'
    && (!accessToken || !/^ws_[a-f0-9]{32}$/.test(workspaceId))) {
    throw new Error('Authenticated revision capacity smoke requires protected token and valid Workspace ID.');
  }
  const p95LimitMs = Number(env.BANK_CAPACITY_P95_LIMIT_MS || 750);
  if (!Number.isSafeInteger(p95LimitMs) || p95LimitMs < 100 || p95LimitMs > 10_000) {
    throw new Error('Capacity p95 limit is invalid.');
  }
  return Object.freeze({ target, requests, concurrency, route, accessToken, workspaceId, p95LimitMs });
}

export async function runCapacitySmoke(config, fetcher = fetch) {
  const durations = [];
  let next = 0;
  let failures = 0;
  async function worker() {
    while (next < config.requests) {
      next += 1;
      const started = performance.now();
      try {
        const headers = { Accept: 'application/json' };
        if (config.route === '/v1/bootstrap/revision') {
          headers.Authorization = `Bearer ${config.accessToken}`;
          headers['X-Workspace-Id'] = config.workspaceId;
        }
        const response = await fetcher(new URL(config.route, config.target), {
          headers, signal: AbortSignal.timeout(8_000)
        });
        if (!response.ok) failures += 1;
      } catch {
        failures += 1;
      }
      durations.push(performance.now() - started);
    }
  }
  await Promise.all(Array.from({ length: config.concurrency }, () => worker()));
  const ordered = durations.sort((a, b) => a - b);
  const p95 = Math.round(ordered[Math.max(0, Math.ceil(ordered.length * 0.95) - 1)] || 0);
  if (failures) throw new Error(`Capacity smoke failed ${failures} of ${config.requests} read-only requests.`);
  if (p95 > config.p95LimitMs) throw new Error(`Capacity smoke p95 ${p95}ms exceeds the approved limit.`);
  return Object.freeze({ route: config.route, requests: config.requests, concurrency: config.concurrency, failures, p95Ms: p95 });
}

async function main() {
  const result = await runCapacitySmoke(capacityConfig());
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (path.resolve(process.argv[1] || '') === path.resolve(fileURLToPath(import.meta.url))) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
