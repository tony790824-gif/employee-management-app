import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import fs from 'node:fs';
import vm from 'node:vm';

const backendSource = fs.readFileSync(new URL('../google-sheets-backend.gs', import.meta.url), 'utf8');
const prehash = value => createHash('sha256').update(String(value)).digest('hex');
const workspaceId = 'ws_0123456789abcdef0123456789abcdef';
const pepper = prehash('server-only-recovery-pepper');
const scriptProperties = new Map([
  ['SHIFT_APP_OWNER_PHONE', '0911111111'],
  ['SHIFT_APP_WORKSPACE_ID', workspaceId],
  ['SHIFT_APP_CREDENTIAL_PEPPER', pepper]
]);
const propertyStore = {
  getProperty: key => scriptProperties.get(key) || '',
  setProperty: (key, value) => { scriptProperties.set(key, String(value)); return propertyStore; },
  deleteProperty: key => { scriptProperties.delete(key); return propertyStore; },
  getProperties: () => Object.fromEntries(scriptProperties)
};

const cells = new Map();
const sheet = {
  hidden: true,
  getRange: address => ({
    getValue: () => cells.get(address) || '',
    setValue: value => { cells.set(address, String(value)); return sheet; }
  }),
  hideSheet() { this.hidden = true; }
};
const spreadsheet = {
  getId: () => 'sheet-source-1',
  getSheetByName: () => sheet,
  insertSheet: () => sheet
};

const driveFiles = new Map();
const driveFolders = new Map();
let driveId = 0;
const makeFile = (name, content) => {
  const id = `file-${++driveId}`;
  const file = {
    id, name, content: String(content), sharing: 'PRIVATE', description: '', trashed: false,
    getId: () => id,
    getName: () => name,
    getSharingAccess() { return this.sharing; },
    getBlob() { return { getDataAsString: () => this.content }; },
    setDescription(value) { this.description = String(value); return this; },
    setTrashed(value) { this.trashed = Boolean(value); return this; }
  };
  driveFiles.set(id, file);
  return file;
};
const makeFolder = name => {
  const id = `folder-${++driveId}`;
  const folder = {
    id, name, sharing: 'PRIVATE', files: [], trashed: false,
    getId: () => id,
    getSharingAccess() { return this.sharing; },
    createFile(fileName, content) { const file = makeFile(fileName, content); this.files.push(file.id); return file; },
    setTrashed(value) { this.trashed = Boolean(value); return this; }
  };
  driveFolders.set(id, folder);
  return folder;
};

let uuid = 0;
const operationalLogs = [];
const context = vm.createContext({
  console: { log: value => operationalLogs.push(String(value)) }, Date, JSON, Math, Number, Object, Array, Set, String, RegExp,
  PropertiesService: { getScriptProperties: () => propertyStore },
  LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  SpreadsheetApp: { getActiveSpreadsheet: () => spreadsheet },
  DriveApp: {
    Access: { PRIVATE: 'PRIVATE' },
    createFolder: name => makeFolder(name),
    getFolderById: id => { if (!driveFolders.has(id)) throw new Error('missing folder'); return driveFolders.get(id); },
    getFileById: id => { if (!driveFiles.has(id)) throw new Error('missing file'); return driveFiles.get(id); }
  },
  MimeType: { PLAIN_TEXT: 'text/plain' },
  Utilities: {
    DigestAlgorithm: { SHA_256: 'SHA_256' },
    Charset: { UTF_8: 'UTF_8' },
    computeDigest: (_algorithm, value) => [...createHash('sha256').update(String(value)).digest()],
    computeHmacSha256Signature: (value, key) => [...createHmac('sha256', String(key)).update(String(value)).digest()],
    formatDate: (_date, _zone, pattern) => pattern === 'yyyy-MM' ? '2026-07' : '2026-07-15',
    getUuid: () => String(++uuid).padStart(32, '0')
  },
  HtmlService: {
    XFrameOptionsMode: { ALLOWALL: 'ALLOWALL' },
    createHtmlOutput: () => ({ setTitle() { return this; }, setXFrameOptionsMode() { return this; } })
  }
});
vm.runInContext(backendSource, context, { filename: 'google-sheets-backend.gs' });

