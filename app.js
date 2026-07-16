if (window.SHIFT_AUTHORIZED !== true) throw new Error('Authenticated app cannot start before login.');
const stateStore = window.shiftStateStore;
let data = stateStore.read();
data.removedEmployees = data.removedEmployees.filter(record =>
  record && typeof record === 'object' && new Date(record.removeAfter).getTime() > Date.now()
);
// 先寫回完整 schema，確保後續依序載入的功能模組不會讀到半套舊資料。
stateStore.write(data);
const recoveredState = stateStore.consumeRecovery();
if (recoveredState) requestAnimationFrame(() => alert(
  recoveredState.backupSaved
    ? '偵測到本機班表資料損壞，已隔離原始資料並改用可安全讀取的資料。'
    : '偵測到本機班表資料損壞，系統已改用安全資料，但瀏覽器無法保存損壞資料備份。'
));
const initialDate = new Date();
let month = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' }).format(initialDate).slice(0, 7);
let calendarEmployeeId = data.employees[0]?.id || '';
const $ = s => document.querySelector(s); const employee = id => data.employees.find(e => e.id === id);
const dom = window.shiftDomSafety;
const money = n => new Intl.NumberFormat('zh-TW',{style:'currency',currency:'TWD',maximumFractionDigits:0}).format(n);
const hours = s => { const [a,b]=[s.start,s.end].map(x=>x.split(':').map(Number)); return Math.max(0,(b[0]*60+b[1]-a[0]*60-a[1])/60); };
const planned = e => { const shifts=data.shifts.filter(s=>s.employeeId===e.id&&s.date.startsWith(month)); const h=shifts.reduce((n,s)=>n+hours(s),0); return {shifts,h,pay:h*e.rate}; };
const actual = e => { const att=data.attendance.filter(a=>a.employeeId===e.id&&a.date.startsWith(month)&&a.type==='出勤'); const h=att.reduce((n,a)=>n+Number(a.hours||0),0); return {h,pay:h*e.rate,count:att.length}; };
function leaveKey(){ return `${calendarEmployeeId}-${month}`; }
function selectedLeaves(){ return data.leaves[leaveKey()] || []; }
function save(){ stateStore.write(data); render(); }
function fillEmployees(select){ dom.replace(select, ...data.employees.map(e=>dom.option(e.id,e.name))); }
function renderCalendar(){
  const select=$('#calendarEmployee'); fillEmployees(select); if(!data.employees.some(e=>e.id===calendarEmployeeId)) calendarEmployeeId=data.employees[0]?.id||''; select.value=calendarEmployeeId;
  const first=new Date(`${month}-01T00:00`), start=first.getDay(), count=new Date(first.getFullYear(),first.getMonth()+1,0).getDate(), leaves=selectedLeaves();
  const quota=employee(calendarEmployeeId)?.leaveQuota??8; $('#leaveRemaining').textContent=Math.max(0,quota-leaves.length);
  const blanks=Array.from({length:start},()=>dom.element('span',{className:'calendar-blank'}));
  const days=Array.from({length:count},(_,i)=>{const d=i+1,date=`${month}-${String(d).padStart(2,'0')}`,off=leaves.includes(date);return dom.element('button',{className:`calendar-day ${off?'is-leave':''}`.trim(),text:d,title:off?'取消休假':'設定休假',dataset:{date},attributes:{type:'button'}});});
  dom.replace($('#calendarGrid'),...blanks,...days);
  document.querySelectorAll('.calendar-day').forEach(button=>button.onclick=()=>toggleLeave(button.dataset.date));
}
function toggleLeave(date){ if(!calendarEmployeeId) return; const key=leaveKey(), values=[...(data.leaves[key]||[])], at=values.indexOf(date), quota=employee(calendarEmployeeId)?.leaveQuota??8; if(at>=0) values.splice(at,1); else { if(values.length>=quota) return alert(`這位員工本月已設定 ${quota} 天休假；若要調整，請先取消其中一天。`); values.push(date); } data.leaves[key]=values.sort(); save(); }
function render(){
  $('#monthTitle').textContent=new Date(month+'-01T00:00').toLocaleDateString('zh-TW',{year:'numeric',month:'long'}); $('#monthPicker').value=month;
  const p=data.employees.map(planned), a=data.employees.map(actual), attendance=data.attendance.filter(a=>a.date.startsWith(month));
  const stats=[['員工人數',data.employees.length+' 位'],['排班時數',p.reduce((n,x)=>n+x.h,0)+' 小時'],['實際工時',a.reduce((n,x)=>n+x.h,0)+' 小時'],['預估成本 / 實際支出', `${money(p.reduce((n,x)=>n+x.pay,0))} / ${money(a.reduce((n,x)=>n+x.pay,0))}`]];
  dom.replace($('#stats'),...stats.map(([label,value])=>dom.element('article',{className:'stat'},[dom.element('p',{text:label}),dom.element('strong',{text:value})])));
  renderCalendar();
  const scheduleRows=data.employees.map((e,i)=>{const t=p[i],shifts=dom.element('td');if(t.shifts.length)t.shifts.forEach(s=>shifts.append(dom.element('span',{className:'badge',text:`${s.date.slice(8)}日 ${s.start}–${s.end}`,title:s.note||''})));else shifts.append(dom.element('span',{className:'empty',text:'尚未排班'}));return dom.element('tr',{},[dom.element('td',{},[dom.element('strong',{text:e.name})]),dom.cell(e.role),dom.cell(money(e.rate)),dom.cell(`${t.h} 小時`),dom.cell(money(t.pay)),shifts]);});
  dom.replace($('#scheduleBody'),...(scheduleRows.length?scheduleRows:[dom.emptyRow(6,'尚無員工資料')]));
  const employeeCards=data.employees.map(e=>{const card=dom.element('article',{className:'card'},[dom.element('h3',{text:e.name}),dom.element('p',{text:e.role}),dom.element('p',{text:`帳號：${e.phone||'尚未設定'}`}),dom.element('p',{text:`登入狀態：${e.credentialState==='active'?'PIN 已設定':e.credentialState==='pending'?'等待首次啟用':'需要產生啟用碼'}`}),dom.element('p',{text:`時薪 ${money(e.rate)}`})]);[['編輯',()=>openEmployee(e)],['重設 PIN',()=>window.resetEmployeePin(e.id)],['移除員工',()=>window.removeEmployee(e.id)]].forEach(([label,handler])=>{const button=dom.element('button',{text:label,attributes:{type:'button'}});button.addEventListener('click',handler);card.append(button);});return card;});
  dom.replace($('#employeeCards'),...(employeeCards.length?employeeCards:[dom.element('p',{className:'empty',text:'請先新增第一位員工。'})]));
  const removed = $('#removedEmployees');
  if(data.removedEmployees.length){
    removed.hidden=false;
    const archivedCards=data.removedEmployees.map(r=>{const card=dom.element('article',{className:'card'},[dom.element('h3',{text:r.employee.name}),dom.element('p',{text:`保留至 ${new Date(r.removeAfter).toLocaleString('zh-TW')}`})]);[['復原員工',()=>window.restoreEmployee(r.employee.id)],['立即永久刪除',()=>window.deleteArchivedEmployee(r.employee.id)]].forEach(([label,handler])=>{const button=dom.element('button',{text:label,attributes:{type:'button'}});button.addEventListener('click',handler);card.append(button);});return card;});
    dom.replace(removed,dom.element('h3',{text:'已移除員工（保留 3 天）'}),dom.element('p',{text:'員工已不能登入；保留期限到後，系統會永久刪除資料。'}),...archivedCards);
  }else{removed.hidden=true;removed.replaceChildren();}
  const payrollRows=data.employees.map((e,i)=>{const t=a[i];return dom.element('tr',{},[dom.element('td',{},[dom.element('strong',{text:e.name})]),dom.cell(money(e.rate)),dom.cell(`${t.h} 小時`),dom.cell(`${t.count} 筆出勤`),dom.element('td',{},[dom.element('strong',{text:money(t.pay)})])]);});
  dom.replace($('#payrollBody'),...(payrollRows.length?payrollRows:[dom.emptyRow(5,'尚無資料')]));
  const attendanceRows=attendance.sort((a,b)=>b.date.localeCompare(a.date)).map(a=>{const remove=dom.element('button',{className:'icon',text:'×',title:'刪除紀錄',attributes:{type:'button'}});remove.addEventListener('click',()=>window.removeAttendance(a.id));return dom.element('tr',{},[dom.cell(a.date),dom.element('td',{},[dom.element('strong',{text:employee(a.employeeId)?.name||'已刪除員工'})]),dom.element('td',{},[dom.element('span',{className:'badge',text:a.type})]),dom.cell(`${a.hours} 小時`),dom.cell(a.note||'—'),dom.element('td',{},[remove])]);});
  dom.replace($('#attendanceBody'),...(attendanceRows.length?attendanceRows:[dom.emptyRow(6,'本月尚無出勤或請假紀錄')]));
}
function openEmployee(e){ $('#employeeDialogTitle').textContent=e?'編輯員工':'新增員工'; $('#employeeId').value=e?.id||''; $('#employeeName').value=e?.name||''; $('#employeePhone').value=e?.phone||''; $('#employeeRole').value=e?.role||''; $('#employeeRate').value=e?.rate||''; $('#employeeLeaveQuota').value=e?.leaveQuota??8; $('#employeeDialog').showModal(); }
window.openEmployeeDialog=openEmployee;
window.fillEmployeeSelect=fillEmployees;
window.editEmployee=id=>openEmployee(employee(id));
window.resetEmployeePin=async id=>{const person=employee(id);if(!person)return;if(!confirm(`要重設 ${person.name} 的 PIN 嗎？目前的 PIN 會立即失效。`))return;const before=structuredClone(data),code=window.shiftAccountSecurity.generateActivationCode();person.activationCodeHash=await window.shiftAccountSecurity.hashSecret(code);person.credentialState='pending';save();try{if(window.sheetsCloud?.saveBossData)await window.sheetsCloud.saveBossData(data);}catch(error){if(error?.code==='REVISION_CONFLICT')return;data=before;save();return alert(`PIN 未成功重設：${error.message||'請稍後再試。'}`);}alert(`PIN 已重設。\n\n一次性啟用碼：${code}\n\n請把這組啟用碼交給員工；啟用後此碼立即失效。`);};
window.removeEmployee=id=>{const person=employee(id);if(!person)return;if(confirm('移除此員工後會停止登入，資料保留 3 天。確定移除嗎？')){const leaves={};Object.keys(data.leaves).filter(k=>k.startsWith(id+'-')).forEach(k=>{leaves[k]=data.leaves[k];delete data.leaves[k];});const shifts=data.shifts.filter(s=>s.employeeId===id),attendance=data.attendance.filter(a=>a.employeeId===id);data.removedEmployees.push({employee:person,shifts,attendance,leaves,removedAt:new Date().toISOString(),removeAfter:new Date(Date.now()+3*24*60*60*1000).toISOString()});data.employees=data.employees.filter(e=>e.id!==id);data.shifts=data.shifts.filter(s=>s.employeeId!==id);data.attendance=data.attendance.filter(a=>a.employeeId!==id);save();}};
window.restoreEmployee=id=>{const archived=data.removedEmployees.find(r=>r.employee.id===id);if(!archived)return;data.employees.push(archived.employee);data.shifts.push(...archived.shifts);data.attendance.push(...archived.attendance);Object.assign(data.leaves,archived.leaves);data.removedEmployees=data.removedEmployees.filter(r=>r.employee.id!==id);save();};
window.deleteArchivedEmployee=id=>{if(!confirm('確定要立即永久刪除這位員工及其保留資料嗎？'))return;data.removedEmployees=data.removedEmployees.filter(r=>r.employee.id!==id);save();};
window.removeAttendance=id=>{if(confirm('確定刪除此紀錄嗎？')){data.attendance=data.attendance.filter(a=>a.id!==id);save();}};
$('#calendarEmployee').onchange=e=>{calendarEmployeeId=e.target.value;renderCalendar();};$('#monthPicker').onchange=e=>{month=e.target.value;render();};
if($('#logoutBtn')) $('#logoutBtn').onclick=()=>window.shiftLogout();
document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{document.querySelectorAll('[data-tab],.tab-panel').forEach(x=>x.classList.remove('active'));b.classList.add('active');$('#'+b.dataset.tab).classList.add('active');});
$('#printBtn').onclick=()=>window.print();$('#exportBtn').onclick=()=>{const rows=[['員工','時薪','工時','出勤筆數','實際薪資'],...data.employees.map(e=>{const t=actual(e);return[e.name,e.rate,t.h,t.count,t.pay]})],a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['\ufeff'+rows.map(r=>r.join(',')).join('\n')],{type:'text/csv'}));a.download=`薪資實付-${month}.csv`;a.click();};
render();
