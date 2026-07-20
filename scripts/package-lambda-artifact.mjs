import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFile, lstat, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { zipSync } from 'fflate';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ARTIFACT_BASENAME = 'banke-auth0-security-events-staging';
const SOURCE_FILES = Object.freeze([
  'security-events/auth0-event.mjs',
  'security-events/database.mjs',
  'security-events/handler.mjs'
]);
const EXCLUDED_NAMES = new Set([
  '.bin', '.modules.yaml', '.package-map.json', '.pnpm', '.pnpm-workspace-state-v1.json'
]);
const FORBIDDEN_FILE_PATTERN = /(?:^|\/)(?:\.env(?:\..*)?|[^/]+\.(?:key|pem|p12|pfx))$/i;
const FIXED_ZIP_DATE = new Date(1980, 0, 1, 0, 0, 0);

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

async function json(file) {
  return JSON.parse(await readFile(file, 'utf8'));
}

function packageManagerInvocation() {
  const executable = String(process.env.npm_execpath || '');
  if (executable && /pnpm(?:\.c?js)?$/i.test(executable.replaceAll('\\', '/'))) {
    return { command: process.execPath, arguments: [executable] };
  }
  return process.platform === 'win32'
    ? { command: process.env.ComSpec || 'cmd.exe', arguments: ['/d', '/s', '/c', 'pnpm.cmd'] }
    : { command: 'pnpm', arguments: [] };
}

function installProductionDependencies(installRoot) {
  const pnpm = packageManagerInvocation();
  const installArguments = [
    'install', '--dir', installRoot, '--prod', '--frozen-lockfile',
    '--prefer-offline', '--ignore-scripts', '--node-linker=hoisted', '--config.package-import-method=copy',
    '--store-dir', path.join(PROJECT_ROOT, '.pnpm-store')
  ];
  const argumentsToSpawn = [...pnpm.arguments, ...installArguments];
  const result = spawnSync(pnpm.command, argumentsToSpawn, {
    cwd: PROJECT_ROOT, encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });
  if (result.status !== 0) {
    throw new Error(`LAMBDA_DEPENDENCY_INSTALL_FAILED\n${String(result.stderr || result.stdout).trim()}`);
  }
}

async function copyTree(source, destination, relative = '') {
  const sourceStat = await lstat(source);
  if (sourceStat.isSymbolicLink()) throw new Error(`LAMBDA_SYMLINK_REJECTED:${relative}`);
  if (sourceStat.isDirectory()) {
    await mkdir(destination, { recursive: true });
    const entries = await readdir(source, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name, 'en'));
    for (const entry of entries) {
      if (EXCLUDED_NAMES.has(entry.name)) continue;
      const childRelative = relative ? `${relative}/${entry.name}` : entry.name;
      if (FORBIDDEN_FILE_PATTERN.test(childRelative)) {
        throw new Error(`LAMBDA_FORBIDDEN_FILE_REJECTED:${childRelative}`);
      }
      await copyTree(path.join(source, entry.name), path.join(destination, entry.name), childRelative);
    }
    return;
  }
  if (!sourceStat.isFile()) throw new Error(`LAMBDA_UNSUPPORTED_FILE_REJECTED:${relative}`);
  await mkdir(path.dirname(destination), { recursive: true });
  await copyFile(source, destination);
}

async function installedPackageDirectories(nodeModules) {
  const directories = [];
  const topLevel = await readdir(nodeModules, { withFileTypes: true });
  topLevel.sort((left, right) => left.name.localeCompare(right.name, 'en'));
  for (const entry of topLevel) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    const topPath = path.join(nodeModules, entry.name);
    if (entry.name.startsWith('@')) {
      const scoped = await readdir(topPath, { withFileTypes: true });
      scoped.sort((left, right) => left.name.localeCompare(right.name, 'en'));
      for (const child of scoped) {
        if (child.isDirectory()) directories.push(path.join(topPath, child.name));
      }
    } else {
      directories.push(topPath);
    }
  }
  return directories;
}

