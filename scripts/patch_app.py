s = open('src/app.html', encoding='utf8').read()


def rep(a, b):
    global s
    assert a in s, a[:80]
    s = s.replace(a, b, 1)


rep('''    <div class="monthnav" role="group" aria-label="เลือกเดือน">''', '''    <div class="hright">
    <div class="monthnav" role="group" aria-label="เลือกเดือน">''')
rep('''      <button id="nextM" aria-label="เดือนถัดไป">›</button>
    </div>
  </header>''', '''      <button id="nextM" aria-label="เดือนถัดไป">›</button>
    </div>
    <button class="gear" id="gearBtn" aria-label="ตั้งค่า">⚙︎</button>
    </div>
  </header>''')
a = s.index('  <section class="card">\n    <details class="howto">')
b = s.index('</div>\n\n<div class="fabs">')
s = s[:a] + '''  <section class="card" id="installCard">
    <details class="howto" open>
      <summary>ติดตั้งไว้ที่หน้าจอโฮม</summary>
      <ol><li>เปิดหน้านี้ใน Safari</li><li>แตะปุ่มแชร์ (สี่เหลี่ยมมีลูกศรชี้ขึ้น)</li><li>เลือก “เพิ่มไปยังหน้าจอโฮม” แล้วแตะ “เพิ่ม”</li></ol>
    </details>
  </section>
''' + s[b:]
rep('<div class="sheet-head"><h2>เพิ่มรายจ่าย</h2>', '<div class="sheet-head"><h2 id="addTitle">เพิ่มรายจ่าย</h2>')
rep('@media (prefers-reduced-motion: reduce)', '''body{padding-top:max(12px,env(safe-area-inset-top,0px))}
.hright{display:flex;gap:8px;align-items:center}
.gear{border:1px solid var(--line);background:var(--surface);width:40px;height:40px;border-radius:999px;font-size:1.05rem;color:var(--muted)}
.copyrow{display:flex;gap:8px}
.copyrow input{font-family:var(--f-num);font-size:.8rem}
textarea{font:inherit;font-size:.85rem;color:var(--ink);background:var(--bg);border:1px solid var(--line);border-radius:10px;padding:10px 12px;width:100%;resize:vertical}
.tx{cursor:pointer}
.tx:hover{background:var(--accent-soft)}
.srcchip{font-size:.68rem;padding:0 6px;border-radius:999px;border:1px solid var(--line);color:var(--muted);margin-left:4px;vertical-align:1px}
.srcchip.review{color:var(--warn);border-color:currentColor;font-weight:600}
.notice button{margin-top:6px}
.rawtext{font-family:var(--f-num);font-size:.75rem;color:var(--muted);background:var(--bg);border-radius:8px;padding:8px 10px;white-space:pre-wrap;word-break:break-word;max-height:120px;overflow:auto}
@media (display-mode: standalone){#installCard{display:none}}
@media (prefers-reduced-motion: reduce)''')
rep('''    <div class="formerr" id="formErr"></div>''', '''    <div class="field" id="rawField" hidden><span class="lbl">ข้อความต้นฉบับ</span><div class="rawtext" id="rawText"></div></div>
    <div class="formerr" id="formErr"></div>''')
rep('''    html+=`<div class="tx"><span class="applogo" style="background:${appColor(x.app)}" aria-hidden="true">${esc(appInitial(x.app))}</span>
      <div class="meta"><div>${c.icon} ${esc(x.note||c.name)}</div><small>${esc(x.app)}${x.note?' · '+esc(c.name):''}</small></div>''',
    '''    const src=x.review?'<span class="srcchip review">รอตรวจ</span>':x.source==='sms'?'<span class="srcchip">SMS</span>':x.source==='slip'?'<span class="srcchip">สลิป</span>':'';
    html+=`<div class="tx" data-edit="${esc(x.id)}"><span class="applogo" style="background:${appColor(x.app)}" aria-hidden="true">${esc(appInitial(x.app))}</span>
      <div class="meta"><div>${c.icon} ${esc(x.note||x.payee||c.name)}</div><small>${esc(x.app)}${x.time?' · '+esc(x.time):''}${(x.note||x.payee)?' · '+esc(c.name):''}${src}</small></div>''')
rep("if(filter)list=list.filter(x=>filter.type==='cat'?x.cat===filter.v:x.app===filter.v);",
    "if(filter)list=list.filter(x=>filter.type==='review'?x.review:filter.type==='cat'?x.cat===filter.v:x.app===filter.v);")
rep("${esc(filter.type==='cat'?(CAT[filter.v]||CAT.other).name:filter.v)}",
    "${esc(filter.type==='review'?'รายการรอตรวจ':filter.type==='cat'?(CAT[filter.v]||CAT.other).name:filter.v)}")
rep("""  }else if($('notice').dataset.kind==='ex'){$('notice').hidden=true;$('notice').dataset.kind=''}""",
    """  }else if($('notice').dataset.kind==='ex'){$('notice').hidden=true;$('notice').dataset.kind=''}
  const nRev=items.filter(x=>x.review).length;
  const nk=$('notice').dataset.kind;
  if(nRev&&(!nk||nk==='review')){
    const n=$('notice');n.className='notice';n.hidden=false;n.dataset.kind='review';
    n.innerHTML=`<div><b>มี ${nRev} รายการจาก SMS/สลิป รอตรวจ</b><br>ระบบอ่านไม่ครบหรือไม่แน่ใจ แตะรายการเพื่อแก้แล้วกดยืนยัน<br><button class="act" data-showreview>ดูรายการรอตรวจ</button></div>`;
  }else if(!nRev&&nk==='review'){$('notice').hidden=true;$('notice').dataset.kind=''}""")
