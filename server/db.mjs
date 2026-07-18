import pg from 'pg';
import { assert } from './errors.mjs';

const { Pool } = pg;
const WORKSPACE_PATTERN = /^ws_[a-f0-9]{32}$/;
const UUID_PATTERN = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;

export function createPool(env = process.env) {
  const connectionString = String(env.DATABASE_URL || '').trim();
  if (!connectionString) throw new Error('缺少 DATABASE_URL。');
  const environment = String(env.BANK_ENV || 'local').toLowerCase();
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
