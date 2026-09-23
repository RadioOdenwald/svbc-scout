/* =====================================================================
   SV/BSC Scout · Zugang: Anmeldung, Einladung, Laden der geschützten Daten
   Die öffentliche Seite enthält KEINE Spielerdaten. Erst nach erfolgreicher
   Anmeldung werden Datenbestand + App-Code geladen.
   ===================================================================== */
(function(){
'use strict';
const CFG=window.SVBC_CFG||{}, I=window.SVI;
const gate=document.getElementById('gate'), card=document.getElementById('gcard'), load=document.getElementById('gload');
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const ls={get(k){try{return localStorage.getItem(k);}catch(e){return null;}},set(k,v){try{v==null?localStorage.removeItem(k):localStorage.setItem(k,v);}catch(e){}}};
const ROLE_T={admin:'Admin',planer:'Kaderplaner',trainer:'Trainer / Scout',viewer:'Vorstand / Gast'};
const initials=n=>String(n||'?').trim().split(/\s+/).map(w=>w[0]).slice(0,2).join('').toUpperCase()||'?';
document.body.classList.add('gated');

if(!CFG.url||!CFG.anon||!window.supabase){
  card.innerHTML='<h2>Noch nicht eingerichtet</h2><p class="sub">Die Datenbank ist noch nicht verbunden. Bitte später erneut versuchen.</p>';
  showCard(); return;
}
const sb=window.supabase.createClient(CFG.url,CFG.anon,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false,storageKey:'svbc-auth',flowType:'implicit'}});
const SV=window.SVBC={sb,cfg:CFG,profile:null,offline:false,ROLE_T,initials,esc};

/* ---------- kleine Helfer ---------- */
function showCard(){ load.classList.add('hide'); card.style.display=''; }
function loading(txt,pct){
  load.classList.remove('hide'); card.style.display='none';
  load.querySelector('p').textContent=txt||'';
  const bar=load.querySelector('.bar');
  if(pct==null){ bar.classList.add('ind'); } else { bar.classList.remove('ind'); bar.querySelector('i').style.width=Math.max(4,Math.min(100,pct))+'%'; }
}
function msg(el,kind,text){ if(!el)return; el.className='g-msg '+kind+(text?' show':''); el.textContent=text||''; }
function busy(btn,on,label){ if(!btn)return; if(on){btn.dataset.l=btn.innerHTML;btn.disabled=true;btn.innerHTML='<span class="spin"></span>'+(label||'');} else {btn.disabled=false;if(btn.dataset.l)btn.innerHTML=btn.dataset.l;} }
function isNet(e){ const m=String((e&&(e.message||e.name))||e||''); return /fetch|network|Failed|Load failed|NetworkError|timeout|ERR_/i.test(m)||!navigator.onLine; }
function errText(e){
  const m=String((e&&e.message)||e||'');
  if(isNet(e))return 'Keine Verbindung. Bitte Internet prüfen und nochmal versuchen.';
  if(/Invalid login credentials/i.test(m))return 'E-Mail oder Passwort stimmt nicht.';
  if(/Email not confirmed/i.test(m))return 'Dein Zugang ist noch nicht bestätigt – nutze den Einladungslink.';
  if(/expired|invalid|otp/i.test(m)&&/token|otp|link|expired/i.test(m))return 'Der Link bzw. Code ist abgelaufen oder wurde schon benutzt. Frag deinen Admin nach einem neuen.';
  if(/Signups not allowed|not found|User not found/i.test(m))return 'Diese E-Mail-Adresse ist nicht freigeschaltet. Zugang gibt es nur mit Einladung.';
  if(/rate|too many|security purposes/i.test(m))return 'Zu viele Versuche. Bitte einen Moment warten.';
  if(/should be different/i.test(m))return 'Das neue Passwort muss sich vom alten unterscheiden.';
  if(/Password should be/i.test(m))return 'Das Passwort ist zu schwach.';
  return 'Das hat nicht geklappt ('+m.slice(0,120)+').';
}
function pwScore(p){ let s=0; if(p.length>=10)s++; if(p.length>=14)s++; if(/[a-z]/.test(p)&&/[A-Z]/.test(p))s++; if(/\d/.test(p))s++; if(/[^A-Za-z0-9]/.test(p))s++; return Math.min(4,s); }
function eyeWire(root){ root.querySelectorAll('.eye').forEach(b=>b.onclick=()=>{ const i=b.previousElementSibling; const sh=i.type==='password'; i.type=sh?'text':'password'; b.innerHTML=I(sh?'eyeoff':'eye'); }); }

