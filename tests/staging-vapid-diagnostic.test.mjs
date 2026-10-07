import assert from 'node:assert/strict';
import { createECDH, createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { test } from 'node:test';
import { createStagingVapidDiagnostic } from '../server/staging-vapid-diagnostic.mjs';

function fixture() {
  const curve = createECDH('prime256v1');
  curve.generateKeys(); // Ephemeral synthetic test data only; never saved or logged.
  const publicKey = curve.getPublicKey().toString('base64url');
  return {
    env: { BANK_WEB_PUSH_PUBLIC_KEY: publicKey, BANK_WEB_PUSH_PRIVATE_KEY: curve.getPrivateKey().toString('base64url') },
    hash: createHash('sha256').update(publicKey).digest('hex')
  };
}

function run(env, expectedFingerprint) {
  const lines = [];
  const diagnostic = createStagingVapidDiagnostic({ expectedFingerprint, log: line => lines.push(line) });
  diagnostic({ environment: 'staging', env });
  return { lines, diagnostic };
}
const failOnly = lines => assert.deepEqual(lines.map(JSON.parse), [{ VAPID_DIAGNOSTIC: 'FAIL' }]);

test('matching P-256 keys produce only the five allowlisted fields', () => {
  const { env, hash } = fixture();
  const { lines } = run(env, hash);
  assert.deepEqual(JSON.parse(lines[0]), {
    VAPID_DIAGNOSTIC: 'PASS', DERIVED_PUBLIC_KEY_FINGERPRINT: hash,
    CONFIGURED_PUBLIC_KEY_FINGERPRINT: hash, PUBLIC_KEY_DIRECT_MATCH: 'YES', STAGING_KEY_PAIR_MATCH: 'PASS'
  });
  assert.equal(lines[0].includes(env.BANK_WEB_PUSH_PRIVATE_KEY), false);
  assert.equal(lines[0].includes(env.BANK_WEB_PUSH_PUBLIC_KEY), false);
});

test('whitespace and padding normalize to the existing unpadded base64url fingerprint', () => {
  const { env, hash } = fixture();
  for (const name of Object.keys(env)) env[name] = ` ${env[name]}=\n`;
  assert.equal(JSON.parse(run(env, hash).lines[0]).VAPID_DIAGNOSTIC, 'PASS');
});

test('mismatching key pair fails with no fingerprints or exceptions', () => {
  const a = fixture(), b = fixture();
  failOnly(run({ ...a.env, BANK_WEB_PUSH_PRIVATE_KEY: b.env.BANK_WEB_PUSH_PRIVATE_KEY }, a.hash).lines);
});

test('matching pair with unexpected configured fingerprint fails closed', () => {
  const a = fixture();
  failOnly(run(a.env, '0'.repeat(64)).lines);
  failOnly(run(a.env, undefined).lines); // Real expected fingerprint is pinned, never a test key.
});

test('invalid, missing, and zero private scalar never leak raw errors', () => {
  const a = fixture();
  for (const value of [undefined, '', 'secret-canary!', 'A', Buffer.alloc(32).toString('base64url')]) {
    failOnly(run({ ...a.env, BANK_WEB_PUSH_PRIVATE_KEY: value }, a.hash).lines);
  }
});

test('malformed public key fails closed', () => {
  const a = fixture();
  for (const value of [undefined, '', 'secret-canary!', Buffer.alloc(65).toString('base64url')]) {
    failOnly(run({ ...a.env, BANK_WEB_PUSH_PUBLIC_KEY: value }, a.hash).lines);
  }
});

test('environment access errors are sanitized and execution is once-only', () => {
  const a = fixture();
  const badEnv = new Proxy({}, { get() { throw new Error('secret-canary'); } });
  const { lines, diagnostic } = run(badEnv, a.hash);
  diagnostic({ environment: 'staging', env: a.env });
  failOnly(lines);
});

test('successful diagnostic also runs once per process instance', () => {
  const a = fixture();
  const { lines, diagnostic } = run(a.env, a.hash);
  diagnostic({ environment: 'staging', env: a.env });
  assert.equal(lines.length, 1);
});

test('production and local neither read keys nor log', () => {
  const badEnv = new Proxy({}, { get() { assert.fail('must not read keys'); } });
  const diagnostic = createStagingVapidDiagnostic({ log() { assert.fail('must not log'); } });
  for (const environment of ['production', 'local', undefined]) diagnostic({ environment, env: badEnv });
});

test('a logger failure cannot interrupt existing startup', () => {
  const a = fixture();
  const diagnostic = createStagingVapidDiagnostic({ expectedFingerprint: a.hash, log() { throw new Error('sink'); } });
  assert.doesNotThrow(() => diagnostic({ environment: 'staging', env: a.env }));
});

test('diagnostic has no DB, network, filesystem, dependency or key-generation capability', async () => {
  const source = await readFile(new URL('../server/staging-vapid-diagnostic.mjs', import.meta.url), 'utf8');
  assert.deepEqual([...source.matchAll(/from '([^']+)'/g)].map(m => m[1]), ['node:crypto']);
  assert.doesNotMatch(source, /generateKeys|sendNotification|fetch\(|pool\.|writeFile|process\.env/);
});

test('all existing startup code and ordering are unchanged', async () => {
  const source = await readFile(new URL('../server/index.mjs', import.meta.url), 'utf8');
  const baseline = execFileSync('git', ['show', 'bae183e10399e476910508aee1677133e5fd179d:server/index.mjs'], { encoding: 'utf8' });
  const normalizedSource = source.replaceAll('\r\n', '\n');
  const normalizedBaseline = baseline.replaceAll('\r\n', '\n');
  for (const newline of ['\n', '\r\n']) {
    const variant = normalizedSource.replaceAll('\n', newline);
    const stripped = variant.replaceAll('\r\n', '\n')
      .replace("import { runStagingVapidDiagnostic } from './staging-vapid-diagnostic.mjs';\n", '')
      .replace('runStagingVapidDiagnostic({ environment, env: process.env });\n', '');
    assert.equal(stripped, normalizedBaseline, `startup must remain unchanged with ${JSON.stringify(newline)} line endings`);
  }
});
