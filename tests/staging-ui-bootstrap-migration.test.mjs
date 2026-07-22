import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile('database/staging-ui-bootstrap.mjs', 'utf8');
const up = await readFile('database/migrations/0011_ui_bootstrap.up.sql', 'utf8');
const down = await readFile('database/migrations/0011_ui_bootstrap.down.sql', 'utf8');

assert.match(source, /config\.environment !== 'staging'/);
assert.match(source, /render-staging-20260722-49a11f/);
assert.match(source, /pg_advisory_lock/);
assert.match(source, /BEGIN/);
assert.match(source, /ROLLBACK/);
assert.match(source, /ROLLBACK_BANKE_STAGING_UI_BOOTSTRAP/);
assert.match(source, /Migration 0011 ledger and api_bootstrap function state are inconsistent/);
assert.doesNotMatch(source, /BANK_ALLOW_PRODUCTION_MIGRATIONS|APPLY_BANKE_PRODUCTION_MIGRATIONS/);
assert.match(up, /CREATE OR REPLACE FUNCTION app_private\.api_bootstrap/);
assert.match(up, /SECURITY DEFINER/);
assert.match(up, /verify_tenant_context\(signed_payload, signed_signature, signing_key_id, 'read', true\)/);
assert.match(up, /authorized_role = 'employee'/);
assert.match(up, /REVOKE ALL ON FUNCTION app_private\.api_bootstrap\(text,text,text\) FROM PUBLIC/);
assert.equal(down.trim(), 'DROP FUNCTION IF EXISTS app_private.api_bootstrap(text,text,text);');

console.log('Controlled Staging 0011 migration boundary tests passed.');