/* ---------- IndexedDB: Datenbestand auf dem Gerät (nur für Angemeldete) ---------- */
const IDB={
  open(ver){ return new Promise((res,rej)=>{ const r=ver?indexedDB.open('svbc',ver):indexedDB.open('svbc');
    r.onupgradeneeded=()=>{ if(!r.result.objectStoreNames.contains('kv'))r.result.createObjectStore('kv'); };
    r.onsuccess=()=>{ const db=r.result; db.onversionchange=()=>db.close();
      if(!db.objectStoreNames.contains('kv')){ const v=db.version+1; db.close(); this.open(v).then(res,rej); return; }   /* Speicher reparieren */
      res(db); };
    r.onerror=()=>rej(r.error); r.onblocked=()=>rej(new Error('blocked')); }); },
  async get(k){ let db; try{ db=await this.open(); return await new Promise(res=>{ const t=db.transaction('kv').objectStore('kv').get(k); t.onsuccess=()=>res(t.result); t.onerror=()=>res(null); }); }catch(e){ return null; } finally{ try{db&&db.close();}catch(e){} } },
  async set(k,v){ let db; try{ db=await this.open(); await new Promise(res=>{ const t=db.transaction('kv','readwrite'); t.objectStore('kv').put(v,k); t.oncomplete=res; t.onerror=res; t.onabort=res; }); }catch(e){} finally{ try{db&&db.close();}catch(e){} } },
  async clear(){ try{ await new Promise(res=>{ const r=indexedDB.deleteDatabase('svbc'); r.onsuccess=r.onerror=()=>res(); r.onblocked=()=>setTimeout(res,1500); }); }catch(e){} }
};

