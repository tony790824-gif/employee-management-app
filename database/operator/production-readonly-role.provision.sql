\set ON_ERROR_STOP on

-- MANUAL OPERATOR SCRIPT ONLY. This file is not a Migration and is never executed by tests.
-- Run with psql as the reviewed Production object owner only after separate approval.
-- Create the login role and its random password in Neon first. Never pass a password to this file.
-- Required psql variables:
--   confirmation=PROVISION_BANKE_PRODUCTION_READONLY
--   readonly_role=<existing login role>
--   object_owner=<role that creates Bankeban tables/functions>
--   runtime_role=<existing Bankeban Production API login role>

\if :{?confirmation}
\else
  \echo 'Missing confirmation; no change was attempted.'
  \quit
\endif
\if :{?readonly_role}
\else
  \echo 'Missing readonly_role; no change was attempted.'
  \quit
\endif
\if :{?object_owner}
\else
  \echo 'Missing object_owner; no change was attempted.'
  \quit
\endif
\if :{?runtime_role}
\else
  \echo 'Missing runtime_role; no change was attempted.'
  \quit
\endif

SELECT :'confirmation' = 'PROVISION_BANKE_PRODUCTION_READONLY' AS confirmed \gset
\if :confirmed
\else
  \echo 'Invalid confirmation; no change was attempted.'
  \quit
\endif

SELECT EXISTS (
  SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = :'readonly_role' AND rolcanlogin
) AS readonly_role_exists \gset
\if :readonly_role_exists
\else
  \echo 'The login role must already exist in Neon; no change was attempted.'
  \quit
\endif

-- PostgreSQL does not permit a non-superuser to change the SUPERUSER attribute,
-- even when the requested value is NOSUPERUSER. Neon intentionally provides no
-- true PostgreSQL superuser. Prove every dangerous attribute is already false
-- and fail closed instead of attempting to mutate those attributes.
SELECT NOT (
         role.rolsuper
      OR role.rolcreatedb
      OR role.rolcreaterole
      OR role.rolreplication
      OR role.rolbypassrls
       ) AS dangerous_attributes_are_false
  FROM pg_catalog.pg_roles AS role
 WHERE role.rolname = :'readonly_role'
\gset
\if :dangerous_attributes_are_false
\else
  \echo 'The read-only role has a dangerous attribute; no privilege change was attempted.'
  \quit
\endif

-- PostgreSQL 18 requires a non-superuser CREATEROLE operator to hold ADMIN
-- OPTION on the non-superuser, non-replication target role before ALTER ROLE.
SELECT EXISTS (
  SELECT 1
    FROM pg_catalog.pg_auth_members AS membership
   WHERE membership.roleid = (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = :'readonly_role')
     AND membership.member = (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = session_user)
     AND membership.admin_option
) AS operator_has_admin_option \gset
\if :operator_has_admin_option
\else
  \echo 'The current operator lacks ADMIN OPTION on the read-only role; no privilege change was attempted.'
  \quit
\endif

SELECT NOT EXISTS (
  SELECT 1 FROM pg_catalog.pg_auth_members AS membership
   WHERE membership.member = (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = :'readonly_role')
) AS has_no_memberships \gset
\if :has_no_memberships
\else
  \echo 'The read-only role inherits another role; review and remove membership before provisioning.'
  \quit
\endif

SELECT NOT EXISTS (
  SELECT 1 FROM pg_catalog.pg_database WHERE datdba = (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = :'readonly_role')
  UNION ALL
  SELECT 1 FROM pg_catalog.pg_namespace WHERE nspowner = (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = :'readonly_role')
  UNION ALL
  SELECT 1 FROM pg_catalog.pg_class WHERE relowner = (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = :'readonly_role')
) AS owns_no_objects \gset
\if :owns_no_objects
\else
  \echo 'The read-only role owns database objects; no privilege change was attempted.'
  \quit
\endif

-- PostgreSQL grants EXECUTE on newly-created functions to PUBLIC by default.
-- A direct REVOKE from readonly_role cannot override that additive PUBLIC
-- privilege. Before removing PUBLIC EXECUTE, prove the existing Production API
-- role already has explicit grants on exactly the four 0001-0008 entry points.
SELECT EXISTS (
  SELECT 1
    FROM pg_catalog.pg_roles AS role
   WHERE role.rolname = :'runtime_role'
     AND role.rolcanlogin
     AND NOT role.rolsuper
     AND NOT role.rolcreatedb
     AND NOT role.rolcreaterole
     AND NOT role.rolreplication
     AND NOT role.rolbypassrls
) AS runtime_role_is_safe \gset
\if :runtime_role_is_safe
\else
  \echo 'The Production runtime role is missing or unsafe; no privilege change was attempted.'
  \quit
\endif

