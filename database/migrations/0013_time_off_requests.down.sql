DROP FUNCTION IF EXISTS app_private.api_execute_time_off_command(
  text,text,text,text,jsonb,text,text,text
);
DROP FUNCTION IF EXISTS app_private.api_list_time_off_requests(text,text,text);
DROP TABLE IF EXISTS time_off_request_dates;
DROP TABLE IF EXISTS time_off_requests;
