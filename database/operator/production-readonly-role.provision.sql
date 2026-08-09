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

-- Application-managed routines are an exact reviewed set. Every one must
-- exist, remain owned by the approved object owner, and have no PUBLIC grant.
-- Extension members are classified separately through pg_depend/pg_extension;
-- they are never mutated by this script.
WITH expected(signature) AS (
  VALUES
    ('app_private.current_workspace_id()'),
    ('app_private.current_user_id()'),
    ('app_private.current_role()'),
    ('app_private.touch_updated_at()'),
    ('app_private.base64url_decode(text)'),
    ('app_private.raise_auth_error(text)'),
    ('app_private.verify_tenant_context(text,text,text,text,boolean)'),
    ('app_private.api_establish_session(text,text,text)'),
    ('app_private.api_logout_session(text,text,text)'),
    ('app_private.api_list_employees(text,text,text)'),
    ('app_private.api_execute_command(text,text,text,text,jsonb,text,text,text)')
), resolved AS (
  SELECT signature, pg_catalog.to_regprocedure(signature) AS procedure_oid
    FROM expected
)
SELECT count(*) = 11
       AND bool_and(procedure_oid IS NOT NULL)
       AND bool_and(
         procedure_oid IS NOT NULL
         AND (SELECT procedure.proowner = (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = :'object_owner')
                FROM pg_catalog.pg_proc AS procedure
               WHERE procedure.oid = resolved.procedure_oid)
       ) AS application_functions_match_reviewed_owner
  FROM resolved
\gset
\if :application_functions_match_reviewed_owner
\else
  \echo 'A reviewed Bankeban Function is missing or has a different owner; no privilege change was attempted.'
  \quit
\endif

WITH expected(procedure_oid) AS (
  VALUES
    (pg_catalog.to_regprocedure('app_private.current_workspace_id()')),
    (pg_catalog.to_regprocedure('app_private.current_user_id()')),
    (pg_catalog.to_regprocedure('app_private.current_role()')),
    (pg_catalog.to_regprocedure('app_private.touch_updated_at()')),
    (pg_catalog.to_regprocedure('app_private.base64url_decode(text)')),
    (pg_catalog.to_regprocedure('app_private.raise_auth_error(text)')),
    (pg_catalog.to_regprocedure('app_private.verify_tenant_context(text,text,text,text,boolean)')),
    (pg_catalog.to_regprocedure('app_private.api_establish_session(text,text,text)')),
    (pg_catalog.to_regprocedure('app_private.api_logout_session(text,text,text)')),
    (pg_catalog.to_regprocedure('app_private.api_list_employees(text,text,text)')),
    (pg_catalog.to_regprocedure('app_private.api_execute_command(text,text,text,text,jsonb,text,text,text)'))
), classified AS (
  SELECT procedure.oid,
         namespace.nspname AS schema_name,
         pg_catalog.pg_get_userbyid(procedure.proowner) AS owner_name,
         extension.extname AS extension_name
    FROM pg_catalog.pg_proc AS procedure
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
    LEFT JOIN pg_catalog.pg_depend AS dependency
      ON dependency.classid = 'pg_catalog.pg_proc'::pg_catalog.regclass
     AND dependency.objid = procedure.oid
     AND dependency.deptype = 'e'
    LEFT JOIN pg_catalog.pg_extension AS extension ON extension.oid = dependency.refobjid
   WHERE namespace.nspname IN ('public', 'app_private')
)
SELECT NOT EXISTS (
         SELECT 1 FROM classified
          WHERE extension_name IS NULL
            AND oid NOT IN (SELECT procedure_oid FROM expected)
       ) AS no_unreviewed_application_function,
       EXISTS (
         SELECT 1 FROM classified
          WHERE schema_name = 'public'
            AND extension_name = 'pgcrypto'
            AND owner_name = 'cloud_admin'
       )
       AND NOT EXISTS (
         SELECT 1 FROM classified
          WHERE extension_name IS NOT NULL
            AND NOT (
              schema_name = 'public'
              AND extension_name = 'pgcrypto'
              AND owner_name = 'cloud_admin'
            )
       ) AS extension_functions_match_reviewed_platform_set
