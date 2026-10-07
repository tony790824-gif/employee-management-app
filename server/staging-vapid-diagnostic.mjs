import { createECDH, createHash, timingSafeEqual } from 'node:crypto';

const EXPECTED_FINGERPRINT = '850b5acaf2aa845224233cc7cd3a4df54678c2d4e6710b8201d81ab075734064';
const fingerprint = bytes => createHash('sha256').update(bytes.toString('base64url')).digest('hex');

function decode(value, size) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!/^[A-Za-z0-9_-]+={0,2}$/.test(text)) throw new Error('INVALID_KEY');
  const bytes = Buffer.from(text, 'base64url');
  if (bytes.length !== size || bytes.toString('base64url') !== text.replace(/=+$/, '')) {
    bytes.fill(0);
    throw new Error('INVALID_KEY');
  }
  return bytes;
}

// No I/O other than the allowlisted result. Tests supply synthetic keys and a sink.
export function createStagingVapidDiagnostic({
  expectedFingerprint = EXPECTED_FINGERPRINT,
  log = line => console.info(line)
} = {}) {
  let completed = false;
  return function run({ environment, env }) {
    if (environment !== 'staging' || completed) return;
    completed = true;
    let privateBytes;
    let result = { VAPID_DIAGNOSTIC: 'FAIL' };
    try {
      const configured = decode(env.BANK_WEB_PUSH_PUBLIC_KEY, 65);
      if (configured[0] !== 4) throw new Error('INVALID_KEY');
      privateBytes = decode(env.BANK_WEB_PUSH_PRIVATE_KEY, 32);
      const curve = createECDH('prime256v1');
      curve.setPrivateKey(privateBytes);
      const derived = curve.getPublicKey(undefined, 'uncompressed');
      const directMatch = configured.length === derived.length && timingSafeEqual(configured, derived);
      const derivedFingerprint = fingerprint(derived);
      const configuredFingerprint = fingerprint(configured);
      if (directMatch && derivedFingerprint === configuredFingerprint && configuredFingerprint === expectedFingerprint) {
        result = {
          VAPID_DIAGNOSTIC: 'PASS',
          DERIVED_PUBLIC_KEY_FINGERPRINT: derivedFingerprint,
          CONFIGURED_PUBLIC_KEY_FINGERPRINT: configuredFingerprint,
          PUBLIC_KEY_DIRECT_MATCH: 'YES',
          STAGING_KEY_PAIR_MATCH: 'PASS'
        };
      }
    } catch {
      // Never forward exceptions, key metadata, or environment objects.
    } finally {
      privateBytes?.fill(0);
    }
    try { log(JSON.stringify(result)); } catch { /* Diagnostic must not alter startup. */ }
  };
}

export const runStagingVapidDiagnostic = createStagingVapidDiagnostic();
