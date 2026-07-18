import pg from 'pg';
import { assert } from './errors.mjs';

const { Pool } = pg;
const WORKSPACE_PATTERN = /^ws_[a-f0-9]{32}$/;
const UUID_PATTERN = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;

function normalizedHost(value) {
  return String(value || '').trim().toLowerCase().replace('-pooler.', '.');
}

export function createPool(env = process.env) {
  const environment = String(env.BANK_ENV || 'local').toLowerCase();
  const connectionString = String(env.DATABASE_API_URL || env.DATABASE_URL || '').trim();
  if (!connectionString) throw new Error('缺少 DATABASE_API_URL。');
  if (environment !== 'local' && !String(env.DATABASE_API_URL || '').trim()) {
    throw new Error('Staging/Production API 必須使用獨立的 DATABASE_API_URL 最小權限角色。');
  }
  if (environment === 'staging') {
    const expectedHost = String(env.BANK_STAGING_DATABASE_HOST || '').trim();
    if (!expectedHost) throw new Error('Staging PostgreSQL 缺少 BANK_STAGING_DATABASE_HOST 安全邊界。');
    if (normalizedHost(new URL(connectionString).hostname) !== normalizedHost(expectedHost)) {
      throw new Error('DATABASE_API_URL 不符合已確認的 Staging PostgreSQL host，已停止。');
    }
  }
  const migratorConnectionString = String(env.DATABASE_MIGRATOR_URL || '').trim();
  if (migratorConnectionString) {
    const apiRole = new URL(connectionString).username;
    const migratorRole = new URL(migratorConnectionString).username;
    if (apiRole === migratorRole) throw new Error('API 與 Migration 不得共用資料庫角色。');
  }
  const sslMode = String(env.DATABASE_SSL || (environment === 'local' ? 'disable' : 'require')).toLowerCase();
  if (environment === 'production' && sslMode !== 'require') throw new Error('Production PostgreSQL 必須啟用 TLS。');
  return new Pool({
    connectionString,
    ssl: sslMode === 'require' ? { rejectUnauthorized: true } : false,
    max: Number(env.DATABASE_POOL_MAX || 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    statement_timeout: 10_000,
    application_name: `banke-api-${environment}`
  });
}

export async function withTenantTransaction(pool, principal, callback) {
  assert(WORKSPACE_PATTERN.test(String(principal?.workspaceId || '')), 401, 'AUTH_CONTEXT_INVALID', '登入資訊缺少有效工作區。');
  assert(UUID_PATTERN.test(String(principal?.userId || '')), 401, 'AUTH_CONTEXT_INVALID', '登入資訊缺少有效使用者。');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.current_workspace_id', $1, true)", [principal.workspaceId]);
    await client.query("SELECT set_config('app.current_user_id', $1, true)", [principal.userId]);
    const membership = await client.query(
      `SELECT wm.role, wm.employee_id, wm.status, w.status AS workspace_status
         FROM workspace_members wm
         JOIN workspaces w ON w.id = wm.workspace_id
        WHERE wm.workspace_id = $1 AND wm.user_id = $2
        FOR SHARE`,
      [principal.workspaceId, principal.userId]
    );
    const member = membership.rows[0];
    assert(member && member.status === 'active' && member.workspace_status === 'active', 403, 'WORKSPACE_ACCESS_DENIED', '工作區或成員狀態無法使用。');
    await client.query("SELECT set_config('app.current_role', $1, true)", [member.role]);
    const result = await callback({ client, member, workspaceId: principal.workspaceId, userId: principal.userId });
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
