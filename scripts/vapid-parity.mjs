import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import process from 'node:process';

export function vapidFingerprint(value) {
  const key = String(value || '').trim();
  if (!/^[A-Za-z0-9_-]{80,120}$/.test(key)) throw new Error('VAPID public key format is invalid.');
  return createHash('sha256').update(key).digest('hex').slice(0, 16);
}

export function embeddedVapidPublicKey(source) {
  const match = /"webPushPublicKey"\s*:\s*"([A-Za-z0-9_-]{80,120})"/.exec(String(source || ''));
  if (!match) throw new Error('Build does not contain a VAPID public key.');
  return match[1];
}

export async function verifyVapidParity({ buildDirectory, authoritativePublicKey }) {
  const embedded = embeddedVapidPublicKey(await readFile(`${buildDirectory}/environment-config.js`, 'utf8'));
  const expectedFingerprint = vapidFingerprint(authoritativePublicKey);
  const embeddedFingerprint = vapidFingerprint(embedded);
  if (expectedFingerprint !== embeddedFingerprint) throw new Error('Build VAPID public key does not match the authoritative server key.');
  return Object.freeze({ ok: true, fingerprint: expectedFingerprint });
}

if (process.argv[1]?.replaceAll('\\', '/').endsWith('/scripts/vapid-parity.mjs')) {
  verifyVapidParity({
    buildDirectory: String(process.env.BANK_BUILD_DIRECTORY || 'dist-staging-postgres').trim(),
    authoritativePublicKey: String(process.env.BANK_WEB_PUSH_PUBLIC_KEY || '').trim()
  }).then(result => {
    process.stdout.write(`${JSON.stringify(result)}\n`);
  }).catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
