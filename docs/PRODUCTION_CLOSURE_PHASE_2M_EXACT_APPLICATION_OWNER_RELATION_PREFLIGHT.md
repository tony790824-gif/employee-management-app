# Production Closure Phase 2M — EXACT_APPLICATION_OBJECT_OWNER_RELATION Preflight

## Boundary and decision

- Sprint numbering remains capped at Sprint 65.
- Repository/local-only analysis; Production connections **0**, mutations **NONE**.
- Decision: **A — PROOF_CONTRACT_READY**.
- The proof can classify an opaque GRANTEE as the existing `EXPECTED_OWNER` category only after a future, separately authorized Live catalog relationship proves every condition below.
- This phase implements no Production collector and grants no Production authorization.

## Architecture options reviewed

1. Raw principal name or persisted OID: rejected because names are mutable and raw identity persistence violates the Evidence boundary.
2. Privilege-shape inference: rejected because the PostgreSQL owner-default 8/3 shape identifies semantics, not the GRANTEE or source.
3. Exact versioned object ownership plus role-boundary proof: selected because it is relationship-based, survives rename, rejects drop/recreate, and can be reduced database-side to hashes, counts, enums and booleans.

The CTO/database/security review accepts option 3 only with complete coverage, one owner, no dangerous attributes, no outbound membership, no unrelated ownership and no ambiguous reviewed-category match. QA requires every counterfactual to fail closed. Operations requires one connection, no retry, `READ ONLY`, TLS `verify-full`, temporary CA and cleanup.

## Exact application-object set

The versioned artifact is `bankeban-0001-0008-application-owner-set-v1`, derived from the committed structural and ACL baselines for exact Migrations `0001`–`0008`.

Required to have the same application owner:

| Type | Count | Rule |
|---|---:|---|
| Current database | 1 | Logical `CURRENT_DATABASE`; database identity remains independently guarded |
| `app_private` schema | 1 | Migration-owned application schema |
| Tables/relations | 18 | All reviewed `public` and `app_private` application relations |
| Indexes | 34 | Ownership follows the reviewed application relations and must match |
| Application Functions | 11 | Exact non-Extension signatures from the starting baseline |
| Sequences | 0 | Any observed sequence is an object-set mismatch |
| Views | 0 | Any observed view is an object-set mismatch |
| Materialized views | 0 | Any observed materialized view is an object-set mismatch |
| **Total** | **65** | Ownership coverage must be 65/65 and owner-set count exactly 1 |

Separately classified or excluded:

- schema `public` is owned by PostgreSQL `pg_database_owner`; it is reviewed as a system database-owner alias and is not allowed to contaminate the application-owner set;
- 37 `pgcrypto` Functions and both reviewed Extensions are Extension/platform managed;
- `pg_catalog` objects are excluded;
- 140 columns, 234 constraints, 11 policies and 9 triggers have no independent owner proof in this model and are covered through their parent relation/Function ownership.

Artifact paths:

- `database/production-0001-0008-application-owner-object-set.json`
- `database/production-0001-0008-application-owner-object-set.sha256`

Object-set fingerprint: `ce84209b37fe81c7ec93d211327f2e0f3cb4576a5966d48803dae6ddd2bf6200`.

Companion file SHA-256: `dd057fa39036cd71115c4420941c6e936172b749af587aae41b71b0c9b25a0cc`.

## Owner proof policy

`EXACT_APPLICATION_OBJECT_OWNER_RELATION` passes only when:

1. the opaque GRANTEE resolves internally to exactly one role;
2. its transient identity owns all 65 reviewed objects;
3. the observed owner set contains exactly one identity;
4. `EXPECTED_OWNER` is the only reviewed-category match;
5. ambiguity and PUBLIC OID-zero matches are absent;
6. `rolsuper`, `rolcreatedb`, `rolcreaterole`, `rolreplication` and `rolbypassrls` are all false;
7. outbound and effective outbound membership counts are zero;
8. unrelated ownership outside the exact or separately classified scope is zero;
9. Extension/platform exclusions exactly match the committed artifact;
10. no business rows are read and no raw name/OID is persisted.

