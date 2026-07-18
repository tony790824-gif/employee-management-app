CREATE TABLE command_receipts (
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  idempotency_key text NOT NULL CHECK (char_length(idempotency_key) BETWEEN 8 AND 128),
  command_name text NOT NULL CHECK (char_length(command_name) BETWEEN 1 AND 120),
  request_hash text NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
  response_body jsonb NOT NULL,
  actor_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL DEFAULT (clock_timestamp() + interval '7 days'),
  PRIMARY KEY (workspace_id, idempotency_key)
);

CREATE TABLE audit_logs (
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  action text NOT NULL CHECK (char_length(action) BETWEEN 1 AND 120),
  resource_type text NOT NULL CHECK (char_length(resource_type) BETWEEN 1 AND 120),
  resource_id text NOT NULL CHECK (char_length(resource_id) BETWEEN 1 AND 128),
  request_id text NOT NULL CHECK (char_length(request_id) BETWEEN 8 AND 128),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (workspace_id, id)
);

CREATE TABLE outbox_events (
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  event_type text NOT NULL CHECK (char_length(event_type) BETWEEN 1 AND 120),
  aggregate_type text NOT NULL CHECK (char_length(aggregate_type) BETWEEN 1 AND 120),
  aggregate_id text NOT NULL CHECK (char_length(aggregate_id) BETWEEN 1 AND 128),
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  published_at timestamptz,
  attempts smallint NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  PRIMARY KEY (workspace_id, id)
);

CREATE TABLE snapshot_imports (
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  source_checksum text NOT NULL CHECK (source_checksum ~ '^[a-f0-9]{64}$'),
  source_revision integer NOT NULL CHECK (source_revision >= 0),
  imported_counts jsonb NOT NULL,
  imported_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (workspace_id, source_checksum)
);

CREATE INDEX command_receipts_expiry_idx ON command_receipts (expires_at);
CREATE INDEX audit_logs_workspace_time_idx ON audit_logs (workspace_id, created_at DESC);
CREATE INDEX outbox_pending_idx ON outbox_events (created_at) WHERE published_at IS NULL;

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['command_receipts', 'audit_logs', 'outbox_events', 'snapshot_imports']
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
