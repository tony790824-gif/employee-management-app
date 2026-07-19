import { randomBytes } from 'node:crypto';
import { appendFile, readFile } from 'node:fs/promises';
import process from 'node:process';

const ENV_FILE = new URL('../.env.production', import.meta.url);
const CONFIRMATION = 'GENERATE_BANKE_PRODUCTION_API_SECRET';
const ROLE = 'banke_api_production';

function normalizedHost(value) {
  return String(value || '').trim().toLowerCase().replace('-pooler.', '.');
}

function poolerHost(hostname) {
  if (hostname.includes('-pooler.')) return hostname;
  const [endpoint, ...suffix] = hostname.split('.');
  if (!endpoint || suffix.length === 0) throw new Error('Production PostgreSQL host format is not supported.');
  return `${endpoint}-pooler.${suffix.join('.')}`;
}

async function main() {
  if (process.env.BANK_ENV !== 'production') throw new Error('BANK_ENV must be production.');
  if (process.env.BANK_GENERATE_PRODUCTION_API_SECRET !== CONFIRMATION) {
    throw new Error('Production API secret generation requires explicit confirmation.');
  }
  const content = await readFile(ENV_FILE, 'utf8');
  if (/^DATABASE_API_URL=/m.test(content)) {
    process.stdout.write('{"environment":"production","databaseApiSecret":"already-configured"}\n');
    return;
  }
  const migratorValue = String(process.env.DATABASE_MIGRATOR_URL || '').trim();
  const expectedHost = String(process.env.BANK_PRODUCTION_DATABASE_HOST || '').trim();
  if (!migratorValue || !expectedHost) throw new Error('Production database target is incomplete.');
  const apiUrl = new URL(migratorValue);
  if (normalizedHost(apiUrl.hostname) !== normalizedHost(expectedHost)) {
    throw new Error('Production database target does not match the approved host.');
  }
  apiUrl.hostname = poolerHost(apiUrl.hostname);
  apiUrl.username = ROLE;
  apiUrl.password = randomBytes(48).toString('base64url');
  const separator = content.length === 0 || /\r?\n$/.test(content) ? '' : '\r\n';
  await appendFile(ENV_FILE, `${separator}DATABASE_API_URL=${apiUrl.href}\r\n`, { encoding: 'utf8' });
  process.stdout.write('{"environment":"production","databaseApiSecret":"configured","role":"banke_api_production"}\n');
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