\gset
\if :no_unreviewed_application_function
\else
  \echo 'An unreviewed non-extension Function exists; no privilege change was attempted.'
  \quit
\endif
\if :extension_functions_match_reviewed_platform_set
\else
  \echo 'The extension-managed Function set differs from the reviewed public.pgcrypto/cloud_admin set; no privilege change was attempted.'
  \quit
\endif

SELECT count(*)::integer AS extension_function_count_before,
       count(*) FILTER (WHERE pg_catalog.has_function_privilege('public', procedure.oid, 'EXECUTE'))::integer AS extension_public_execute_count_before,
       count(*) FILTER (WHERE pg_catalog.has_function_privilege(:'readonly_role', procedure.oid, 'EXECUTE'))::integer AS extension_readonly_execute_count_before,
       count(*) FILTER (WHERE pg_catalog.has_function_privilege(:'runtime_role', procedure.oid, 'EXECUTE'))::integer AS extension_runtime_execute_count_before
  FROM pg_catalog.pg_proc AS procedure
  JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
  JOIN pg_catalog.pg_depend AS dependency
    ON dependency.classid = 'pg_catalog.pg_proc'::pg_catalog.regclass
   AND dependency.objid = procedure.oid
   AND dependency.deptype = 'e'
  JOIN pg_catalog.pg_extension AS extension ON extension.oid = dependency.refobjid
 WHERE namespace.nspname = 'public'
   AND extension.extname = 'pgcrypto'
   AND pg_catalog.pg_get_userbyid(procedure.proowner) = 'cloud_admin'
\gset

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
GRANT SELECT ON TABLE public.schema_migrations TO :"readonly_role";

-- Revoke only the exact application-managed Function set. Never mutate a
-- pgcrypto/cloud_admin Extension member or its platform-managed ACL.
WITH application(signature) AS (
  VALUES
    ('app_private.current_workspace_id()'),
    ('app_private.current_user_id()'),
    ('app_private.current_role()'),
    ('app_private.touch_updated_at()'),
    ('app_private.base64url_decode(text)'),
    ('app_private.raise_auth_error(text)'),
    ('app_private.verify_tenant_context(text,text,text,text,boolean)'),
    ('app_private.api_establish_session(text,text,text)'),
    ('app_private.api_logout_session(text,text,text)'),
    ('app_private.api_list_employees(text,text,text)'),
    ('app_private.api_execute_command(text,text,text,text,jsonb,text,text,text)')
)
SELECT pg_catalog.format(
         'REVOKE ALL PRIVILEGES ON FUNCTION %s FROM %I',
         pg_catalog.to_regprocedure(signature),
         :'readonly_role'
       )
  FROM application
 ORDER BY signature
\gexec

-- The object owner retains its inherent owner privileges. The Production API
-- role retains only the explicit application allowlist proved above.
WITH application(signature) AS (
  VALUES
    ('app_private.current_workspace_id()'),
    ('app_private.current_user_id()'),
    ('app_private.current_role()'),
    ('app_private.touch_updated_at()'),
    ('app_private.base64url_decode(text)'),
    ('app_private.raise_auth_error(text)'),
    ('app_private.verify_tenant_context(text,text,text,text,boolean)'),
    ('app_private.api_establish_session(text,text,text)'),
    ('app_private.api_logout_session(text,text,text)'),
    ('app_private.api_list_employees(text,text,text)'),
    ('app_private.api_execute_command(text,text,text,text,jsonb,text,text,text)')
)
SELECT pg_catalog.format(
         'REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC',
         pg_catalog.to_regprocedure(signature)
       )
  FROM application
 WHERE pg_catalog.has_function_privilege('public', pg_catalog.to_regprocedure(signature), 'EXECUTE')
 ORDER BY signature
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

