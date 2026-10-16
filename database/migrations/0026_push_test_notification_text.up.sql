-- Change only push.test payload.body; retain the existing function and ACL.
-- No queued payloads, subscriptions, receipts, or worker functions are touched.
DO $migration$
DECLARE
  target_oid oid := 'app_private.api_execute_push_command(text,text,text,text,jsonb,text,text,text)'::regprocedure;
  before_row pg_catalog.pg_proc%ROWTYPE;
  after_row pg_catalog.pg_proc%ROWTYPE;
  definition text;
  old_fragment text := $old$'body', '這是一則 Staging 測試推播。'$old$;
  new_fragment text := $new$'body', '這是一則班客邦背景推播測試通知。'$new$;
BEGIN
  SELECT * INTO STRICT before_row FROM pg_catalog.pg_proc WHERE oid = target_oid;
  IF NOT before_row.prosecdef
     OR before_row.prorettype <> 'jsonb'::regtype
     OR EXISTS (
       SELECT 1 FROM pg_catalog.aclexplode(
         coalesce(before_row.proacl, pg_catalog.acldefault('f', before_row.proowner))
       ) acl WHERE acl.grantee = 0 AND acl.privilege_type = 'EXECUTE'
     )
     OR NOT (coalesce(before_row.proconfig, ARRAY[]::text[]) @>
       ARRAY['search_path=pg_catalog, public, app_private']
       OR coalesce(before_row.proconfig, ARRAY[]::text[]) @>
       ARRAY['search_path=pg_catalog, public, app_private, pg_temp']) THEN
    RAISE EXCEPTION '0026 unexpected push function security metadata';
  END IF;

  IF (length(before_row.prosrc) - length(replace(before_row.prosrc, old_fragment, '')))
       / length(old_fragment) <> 1 THEN
    RAISE EXCEPTION '0026 expected exactly one push.test body fragment';
  END IF;

  definition := pg_catalog.pg_get_functiondef(target_oid);
  EXECUTE replace(definition, old_fragment, new_fragment);
  ALTER FUNCTION app_private.api_execute_push_command(text,text,text,text,jsonb,text,text,text)
    SET search_path = pg_catalog, public, app_private, pg_temp;

  SELECT * INTO STRICT after_row FROM pg_catalog.pg_proc WHERE oid = target_oid;
  IF after_row.prosrc IS DISTINCT FROM replace(before_row.prosrc, old_fragment, new_fragment)
     OR (to_jsonb(after_row) - 'prosrc' - 'proconfig')
        IS DISTINCT FROM (to_jsonb(before_row) - 'prosrc' - 'proconfig')
     OR after_row.proconfig IS DISTINCT FROM
        array_append(array_remove(before_row.proconfig,
          CASE WHEN before_row.proconfig @> ARRAY['search_path=pg_catalog, public, app_private']
            THEN 'search_path=pg_catalog, public, app_private'
            ELSE 'search_path=pg_catalog, public, app_private, pg_temp' END),
          'search_path=pg_catalog, public, app_private, pg_temp') THEN
    RAISE EXCEPTION '0026 function body or security preservation check failed';
  END IF;
END
$migration$;
