-- HISTORICAL DESIGN REFERENCE ONLY.
-- Executable schema source of truth: ../database/migrations/*.up.sql
-- See ../database/README.md and POSTGRESQL_MIGRATION.md before applying migrations.
-- 班客邦正式資料庫 Schema (PostgreSQL)
-- 版本：2026-07-17.1
-- 核心原則：多租戶隔離 (Workspace ID)、正規化、Audit Log、Soft Delete

-- 1. 核心與身分 (Core & Auth)

CREATE TABLE IF NOT EXISTS organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS workspaces (
    id TEXT PRIMARY KEY, -- 格式：ws_[a-f0-9]{32}
    organization_id UUID NOT NULL REFERENCES organizations(id),
    name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active', -- active, suspended, deleted
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone TEXT NOT NULL UNIQUE, -- 正規化格式：純數字
    status TEXT NOT NULL DEFAULT 'active', -- active, suspended, deleted
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_credentials (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    scheme TEXT NOT NULL, -- e.g., 'argon2id'
    salt TEXT NOT NULL,
    iterations INTEGER NOT NULL,
    memory_cost INTEGER, -- Argon2id
    parallelism INTEGER, -- Argon2id
    hash TEXT NOT NULL,
    pepper_version INTEGER NOT NULL DEFAULT 1,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS workspace_members (
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL, -- boss, manager, employee
    status TEXT NOT NULL DEFAULT 'active', -- active, invited, suspended
    employee_id TEXT, -- 對應 PWA 中的 employeeId，格式 e_...
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (workspace_id, user_id)
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    device_info JSONB,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    revoked_at TIMESTAMPTZ
);

-- 2. 業務資料 (Business Data)

CREATE TABLE IF NOT EXISTS employees (
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    id TEXT NOT NULL, -- 格式 e_...
    name TEXT NOT NULL,
    job_title TEXT,
    phone TEXT NOT NULL,
    rate INTEGER NOT NULL DEFAULT 0, -- 時薪（整數）
    leave_quota INTEGER NOT NULL DEFAULT 8, -- 月休額度
    status TEXT NOT NULL DEFAULT 'active', -- active, archived
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ, -- Soft delete
    PRIMARY KEY (workspace_id, id)
);

CREATE TABLE IF NOT EXISTS shifts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    employee_id TEXT NOT NULL,
    date DATE NOT NULL,
    start_time TIME NOT NULL, -- HH:mm
    end_time TIME NOT NULL, -- HH:mm
    note TEXT,
    revision INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    FOREIGN KEY (workspace_id, employee_id) REFERENCES employees(workspace_id, id)
);

CREATE TABLE IF NOT EXISTS leaves (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    employee_id TEXT NOT NULL,
    date DATE NOT NULL,
    status TEXT NOT NULL DEFAULT 'approved', -- approved, pending, rejected
    type TEXT NOT NULL DEFAULT '休假',
    requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    approved_at TIMESTAMPTZ,
    note TEXT,
    FOREIGN KEY (workspace_id, employee_id) REFERENCES employees(workspace_id, id),
    UNIQUE (workspace_id, employee_id, date)
);

CREATE TABLE IF NOT EXISTS attendance_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    employee_id TEXT NOT NULL,
    date DATE NOT NULL,
    type TEXT NOT NULL DEFAULT '出勤',
    hours NUMERIC(4, 1) NOT NULL DEFAULT 0, -- 支援 0.5 單位
    clock_in TIMESTAMPTZ,
    clock_out TIMESTAMPTZ,
    note TEXT,
    revision INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    FOREIGN KEY (workspace_id, employee_id) REFERENCES employees(workspace_id, id)
);

CREATE TABLE IF NOT EXISTS payroll_adjustments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    employee_id TEXT NOT NULL,
    month CHAR(7) NOT NULL, -- YYYY-MM
    amount INTEGER NOT NULL, -- 加扣金額
    date DATE NOT NULL,
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    FOREIGN KEY (workspace_id, employee_id) REFERENCES employees(workspace_id, id)
);

-- 3. 稽核與版本 (Audit & Versioning)

CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action TEXT NOT NULL, -- CREATE, UPDATE, DELETE, LOGIN, LOGOUT
    resource_type TEXT NOT NULL, -- e.g., shift, employee
    resource_id TEXT NOT NULL,
    payload JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. 索引優化 (Indexes)

CREATE INDEX idx_shifts_workspace_date ON shifts (workspace_id, date);
CREATE INDEX idx_attendance_workspace_date ON attendance_records (workspace_id, date);
CREATE INDEX idx_leaves_workspace_date ON leaves (workspace_id, date);
CREATE INDEX idx_payroll_workspace_month ON payroll_adjustments (workspace_id, month);
CREATE INDEX idx_audit_workspace_created ON audit_logs (workspace_id, created_at);

-- 5. 多租戶安全性 (Row Level Security - 範例概念)
-- ALTER TABLE shifts ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY workspace_isolation_policy ON shifts
--     USING (workspace_id = current_setting('app.current_workspace_id'));
