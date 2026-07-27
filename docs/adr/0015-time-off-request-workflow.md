# ADR 0015: Separate scheduled leave and ad-hoc leave requests

- Status: Accepted for Staging data/command phase
- Date: 2026-07-27
- Production status: Not applied

## Context

The legacy `leave_selections` table represents only final monthly leave dates. It cannot safely represent a pending or rejected request, a reviewer decision, an ad-hoc leave reason, or the privacy boundary between an applicant, a manager, and coworkers. Reusing it for both scheduled leave and ad-hoc leave would make unapproved requests affect scheduling and payroll and would expose private reasons.

## Decision

Use one request workflow with two explicit kinds:

- `schedule_leave`: fixed monthly scheduled leave, subject to the existing eight-day monthly quota.
- `ad_hoc_leave`: a single-day or date-range leave request that does not consume the scheduled-leave quota.

The request header lives in `time_off_requests`; normalized request dates live in `time_off_request_dates`. Requests progress through `pending`, `approved`, `rejected`, `cancelled`, or `superseded`. Only a manager approval of `schedule_leave` updates the authoritative legacy `leave_selections` dates for the employee and month. An approved ad-hoc leave does not change the eight-day quota or the legacy scheduling/payroll inputs.

All mutations stay behind the existing authenticated `/v1/commands/{commandName}` boundary, Session/Membership checks, idempotency receipts, audit log, outbox, and controlled PostgreSQL functions. The runtime API role receives no direct table privilege.

## Authorization and visibility

- Employees may submit and cancel only their own pending requests.
- Boss/manager roles may approve or reject pending requests in their Workspace.
- A coworker may see only an approved scheduled-leave employee name and date.
- Approved ad-hoc coverage exposes only the minimum date/count indicator; the applicant's reason remains private.
- Pending, rejected, cancelled, and cross-Workspace requests fail closed.

## Legacy compatibility

Existing `leave_selections` rows are not reclassified or migrated. They remain authoritative final leave data until a new scheduled-leave request is explicitly approved. This avoids guessing whether historical rows were scheduled leave or ad-hoc leave.

## Consequences

- Migration `0013_time_off_requests` is additive and nullable-safe for legacy data.
- Phase 1 provides the formal schema, controlled read/command API, role grants, rollback, and Staging E2E evidence.
- Phase 2 must add the employee and manager UI. Until that phase is accepted, the product must not claim that the new approval workflow is available to end users.
- Production remains unchanged.