/* ---------- Ansichten ---------- */
function viewLogin(note,kind){
  card.innerHTML=`<h2>Willkommen zurück</h2>
    <p class="sub">Melde dich mit deinem Vereinszugang an.</p>
    <form class="g-form" id="gLogin" autocomplete="on">
      <div class="g-msg" id="gMsg"></div>
      <div class="g-field"><label for="gEmail">E-Mail</label><div class="g-in"><input id="gEmail" type="email" autocomplete="username" inputmode="email" placeholder="name@beispiel.de" required value="${esc(ls.get('svbcLastEmail')||'')}"></div></div>
      <div class="g-field"><label for="gPw">Passwort <a id="gForgot">Vergessen?</a></label><div class="g-in"><input id="gPw" type="password" autocomplete="current-password" placeholder="••••••••••" required><button type="button" class="eye" aria-label="Passwort zeigen">${I('eye')}</button></div></div>
      <button class="g-btn" id="gGo" type="submit">Anmelden ${I('chev')}</button>
      <div class="g-or">oder</div>
      <button class="g-btn alt" id="gCodeBtn" type="button">${I('mail')} Code per E-Mail</button>
    </form>
    <div class="g-foot">${I('lock')}<span>Zugang nur auf Einladung. Alle Daten sind verschlüsselt übertragen und nur für freigeschaltete Personen sichtbar.</span></div>`;
  showCard(); eyeWire(card);
  const m=document.getElementById('gMsg'); if(note)msg(m,kind||'info',note);
  const em=document.getElementById('gEmail'), pw=document.getElementById('gPw');
  (em.value?pw:em).focus({preventScroll:true});
  document.getElementById('gLogin').onsubmit=async e=>{
    e.preventDefault(); const b=document.getElementById('gGo'); msg(m,'',''); busy(b,true,'Anmelden …');
    try{ const {error}=await sb.auth.signInWithPassword({email:em.value.trim(),password:pw.value}); if(error)throw error;
      ls.set('svbcLastEmail',em.value.trim()); await enter({}); }
    catch(err){ busy(b,false); msg(m,'err',errText(err)); pw.select(); }
  };
  document.getElementById('gCodeBtn').onclick=()=>viewCode(em.value.trim());
  document.getElementById('gForgot').onclick=()=>viewForgot(em.value.trim());
}
function viewCode(email,sent){
  card.innerHTML=`<h2>${sent?'Code eingeben':'Anmelden mit Code'}</h2>
    <p class="sub">${sent?'Wir haben dir einen Code an <b style="color:#dbe3f0">'+esc(email)+'</b> geschickt.':'Du bekommst einen Einmal-Code per E-Mail – ganz ohne Passwort.'}</p>
    <form class="g-form" id="gCodeF">
      <div class="g-msg" id="gMsg"></div>
      ${sent?`<div class="g-field"><label for="gCode">Code aus der E-Mail</label><div class="g-code"><input id="gCode" inputmode="numeric" autocomplete="one-time-code" maxlength="8" placeholder="––––––" required></div></div>`
            :`<div class="g-field"><label for="gEmail">E-Mail</label><div class="g-in"><input id="gEmail" type="email" autocomplete="username" inputmode="email" placeholder="name@beispiel.de" required value="${esc(email||'')}"></div></div>`}
      <button class="g-btn" id="gGo" type="submit">${sent?'Bestätigen':'Code senden'}</button>
      <button class="g-link" type="button" id="gBack">← Zurück zur Anmeldung</button>
    </form>`;
  showCard();
  const m=document.getElementById('gMsg');
  const f=document.getElementById(sent?'gCode':'gEmail'); f.focus({preventScroll:true});
  document.getElementById('gBack').onclick=()=>viewLogin();
  document.getElementById('gCodeF').onsubmit=async e=>{
    e.preventDefault(); const b=document.getElementById('gGo'); msg(m,'',''); busy(b,true);
    try{
      if(!sent){ const em=f.value.trim(); const {error}=await sb.auth.signInWithOtp({email:em,options:{shouldCreateUser:false}}); if(error)throw error; ls.set('svbcLastEmail',em); viewCode(em,true); }
      else{ const {error}=await sb.auth.verifyOtp({email,token:f.value.replace(/\D/g,''),type:'email'}); if(error)throw error; await enter({}); }
    }catch(err){ busy(b,false); msg(m,'err',errText(err)); }
  };
}
function viewForgot(email){
  card.innerHTML=`<h2>Passwort vergessen?</h2>
    <p class="sub">Kein Problem. Du hast zwei Wege:</p>
    <form class="g-form" id="gFg">
      <div class="g-msg" id="gMsg"></div>
      <div class="g-field"><label for="gEmail">E-Mail</label><div class="g-in"><input id="gEmail" type="email" autocomplete="username" required value="${esc(email||'')}"></div></div>
      <button class="g-btn" id="gGo" type="submit">${I('mail')} Link zum Zurücksetzen senden</button>
      <div class="g-msg info show">Schneller geht's oft direkt: Dein Admin kann dir in der Nutzerverwaltung jederzeit einen neuen Anmelde-Link erstellen.</div>
      <button class="g-link" type="button" id="gBack">← Zurück zur Anmeldung</button>
    </form>`;
  showCard();
  const m=document.getElementById('gMsg');
  document.getElementById('gBack').onclick=()=>viewLogin();
  document.getElementById('gFg').onsubmit=async e=>{
    e.preventDefault(); const b=document.getElementById('gGo'); busy(b,true);
    try{ const {error}=await sb.auth.resetPasswordForEmail(document.getElementById('gEmail').value.trim(),{redirectTo:location.origin+location.pathname}); if(error)throw error;
      busy(b,false); msg(m,'ok','Wenn die Adresse freigeschaltet ist, ist die E-Mail unterwegs. Bitte auch im Spam-Ordner nachsehen.'); }
    catch(err){ busy(b,false); msg(m,'err',errText(err)); }
  };
}
function viewSetPassword(mode,prof){
  const inv=mode==='invite';
  card.innerHTML=`<h2>${inv?'Willkommen im Team!':'Neues Passwort'}</h2>
    <p class="sub">${inv?'Leg jetzt dein persönliches Passwort fest – damit meldest du dich künftig an.':'Vergib ein neues Passwort für deinen Zugang.'}</p>
    ${prof?`<div class="g-welcome"><div class="uav">${esc(initials(prof.name||prof.email))}</div><div><b>${esc(prof.name||prof.email)}</b><span>${esc(ROLE_T[prof.role]||'')} · ${esc(prof.email)}</span></div></div>`:''}
    <form class="g-form" id="gSet">
      <div class="g-msg" id="gMsg"></div>
      <input type="email" autocomplete="username" value="${esc(prof&&prof.email||'')}" style="display:none">
      <div class="g-field"><label for="gPw1">Passwort</label><div class="g-in"><input id="gPw1" type="password" autocomplete="new-password" minlength="10" required placeholder="mindestens 10 Zeichen"><button type="button" class="eye" aria-label="Passwort zeigen">${I('eye')}</button></div>
        <div class="g-strength"><i id="gStr"></i></div><div class="g-hint" id="gStrT">Tipp: ein Satz aus mehreren Wörtern ist sicher und gut zu merken.</div></div>
      <div class="g-field"><label for="gPw2">Wiederholen</label><div class="g-in"><input id="gPw2" type="password" autocomplete="new-password" required></div></div>
      <button class="g-btn" id="gGo" type="submit">${inv?'Loslegen':'Passwort speichern'} ${I('chev')}</button>
    </form>`;
  showCard(); eyeWire(card);
  const m=document.getElementById('gMsg'), p1=document.getElementById('gPw1'), p2=document.getElementById('gPw2');
  p1.focus({preventScroll:true});
  p1.oninput=()=>{ const s=pwScore(p1.value), c=['#f05252','#f59e0b','#eab308','#22c55e','#16a34a'][s]; const i=document.getElementById('gStr'); i.style.width=(p1.value?20+s*20:0)+'%'; i.style.background=c;
    document.getElementById('gStrT').textContent=p1.value.length<10?'Noch '+(10-p1.value.length)+' Zeichen':['Schwach','Geht so','Ordentlich','Stark','Sehr stark'][s]; };
  document.getElementById('gSet').onsubmit=async e=>{
    e.preventDefault(); msg(m,'','');
    if(p1.value.length<10)return msg(m,'err','Bitte mindestens 10 Zeichen.');
    if(p1.value!==p2.value)return msg(m,'err','Die beiden Passwörter sind nicht gleich.');
    const b=document.getElementById('gGo'); busy(b,true,'Speichern …');
    try{ const {error}=await sb.auth.updateUser({password:p1.value}); if(error&&!/should be different/i.test(error.message))throw error;
      await sb.rpc('me_update',{p_name:null,p_pw_set:true}); if(SV.profile)SV.profile.pw_set=true;
      await loadAndStart(); }
    catch(err){ busy(b,false); msg(m,'err',errText(err)); }
  };
}
function viewBlocked(kind){
  const locked=kind==='locked';
  card.innerHTML=`<h2>${locked?'Zugang gesperrt':'Kein Zugang'}</h2>
    <p class="sub">${locked?'Dein Zugang wurde vom Admin deaktiviert. Wenn das ein Versehen ist, sprich ihn bitte direkt an.':'Für dieses Konto ist (noch) keine Rolle freigeschaltet. Zugang gibt es nur mit Einladung durch den Admin.'}</p>
    <div class="g-form"><button class="g-btn alt" id="gOut">${I('logout')} Abmelden</button></div>`;
  showCard(); document.getElementById('gOut').onclick=()=>SV.signOut();
}

