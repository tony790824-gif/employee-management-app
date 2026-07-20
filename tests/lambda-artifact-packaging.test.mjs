import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { unzipSync } from 'fflate';
import { buildLambdaArtifact } from '../scripts/package-lambda-artifact.mjs';

const firstOutput = await mkdtemp(path.join(tmpdir(), 'bankeban-artifact-test-a-'));
const secondOutput = await mkdtemp(path.join(tmpdir(), 'bankeban-artifact-test-b-'));
try {
  const first = await buildLambdaArtifact({ outputDirectory: firstOutput });
  const second = await buildLambdaArtifact({ outputDirectory: secondOutput });
  assert.equal(first.sha256, second.sha256, 'identical sources and lockfile must produce identical ZIP checksums');
  assert.deepEqual(await readFile(first.artifactPath), await readFile(second.artifactPath));
  assert.equal(first.invocationVerified, true);
  assert.ok(first.fileCount > 30);
  assert.ok(first.componentCount >= 20);
  assert.ok(first.uncompressedBytes < 250 * 1024 * 1024, 'Lambda uncompressed package must remain below 250 MiB');

  const checksum = await readFile(first.checksumPath, 'utf8');
  assert.equal(checksum, `${first.sha256}  banke-auth0-security-events-staging.zip\n`);
  const sbom = JSON.parse(await readFile(first.sbomPath, 'utf8'));
  assert.equal(sbom.bomFormat, 'CycloneDX');
  assert.equal(sbom.specVersion, '1.5');
  assert.ok(sbom.components.some(component => component.name === 'pg'));
  const secretsManagerComponent = sbom.components.find(component => component.name === '@aws-sdk/client-secrets-manager');
  assert.ok(secretsManagerComponent);
  assert.match(secretsManagerComponent.purl, /^pkg:npm\/%40aws-sdk\/client-secrets-manager@\d+\.\d+\.\d+/);

  const archive = unzipSync(new Uint8Array(await readFile(first.artifactPath)));
  const names = Object.keys(archive).sort();
  for (const expected of [
    'artifact-manifest.json', 'package.json', 'sbom/bom.cdx.json',
    'security-events/auth0-event.mjs', 'security-events/database.mjs', 'security-events/handler.mjs',
    'node_modules/pg/package.json', 'node_modules/@aws-sdk/client-secrets-manager/package.json'
  ]) assert.ok(names.includes(expected), `artifact is missing ${expected}`);
  assert.ok(names.every(name => !name.includes('/.pnpm/') && !/(?:^|\/)\.env(?:\.|$)/.test(name)));
  const runtimePackage = JSON.parse(Buffer.from(archive['package.json']).toString('utf8'));
  assert.match(runtimePackage.dependencies.pg, /^\d+\.\d+\.\d+/);
  assert.match(runtimePackage.dependencies['@aws-sdk/client-secrets-manager'], /^\d+\.\d+\.\d+/);
} finally {
  await rm(firstOutput, { recursive: true, force: true });
  await rm(secondOutput, { recursive: true, force: true });
}

console.log('Reproducible Lambda artifact, checksum, SBOM and local invocation tests passed.');