function purl(name, version) {
  const encodedName = name.startsWith('@')
    ? `${encodeURIComponent(name.slice(0, name.indexOf('/')))}/${encodeURIComponent(name.slice(name.indexOf('/') + 1))}`
    : encodeURIComponent(name);
  return `pkg:npm/${encodedName}@${encodeURIComponent(version)}`;
}

async function createSbom(nodeModules, projectPackage) {
  const packages = [];
  for (const directory of await installedPackageDirectories(nodeModules)) {
    const manifestFile = path.join(directory, 'package.json');
    const raw = await readFile(manifestFile);
    const manifest = JSON.parse(raw.toString('utf8'));
    assert.match(String(manifest.name || ''), /^(?:@[a-z0-9._~-]+\/)?[a-z0-9._~-]+$/i);
    assert.match(String(manifest.version || ''), /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/);
    packages.push({ manifest, ref: purl(manifest.name, manifest.version), packageJsonSha256: sha256(raw) });
  }
  packages.sort((left, right) => left.ref.localeCompare(right.ref, 'en'));
  const byName = new Map(packages.map(item => [item.manifest.name, item.ref]));
  const rootRef = `pkg:generic/${ARTIFACT_BASENAME}@${encodeURIComponent(projectPackage.version)}`;
  const components = packages.map(({ manifest, ref, packageJsonSha256 }) => ({
    type: 'library',
    'bom-ref': ref,
    name: manifest.name,
    version: manifest.version,
    purl: ref,
    hashes: [{ alg: 'SHA-256', content: packageJsonSha256 }],
    ...(manifest.license ? { licenses: [{ license: { name: String(manifest.license) } }] } : {})
  }));
  const dependencyGraph = packages.map(({ manifest, ref }) => ({
    ref,
    dependsOn: [...new Set(Object.keys({
      ...manifest.dependencies,
      ...manifest.optionalDependencies,
      ...manifest.peerDependencies
    }).map(name => byName.get(name)).filter(Boolean))].sort()
  }));
  const direct = Object.keys(projectPackage.dependencies || {}).map(name => byName.get(name)).filter(Boolean).sort();
  const identity = sha256(stableJson({ components, dependencyGraph }));
  const uuid = `${identity.slice(0, 8)}-${identity.slice(8, 12)}-5${identity.slice(13, 16)}-a${identity.slice(17, 20)}-${identity.slice(20, 32)}`;
  return {
    bomFormat: 'CycloneDX',
    specVersion: '1.5',
    serialNumber: `urn:uuid:${uuid}`,
    version: 1,
    metadata: {
      component: {
        type: 'application', 'bom-ref': rootRef,
        name: ARTIFACT_BASENAME, version: projectPackage.version
      },
      properties: [
        { name: 'banke:environment', value: 'staging' },
        { name: 'banke:runtime', value: 'nodejs22.x' },
        { name: 'banke:package-manager', value: projectPackage.packageManager }
      ]
    },
    components,
    dependencies: [{ ref: rootRef, dependsOn: direct }, ...dependencyGraph]
  };
}

async function collectFiles(root, current = root) {
  const files = [];
  const entries = await readdir(current, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name, 'en'));
  for (const entry of entries) {
    const absolute = path.join(current, entry.name);
    const relative = path.relative(root, absolute).replaceAll('\\', '/');
    if (FORBIDDEN_FILE_PATTERN.test(relative)) throw new Error(`LAMBDA_FORBIDDEN_FILE_REJECTED:${relative}`);
    const entryStat = await lstat(absolute);
    if (entryStat.isSymbolicLink()) throw new Error(`LAMBDA_SYMLINK_REJECTED:${relative}`);
    if (entryStat.isDirectory()) files.push(...await collectFiles(root, absolute));
    else if (entryStat.isFile()) files.push({ relative, bytes: await readFile(absolute) });
    else throw new Error(`LAMBDA_UNSUPPORTED_FILE_REJECTED:${relative}`);
  }
  return files.sort((left, right) => left.relative.localeCompare(right.relative, 'en'));
}

