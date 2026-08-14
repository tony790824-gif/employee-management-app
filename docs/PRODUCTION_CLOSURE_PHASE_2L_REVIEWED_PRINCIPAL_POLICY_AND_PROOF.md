# Production Closure Phase 2L — Reviewed Principal Policy & Proof Design

## Boundary and decision

- Sprint numbering remains capped at Sprint 65.
- Repository/local analysis only; Production connections **0**, mutations **NONE**.
- Decision: **D — UNTRACKED_OR_UNKNOWN_PRINCIPAL**.
- No new reviewed category is approved. No existing category is proven for the Live GRANTEE.

## Forensic sources

The review covered Migrations `0001`–`0008`, operator provisioning/disable SQL, database role-grant scripts, ACL semantic/classification models, expected starting baseline, ADRs, Production operations/evidence/readiness documents, handoff/context/changelog and related tests.

Repository findings:

1. Migrations `0001`–`0008` contain no `public` relation/sequence `ALTER DEFAULT PRIVILEGES ... GRANT` statement and no `WITH GRANT OPTION`. Migration `0004` contains one unrelated hardening statement: revoke default PUBLIC Function execution in `app_private`.
2. `production-readonly-role.provision.sql` and `.disable.sql` revoke relation/sequence defaults from the dedicated read-only role. They do not grant the observed relation/sequence defaults to another named principal and contain no `WITH GRANT OPTION`.
3. The committed `0001`–`0008` ACL baseline contains zero default-privilege entries.
4. The immutable Live Evidence contains exactly 8 relation plus 3 sequence explicit facts, all grant-option true, for an unreviewed named GRANTEE.

No tracked Migration, provisioning contract, runtime hardening script or runbook creates these 11 grants. Their source is therefore **UNKNOWN**. A platform or manual origin remains possible but is not proven.

## Why 8 + 3 does not identify the principal

The privilege sets match PostgreSQL 18 owner-default shapes used by the Repository's `acldefault` model:

- relation: `DELETE`, `INSERT`, `MAINTAIN`, `REFERENCES`, `SELECT`, `TRIGGER`, `TRUNCATE`, `UPDATE`;
- sequence: `SELECT`, `UPDATE`, `USAGE`.

Owner-default privileges carry grant option. That shape explains the count, not who the explicit GRANTEE is or who created the default ACL. Privilege shape is forbidden as identity or origin proof.

## Expected principal universe

The approved universe remains:

- `EXPECTED_OWNER`
- `EXPECTED_READONLY_ROLE`
- `EXPECTED_RUNTIME_ROLE`
- `SYSTEM_PLATFORM_MANAGED`
- `EXTENSION_OWNER`
- `READONLY_MEMBERSHIP_CARRIER`
- `PUBLIC`

Candidates such as migrator, application, service, deployment or default-privilege-grantee roles have no independent version-controlled policy sufficient to approve a new category. They remain rejected candidates, not reviewed principals.

## Grant-option policy

Policy evaluates four questions separately: underlying privilege, explicit default privilege, grant option and delegation.

- PostgreSQL built-in owner defaults may include owner privileges and grant option.
- The committed Bankeban starting baseline contains no explicit default privileges.
- An explicit default privilege is not approved merely because the underlying privilege would be valid for an owner or runtime role.
- No existing Bankeban policy authorizes these 11 explicit grants or their delegation capability.
- If a future deterministic proof classifies the GRANTEE into a reviewed category, the explicit facts must still be compared with the empty baseline. They are not automatically ignored for owner/platform/runtime categories.

Current outcome remains BLOCKED because the principal classification is unproven. It is not yet a proven policy violation, privilege expansion or ACL drift.

## Reviewed principal proof contract

No new category is introduced. A future proof may attempt the existing `EXPECTED_OWNER` category only through catalog relationships, never a name or persisted OID. The minimum safe output is:

- `principal_position=GRANTEE`
- `reviewed_category=EXPECTED_OWNER` or fail-closed category
- `proof_enum=EXACT_APPLICATION_OBJECT_OWNER_RELATION`
- `proof_boolean`
- `ambiguity`
- `membership_classification`
- `privilege`
- `grant_option`
- `acl_state`

The transient database-side proof would have to establish that the GRANTEE equals the single owner OID of the exact reviewed `0001`–`0008` application object set, that ownership is complete, and that no second reviewed relation matches. Only safe booleans/enums may cross the connection boundary.

Threat-model behavior:

- unrelated or arbitrary named role: BLOCKED;
- same-name drop/recreate: BLOCKED because it does not own the existing reviewed object set;
- rename with unchanged ownership relation: classification remains stable;
- multiple owner/reviewed relations: BLOCKED as ambiguous;
- unrelated membership: BLOCKED;
- PUBLIC: only GRANTEE OID zero;
- unauthorized explicit default privilege or grant option after identity proof: semantic mismatch;
- missing/extra/duplicate fact or sensitive field: BLOCKED.

## Evidence sufficiency and gates

Existing immutable Evidence does not contain the exact application-object-owner relationship. It is insufficient to classify the Live principal.

- `STRUCTURAL_NON_ACL=PASS`
- `ACL_SEMANTIC=BLOCKED`
- `STRUCTURAL_STARTING_BASELINE=BLOCKED`
- `FRESH_LEDGER_AND_CHECKSUM=BLOCKED` independently
- 22-Gate remains **9 PASS / 13 non-PASS**
- Production remains **70% / NOT READY**
- Gate A `DEFER`; Provisioning `NO_GO`; Migration authorization `NOT_GRANTED`

## Next closure action

Do not reconnect or change Production. The Owner may next review whether the proposed existing-category `EXACT_APPLICATION_OBJECT_OWNER_RELATION` proof is acceptable. Only after approval and a separate Repository preflight may a new minimal single-use read-only authorization be considered.
