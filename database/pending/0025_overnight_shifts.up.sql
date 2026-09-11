-- Pending local-tested migration; existing dates/times remain unchanged.
-- A lower end_time means next-day finish. Equal times (ambiguous 0h/24h) remain invalid.
ALTER TABLE shifts DROP CONSTRAINT shifts_check;
ALTER TABLE shifts ADD CONSTRAINT shifts_time_window_check CHECK(start_time<>end_time);

CREATE FUNCTION app_private.api_execute_shift_command(p_payload text,p_signature text,p_key text,p_command text,
 p_input jsonb,p_idempotency text,p_hash text,p_request text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,app_private,pg_temp AS $$
DECLARE auth record; required text[]; prior command_receipts%ROWTYPE; target shifts%ROWTYPE;
 selected_employee text; shift_id text; start_at timestamp; end_at timestamp; result jsonb; body jsonb;
BEGIN
 SELECT * INTO auth FROM app_private.verify_tenant_context(p_payload,p_signature,p_key,'command',true);
 IF auth.authorized_role NOT IN ('boss','manager') THEN PERFORM app_private.raise_auth_error('COMMAND_FORBIDDEN'); END IF;
 IF p_command IS NULL OR p_command NOT IN ('shifts.create','shifts.update') OR jsonb_typeof(p_input) IS DISTINCT FROM 'object'
  OR p_idempotency IS NULL OR p_idempotency !~ '^[A-Za-z0-9._:-]{8,128}$'
  OR p_hash IS NULL OR p_hash !~ '^[a-f0-9]{64}$'
  OR p_request IS NULL OR p_request !~ '^[A-Za-z0-9._:-]{8,128}$' THEN PERFORM app_private.raise_auth_error('COMMAND_INVALID'); END IF;
 required:=ARRAY['employeeId','date','startTime','endTime','note']||CASE WHEN p_command='shifts.create' THEN ARRAY['generatedId'] ELSE ARRAY['shiftId','baseRevision'] END;
 IF NOT p_input ?& required OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_input) k WHERE NOT k=ANY(required))
  OR jsonb_typeof(p_input->'employeeId') IS DISTINCT FROM 'string' OR p_input->>'employeeId' !~ '^[A-Za-z0-9._:-]{1,128}$'
  OR jsonb_typeof(p_input->'date') IS DISTINCT FROM 'string' OR p_input->>'date' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
  OR jsonb_typeof(p_input->'startTime') IS DISTINCT FROM 'string' OR p_input->>'startTime' !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
  OR jsonb_typeof(p_input->'endTime') IS DISTINCT FROM 'string' OR p_input->>'endTime' !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
  OR p_input->>'startTime'=p_input->>'endTime'
  OR jsonb_typeof(p_input->'note') IS DISTINCT FROM 'string' OR length(p_input->>'note')>1000 THEN PERFORM app_private.raise_auth_error('COMMAND_INVALID'); END IF;
 shift_id:=CASE WHEN p_command='shifts.create' THEN p_input->>'generatedId' ELSE p_input->>'shiftId' END;
 IF shift_id IS NULL OR shift_id !~ '^[A-Za-z0-9._:-]{1,128}$' OR (p_command='shifts.update' AND
  (jsonb_typeof(p_input->'baseRevision') IS DISTINCT FROM 'number' OR p_input->>'baseRevision' !~ '^[0-9]{1,9}$')) THEN PERFORM app_private.raise_auth_error('COMMAND_INVALID'); END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(auth.authorized_workspace_id||':'||p_idempotency,0));
 SELECT * INTO prior FROM command_receipts WHERE workspace_id=auth.authorized_workspace_id AND idempotency_key=p_idempotency;
 IF FOUND THEN
  IF prior.command_name<>p_command OR prior.request_hash<>p_hash THEN PERFORM app_private.raise_auth_error('IDEMPOTENCY_KEY_REUSED'); END IF;
  RETURN prior.response_body||jsonb_build_object('replayed',true);
 END IF;
 -- Serialize overlap checks for the destination employee, including neighboring dates.
 SELECT id INTO selected_employee FROM employees WHERE workspace_id=auth.authorized_workspace_id
  AND id=p_input->>'employeeId' AND status='active' FOR UPDATE;
 IF NOT FOUND THEN PERFORM app_private.raise_auth_error('EMPLOYEE_NOT_FOUND'); END IF;
 IF p_command='shifts.update' THEN
  SELECT * INTO target FROM shifts WHERE workspace_id=auth.authorized_workspace_id AND id=shift_id FOR UPDATE;
  IF NOT FOUND THEN PERFORM app_private.raise_auth_error('SHIFT_NOT_FOUND'); END IF;
  IF target.revision<>(p_input->>'baseRevision')::integer THEN PERFORM app_private.raise_auth_error('REVISION_CONFLICT'); END IF;
 END IF;
 start_at:=(p_input->>'date')::date+(p_input->>'startTime')::time;
 end_at:=(p_input->>'date')::date+(p_input->>'endTime')::time+
  CASE WHEN p_input->>'endTime'<p_input->>'startTime' THEN interval '1 day' ELSE interval '0' END;
 IF EXISTS(SELECT 1 FROM shifts WHERE workspace_id=auth.authorized_workspace_id AND employee_id=selected_employee
  AND (p_command='shifts.create' OR id<>shift_id)
  AND work_date BETWEEN (p_input->>'date')::date-1 AND (p_input->>'date')::date+1
  AND work_date+start_time<end_at
  AND work_date+end_time+CASE WHEN end_time<start_time THEN interval '1 day' ELSE interval '0' END>start_at) THEN
  PERFORM app_private.raise_auth_error('SHIFT_OVERLAP'); END IF;
 IF p_command='shifts.create' THEN
  INSERT INTO shifts(workspace_id,id,employee_id,work_date,start_time,end_time,note)
   VALUES(auth.authorized_workspace_id,shift_id,selected_employee,(p_input->>'date')::date,(p_input->>'startTime')::time,(p_input->>'endTime')::time,p_input->>'note') RETURNING * INTO target;
 ELSE
  UPDATE shifts SET employee_id=selected_employee,work_date=(p_input->>'date')::date,start_time=(p_input->>'startTime')::time,
   end_time=(p_input->>'endTime')::time,note=p_input->>'note',revision=revision+1
   WHERE workspace_id=auth.authorized_workspace_id AND id=shift_id RETURNING * INTO target;
 END IF;
 body:=jsonb_build_object('id',target.id,'employeeId',target.employee_id,'date',to_char(target.work_date,'YYYY-MM-DD'),
  'startTime',to_char(target.start_time,'HH24:MI'),'endTime',to_char(target.end_time,'HH24:MI'),'note',target.note,'revision',target.revision);
 result:=jsonb_build_object('ok',true,'data',body);
 INSERT INTO command_receipts(workspace_id,idempotency_key,command_name,request_hash,response_body,actor_user_id)
 VALUES(auth.authorized_workspace_id,p_idempotency,p_command,p_hash,result,auth.authorized_user_id);
 INSERT INTO audit_logs(workspace_id,actor_user_id,action,resource_type,resource_id,request_id,payload)
 VALUES(auth.authorized_workspace_id,auth.authorized_user_id,p_command,'shift',shift_id,p_request,jsonb_build_object('revision',target.revision));
 INSERT INTO outbox_events(workspace_id,event_type,aggregate_type,aggregate_id,payload)
 VALUES(auth.authorized_workspace_id,p_command||'.completed','shift',shift_id,body);
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION app_private.api_execute_shift_command(text,text,text,text,jsonb,text,text,text) FROM PUBLIC;
