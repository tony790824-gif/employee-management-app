import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { environmentProfiles } from '../config/environments.mjs';

const result = spawnSync(process.execPath, ['scripts/build.mjs', '--environment=staging'], { encoding: 'utf8' });
assert.equal(result.status, 0, result.stderr || 'Staging build failed.');

const profile = environmentProfiles.staging;
assert.equal(profile.auth.audience, 'https://bankeban-staging-api');
assert.equal(profile.auth.domain, 'dev-nkduawjn5itjlhx4.us.auth0.com');
assert.ok(profile.auth.clientId, 'Staging public Client ID is required.');

const stagingIndex = await readFile('dist-staging/index.html', 'utf8');
assert.match(stagingIndex, /cdn\.auth0\.com\/js\/auth0-spa-js\/2\.11\/auth0-spa-js\.production\.js/);
assert.match(stagingIndex, /integrity="sha384-[A-Za-z0-9+/=]+"/);
assert.match(stagingIndex, /<script src="staging-auth\.js"><\/script>/);

const sourceIndex = await readFile('index.html', 'utf8');
assert.doesNotMatch(sourceIndex, /auth0-spa-js|staging-auth\.js/, 'Shared/Production entry must not load Staging Auth0 assets.');

const runtimeConfig = await readFile('dist-staging/environment-config.js', 'utf8');
assert.match(runtimeConfig, /"audience": "https:\/\/bankeban-staging-api"/);
assert.match(runtimeConfig, /"clientId": "nOBwjFDzFaEVnsWCfeoofsCyeDMqkrMu"/);

const authSource = await readFile('staging-auth.js', 'utf8');
assert.match(authSource, /environment\?\.name !== 'staging'/);
assert.match(authSource, /new URL\('\.\/', window\.location\.href\)\.href/);
assert.match(authSource, /authorizationParams:\s*\{[\s\S]*redirect_uri: redirectUri,[\s\S]*audience: authConfig\.audience/);
assert.match(authSource, /useRefreshTokens: true/);
assert.match(authSource, /cacheLocation: 'memory'/);
assert.match(authSource, /await client\.loginWithRedirect\(\)/);
assert.match(authSource, /client\.getTokenSilently/);
assert.match(authSource, /https:\/\/banke\.tw\/session_id/);
assert.match(authSource, /client\.getIdTokenClaims/);
assert.match(authSource, /matchesAuth0SessionId/);
assert.match(authSource, /getClaimVerification: \(\) => claimVerification/);
assert.doesNotMatch(authSource, /getClient:\s*\(\)\s*=>\s*client/, 'Staging auth client must remain private.');
assert.match(authSource, /phoneLabel, pinLabel, activationLabel, employeeLoginButton/);
assert.match(authSource, /legacyControl\.style\.display = 'none'/);
assert.doesNotMatch(authSource, /console\.(?:log|info|debug)/, 'Staging auth entry must not expose tokens in logs.');

console.log('Staging Auth0 PKCE initiation tests passed.');