/* ---------- Ablauf ---------- */
async function enter(opts){
  loading('Anmelden …');
  let prof=null;
  try{ const {data,error}=await sb.rpc('touch_me'); if(error)throw error; prof=Array.isArray(data)?data[0]:data; SV.offline=false; }
  catch(e){
    if(isNet(e)){ try{ prof=JSON.parse(ls.get('svbcProfile')||'null'); }catch(_){ prof=null; } SV.offline=true;
      if(!prof){ viewLogin('Keine Verbindung. Für die erste Anmeldung auf diesem Gerät wird Internet gebraucht.','err'); return; } }
    else { viewLogin(errText(e),'err'); return; }
  }
  if(!prof){ viewBlocked('none'); return; }
  if(!prof.active){ ls.set('svbcProfile',null); viewBlocked('locked'); return; }
  SV.profile=prof; ls.set('svbcProfile',JSON.stringify(prof));
  if(opts.mode==='recovery'){ viewSetPassword('recovery',prof); return; }
  if(opts.viaLink&&!prof.pw_set){ viewSetPassword('invite',prof); return; }
  await loadAndStart();
}
async function fetchDataset(token){
  const r=await fetch(CFG.url+'/rest/v1/dataset?id=eq.1&select=version,body',{headers:{apikey:CFG.anon,Authorization:'Bearer '+token,Accept:'application/vnd.pgrst.object+json'}});
  if(r.status===406)throw new Error('kein-datenbestand');
  if(!r.ok)throw new Error('Datenbestand: HTTP '+r.status);
  const total=+r.headers.get('content-length')||+(CFG.dataBytes||0)||3200000;
  if(!r.body||!r.body.getReader){ loading('Spielerdaten werden geladen …',60); return await r.json(); }
  const rd=r.body.getReader(), parts=[]; let got=0;
  for(;;){ const {done,value}=await rd.read(); if(done)break; parts.push(value); got+=value.length; loading('Spielerdaten werden geladen … '+Math.round(got/1048576*10)/10+' MB',Math.min(96,got/total*100)); }
  const buf=new Uint8Array(got); let o=0; for(const p of parts){ buf.set(p,o); o+=p.length; }
  return JSON.parse(new TextDecoder().decode(buf));
}
async function loadAndStart(){
  loading('Daten werden vorbereitet …');
  const {data:{session}}=await sb.auth.getSession();
  let cached=await IDB.get('dataset'), ver=null, ds=null;
  if(!SV.offline){ try{ const {data,error}=await sb.rpc('dataset_version'); if(error)throw error; ver=data; }catch(e){ if(!isNet(e))throw e; SV.offline=true; } }
  if(cached&&cached.version&&(SV.offline||cached.version===ver)){ ds=cached; }
  else if(!SV.offline&&session){
    try{ ds=await fetchDataset(session.access_token); await IDB.set('dataset',ds); }
    catch(e){ if(String(e.message)==='kein-datenbestand'){ card.innerHTML='<h2>Noch keine Daten</h2><p class="sub">Der Spieler-Datenbestand wurde noch nicht hochgeladen.</p>'; showCard(); return; } if(cached){ ds=cached; SV.offline=true; } else throw e; }
  }
  if(!ds){ viewLogin('Keine Verbindung. Für den ersten Start auf diesem Gerät wird Internet gebraucht.','err'); return; }
  window.__SVBC_DATA=ds.body; window.__SVBC_USER=SV.profile; window.__SVBC_DSVER=ds.version;
  loading('App wird gestartet …',100);
  document.body.classList.add('role-'+SV.profile.role);
  if(!(SV.profile.role==='admin'||SV.profile.role==='planer'))document.body.classList.add('ro');
  const s=document.createElement('script'); s.src='app.js?v='+encodeURIComponent(CFG.build||'');
  s.onload=()=>{ document.body.classList.remove('gated'); gate.classList.add('done'); setTimeout(()=>{ gate.style.display='none'; },600); };
  s.onerror=()=>{ viewLogin('Die App konnte nicht geladen werden. Bitte neu laden.','err'); };
  document.body.appendChild(s);
}

