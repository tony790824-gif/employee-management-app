import process from 'node:process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { databaseTargetConfig } from './migrate.mjs';

const { Client } = pg;
export const PUSH_WORKER_FUNCTIONS = Object.freeze([
  'app_private.worker_claim_push_deliveries(text,integer)',
  'app_private.worker_complete_push_delivery(uuid,text,integer,text)'
]);

function normalizedHost(value) {
  return String(value || '').trim().toLowerCase().replace('-pooler.', '.');
}

export function pushRoleTargetConfig(env = process.env) {
  const database = databaseTargetConfig(env);
  if (database.environment !== 'staging') {
    throw new Error('Web Push role grants are restricted to BANK_ENV=staging.');
  }
  const rawPushUrl = String(env.DATABASE_PUSH_URL || '').trim();
  const rawApiUrl = String(env.DATABASE_API_URL || '').trim();
  if (!rawPushUrl || !rawApiUrl) {
    throw new Error('Web Push role grants require DATABASE_PUSH_URL and DATABASE_API_URL.');
  }
  const pushUrl = new URL(rawPushUrl);
  const apiUrl = new URL(rawApiUrl);
  const migratorUrl = new URL(database.connectionString);
  if (normalizedHost(pushUrl.hostname) !== normalizedHost(migratorUrl.hostname)
    || pushUrl.pathname !== migratorUrl.pathname) {
    throw new Error('DATABASE_PUSH_URL must target the approved Staging database.');
  }
  if ([apiUrl.username, migratorUrl.username].includes(pushUrl.username)) {
    throw new Error('Web Push, API, and Migration must use separate database roles.');
  }
  return { ...database, pushUrl };
}

async function quoted(client, format, ...values) {
  const parameters = values.map((_, index) => `$${index + 2}::text`).join(', ');
  const result = await client.query(`SELECT format($1::text, ${parameters}) AS sql`, [format, ...values]);
  return result.rows[0].sql;
}

export async function applyPushRoleGrants(client, pushUrl) {
  const role = pushUrl.username;
  const password = pushUrl.password;
  if (!/^[a-z][a-z0-9_]{2,62}$/.test(role) || !password) {
    throw new Error('DATABASE_PUSH_URL role/password is invalid.');
  }
  const existing = await client.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [role]);
  if (!existing.rows[0]) {
    await client.query(await quoted(client,
      'CREATE ROLE %I LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 4 PASSWORD %L',
      role, password));
    await client.query(await quoted(client, "ALTER ROLE %I SET statement_timeout = '10s'", role));
    await client.query(await quoted(client, 'ALTER ROLE %I SET search_path = pg_catalog', role));
  }
  const capability = (await client.query(
    'SELECT rolsuper, rolcreaterole, rolcreatedb, rolreplication, rolbypassrls FROM pg_roles WHERE rolname = $1',
    [role]
  )).rows[0];
  if (!capability || capability.rolsuper || capability.rolcreaterole || capability.rolcreatedb
    || capability.rolreplication || capability.rolbypassrls) {
    throw new Error('Web Push role has forbidden capabilities.');
  }
  const memberships = await client.query(
    `SELECT 1
       FROM pg_auth_members membership
       JOIN pg_roles member_role ON member_role.oid = membership.member
      WHERE member_role.rolname = $1
      LIMIT 1`, [role]
  );
  if (memberships.rowCount) throw new Error('Web Push role must not inherit another role.');
  const ownedObjects = await client.query(
    `SELECT 1 FROM pg_namespace namespace JOIN pg_roles owner ON owner.oid = namespace.nspowner WHERE owner.rolname = $1
     UNION ALL
     SELECT 1 FROM pg_class object JOIN pg_roles owner ON owner.oid = object.relowner WHERE owner.rolname = $1
     UNION ALL
     SELECT 1 FROM pg_proc function JOIN pg_roles owner ON owner.oid = function.proowner WHERE owner.rolname = $1
     LIMIT 1`, [role]
  );
  if (ownedObjects.rowCount) throw new Error('Web Push role must not own database objects.');

  const database = (await client.query('SELECT current_database() AS name')).rows[0].name;
  await client.query(await quoted(client, 'REVOKE ALL ON DATABASE %I FROM %I', database, role));
  await client.query(await quoted(client, 'GRANT CONNECT ON DATABASE %I TO %I', database, role));
  await client.query(await quoted(client, 'REVOKE ALL ON SCHEMA public, app_private FROM %I', role));
  await client.query(await quoted(client, 'GRANT USAGE ON SCHEMA app_private TO %I', role));
  await client.query(await quoted(client, 'REVOKE ALL ON ALL TABLES IN SCHEMA public, app_private FROM %I', role));
  await client.query(await quoted(client, 'REVOKE ALL ON ALL SEQUENCES IN SCHEMA public, app_private FROM %I', role));
  await client.query(await quoted(client, 'REVOKE ALL ON ALL FUNCTIONS IN SCHEMA app_private FROM %I', role));
  for (const signature of PUSH_WORKER_FUNCTIONS) {
    const functionAudit = await client.query(
      `SELECT procedure.prosecdef,
              coalesce(array_to_string(procedure.proconfig, ','), '') AS settings
         FROM pg_proc procedure
        WHERE procedure.oid = to_regprocedure($1)`, [signature]
    );
    const controlled = functionAudit.rows[0];
    if (!controlled?.prosecdef || !controlled.settings.includes('search_path=pg_catalog, public, app_private')) {
      throw new Error(`Controlled Web Push function is missing: ${signature}`);
    }
    await client.query(await quoted(client, `GRANT EXECUTE ON FUNCTION ${signature} TO %I`, role));
  }
  return { role, tables: 0, functions: PUSH_WORKER_FUNCTIONS.length };
}

async function main() {
  const config = pushRoleTargetConfig();
  const client = new Client({ connectionString: config.connectionString, ssl: config.ssl });
  await client.connect();
  try {
    await client.query('BEGIN');
    const result = await applyPushRoleGrants(client, config.pushUrl);
    await client.query('COMMIT');
    process.stdout.write(`${JSON.stringify({
      environment: config.environment,
      pushRole: result.role,
      grantedTables: result.tables,
      grantedFunctions: result.functions
    })}\n`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

if (path.resolve(process.argv[1] || '') === path.resolve(fileURLToPath(import.meta.url))) {
  main().catch(error => {
    const code = String(error?.code || 'PUSH_ROLE_GRANT_FAILED').replace(/[^A-Z0-9_]/gi, '').slice(0, 32);
    const message = String(error?.message || 'Database rejected Web Push role grants.')
      .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, '[REDACTED_DATABASE_URL]');
    console.error(`${code}: ${message}`);
    process.exitCode = 1;
  });
}
