\set ON_ERROR_STOP on

-- MANUAL EMERGENCY DISABLE/REVOCATION. This file does not drop the role or any data.
-- Required psql variables:
--   confirmation=DISABLE_BANKE_PRODUCTION_READONLY
--   readonly_role=<existing read-only login role>
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

SELECT :'confirmation' = 'DISABLE_BANKE_PRODUCTION_READONLY' AS confirmed \gset
\if :confirmed
\else
  \echo 'Invalid confirmation; no change was attempted.'
  \quit
\endif

ALTER ROLE :"readonly_role" NOLOGIN;
REVOKE CONNECT ON DATABASE neondb FROM :"readonly_role";
REVOKE ALL PRIVILEGES ON SCHEMA public, app_private FROM :"readonly_role";
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public, app_private FROM :"readonly_role";
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public, app_private FROM :"readonly_role";
REVOKE ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public, app_private FROM :"readonly_role";

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

\echo 'Read-only role disabled and application-schema privileges revoked. The role was not dropped.'
