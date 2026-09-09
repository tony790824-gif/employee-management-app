import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { validateCommand, employeeCommandNames, commandNames } from '../server/validation.mjs';
import { createCommandService } from '../server/commands.mjs';

const update = { employeeId: 'e_test', baseRevision: 1, name: '員工甲', phone: '0912345678',
  jobTitle: '門市', hourlyRate: 200, leaveQuota: 8 };
assert.deepEqual(validateCommand('employees.update', update), update);
for (const patch of [{ baseRevision: -1 }, { hourlyRate: -1 }, { role: 'boss' }, { userId: 'arbitrary' },
  { name: '' }, { employeeId: '' }, { phone: '' }, { leaveQuota: 32 }]) {
  assert.throws(() => validateCommand('employees.update', { ...update, ...patch }));
}
for (const status of ['active','inactive','departed']) {
  assert.equal(validateCommand('employees.set-status', { employeeId:'e_test',baseRevision:0,status }).status,status);
}
assert.throws(() => validateCommand('employees.set-status', {employeeId:'e_test',baseRevision:0,status:'deleted'}));
assert.throws(() => validateCommand('employees.link-account', {employeeId:'e_test',baseRevision:0,userId:'auth0|user'}));
const calls=[];
const service=createCommandService({
  pool:{query:async(sql,args)=>{calls.push({sql,args});return {rows:[{result:{ok:true}}]};}},
  tenantContextSigner:{sign:()=>({payload:'synthetic',signature:'synthetic',keyId:'test'})}
});
for(const command of employeeCommandNames){
  assert.ok(commandNames.includes(command));
  const input=command==='employees.update'?update:command==='employees.set-status'
    ?{employeeId:'e_test',baseRevision:0,status:'inactive'}
    :{employeeId:'e_test',baseRevision:0,userId:'11111111-1111-4111-8111-111111111111'};
  await service.execute({commandName:command,input,idempotencyKey:'synthetic-key',requestId:'synthetic-request'});
  assert.match(calls.at(-1).sql,/api_execute_employee_command/);
}
await service.employeeAdministration({});
assert.match(calls.at(-1).sql,/api_employee_administration/);
const unavailable=createCommandService({pool:{query:async()=>{throw Object.assign(new Error('fixture'),{code:'42883'});}},
  tenantContextSigner:{sign:()=>({})}});
await assert.rejects(unavailable.employeeAdministration({}),error=>error.code==='EMPLOYEE_ADMIN_UNAVAILABLE');

// Existing DOM helpers use textContent. Exercise manager/employee boundaries and failure/reload behavior.
const source=await readFile('employee-administration.js','utf8');
const listeners=new Map();
const make=(tag='',options={},children=[])=>({tag,text:options.text||'',children:[...children],hidden:false,
  append(...items){this.children.push(...items);},replaceChildren(...items){this.children=items;},
  addEventListener(type,fn){this[type]=fn;}});
const cards=make(),removed=make(),tab=make(),help={};
const doc={querySelector:s=>s==='#employeeCards'?cards:s==='#removedEmployees'?removed:s.includes('cloud-help')?help:tab,
  addEventListener:(type,fn)=>listeners.set(type,fn)};
let role='boss',readCalls=0,statusCalls=0,linkedCalls=0,fail=false;
const staff=[{...update,id:'e_test',role:'門市',rate:200,revision:1,status:'active',accountStatus:'UNLINKED'}];
const cloud={getCurrentUser:()=>({role}),employeeAdministration:async()=>{readCalls++;if(fail)throw new Error('offline');return{ok:true,data:staff,accounts:[]};},
  setEmployeeStatus:async()=>{statusCalls++;},linkEmployeeAccount:async()=>{linkedCalls++;}};
let opened;
const window={openEmployeeDialog:employee=>{opened=employee;},shiftEnvironment:{dataBackend:'postgres'},shiftDomSafety:{element:make,option:(value,text)=>({...make('option',{text}),value}),
  replace:(node,...items)=>node.replaceChildren(...items)},shiftPostgresCloud:cloud};
vm.runInNewContext(source,{window,document:doc,alert(){},confirm:()=>true});
await new Promise(resolve=>setImmediate(resolve));
assert.equal(readCalls,1);
assert.ok(cards.children[0].children.some(item=>item.text.includes('尚未連結')));
assert.ok(cards.children[0].children.find(item=>item.text==='連結登入帳號').disabled);
cards.children[0].children.find(item=>item.text==='編輯資料').click();
assert.equal(opened.revision,1);
staff[0].revision=2;
assert.equal(window.shiftEmployeeAdministration.find('e_test').revision,1,'Open form must keep its original revision, not overwrite a concurrent edit');
await cards.children[0].children.find(item=>item.text==='停用').click();
await new Promise(resolve=>setImmediate(resolve));
assert.equal(statusCalls,1);assert.equal(linkedCalls,0);
role='employee'; await window.shiftEmployeeAdministration.refresh();
assert.equal(cards.children.length,0);
assert.equal(readCalls,2,'Employee must not request manager-only account inventory');
role='boss';fail=true;await window.shiftEmployeeAdministration.refresh();
assert.equal(window.shiftEmployeeAdministration.find('e_test').revision,1,'Refresh must not silently change an open form revision');
assert.match(cards.children[0].text,/無法取得/);
listeners.get('postgres-session-cleared')();
assert.equal(cards.children.length,0);
assert.equal(window.shiftEmployeeAdministration.find('e_test'),undefined);
console.log('Employee edit/status/account-link validation, API routing and UI tests passed.');
