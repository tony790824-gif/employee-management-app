import process from 'node:process';
import pg from 'pg';
import { databaseTargetConfig } from './migrate.mjs';

const config = databaseTargetConfig(process.env);
if (config.environment !== 'staging') {
  throw new Error('Staging Workspace readiness requires BANK_ENV=staging.');
}
const client = new pg.Client({
  connectionString: config.connectionString,
  ssl: config.ssl,
  connectionTimeoutMillis: 10_000
});
await client.connect();
try {
  await client.query('BEGIN READ ONLY');
  const identity = (await client.query(
    'SELECT current_database() AS database, current_user AS role'
  )).rows[0];
  const candidates = (await client.query(
    `SELECT workspace.id AS workspace_id,
            count(*) FILTER (
              WHERE member.role IN ('boss', 'manager')
                AND member.status = 'active'
                AND member.auth_status = 'active'
            )::integer AS manager_memberships,
            count(*) FILTER (
              WHERE member.role = 'employee'
                AND member.status = 'active'
                AND member.auth_status = 'active'
                AND member.employee_id IS NOT NULL
            )::integer AS employee_memberships,
            count(DISTINCT principal.subject) FILTER (
              WHERE principal.status = 'active'
            )::integer AS identity_mappings,
            count(DISTINCT session.id) FILTER (
              WHERE session.status = 'active'
                AND session.expires_at > clock_timestamp()
            )::integer AS active_sessions
       FROM workspaces workspace
       JOIN workspace_members member ON member.workspace_id = workspace.id
       JOIN users app_user ON app_user.id = member.user_id AND app_user.status = 'active'
       LEFT JOIN app_private.identity_principals principal
         ON principal.user_id = member.user_id
       LEFT JOIN app_private.auth_sessions session
         ON session.user_id = member.user_id
      WHERE workspace.status = 'active'
      GROUP BY workspace.id
     HAVING count(*) FILTER (
              WHERE member.role IN ('boss', 'manager')
                AND member.status = 'active'
                AND member.auth_status = 'active'
            ) > 0
        AND count(*) FILTER (
              WHERE member.role = 'employee'
                AND member.status = 'active'
                AND member.auth_status = 'active'
                AND member.employee_id IS NOT NULL
            ) > 0
      ORDER BY workspace.id`
  )).rows;
  await client.query('ROLLBACK');
  const selected = candidates.filter(candidate =>
    candidate.identity_mappings >= 2 && candidate.active_sessions >= 1
  );
  if (selected.length !== 1) {
    throw new Error(
      `Expected exactly one active Staging app Workspace; found ${selected.length} of ${candidates.length}.`
    );
  }
  process.stdout.write(`${JSON.stringify({
    environment: config.environment,
    host: new URL(config.connectionString).hostname,
    ...identity,
    workspaceId: selected[0].workspace_id,
    managerMemberships: selected[0].manager_memberships,
    employeeMemberships: selected[0].employee_memberships,
    identityMappings: selected[0].identity_mappings,
    activeSessions: selected[0].active_sessions,
    readOnly: true
  }, null, 2)}\n`);
} finally {
  await client.end();
}