WITH application(procedure_oid) AS (
  VALUES
    (pg_catalog.to_regprocedure('app_private.current_workspace_id()')),
    (pg_catalog.to_regprocedure('app_private.current_user_id()')),
    (pg_catalog.to_regprocedure('app_private.current_role()')),
    (pg_catalog.to_regprocedure('app_private.touch_updated_at()')),
    (pg_catalog.to_regprocedure('app_private.base64url_decode(text)')),
    (pg_catalog.to_regprocedure('app_private.raise_auth_error(text)')),
    (pg_catalog.to_regprocedure('app_private.verify_tenant_context(text,text,text,text,boolean)')),
    (pg_catalog.to_regprocedure('app_private.api_establish_session(text,text,text)')),
    (pg_catalog.to_regprocedure('app_private.api_logout_session(text,text,text)')),
    (pg_catalog.to_regprocedure('app_private.api_list_employees(text,text,text)')),
    (pg_catalog.to_regprocedure('app_private.api_execute_command(text,text,text,text,jsonb,text,text,text)'))
)
SELECT NOT EXISTS (
         SELECT 1 FROM application
          WHERE pg_catalog.has_function_privilege(:'readonly_role', procedure_oid, 'EXECUTE')
             OR pg_catalog.has_function_privilege('public', procedure_oid, 'EXECUTE')
       ) AS application_function_acl_is_safe
\gset
\if :application_function_acl_is_safe
\else
  \echo 'Bankeban application Function ACL postcondition failed; rolling back all provisioning changes.'
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
         WHERE pg_catalog.has_function_privilege(:'runtime_role', application.procedure_oid, 'EXECUTE')
       ) = 4
       AND count(*) FILTER (
         WHERE pg_catalog.has_function_privilege(:'runtime_role', application.procedure_oid, 'EXECUTE')
           AND application.procedure_oid NOT IN (SELECT procedure_oid FROM approved)
       ) = 0 AS runtime_function_allowlist_preserved
  FROM (
    VALUES
      (pg_catalog.to_regprocedure('app_private.current_workspace_id()')),
      (pg_catalog.to_regprocedure('app_private.current_user_id()')),
      (pg_catalog.to_regprocedure('app_private.current_role()')),
      (pg_catalog.to_regprocedure('app_private.touch_updated_at()')),
      (pg_catalog.to_regprocedure('app_private.base64url_decode(text)')),
      (pg_catalog.to_regprocedure('app_private.raise_auth_error(text)')),
      (pg_catalog.to_regprocedure('app_private.verify_tenant_context(text,text,text,text,boolean)')),
      (pg_catalog.to_regprocedure('app_private.api_establish_session(text,text,text)')),
      (pg_catalog.to_regprocedure('app_private.api_logout_session(text,text,text)')),
      (pg_catalog.to_regprocedure('app_private.api_list_employees(text,text,text)')),
      (pg_catalog.to_regprocedure('app_private.api_execute_command(text,text,text,text,jsonb,text,text,text)'))
  ) AS application(procedure_oid)
\gset
\if :runtime_function_allowlist_preserved
\else
  \echo 'Production runtime Function allowlist postcondition failed; rolling back all provisioning changes.'
  ROLLBACK;
  \quit
\endif

SELECT count(*)::integer = :extension_function_count_before
       AND count(*) FILTER (WHERE pg_catalog.has_function_privilege('public', procedure.oid, 'EXECUTE'))::integer = :extension_public_execute_count_before
       AND count(*) FILTER (WHERE pg_catalog.has_function_privilege(:'readonly_role', procedure.oid, 'EXECUTE'))::integer = :extension_readonly_execute_count_before
       AND count(*) FILTER (WHERE pg_catalog.has_function_privilege(:'runtime_role', procedure.oid, 'EXECUTE'))::integer = :extension_runtime_execute_count_before
       AS extension_acl_unchanged
  FROM pg_catalog.pg_proc AS procedure
  JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
  JOIN pg_catalog.pg_depend AS dependency
    ON dependency.classid = 'pg_catalog.pg_proc'::pg_catalog.regclass
   AND dependency.objid = procedure.oid
   AND dependency.deptype = 'e'
  JOIN pg_catalog.pg_extension AS extension ON extension.oid = dependency.refobjid
 WHERE namespace.nspname = 'public'
   AND extension.extname = 'pgcrypto'
   AND pg_catalog.pg_get_userbyid(procedure.proowner) = 'cloud_admin'
\gset
\if :extension_acl_unchanged
\else
  \echo 'Platform pgcrypto Function ACL changed unexpectedly; rolling back all provisioning changes.'
  ROLLBACK;
  \quit
\endif

COMMIT;

\echo 'Provisioning statements completed. Disconnect the owner and verify with the read-only credential.'