function deterministicZip(files) {
  const entries = {};
  for (const file of files) {
    entries[file.relative] = [new Uint8Array(file.bytes), { mtime: FIXED_ZIP_DATE, os: 3 }];
  }
  return Buffer.from(zipSync(entries, { level: 9 }));
}

async function verifyLocalInvocation(packageRoot) {
  const handlerModule = await import(`${pathToFileURL(path.join(packageRoot, 'security-events/handler.mjs')).href}?artifact=1`);
  const requireFromArtifact = createRequire(path.join(packageRoot, 'package.json'));
  await import(pathToFileURL(requireFromArtifact.resolve('@aws-sdk/client-secrets-manager')).href);
  assert.ok(requireFromArtifact.resolve('pg'));
  const source = 'aws.partner/auth0.com/synthetic/staging';
  const queueArn = 'arn:aws:sqs:ap-southeast-1:123456789012:banke-auth0-security-events-staging';
  const now = new Date('2026-07-20T12:00:00.000Z');
  const logs = [];
  let writes = 0;
  const invocation = handlerModule.createSecurityEventHandler({
    env: {
      BANK_ENV: 'staging', AUTH0_ISSUER: 'https://synthetic-staging.auth0.com/',
      AUTH0_EVENT_SOURCE: source, AUTH0_SECURITY_EVENT_QUEUE_ARN: queueArn,
      AWS_ACCOUNT_ID: '123456789012', AWS_PARTITION: 'aws', AWS_REGION: 'ap-southeast-1',
      DATABASE_EVENT_SECRET_ARN: 'arn:aws:secretsmanager:ap-southeast-1:123456789012:secret:synthetic',
      BANK_STAGING_DATABASE_HOST: 'synthetic-staging.invalid', BANK_STAGING_DATABASE_NAME: 'banke_staging'
    },
    now: () => now,
    repositoryFactory: async () => ({
      ingest: async () => { writes += 1; return { status: 'processed', duplicate: false }; }
    }),
    logger: { info: line => logs.push(line), error: line => logs.push(line) }
  });
  const result = await invocation({ Records: [{
    messageId: 'artifact-invocation-0001', eventSource: 'aws:sqs', eventSourceARN: queueArn,
    body: JSON.stringify({
      version: '0', id: 'artifact-event-0001', account: '123456789012', region: 'ap-southeast-1',
      source, time: now.toISOString(),
      detail: {
        log_id: 'artifact-auth0-log-0001', type: 'ferrt', date: now.toISOString(),
        user_id: 'auth0|artifact-user', session_id: 'artifact-session-0001'
      }
    })
  }] });
  assert.deepEqual(result, { batchItemFailures: [] });
  assert.equal(writes, 1);
  assert.ok(logs.every(line => !line.includes('artifact-session') && !line.includes('auth0|artifact-user')));
}

