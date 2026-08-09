\set ON_ERROR_STOP on

-- MANUAL, READ-ONLY VERIFICATION. Connect as the new read-only role to neondb.
-- This script reads catalog/ledger metadata only. It never probes a business row or executes DDL/DML.
SET default_transaction_read_only = on;
SET statement_timeout = '10s';
BEGIN TRANSACTION READ ONLY;

SELECT current_database() = 'neondb'
       AND current_user = 'banke_production_readonly'
       AND session_user = 'banke_production_readonly' AS approved_reader_identity
\gset
\if :approved_reader_identity
\else
  \echo 'The verification connection is not the exact Production read-only identity.'
  ROLLBACK;
  \quit
\endif

SELECT current_database() AS database_name,
       current_user AS role_name,
       current_setting('transaction_read_only') AS transaction_read_only;

SELECT rolsuper,
       rolcreatedb,
       rolcreaterole,
       rolreplication,
       rolbypassrls,
       rolcanlogin,
       rolinherit,
       rolconnlimit,
       COALESCE(rolconfig, ARRAY[]::text[]) AS role_config
  FROM pg_catalog.pg_roles
 WHERE rolname = current_user;

SELECT has_database_privilege(current_user, current_database(), 'CONNECT') AS can_connect,
       has_database_privilege(current_user, current_database(), 'CREATE') AS can_create_database_objects,
       has_schema_privilege(current_user, 'public', 'USAGE') AS can_use_public,
       has_schema_privilege(current_user, 'public', 'CREATE') AS can_create_public,
       has_schema_privilege(current_user, 'app_private', 'USAGE') AS can_use_app_private,
       has_schema_privilege(current_user, 'app_private', 'CREATE') AS can_create_app_private,
       has_table_privilege(current_user, 'public.schema_migrations', 'SELECT') AS can_read_migration_ledger;

SELECT count(*) FILTER (
         WHERE NOT (namespace.nspname = 'public' AND relation.relname = 'schema_migrations')
           AND has_table_privilege(current_user, relation.oid, 'SELECT')
       )::integer AS business_table_select_count,
       count(*) FILTER (
         WHERE has_table_privilege(current_user, relation.oid, 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
       )::integer AS table_write_privilege_count
  FROM pg_catalog.pg_class AS relation
  JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
 WHERE namespace.nspname IN ('public', 'app_private')
   AND relation.relkind IN ('r', 'p', 'v', 'm');

SELECT count(*) FILTER (
         WHERE has_sequence_privilege(current_user, relation.oid, 'USAGE,UPDATE')
       )::integer AS sequence_write_privilege_count
  FROM pg_catalog.pg_class AS relation
  JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
 WHERE namespace.nspname IN ('public', 'app_private')
   AND relation.relkind = 'S';

-- Application-managed routines remain a strict allowlist. Platform-managed
-- pgcrypto members are reported separately and never converted into an
-- application ACL PASS.
WITH expected(signature, runtime_entrypoint) AS (
  VALUES
    ('app_private.current_workspace_id()', false),
    ('app_private.current_user_id()', false),
    ('app_private.current_role()', false),
    ('app_private.touch_updated_at()', false),
    ('app_private.base64url_decode(text)', false),
    ('app_private.raise_auth_error(text)', false),
    ('app_private.verify_tenant_context(text,text,text,text,boolean)', false),
    ('app_private.api_establish_session(text,text,text)', true),
    ('app_private.api_logout_session(text,text,text)', true),
    ('app_private.api_list_employees(text,text,text)', true),
    ('app_private.api_execute_command(text,text,text,text,jsonb,text,text,text)', true)
), application AS (
  SELECT expected.*,
         pg_catalog.to_regprocedure(expected.signature) AS procedure_oid
    FROM expected
)
SELECT count(procedure_oid)::integer AS application_function_count,
       count(*) FILTER (WHERE procedure_oid IS NULL)::integer AS application_missing_function_count,
       count(*) FILTER (
         WHERE procedure_oid IS NOT NULL
           AND (SELECT pg_catalog.pg_get_userbyid(procedure.proowner)
                  FROM pg_catalog.pg_proc AS procedure
                 WHERE procedure.oid = application.procedure_oid) <> 'neondb_owner'
       )::integer AS application_owner_mismatch_count,
       count(*) FILTER (
         WHERE procedure_oid IS NOT NULL
           AND pg_catalog.has_function_privilege(current_user, procedure_oid, 'EXECUTE')
       )::integer AS application_function_execute_count,
       count(*) FILTER (
         WHERE procedure_oid IS NOT NULL
           AND pg_catalog.has_function_privilege('public', procedure_oid, 'EXECUTE')
       )::integer AS application_public_execute_count,
       count(*) FILTER (
         WHERE procedure_oid IS NOT NULL
           AND pg_catalog.has_function_privilege('banke_production_readonly', procedure_oid, 'EXECUTE')
       )::integer AS application_readonly_execute_count,
       count(*) FILTER (
         WHERE procedure_oid IS NOT NULL
           AND pg_catalog.has_function_privilege('banke_api_production', procedure_oid, 'EXECUTE')
       )::integer AS application_runtime_execute_count,
       count(*) FILTER (
         WHERE procedure_oid IS NOT NULL
           AND runtime_entrypoint
           AND EXISTS (
             SELECT 1
               FROM pg_catalog.pg_proc AS procedure
               CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(
                 procedure.proacl,
                 pg_catalog.acldefault('f', procedure.proowner)
               )) AS acl
              WHERE procedure.oid = application.procedure_oid
                AND acl.grantee = (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = 'banke_api_production')
                AND acl.privilege_type = 'EXECUTE'
           )
       )::integer AS application_runtime_explicit_execute_count,
       count(*) FILTER (
         WHERE procedure_oid IS NOT NULL
           AND NOT runtime_entrypoint
           AND pg_catalog.has_function_privilege('banke_api_production', procedure_oid, 'EXECUTE')
       )::integer AS application_runtime_unapproved_execute_count
  FROM application;

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
SELECT count(*) FILTER (WHERE extension_name IS NOT NULL)::integer AS extension_function_count,
       count(*) FILTER (
         WHERE extension_name IS NOT NULL
           AND pg_catalog.has_function_privilege(current_user, oid, 'EXECUTE')
       )::integer AS extension_function_execute_count,
       count(*) FILTER (
         WHERE extension_name IS NOT NULL
           AND pg_catalog.has_function_privilege('public', oid, 'EXECUTE')
       )::integer AS extension_public_execute_count,
       count(*) FILTER (
         WHERE extension_name IS NOT NULL
           AND pg_catalog.has_function_privilege('banke_production_readonly', oid, 'EXECUTE')
       )::integer AS extension_readonly_execute_count,
       count(*) FILTER (
         WHERE extension_name IS NULL
           AND oid NOT IN (SELECT procedure_oid FROM expected WHERE procedure_oid IS NOT NULL)
       )::integer AS unexpected_application_function_count,
       count(*) FILTER (
         WHERE extension_name IS NOT NULL
           AND NOT (
             schema_name = 'public'
             AND extension_name = 'pgcrypto'
             AND owner_name = 'cloud_admin'
           )
       )::integer AS unexpected_extension_function_count,
       CASE
         WHEN count(*) FILTER (WHERE extension_name IS NOT NULL) > 0
          AND count(*) FILTER (
           WHERE extension_name IS NOT NULL
             AND NOT (
               schema_name = 'public'
               AND extension_name = 'pgcrypto'
               AND owner_name = 'cloud_admin'
             )
         ) = 0
         THEN 'ACCEPTED_PLATFORM_INFORMATION'
         ELSE 'FAIL_UNREVIEWED_EXTENSION'
       END AS extension_acl_status
  FROM classified;

