import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const employeeLayout = await readFile('employee-layout.js', 'utf8');
const bossHours = await readFile('boss-hours.js', 'utf8');
const app = await readFile('app.js', 'utf8');

assert.match(
  app,
  /stateStore\.read\(\)/,
  'APP 啟動必須經過共用 state store'
);
assert.doesNotMatch(app, /const sample\s*=/, '正式 APP 不得內建範例員工資料');

assert.match(
  employeeLayout,
  /observer\.observe\(document\.body,\s*\{\s*attributes:\s*true,\s*attributeFilter:\s*\['class'\]\s*\}\)/,
  '員工版面只能監聽 body class'
);
assert.doesNotMatch(
  employeeLayout,
  /observer\.observe\(document\.body,[^;]*(?:childList|subtree)/,
  '員工版面不可重新監聽會被自己搬移的子節點'
);
assert.match(
  bossHours,
  /observer\.observe\(attendanceBody,\s*\{\s*childList:\s*true\s*\}\)/,
  '工時增強只能監聽 attendance tbody 的直接列'
);
assert.doesNotMatch(
  bossHours,
  /observer\.observe\(document\.body/,
  '工時增強不可監聽整個 document body'
);

console.log('P0 介面穩定性防回歸檢查通過。');
