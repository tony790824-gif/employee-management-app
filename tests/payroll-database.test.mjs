import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

// Reuses the existing disposable harness; cannot connect to a configured database itself.
export async function testPayrollDatabase({admin,pool,service,boss,worker,ws,other,signer}) {
 const month='2026-09';
 const command=(name,input,who=boss,key=randomUUID())=>service.execute({identity:who,workspaceId:ws,commandName:name,input,idempotencyKey:key,requestId:randomUUID()});
 const read=(who=boss,m=month)=>service.payroll({identity:who,workspaceId:ws,month:m});
 const one=async()=> (await read()).data.find(row=>row.employeeId==='e_one');
 await assert.rejects(pool.query('SELECT * FROM payroll_monthly'),e=>e.code==='42501');
 await admin.query(`INSERT INTO attendance_records(workspace_id,id,employee_id,work_date,hours) VALUES($1,'payroll-hours','e_one','2026-09-01',8.5)`,[ws]);
 assert.equal((await one()).basePay,1700);
 const monthly={employeeId:'e_one',month,baseRevision:0,baseMode:'fixed',baseSalary:30000,commission:2500,note:'Test monthly'};
 await assert.rejects(command('payroll.monthly-save',monthly,worker),e=>e.code==='COMMAND_FORBIDDEN');
 await assert.rejects(command('payroll.monthly-save',{...monthly,employeeId:'e_other'}),e=>e.code==='EMPLOYEE_NOT_FOUND');
 const retry=randomUUID();
 const saves=await Promise.all([command('payroll.monthly-save',monthly,boss,retry),command('payroll.monthly-save',monthly,boss,retry)]);
 assert.equal(saves.filter(row=>row.replayed).length,1);
 assert.equal((await one()).basePay,30000,'Fixed base must replace hourly base, not add it');
 await assert.rejects(command('payroll.monthly-save',monthly),e=>e.code==='REVISION_CONFLICT');
 await assert.rejects(command('payroll.monthly-save',{...monthly,commission:1},boss,retry),e=>e.code==='IDEMPOTENCY_KEY_REUSED');
 const addition={employeeId:'e_one',month,baseRevision:0,id:randomUUID(),kind:'addition',name:'全勤',amount:1000,note:'Test'};
 const deduction={...addition,id:randomUUID(),kind:'deduction',name:'扣項',amount:200};
 await command('payroll.adjustment-save',addition); await command('payroll.adjustment-save',deduction);
 assert.equal((await one()).payable,33300);
 assert.equal((await one()).additions,1000); assert.equal((await one()).deductions,200);
 await command('payroll.adjustment-save',{...addition,baseRevision:1,name:'更新加項',amount:1200});
 assert.equal((await one()).payable,33500);
 await assert.rejects(command('payroll.adjustment-save',addition),e=>e.code==='REVISION_CONFLICT');
 await assert.rejects(command('payroll.adjustment-save',{...addition,baseRevision:2,employeeId:'e_two'}),e=>e.code==='PAYROLL_ITEM_NOT_FOUND');
 await assert.rejects(command('payroll.adjustment-save',{...addition,baseRevision:2,month:'2026-10'}),e=>e.code==='PAYROLL_ITEM_NOT_FOUND');
 await command('payroll.adjustment-void',{employeeId:'e_one',month,baseRevision:1,id:deduction.id});
 assert.equal((await one()).payable,33700);
 assert.equal((await one()).adjustments.find(row=>row.id===deduction.id).status,'voided');
 assert.equal((await admin.query('SELECT amount FROM payroll_adjustments WHERE id=$1',[deduction.id])).rows[0].amount,-200,'Void keeps historical amount');
 await assert.rejects(command('payroll.adjustment-save',{...deduction,baseRevision:2}),e=>e.code==='PAYROLL_ITEM_VOIDED');
 await assert.rejects(command('payroll.adjustment-void',{employeeId:'e_one',month,baseRevision:2,id:addition.id},worker),e=>e.code==='COMMAND_FORBIDDEN');
 assert.deepEqual((await read(worker)).data.map(row=>row.employeeId),['e_one']);
 assert.equal((await read(boss,'2026-10')).data.find(row=>row.employeeId==='e_one').payable,0,'Month boundaries must not leak salary/commission');
 await command('payroll.monthly-save',{...monthly,baseRevision:1,commission:3000});
 assert.equal((await one()).payable,34200);
 await command('payroll.monthly-save',{...monthly,baseRevision:2,baseMode:'hourly',baseSalary:0,commission:3000});
 assert.equal((await one()).payable,5900);
 const signed=signer.sign({identity:boss,workspaceId:ws,purpose:'command'});
 await assert.rejects(pool.query('SELECT app_private.api_execute_payroll_command($1,$2,$3,$4,$5::jsonb,$6,$7,$8)',
  [signed.payload,signed.signature,signed.keyId,'payroll.adjustment-save',JSON.stringify({...addition,baseRevision:2,amount:-99}),randomUUID(),'a'.repeat(64),randomUUID()]),e=>e.message==='COMMAND_INVALID');
 assert.equal(Number((await admin.query('SELECT count(*) FROM payroll_monthly WHERE workspace_id=$1',[other])).rows[0].count),0);
 // Leave employee-lifecycle fixture counts unchanged.
 await admin.query("DELETE FROM attendance_records WHERE id='payroll-hours'");
 console.log('Payroll fixed/hourly base, adjustments edit/void, monthly commission, totals, tenant/employee isolation and concurrency passed.');
}
