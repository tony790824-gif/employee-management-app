# Production Closure Phase 2J - Opaque OID Grantee Classification Design

## Boundary and decision

- Sprint numbering remains capped at **65**; Sprint 66 was not created.
- Production connections: **0**. Production mutations: **NONE**.
- Phase 2I authorization is **CONSUMED / NOT REUSABLE**.
- Existing immutable Evidence is **not sufficient** to identify the unresolved GRANTEE. It proves only `OTHER_NAMED_PRINCIPAL`, not a reviewed semantic relationship.
- `STRUCTURAL_NON_ACL=PASS`; `ACL_SEMANTIC=BLOCKED`; `STRUCTURAL_STARTING_BASELINE=BLOCKED`; independent `FRESH_LEDGER_AND_CHECKSUM=BLOCKED`.
- The 22-Gate matrix remains **9 PASS / 13 non-PASS** and Production remains **70% / NOT READY**.

## Minimum unresolved proof

The only missing fact is whether the opaque GRANTEE OID in each explicit `public` schema relation/sequence default ACL has exactly one reviewed OID relationship:

- database/application-schema owner -> `EXPECTED_OWNER`
- dedicated reader -> `EXPECTED_READONLY_ROLE`
- application runtime -> `EXPECTED_RUNTIME_ROLE`
- reviewed Neon platform role -> `SYSTEM_PLATFORM_MANAGED`
- reviewed pgcrypto owner -> `EXTENSION_OWNER`
- effective outbound reader-membership target -> `READONLY_MEMBERSHIP_CARRIER`
- OID 0 -> `PUBLIC`

PostgreSQL performs these comparisons internally. The query returns only category, category proof enum, match count, membership classification, object type, privilege and grant-option facts. It never returns a raw OID, role name, ACL string or connection identity.

## Fail-closed model

- Zero reviewed relationship matches -> `OTHER_NAMED_PRINCIPAL` or `UNCLASSIFIED` and BLOCKED.
- More than one semantic category match -> `AMBIGUOUS_OID_RELATION` and BLOCKED.
- Unexpected/effective outbound membership overlap -> `AMBIGUOUS` and BLOCKED.
- Grant option is preserved per privilege. A reviewed principal category does not erase or normalize grant option.
- Source Evidence hash/schema/scope, exact `0001`-`0008` ledger, target identity, reader role boundary, TLS verify-full, read-only transaction, clean authorized Commit and cleanup all remain mandatory.
- A successful narrow classification means only `CLASSIFICATION_PROVEN`; it does **not** by itself promote `ACL_SEMANTIC`. Semantic recomposition against immutable Phase 2I privileges remains a separate required step.

## Rename and recreate behavior

Classification is based on an OID relationship established inside the transaction, not persisted display text:

- rename with the same OID relationship: classification is unchanged;
- drop/recreate with a reused name and a different OID: classification is not inherited and remains BLOCKED unless a current reviewed relationship independently matches.

Runtime and reader names are used only as guarded inputs to resolve current OIDs inside PostgreSQL. They are never returned or persisted. Expected-owner classification uses database/application-schema ownership OIDs and therefore does not depend on a display name.

## Future evidence contract

The minimum future Evidence schema is `docs/PRODUCTION_0001_0008_OPAQUE_GRANTEE_CLASSIFICATION_EVIDENCE.schema.json`. It permits only:

- GRANTEE position;
- reviewed category and proof enum;
- relation/sequence default ACL key;
- explicit/default state;
- privilege and grant option;
- membership classification;
- classification result and sanitized fingerprint;
- execution-boundary, ledger, TLS, role and cleanup results.

It explicitly records `rawOidPersisted=false`, `rawPrincipalNamePersisted=false`, `businessRowReads=NONE`, one connection attempt and zero retries.

## Future-only command

Implementation is complete, but no execution is authorized in Phase 2J:

- command: `pnpm run db:parity:production-default-acl-opaque-grantee`
- confirmation token: `COMPARE_BANKE_PRODUCTION_DEFAULT_ACL_OPAQUE_GRANTEE`

This collector is narrower than Phase 2H: it reads only the unresolved explicit GRANTEE classification proof for `public` relation/sequence default ACLs after the existing guards. Any future execution requires a new, separately scoped, one-time Owner authorization and may not reuse Phase 2I authorization.

## Test matrix

Repository/mock coverage includes PUBLIC OID 0, expected owner/runtime/reader/platform/extension roles, membership carrier, unrelated role, ambiguous membership, grant option, rename stability, drop/recreate safety, empty/default ACL, explicit ACL, relation ACL, sequence ACL, query allowlist, one connection/no retry, TLS, read-only transaction, exact ledger, evidence hashing and sensitive-field rejection.

No Production result is inferred. The unknown GRANTEE remains unknown until a future authorized Evidence collection proves exactly one reviewed relationship.
