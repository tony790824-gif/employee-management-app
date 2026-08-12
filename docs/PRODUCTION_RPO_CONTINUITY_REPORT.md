# Sprint 58 Production Data Continuity / RPO Evidence

Status: **REPOSITORY AND READ-ONLY EVIDENCE SCOPE COMPLETE / RPO NOT PROVEN / PRODUCTION RECOVERY NO-GO**

Date: 2026-08-12

## Formal measurement contract

`PITR capability` means the provider offers point-in-time restore. `Retention window` is only the age range from which a point may be requested. Neither proves the newest durable state that can actually be recovered.

`Reference Production Boundary` must be a trusted server-side timestamp or non-sensitive durable continuity marker representing the latest accepted Production state. `Latest Recoverable Boundary` must be the newest point the provider can actually recover and verify at the data layer. The measurement is:

`Recovery Gap = Reference Production Boundary - Latest Verified Recoverable Boundary`

RPO <=15 minutes may pass only when both boundaries share a trustworthy time basis, data continuity is verified, and the measured gap is between zero and 900 seconds. A UI default, requested restore timestamp, retention duration, Branch creation speed or PITR capability cannot substitute for either boundary.

## Read-only observation

The Neon Production project and Production Branch labels were confirmed through the authenticated console. `Restore from history` remains available with a six-hour history window. At observation time, the console showed an earliest boundary of `2026-08-12T06:39:00Z` and populated the point-in-time selector with `2026-08-12T12:39:00Z`.

The selector value is a requested timestamp, not proof that the provider's WAL/data stream is recoverable through that exact boundary. The console did not expose a latest verified recoverable boundary. The protected dedicated Production read-only credential was not present in this process, so no privileged credential was substituted and no current database reference timestamp or business-table aggregate was queried.

## Decision

- PITR capability: **PASS**.
- Retention observation: **6 hours**.
- Latest Recoverable Boundary: **UNKNOWN**.
- Reference Production Boundary: **UNKNOWN**.
- Measured Recovery Gap: **UNKNOWN**.
- RPO <=15 minutes: **NOT PROVEN**.
- RTO <=60 minutes: **PASS** from Sprint 57 at 112.335 seconds.

No form was submitted, no Preview/Restore was requested, no Production SQL was executed, and no resource, configuration, schema, data, Migration or deployment mutation occurred. Production remains 70% / NOT READY, Gate A DEFER and Provisioning NO-GO.
