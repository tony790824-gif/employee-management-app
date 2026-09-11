import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createCommandService} from '../server/commands.mjs';

// Only runs inside the existing loopback disposable harness.
export async function testOvernightDatabase({admin,pool,service,boss,worker,ws,other,signer}) {
 const command=(name,input,who=boss,key=randomUUID())=>service.execute({identity:who,workspaceId:ws,commandName:name,input,idempotencyKey:key,requestId:randomUUID()});
 const night={employeeId:'e_one',date:'2026-09-30',startTime:'22:00',endTime:'06:00',note:'Synthetic night'};
 await assert.rejects(command('shifts.create',night,worker),e=>e.code==='COMMAND_FORBIDDEN');
 await assert.rejects(command('shifts.create',{...night,employeeId:'e_other'}),e=>e.code==='EMPLOYEE_NOT_FOUND');
 const retry=randomUUID();
 const created=await command('shifts.create',night,boss,retry);
 assert.equal((await command('shifts.create',night,boss,retry)).replayed,true);
 const id=created.data.id;
 assert.equal(created.data.endTime,'06:00');
 await assert.rejects(command('shifts.create',{...night,date:'2026-10-01',startTime:'05:00',endTime:'07:00'}),e=>e.code==='SHIFT_OVERLAP');
 await assert.rejects(command('shifts.create',{...night,startTime:'21:00',endTime:'23:00'}),e=>e.code==='SHIFT_OVERLAP');
 const adjacent=await command('shifts.create',{...night,date:'2026-10-01',startTime:'06:00',endTime:'14:00'});
 const edited=await command('shifts.update',{...night,shiftId:id,baseRevision:created.data.revision,startTime:'23:00'});
 assert.equal(edited.data.revision,created.data.revision+1);
 await assert.rejects(command('shifts.update',{...night,shiftId:id,baseRevision:created.data.revision}),e=>e.code==='REVISION_CONFLICT');
 await assert.rejects(command('shifts.update',{...night,shiftId:id,baseRevision:edited.data.revision,endTime:'07:00'}),e=>e.code==='SHIFT_OVERLAP');
 await assert.rejects(command('shifts.update',{...night,shiftId:'foreign-shift',baseRevision:0}),e=>e.code==='SHIFT_NOT_FOUND');
 const concurrent=await Promise.allSettled([1,2].map(()=>command('shifts.create',{...night,date:'2026-11-01'})));
 assert.equal(concurrent.filter(r=>r.status==='fulfilled').length,1,'Concurrent conflicting schedules must serialize');
 assert.equal(concurrent.find(r=>r.status==='rejected').reason.code,'SHIFT_OVERLAP');
 const signed=signer.sign({identity:worker,workspaceId:ws,purpose:'read'});
 const boot=(await pool.query('SELECT app_private.api_bootstrap($1,$2,$3) AS result',[signed.payload,signed.signature,signed.keyId])).rows[0].result;
 assert.equal(boot.data.shifts.find(s=>s.id===id).date,'2026-09-30');
 assert.equal(boot.data.shifts.find(s=>s.id===id).end,'06:00');
 assert.equal(boot.data.shifts.every(s=>s.employeeId==='e_one'),true);
 // The clock-out command must locate the still-open prior-day attendance record.
 let now=new Date('2026-09-30T14:00:00Z');
 const clock=createCommandService({pool,tenantContextSigner:signer,clock:()=>now});
 const punch=name=>clock.execute({identity:worker,workspaceId:ws,commandName:name,input:{},idempotencyKey:randomUUID(),requestId:randomUUID()});
 await punch('attendance.clock-in'); now=new Date('2026-09-30T22:00:00Z'); await punch('attendance.clock-out');
 const attendance=(await admin.query("SELECT to_char(work_date,'YYYY-MM-DD') AS day,hours FROM attendance_records WHERE workspace_id=$1 AND employee_id='e_one'",[ws])).rows;
 assert.equal(attendance.length,1); assert.equal(attendance[0].day,'2026-09-30'); assert.equal(Number(attendance[0].hours),8);
 const month=await service.payroll({identity:worker,workspaceId:ws,month:'2026-09'});
 assert.equal(month.data[0].hours,8);
 assert.equal((await service.payroll({identity:worker,workspaceId:ws,month:'2026-10'})).data[0].hours,0);
 assert.equal(Number((await admin.query('SELECT count(*) FROM shifts WHERE workspace_id=$1',[other])).rows[0].count),0);
 assert.ok(adjacent.data.id);
 await admin.query("DELETE FROM attendance_records WHERE workspace_id=$1 AND employee_id='e_one'",[ws]);
 console.log('Disposable overnight create/edit, adjacent-day overlap, concurrency, isolation, cross-month clock-out and payroll passed.');
}
