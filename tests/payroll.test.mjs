import assert from 'node:assert/strict';
import { validateCommand, validatePayrollMonth } from '../server/validation.mjs';
import { createCommandService } from '../server/commands.mjs';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
const monthly={employeeId:'e_test',month:'2026-09',baseRevision:0,baseMode:'fixed',baseSalary:30000,commission:2000,note:''};
assert.deepEqual(validateCommand('payroll.monthly-save',monthly),monthly);
for (const patch of [{baseSalary:-1},{commission:0.5},{baseMode:'invented'},{workspaceId:'other'},{month:'2026-13'},{month:'2026-9'},{baseRevision:-1}])
 assert.throws(()=>validateCommand('payroll.monthly-save',{...monthly,...patch}));
assert.throws(()=>validateCommand('payroll.monthly-save',{...monthly,baseMode:'hourly'}));
const adjustment={employeeId:'e_test',month:'2026-09',baseRevision:0,id:'11111111-1111-4111-8111-111111111111',kind:'addition',name:'獎金',amount:1000,note:''};
for(const kind of ['addition','deduction']) assert.equal(validateCommand('payroll.adjustment-save',{...adjustment,kind}).kind,kind);
for(const patch of [{name:''},{amount:0},{amount:-1},{amount:1.5},{kind:'salary'},{amount:1e15},{id:'bad'}])
 assert.throws(()=>validateCommand('payroll.adjustment-save',{...adjustment,...patch}));
assert.equal(validatePayrollMonth('2028-02'),'2028-02');
const calls=[];
const service=createCommandService({pool:{query:async(sql,args)=>{calls.push({sql,args});return{rows:[{result:{ok:true}}]};}},tenantContextSigner:{sign:()=>({})}});
await service.execute({commandName:'payroll.monthly-save',input:monthly,idempotencyKey:'test-payroll',requestId:'test-request'});
assert.match(calls.at(-1).sql,/api_execute_payroll_command/);
await service.payroll({month:'2026-09'});
assert.match(calls.at(-1).sql,/api_payroll_month/);
console.log('Payroll input, amount/month validation and signed service routing passed.');

const make=(tag='',options={},children=[])=>({tag,text:options.text||'',value:options.value??'',children:[...children],disabled:false,
 append(...nodes){this.children.push(...nodes);},replaceChildren(...nodes){this.children=nodes;},
 addEventListener(name,fn){this[name]=fn;},querySelectorAll(tag){return this.children.flatMap(c=>[...(c.tag===tag?[c]:[]),...c.querySelectorAll(tag)]);},
 showModal(){this.open=true;},close(){this.open=false;},remove(){this.removed=true;}});
const tbody=make(),detailsPanel=make(),header=make(),heading=make(),description=make(),exportButton=make(),monthPicker={value:'2026-09'},docBody=make();
detailsPanel.querySelector=s=>s==='h2'?heading:s==='thead tr'?header:description;
const listeners=new Map();let role='boss',fail=false,submitted;
const row={employeeId:'e_test',name:'員工甲',month:'2026-09',baseMode:'fixed',baseSalary:30000,commission:2000,
 basePay:30000,additions:1000,deductions:500,payable:32500,revision:1,note:'',adjustments:[]};
const cloud={getCurrentUser:()=>role?{role}:null,payroll:async month=>{if(fail)throw new Error('offline');return{ok:true,month,data:[{...row,month}]};},
 saveMonthlyPayroll:async input=>{submitted=input;}};
const window={shiftEnvironment:{dataBackend:'postgres'},shiftPostgresCloud:cloud,
 shiftDomSafety:{element:make,cell:text=>make('td',{text}),option:(value,text)=>make('option',{value,text}),emptyRow:(n,text)=>make('tr',{text}),replace:(node,...items)=>node.replaceChildren(...items)}};
const document={body:docBody,querySelector:s=>({'#payrollBody':tbody,'#payroll':detailsPanel,'#exportBtn':exportButton,'#monthPicker':monthPicker}[s]||null),addEventListener:(name,fn)=>listeners.set(name,fn)};
vm.runInNewContext(await readFile('payroll-ui.js','utf8'),{window,document,Intl,crypto:{randomUUID:()=>adjustment.id},alert(){},confirm:()=>true});
await new Promise(resolve=>setImmediate(resolve));
assert.match(tbody.children[0].children[6].text,/32,500/);
tbody.children[0].children[7].children[0].click();
const dialog=docBody.children.at(-1),form=dialog.children[0];
await form.submit({preventDefault(){}}); await new Promise(resolve=>setImmediate(resolve));
assert.equal(submitted.baseSalary,30000);assert.equal(submitted.commission,2000);assert.equal(submitted.month,'2026-09');
assert.equal(submitted.baseRevision,1);assert.equal(dialog.removed,true);
role='employee';await window.shiftPayroll.refresh();assert.equal(tbody.children[0].children[7].children.length,0);
fail=true;await window.shiftPayroll.refresh();assert.equal(exportButton.disabled,true);assert.match(tbody.children[0].text,/無法取得薪資/);
listeners.get('postgres-session-cleared')();assert.equal(tbody.children.length,0);
console.log('Payroll UI monthly form, server totals, readonly employee, failed fetch and logout clearing passed.');
