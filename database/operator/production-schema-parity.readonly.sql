\set ON_ERROR_STOP on
-- FUTURE MANUAL USE ONLY. Requires separate human authorization.
-- This file reads PostgreSQL catalogs and public.schema_migrations only.
\if :{?confirmation}
\else
  \echo 'Missing confirmation; no query was executed.'
  \quit
\endif
\if :{?expected_database}
\else
  \echo 'Missing expected_database; no query was executed.'
  \quit
\endif
\if :{?readonly_role}
\else
  \echo 'Missing readonly_role; no query was executed.'
  \quit
\endif

SELECT :'confirmation' = 'INSPECT_BANKE_PRODUCTION_SCHEMA_PARITY'
       AND current_database() = :'expected_database'
       AND current_user = :'readonly_role'
       AND session_user = :'readonly_role'
       AND current_setting('transaction_read_only') = 'on' AS identity_ok
\gset
\if :identity_ok
\else
  \echo 'Target identity or read-only state mismatch; no metadata was returned.'
  \quit
\endif

SELECT NOT rolsuper
       AND NOT rolcreatedb
       AND NOT rolcreaterole
       AND NOT rolreplication
       AND NOT rolbypassrls
       AND rolcanlogin
       AND NOT rolinherit
       -- An inbound membership (another role is a member of this read-only
       -- role) does not grant this role any privilege. Fail closed only when
       -- this role has an outbound/reachable role path that provides role
       -- administration or can expose privileges through USAGE/SET. Treat
       -- every such path as unsafe even if the granted role is empty today.
       AND NOT EXISTS (
         SELECT 1
           FROM pg_catalog.pg_roles AS granted_role
          WHERE granted_role.oid <> roles.oid
            AND pg_catalog.pg_has_role(roles.oid, granted_role.oid, 'MEMBER')
            AND (
              pg_catalog.pg_has_role(
                roles.oid,
                granted_role.oid,
                'MEMBER WITH ADMIN OPTION'
              )
              OR pg_catalog.pg_has_role(
                roles.oid,
                granted_role.oid,
                'USAGE'
              )
              OR pg_catalog.pg_has_role(
                roles.oid,
                granted_role.oid,
                'SET'
              )
            )
       )
       AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_database AS database_record WHERE database_record.datdba = roles.oid)
       AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_namespace AS namespace WHERE namespace.nspowner = roles.oid)
       AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_class AS relation WHERE relation.relowner = roles.oid)
       AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc AS procedure WHERE procedure.proowner = roles.oid)
       AS role_safe
  FROM pg_catalog.pg_roles AS roles
 WHERE roles.rolname = current_user
\gset
\if :role_safe
\else
  \echo 'Read-only role attributes are unsafe or missing; inspection stopped.'
  \quit
\endif

SELECT version, name, checksum
  FROM public.schema_migrations
 ORDER BY version;

SELECT namespace.nspname AS schema_name,
       pg_catalog.pg_get_userbyid(namespace.nspowner) AS owner_name,
       namespace.nspacl AS acl
  FROM pg_catalog.pg_namespace AS namespace
 WHERE namespace.nspname IN ('public', 'app_private')
 ORDER BY namespace.nspname;

SELECT namespace.nspname AS schema_name,
       relation.relname AS table_name,
       relation.relkind AS relation_kind,
       pg_catalog.pg_get_userbyid(relation.relowner) AS owner_name,
       relation.relrowsecurity AS rls_enabled,
       relation.relforcerowsecurity AS rls_forced,
       relation.relacl AS acl
  FROM pg_catalog.pg_class AS relation
  JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
 WHERE namespace.nspname IN ('public', 'app_private')
   AND relation.relkind IN ('r', 'p', 'v', 'm', 'S')
 ORDER BY namespace.nspname, relation.relname;

SELECT columns.table_schema AS schema_name,
       columns.table_name,
       columns.ordinal_position,
       columns.column_name,
       columns.data_type,
       columns.udt_schema,
       columns.udt_name,
       columns.is_nullable,
       columns.column_default,
       columns.is_identity,
       columns.identity_generation
  FROM information_schema.columns AS columns
 WHERE columns.table_schema IN ('public', 'app_private')
 ORDER BY columns.table_schema, columns.table_name, columns.ordinal_position;