const baseData = () => ({
  workspace: { id: workspaceId }, sync: { revision: 7 },
  employees: [{ id: 'employee-1', name: '員工', phone: '0922222222', pinHash: prehash('123456') }],
  shifts: [], attendance: [], leaves: {}, leaveRequests: {}, leaveHistory: [],
  removedEmployees: [], access: { bossPhone: '0911111111', bossPinHash: prehash('654321') }, payrollAdjustments: {}
});
const writeSnapshot = data => cells.set('A1', JSON.stringify(data));
const readSnapshot = () => JSON.parse(cells.get('A1'));
const expectCode = (operation, code) => {
  assert.throws(operation, error => error && error.code === code, `預期錯誤代碼 ${code}`);
};
const resignPackage = recoveryPackage => {
  const next = structuredClone(recoveryPackage);
  delete next.checksum;
  next.checksum = context.sha256_(JSON.stringify(next));
  return next;
};

writeSnapshot(baseData());
const backup = context.createOperationalBackup();
assert.equal(backup.ok, true);
assert.match(backup.fileId, /^file-/);
assert.equal(scriptProperties.get('SHIFT_APP_LAST_BACKUP_FILE_ID'), backup.fileId);
assert.equal(driveFiles.get(backup.fileId).sharing, 'PRIVATE');
assert.equal(driveFolders.get(scriptProperties.get('SHIFT_APP_RECOVERY_FOLDER_ID')).sharing, 'PRIVATE');

const savedPackage = JSON.parse(driveFiles.get(backup.fileId).content);
assert.equal(savedPackage.format, 'banke-recovery-v1');
assert.equal(savedPackage.workspaceId, workspaceId);
assert.equal(savedPackage.operationalProperties.SHIFT_APP_CREDENTIAL_PEPPER, pepper, '復原包必須包含 credential pepper');
assert.equal(Object.keys(savedPackage.operationalProperties).some(key => key.startsWith('SHIFT_APP_SESSION_')), false, '不得備份 session');
assert.match(savedPackage.checksum, /^[a-f0-9]{64}$/);

const verified = context.verifyLatestOperationalBackup();
assert.equal(verified.fileId, backup.fileId);
assert.equal(verified.restoreConfirmation, backup.restoreConfirmation);
assert.doesNotMatch(operationalLogs.join('\n'), /RESTORE:|server-only-recovery-pepper/i, '維運日誌不得包含復原確認值或 pepper');
assert.equal(context.runReleaseReadinessCheck().ok, true, '最新且相同 revision 的私人備份應通過發布檢查');

const readinessFile = driveFiles.get(backup.fileId);
const readinessContent = readinessFile.content;
const stalePackage = JSON.parse(readinessContent);
stalePackage.createdAt = new Date(Date.now() - (25 * 60 * 60 * 1000)).toISOString();
readinessFile.content = JSON.stringify(resignPackage(stalePackage));
expectCode(() => context.runReleaseReadinessCheck(), 'RELEASE_BACKUP_STALE');

const foreignSourcePackage = JSON.parse(readinessContent);
foreignSourcePackage.sourceSpreadsheetId = 'another-spreadsheet';
readinessFile.content = JSON.stringify(resignPackage(foreignSourcePackage));
expectCode(() => context.runReleaseReadinessCheck(), 'RELEASE_BACKUP_SOURCE_MISMATCH');
readinessFile.content = readinessContent;

const changed = baseData();
changed.sync.revision = 8;
changed.employees[0].name = '已修改';
writeSnapshot(changed);
expectCode(() => context.runReleaseReadinessCheck(), 'RELEASE_BACKUP_OUTDATED');

writeSnapshot(baseData());
const restoreSource = context.createOperationalBackup();
const restorePackage = JSON.parse(driveFiles.get(restoreSource.fileId).content);
const changedBeforeRestore = baseData();
changedBeforeRestore.sync.revision = 9;
changedBeforeRestore.employees[0].name = '錯誤資料';
writeSnapshot(changedBeforeRestore);
scriptProperties.set('SHIFT_APP_SESSION_test', '{}');
scriptProperties.set('SHIFT_APP_AUTH_THROTTLE_test', '{}');

