import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const employeeLayout = await readFile('employee-layout.js', 'utf8');
const employeeLayoutCss = await readFile('employee-layout.css', 'utf8');
const bossHours = await readFile('boss-hours.js', 'utf8');
const app = await readFile('app.js', 'utf8');
const index = await readFile('index.html', 'utf8');

assert.match(
  app,
  /stateStore\.read\(\)/,
  'APP 啟動必須經過共用 state store'
);
assert.doesNotMatch(app, /const sample\s*=/, '正式 APP 不得內建範例員工資料');
assert.match(
  index,
  /<th>員工<\/th><th>時薪<\/th><th>排班時數<\/th><th>實際工時<\/th><th>預估薪資<\/th><th>實際薪資<\/th>/,
  '薪資試算表必須明確呈現排班、實際工時及兩種薪資'
);
assert.match(
  app,
  /const estimated=p\[i\],recorded=a\[i\]/,
  '薪資明細必須同時使用排班與出勤計算結果'
);
assert.match(
  app,
  /dom\.cell\(`\$\{estimated\.h\} 小時`\).*dom\.cell\(`\$\{recorded\.h\} 小時`\).*money\(estimated\.pay\).*money\(recorded\.pay\)/,
  '薪資明細列不得遺漏排班時數、實際工時、預估薪資或實際薪資'
);
assert.match(
  app,
  /dom\.emptyRow\(6,'尚無資料'\)/,
  '薪資空資料列欄數必須與六欄表頭一致'
);

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
assert.match(
  bossHours,
  /const revision = Number\(target\.revision\)/,
  '老闆核定工時必須使用該筆出勤紀錄的 revision'
);
assert.doesNotMatch(
  bossHours,
  /const revision = Number\(before\.sync\?\.revision\)/,
  '老闆核定工時不得使用整份快照的固定 revision'
);
assert.match(
  employeeLayoutCss,
  /#schedule \.calendar-grid\{grid-template-columns:repeat\(7,minmax\(0,1fr\)\);min-width:0\}/,
  '手機日曆七欄必須允許縮小，避免姓名撐開頁面'
);
assert.match(
  employeeLayoutCss,
  /#schedule \.calendar-day\{min-width:0\}/,
  '手機日曆日期格不可使用內容最小寬度造成橫向溢位'
);

console.log('P0 介面穩定性防回歸檢查通過。');