SELECT namespace.nspname AS schema_name,
       relation.relname AS table_name,
       constraint_record.conname AS constraint_name,
       constraint_record.contype AS constraint_type,
       constraint_record.condeferrable AS is_deferrable,
       constraint_record.condeferred AS initially_deferred,
       constraint_record.convalidated AS is_validated,
       pg_catalog.pg_get_constraintdef(constraint_record.oid, true) AS definition
  FROM pg_catalog.pg_constraint AS constraint_record
  JOIN pg_catalog.pg_class AS relation ON relation.oid = constraint_record.conrelid
  JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
 WHERE namespace.nspname IN ('public', 'app_private')
 ORDER BY namespace.nspname, relation.relname, constraint_record.conname;

SELECT namespace.nspname AS schema_name,
       relation.relname AS table_name,
       index_relation.relname AS index_name,
       pg_catalog.pg_get_userbyid(index_relation.relowner) AS owner_name,
       index_record.indisunique AS is_unique,
       index_record.indisprimary AS is_primary,
       index_record.indisvalid AS is_valid,
       pg_catalog.pg_get_indexdef(index_record.indexrelid) AS definition
  FROM pg_catalog.pg_index AS index_record
  JOIN pg_catalog.pg_class AS relation ON relation.oid = index_record.indrelid
  JOIN pg_catalog.pg_class AS index_relation ON index_relation.oid = index_record.indexrelid
  JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
 WHERE namespace.nspname IN ('public', 'app_private')
 ORDER BY namespace.nspname, relation.relname, index_relation.relname;

SELECT namespace.nspname AS schema_name,
       procedure.proname AS function_name,
       pg_catalog.pg_get_function_identity_arguments(procedure.oid) AS identity_arguments,
       pg_catalog.pg_get_userbyid(procedure.proowner) AS owner_name,
       procedure.prokind AS function_kind,
       procedure.prosecdef AS security_definer,
       procedure.provolatile AS volatility,
       procedure.proacl AS acl,
       extension.extname AS extension_name
  FROM pg_catalog.pg_proc AS procedure
  JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
  LEFT JOIN pg_catalog.pg_depend AS dependency
    ON dependency.classid = 'pg_catalog.pg_proc'::pg_catalog.regclass
   AND dependency.objid = procedure.oid
   AND dependency.deptype = 'e'
  LEFT JOIN pg_catalog.pg_extension AS extension ON extension.oid = dependency.refobjid
 WHERE namespace.nspname IN ('public', 'app_private')
 ORDER BY namespace.nspname, procedure.proname,
          pg_catalog.pg_get_function_identity_arguments(procedure.oid);

SELECT policies.schemaname AS schema_name,
       policies.tablename AS table_name,
       policies.policyname AS policy_name,
       policies.permissive,
       policies.roles,
       policies.cmd,
       policies.qual,
       policies.with_check
  FROM pg_catalog.pg_policies AS policies
 WHERE policies.schemaname IN ('public', 'app_private')
 ORDER BY policies.schemaname, policies.tablename, policies.policyname;

SELECT extension.extname AS extension_name,
       extension.extversion AS extension_version,
       namespace.nspname AS schema_name,
       pg_catalog.pg_get_userbyid(extension.extowner) AS owner_name
  FROM pg_catalog.pg_extension AS extension
  JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = extension.extnamespace
 ORDER BY extension.extname;

SELECT roles.rolname AS member_role,
       parent.rolname AS granted_role,
       membership.admin_option,
       membership.inherit_option,
       membership.set_option
  FROM pg_catalog.pg_auth_members AS membership
  JOIN pg_catalog.pg_roles AS roles ON roles.oid = membership.member
  JOIN pg_catalog.pg_roles AS parent ON parent.oid = membership.roleid
 WHERE roles.rolname = current_user OR parent.rolname = current_user
 ORDER BY roles.rolname, parent.rolname;
