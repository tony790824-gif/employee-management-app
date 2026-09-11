// Disposable loopback-only PostgreSQL. Never reads a DATABASE_* environment variable.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import net from 'node:net';
import pg from 'pg';
import { createTenantContextSigner } from '../server/tenant-context.mjs';
import { createCommandService } from '../server/commands.mjs';

const root=await mkdtemp(path.join(tmpdir(),'banke-staff-test-'));
const bin=process.env.BANK_TEST_POSTGRES_BIN || 'C:/Program Files/PostgreSQL/18/bin';
const exe=name=>path.join(bin,`${name}${process.platform==='win32'?'.exe':''}`);
const run=(name,args)=>{
  const r=spawnSync(exe(name),args,{encoding:'utf8',timeout:60000,windowsHide:true});
  assert.equal(r.status,0,`${name}: ${r.stderr || r.stdout || r.error?.code}`);
};
const reservation=net.createServer();
await new Promise(resolve=>reservation.listen(0,'127.0.0.1',resolve));
const port=reservation.address().port;
await new Promise(resolve=>reservation.close(resolve));
let started=false,admin,pool;
try {
  run('initdb',['-D',path.join(root,'data'),'-U','postgres','--auth=trust','--encoding=UTF8','--locale=C']);
  run('pg_ctl',['-D',path.join(root,'data'),'-l',path.join(root,'postgres.log'),'-o',`-h 127.0.0.1 -p ${port}`,'-w','start']);
  started=true;
  admin=new pg.Client({host:'127.0.0.1',port,user:'postgres',database:'postgres',ssl:false});
  await admin.connect();
  for(const file of (await readdir('database/migrations')).filter(f=>/^\d{4}_.+\.up\.sql$/.test(f)&&!f.startsWith('0010')).sort()) {
    await admin.query('BEGIN');
    await admin.query(await readFile(`database/migrations/${file}`,'utf8'));
    await admin.query('COMMIT');
  }
  await admin.query('BEGIN');
  await admin.query(await readFile('database/pending/0023_employee_management.up.sql','utf8'));
  await admin.query(await readFile('database/pending/0024_payroll.up.sql','utf8'));
  await admin.query(await readFile('database/pending/0025_overnight_shifts.up.sql','utf8'));
  await admin.query('COMMIT');
  const ws=`ws_${'a'.repeat(32)}`,other=`ws_${'b'.repeat(32)}`;
  const manager=randomUUID(),employee=randomUUID(),candidate=randomUUID(),outsider=randomUUID();
  await admin.query(`INSERT INTO organizations(id,name) VALUES('00000000-0000-4000-8000-000000000001','Synthetic');
    INSERT INTO workspaces(id,organization_id,name) VALUES
    ('${ws}','00000000-0000-4000-8000-000000000001','Test A'),('${other}','00000000-0000-4000-8000-000000000001','Test B')`);
  for(const [id,phone] of [[manager,'0911111111'],[employee,'0922222222'],[candidate,'0933333333'],[outsider,'0944444444']]) {
    await admin.query('INSERT INTO users(id,phone) VALUES($1,$2)',[id,phone]);
    await admin.query(`INSERT INTO app_private.identity_principals(issuer,subject,user_id) VALUES('https://auth.example/',$1,$2)`,[`synthetic-${id}`,id]);
  }
  await admin.query(`INSERT INTO employees(workspace_id,id,name,phone,hourly_rate) VALUES
    ('${ws}','e_one','員工甲','0922222222',200),('${ws}','e_two','員工乙','0955555555',200),
    ('${other}','e_other','Other','0944444444',200);
    INSERT INTO workspace_members(workspace_id,user_id,role,auth_status,employee_id) VALUES
    ('${ws}','${manager}','boss','active',NULL),('${ws}','${employee}','employee','active','e_one'),
    ('${ws}','${candidate}','employee','active',NULL),('${other}','${outsider}','employee','active','e_other');
    CREATE ROLE banke_staff_test_api LOGIN;
    GRANT USAGE ON SCHEMA app_private TO banke_staff_test_api;
    GRANT EXECUTE ON FUNCTION app_private.api_establish_session(text,text,text),
      app_private.api_bootstrap(text,text,text),app_private.api_employee_administration(text,text,text),
      app_private.api_execute_employee_command(text,text,text,text,jsonb,text,text,text)
      TO banke_staff_test_api;`);
  await admin.query(`GRANT EXECUTE ON FUNCTION app_private.api_payroll_month(text,text,text,text),
    app_private.api_execute_payroll_command(text,text,text,text,jsonb,text,text,text) TO banke_staff_test_api`);
  await admin.query(`GRANT EXECUTE ON FUNCTION app_private.api_execute_shift_command(text,text,text,text,jsonb,text,text,text),
    app_private.api_execute_command(text,text,text,text,jsonb,text,text,text) TO banke_staff_test_api`);
  const key=randomBytes(32);
  await admin.query(`INSERT INTO app_private.tenant_context_keys(key_id,secret,expires_at) VALUES('test',$1,clock_timestamp()+interval '1 day')`,[key]);
  pool=new pg.Pool({host:'127.0.0.1',port,user:'banke_staff_test_api',database:'postgres',ssl:false,max:3});
  const signer=createTenantContextSigner({key:key.toString('base64url'),keyId:'test'});
  const service=createCommandService({pool,tenantContextSigner:signer});
  const identity=id=>({issuer:'https://auth.example/',subject:`synthetic-${id}`,sessionId:`session-${id}`,
    issuedAt:Math.floor(Date.now()/1000)-1,expiresAt:Math.floor(Date.now()/1000)+3600});
  const boss=identity(manager),worker=identity(employee);
  for(const id of [boss,worker]) await service.establishSession({identity:id,workspaceId:ws});
  const { testPayrollDatabase } = await import('./payroll-database.test.mjs');
  await testPayrollDatabase({admin,pool,service,boss,worker,ws,other,signer});
  const { testOvernightDatabase } = await import('./overnight-shifts-database.test.mjs');
  await testOvernightDatabase({admin,pool,service,boss,worker,ws,other,signer});
  const command=(name,input,who=boss,workspaceId=ws,idempotencyKey=randomUUID())=>service.execute({
    identity:who,workspaceId,commandName:name,input,idempotencyKey,requestId:randomUUID()});
  const read=()=>service.employeeAdministration({identity:boss,workspaceId:ws});
  assert.equal((await read()).data.length,2);
  assert.deepEqual((await read()).accounts.map(a=>a.userId),[candidate]);
  await assert.rejects(service.employeeAdministration({identity:worker,workspaceId:ws}),e=>e.code==='COMMAND_FORBIDDEN');
  await assert.rejects(pool.query('SELECT * FROM employees'),e=>e.code==='42501');
  const update={employeeId:'e_one',baseRevision:0,name:'更新員工',phone:'0922222223',jobTitle:'門市',hourlyRate:210,leaveQuota:7};
  await assert.rejects(command('employees.update',update,worker),e=>e.code==='COMMAND_FORBIDDEN');
  await assert.rejects(command('employees.update',{...update,employeeId:'e_other'}),e=>e.code==='EMPLOYEE_NOT_FOUND');
  const retryKey=randomUUID();
  const results=await Promise.all([command('employees.update',update,boss,ws,retryKey),command('employees.update',update,boss,ws,retryKey)]);
  assert.equal(results.filter(r=>r.replayed===true).length,1);
  assert.equal((await read()).data.find(e=>e.id==='e_one').revision,1);
  assert.equal((await read()).data.find(e=>e.id==='e_one').accountPhone,'0922222222','Editing contact phone must not change the login account');
  assert.equal((await read()).data.find(e=>e.id==='e_one').accountUserId,employee);
  await assert.rejects(command('employees.update',update),e=>e.code==='REVISION_CONFLICT');
  await assert.rejects(command('employees.update',{...update,name:'Changed'},boss,ws,retryKey),e=>e.code==='IDEMPOTENCY_KEY_REUSED');
  await admin.query(`INSERT INTO attendance_records(workspace_id,id,employee_id,work_date,clock_in)
    VALUES($1,$2,'e_one',current_date,clock_timestamp())`,[ws,randomUUID()]);
  await assert.rejects(command('employees.set-status',{employeeId:'e_one',baseRevision:1,status:'inactive'}),e=>e.code==='EMPLOYEE_ATTENDANCE_OPEN');
  await admin.query(`UPDATE attendance_records SET clock_out=clock_timestamp()+interval '1 hour' WHERE employee_id='e_one'`);
  await command('employees.set-status',{employeeId:'e_one',baseRevision:1,status:'departed'});
  assert.equal((await read()).data.find(e=>e.id==='e_one').accountStatus,'DISABLED');
  const signed=()=>signer.sign({identity:worker,workspaceId:ws,purpose:'read'});
  const employeeRead=async()=>{const s=signed();return pool.query('SELECT app_private.api_bootstrap($1,$2,$3)',[s.payload,s.signature,s.keyId]);};
  await assert.rejects(employeeRead(),e=>e.message==='WORKSPACE_ACCESS_DENIED');
  await assert.rejects(service.establishSession({identity:worker,workspaceId:ws}),e=>e.code==='WORKSPACE_ACCESS_DENIED');
  assert.equal(Number((await admin.query('SELECT count(*) FROM attendance_records')).rows[0].count),1);
  await command('employees.set-status',{employeeId:'e_one',baseRevision:2,status:'active'});
  await assert.rejects(employeeRead(),e=>e.message==='WORKSPACE_ACCESS_DENIED');
  await command('employees.link-account',{employeeId:'e_one',baseRevision:3,userId:employee});
  await employeeRead();
  await assert.rejects(command('employees.link-account',{employeeId:'e_two',baseRevision:0,userId:outsider}),e=>e.code==='EMPLOYEE_ACCOUNT_NOT_ELIGIBLE');
  await assert.rejects(command('employees.link-account',{employeeId:'e_two',baseRevision:0,userId:manager}),e=>e.code==='EMPLOYEE_ACCOUNT_NOT_ELIGIBLE');
  await assert.rejects(command('employees.link-account',{employeeId:'e_two',baseRevision:0,userId:employee}),e=>e.code==='EMPLOYEE_ACCOUNT_NOT_ELIGIBLE');
  await command('employees.link-account',{employeeId:'e_two',baseRevision:0,userId:candidate});
  assert.equal((await read()).data.find(e=>e.id==='e_two').accountStatus,'READY');
  assert.equal((await read()).accounts.length,0);
  const newWorker=identity(candidate);
  await service.establishSession({identity:newWorker,workspaceId:ws});
  const linkedContext=signer.sign({identity:newWorker,workspaceId:ws,purpose:'read'});
  const linkedBootstrap=(await pool.query('SELECT app_private.api_bootstrap($1,$2,$3) AS result',[
    linkedContext.payload,linkedContext.signature,linkedContext.keyId])).rows[0].result;
  assert.equal(linkedBootstrap.employeeId,'e_two','Linked login must resolve to the selected employee');
  assert.equal(linkedBootstrap.role,'employee');
  assert.deepEqual(linkedBootstrap.data.employees.map(e=>e.id),['e_two'],'Employee bootstrap must not expose colleagues');
  // An independent security suspension cannot be cleared by cycling employment state.
  await admin.query(`UPDATE workspace_members SET status='suspended',auth_status='disabled' WHERE user_id=$1`,[candidate]);
  await command('employees.set-status',{employeeId:'e_two',baseRevision:1,status:'inactive'});
  await command('employees.set-status',{employeeId:'e_two',baseRevision:2,status:'active'});
  await assert.rejects(command('employees.link-account',{employeeId:'e_two',baseRevision:3,userId:candidate}),e=>e.code==='EMPLOYEE_ACCOUNT_NOT_ELIGIBLE');
  await admin.query(`INSERT INTO employees(workspace_id,id,name,phone,hourly_rate) VALUES($1,'e_manager','Synthetic manager','0911111111',200)`,[ws]);
  await admin.query(`UPDATE workspace_members SET employee_id='e_manager' WHERE user_id=$1`,[manager]);
  await assert.rejects(command('employees.set-status',{employeeId:'e_manager',baseRevision:0,status:'inactive'}),e=>e.code==='EMPLOYEE_PRIVILEGED_ACCOUNT');
  await assert.rejects(command('employees.update',{...update,employeeId:'e_manager',baseRevision:0}),e=>e.code==='EMPLOYEE_PRIVILEGED_ACCOUNT');
  assert.equal(Number((await admin.query('SELECT count(*) FROM users')).rows[0].count),4);
  console.log('Disposable PostgreSQL employee lifecycle, same-workspace linking, suspension, idempotency and least-privilege tests passed.');
} finally {
  await pool?.end();await admin?.end();
  if(started) run('pg_ctl',['-D',path.join(root,'data'),'-m','fast','-w','stop']);
  await rm(root,{recursive:true,force:true});
}
