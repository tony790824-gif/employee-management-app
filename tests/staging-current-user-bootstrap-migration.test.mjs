import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile('database/staging-current-user-bootstrap.mjs', 'utf8');
const up = await readFile('database/migrations/0012_current_user_bootstrap.up.sql', 'utf8');
const down = await readFile('database/migrations/0012_current_user_bootstrap.down.sql', 'utf8');
const previous = await readFile('database/migrations/0011_ui_bootstrap.up.sql', 'utf8');

assert.match(source, /config\.environment !== 'staging'/);
assert.match(source, /import \{ STAGING_TENANT_CONTEXT_KEY_ID \} from '\.\/staging-ui-bootstrap\.mjs'/);
assert.match(source, /WHERE key_id = \$1[\s\S]*\[STAGING_TENANT_CONTEXT_KEY_ID\]/);
assert.match(source, /pg_advisory_lock/);
assert.match(source, /BEGIN/);
assert.match(source, /ROLLBACK/);
assert.match(source, /ROLLBACK_BANKE_STAGING_CURRENT_USER_BOOTSTRAP/);
assert.match(source, /Migration 0012 ledger, display_name column, and currentUser contract are inconsistent/);
assert.doesNotMatch(source, /BANK_ALLOW_PRODUCTION_MIGRATIONS|APPLY_BANKE_PRODUCTION_MIGRATIONS/);

assert.match(up, /ALTER TABLE workspace_members\s+ADD COLUMN display_name text/);
assert.match(up, /display_name IS NULL/);
assert.match(up, /display_name = btrim\(display_name\)/);
assert.match(up, /char_length\(display_name\) BETWEEN 1 AND 120/);
assert.match(up, /CREATE OR REPLACE FUNCTION app_private\.api_bootstrap/);
assert.match(up, /SECURITY DEFINER/);
assert.match(up, /authorized_role IN \('boss', 'manager'\) THEN 'boss'/);
assert.match(up, /authorized_role = 'employee' THEN 'employee'/);
assert.match(up, /IF normalized_role IS NULL THEN[\s\S]*WORKSPACE_ACCESS_DENIED/);
assert.match(up, /SELECT employee\.name[\s\S]*INTO current_display_name/);
assert.match(up, /SELECT member\.display_name[\s\S]*INTO current_display_name/);
assert.match(up, /member\.workspace_id = auth_context\.authorized_workspace_id/);
assert.match(up, /member\.user_id = auth_context\.authorized_user_id/);
assert.match(up, /'currentUser', jsonb_build_object\([\s\S]*'displayName', current_display_name/);
assert.match(up, /'role', normalized_role[\s\S]*'employeeId', employee_scope[\s\S]*'workspaceId', auth_context\.authorized_workspace_id/);
for (const legacyField of [
  "'workspaceId'", "'role'", "'employeeId'", "'data'", "'employees'", "'shifts'",
  "'attendance'", "'leaves'", "'payrollAdjustments'"
]) {
  assert.match(up, new RegExp(legacyField));
}
assert.match(up, /REVOKE ALL ON FUNCTION app_private\.api_bootstrap\(text,text,text\) FROM PUBLIC/);

assert.match(down, /DROP COLUMN IF EXISTS display_name/);
assert.doesNotMatch(down, /'currentUser'/);
assert.equal(
  down.slice(0, down.lastIndexOf('ALTER TABLE workspace_members')).trim(),
  previous.trim(),
  'rollback must restore the exact 0011 bootstrap contract before dropping display_name'
);

console.log('Controlled Staging 0012 currentUser migration boundary tests passed.');
