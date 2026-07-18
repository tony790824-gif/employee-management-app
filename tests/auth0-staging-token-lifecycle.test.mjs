import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile('scripts/auth0-staging-token-lifecycle.mjs', 'utf8');

assert.match(source, /process\.env\.BANK_ENV !== 'staging'/);
assert.match(source, /scope: 'openid profile offline_access'/);
assert.match(source, /code_challenge_method: 'S256'/);
assert.match(source, /grant_type: 'refresh_token'/);
assert.match(source, /oldRefreshTokenReplayRejected/);
assert.match(source, /tokenFamilyRevoked/);
assert.match(source, /sessionClaimMatchesIdTokenSid/);
assert.match(source, /Cache-Control', 'no-store'/);
assert.doesNotMatch(source, /console\.(?:log|info|debug)\([^\n]*(?:accessToken|refreshToken|authorizationCode|sessionId)/i);
assert.doesNotMatch(source, /localStorage|sessionStorage|document\.cookie/);
assert.doesNotMatch(source, /client_secret|DATABASE_(?:API|MIGRATOR)_URL/);

console.log('Auth0 Staging token lifecycle harness checks passed.');
