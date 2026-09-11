-- Local/disposable only until the combined Production activation package is authorized.
-- Reuses signed tenant context, payroll_adjustments, receipts and audit logs.
-- No existing amount is changed. Legacy signed amounts retain their original meaning.
ALTER TABLE payroll_adjustments ADD COLUMN entry_name text NOT NULL DEFAULT '薪資調整'
  CHECK (length(btrim(entry_name)) BETWEEN 1 AND 120);
ALTER TABLE payroll_adjustments ADD COLUMN entry_status text NOT NULL DEFAULT 'active'
  CHECK (entry_status IN ('active','voided'));

CREATE TABLE payroll_monthly (
  workspace_id text NOT NULL, employee_id text NOT NULL,
  payroll_month text NOT NULL CHECK (payroll_month ~ '^(19|20|21)[0-9]{2}-(0[1-9]|1[0-2])$'),
  base_mode text NOT NULL CHECK (base_mode IN ('hourly','fixed')),
  base_salary integer NOT NULL CHECK (base_salary BETWEEN 0 AND 999999999),
  commission integer NOT NULL DEFAULT 0 CHECK (commission BETWEEN 0 AND 999999999),
  note text NOT NULL DEFAULT '' CHECK (length(note)<=1000),
  revision integer NOT NULL CHECK (revision>=1),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(workspace_id,employee_id,payroll_month),
  FOREIGN KEY(workspace_id,employee_id) REFERENCES employees(workspace_id,id) ON DELETE RESTRICT,
  CHECK (base_mode='fixed' OR base_salary=0)
);
ALTER TABLE payroll_monthly ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_monthly FORCE ROW LEVEL SECURITY;
CREATE POLICY payroll_monthly_tenant ON payroll_monthly
 USING (workspace_id=app_private.current_workspace_id()) WITH CHECK(workspace_id=app_private.current_workspace_id());
CREATE TRIGGER payroll_monthly_touch BEFORE UPDATE ON payroll_monthly FOR EACH ROW EXECUTE FUNCTION app_private.touch_updated_at();