rep("""  if(e.target.closest('[data-close]')||e.target.classList.contains('overlay')){document.querySelectorAll('.overlay').forEach(o=>o.hidden=true);return}""",
    """  if(e.target.closest('[data-close]')||e.target.classList.contains('overlay')){document.querySelectorAll('.overlay').forEach(o=>{if(o.id!=='sheetLogin')o.hidden=true});return}
  if(e.target.closest('[data-showreview]')){month=(items.find(x=>x.review)||{date:todayStr}).date.slice(0,7);filter={type:'review'};render();$('ledger').scrollIntoView({block:'start'});return}
  const cp=e.target.closest('[data-copy]');
  if(cp){const inp=$(cp.dataset.copy);try{await navigator.clipboard.writeText(inp.value);toast('คัดลอกแล้ว')}catch(err){inp.select();toast('กดค้างเพื่อคัดลอก')}return}""")
rep("document.addEventListener('keydown',e=>{if(e.key==='Escape')document.querySelectorAll('.overlay').forEach(o=>o.hidden=true)});",
    "document.addEventListener('keydown',e=>{if(e.key==='Escape')document.querySelectorAll('.overlay').forEach(o=>{if(o.id!=='sheetLogin')o.hidden=true})});")
rep("""  const d=e.target.closest('[data-del]');
  if(d){""", """  const d=e.target.closest('[data-del]');
  const ed=!d&&e.target.closest('[data-edit]');
  if(ed){openEdit(ed.dataset.edit);return}
  if(d){""")
rep("""$('fab').onclick=()=>{
  $('addForm').reset();$('formErr').textContent='';""", """let editingId=null;
function openEdit(id){
  const x=items.find(i=>i.id===id);if(!x)return;
  editingId=id;$('addForm').reset();$('formErr').textContent='';
  $('addTitle').textContent=x.review?'ตรวจรายการ':'แก้ไขรายการ';
  $('fAmount').value=x.amount;$('fDate').value=x.date;$('fNote').value=x.note||x.payee||'';
  selApp=x.app;selCat=x.cat;buildPills();
  if(x.raw){$('rawText').textContent=x.raw;$('rawField').hidden=false}else $('rawField').hidden=true;
  $('saveBtn').textContent=x.review?'ยืนยันรายการนี้':'บันทึกการแก้ไข';
  $('sheetAdd').hidden=false;
}
$('fab').onclick=()=>{
  editingId=null;$('addTitle').textContent='เพิ่มรายจ่าย';$('saveBtn').textContent='บันทึก';$('rawField').hidden=true;
  $('addForm').reset();$('formErr').textContent='';""")
rep("""  try{await addExpense(rec);$('sheetAdd').hidden=true;month=date.slice(0,7)>curMonthKey?curMonthKey:date.slice(0,7);filter=null;render();toast('บันทึกแล้ว ฿'+fmt(rec.amount))}
  catch(err){
    if(err&&err.code==='invalid_argument'){readOnly=true;$('formErr').textContent='บัญชีนี้ดูได้อย่างเดียว บันทึกไม่ได้'}
    else if(err&&err.code==='quota_exceeded'){$('formErr').textContent='พื้นที่เก็บข้อมูลเต็ม ลบรายการเก่าบางส่วนก่อน'}
    else $('formErr').textContent='บันทึกไม่สำเร็จ ลองอีกครั้ง';
  }finally{$('saveBtn').disabled=false}""", """  try{
    if(editingId){
      const old=items.find(i=>i.id===editingId)||{};
      await updateExpense(editingId,Object.assign({},rec,{time:old.time||'',payee:old.payee||'',review:false}));
      if(filter&&filter.type==='review'&&!items.some(x=>x.review))filter=null;
      $('sheetAdd').hidden=true;render();toast('บันทึกแล้ว');
    }else{
      rec.source='manual';
      await addExpense(rec);$('sheetAdd').hidden=true;month=date.slice(0,7)>curMonthKey?curMonthKey:date.slice(0,7);filter=null;render();toast('บันทึกแล้ว ฿'+fmt(rec.amount));
    }
  }catch(err){
    if(err instanceof AuthError)showLogin(err.message);
    $('formErr').textContent=err&&err.message?err.message:'บันทึกไม่สำเร็จ ลองอีกครั้ง';
  }finally{$('saveBtn').disabled=false}""")
rep("render();\ninit();", """$('gearBtn').onclick=()=>{$('capUrl').value=location.origin+'/api/capture';$('settingsErr').textContent='';$('sheetSettings').hidden=false};
$('importBtn').onclick=async()=>{
  let d;try{d=JSON.parse($('importBox').value)}catch(e){$('settingsErr').textContent='ข้อมูลไม่ถูกต้อง ให้คัดลอกจากปุ่ม “ส่งออกข้อมูล” ใหม่';return}
  $('importBtn').disabled=true;
  try{const r=await api('/import',{method:'POST',body:d});$('importBox').value='';$('sheetSettings').hidden=true;toast(r.message||'นำเข้าแล้ว');await refresh()}
  catch(e){$('settingsErr').textContent=e.message}finally{$('importBtn').disabled=false}
};
$('logoutBtn').onclick=()=>{try{localStorage.removeItem(KEY_STORE)}catch(e){}appKey='';items=[];subs=[];settings={};loaded=false;$('sheetSettings').hidden=true;render();showLogin()};
render();
init();""")
open('src/app.html', 'w', encoding='utf8').write(s)
print('ok')