SELECT :'runtime_role' = 'banke_api_production'
       AND EXISTS (
         SELECT 1
           FROM pg_catalog.pg_roles AS role
          WHERE role.rolname = :'object_owner'
            AND role.rolname = current_user
       ) AS approved_roles_are_exact
\gset
\if :approved_roles_are_exact
\else
  \echo 'The runtime or object-owner identity is not the approved Production identity; no change was attempted.'
  \quit
\endif

SELECT NOT EXISTS (
  SELECT 1 FROM pg_catalog.pg_auth_members AS membership
   WHERE membership.member = (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = :'runtime_role')
  UNION ALL
  SELECT 1 FROM pg_catalog.pg_namespace WHERE nspowner = (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = :'runtime_role')
  UNION ALL
  SELECT 1 FROM pg_catalog.pg_class WHERE relowner = (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = :'runtime_role')
  UNION ALL
  SELECT 1 FROM pg_catalog.pg_proc WHERE proowner = (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = :'runtime_role')
) AS runtime_role_has_no_membership_or_ownership \gset
\if :runtime_role_has_no_membership_or_ownership
\else
  \echo 'The Production runtime role inherits or owns objects; no privilege change was attempted.'
  \quit
\endif

WITH approved(signature) AS (
  VALUES
    ('app_private.api_establish_session(text,text,text)'),
    ('app_private.api_logout_session(text,text,text)'),
    ('app_private.api_list_employees(text,text,text)'),
    ('app_private.api_execute_command(text,text,text,text,jsonb,text,text,text)')
), resolved AS (
  SELECT signature, pg_catalog.to_regprocedure(signature) AS procedure_oid
    FROM approved
)
SELECT count(*) = 4
       AND bool_and(procedure_oid IS NOT NULL)
       AND bool_and(EXISTS (
         SELECT 1
           FROM pg_catalog.aclexplode(COALESCE(
                  (SELECT procedure.proacl FROM pg_catalog.pg_proc AS procedure WHERE procedure.oid = resolved.procedure_oid),
                  pg_catalog.acldefault('f', (SELECT procedure.proowner FROM pg_catalog.pg_proc AS procedure WHERE procedure.oid = resolved.procedure_oid))
                )) AS acl
          WHERE acl.grantee = (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = :'runtime_role')
            AND acl.privilege_type = 'EXECUTE'
       )) AS runtime_has_explicit_allowlist
  FROM resolved
\gset
\if :runtime_has_explicit_allowlist
\else
  \echo 'The Production runtime role lacks an explicit approved Function grant; PUBLIC EXECUTE was not changed.'
  \quit
\endif

WITH approved(procedure_oid) AS (
  VALUES
    (pg_catalog.to_regprocedure('app_private.api_establish_session(text,text,text)')),
    (pg_catalog.to_regprocedure('app_private.api_logout_session(text,text,text)')),
    (pg_catalog.to_regprocedure('app_private.api_list_employees(text,text,text)')),
    (pg_catalog.to_regprocedure('app_private.api_execute_command(text,text,text,text,jsonb,text,text,text)'))
)
SELECT NOT EXISTS (
  SELECT 1
    FROM pg_catalog.pg_proc AS procedure
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
    CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(
      procedure.proacl,
      pg_catalog.acldefault('f', procedure.proowner)
    )) AS acl
   WHERE namespace.nspname IN ('public', 'app_private')
     AND acl.grantee = (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = :'runtime_role')
     AND acl.privilege_type = 'EXECUTE'
     AND procedure.oid NOT IN (SELECT procedure_oid FROM approved)
) AS runtime_has_no_unapproved_function_grant
\gset
\if :runtime_has_no_unapproved_function_grant
\else
  \echo 'The Production runtime role has an unapproved direct Function grant; PUBLIC EXECUTE was not changed.'
  \quit
\endif

-- Only a Function owner can reliably revoke the owner's PUBLIC grant. If any
-- currently PUBLIC-executable Function is owned elsewhere, the operator needs
-- separate review/authority; do not partially harden the schemas.
SELECT NOT EXISTS (
  SELECT 1
    FROM pg_catalog.pg_proc AS procedure
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
   WHERE namespace.nspname IN ('public', 'app_private')
     AND pg_catalog.has_function_privilege('public', procedure.oid, 'EXECUTE')
     AND procedure.proowner <> (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = :'object_owner')
) AS public_functions_are_owned_by_object_owner
\gset
\if :public_functions_are_owned_by_object_owner
\else
  \echo 'A PUBLIC-executable Function has a different owner; PUBLIC EXECUTE was not changed. Run production-function-owner.diagnostic.sql read-only and stop.'
  \quit
\endif

-- Dangerous attributes were already proved false above. Do not repeat
-- NOSUPERUSER/NOREPLICATION/NOBYPASSRLS mutations that Neon cannot authorize.
BEGIN;

