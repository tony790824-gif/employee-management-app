# Lambda artifact packaging

Date: 2026-07-20

Status: locally reproducible and verified; no artifact has been uploaded and no cloud resource has been created or deployed.

## Build command

Install the repository dependencies from the committed lockfile first, then run:

```text
pnpm lambda:package:staging
```

The command performs a production-only, frozen-lockfile installation in an isolated temporary directory. It prefers the Git-ignored project package cache and retrieves only missing locked content. Dependency install scripts are disabled and the hoisted dependency tree is copied without pnpm symlinks or content-store paths.

Generated outputs are Git-ignored under `artifacts/aws-staging/`:

```text
banke-auth0-security-events-staging.zip
banke-auth0-security-events-staging.zip.sha256
banke-auth0-security-events-staging.sbom.cdx.json
```

The ZIP contains:

- `security-events/handler.mjs`, `auth0-event.mjs` and `database.mjs`;
- complete production `node_modules`, including exact `pg` and `@aws-sdk/client-secrets-manager` versions;
- a minimal runtime `package.json`;
- `artifact-manifest.json` with Handler, runtime, exact direct dependency versions and source hashes;
- the same CycloneDX 1.5 SBOM at `sbom/bom.cdx.json`.

The CloudFormation Handler remains `security-events/handler.handler` and matches this ZIP layout.

## Reproducibility controls

- pnpm is pinned through `packageManager` and resolution is pinned by `pnpm-lock.yaml`.
- Packaging installs only production dependencies, requires `--frozen-lockfile`, prefers the local package cache and disables package scripts.
- ZIP file names are sorted and every ZIP entry uses the same fixed timestamp.
- Generated pnpm state, `.pnpm`, `.bin`, `.env`, private-key and certificate files are excluded or rejected.
- Symlinks and unsupported filesystem entries fail the build.
- The checksum uses SHA256 over the final ZIP bytes.
- The regression test builds twice in independent temporary directories and requires identical ZIP bytes and checksum.

## SBOM

The CycloneDX 1.5 SBOM lists every packaged runtime component with:

- package name and exact installed version;
- npm package URL;
- SHA256 of the installed package manifest;
- declared license when available;
- direct and transitive dependency relationships.

The SBOM is deterministic and contains no build timestamp, local path, credential or Secret.

## Local invocation

Packaging fails unless the isolated Artifact can:

1. resolve the packaged PostgreSQL driver;
2. resolve and load the packaged AWS Secrets Manager client;
3. load `security-events/handler.mjs` from the staged Artifact;
4. process a synthetic Staging SQS/Auth0 security event;
5. produce no batch failure and no sensitive subject/session value in logs.

The invocation injects an in-memory repository and does not contact AWS, Auth0, Neon or any other external service.

## Review and upload boundary

Before any future upload, a reviewer must verify the generated checksum, SBOM, uncompressed size and Git source revision. Uploading the exact ZIP to a versioned Staging S3 bucket, binding its immutable object version in CloudFormation, AWS template validation and change-set review are separate externally approved steps.

No artifact from this command is approved for Production.

## Reference

- AWS Lambda Node.js ZIP packages: https://docs.aws.amazon.com/lambda/latest/dg/nodejs-package.html
- AWS Lambda self-managed versioned S3 storage: https://docs.aws.amazon.com/lambda/latest/dg/configuration-self-managed-storage.html
