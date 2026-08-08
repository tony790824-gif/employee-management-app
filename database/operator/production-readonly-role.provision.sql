\set ON_ERROR_STOP on

-- MANUAL OPERATOR SCRIPT ONLY. This file is not a Migration and is never executed by tests.
-- Run with psql as the reviewed Production object owner only after separate approval.
-- Create the login role and its random password in Neon first. Never pass a password to this file.
-- Required psql variables:
--   confirmation=PROVISION_BANKE_PRODUCTION_READONLY
--   readonly_role=<existing login role>
--   object_owner=<role that creates Bankeban tables/functions>

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

ALTER ROLE :"readonly_role"
  LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS
  CONNECTION LIMIT 3;
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

\echo 'Provisioning statements completed. Disconnect the owner and verify with the read-only credential.'