/* ---------- Öffentliche Funktionen für die App ---------- */
SV.signOut=async function(){
  window.__svbcOut=true;
  try{ await sb.auth.signOut({scope:'local'}); }catch(e){}
  ['svbcOutbox','svbcProfile','svbcReloadFor'].forEach(k=>ls.set(k,null));
  try{ sessionStorage.clear(); }catch(e){}
  await IDB.clear();
  location.replace(location.pathname);
};
SV.changePassword=async function(pw){
  const {error}=await sb.auth.updateUser({password:pw}); if(error)throw new Error(errText(error));
  await sb.rpc('me_update',{p_name:null,p_pw_set:true});
};
SV.admin=async function(action,payload){
  const {data,error}=await sb.functions.invoke('admin-users',{body:Object.assign({},payload||{},{action,app_url:location.origin+location.pathname})});
  if(error){ let t=error.message; try{ const j=await error.context.json(); if(j&&j.error)t=j.error; }catch(e){} throw new Error(t); }
  if(data&&data.error)throw new Error(data.error);
  return data;
};
SV.errText=errText; SV.isNet=isNet; SV.pwScore=pwScore;
sb.auth.onAuthStateChange(ev=>{ if(ev==='SIGNED_OUT'&&window.__SVBC_USER){ location.replace(location.pathname); } });