export async function buildLambdaArtifact({ outputDirectory = path.join(PROJECT_ROOT, 'artifacts', 'aws-staging') } = {}) {
  const temporaryRoot = await mkdtemp(path.join(tmpdir(), 'bankeban-lambda-package-'));
  try {
    const installRoot = path.join(temporaryRoot, 'install');
    const packageRoot = path.join(temporaryRoot, 'package');
    await mkdir(installRoot, { recursive: true });
    await mkdir(packageRoot, { recursive: true });
    await copyFile(path.join(PROJECT_ROOT, 'package.json'), path.join(installRoot, 'package.json'));
    await copyFile(path.join(PROJECT_ROOT, 'pnpm-lock.yaml'), path.join(installRoot, 'pnpm-lock.yaml'));
    installProductionDependencies(installRoot);

    for (const source of SOURCE_FILES) {
      await copyTree(path.join(PROJECT_ROOT, source), path.join(packageRoot, source), source);
    }
    await copyTree(path.join(installRoot, 'node_modules'), path.join(packageRoot, 'node_modules'), 'node_modules');

    const projectPackage = await json(path.join(PROJECT_ROOT, 'package.json'));
    const directVersions = {};
    for (const dependency of Object.keys(projectPackage.dependencies || {}).sort()) {
      const manifestPath = path.join(packageRoot, 'node_modules', ...dependency.split('/'), 'package.json');
      directVersions[dependency] = (await json(manifestPath)).version;
    }
    await writeFile(path.join(packageRoot, 'package.json'), stableJson({
      name: ARTIFACT_BASENAME,
      version: projectPackage.version,
      private: true,
      type: 'module',
      engines: { node: '>=22' },
      dependencies: directVersions
    }), 'utf8');
    const sbom = await createSbom(path.join(packageRoot, 'node_modules'), projectPackage);
    const sbomBytes = Buffer.from(stableJson(sbom));
    await mkdir(path.join(packageRoot, 'sbom'), { recursive: true });
    await writeFile(path.join(packageRoot, 'sbom', 'bom.cdx.json'), sbomBytes);

    const sourceHashes = {};
    for (const source of SOURCE_FILES) sourceHashes[source] = sha256(await readFile(path.join(PROJECT_ROOT, source)));
    await writeFile(path.join(packageRoot, 'artifact-manifest.json'), stableJson({
      schemaVersion: 1,
      artifact: `${ARTIFACT_BASENAME}.zip`,
      environment: 'staging',
      handler: 'security-events/handler.handler',
      runtime: 'nodejs22.x',
      packageManager: projectPackage.packageManager,
      sources: sourceHashes,
      runtimeDependencies: directVersions,
      sbom: 'sbom/bom.cdx.json'
    }), 'utf8');

    await verifyLocalInvocation(packageRoot);
    const files = await collectFiles(packageRoot);
    const archive = deterministicZip(files);
    const archiveSha256 = sha256(archive);
    await mkdir(outputDirectory, { recursive: true });
    const artifactPath = path.join(outputDirectory, `${ARTIFACT_BASENAME}.zip`);
    const checksumPath = `${artifactPath}.sha256`;
    const sbomPath = path.join(outputDirectory, `${ARTIFACT_BASENAME}.sbom.cdx.json`);
    await writeFile(artifactPath, archive);
    await writeFile(checksumPath, `${archiveSha256}  ${path.basename(artifactPath)}\n`, 'utf8');
    await writeFile(sbomPath, sbomBytes);
    return {
      artifactPath, checksumPath, sbomPath, sha256: archiveSha256,
      fileCount: files.length, componentCount: sbom.components.length,
      compressedBytes: archive.length,
      uncompressedBytes: files.reduce((total, file) => total + file.bytes.length, 0),
      invocationVerified: true
    };
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

function outputArgument(argv) {
  const argument = argv.find(value => value.startsWith('--output='));
  return argument ? path.resolve(PROJECT_ROOT, argument.slice('--output='.length)) : undefined;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await buildLambdaArtifact({ outputDirectory: outputArgument(process.argv.slice(2)) });
  console.log(JSON.stringify({
    artifact: path.relative(PROJECT_ROOT, result.artifactPath).replaceAll('\\', '/'),
    checksum: path.relative(PROJECT_ROOT, result.checksumPath).replaceAll('\\', '/'),
    sbom: path.relative(PROJECT_ROOT, result.sbomPath).replaceAll('\\', '/'),
    sha256: result.sha256,
    files: result.fileCount,
    components: result.componentCount,
    compressedBytes: result.compressedBytes,
    uncompressedBytes: result.uncompressedBytes,
    localInvocation: 'passed'
  }, null, 2));
}
