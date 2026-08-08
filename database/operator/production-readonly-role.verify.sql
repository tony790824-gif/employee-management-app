\set ON_ERROR_STOP on

-- MANUAL, READ-ONLY VERIFICATION. Connect as the new read-only role to neondb.
-- This script reads catalog/ledger metadata only. It never probes a business row or executes DDL/DML.
SET default_transaction_read_only = on;
SET statement_timeout = '10s';

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

SELECT count(*) FILTER (
         WHERE has_function_privilege(current_user, procedure.oid, 'EXECUTE')
       )::integer AS function_execute_privilege_count
  FROM pg_catalog.pg_proc AS procedure
  JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
 WHERE namespace.nspname IN ('public', 'app_private');

SELECT version, name, checksum
  FROM public.schema_migrations
 ORDER BY version;
