\set ON_ERROR_STOP on

-- MANUAL READ-ONLY DIAGNOSTIC ONLY. This file is not a Migration.
-- It reads pg_catalog metadata and never reads business rows or Function bodies.
-- Required psql variables:
--   confirmation=DIAGNOSE_BANKE_PRODUCTION_FUNCTION_OWNER
--   readonly_role=banke_production_readonly
--   object_owner=neondb_owner
--   runtime_role=banke_api_production

\if :{?confirmation}
\else
  \echo 'Missing confirmation; no query was attempted.'
  \quit
\endif
\if :{?readonly_role}
\else
  \echo 'Missing readonly_role; no query was attempted.'
  \quit
\endif
\if :{?object_owner}
\else
  \echo 'Missing object_owner; no query was attempted.'
  \quit
\endif
\if :{?runtime_role}
\else
  \echo 'Missing runtime_role; no query was attempted.'
  \quit
\endif

SELECT :'confirmation' = 'DIAGNOSE_BANKE_PRODUCTION_FUNCTION_OWNER' AS confirmation_ok,
       current_database() = 'neondb' AS database_ok,
       current_user = :'readonly_role' AS current_user_ok,
       session_user = :'readonly_role' AS session_user_ok,
       :'readonly_role' = 'banke_production_readonly' AS readonly_role_name_ok,
       :'object_owner' = 'neondb_owner' AS object_owner_name_ok,
       :'runtime_role' = 'banke_api_production' AS runtime_role_name_ok,
       EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = :'readonly_role') AS readonly_role_exists,
       EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = :'object_owner') AS object_owner_exists,
       EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = :'runtime_role') AS runtime_role_exists
\gset
\if :confirmation_ok
\else
  \echo 'Confirmation mismatch; no metadata was returned.'
  \quit
\endif
\if :database_ok
\else
  \echo 'Target database mismatch; no metadata was returned.'
  \quit
\endif
\if :current_user_ok
\else
  \echo 'current_user is not the approved read-only role; no metadata was returned.'
  \quit
\endif
\if :session_user_ok
\else
  \echo 'session_user is not the approved read-only login role; no metadata was returned.'
  \quit
\endif
\if :readonly_role_name_ok
\else
  \echo 'readonly_role name mismatch; no metadata was returned.'
  \quit
\endif
\if :object_owner_name_ok
\else
  \echo 'object_owner name mismatch; no metadata was returned.'
  \quit
\endif
\if :runtime_role_name_ok
\else
  \echo 'runtime_role name mismatch; no metadata was returned.'
  \quit
\endif
\if :readonly_role_exists
\else
  \echo 'readonly_role does not exist; no metadata was returned.'
  \quit
\endif
\if :object_owner_exists
\else
  \echo 'object_owner does not exist; no metadata was returned.'
  \quit
\endif
\if :runtime_role_exists
\else
  \echo 'runtime_role does not exist; no metadata was returned.'
  \quit
\endif

SET default_transaction_read_only = on;
SET statement_timeout = '10s';
BEGIN TRANSACTION READ ONLY;

SELECT current_database() AS database_name,
       current_user AS diagnostic_role,
       current_setting('transaction_read_only') AS transaction_read_only;

