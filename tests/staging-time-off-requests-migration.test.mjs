import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { manageStagingTimeOffRequests } from '../database/staging-time-off-requests.mjs';

const [manager, upSql, downSql] = await Promise.all([
  readFile(new URL('../database/staging-time-off-requests.mjs', import.meta.url), 'utf8'),
  readFile(new URL('../database/migrations/0013_time_off_requests.up.sql', import.meta.url), 'utf8'),
  readFile(new URL('../database/migrations/0013_time_off_requests.down.sql', import.meta.url), 'utf8')
]);

assert.match(manager, /BANK_ENV=staging/);
assert.match(manager, /ROLLBACK_BANKE_STAGING_TIME_OFF_REQUESTS/);
assert.match(manager, /Required Staging migration/);
assert.match(manager, /deliberatelyPendingEarlierMigrations/);
assert.doesNotMatch(manager, /BANK_ALLOW_PRODUCTION/);
assert.match(upSql, /CREATE TABLE time_off_requests/);
assert.match(upSql, /CREATE TABLE time_off_request_dates/);
assert.match(upSql, /FOREIGN KEY \(workspace_id, employee_id\)/);
assert.match(upSql, /FOREIGN KEY \(workspace_id, request_id\)/);
assert.match(upSql, /FORCE ROW LEVEL SECURITY/g);
assert.match(upSql, /api_execute_time_off_command/);
assert.match(upSql, /api_list_time_off_requests/);
assert.match(upSql, /request\.requester_user_id = auth_context\.authorized_user_id/);
assert.match(
  upSql,
  /WHERE request\.workspace_id = auth_context\.authorized_workspace_id\s+AND request\.requester_user_id = auth_context\.authorized_user_id/,
  '員工自己的申請（含原因）必須同時受 Workspace 與 requester_user_id 限制'
);
assert.match(
  upSql,
  /IF normalized_role = 'boss' THEN[\s\S]*'reason', request\.reason[\s\S]*INTO processed_rows[\s\S]*END IF;/,
  '包含其他員工原因的待審核與歷史集合只允許老闆角色建立'
);
assert.match(
  upSql,
  /jsonb_build_object\(\s*'employeeId', request\.employee_id,\s*'employeeName', employee\.name,\s*'date', to_char\(day\.leave_date, 'YYYY-MM-DD'\)\s*\)[\s\S]*INTO approved_schedule_rows/,
  '同店已核准排休公開資料只包含員工、姓名與日期'
);
assert.match(
  upSql,
  /jsonb_build_object\(\s*'date', to_char\(coverage\.leave_date, 'YYYY-MM-DD'\),\s*'approvedCount', coverage\.approved_count\s*\)[\s\S]*INTO approved_leave_coverage/,
  '同店請假人力摘要只包含日期與核准人數'
);
assert.match(upSql, /auth_context\.authorized_role NOT IN \('boss', 'manager'\)/);
assert.match(upSql, /body - 'leaveType'/);
assert.doesNotMatch(upSql, /outbox_events[\s\S]{0,500}reason/);
assert.match(downSql, /DROP FUNCTION IF EXISTS app_private\.api_execute_time_off_command/);
assert.match(downSql, /DROP TABLE IF EXISTS time_off_request_dates/);
assert.match(downSql, /DROP TABLE IF EXISTS time_off_requests/);

const checksum = 'a'.repeat(64);
const baseRows = [
  ['0001', 'core'], ['0002', 'business'], ['0003', 'commands'], ['0004', 'identity'],
  ['0005', 'identity_context'], ['0006', 'sessions'], ['0007', 'leave_precedence'],
  ['0008', 'subject_binding'], ['0011', 'ui_bootstrap'], ['0012', 'current_user']
].map(([version, name]) => ({ version, name, checksum }));
const calls = [];
const statusClient = {
  async query(sql, params = []) {
    calls.push({ sql, params });
    if (sql.includes('current_database')) return { rows: [{ name: 'neondb' }] };
    if (sql.includes('FROM public.schema_migrations')) return { rows: baseRows };
    if (sql.includes("to_regclass('public.time_off_requests')")) {
      return { rows: [{ request_table: false, date_table: false, read_function: false, command_function: false }] };
    }
    if (sql.includes('tenant_context_keys')) {
      return {
        rows: [{
          key_id: 'render-staging-20260722-49a11f',
          status: 'active',
          bytes: 32,
          active_now: true,
          unexpired: true
        }]
      };
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  }
};
const status = await manageStagingTimeOffRequests(statusClient, { command: 'status' });
assert.equal(status.database, 'neondb');
assert.equal(status.applied, false);
assert.deepEqual(status.deliberatelyPendingEarlierMigrations, ['0009', '0010']);
assert.equal(calls.some(call => /INSERT|UPDATE|DELETE/.test(call.sql)), false,
  'Status inspection must remain read-only');

await assert.rejects(
  () => manageStagingTimeOffRequests(statusClient, { command: 'down' }),
  /explicit confirmation/
);

console.log('Staging 0013 time-off migration gates passed');
