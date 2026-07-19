import pg from 'pg';

const { Pool } = pg;
const EVENT_ROLE = 'banke_event_staging';

function normalizedHost(value) {
  return String(value || '').trim().toLowerCase().replace('-pooler.', '.');
}

export function securityEventDatabaseConfig(connectionString, env = process.env) {
  if (String(env.BANK_ENV || '').toLowerCase() !== 'staging') {
    throw new Error('Security event pipeline requires BANK_ENV=staging.');
  }
  const expectedHost = String(env.BANK_STAGING_DATABASE_HOST || '').trim();
  const expectedDatabase = String(env.BANK_STAGING_DATABASE_NAME || '').trim();
  if (!connectionString || !expectedHost || !expectedDatabase) {
    throw new Error('Staging security event database target is incomplete.');
  }
  const url = new URL(connectionString);
  const database = decodeURIComponent(url.pathname.replace(/^\//, ''));
  if (normalizedHost(url.hostname) !== normalizedHost(expectedHost)
    || database !== expectedDatabase
    || url.username !== EVENT_ROLE) {
    throw new Error('Security event database target is not the approved Staging role/host/database.');
  }
  url.searchParams.delete('sslmode');
  url.searchParams.delete('uselibpqcompat');
  return { connectionString: url.href, database };
}

export async function createSecurityEventRepository(connectionString, env = process.env) {
  const config = securityEventDatabaseConfig(connectionString, env);
  const pool = new Pool({
    connectionString: config.connectionString,
    ssl: { rejectUnauthorized: true },
    max: 2,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
    statement_timeout: 10_000,
    application_name: 'banke-auth0-events-staging'
  });
  const target = await pool.query('SELECT current_database() AS name');
  if (target.rows[0]?.name !== config.database) {
    await pool.end();
    throw new Error('Security event database startup target verification failed.');
  }
  return {
    async ingest(event) {
      const result = await pool.query(
        `SELECT app_private.ingest_auth0_security_event(
           $1, $2, $3, $4, $5, $6, $7, $8::timestamptz, $9
         ) AS result`,
        [event.environment, event.issuer, event.eventId, event.eventType, event.action,
          event.subject, event.providerSessionId, event.occurredAt, event.payloadSha256]
      );
      return result.rows[0]?.result;
    },
    close: () => pool.end()
  };
}
