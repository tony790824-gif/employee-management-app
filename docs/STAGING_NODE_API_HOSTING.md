# Isolated Staging Node API hosting

## Scope

`render.yaml` defines one isolated Render web service named `bankeban-staging-node-api`. It runs the existing `server/index.mjs` entry point without changing the API, frontend, Production, Google Sheets, or Apps Script paths.

This hosting step does **not** switch frontend traffic. Migration `0011_ui_bootstrap` is not applied by the Blueprint and remains a separate, explicitly approved Staging database step.

Production is not modified or deployed by this hosting definition.

## Safety boundary

- The service is fixed to `BANK_ENV=staging` and binds to `0.0.0.0` only inside the hosting container.
- Automatic deploys are disabled. Creating or syncing the Blueprint does not authorize a Production deploy or a frontend cutover.
- The service starts only after the existing database-target check confirms the configured Staging database.
- Render checks `/v1/readiness`; the endpoint must reach PostgreSQL before a deployment is considered healthy.
- Database credentials, OIDC tenant settings, the tenant-context signing key, and the exact allowed frontend origin are entered in the Render dashboard with `sync: false`. They are never stored in Git.
- The Blueprint contains no migration or import command. It must not be used to apply `0011_ui_bootstrap`.

## Required Render values

Enter these values during the initial Blueprint creation. Obtain them from the existing protected Staging configuration; do not copy values into documentation, source files, issue comments, or deployment logs.

| Key | Classification | Requirement |
|---|---|---|
| `DATABASE_API_URL` | Secret | Existing least-privilege Staging API role; never use migrator or Production credentials. |
| `BANK_STAGING_DATABASE_HOST` | Configuration | Exact approved Staging PostgreSQL hostname. |
| `BANK_OIDC_ISSUER` | Configuration | Exact Auth0 Staging issuer URL. |
| `BANK_OIDC_JWKS_URL` | Configuration | Exact Auth0 Staging JWKS URL. |
| `BANK_TENANT_CONTEXT_KEY` | Secret | Existing Staging HMAC key; do not generate a second unsynchronised trust key. |
| `BANK_TENANT_CONTEXT_KEY_ID` | Configuration | Key ID matching the active Staging database key. |
| `BANK_ALLOWED_ORIGINS` | Configuration | Exact approved Staging frontend origin only; no wildcard. |

The committed non-secret values are `BANK_ENV=staging`, `BANK_API_BIND_HOST=0.0.0.0`, `DATABASE_SSL=require`, the Staging Auth0 API audience, and the namespaced Session claim.

## Creation and verification

1. Sign in to Render using the GitHub identity that can read `tony790824-gif/employee-management-app`.
2. Create a Blueprint from the repository root `render.yaml`.
3. Review that the service is named `bankeban-staging-node-api`, uses the `main` branch, the Singapore region, a Free Staging instance, and has automatic deploys disabled.
4. Enter every `sync: false` value in Render's protected environment-variable form.
5. Create the service and wait for the first deployment to become healthy.
6. Record the generated `onrender.com` hostname in the protected Staging environment only. Do not add it to Production or rebuild the frontend in this step.
7. Verify `GET /v1/health` and `GET /v1/readiness` return HTTP 200 over HTTPS. Do not log response headers or credentials.
8. Confirm the service Events page shows the intended `main` commit and no migration command.

Render Free web services can spin down when idle, so a cold start is acceptable for this isolated acceptance environment but not for Production. A paid always-on instance decision belongs to a later deployment-readiness review.

## Rollback

If creation or startup validation fails, suspend or delete only `bankeban-staging-node-api`. Because no frontend route is switched and no migration is run, the existing Google Sheets paths and all Production systems remain unchanged.