scriptProperties.set('SHIFT_APP_RESTORE_CONFIRMATION', 'wrong');
expectCode(() => context.restoreLatestOperationalBackup(), 'RESTORE_CONFIRMATION_REQUIRED');
assert.equal(readSnapshot().employees[0].name, '錯誤資料', '錯誤確認值不得改動資料');

scriptProperties.set('SHIFT_APP_RESTORE_CONFIRMATION', restoreSource.restoreConfirmation);
const restored = context.restoreLatestOperationalBackup();
assert.equal(restored.ok, true);
assert.match(restored.safetyBackupFileId, /^file-/, '非空資料復原前必須建立 safety backup');
assert.equal(readSnapshot().employees[0].name, '員工');
assert.equal(readSnapshot().sync.revision, 7);
assert.equal(scriptProperties.has('SHIFT_APP_SESSION_test'), false, '復原後必須撤銷舊 session');
assert.equal(scriptProperties.has('SHIFT_APP_AUTH_THROTTLE_test'), false);
assert.equal(scriptProperties.has('SHIFT_APP_RESTORE_CONFIRMATION'), false, '確認值必須一次性使用');

const rollbackSnapshot = baseData();
rollbackSnapshot.sync.revision = 10;
rollbackSnapshot.employees[0].name = '回滾前資料';
writeSnapshot(rollbackSnapshot);
scriptProperties.set('SHIFT_APP_RESTORE_CONFIRMATION', restoreSource.restoreConfirmation);
const originalAssertRestoredState = context.assertRestoredState_;
context.assertRestoredState_ = () => { throw new Error('simulated post-write verification failure'); };
expectCode(() => context.restoreLatestOperationalBackup(), 'RESTORE_ROLLED_BACK');
context.assertRestoredState_ = originalAssertRestoredState;
assert.equal(readSnapshot().sync.revision, 10, '復原驗證失敗後必須還原操作前 revision');
assert.equal(readSnapshot().employees[0].name, '回滾前資料', '復原驗證失敗後不得留下半套資料');

const rollbackFailureSnapshot = baseData();
rollbackFailureSnapshot.sync.revision = 11;
rollbackFailureSnapshot.employees[0].name = '回滾失敗前資料';
writeSnapshot(rollbackFailureSnapshot);
scriptProperties.set('SHIFT_APP_RESTORE_CONFIRMATION', restoreSource.restoreConfirmation);
const originalWriteData = context.writeData_;
let restoreWriteCount = 0;
context.writeData_ = data => {
  restoreWriteCount += 1;
  if (restoreWriteCount === 1) return originalWriteData(data);
  throw new Error('simulated rollback storage failure');
};
context.assertRestoredState_ = () => { throw new Error('simulated post-write verification failure'); };
assert.throws(
  () => context.restoreLatestOperationalBackup(),
  error => error && error.code === 'RESTORE_ROLLBACK_FAILED' && /^file-/.test(error.safetyBackupFileId),
  '回滾本身失敗時必須回報獨立錯誤碼與 safety backup'
);
context.writeData_ = originalWriteData;
context.assertRestoredState_ = originalAssertRestoredState;
writeSnapshot(rollbackFailureSnapshot);

const tamperedFile = driveFiles.get(restoreSource.fileId);
const originalContent = tamperedFile.content;
const tamperedPackage = JSON.parse(originalContent);
tamperedPackage.snapshot.employees[0].name = '遭竄改';
tamperedFile.content = JSON.stringify(tamperedPackage);
expectCode(() => context.verifyLatestOperationalBackup(), 'BACKUP_CHECKSUM_INVALID');
tamperedFile.content = originalContent;

tamperedFile.sharing = 'ANYONE';
expectCode(() => context.verifyLatestOperationalBackup(), 'BACKUP_NOT_PRIVATE');
tamperedFile.sharing = 'PRIVATE';