/* ---------- Start: Links aus Einladungen / E-Mails auswerten ---------- */
(async function start(){
  const h=new URLSearchParams(location.hash.slice(1)), q=new URLSearchParams(location.search);
  const clean=()=>{ try{ history.replaceState(null,'',location.pathname); }catch(e){} };
  try{
    for(const [tag,type] of [['invite','invite'],['login','magiclink'],['recovery','recovery']]){
      if(h.get(tag)){
        const token_hash=h.get(tag); clean(); loading('Einladung wird geprüft …');
        await sb.auth.signOut({scope:'local'}).catch(()=>{});
        const {error}=await sb.auth.verifyOtp({token_hash,type});
        if(error){ viewLogin(errText(error),'err'); return; }
        await enter({viaLink:true,mode:type==='recovery'?'recovery':'invite'}); return;
      }
    }
    if(h.get('access_token')&&h.get('refresh_token')){          /* Link aus Supabase-E-Mail (z.B. Passwort zurücksetzen) */
      const type=h.get('type'); clean(); loading('Anmelden …');
      const {error}=await sb.auth.setSession({access_token:h.get('access_token'),refresh_token:h.get('refresh_token')});
      if(error){ viewLogin(errText(error),'err'); return; }
      await enter({viaLink:true,mode:type==='recovery'?'recovery':'invite'}); return;
    }
    if(h.get('error_description')){ clean(); viewLogin(errText(new Error(h.get('error_description'))),'err'); return; }
    if(q.get('code')){ clean(); loading('Anmelden …'); const {error}=await sb.auth.exchangeCodeForSession(q.get('code')); if(error){ viewLogin(errText(error),'err'); return; } await enter({viaLink:true}); return; }
    const {data:{session}}=await sb.auth.getSession();
    if(session){ await enter({}); return; }
    if(!navigator.onLine&&ls.get('svbcProfile')){ SV.offline=true; await enter({}); return; }
    viewLogin();
  }catch(e){ viewLogin(errText(e),'err'); }
})();
})();