`LOGIN` and `INHERIT` are not used as positive identity proof. `INHERIT` cannot expand privileges when outbound membership is zero. Inbound membership does not expand the owner's effective privileges, but it cannot create a second reviewed-category match.

Ownership is security-meaningful because ownership carries object alteration and privilege-delegation authority. The classification therefore acknowledges inherent owner delegation; it does not declare every explicit ACL safe. Any extra ownership, dangerous attribute or membership path blocks the proof.

Rename preserves classification because the OID/object relationship is unchanged. Drop/recreate cannot inherit classification because the new transient role identity does not own the existing exact object set.

## Grant-option interaction

The 8 relation privileges and 3 sequence privileges match PostgreSQL built-in owner-default privilege shapes, including grant option. This is shape equivalence only.

The Live facts are `EXPLICIT_DEFAULT_ACL`, not built-in owner defaults. Bankeban's committed baseline contains no explicit default privileges, and Repository policy does not authorize explicit `WITH GRANT OPTION`. Therefore:

- relation owner-default shape: equivalent;
- sequence owner-default shape: equivalent;
- explicit default ACL state: not equivalent;
- explicit grant option: not equivalent and not approved;
- owner proof PASS would classify the principal, but the 11 explicit facts would remain `SEMANTIC_MISMATCH` until separately resolved by evidence or an authorized policy/change process.

No explicit grant option is normalized away.

## Minimum future Live proof contract

The future collector is reserved but **not implemented** in Phase 2M:

- proposed command: `pnpm run db:parity:production-application-owner-relation`;
- proposed confirmation token: `COMPARE_BANKE_PRODUCTION_APPLICATION_OWNER_RELATION`;
- one `pg.Client`, one connection attempt, retry `0`;
- dedicated Production read-only credential only;
- TLS `verify-full` with temporary trusted CA;
- exact source Commit provenance;
- `READ ONLY` transaction;
- no final `0022` parity, Migration, DDL/DML or business-row read;
- close connection, clear process-only credentials and delete temporary CA on success or failure.

Catalog scope is limited to `pg_database`, `pg_namespace`, `pg_class`, `pg_proc`, `pg_roles`, `pg_auth_members`, `pg_default_acl`/`aclexplode`, `pg_depend` and `pg_extension`. All identity comparison occurs inside PostgreSQL.

Sanitized Evidence may contain only source Commit, object-set version/fingerprint, coverage/expected counts, owner-set count, exact-match boolean, reviewed category, proof enum, ambiguity, membership classification, role-boundary result, grant-option semantic result, blockers and final proof status. Raw principal name, raw OID, raw ACL, URL, hostname, credential, connection identifier and business data are forbidden.

The schema is `docs/PRODUCTION_0001_0008_APPLICATION_OWNER_RELATION_EVIDENCE.schema.json`.

## Test and threat-model result

Repository tests cover complete ownership, missing/extra/two-owner states, arbitrary role, rename, drop/recreate, membership, every dangerous attribute, exclusions, artifact/hash tampering, count mismatch, PUBLIC OID zero, relation/sequence built-in shapes, explicit grant-option rejection, raw identity rejection and absence of a Production connection implementation.

## Gate state

- `STRUCTURAL_NON_ACL=PASS`
- `ACL_SEMANTIC=BLOCKED`
- `STRUCTURAL_STARTING_BASELINE=BLOCKED`
- `FRESH_LEDGER_AND_CHECKSUM=BLOCKED` independently
- 22-Gate remains **9 PASS / 13 non-PASS**
- Production remains **70% / NOT READY**
- Gate A `DEFER`; Provisioning `NO_GO`; Migration authorization `NOT_GRANTED`

## Next closure action

Owner review of this proof contract is the next action. If accepted, implement and locally preflight the reserved minimal collector as a separate Production Closure phase. Only after that preflight passes may a new single-use Production read-only authorization be considered. No authorization exists now.