CREATE FUNCTION app_private.api_payroll_month(p_payload text,p_signature text,p_key text,p_month text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,app_private,pg_temp AS $$
DECLARE auth record; rows jsonb;
BEGIN
 SELECT * INTO auth FROM app_private.verify_tenant_context(p_payload,p_signature,p_key,'read',true);
 IF p_month IS NULL OR p_month !~ '^(19|20|21)[0-9]{2}-(0[1-9]|1[0-2])$' THEN
   PERFORM app_private.raise_auth_error('COMMAND_INVALID');
 END IF;
 SELECT coalesce(jsonb_agg(result ORDER BY result->>'name',result->>'employeeId'),'[]'::jsonb) INTO rows FROM (
 SELECT jsonb_build_object('employeeId',e.id,'name',e.name,'status',e.employment_status,'month',p_month,
   'baseMode',coalesce(m.base_mode,'hourly'),'baseSalary',coalesce(m.base_salary,0),
   'hourlyRate',e.hourly_rate,'hours',a.hours,'basePay',b.amount,
   'additions',x.additions,'deductions',x.deductions,'commission',coalesce(m.commission,0),
   'payable',b.amount+x.additions+coalesce(m.commission,0)-x.deductions,
   'revision',coalesce(m.revision,0),'note',coalesce(m.note,''),'adjustments',x.items) AS result
 FROM employees e
 LEFT JOIN payroll_monthly m ON m.workspace_id=e.workspace_id AND m.employee_id=e.id AND m.payroll_month=p_month
 CROSS JOIN LATERAL (SELECT coalesce(sum(hours),0) AS hours FROM attendance_records
   WHERE workspace_id=e.workspace_id AND employee_id=e.id AND attendance_type='出勤'
    AND work_date>=to_date(p_month||'-01','YYYY-MM-DD') AND work_date<(to_date(p_month||'-01','YYYY-MM-DD')+interval '1 month')) a
 CROSS JOIN LATERAL (SELECT CASE WHEN m.base_mode='fixed' THEN m.base_salary ELSE round(a.hours*e.hourly_rate) END AS amount) b
 CROSS JOIN LATERAL (SELECT
   coalesce(sum(greatest(amount,0)) FILTER(WHERE entry_status='active'),0) AS additions,
   coalesce(sum(-least(amount,0)) FILTER(WHERE entry_status='active'),0) AS deductions,
   coalesce(jsonb_agg(jsonb_build_object('id',id,'name',entry_name,'kind',CASE WHEN amount<0 THEN 'deduction' ELSE 'addition' END,
     'amount',abs(amount::bigint),'note',note,'status',entry_status,'revision',revision) ORDER BY created_at,id),'[]'::jsonb) AS items
   FROM payroll_adjustments WHERE workspace_id=e.workspace_id AND employee_id=e.id AND payroll_month=p_month) x
 WHERE e.workspace_id=auth.authorized_workspace_id
   AND (auth.authorized_role IN ('boss','manager') OR e.id=auth.authorized_employee_id)
   AND (auth.authorized_role IN ('boss','manager') OR e.status='active' OR m.employee_id IS NOT NULL OR a.hours<>0 OR jsonb_array_length(x.items)>0)
 ) q;
 RETURN jsonb_build_object('ok',true,'month',p_month,'data',rows);
END $$;
REVOKE ALL ON FUNCTION app_private.api_payroll_month(text,text,text,text) FROM PUBLIC;

CREATE FUNCTION app_private.api_execute_payroll_command(p_payload text,p_signature text,p_key text,p_command text,
 p_input jsonb,p_idempotency text,p_hash text,p_request text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,app_private,pg_temp AS $$
DECLARE auth record; required text[]; e employees%ROWTYPE; item payroll_adjustments%ROWTYPE;
 monthly payroll_monthly%ROWTYPE; prior command_receipts%ROWTYPE; result jsonb; rev integer; signed_amount integer;
BEGIN
 SELECT * INTO auth FROM app_private.verify_tenant_context(p_payload,p_signature,p_key,'command',true);
 IF auth.authorized_role NOT IN ('boss','manager') THEN PERFORM app_private.raise_auth_error('COMMAND_FORBIDDEN'); END IF;
 IF p_command IS NULL OR p_command NOT IN ('payroll.monthly-save','payroll.adjustment-save','payroll.adjustment-void')
  OR jsonb_typeof(p_input) IS DISTINCT FROM 'object'
  OR p_idempotency IS NULL OR p_idempotency !~ '^[A-Za-z0-9._:-]{8,128}$'
  OR p_hash IS NULL OR p_hash !~ '^[a-f0-9]{64}$'
  OR p_request IS NULL OR p_request !~ '^[A-Za-z0-9._:-]{8,128}$' THEN PERFORM app_private.raise_auth_error('COMMAND_INVALID'); END IF;
 required:=ARRAY['employeeId','month','baseRevision']||CASE p_command
  WHEN 'payroll.monthly-save' THEN ARRAY['baseMode','baseSalary','commission','note']
  WHEN 'payroll.adjustment-save' THEN ARRAY['id','kind','name','amount','note'] ELSE ARRAY['id'] END;
 IF NOT p_input ?& required OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_input) k WHERE NOT k=ANY(required))
  OR jsonb_typeof(p_input->'employeeId') IS DISTINCT FROM 'string' OR p_input->>'employeeId' !~ '^[A-Za-z0-9._:-]{1,128}$'
  OR jsonb_typeof(p_input->'month') IS DISTINCT FROM 'string' OR p_input->>'month' !~ '^(19|20|21)[0-9]{2}-(0[1-9]|1[0-2])$'
  OR jsonb_typeof(p_input->'baseRevision') IS DISTINCT FROM 'number' OR p_input->>'baseRevision' !~ '^[0-9]{1,9}$'
  THEN PERFORM app_private.raise_auth_error('COMMAND_INVALID'); END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(auth.authorized_workspace_id||':'||p_idempotency,0));
 SELECT * INTO prior FROM command_receipts WHERE workspace_id=auth.authorized_workspace_id AND idempotency_key=p_idempotency;
 IF FOUND THEN
  IF prior.command_name<>p_command OR prior.request_hash<>p_hash THEN PERFORM app_private.raise_auth_error('IDEMPOTENCY_KEY_REUSED'); END IF;
  RETURN prior.response_body||jsonb_build_object('replayed',true);
 END IF;
 -- Employee lock also serializes first monthly saves and employee status changes.
 SELECT * INTO e FROM employees WHERE workspace_id=auth.authorized_workspace_id AND id=p_input->>'employeeId' FOR UPDATE;
 IF NOT FOUND THEN PERFORM app_private.raise_auth_error('EMPLOYEE_NOT_FOUND'); END IF;
 IF p_command='payroll.monthly-save' THEN
  IF jsonb_typeof(p_input->'baseMode') IS DISTINCT FROM 'string' OR p_input->>'baseMode' NOT IN ('hourly','fixed')
   OR jsonb_typeof(p_input->'baseSalary') IS DISTINCT FROM 'number' OR p_input->>'baseSalary' !~ '^[0-9]{1,9}$'
   OR jsonb_typeof(p_input->'commission') IS DISTINCT FROM 'number' OR p_input->>'commission' !~ '^[0-9]{1,9}$'
   OR jsonb_typeof(p_input->'note') IS DISTINCT FROM 'string' OR length(p_input->>'note')>1000
   OR (p_input->>'baseMode'='hourly' AND (p_input->>'baseSalary')::integer<>0) THEN
   PERFORM app_private.raise_auth_error('COMMAND_INVALID'); END IF;
  SELECT * INTO monthly FROM payroll_monthly WHERE workspace_id=e.workspace_id AND employee_id=e.id AND payroll_month=p_input->>'month' FOR UPDATE;
  IF coalesce(monthly.revision,0)<>(p_input->>'baseRevision')::integer THEN PERFORM app_private.raise_auth_error('REVISION_CONFLICT'); END IF;
  rev:=coalesce(monthly.revision,0)+1;
  INSERT INTO payroll_monthly(workspace_id,employee_id,payroll_month,base_mode,base_salary,commission,note,revision)
   VALUES(e.workspace_id,e.id,p_input->>'month',p_input->>'baseMode',(p_input->>'baseSalary')::integer,(p_input->>'commission')::integer,p_input->>'note',rev)
   ON CONFLICT(workspace_id,employee_id,payroll_month) DO UPDATE SET base_mode=excluded.base_mode,base_salary=excluded.base_salary,
    commission=excluded.commission,note=excluded.note,revision=excluded.revision;
 ELSE
  IF jsonb_typeof(p_input->'id') IS DISTINCT FROM 'string' OR p_input->>'id' !~ '^[a-fA-F0-9-]{36}$' THEN
   PERFORM app_private.raise_auth_error('COMMAND_INVALID'); END IF;
  SELECT * INTO item FROM payroll_adjustments WHERE workspace_id=e.workspace_id AND id=(p_input->>'id')::uuid FOR UPDATE;
  IF item.id IS NOT NULL AND (item.employee_id<>e.id OR item.payroll_month<>p_input->>'month') THEN PERFORM app_private.raise_auth_error('PAYROLL_ITEM_NOT_FOUND'); END IF;
  IF coalesce(item.revision,0)<>(p_input->>'baseRevision')::integer THEN PERFORM app_private.raise_auth_error('REVISION_CONFLICT'); END IF;
  IF item.entry_status='voided' THEN PERFORM app_private.raise_auth_error('PAYROLL_ITEM_VOIDED'); END IF;
  rev:=coalesce(item.revision,0)+1;
  IF p_command='payroll.adjustment-void' THEN
   IF item.id IS NULL THEN PERFORM app_private.raise_auth_error('PAYROLL_ITEM_NOT_FOUND'); END IF;
   UPDATE payroll_adjustments SET entry_status='voided',revision=rev WHERE workspace_id=e.workspace_id AND id=item.id;
  ELSE
   IF jsonb_typeof(p_input->'kind') IS DISTINCT FROM 'string' OR p_input->>'kind' NOT IN ('addition','deduction')
    OR jsonb_typeof(p_input->'name') IS DISTINCT FROM 'string' OR length(btrim(p_input->>'name')) NOT BETWEEN 1 AND 120
    OR jsonb_typeof(p_input->'amount') IS DISTINCT FROM 'number' OR p_input->>'amount' !~ '^[1-9][0-9]{0,8}$'
    OR jsonb_typeof(p_input->'note') IS DISTINCT FROM 'string' OR length(p_input->>'note')>1000 THEN PERFORM app_private.raise_auth_error('COMMAND_INVALID'); END IF;
   signed_amount:=(p_input->>'amount')::integer*CASE WHEN p_input->>'kind'='deduction' THEN -1 ELSE 1 END;
   IF item.id IS NULL THEN
    INSERT INTO payroll_adjustments(workspace_id,id,employee_id,payroll_month,amount,adjustment_date,note,revision,entry_name)
     VALUES(e.workspace_id,(p_input->>'id')::uuid,e.id,p_input->>'month',signed_amount,to_date(p_input->>'month'||'-01','YYYY-MM-DD'),p_input->>'note',rev,btrim(p_input->>'name'));
   ELSE
    UPDATE payroll_adjustments SET amount=signed_amount,note=p_input->>'note',entry_name=btrim(p_input->>'name'),revision=rev
     WHERE workspace_id=e.workspace_id AND id=item.id;
   END IF;
  END IF;
 END IF;
 result:=jsonb_build_object('ok',true,'data',jsonb_build_object('employeeId',e.id,'month',p_input->>'month','revision',rev));
 INSERT INTO command_receipts(workspace_id,idempotency_key,command_name,request_hash,response_body,actor_user_id)
 VALUES(e.workspace_id,p_idempotency,p_command,p_hash,result,auth.authorized_user_id);
 INSERT INTO audit_logs(workspace_id,actor_user_id,action,resource_type,resource_id,request_id,payload)
 VALUES(e.workspace_id,auth.authorized_user_id,p_command,'payroll',e.id,p_request,jsonb_build_object('month',p_input->>'month','itemId',p_input->>'id','revision',rev));
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION app_private.api_execute_payroll_command(text,text,text,text,jsonb,text,text,text) FROM PUBLIC;
