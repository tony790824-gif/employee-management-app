# Production Closure Phase 2K — Opaque GRANTEE Semantic Recomposition

## Boundary

- Sprint numbering remains capped at Sprint 65.
- Phase 2K used Repository files and immutable sanitized Evidence only.
- Phase 2K Production connections: **0**; Production mutations: **NONE**.
- The one-time Phase 2J authorization is **CONSUMED / NOT REUSABLE**.

## Evidence chain

| Source | SHA-256 | Validation |
| --- | --- | --- |
| Phase 2G live semantic Evidence | `bea7076ab4972fb3874a99be9fa3652a873bfdbe53fb74e4dc0e9606e3d37a02` | PASS |
| Phase 2I narrow default-ACL Evidence | `bef26fa7e8c53ed68a841b9c8de7627b8542927396bcbb4d77a4b430c3285f7c` | PASS |
| Phase 2J opaque GRANTEE Evidence | `b7cd457f82ae00ccfaf9fbbe1f35b3e0b2c2c19b0fffd08f52ebdf2169645e4c` | PASS |

Companion hashes, runtime contracts, strict schemas, source-hash chain, sanitization, execution boundary and Commit provenance are valid. No raw OID, principal name, URL, hostname or credential is present.

## Recomposition result

- Relation facts: **8**.
- Sequence facts: **3**.
- Total explicit GRANTEE facts: **11**, with no missing, extra or duplicate fact.
- All 11 preserve `grantOption=true`.
- Category: `OTHER_NAMED_PRINCIPAL`.
- Proof: `NAMED_ROLE_WITHOUT_REVIEWED_RELATION`.
- Category matches: **0**.
- Membership classification: `NONE`.
- PUBLIC facts: **0**.
- Ambiguity: **NONE**.

The identity is a named role but is not related to any reviewed category. The semantic policy therefore fails closed before comparing privileges. Privilege shape and grant option are not identity evidence.

## Decision

- `ACL_SEMANTIC`: **BLOCKED**.
- Confirmed privilege expansion: **NO**.
- Confirmed ACL drift: **NO**.
- `STRUCTURAL_NON_ACL`: **PASS**.
- `STRUCTURAL_STARTING_BASELINE`: **BLOCKED**.
- Independent `FRESH_LEDGER_AND_CHECKSUM`: **BLOCKED**.
- 22-Gate matrix: **9 PASS / 13 non-PASS → 9 PASS / 13 non-PASS**.
- Production Readiness: **70% / NOT READY**.
- Gate A: **DEFER**; Production Provisioning: **NO-GO**; Migration authorization: **NOT_GRANTED**.

## Local analyzer contract

`database/analyze-production-opaque-grantee-semantics.mjs` validates all three sources byte-for-byte and requires the exact 8/3/11 fact set. Only a non-ambiguous reviewed category may proceed to semantic comparison. `PUBLIC` additionally requires `PUBLIC_OID_ZERO`. `OTHER_NAMED_PRINCIPAL`, `UNCLASSIFIED`, ambiguous membership/proof, tampering, missing/extra/duplicate facts or sensitive fields remain BLOCKED.

## Next closure action

Do not reconnect or repair Production. First define, in Repository and Owner policy, whether an additional principal category can be reviewed without persisting a raw identity. Only after that review may the Owner consider a new, narrowly scoped, single-use read-only authorization. No authorization currently exists.
