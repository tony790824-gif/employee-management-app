import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { databaseTargetConfig } from './migrate.mjs';

const { Client } = pg;
const EVENT_ROLE = 'banke_event_staging';
const EVENT_FUNCTION = 'app_private.ingest_auth0_security_event(text,text,text,text,text,text,text,timestamptz,text)';

function normalizedHost(value) {
  return String(value || '').trim().toLowerCase().replace('-pooler.', '.');
}

async function quoted(client, format, ...values) {
  const parameters = values.map((_, index) => `$${index + 2}::text`).join(', ');
  return (await client.query(`SELECT format($1::text, ${parameters}) AS sql`, [format, ...values])).rows[0].sql;
}

export function securityEventRoleConfig(env = process.env) {
  const target = databaseTargetConfig(env);
  if (target.environment !== 'staging') throw new Error('Security event role grants are Staging-only.');
  const raw = String(env.DATABASE_EVENT_URL || '').trim();
  if (!raw) throw new Error('DATABASE_EVENT_URL is required.');
  const eventUrl = new URL(raw);
  const migratorUrl = new URL(target.connectionString);
  if (eventUrl.username !== EVENT_ROLE
    || normalizedHost(eventUrl.hostname) !== normalizedHost(migratorUrl.hostname)
    || eventUrl.pathname !== migratorUrl.pathname) {
    throw new Error('DATABASE_EVENT_URL must use the isolated Staging event role on the approved database.');
  }
  return { ...target, eventUrl };
}

export async function applySecurityEventRoleGrants(client, role = EVENT_ROLE) {
  const attributes = (await client.query(
    `SELECT rolsuper, rolcreaterole, rolcreatedb, rolreplication, rolbypassrls
       FROM pg_roles WHERE rolname = $1`, [role]
  )).rows[0];
  if (!attributes) throw new Error('The isolated Staging security event role must exist before grants are applied.');
  if (attributes.rolsuper || attributes.rolcreaterole || attributes.rolcreatedb
    || attributes.rolreplication || attributes.rolbypassrls) {
    throw new Error('Security event role has forbidden database capabilities.');
  }
  const memberships = await client.query(
    `SELECT 1 FROM pg_auth_members membership
      JOIN pg_roles member ON member.oid = membership.member
     WHERE member.rolname = $1 LIMIT 1`, [role]
  );
  if (memberships.rowCount) throw new Error('Security event role must not inherit another role.');
  const database = (await client.query('SELECT current_database() AS name')).rows[0].name;
  await client.query(await quoted(client, 'REVOKE ALL ON DATABASE %I FROM %I', database, role));
  await client.query(await quoted(client, 'GRANT CONNECT ON DATABASE %I TO %I', database, role));
  await client.query(await quoted(client, 'REVOKE ALL ON SCHEMA public, app_private FROM %I', role));
  await client.query(await quoted(client, 'GRANT USAGE ON SCHEMA app_private TO %I', role));
  await client.query(await quoted(client, 'REVOKE ALL ON ALL TABLES IN SCHEMA public, app_private FROM %I', role));
  await client.query(await quoted(client, 'REVOKE ALL ON ALL SEQUENCES IN SCHEMA public, app_private FROM %I', role));
  await client.query(await quoted(client, 'REVOKE ALL ON ALL FUNCTIONS IN SCHEMA app_private FROM %I', role));
  await client.query(await quoted(client, `GRANT EXECUTE ON FUNCTION ${EVENT_FUNCTION} TO %I`, role));
  return { role, grantedFunctions: 1, grantedTables: 0 };
}

async function main() {
  const config = securityEventRoleConfig();
  const client = new Client({ connectionString: config.connectionString, ssl: config.ssl });
  await client.connect();
  try {
    await client.query('BEGIN');
    const result = await applySecurityEventRoleGrants(client);
    await client.query('COMMIT');
    process.stdout.write(`${JSON.stringify({ environment: 'staging', ...result })}\n`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

if (path.resolve(process.argv[1] || '') === path.resolve(fileURLToPath(import.meta.url))) {
  main().catch(error => {
    console.error(String(error?.message || 'Security event role grant failed.')
      .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, '[REDACTED_DATABASE_URL]'));
    process.exitCode = 1;
  });
}
