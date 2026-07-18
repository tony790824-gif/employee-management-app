import { readFile } from 'node:fs/promises';
import process from 'node:process';
import pg from 'pg';
import { databaseConfig } from './migrate.mjs';
import { mapSnapshot } from './snapshot-mapper.mjs';

const { Client } = pg;

function argumentsFrom(argv) {
  const values = Object.fromEntries(argv.slice(2).filter(value => value.startsWith('--')).map(value => {
    const [key, ...parts] = value.slice(2).split('=');
    return [key, parts.join('=') || true];
  }));
  if (!values.file || !values['workspace-id']) throw new Error('需要 --file 與 --workspace-id。');
  return {
    file: String(values.file),
    workspaceId: String(values['workspace-id']),
    organizationName: String(values['organization-name'] || '班客邦客戶'),
    workspaceName: values['workspace-name'] ? String(values['workspace-name']) : null,
    apply: values.apply === true
  };
}

async function insertRows(client, mapped, args) {
  // FORCE RLS applies to imports as well. Bind the tenant before touching any
  // tenant table so a replay check cannot escape or accidentally miss RLS.
  await client.query("SELECT set_config('app.current_workspace_id', $1, true)", [mapped.workspaceId]);
  const existing = await client.query(
    'SELECT imported_counts FROM snapshot_imports WHERE workspace_id = $1 AND source_checksum = $2',
    [mapped.workspaceId, mapped.checksum]
  );
  if (existing.rows[0]) return { replayed: true, counts: existing.rows[0].imported_counts };
  const otherImport = await client.query('SELECT 1 FROM snapshot_imports WHERE workspace_id = $1 LIMIT 1', [mapped.workspaceId]);
  if (otherImport.rows[0]) throw new Error('此工作區已有不同 Snapshot 匯入紀錄；禁止以全量 Snapshot 覆寫。');
  const organization = await client.query('INSERT INTO organizations (name) VALUES ($1) RETURNING id', [args.organizationName]);
  await client.query(
    'INSERT INTO workspaces (id, organization_id, name) VALUES ($1, $2, $3)',
    [mapped.workspaceId, organization.rows[0].id, args.workspaceName || mapped.workspaceName]
  );
  const allEmployees = [...mapped.employees, ...mapped.archivedEmployees];
  for (const employee of allEmployees) {
    await client.query(
      `INSERT INTO employees
        (workspace_id, id, name, job_title, phone, hourly_rate, leave_quota, status, deleted_at, purge_after)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [mapped.workspaceId, employee.id, employee.name, employee.jobTitle, employee.phone, employee.hourlyRate, employee.leaveQuota, employee.status, employee.deletedAt, employee.purgeAfter]
    );
    const user = await client.query(
      `INSERT INTO users (phone) VALUES ($1)
       ON CONFLICT (phone) DO UPDATE SET updated_at = clock_timestamp()
       RETURNING id`,
      [employee.phone]
    );
    await client.query(
      `INSERT INTO workspace_members (workspace_id, user_id, role, employee_id, auth_status)
       VALUES ($1,$2,'employee',$3,'reenrollment_required')`,
      [mapped.workspaceId, user.rows[0].id, employee.id]
    );
  }
  if (mapped.bossPhone) {
    const user = await client.query(
      `INSERT INTO users (phone) VALUES ($1)
       ON CONFLICT (phone) DO UPDATE SET updated_at = clock_timestamp()
       RETURNING id`,
      [mapped.bossPhone]
    );
    await client.query(
      `INSERT INTO workspace_members (workspace_id, user_id, role, auth_status)
       VALUES ($1,$2,'boss','reenrollment_required')`,
      [mapped.workspaceId, user.rows[0].id]
    );
  }
  for (const shift of mapped.shifts) {
    await client.query(
      `INSERT INTO shifts (workspace_id,id,employee_id,work_date,start_time,end_time,note)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [mapped.workspaceId, shift.id, shift.employeeId, shift.date, shift.start, shift.end, shift.note]
    );
  }
  for (const row of mapped.attendance) {
    await client.query(
      `INSERT INTO attendance_records
        (workspace_id,id,employee_id,work_date,attendance_type,hours,clock_in,clock_out,note)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [mapped.workspaceId, row.id, row.employeeId, row.date, row.type, row.hours, row.clockIn, row.clockOut, row.note]
    );
  }
  for (const row of mapped.leaves) {
    await client.query(
      'INSERT INTO leave_selections (workspace_id,employee_id,leave_date) VALUES ($1,$2,$3)',
      [mapped.workspaceId, row.employeeId, row.date]
    );
  }
  for (const row of mapped.payrollAdjustments) {
    await client.query(
      `INSERT INTO payroll_adjustments
        (workspace_id,employee_id,payroll_month,amount,adjustment_date,note)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [mapped.workspaceId, row.employeeId, row.month, row.amount, row.date, row.note]
    );
  }
  const counts = {
    employees: mapped.employees.length,
    archivedEmployees: mapped.archivedEmployees.length,
    shifts: mapped.shifts.length,
    attendance: mapped.attendance.length,
    leaves: mapped.leaves.length,
    payrollAdjustments: mapped.payrollAdjustments.length
  };
  await client.query(
    `INSERT INTO snapshot_imports (workspace_id,source_checksum,source_revision,imported_counts)
     VALUES ($1,$2,$3,$4::jsonb)`,
    [mapped.workspaceId, mapped.checksum, mapped.revision, JSON.stringify(counts)]
  );
  return { replayed: false, counts };
}

async function main() {
  const args = argumentsFrom(process.argv);
  const raw = await readFile(args.file, 'utf8');
  const mapped = mapSnapshot(JSON.parse(raw), { workspaceId: args.workspaceId });
  if (!args.apply) {
    process.stdout.write(`${JSON.stringify({ mode: 'dry-run', checksum: mapped.checksum, warnings: mapped.warnings, counts: {
      employees: mapped.employees.length,
      archivedEmployees: mapped.archivedEmployees.length,
      shifts: mapped.shifts.length,
      attendance: mapped.attendance.length,
      leaves: mapped.leaves.length,
      payrollAdjustments: mapped.payrollAdjustments.length
    } }, null, 2)}\n`);
    return;
  }
  const config = databaseConfig();
  const client = new Client({ connectionString: config.connectionString, ssl: config.ssl });
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`banke-import:${mapped.workspaceId}`]);
    const result = await insertRows(client, mapped, args);
    await client.query('COMMIT');
    process.stdout.write(`${JSON.stringify({ mode: 'apply', workspaceId: mapped.workspaceId, checksum: mapped.checksum, ...result }, null, 2)}\n`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
