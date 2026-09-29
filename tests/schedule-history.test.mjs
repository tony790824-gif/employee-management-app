import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source=await readFile('app.js','utf8');
const make=(tag='',options={},children=[])=>({tag,text:options.text||'',children:[...children],
  append(...items){this.children.push(...items);},addEventListener(){}});
const nodes=new Map();
const active={id:'active',name:'Active',role:'Staff',rate:200};
const inactive={id:'inactive',name:'Inactive',role:'Staff',rate:200,status:'inactive'};
const departed={...inactive,id:'departed',name:'Departed',status:'departed'};
const data={employees:[active],shifts:[
  {employeeId:'active',date:'2026-09-20',start:'09:00',end:'17:00'},
  {employeeId:'inactive',date:'2026-09-21',start:'22:00',end:'07:00'},
  {employeeId:'departed',date:'2026-09-22',start:'10:00',end:'12:00'},
  {employeeId:'inactive',date:'2026-09-30',start:'09:00',end:'17:00'},
  {employeeId:'inactive',date:'2026-10-01',start:'09:00',end:'17:00'}
],attendance:[]};
const hours=s=>{const n=t=>Number(t.slice(0,2))+Number(t.slice(3))/60;return (n(s.end)-n(s.start)+24)%24;};
const window={shiftEnvironment:{dataBackend:'postgres'},
  shiftEmployeeAdministration:{historicalEmployees:()=>[inactive,departed,{...inactive,id:'no-shifts'}]},
  BankeShiftTime:{label:s=>`${s.start} → ${s.end<s.start?'次日 ':''}${s.end}`}};
const context=vm.createContext({data,window,hours,month:'2026-09',Set,
  Date:class extends Date{constructor(...args){super(...(args.length?args:['2026-09-29T04:00:00Z']));}},
  Intl,money:n=>`$${n}`,actual:()=>({h:0,pay:0}),
  planned:e=>{const shifts=data.shifts.filter(s=>s.employeeId===e.id&&s.date.startsWith(context.month));const h=shifts.reduce((n,s)=>n+hours(s),0);return{shifts,h,pay:h*e.rate};},
  $:selector=>{if(!nodes.has(selector))nodes.set(selector,make());return nodes.get(selector);},
  document:{body:{classList:{contains:()=>false}}},
  dom:{element:make,cell:text=>make('td',{text}),option:(value,text)=>({...make('option',{text}),value}),
    replace:(node,...items)=>{node.children=items;},emptyRow:(_count,text)=>make('tr',{text})}});
vm.runInContext(source.slice(source.indexOf('function scheduleEmployeesForMonth('),source.indexOf("document.addEventListener('employee-history-refreshed'")),context);
vm.runInContext(source.slice(source.indexOf('function fillEmployees('),source.indexOf('function renderCalendar(')),context);
const snapshot=JSON.stringify(data);
context.renderSchedulePanel();
const text=node=>[node.text,...node.children.map(text)].join(' ');
assert.equal(nodes.get('#scheduleBody').children.length,3);
assert.match(text(nodes.get('#scheduleBody')),/Inactive（停用・歷史）/);
assert.match(text(nodes.get('#scheduleBody')),/Departed（離職・歷史）/);
assert.match(text(nodes.get('#scheduleBody')),/22:00 → 次日 07:00/);
assert.doesNotMatch(text(nodes.get('#scheduleBody')),/30日/,'Future shifts of inactive employees must not enter history');
assert.match(text(nodes.get('#stats')),/排班時數 19 小時/,'8 active + 9 inactive + 2 departed');
assert.match(text(nodes.get('#stats')),/員工人數 1 位/,'Active headcount must remain active-only');
assert.equal(nodes.get('#scheduleBody').children[1].children[5].children.some(n=>n.tag==='button'),false,'Inactive history must be read-only');
const select=make();context.fillEmployees(select);
assert.deepEqual(select.children.map(n=>n.value),['active'],'New shifts/general selectors remain active-only');
context.month='2026-10';context.renderSchedulePanel();
assert.equal(nodes.get('#scheduleBody').children.length,1,'Future month must not show inactive employees');
context.month='2026-09';data.employees=[];context.renderSchedulePanel();
assert.match(text(nodes.get('#stats')),/員工人數 0 位/);
assert.match(text(nodes.get('#stats')),/排班時數 11 小時/);
context.fillEmployees(select);assert.equal(select.children.length,0);
data.employees=[active];
assert.equal(JSON.stringify(data),snapshot,'Historical rendering must not mutate any state or business data');
window.shiftEmployeeAdministration.historicalEmployees=()=>[];context.renderSchedulePanel();
assert.equal(nodes.get('#scheduleBody').children.length,1,'Cleared/unauthorized inventory must not retain historical roster');
assert.match(source,/employee-history-refreshed',\(\)=>renderSchedulePanel\(\)/,'Async employee inventory refresh must update only the schedule, without refresh loops');
assert.match(source,/const payrollRows=data\.employees\.map/,'Existing payroll rendering remains unchanged');
assert.match(source,/function renderCalendar\(\)\{\s*const select=\$\('#calendarEmployee'\); fillEmployees\(select\)/,'Leave selector stays active-only');
console.log('Schedule history: active/inactive/departed, overnight totals, read-only rows, active-only selectors and unchanged state PASS.');
