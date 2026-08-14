# Production Closure Phase 2H — Minimal Default-ACL Principal Classification Evidence

## Decision

- Repository/local implementation: **COMPLETE**.
- Sprint numbering: permanently capped at **Sprint 65**; no Sprint 66 is created.
- Production connections: **0**. Production mutations: **NONE**.
- `STRUCTURAL_NON_ACL`: **PASS** (preserved from immutable Phase 2G Evidence).
- `ACL_SEMANTIC`: **BLOCKED**.
- `STRUCTURAL_STARTING_BASELINE`: **BLOCKED**.
- 22-Gate model: **9 PASS / 13 non-PASS**.
- Production Readiness: **70% / NOT READY**.

## Proven source of the Phase 2G blocker

The Phase 2G collector expanded each `pg_default_acl` record into owner, grantee and grantor identities. `buildAclSemanticSnapshot()` classified all three identities, but persisted only owner and grantee categories and collapsed any unknown identity at any of the three positions into one object-level blocker:

- `DEFAULT_ACL_PRINCIPAL_UNCLASSIFIED:public|S`
- `DEFAULT_ACL_PRINCIPAL_UNCLASSIFIED:public|r`

Here `public` is the schema name and `S`/`r` are the default-ACL object types. The historical Evidence does not retain which principal position failed or the safe category required to decide the semantics. It therefore cannot be reclassified and remains immutable.

## Minimum sanitized model

Model version: `bankeban-default-acl-principal-classification-v1`.

For each relevant row, future Evidence may contain only:

- canonical default-ACL key (`PUBLIC_SCHEMA|RELATION` or `PUBLIC_SCHEMA|SEQUENCE`);
- schema key, object type, explicit/built-in default state;
- principal position: `OWNER`, `GRANTEE`, `GRANTOR`;
- category: `EXPECTED_OWNER`, `EXPECTED_READONLY_ROLE`, `EXPECTED_RUNTIME_ROLE`, `PUBLIC`, `EXTENSION_OWNER`, `SYSTEM_PLATFORM_MANAGED`, `READONLY_MEMBERSHIP_CARRIER`, `OTHER_NAMED_PRINCIPAL`, or `UNCLASSIFIED`;
- privilege, grant option and model version.

Raw owner/grantee/grantor names, raw ACL text, URLs, hostnames, credentials, connection strings, tokens and business rows are forbidden.

## Deterministic classification

- `PUBLIC` is proven only by `aclexplode(...).grantee = 0`, PostgreSQL's PUBLIC grantee OID. A schema named `public` is independently mapped to `PUBLIC_SCHEMA` and never implies the PUBLIC principal.
- Expected owner is the OID that owns `app_private`; expected reader/runtime, the reviewed extension owner and the reviewed platform-managed role are resolved to OIDs inside PostgreSQL.
- A role reachable from the reader through an effective membership path is `READONLY_MEMBERSHIP_CARRIER`.
- An existing but otherwise unreviewed role is `OTHER_NAMED_PRINCIPAL`; missing/non-role metadata is `UNCLASSIFIED`. Both fail closed.

## Default ACL semantics

The narrow model compares each explicit `pg_default_acl.defaclacl` expansion with PostgreSQL's `acldefault(defaclobjtype, defaclrole)` expansion for the same owner, schema and object type.

- Owner, grantee, privilege and grant option participate in semantic equality.
- Grantor category may be ignored for equality only after it is independently classified as `EXPECTED_OWNER`, `EXTENSION_OWNER`, or `SYSTEM_PLATFORM_MANAGED`. Any other grantor blocks.
- Added grant option is a dangerous mismatch.
- PUBLIC privilege expansion, reader write privilege expansion and any unknown principal fail closed.

## Minimum future live scope

A full structural/ACL recollection is not required to answer these two blockers. The dedicated future command is:

`pnpm run db:parity:production-default-acl-principals`

Dedicated confirmation token:

`COMPARE_BANKE_PRODUCTION_DEFAULT_ACL_PRINCIPALS`

The command is not authorized by Phase 2H. If later separately authorized, it is limited to one dedicated-reader connection attempt, retry `0`, authenticated TLS `verify-full`, exact `0001`–`0008` ledger guard, one `READ ONLY` transaction, the reviewed identity/role-boundary catalogs and the two `public` schema relation/sequence default ACLs. Business-row reads and final `0022` parity are excluded.

Future Evidence paths:

- `docs/PRODUCTION_0001_0008_DEFAULT_ACL_PRINCIPAL_EVIDENCE.json`
- `docs/PRODUCTION_0001_0008_DEFAULT_ACL_PRINCIPAL_EVIDENCE.sha256`

The strict contract is `docs/PRODUCTION_0001_0008_DEFAULT_ACL_PRINCIPAL_EVIDENCE.schema.json`.

## Next closure action

Owner may defer or separately authorize exactly one execution of the narrow command at a clean, explicitly named commit. That future authorization must include Neon wake/compute/network/I/O/audit effects and must exclude retries, broader catalog collection, business rows, Migration, repair, writes, Restore, deploy and role/ACL/configuration changes.

Repository conclusion: **READY_FOR_NARROW_DEFAULT_ACL_AUTHORIZATION**. No Production authorization is required to complete Phase 2H itself.
