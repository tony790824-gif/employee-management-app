import assert from 'node:assert/strict';
import { mapSnapshot } from '../database/snapshot-mapper.mjs';

const workspaceId = 'ws_0123456789abcdef0123456789abcdef';
const snapshot = () => ({
  workspace: { id: workspaceId, name: '測試門市' },
  sync: { revision: 12 },
  access: { bossPhone: '0911111111', bossPinHash: 'not-imported' },
  employees: [{ id: 'employee-1', name: '王小明', phone: '0922222222', role: '店員', rate: 200, leaveQuota: 8 }],
  shifts: [{ id: 'shift-1', employeeId: 'employee-1', date: '2026-07-20', start: '09:00', end: '18:00' }],
  attendance: [{
    id: 'attendance-1', employeeId: 'employee-1', date: '2026-07-20', type: '出勤', hours: 8,
    clockIn: '2026-07-20T01:00:00.000Z', clockOut: '2026-07-20T09:00:00.000Z'
  }],
  leaves: { 'employee-1-2026-07': ['2026-07-22'] },
  payrollAdjustments: {
    'employee-1-2026-07': [{ amount: -100, date: '2026-07-20T00:00:00.000Z', note: '既有扣款' }]
  },
  removedEmployees: []
});

const mapped = mapSnapshot(snapshot(), { workspaceId });
assert.equal(mapped.workspaceId, workspaceId);
assert.equal(mapped.employees.length, 1);
assert.equal(mapped.shifts.length, 1);
assert.equal(mapped.attendance.length, 1);
assert.equal(mapped.leaves.length, 1);
assert.equal(mapped.payrollAdjustments[0].amount, -100, 'existing signed adjustment must remain migratable');
assert.match(mapped.checksum, /^[a-f0-9]{64}$/);
assert.ok(mapped.warnings.some(value => /PIN|Identity Provider/i.test(value)));
assert.equal(Object.hasOwn(mapped, 'bossPinHash'), false, 'legacy credentials must never be exported for import');

const missingOptional = snapshot();
delete missingOptional.sync;
delete missingOptional.payrollAdjustments;
delete missingOptional.removedEmployees;
assert.equal(mapSnapshot(missingOptional, { workspaceId }).payrollAdjustments.length, 0);
const emptyLegacyAdjustments = snapshot();
emptyLegacyAdjustments.payrollAdjustments = [];
assert.equal(mapSnapshot(emptyLegacyAdjustments, { workspaceId }).payrollAdjustments.length, 0);

const invalidPhone = snapshot();
invalidPhone.employees[0].phone = '0922-222-222';
assert.throws(() => mapSnapshot(invalidPhone, { workspaceId }), error => error.code === 'SNAPSHOT_INVALID');
const invalidDate = snapshot();
invalidDate.shifts[0].date = '2026-02-30';
assert.throws(() => mapSnapshot(invalidDate, { workspaceId }), error => error.code === 'SNAPSHOT_INVALID');
const looseTimestamp = snapshot();
looseTimestamp.attendance[0].clockIn = '2026-07-20 01:00:00';
assert.throws(() => mapSnapshot(looseTimestamp, { workspaceId }), error => error.code === 'SNAPSHOT_INVALID');
const orphanShift = snapshot();
orphanShift.shifts[0].employeeId = 'missing';
assert.throws(() => mapSnapshot(orphanShift, { workspaceId }), error => error.code === 'SNAPSHOT_INVALID');
const duplicatePhone = snapshot();
duplicatePhone.employees.push({ id: 'employee-2', name: '重複', phone: '0922222222', rate: 0 });
assert.throws(() => mapSnapshot(duplicatePhone, { workspaceId }), error => error.code === 'SNAPSHOT_INVALID');
const reordered = snapshot();
reordered.workspace = { name: reordered.workspace.name, id: reordered.workspace.id };
assert.equal(mapSnapshot(reordered, { workspaceId }).checksum, mapped.checksum, 'checksum must not depend on object key order');

console.log('PostgreSQL snapshot migration mapping and compatibility passed');
