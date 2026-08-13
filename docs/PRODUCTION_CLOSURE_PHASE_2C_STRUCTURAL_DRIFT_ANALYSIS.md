# Production Closure Phase 2C - Sanitized Structural Drift Analysis

Date: 2026-08-13

Status: **COMPLETE FOR REPOSITORY/LOCAL ANALYSIS; LIVE GATE BLOCKED**

Sprint numbering remains capped at Sprint 65. Phase 2B used its one authorized Production read-only connection exactly once; that authorization is consumed. Phase 2C made no Production connection and performed no Production mutation.

## Immutable Phase 2B source

- Source evidence SHA-256: `373de2d509da8a2b1b419430ba89573371f9632ff253c72e07ed99193bf479a7` (**PASS**).
- JSON schema/custom sanitizer: **PASS**.
- Source Commit provenance: `c3653add472211a27e929c9194f540fb00d11ee6` exists and matches the Phase 2A implementation.
- Expected artifact SHA-256: `6f09dd605cd939fc6bb9de778a6690d93cc66764334722fd2afbf7d5d6e70076` (**PASS**).
- Expected fingerprint: `885b29cd316ab781db613373979d31c92766bd3d0fcf7b062f8da33f451a596e`.
- Observed fingerprint: `01761d441417806c60d0e706d16ae0f3b45bee23e9819d23ecb2f9dc56e97fb2`.
- `STARTING_LEDGER`: **PASS**, exact eight rows with no reported ledger differences.
- Structural comparison: **MISMATCH / BLOCKED**.
- Forbidden secret fields: **NONE**. Production mutation: **false**.

The Phase 2B JSON and companion hash are immutable source evidence. Phase 2C did not rewrite their bytes.

## Sanitized differences

All section counts match except columns:

| Section | Expected | Observed | Sanitized result |
|---|---:|---:|---|
| schemas | 2 | 2 | two ACL-only changes |
| relations | 18 | 18 | 14 ACL-only changes |
| columns | 140 | 4 | 136 missing keys |
| constraints | 234 | 234 | no reported difference |
| indexes | 34 | 34 | no reported difference |
| functions | 48 | 48 | 41 ACL-only changes |
| triggers | 9 | 9 | no reported difference |
| sequences | 0 | 0 | no reported difference |
| policies/RLS | 11 | 11 | no reported difference |
| extensions | 2 | 2 | no reported difference |

Unexpected objects: **NONE**. Every reported changed field is `acl`; there are 57 ACL-only object changes. No owner, definition hash, RLS, policy, index, constraint, trigger, sequence or extension-version field mismatch is reported.

The 136 column keys are grouped as follows: `app_private.auth_sessions` 12, `identity_principals` 6, `tenant_context_keys` 6, `tenant_context_nonces` 4; `public.attendance_records` 12, `audit_logs` 9, `command_receipts` 8, `employees` 13, `leave_selections` 9, `organizations` 4, `outbox_events` 9, `payroll_adjustments` 10, `shifts` 10, `snapshot_imports` 5, `users` 5, `workspace_members` 8 and `workspaces` 6. The four observed columns are the only ledger relation columns visible to the dedicated reader.

## Root-cause classification

1. The 136 missing column keys are **F - COMPARATOR_IMPLEMENTATION_DEFECT**. PostgreSQL `information_schema.columns` exposes only columns the current role can access. The dedicated Production evidence role intentionally has SELECT only on `public.schema_migrations`, so the legacy query returned only its four columns. This is permission-filtered metadata, not proof that 136 Production columns are absent.
2. The 37 `public.pgcrypto` Function ACL differences are **D - EXTENSION_ENVIRONMENT_DIFFERENCE + G - EVIDENCE_INSUFFICIENT**. Repository evidence already distinguishes Neon-managed `pgcrypto` from Bankeban Functions, but Phase 2B intentionally omitted ACL values; the source therefore cannot prove exact semantic equivalence.
3. The remaining 20 ACL-only differences (two schemas, 14 relations and four Bankeban API Functions) are **C - OWNER_OR_ACL_PLACEHOLDER_MISMATCH + G - EVIDENCE_INSUFFICIENT**. The migration-only expected catalog and the post-migration Production runtime/read-only hardening use different operational ACL representations. Raw ACL text, including explicit-owner versus null ACL representations and environment role names, is not a stable semantic comparison.
4. No difference is classified as proven **A - TRUE_STRUCTURAL_DRIFT**. This does not assert that drift is absent; it means the existing sanitized evidence cannot prove it.

## Phase 1 / Phase 2A consistency and local reproduction

The shared structural section set, ordering, canonical JSON, null/boolean/array handling, owner/extension placeholders, Function/view definition hashing, volatile-field exclusions, PostgreSQL 18 boundary, policy/RLS and sequence normalization were audited side by side. The live comparator imports the same `STRUCTURAL_CATALOG_QUERIES`; however, the prior shared column query itself was unsuitable for a least-privilege reader, and raw ACL text is not a semantic operational-ACL model.

One same-database disposable PostgreSQL 18.4 rehearsal applied exactly `0001`-`0008`:

- Phase 1 path fingerprint: `885b29cd316ab781db613373979d31c92766bd3d0fcf7b062f8da33f451a596e`.
- Phase 2A normalization path fingerprint: `885b29cd316ab781db613373979d31c92766bd3d0fcf7b062f8da33f451a596e`.
- Canonical bytes: **identical**.
- Legacy reader `information_schema.columns`: 4 rows.
- Corrected reader `pg_catalog` column metadata: 140 rows.
- Reader missing/unexpected object count with corrected query: 0/0.
- Reader versus expected core catalog after excluding ACL: exact fingerprint match.
- Remaining local reader mismatch field: `acl` only.
- Disposable PostgreSQL/data/password cleanup: **PASS**, residual count 0.

The shared column collector now uses `pg_attribute`, `pg_class`, `pg_namespace`, `pg_type` and `pg_attrdef`, preserving the Phase 1 fingerprint while avoiding privilege-filtered false missing objects.

## Ledger interpretation and Gate result

Ledger PASS proves that the recorded `0001`-`0008` version/name/checksum/order metadata equals the tracked Migration files. It does not prove that catalog objects were never manually changed, that an earlier implementation produced identical objects, or that later operational ACL hardening equals migration-only ACL text.

`STRUCTURAL_STARTING_BASELINE` remains **BLOCKED**. The live sub-evidence changed from NOT_EVALUATED to MISMATCH/BLOCKED, but the mismatch is now known to contain a comparator defect and unresolved ACL semantics. The matrix remains **9 PASS / 13 non-PASS**. Production remains **70% / NOT READY**; Gate A **DEFER**; Provisioning and Migration Technical Readiness **NO-GO**; Migration authorization **NOT_GRANTED**.

## Decision boundary

Selected path: **D - mixed result**.

The next Repository-only action is to define and review an ACL semantic comparison contract that distinguishes owner-inherent privileges, explicit operational runtime/read-only grants, PUBLIC privileges, extension-managed ACLs and unknown principals without recording role names or raw ACLs. No new Production authorization is required for that Repository design. Only after the model and disposable tests pass may the Owner consider a separate, minimum one-time read-only authorization for corrected sanitized ACL facts and a new fingerprint. No repair or Migration is authorized.
