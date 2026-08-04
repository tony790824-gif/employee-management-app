import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';

const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { encoding: 'utf8' })
  .trim().split(/\r?\n/).filter(Boolean)
  .filter(file => !/^(?:\.codex|\.netlify|dist(?:-|\/)|database\/migrations\/0010_commission_rules)/.test(file));
const highConfidence = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bgh[opsu]_[A-Za-z0-9]{30,}\b/,
  /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/,
  /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\b/
];
const credentialUrl = /postgres(?:ql)?:\/\/[^\s:@/]+:([^\s@/]+)@([^\s/:?#]+)/gi;
const failures = [];

for (const file of files) {
  const content = await readFile(file, 'utf8').catch(() => '');
  if (!content) continue;
  if (highConfidence.some(pattern => pattern.test(content))) failures.push(`${file}: high-confidence credential pattern`);
  for (const match of content.matchAll(credentialUrl)) {
    const password = match[1].toLowerCase();
    const host = match[2].toLowerCase();
    const acceptedFixture = /^(?:secret|change-me|password|test)$/.test(password)
      || host === '127.0.0.1' || host === 'localhost' || host.endsWith('.invalid') || host.endsWith('.example');
    if (!acceptedFixture) failures.push(`${file}: non-fixture credential-bearing database URL`);
  }
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log(`Sensitive-information scan passed for ${files.length} repository files.`);
