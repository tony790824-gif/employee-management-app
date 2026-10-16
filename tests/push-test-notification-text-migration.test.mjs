import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../database/migrations/', import.meta.url);
const up = await readFile(new URL('0026_push_test_notification_text.up.sql', root), 'utf8');
const down = await readFile(new URL('0026_push_test_notification_text.down.sql', root), 'utf8');
const original = await readFile(new URL('0016_web_push_subscriptions.up.sql', root), 'utf8');
const fragments = sql => ({
  old: sql.match(/old_fragment text := \$old\$([\s\S]*?)\$old\$/)[1],
  next: sql.match(/new_fragment text := \$new\$([\s\S]*?)\$new\$/)[1]
});
const forward = fragments(up);
const backward = fragments(down);
assert.equal(forward.next, forward.old.replace('這是一則 Staging 測試推播。', '這是一則班客邦背景推播測試通知。'));
assert.equal(backward.old, forward.next);
assert.equal(backward.next, forward.old);
assert.equal(original.split(forward.old).length - 1, 1);
assert.equal(original.replace(forward.old, forward.next).replace(backward.old, backward.next), original);
for (const sql of [up, down]) {
  assert.match(sql, /api_execute_push_command\(text,text,text,text,jsonb,text,text,text\)'::regprocedure/);
  assert.match(sql, /pg_get_functiondef\(target_oid\)/);
  assert.match(sql, /EXECUTE replace\(definition, old_fragment, new_fragment\)/);
  assert.match(sql, /length\(old_fragment\) <> 1/);
  assert.match(sql, /NOT before_row.prosecdef/);
  assert.match(sql, /acl.grantee = 0 AND acl.privilege_type = 'EXECUTE'/);
  assert.match(sql, /SET search_path = pg_catalog, public, app_private, pg_temp/);
  assert.match(sql, /to_jsonb\(after_row\) - 'prosrc' - 'proconfig'/);
  assert.match(sql, /after_row.prosrc IS DISTINCT FROM replace\(before_row.prosrc, old_fragment, new_fragment\)/);
  assert.doesNotMatch(sql, /\b(?:GRANT|REVOKE|DROP|INSERT|UPDATE|DELETE|TRUNCATE)\b/i);
  assert.doesNotMatch(sql, /ALTER\s+(?:ROLE|TABLE)|OWNER TO|BANK_ENV|process\.env|worker_claim|worker_complete/);
  assert.equal((sql.match(/EXECUTE replace/g) || []).length, 1);
}
console.log('0026 push test notification text: exact body replacement and security preservation PASS');