WITH expected(signature, expected_source, runtime_entrypoint) AS (
  VALUES
    ('app_private.current_workspace_id()', '0001_core', false),
    ('app_private.current_user_id()', '0001_core', false),
    ('app_private.current_role()', '0001_core', false),
    ('app_private.touch_updated_at()', '0001_core', false),
    ('app_private.base64url_decode(text)', '0004_identity_tenant_boundary', false),
    ('app_private.raise_auth_error(text)', '0004_identity_tenant_boundary', false),
    ('app_private.verify_tenant_context(text,text,text,text,boolean)', '0004_identity_tenant_boundary', false),
    ('app_private.api_establish_session(text,text,text)', '0004/0006/0008', true),
    ('app_private.api_logout_session(text,text,text)', '0004_identity_tenant_boundary', true),
    ('app_private.api_list_employees(text,text,text)', '0004_identity_tenant_boundary', true),
    ('app_private.api_execute_command(text,text,text,text,jsonb,text,text,text)', '0004/0007', true)
), function_metadata AS (
  SELECT procedure.oid,
         namespace.nspname AS schema_name,
         CASE procedure.prokind
           WHEN 'p' THEN 'procedure'
           ELSE 'function'
         END AS routine_kind,
         procedure.proname AS routine_name,
         pg_catalog.pg_get_function_identity_arguments(procedure.oid) AS identity_arguments,
         procedure.oid::pg_catalog.regprocedure::text AS signature,
         pg_catalog.pg_get_userbyid(procedure.proowner) AS owner_name,
         extension.extname AS extension_name,
         pg_catalog.has_function_privilege('public', procedure.oid, 'EXECUTE') AS public_execute,
         pg_catalog.has_function_privilege(:'runtime_role', procedure.oid, 'EXECUTE') AS runtime_execute,
         EXISTS (
           SELECT 1
             FROM pg_catalog.aclexplode(COALESCE(
               procedure.proacl,
               pg_catalog.acldefault('f', procedure.proowner)
             )) AS acl
            WHERE acl.grantee = (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = :'runtime_role')
              AND acl.privilege_type = 'EXECUTE'
         ) AS runtime_explicit_execute,
         pg_catalog.has_function_privilege(:'readonly_role', procedure.oid, 'EXECUTE') AS readonly_execute
    FROM pg_catalog.pg_proc AS procedure
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
    LEFT JOIN pg_catalog.pg_depend AS dependency
      ON dependency.classid = 'pg_catalog.pg_proc'::pg_catalog.regclass
     AND dependency.objid = procedure.oid
     AND dependency.deptype = 'e'
    LEFT JOIN pg_catalog.pg_extension AS extension ON extension.oid = dependency.refobjid
   WHERE namespace.nspname IN ('public', 'app_private')
)
SELECT metadata.schema_name,
       metadata.routine_kind,
       metadata.routine_name,
       metadata.identity_arguments,
       metadata.signature,
       metadata.owner_name,
       COALESCE(metadata.extension_name, '') AS extension_name,
       COALESCE(expected.expected_source, 'extension_or_unclassified') AS expected_source,
       COALESCE(expected.runtime_entrypoint, false) AS expected_runtime_entrypoint,
       metadata.public_execute,
       metadata.runtime_execute,
       metadata.runtime_explicit_execute,
       metadata.readonly_execute,
       metadata.owner_name = :'object_owner' AS owner_matches_object_owner
  FROM function_metadata AS metadata
  LEFT JOIN expected ON pg_catalog.to_regprocedure(expected.signature) = metadata.oid
 WHERE metadata.public_execute
    OR metadata.runtime_execute
    OR expected.signature IS NOT NULL
 ORDER BY metadata.schema_name, metadata.routine_name, metadata.identity_arguments;

WITH function_metadata AS (
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
SELECT schema_name,
       owner_name,
       COALESCE(extension_name, '') AS extension_name,
       count(*) FILTER (WHERE pg_catalog.has_function_privilege('public', oid, 'EXECUTE'))::integer AS public_execute_count,
       count(*) FILTER (WHERE pg_catalog.has_function_privilege(:'runtime_role', oid, 'EXECUTE'))::integer AS runtime_execute_count,
       count(*) FILTER (WHERE pg_catalog.has_function_privilege(:'readonly_role', oid, 'EXECUTE'))::integer AS readonly_execute_count
  FROM function_metadata
 GROUP BY schema_name, owner_name, extension_name
 ORDER BY schema_name, owner_name, extension_name;

COMMIT;

\echo 'Read-only Function owner/ACL diagnostic completed. No Function body or business row was read.'