WITH expected(signature, runtime_entrypoint) AS (
  VALUES
    ('app_private.current_workspace_id()', false),
    ('app_private.current_user_id()', false),
    ('app_private.current_role()', false),
    ('app_private.touch_updated_at()', false),
    ('app_private.base64url_decode(text)', false),
    ('app_private.raise_auth_error(text)', false),
    ('app_private.verify_tenant_context(text,text,text,text,boolean)', false),
    ('app_private.api_establish_session(text,text,text)', true),
    ('app_private.api_logout_session(text,text,text)', true),
    ('app_private.api_list_employees(text,text,text)', true),
    ('app_private.api_execute_command(text,text,text,text,jsonb,text,text,text)', true)
), application AS (
  SELECT expected.*,
         pg_catalog.to_regprocedure(expected.signature) AS procedure_oid
    FROM expected
)
SELECT count(*) = 11
       AND count(procedure_oid) = 11
       AND count(*) FILTER (
         WHERE procedure_oid IS NOT NULL
           AND (SELECT pg_catalog.pg_get_userbyid(procedure.proowner)
                  FROM pg_catalog.pg_proc AS procedure
                 WHERE procedure.oid = application.procedure_oid) = 'neondb_owner'
       ) = 11
       AND count(*) FILTER (WHERE pg_catalog.has_function_privilege('public', procedure_oid, 'EXECUTE')) = 0
       AND count(*) FILTER (WHERE pg_catalog.has_function_privilege('banke_production_readonly', procedure_oid, 'EXECUTE')) = 0
       AND count(*) FILTER (WHERE pg_catalog.has_function_privilege('banke_api_production', procedure_oid, 'EXECUTE')) = 4
       AND count(*) FILTER (
         WHERE runtime_entrypoint
           AND EXISTS (
             SELECT 1
               FROM pg_catalog.pg_proc AS procedure
               CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(
                 procedure.proacl,
                 pg_catalog.acldefault('f', procedure.proowner)
               )) AS acl
              WHERE procedure.oid = application.procedure_oid
                AND acl.grantee = (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = 'banke_api_production')
                AND acl.privilege_type = 'EXECUTE'
           )
       ) = 4
       AND count(*) FILTER (
         WHERE NOT runtime_entrypoint
           AND pg_catalog.has_function_privilege('banke_api_production', procedure_oid, 'EXECUTE')
       ) = 0 AS application_function_acl_pass
  FROM application
\gset
\if :application_function_acl_pass
\else
  \echo 'Bankeban application Function ACL verification failed.'
  ROLLBACK;
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
SELECT EXISTS (
         SELECT 1 FROM classified
          WHERE schema_name = 'public'
            AND extension_name = 'pgcrypto'
            AND owner_name = 'cloud_admin'
       )
       AND NOT EXISTS (
         SELECT 1 FROM classified
          WHERE extension_name IS NULL
            AND oid NOT IN (SELECT procedure_oid FROM expected WHERE procedure_oid IS NOT NULL)
       )
       AND NOT EXISTS (
         SELECT 1 FROM classified
          WHERE extension_name IS NOT NULL
            AND NOT (
              schema_name = 'public'
              AND extension_name = 'pgcrypto'
              AND owner_name = 'cloud_admin'
            )
       ) AS reviewed_function_sets_only
\gset
\if :reviewed_function_sets_only
\else
  \echo 'An unreviewed application or Extension Function was found.'
  ROLLBACK;
  \quit
\endif

SELECT version, name, checksum
  FROM public.schema_migrations
 ORDER BY version;

COMMIT;