ALTER ROLE :"readonly_role" NOINHERIT CONNECTION LIMIT 3;
ALTER ROLE :"readonly_role" SET default_transaction_read_only = on;
ALTER ROLE :"readonly_role" SET statement_timeout = '10s';
ALTER ROLE :"readonly_role" SET lock_timeout = '2s';
ALTER ROLE :"readonly_role" SET idle_in_transaction_session_timeout = '10s';

REVOKE ALL PRIVILEGES ON DATABASE neondb FROM :"readonly_role";
GRANT CONNECT ON DATABASE neondb TO :"readonly_role";

REVOKE ALL PRIVILEGES ON SCHEMA public, app_private FROM :"readonly_role";
GRANT USAGE ON SCHEMA public, app_private TO :"readonly_role";

REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public, app_private FROM :"readonly_role";
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public, app_private FROM :"readonly_role";
REVOKE ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public, app_private FROM :"readonly_role";
GRANT SELECT ON TABLE public.schema_migrations TO :"readonly_role";

-- The object owner retains its inherent owner privileges. The Production API
-- role retains only the explicit allowlist proved above.
SELECT pg_catalog.format(
         'REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC',
         procedure.oid::pg_catalog.regprocedure
       )
  FROM pg_catalog.pg_proc AS procedure
  JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
 WHERE namespace.nspname IN ('public', 'app_private')
   AND pg_catalog.has_function_privilege('public', procedure.oid, 'EXECUTE')
 ORDER BY procedure.oid::pg_catalog.regprocedure::text
\gexec

ALTER DEFAULT PRIVILEGES FOR ROLE :"object_owner" IN SCHEMA public
  REVOKE ALL PRIVILEGES ON TABLES FROM :"readonly_role";
ALTER DEFAULT PRIVILEGES FOR ROLE :"object_owner" IN SCHEMA app_private
  REVOKE ALL PRIVILEGES ON TABLES FROM :"readonly_role";
ALTER DEFAULT PRIVILEGES FOR ROLE :"object_owner" IN SCHEMA public
  REVOKE ALL PRIVILEGES ON SEQUENCES FROM :"readonly_role";
ALTER DEFAULT PRIVILEGES FOR ROLE :"object_owner" IN SCHEMA app_private
  REVOKE ALL PRIVILEGES ON SEQUENCES FROM :"readonly_role";
ALTER DEFAULT PRIVILEGES FOR ROLE :"object_owner" IN SCHEMA public
  REVOKE ALL PRIVILEGES ON FUNCTIONS FROM :"readonly_role";
ALTER DEFAULT PRIVILEGES FOR ROLE :"object_owner" IN SCHEMA app_private
  REVOKE ALL PRIVILEGES ON FUNCTIONS FROM :"readonly_role";

-- Function default privileges are global for the creating role. A per-schema
-- REVOKE cannot override the global PUBLIC default.
ALTER DEFAULT PRIVILEGES FOR ROLE :"object_owner"
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

SELECT NOT EXISTS (
  SELECT 1
    FROM pg_catalog.pg_proc AS procedure
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
   WHERE namespace.nspname IN ('public', 'app_private')
     AND (
       pg_catalog.has_function_privilege(:'readonly_role', procedure.oid, 'EXECUTE')
       OR pg_catalog.has_function_privilege('public', procedure.oid, 'EXECUTE')
     )
) AS readonly_function_execute_is_zero \gset
\if :readonly_function_execute_is_zero
\else
  \echo 'Read-only Function EXECUTE postcondition failed; rolling back all provisioning changes.'
  ROLLBACK;
  \quit
\endif

WITH approved(procedure_oid) AS (
  VALUES
    (pg_catalog.to_regprocedure('app_private.api_establish_session(text,text,text)')),
    (pg_catalog.to_regprocedure('app_private.api_logout_session(text,text,text)')),
    (pg_catalog.to_regprocedure('app_private.api_list_employees(text,text,text)')),
    (pg_catalog.to_regprocedure('app_private.api_execute_command(text,text,text,text,jsonb,text,text,text)'))
)
SELECT count(*) FILTER (
         WHERE pg_catalog.has_function_privilege(:'runtime_role', procedure.oid, 'EXECUTE')
       ) = 4
       AND count(*) FILTER (
         WHERE pg_catalog.has_function_privilege(:'runtime_role', procedure.oid, 'EXECUTE')
           AND procedure.oid NOT IN (SELECT procedure_oid FROM approved)
       ) = 0 AS runtime_function_allowlist_preserved
  FROM pg_catalog.pg_proc AS procedure
  JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
 WHERE namespace.nspname IN ('public', 'app_private')
\gset
\if :runtime_function_allowlist_preserved
\else
  \echo 'Production runtime Function allowlist postcondition failed; rolling back all provisioning changes.'
  ROLLBACK;
  \quit
\endif

COMMIT;

\echo 'Provisioning statements completed. Disconnect the owner and verify with the read-only credential.'
