CREATE TABLE employees (
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  id text NOT NULL CHECK (char_length(id) BETWEEN 1 AND 128),
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 120),
  job_title text NOT NULL DEFAULT '' CHECK (char_length(job_title) <= 120),
  phone text NOT NULL CHECK (phone ~ '^[0-9]{8,15}$'),
  hourly_rate integer NOT NULL DEFAULT 0 CHECK (hourly_rate >= 0),
  leave_quota smallint NOT NULL DEFAULT 8 CHECK (leave_quota BETWEEN 0 AND 31),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  revision integer NOT NULL DEFAULT 0 CHECK (revision >= 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  deleted_at timestamptz,
  purge_after timestamptz,
  PRIMARY KEY (workspace_id, id),
  UNIQUE (workspace_id, phone),
  CHECK ((status = 'active' AND deleted_at IS NULL) OR status = 'archived')
);

ALTER TABLE workspace_members
  ADD CONSTRAINT workspace_members_employee_fk
  FOREIGN KEY (workspace_id, employee_id)
  REFERENCES employees(workspace_id, id)
  DEFERRABLE INITIALLY DEFERRED;

CREATE TABLE shifts (
  workspace_id text NOT NULL,
  id text NOT NULL CHECK (char_length(id) BETWEEN 1 AND 128),
  employee_id text NOT NULL,
  work_date date NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  note text NOT NULL DEFAULT '' CHECK (char_length(note) <= 1000),
  revision integer NOT NULL DEFAULT 0 CHECK (revision >= 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (workspace_id, id),
  FOREIGN KEY (workspace_id, employee_id) REFERENCES employees(workspace_id, id) ON DELETE RESTRICT,
  CHECK (start_time < end_time)
);

CREATE TABLE leave_selections (
  workspace_id text NOT NULL,
  employee_id text NOT NULL,
  leave_date date NOT NULL,
  status text NOT NULL DEFAULT 'approved' CHECK (status IN ('approved', 'pending', 'rejected')),
  leave_type text NOT NULL DEFAULT '休假' CHECK (char_length(leave_type) BETWEEN 1 AND 60),
  note text NOT NULL DEFAULT '' CHECK (char_length(note) <= 1000),
  revision integer NOT NULL DEFAULT 0 CHECK (revision >= 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (workspace_id, employee_id, leave_date),
  FOREIGN KEY (workspace_id, employee_id) REFERENCES employees(workspace_id, id) ON DELETE CASCADE
);

CREATE TABLE attendance_records (
  workspace_id text NOT NULL,
  id text NOT NULL CHECK (char_length(id) BETWEEN 1 AND 128),
  employee_id text NOT NULL,
  work_date date NOT NULL,
  attendance_type text NOT NULL DEFAULT '出勤' CHECK (char_length(attendance_type) BETWEEN 1 AND 60),
  hours numeric(6,1) NOT NULL DEFAULT 0 CHECK (hours >= 0),
  clock_in timestamptz,
  clock_out timestamptz,
  note text NOT NULL DEFAULT '' CHECK (char_length(note) <= 1000),
  revision integer NOT NULL DEFAULT 0 CHECK (revision >= 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (workspace_id, id),
  FOREIGN KEY (workspace_id, employee_id) REFERENCES employees(workspace_id, id) ON DELETE RESTRICT,
  CHECK (clock_out IS NULL OR clock_in IS NOT NULL),
  CHECK (clock_out IS NULL OR clock_out >= clock_in)
);

CREATE UNIQUE INDEX attendance_one_open_clock_idx
  ON attendance_records (workspace_id, employee_id)
  WHERE clock_in IS NOT NULL AND clock_out IS NULL;

CREATE TABLE payroll_adjustments (
  workspace_id text NOT NULL,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  employee_id text NOT NULL,
  payroll_month text NOT NULL CHECK (payroll_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  amount integer NOT NULL,
  adjustment_date date NOT NULL,
  note text NOT NULL DEFAULT '' CHECK (char_length(note) <= 1000),
  revision integer NOT NULL DEFAULT 0 CHECK (revision >= 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (workspace_id, id),
  FOREIGN KEY (workspace_id, employee_id) REFERENCES employees(workspace_id, id) ON DELETE RESTRICT
);

CREATE TRIGGER employees_touch_updated_at BEFORE UPDATE ON employees
FOR EACH ROW EXECUTE FUNCTION app_private.touch_updated_at();
CREATE TRIGGER shifts_touch_updated_at BEFORE UPDATE ON shifts
FOR EACH ROW EXECUTE FUNCTION app_private.touch_updated_at();
CREATE TRIGGER leave_selections_touch_updated_at BEFORE UPDATE ON leave_selections
FOR EACH ROW EXECUTE FUNCTION app_private.touch_updated_at();
CREATE TRIGGER attendance_records_touch_updated_at BEFORE UPDATE ON attendance_records
FOR EACH ROW EXECUTE FUNCTION app_private.touch_updated_at();
CREATE TRIGGER payroll_adjustments_touch_updated_at BEFORE UPDATE ON payroll_adjustments
FOR EACH ROW EXECUTE FUNCTION app_private.touch_updated_at();

CREATE INDEX shifts_workspace_date_idx ON shifts (workspace_id, work_date, employee_id);
CREATE INDEX leave_selections_workspace_date_idx ON leave_selections (workspace_id, leave_date, employee_id);
CREATE INDEX attendance_workspace_date_idx ON attendance_records (workspace_id, work_date, employee_id);
CREATE INDEX payroll_workspace_month_idx ON payroll_adjustments (workspace_id, payroll_month, employee_id);

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['employees', 'shifts', 'leave_selections', 'attendance_records', 'payroll_adjustments']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format(
      'CREATE POLICY %I ON %I USING (workspace_id = app_private.current_workspace_id()) WITH CHECK (workspace_id = app_private.current_workspace_id())',
      table_name || '_tenant_isolation', table_name
    );
  END LOOP;
END
$$;
