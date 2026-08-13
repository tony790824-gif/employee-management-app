# Production Closure Phase 2D - ACL Semantic Comparator

Date: 2026-08-13

Status: **COMPLETE FOR REPOSITORY/DISPOSABLE SCOPE; LIVE GATE BLOCKED**

Sprint numbering remains capped at Sprint 65. Phase 2D made no Production connection, reused no credential and performed no Production mutation. The Phase 2B source evidence remains byte-identical with SHA-256 `373de2d509da8a2b1b419430ba89573371f9632ff253c72e07ed99193bf479a7`.

## Why the raw ACL fingerprint was insufficient

The Phase 1 and Phase 2A collectors stored `nspacl`, `relacl` and `proacl` as `aclitem[]::text`. Normalization replaced migration/Extension owner names but did not expand `NULL` ACL defaults, did not separate grantee from grantor, did not model grant options or role reachability, and did not distinguish explicit operational grants from owner-implied rights. Consequently, owner/grantor spelling, Extension installation identity and equivalent NULL/explicit serialization could change the raw fingerprint without changing effective security.

Phase 2D does not delete ACLs from comparison. It adopts two independently auditable fingerprints:

1. non-ACL structural fingerprint; and
2. versioned semantic ACL fingerprint (`bankeban-acl-semantics-v1`).

Both must pass. The final starting-baseline Gate is PASS only when `STRUCTURAL_NON_ACL_MATCH=PASS` and `ACL_SEMANTIC_MATCH=PASS`. `FRESH_LEDGER_AND_CHECKSUM` remains a separate prerequisite.

## Threat model and principal categories

The model classifies principals before hashing and never persists raw live principal names:

- `EXPECTED_OWNER`
- `EXPECTED_READONLY_ROLE`
- `EXPECTED_RUNTIME_ROLE`
- `PUBLIC`
- `EXTENSION_OWNER`
- `SYSTEM_PLATFORM_MANAGED`
- `READONLY_MEMBERSHIP_CARRIER`
- `OTHER_NAMED_PRINCIPAL`

`OTHER_NAMED_PRINCIPAL`, an unreviewed Extension owner, unknown grantor, unsupported privilege, incomplete/default-unexpanded facts, sensitive fields or model-version mismatch fail closed. Principal-name differences are equivalent only when both names were independently mapped to the same reviewed category. A name is never trusted merely because it differs by environment.

## Semantic privilege model

| Object | Effective privileges modeled |
|---|---|
| Schema | `USAGE`, `CREATE` |
| Relation | `SELECT`, `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE`, `REFERENCES`, `TRIGGER`, PostgreSQL 18 `MAINTAIN` |
| Function | `EXECUTE` |
| Sequence | `USAGE`, `SELECT`, `UPDATE` |

`pg_catalog.aclexplode(COALESCE(raw_acl, pg_catalog.acldefault(...)))` expands NULL and explicit ACLs into the same effective privilege representation. Owner-implied privileges are modeled explicitly. Grant options are retained; adding one is a mismatch. Known trusted grantor spelling is validated but omitted from the effective-privilege fingerprint because the effective privilege result is the same; an unknown grantor blocks the snapshot.

Default privilege ACLs are collected separately from `pg_default_acl`. Outbound role memberships reachable from the dedicated read-only role are also modeled; `INHERIT`, `SET` or `ADMIN OPTION` reachability cannot disappear into raw ACL normalization. A changed reachable path is a semantic mismatch. Inbound-only memberships do not expand the read-only role and are not treated as outbound privilege carriers.

## pgcrypto findings

Two independent disposable PostgreSQL 18.4 databases installed `pgcrypto` through Migration `0001`. Each produced 37 Extension Functions, all 37 with default PUBLIC `EXECUTE`; their semantic and approved-policy fingerprints were identical. This proves deterministic semantics across fresh Extension installations in the reviewed environment. It explains why Extension installation identity and raw ACL serialization may vary, but does not make every pgcrypto ACL harmless.

The model requires the exact reviewed Extension name, a reviewed Extension-owner category, and the same effective PUBLIC/other privileges. PUBLIC `EXECUTE` added or removed remains visible as a semantic difference.

## Disposable test matrix

- identical raw ACL / identical semantics: `SEMANTIC_MATCH`
- NULL default / explicit equivalent ACL: `SEMANTIC_MATCH`
- reviewed owner-name variation / same semantics: `SEMANTIC_MATCH`
- reviewed Extension-owner variation / same semantics: `SEMANTIC_MATCH`
- different reviewed grantor / same effective privileges: `SEMANTIC_MATCH`
- PUBLIC privilege added: `SEMANTIC_MISMATCH`
- PUBLIC default Function EXECUTE removed: `SEMANTIC_MISMATCH`
- read-only role gains write privilege: `SEMANTIC_MISMATCH`
- grant option added: `SEMANTIC_MISMATCH`
- outbound membership expands read-only reachability: `SEMANTIC_MISMATCH`
- unexpected named principal: `BLOCKED`
- unexpanded/unparseable ACL or model-version mismatch: `BLOCKED`

Structural non-ACL mismatch remains a mismatch even if ACL semantics match. Sanitization failure also blocks evidence generation.

## Historical Phase 2B limitation

The Phase 2B evidence intentionally stores only object keys and `changedFields=["acl"]`; it stores no privilege, grantee category, grant-option, default ACL or membership facts. Therefore **0 of 57** ACL differences can be reclassified as semantic match or semantic mismatch from existing evidence. All 57 remain `INSUFFICIENT_EVIDENCE`. This is derived analysis, not a rewrite of Phase 2B evidence.

## Minimum future sanitized evidence

A future separately authorized read-only run would need only:

- model/schema version and source artifact hash;
- object type and canonical object identity;
- Extension classification, without platform owner name;
- categorized owner/grantee;
- canonical privilege set and grant-option booleans;
- NULL/default expansion state and categorized default privileges;
- dedicated-reader outbound membership categories and effective `INHERIT`/`SET`/`ADMIN` flags;
- non-ACL and semantic ACL fingerprints;
- identity/TLS/ledger/Gate status and evidence hash.

It must not store credentials, URLs, endpoints, hostnames, raw Production principal names, raw ACL text, secrets or business data. A new connection would require a new explicit single-use authorization and possible Neon wake/usage acknowledgement.

## Current Gate decision

Repository/disposable comparator defect resolution: **PASS**. Existing live semantic evidence: **INSUFFICIENT**. `STRUCTURAL_STARTING_BASELINE`: **BLOCKED**. `FRESH_LEDGER_AND_CHECKSUM`: **BLOCKED**. The authoritative 22-Gate state remains 9 PASS / 13 non-PASS; Production remains 70% / NOT READY; Gate A DEFER; Provisioning and Migration Technical Readiness NO-GO; Migration authorization NOT_GRANTED.

The exact next action is an Owner decision on one minimum, single-use, dedicated-reader semantic ACL/non-ACL metadata collection. No Production authorization is needed merely to complete Phase 2D Repository work, and no repair is authorized.
