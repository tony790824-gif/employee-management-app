import process from 'node:process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { databaseTargetConfig } from './migrate.mjs';

const { Client } = pg;
const PRODUCTION_CONFIRMATION = 'APPLY_BANKE_PRODUCTION_ROLE_GRANTS';
const PRODUCTION_API_ROLE = 'banke_api_production';
export const API_FUNCTIONS = Object.freeze([
  'app_private.api_establish_session(text,text,text)',
  'app_private.api_logout_session(text,text,text)',
  'app_private.api_list_employees(text,text,text)',
  'app_private.api_bootstrap(text,text,text)',
  'app_private.api_execute_command(text,text,text,text,jsonb,text,text,text)'
]);

function requiredApiUrl(env = process.env) {
  const value = String(env.DATABASE_API_URL || '').trim();
  if (!value) throw new Error('缺少 DATABASE_API_URL。');
  return new URL(value);
}

function normalizedHost(value) {
  return String(value || '').trim().toLowerCase().replace('-pooler.', '.');
}

export function apiRoleTargetConfig(env = process.env) {
  const database = databaseTargetConfig(env);
  if (!['staging', 'production'].includes(database.environment)) {
    throw new Error('API role grants require BANK_ENV=staging or BANK_ENV=production.');
  }
  const apiUrl = requiredApiUrl(env);
  const migratorUrl = new URL(database.connectionString);
  if (normalizedHost(apiUrl.hostname) !== normalizedHost(migratorUrl.hostname)
    || apiUrl.pathname !== migratorUrl.pathname) {
    throw new Error('DATABASE_API_URL and DATABASE_MIGRATOR_URL must target the same approved database.');
  }
  if (apiUrl.username === migratorUrl.username) {
    throw new Error('API and Migration must use separate database roles.');
  }
  if (database.environment === 'production' && apiUrl.username !== PRODUCTION_API_ROLE) {
    throw new Error(`Production API role must be ${PRODUCTION_API_ROLE}.`);
  }
  if (database.environment === 'production' && decodeURIComponent(apiUrl.pathname) !== '/neondb') {
    throw new Error('Production DATABASE_API_URL must explicitly target neondb.');
  }
  return { ...database, apiUrl, migratorUrl };
}

export function apiRoleGrantConfig(env = process.env) {
  const config = apiRoleTargetConfig(env);
  if (config.environment === 'production'
    && env.BANK_ALLOW_PRODUCTION_ROLE_GRANTS !== PRODUCTION_CONFIRMATION) {
    throw new Error('Production API role grants require explicit confirmation.');
  }
  return config;
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
  if (!existing.rows[0]) {
    const roleSql = await quoted(client,
      'CREATE ROLE %I LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 20 PASSWORD %L',
      role, password);
    await client.query(roleSql);
    await client.query(await quoted(client, "ALTER ROLE %I SET statement_timeout = '10s'", role));
    await client.query(await quoted(client, 'ALTER ROLE %I SET search_path = pg_catalog', role));
  }
  const capability = (await client.query(
    'SELECT rolsuper, rolcreaterole, rolcreatedb, rolreplication, rolbypassrls FROM pg_roles WHERE rolname = $1',
    [role]
  )).rows[0];
  if (!capability || capability.rolsuper || capability.rolcreaterole || capability.rolcreatedb || capability.rolreplication || capability.rolbypassrls) {
    throw new Error('API role 具有超出允許範圍的資料庫能力。');
  }
  const memberships = await client.query(
    `SELECT 1
       FROM pg_auth_members membership
       JOIN pg_roles member_role ON member_role.oid = membership.member
      WHERE member_role.rolname = $1
      LIMIT 1`, [role]
  );
  if (memberships.rowCount) throw new Error('API role must not inherit privileges through role membership.');
  const ownedObjects = await client.query(
    `SELECT 1 FROM pg_namespace namespace JOIN pg_roles owner ON owner.oid = namespace.nspowner WHERE owner.rolname = $1
     UNION ALL
     SELECT 1 FROM pg_class object JOIN pg_roles owner ON owner.oid = object.relowner WHERE owner.rolname = $1
     UNION ALL
     SELECT 1 FROM pg_proc function JOIN pg_roles owner ON owner.oid = function.proowner WHERE owner.rolname = $1
     LIMIT 1`, [role]
  );
  if (ownedObjects.rowCount) throw new Error('API role must not own schemas, tables, sequences, or functions.');
  const database = (await client.query('SELECT current_database() AS name')).rows[0].name;
  await client.query(await quoted(client, 'REVOKE ALL ON DATABASE %I FROM %I', database, role));
  await client.query(await quoted(client, 'GRANT CONNECT ON DATABASE %I TO %I', database, role));
  await client.query(await quoted(client, 'REVOKE ALL ON SCHEMA public, app_private FROM %I', role));
  await client.query(await quoted(client, 'GRANT USAGE ON SCHEMA app_private TO %I', role));
  await client.query(await quoted(client, 'REVOKE ALL ON ALL TABLES IN SCHEMA public, app_private FROM %I', role));
  await client.query(await quoted(client, 'REVOKE ALL ON ALL SEQUENCES IN SCHEMA public, app_private FROM %I', role));
  await client.query('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA app_private FROM PUBLIC');
  await client.query(await quoted(client, 'REVOKE ALL ON ALL FUNCTIONS IN SCHEMA app_private FROM %I', role));
  for (const signature of API_FUNCTIONS) {
    const functionAudit = await client.query(
      `SELECT procedure.prosecdef,
              coalesce(array_to_string(procedure.proconfig, ','), '') AS settings
         FROM pg_proc procedure
        WHERE procedure.oid = to_regprocedure($1)`, [signature]
    );
    const controlled = functionAudit.rows[0];
    if (!controlled?.prosecdef || !controlled.settings.includes('search_path=pg_catalog, public, app_private')) {
      throw new Error(`Controlled API function is missing its SECURITY DEFINER boundary: ${signature}`);
    }
    await client.query(await quoted(client, `GRANT EXECUTE ON FUNCTION ${signature} TO %I`, role));
  }
  return { role, tables: 0, functions: API_FUNCTIONS.length };
}

async function main() {
  const config = apiRoleGrantConfig();
  const apiUrl = config.apiUrl;
  const client = new Client({ connectionString: config.connectionString, ssl: config.ssl });
  await client.connect();
  try {
    await client.query('BEGIN');
    const result = await applyApiRoleGrants(client, apiUrl);
    await client.query('COMMIT');
    process.stdout.write(`${JSON.stringify({ environment: config.environment, apiRole: result.role, grantedTables: result.tables, grantedFunctions: result.functions })}\n`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

if (path.resolve(process.argv[1] || '') === path.resolve(fileURLToPath(import.meta.url))) {
  main().catch(error => {
    const code = String(error?.code || 'ROLE_GRANT_FAILED').replace(/[^A-Z0-9_]/gi, '').slice(0, 32);
    const message = String(error?.message || 'Database rejected the role grant transaction.')
      .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, '[REDACTED_DATABASE_URL]');
    console.error(`${code}: ${message}`);
    process.exitCode = 1;
  });
}
