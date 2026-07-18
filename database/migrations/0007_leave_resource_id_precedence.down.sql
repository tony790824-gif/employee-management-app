DO $$
DECLARE
  definition text;
  fixed_expression text := 'resource_id := target_employee_id || '':'' || (command_input->>''month'');';
  prior_expression text := 'resource_id := target_employee_id || '':'' || command_input->>''month'';';
BEGIN
  SELECT pg_get_functiondef('app_private.api_execute_command(text,text,text,text,jsonb,text,text,text)'::regprocedure)
    INTO definition;
  IF strpos(definition, fixed_expression) = 0 THEN
    RAISE EXCEPTION 'Cannot safely restore the prior api_execute_command definition';
  END IF;
  EXECUTE replace(definition, fixed_expression, prior_expression);
END
$$;
