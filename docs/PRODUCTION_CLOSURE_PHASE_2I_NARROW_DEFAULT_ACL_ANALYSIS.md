# Production Closure Phase 2I — Narrow Default ACL Evidence Analysis

## Boundary and integrity

- Sprint numbering remains capped at Sprint 65; no Sprint 66 was created.
- Phase 2I Production connections: **0**. Production mutations: **NONE**.
- The one-time Phase 2H narrow authorization is **CONSUMED / NOT REUSABLE**.
- Source Evidence SHA-256: `bef26fa7e8c53ed68a841b9c8de7627b8542927396bcbb4d77a4b430c3285f7c`.
- JSON, companion hash, expected hash, strict schema/runtime contract, sanitization, timestamp, model, semantic fingerprint and authorized Commit provenance: **PASS**.
- Authorized source Commit: `25dca558f4c76f217f3114950896bac0354d224f`.

## Primary outcome

**C — PRINCIPAL_CLASSIFICATION_STILL_BLOCKED**

The new Evidence resolves the old position ambiguity but does not establish a reviewed grantee category:

- `PUBLIC_SCHEMA|RELATION`: OWNER=`SYSTEM_PLATFORM_MANAGED`; GRANTEE=`OTHER_NAMED_PRINCIPAL`; GRANTOR=`SYSTEM_PLATFORM_MANAGED`.
- `PUBLIC_SCHEMA|SEQUENCE`: OWNER=`SYSTEM_PLATFORM_MANAGED`; GRANTEE=`OTHER_NAMED_PRINCIPAL`; GRANTOR=`SYSTEM_PLATFORM_MANAGED`.

The blocker is therefore exact and position-specific:

- `DEFAULT_ACL_OTHER_PRINCIPAL_REVIEW_REQUIRED:PUBLIC_SCHEMA|RELATION|GRANTEE`
- `DEFAULT_ACL_OTHER_PRINCIPAL_REVIEW_REQUIRED:PUBLIC_SCHEMA|SEQUENCE|GRANTEE`

No raw principal identity is present, so the `OTHER_NAMED_PRINCIPAL` grantee cannot be reclassified as an approved owner/runtime/reader/platform category from this Evidence alone.

## Sanitized default ACL facts

| State | Object type | Owner | Grantee | Grantor | Privileges | Grant option |
| --- | --- | --- | --- | --- | --- | --- |
| Explicit | Relation | SYSTEM_PLATFORM_MANAGED | OTHER_NAMED_PRINCIPAL | SYSTEM_PLATFORM_MANAGED | DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE | true |
| Explicit | Sequence | SYSTEM_PLATFORM_MANAGED | OTHER_NAMED_PRINCIPAL | SYSTEM_PLATFORM_MANAGED | SELECT, UPDATE, USAGE | true |
| Built-in | Relation | SYSTEM_PLATFORM_MANAGED | SYSTEM_PLATFORM_MANAGED | SYSTEM_PLATFORM_MANAGED | DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE | false |
| Built-in | Sequence | SYSTEM_PLATFORM_MANAGED | SYSTEM_PLATFORM_MANAGED | SYSTEM_PLATFORM_MANAGED | USAGE | false |

The model records 11 dangerous added facts for the still-unclassified grantee and 9 removed built-in facts. Because the grantee category remains unreviewed, these facts do not constitute a safely attributable semantic mismatch. The result remains **BLOCKED**, not `SEMANTIC_MISMATCH` and not `SEMANTIC_MATCH`.

## PUBLIC and prior blocker disposition

- `PUBLIC_SCHEMA` is the schema category only.
- PostgreSQL PUBLIC principal entries observed: **0**.
- The model did not infer PUBLIC from the schema name; PUBLIC still requires proven grantee OID 0.
- Phase 2G's object-level `public|r` and `public|S` ambiguity is narrowed to the GRANTEE position, but the principal classification is not resolved. The historical Evidence remains immutable.

## Gate result

- `STRUCTURAL_NON_ACL`: **PASS**.
- `ACL_SEMANTIC`: **BLOCKED**.
- `STRUCTURAL_STARTING_BASELINE`: **BLOCKED**.
- `FRESH_LEDGER_AND_CHECKSUM`: **BLOCKED** and independent of this starting-baseline Evidence.
- 22-Gate matrix: **9 PASS / 13 non-PASS → 9 PASS / 13 non-PASS**.
- Production Readiness: **70% / NOT READY**.

## Exact next Closure action

Do not rerun the narrow collector and do not request a new authorization solely because it returned exit code 2. First perform a Repository-only design/preflight for one safe OID-relation proof that can classify the currently `OTHER_NAMED_PRINCIPAL` grantee against reviewed principal categories without returning or persisting a raw name. Only after that contract and tests pass may the Owner decide whether to issue a new, separately scoped one-time read-only authorization.
