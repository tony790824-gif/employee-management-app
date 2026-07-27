# Authoritative current-user bootstrap

## Data authority

Migration `0012_current_user_bootstrap` adds nullable
`workspace_members.display_name`.

- Manager display names are Membership-scoped because one user may have
  different names or roles in different Workspaces.
- Employee names continue to use `employees.name`; the new field does not
  replace or duplicate employee authority.
- Non-null manager names must already be trimmed and contain 1–120 characters.
- Existing memberships remain valid with `NULL`.
- Auth0 nickname, email, account strings and metadata are not formal display
  name sources.

## Bootstrap contract

`GET /v1/bootstrap` preserves all existing top-level and `data` fields and
adds:

```json
{
  "currentUser": {
    "displayName": "string or null",
    "role": "boss or employee",
    "employeeId": "string or null",
    "workspaceId": "string"
  }
}
```

The server derives the normalized role from the live authorized Membership.
Employees use the active Workspace employee record. Managers use the active
Workspace Membership profile. A missing formal name returns `null`. Unknown
roles fail closed and never receive manager scope. The browser does not choose
the trusted user, role or Workspace.

## Security boundary

The runtime API role receives no direct table grant. The display name is
exposed only by the existing Session/Membership-authorized
`app_private.api_bootstrap(text,text,text)` function. The current Workspace and
user are taken from the verified tenant context, not a client-provided name.

## Rollback

The down migration restores the exact `0011` bootstrap function before dropping
`workspace_members.display_name`. Staging rollback requires the explicit,
process-local confirmation implemented by
`database/staging-current-user-bootstrap.mjs`.
