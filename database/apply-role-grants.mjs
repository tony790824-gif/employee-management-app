import process from 'node:process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { databaseConfig } from './migrate.mjs';

const { Client } = pg;
const API_TABLES = Object.freeze([
  'workspaces',
  'workspace_members',
  'employees',
  'shifts',
  'leave_selections',
  'attendance_records',
  'payroll_adjustments',
  'command_receipts',
  'audit_logs',
  'outbox_events'
]);

function requiredApiUrl(env = process.env) {
  const value = String(env.DATABASE_API_URL || '').trim();
  if (!value) throw new Error('缺少 DATABASE_API_URL。');
  return new URL(value);
}

async function quoted(client, format, ...values) {
  const parameters = values.map((_, index) => `$${index + 2}::text`).join(', ');
  const result = await client.query(`SELECT format($1::text, ${parameters}) AS sql`, [format, ...values]);
  return result.rows[0].sql;
}

export async function applyApiRoleGrants(client, apiUrl) {
  const role = apiUrl.username;
  const password = apiUrl.password;
  if (!/^[a-z][a-z0-9_]{2,62}$/.test(role) || !password) throw new Error('DATABASE_API_URL role/password 格式不正確。');
  const existing = await client.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [role]);
  const roleSql = existing.rows[0]
    ? await quoted(client, 'ALTER ROLE %I PASSWORD %L', role, password)
    : await quoted(client, 'CREATE ROLE %I LOGIN NOINHERIT CONNECTION LIMIT 20 PASSWORD %L', role, password);
  await client.query(roleSql);
  if (existing.rows[0]) await client.query(await quoted(client, 'ALTER ROLE %I NOINHERIT CONNECTION LIMIT 20', role));
  const capability = (await client.query(
    'SELECT rolsuper, rolcreaterole, rolcreatedb, rolreplication, rolbypassrls FROM pg_roles WHERE rolname = $1',
    [role]
  )).rows[0];
  if (!capability || capability.rolsuper || capability.rolcreaterole || capability.rolcreatedb || capability.rolreplication || capability.rolbypassrls) {
    throw new Error('API role 具有超出允許範圍的資料庫能力。');
  }
  await client.query(await quoted(client, "ALTER ROLE %I SET statement_timeout = '10s'", role));
  await client.query(await quoted(client, 'ALTER ROLE %I SET search_path = public, pg_temp', role));
  const database = (await client.query('SELECT current_database() AS name')).rows[0].name;
  await client.query(await quoted(client, 'REVOKE ALL ON DATABASE %I FROM %I', database, role));
  await client.query(await quoted(client, 'GRANT CONNECT ON DATABASE %I TO %I', database, role));
  await client.query(await quoted(client, 'GRANT USAGE ON SCHEMA public, app_private TO %I', role));
  await client.query(await quoted(client, `REVOKE ALL ON ALL TABLES IN SCHEMA public FROM %I`, role));
  await client.query(await quoted(client, `GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE ${API_TABLES.join(', ')} TO %I`, role));
  await client.query('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA app_private FROM PUBLIC');
  await client.query(await quoted(client, 'GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app_private TO %I', role));
  return { role, tables: API_TABLES.length };
}

async function main() {
  const config = databaseConfig();
  if (config.environment !== 'staging') throw new Error('此工具只允許 BANK_ENV=staging。');
  const apiUrl = requiredApiUrl();
  const migratorUrl = new URL(config.connectionString);
  if (apiUrl.hostname.replace('-pooler.', '.') !== migratorUrl.hostname.replace('-pooler.', '.') || apiUrl.pathname !== migratorUrl.pathname) {
    throw new Error('DATABASE_API_URL 與 DATABASE_MIGRATOR_URL 必須指向同一個 Staging database。');
  }
  if (apiUrl.username === migratorUrl.username) throw new Error('API 與 Migration 不得共用資料庫角色。');
  const client = new Client({ connectionString: config.connectionString, ssl: config.ssl });
  await client.connect();
  try {
    await client.query('BEGIN');
    const result = await applyApiRoleGrants(client, apiUrl);
    await client.query('COMMIT');
    process.stdout.write(`${JSON.stringify({ environment: config.environment, apiRole: result.role, grantedTables: result.tables })}\n`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

if (path.resolve(process.argv[1] || '') === path.resolve(fileURLToPath(import.meta.url))) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
