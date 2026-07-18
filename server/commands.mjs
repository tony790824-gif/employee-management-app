import { createHash, randomUUID } from 'node:crypto';
import { ApiError, assert } from './errors.mjs';
import { commandNames, validateCommand, validateIdempotencyKey } from './validation.mjs';
import { withTenantTransaction } from './db.mjs';

function stableJson(value) {
  if (value === undefined) return 'null';
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function requestHash(commandName, input) {
  return createHash('sha256').update(`${commandName}\n${stableJson(input)}`, 'utf8').digest('hex');
}

function allowRoles(member, roles) {
  assert(roles.includes(member.role), 403, 'COMMAND_FORBIDDEN', '目前角色不能執行此操作。');
}

async function createEmployee(context, input, idFactory) {
  allowRoles(context.member, ['boss', 'manager']);
  const employeeId = `e_${idFactory().replaceAll('-', '')}`;
  try {
    const result = await context.client.query(
      `INSERT INTO employees
        (workspace_id, id, name, job_title, phone, hourly_rate, leave_quota)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, name, job_title AS "jobTitle", phone,
                 hourly_rate AS "hourlyRate", leave_quota AS "leaveQuota", status, revision`,
      [context.workspaceId, employeeId, input.name, input.jobTitle, input.phone, input.hourlyRate, input.leaveQuota]
    );
    return { resourceType: 'employee', resourceId: employeeId, body: result.rows[0] };
  } catch (error) {
    if (error.code === '23505') throw new ApiError(409, 'EMPLOYEE_PHONE_EXISTS', '此電話已存在於目前工作區。');
    throw error;
  }
}

async function createShift(context, input, idFactory) {
  allowRoles(context.member, ['boss', 'manager']);
  const shiftId = idFactory();
  try {
    const result = await context.client.query(
      `INSERT INTO shifts
        (workspace_id, id, employee_id, work_date, start_time, end_time, note)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, employee_id AS "employeeId", work_date AS date,
                 to_char(start_time, 'HH24:MI') AS "startTime",
                 to_char(end_time, 'HH24:MI') AS "endTime", note, revision`,
      [context.workspaceId, shiftId, input.employeeId, input.date, input.startTime, input.endTime, input.note]
    );
    return { resourceType: 'shift', resourceId: shiftId, body: result.rows[0] };
  } catch (error) {
    if (error.code === '23503') throw new ApiError(404, 'EMPLOYEE_NOT_FOUND', '找不到員工。');
    throw error;
  }
}

async function replaceLeaveMonth(context, input) {
  const isEmployee = context.member.role === 'employee';
  allowRoles(context.member, ['boss', 'manager', 'employee']);
  const employeeId = isEmployee ? context.member.employee_id : input.employeeId;
  assert(employeeId, 400, 'EMPLOYEE_ID_REQUIRED', '管理者必須指定 employeeId。');
  if (isEmployee && input.employeeId && input.employeeId !== employeeId) {
    throw new ApiError(403, 'EMPLOYEE_SCOPE_VIOLATION', '員工只能修改自己的休假。');
  }
  const employee = await context.client.query(
    'SELECT leave_quota FROM employees WHERE workspace_id = $1 AND id = $2 AND status = $3 FOR SHARE',
    [context.workspaceId, employeeId, 'active']
  );
  assert(employee.rows[0], 404, 'EMPLOYEE_NOT_FOUND', '找不到員工。');
  assert(input.dates.length <= employee.rows[0].leave_quota, 409, 'LEAVE_QUOTA_EXCEEDED', '休假天數超過本月額度。');
  await context.client.query(
    `DELETE FROM leave_selections
      WHERE workspace_id = $1 AND employee_id = $2
        AND leave_date >= ($3 || '-01')::date
        AND leave_date < (($3 || '-01')::date + interval '1 month')`,
    [context.workspaceId, employeeId, input.month]
  );
  if (input.dates.length) {
    await context.client.query(
      `INSERT INTO leave_selections (workspace_id, employee_id, leave_date)
       SELECT $1, $2, value::date FROM unnest($3::text[]) AS value`,
      [context.workspaceId, employeeId, input.dates]
    );
  }
  return {
    resourceType: 'leave_selection',
    resourceId: `${employeeId}:${input.month}`,
    body: { employeeId, month: input.month, dates: input.dates }
  };
}

async function clockIn(context, idFactory, clock) {
  allowRoles(context.member, ['employee']);
  assert(context.member.employee_id, 403, 'EMPLOYEE_SCOPE_MISSING', '登入成員未綁定員工資料。');
  const now = clock();
  const id = idFactory();
  try {
    const result = await context.client.query(
      `INSERT INTO attendance_records
        (workspace_id, id, employee_id, work_date, clock_in, note)
       VALUES ($1, $2, $3, ($4::timestamptz AT TIME ZONE 'Asia/Taipei')::date, $4, $5)
       RETURNING id, employee_id AS "employeeId", work_date AS date, hours,
                 clock_in AS "clockIn", clock_out AS "clockOut", revision`,
      [context.workspaceId, id, context.member.employee_id, now.toISOString(), '員工已打卡上班']
    );
    return { resourceType: 'attendance', resourceId: id, body: result.rows[0] };
  } catch (error) {
    if (error.code === '23505') throw new ApiError(409, 'ATTENDANCE_ALREADY_CLOCKED_IN', '已有尚未下班的打卡紀錄。');
    throw error;
  }
}

async function clockOut(context, clock) {
  allowRoles(context.member, ['employee']);
  assert(context.member.employee_id, 403, 'EMPLOYEE_SCOPE_MISSING', '登入成員未綁定員工資料。');
  const now = clock();
  const result = await context.client.query(
    `UPDATE attendance_records
        SET clock_out = $3,
            hours = GREATEST(0.5, round((extract(epoch FROM ($3::timestamptz - clock_in)) / 3600) * 2) / 2),
            revision = revision + 1,
            note = '員工已打卡下班'
      WHERE workspace_id = $1 AND employee_id = $2
        AND clock_in IS NOT NULL AND clock_out IS NULL
      RETURNING id, employee_id AS "employeeId", work_date AS date, hours,
                clock_in AS "clockIn", clock_out AS "clockOut", revision`,
    [context.workspaceId, context.member.employee_id, now.toISOString()]
  );
  assert(result.rows[0], 409, 'ATTENDANCE_NOT_CLOCKED_IN', '目前沒有進行中的打卡紀錄。');
  return { resourceType: 'attendance', resourceId: result.rows[0].id, body: result.rows[0] };
}

async function approveHours(context, input) {
  allowRoles(context.member, ['boss', 'manager']);
  const result = await context.client.query(
    `UPDATE attendance_records
        SET hours = $3, revision = revision + 1
      WHERE workspace_id = $1 AND id = $2 AND revision = $4
      RETURNING id, employee_id AS "employeeId", work_date AS date, hours,
                clock_in AS "clockIn", clock_out AS "clockOut", revision`,
    [context.workspaceId, input.attendanceId, input.hours, input.baseRevision]
  );
  assert(result.rows[0], 409, 'REVISION_CONFLICT', '出勤紀錄已被其他操作更新。');
  return { resourceType: 'attendance', resourceId: result.rows[0].id, body: result.rows[0] };
}

const handlers = {
  'employees.create': createEmployee,
  'shifts.create': createShift,
  'leaves.replace-month': replaceLeaveMonth,
  'attendance.clock-in': clockIn,
  'attendance.clock-out': clockOut,
  'attendance.approve-hours': approveHours
};

export function createCommandService({ pool, transactionRunner = withTenantTransaction, clock = () => new Date(), idFactory = randomUUID }) {
  return Object.freeze({
    async execute({ principal, commandName, input, idempotencyKey, requestId }) {
      assert(commandNames.includes(commandName), 404, 'COMMAND_NOT_FOUND', '找不到指定 Command。');
      validateIdempotencyKey(idempotencyKey);
      const validated = validateCommand(commandName, input);
      const hash = requestHash(commandName, validated);
      return transactionRunner(pool, principal, async context => {
        const prior = await context.client.query(
          `SELECT command_name, request_hash, response_body
             FROM command_receipts
            WHERE workspace_id = $1 AND idempotency_key = $2
            FOR UPDATE`,
          [context.workspaceId, idempotencyKey]
        );
        if (prior.rows[0]) {
          assert(prior.rows[0].command_name === commandName && prior.rows[0].request_hash === hash, 409, 'IDEMPOTENCY_KEY_REUSED', 'Idempotency-Key 已用於不同請求。');
          return { ...prior.rows[0].response_body, replayed: true };
        }
        const handler = handlers[commandName];
        const result = commandName === 'employees.create' || commandName === 'shifts.create'
          ? await handler(context, validated, idFactory)
          : commandName === 'attendance.clock-in'
            ? await handler(context, idFactory, clock)
            : commandName === 'attendance.clock-out'
              ? await handler(context, clock)
              : await handler(context, validated);
        const response = { ok: true, data: result.body };
        await context.client.query(
          `INSERT INTO command_receipts
            (workspace_id, idempotency_key, command_name, request_hash, response_body, actor_user_id)
           VALUES ($1, $2, $3, $4, $5::jsonb, $6)`,
          [context.workspaceId, idempotencyKey, commandName, hash, JSON.stringify(response), context.userId]
        );
        await context.client.query(
          `INSERT INTO audit_logs
            (workspace_id, actor_user_id, action, resource_type, resource_id, request_id, payload)
           VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
          [context.workspaceId, context.userId, commandName, result.resourceType, result.resourceId, requestId, JSON.stringify({ idempotencyKey })]
        );
        await context.client.query(
          `INSERT INTO outbox_events
            (workspace_id, event_type, aggregate_type, aggregate_id, payload)
           VALUES ($1, $2, $3, $4, $5::jsonb)`,
          [context.workspaceId, `${commandName}.completed`, result.resourceType, result.resourceId, JSON.stringify(result.body)]
        );
        return response;
      });
    },

    async listEmployees({ principal }) {
      return transactionRunner(pool, principal, async context => {
        allowRoles(context.member, ['boss', 'manager']);
        const result = await context.client.query(
          `SELECT id, name, job_title AS "jobTitle", phone,
                  hourly_rate AS "hourlyRate", leave_quota AS "leaveQuota", status, revision
             FROM employees
            WHERE workspace_id = $1 AND status = 'active'
            ORDER BY created_at, id`,
          [context.workspaceId]
        );
        return { ok: true, data: result.rows };
      });
    }
  });
}