const forbiddenPropertyPackage = JSON.parse(originalContent);
forbiddenPropertyPackage.operationalProperties.SHIFT_APP_SESSION_attack = 'secret';
delete forbiddenPropertyPackage.checksum;
forbiddenPropertyPackage.checksum = context.sha256_(JSON.stringify(forbiddenPropertyPackage));
tamperedFile.content = JSON.stringify(forbiddenPropertyPackage);
expectCode(() => context.verifyLatestOperationalBackup(), 'BACKUP_FORMAT_INVALID');
tamperedFile.content = originalContent;

const otherWorkspace = baseData();
otherWorkspace.workspace.id = 'ws_ffffffffffffffffffffffffffffffff';
writeSnapshot(otherWorkspace);
scriptProperties.set('SHIFT_APP_RESTORE_CONFIRMATION', restoreSource.restoreConfirmation);
expectCode(() => context.restoreLatestOperationalBackup(), 'BACKUP_WORKSPACE_MISMATCH');

writeSnapshot(baseData());
scriptProperties.set('SHIFT_APP_WORKSPACE_ID', workspaceId);
scriptProperties.set('SHIFT_APP_CREDENTIAL_PEPPER', 'corrupted');
scriptProperties.set('SHIFT_APP_RESTORE_CONFIRMATION', restoreSource.restoreConfirmation);
assert.equal(context.restoreLatestOperationalBackup().ok, true, '復原流程必須能修復損壞的 pepper');
assert.equal(scriptProperties.get('SHIFT_APP_CREDENTIAL_PEPPER'), pepper);

cells.set('A1', '');
scriptProperties.delete('SHIFT_APP_WORKSPACE_ID');
scriptProperties.delete('SHIFT_APP_OWNER_PHONE');
scriptProperties.delete('SHIFT_APP_CREDENTIAL_PEPPER');
scriptProperties.set('SHIFT_APP_RESTORE_CONFIRMATION', restoreSource.restoreConfirmation);
const disasterRestore = context.restoreLatestOperationalBackup();
assert.equal(disasterRestore.ok, true, '空白新資料表必須可從私人復原包重建');
assert.equal(disasterRestore.safetyBackupFileId, '', '空白目標不應建立無意義的 safety backup');
assert.equal(scriptProperties.get('SHIFT_APP_WORKSPACE_ID'), workspaceId);
assert.equal(scriptProperties.get('SHIFT_APP_CREDENTIAL_PEPPER'), pepper);

const originalCreateFolder = context.DriveApp.createFolder;
scriptProperties.delete('SHIFT_APP_RECOVERY_FOLDER_ID');
let rejectedFolder;
context.DriveApp.createFolder = name => {
  rejectedFolder = makeFolder(name);
  rejectedFolder.sharing = 'ANYONE';
  return rejectedFolder;
};
expectCode(() => context.createOperationalBackup(), 'BACKUP_NOT_PRIVATE');
assert.equal(rejectedFolder.trashed, true, '非私人新資料夾必須立即丟棄');
assert.equal(scriptProperties.has('SHIFT_APP_RECOVERY_FOLDER_ID'), false, '失敗資料夾不得留在設定中');
context.DriveApp.createFolder = originalCreateFolder;

const privateFolder = context.DriveApp.createFolder('replacement');
scriptProperties.set('SHIFT_APP_RECOVERY_FOLDER_ID', privateFolder.getId());
const originalCreateFile = privateFolder.createFile;
let rejectedFile;
privateFolder.createFile = (name, content) => {
  rejectedFile = makeFile(name, content);
  rejectedFile.sharing = 'ANYONE';
  return rejectedFile;
};
expectCode(() => context.createOperationalBackup(), 'BACKUP_NOT_PRIVATE');
assert.equal(rejectedFile.trashed, true, '非私人備份檔案必須立即丟棄');
privateFolder.createFile = originalCreateFile;

cells.set('A1', '{broken-json');
expectCode(() => context.createOperationalBackup(), 'BACKUP_SOURCE_INVALID');

assert.doesNotMatch(backendSource.slice(0, backendSource.indexOf('function createOperationalBackup')), /restoreLatestOperationalBackup|runReleaseReadinessCheck/, '維運函式不應接入 Web App API dispatch');
console.log('P0 backup, restore and release readiness tests passed.');
