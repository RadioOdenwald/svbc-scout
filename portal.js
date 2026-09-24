/* SV/BSC Scout · Kabine (Spielerseite über den Team-Link) – Abstimmen und Mannschaftskasse, ohne Anmeldung */
(function(){
  'use strict';
  const C=window.KAB_CFG||{}, $=s=>document.querySelector(s), app=$('#app');
  const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const ls={get(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } },set(k,v){ try{ localStorage.setItem(k,v); }catch(e){} },del(k){ try{ localStorage.removeItem(k); }catch(e){} }};
  // Geteilter Bericht: …/b-<code> (PDF/Excel aus der App, ohne Anmeldung)
  const bm=location.pathname.match(/\/b-([A-Za-z0-9]{10,16})\/?$/);
  if(bm){ bericht(bm[1]); return; }
  async function bericht(tok){
    app.innerHTML='<div class="card empty"><h2>Lade Bericht …</h2></div>';
    try{ const r=await fetch(C.url+'/rest/v1/rpc/bericht_get',{method:'POST',headers:{'Content-Type':'application/json',apikey:C.anon,Authorization:'Bearer '+C.anon},body:JSON.stringify({p_token:tok})});
      const b=await r.json(); if(!r.ok||!b||!b.data)throw new Error('Der Link ist abgelaufen oder ungültig.');
      const s2=atob(b.data), u=new Uint8Array(s2.length); for(let i=0;i<s2.length;i++)u[i]=s2.charCodeAt(i); const url=URL.createObjectURL(new Blob([u],{type:b.mime})), pdf=/pdf/.test(b.mime);
      app.innerHTML=`<div class="card hero"><span class="pill">${pdf?'📄 PDF':'📊 Excel'}</span><h2 style="margin:12px 0 4px">${esc(b.name.replace(/\.(pdf|xlsx)$/,''))}</h2><small>SV/BSC Mörlenbach · erstellt ${esc(new Date(b.created_at).toLocaleDateString('de-DE'))}</small></div>
        <a class="pay" href="${url}" download="${esc(b.name)}">Herunterladen</a>${pdf?`<a class="btn2" style="display:block;text-align:center;text-decoration:none;color:inherit" href="${url}" target="_blank" rel="noopener">Im Browser öffnen</a>`:''}`;
    }catch(e){ app.innerHTML=`<div class="card err empty"><h2>Bericht nicht verfügbar</h2><p class="note">${esc(e.message)}</p></div>`; }
  }
  const hp=new URLSearchParams(location.hash.slice(1));
  // Link-Formen: …/team.html#k=<code>  oder kurz …/<code> (persönlicher Link)
  const seg=(location.pathname.split('/').pop()||''), pathKey=/^[A-Za-z0-9]{8,40}$/.test(seg)&&!/\.html?$/.test(seg)?seg:'';
  let KEY=hp.get('k')||pathKey||ls.get('kab_k')||''; if(hp.get('k')||pathKey)ls.set('kab_k',KEY);
  const FOCUS=hp.get('a')||null;
  let ME=null; try{ ME=JSON.parse(ls.get('kab_me')||'null'); }catch(e){}
  let S=null, view=FOCUS?'abst':(hp.get('v')==='kasse'?'kasse':(ls.get('kab_view')||'abst')), busy=false;
  const REASONS={arbeit:'Arbeit/Schicht',urlaub:'Urlaub',krank:'Krank',verletzt:'Verletzt',uni:'Schule/Uni',familie:'Familie',privat:'Privat'};
  const ART={training:'Training',spiel:'Spiel',event:'Event',sonstiges:'Termin'};
  const eur=v=>(Math.round((+v||0)*100)/100).toLocaleString('de-DE',{style:'currency',currency:'EUR'});
  const wd=d=>{ try{ return new Date(d+'T12:00:00').toLocaleDateString('de-DE',{weekday:'long',day:'2-digit',month:'2-digit'}); }catch(e){ return d; } };
  const toast=t=>{ document.querySelectorAll('.toast').forEach(x=>x.remove()); const e=document.createElement('div'); e.className='toast'; e.textContent=t; document.body.appendChild(e); setTimeout(()=>e.remove(),2600); };
  async function rpc(fn,body){
    const r=await fetch(C.url+'/rest/v1/rpc/'+fn,{method:'POST',headers:{'Content-Type':'application/json',apikey:C.anon,Authorization:'Bearer '+C.anon},body:JSON.stringify(body)});
    const j=await r.json().catch(()=>null); if(!r.ok)throw new Error((j&&j.message)||('Fehler '+r.status)); return j;
  }
  async function load(){
    if(!KEY||KEY.length<8){ app.innerHTML=`<div class="card empty"><h2>Link fehlt</h2><p class="note">Bitte den Kabinen-Link aus der WhatsApp-Gruppe öffnen.</p></div>`; return; }
    try{ S=await rpc('portal_state',{p_key:KEY}); if(S.ich){ ME={id:S.ich.id,name:S.ich.name||'Du',fest:true}; ls.set('kab_me',JSON.stringify(ME)); } render(); }
    catch(e){ app.innerHTML=`<div class="card err empty"><h2>Link ungültig</h2><p class="note">${esc(e.message)}</p></div>`; if(/ungültig|erneuert/.test(e.message))ls.del('kab_k'); }
  }
  function roster(){
    const m=new Map(); (S.polls||[]).forEach(p=>(p.teilnehmer||[]).forEach(t=>m.set(t.id,t.name)));
    ((S.kasse&&S.kasse.buchungen)||[]).forEach(b=>{ if(b.p&&b.name&&!m.has(b.p))m.set(b.p,b.name); });
    return [...m.entries()].map(([id,name])=>({id,name})).sort((a,b)=>a.name.localeCompare(b.name,'de'));
  }
  function meBtn(){ const b=$('#me'); if(!ME){ b.style.display='none'; return; } b.style.display=''; const ini=ME.name.split(' ').map(w=>w[0]).slice(0,2).join('');
    b.innerHTML=`<i>${esc(ini)}</i>${esc(ME.name.split(' ')[0])}`; b.onclick=()=>{ if(ME.fest){ toast('Das ist dein persönlicher Link – nur für dich.'); return; } if(confirm('Nicht '+ME.name+'? Namen neu wählen.')){ ME=null; ls.del('kab_me'); render(); } }; }
  function render(){
    meBtn();
    const R=roster();
    if(ME&&!R.some(x=>x.id===ME.id)&&R.length){ /* nicht mehr auf der Liste – trotzdem anzeigen */ }
    if(!ME){
      const tgt=target();
      app.innerHTML=`<div class="card"><h2>Wer bist du?</h2><p class="note">Tippe auf deinen <b>Vor- und Nachnamen</b> – das Handy merkt es sich. Danach reicht ein Klick: dabei oder nicht dabei.</p>
        <input class="search" id="q" type="search" placeholder="Name suchen …" autocomplete="off"><div class="pick" id="pk"></div></div>
        ${tgt?`<div class="card neu"><h2>Nicht in der Liste?</h2><p class="note">Dann trag dich mit Vor- und Nachnamen ein – beides ist Pflicht.</p>
          <div class="nm"><input class="txt" id="gV" placeholder="Vorname" autocomplete="given-name" maxlength="30"><input class="txt" id="gN" placeholder="Nachname" autocomplete="family-name" maxlength="40"></div>
          <button class="btn2 full" id="gGo">Eintragen</button></div>`:'<p class="note" style="text-align:center">Du fehlst? Kurz beim Trainer melden – er setzt dich auf die Liste.</p>'}`;
      const gg=$('#gGo'); if(gg)gg.onclick=()=>gast(tgt.id,$('#gV').value,$('#gN').value);
      const draw=q=>{ const n=(q||'').toLowerCase(); $('#pk').innerHTML=R.filter(x=>!n||x.name.toLowerCase().includes(n)).map(x=>`<button data-id="${esc(x.id)}">${esc(x.name)}</button>`).join('')||'<p class="note">Kein Treffer.</p>';
        document.querySelectorAll('#pk [data-id]').forEach(b=>b.onclick=()=>{ ME={id:b.dataset.id,name:R.find(x=>x.id===b.dataset.id).name}; ls.set('kab_me',JSON.stringify(ME)); render(); }); };
      draw(''); $('#q').oninput=e=>draw(e.target.value); return;
    }
    app.innerHTML=`<div class="tabs"><button data-v="abst" class="${view==='abst'?'on':''}">Abstimmungen</button><button data-v="kasse" class="${view==='kasse'?'on':''}">Mannschaftskasse</button></div><div id="body"></div>`;
    document.querySelectorAll('[data-v]').forEach(b=>b.onclick=()=>{ view=b.dataset.v; ls.set('kab_view',view); render(); });
    (view==='kasse'?kasse:polls)($('#body'));
  }
  // Abstimmung, in die man sich selbst einträgt: die aus dem Link, sonst die nächste offene
  function target(){ if(S.ich)return null; const open=(S.polls||[]).filter(p=>p.datum>=S.heute&&!p.geschlossen).sort((a,b)=>a.datum<b.datum?-1:1);
    return open.find(p=>p.id===FOCUS)||open[0]||null; }
  async function gast(poll,v,n){
    v=String(v||'').trim(); n=String(n||'').trim();
    if(v.length<2||n.length<2){ toast('Bitte Vor- und Nachname eintragen'); return; }
    if(busy)return; busy=true;
    try{ const r=await rpc('portal_gast',{p_key:KEY,p_poll:poll,p_vorname:v,p_nachname:n}); ME={id:r.id,name:r.name}; ls.set('kab_me',JSON.stringify(ME));
      toast(r.neu?'✓ Eingetragen – jetzt zu- oder absagen':'✓ Gefunden: '+r.name); busy=false; await load(); return; }
    catch(e){ toast('⚠️ '+e.message); }
    busy=false;
  }
  function polls(B){
    const P=(S.polls||[]).filter(p=>p.datum>=S.heute).sort((a,b)=>(a.id===FOCUS?-1:b.id===FOCUS?1:0)||(a.datum<b.datum?-1:a.datum>b.datum?1:0));
    const wa=S.ich&&S.ich.whatsapp?`<div class="card wa"><b>WhatsApp-Erinnerungen</b><span>${S.ich.optout?'Aus – du bekommst keine Nachrichten.':'An – du bekommst den Link zum Training und ggf. eine Erinnerung.'}</span><button class="btn2" id="waT">${S.ich.optout?'Wieder einschalten':'Ausschalten'}</button></div>`:'';
    if(!P.length){ B.innerHTML='<div class="card empty"><h2>Gerade nichts offen</h2><p class="note">Sobald der Trainer eine Abstimmung anlegt, steht sie hier.</p></div>'+wa; waWire(); return; }
    B.innerHTML=P.map(p=>{ const T=p.teilnehmer||[], V=new Map((p.votes||[]).map(v=>[v.p,v])), mine=V.get(ME.id), inL=T.some(t=>t.id===ME.id);
      const g={zu:[],vllt:[],ab:[],offen:[]}; T.forEach(t=>{ const v=V.get(t.id); (v?g[v.a]:g.offen).push(t.name); }); const n=T.length||1, pc=x=>Math.round(x/n*100);
      const closed=p.geschlossen;
      return `<div class="card" id="p-${esc(p.id)}">${mine?'<span class="done">✓ abgestimmt</span>':''}<span class="pill ${p.art==='spiel'?'spiel':''}">${esc(ART[p.art]||'Termin')}</span>
        <h2>${esc(p.titel)}</h2><div class="meta">${esc(wd(p.datum))}${p.zeit?' · '+esc(p.zeit)+' Uhr':''}${p.ort?' · '+esc(p.ort):''}</div>
        ${p.notiz?`<p class="note">${esc(p.notiz)}</p>`:''}${p.frist?`<p class="note">Bitte bis ${esc(new Date(p.frist).toLocaleString('de-DE',{weekday:'short',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}))} Uhr antworten.</p>`:''}
        ${closed?'<p class="note"><b>Abstimmung geschlossen.</b></p>':inL?`<div class="ans">${[['zu','👍','Bin dabei'],['ab','✋','Nicht dabei']].map(([a,i,t])=>`<button class="${a}${mine&&mine.a===a?' on':''}" data-poll="${esc(p.id)}" data-a="${a}"><span>${i}</span>${t}</button>`).join('')}</div>
          ${mine&&mine.a==='ab'?`<div class="why">${Object.entries(REASONS).map(([k,t])=>`<button class="${mine.g===k?'on':''}" data-poll="${esc(p.id)}" data-g="${k}">${t}</button>`).join('')}</div><input class="txt" data-poll="${esc(p.id)}" data-n maxlength="200" placeholder="Kurzer Hinweis (optional)" value="${esc(mine.n||'')}">`:''}`:S.ich?'<p class="note">Du stehst bei diesem Termin nicht auf der Liste.</p>':`<p class="note">Du stehst bei diesem Termin noch nicht auf der Liste.</p><button class="btn2" data-self="${esc(p.id)}">Mich eintragen</button>`}
        ${inL&&!closed?'<p class="note">Du kannst deine Antwort bis zum Training jederzeit ändern.</p>':''}
        <div class="bar"><i class="ok" style="width:${pc(g.zu.length)}%"></i><i class="mid" style="width:${pc(g.vllt.length)}%"></i><i class="bad" style="width:${pc(g.ab.length)}%"></i></div>
        <div class="cnt"><span><b>${g.zu.length}</b> dabei</span>${g.vllt.length?`<span><b>${g.vllt.length}</b> vielleicht</span>`:''}<span><b>${g.ab.length}</b> nicht</span><span><b>${g.offen.length}</b> offen</span></div>
        <details><summary>Wer hat was gesagt?</summary>${[['zu','ok','Dabei'],['vllt','mid','Vielleicht'],['ab','bad','Nicht dabei'],['offen','','Noch keine Antwort']].map(([k,c,t])=>g[k].length?`<h3>${t}</h3><div class="who">${g[k].map(x=>`<span class="${c}">${esc(x)}</span>`).join('')}</div>`:'').join('')}</details></div>`; }).join('');
    B.insertAdjacentHTML('beforeend',wa); waWire();
    B.querySelectorAll('[data-a]').forEach(b=>b.onclick=()=>vote(b.dataset.poll,b.dataset.a));
    B.querySelectorAll('[data-self]').forEach(b=>b.onclick=()=>{ const w=ME.name.trim().split(/\s+/); gast(b.dataset.self,w[0],w.slice(1).join(' ')); });
    B.querySelectorAll('[data-g]').forEach(b=>b.onclick=()=>{ const p=S.polls.find(x=>x.id===b.dataset.poll), v=(p.votes||[]).find(x=>x.p===ME.id); vote(p.id,'ab',b.dataset.g,v&&v.n); });
    B.querySelectorAll('[data-n]').forEach(i=>{ let t=null; i.oninput=()=>{ clearTimeout(t); t=setTimeout(()=>{ const p=S.polls.find(x=>x.id===i.dataset.poll), v=(p.votes||[]).find(x=>x.p===ME.id); vote(p.id,'ab',v&&v.g,i.value,true); },900); }; });
    if(FOCUS){ const el=document.getElementById('p-'+FOCUS); if(el&&!window.__kabScrolled){ window.__kabScrolled=1; el.scrollIntoView({block:'start'}); } }
  }
  function waWire(){ const b=$('#waT'); if(!b)return; b.onclick=async()=>{ try{ const an=!!S.ich.optout; await rpc('portal_whatsapp',{p_key:KEY,p_an:an}); S.ich.optout=!an; toast(an?'✓ WhatsApp-Erinnerungen an':'✓ Keine WhatsApp-Nachrichten mehr'); render(); }catch(e){ toast('⚠️ '+e.message); } }; }
  async function vote(poll,a,g,n,quiet){
    if(busy)return; busy=true;
    try{ await rpc('portal_vote',{p_key:KEY,p_poll:poll,p_player:ME.id,p_antwort:a,p_grund:g||null,p_notiz:n||null});
      const p=S.polls.find(x=>x.id===poll); p.votes=(p.votes||[]).filter(v=>v.p!==ME.id).concat([{p:ME.id,a,g:a==='ab'?(g||null):null,n:n||null,at:new Date().toISOString()}]);
      if(!quiet){ toast(a==='zu'?'👍 Du bist dabei – danke!':a==='ab'?(g?'✓ Gespeichert':'✓ Nicht dabei – tipp bitte kurz den Grund an'):'✓ Gespeichert'); render(); }
    }catch(e){ toast('⚠️ '+e.message); }
    busy=false;
  }
  function kasse(B){
    const K=S.kasse||{}, cfg=K.cfg||{}, L=K.buchungen||[];
    const bez=L.filter(b=>b.status==='bezahlt'), KT=K.konten||{bank:(+cfg.anfang||0)+bez.filter(b=>b.art!=='ausgabe').reduce((a,b)=>a+ +b.betrag,0)-bez.filter(b=>b.art==='ausgabe').reduce((a,b)=>a+ +b.betrag,0),paypal:0,bar:0};
    const stand=(+KT.bank||0)+(+KT.paypal||0)+(+KT.bar||0), KO=[['bank','🏦 Bankkonto'],['paypal','🅿️ PayPal'],['bar','💶 Bar']].filter(([k])=>k!=='bar'||+KT.bar), FIX={bank:'Überweisung',paypal:'PayPal',bar:'bar'};
    const face=i=>{ const [k,t]=KO[i%KO.length]; return `<span class="pill">${t} ⟲</span><div class="big">${eur(KT[k])}</div><small>Gesamt ${eur(stand)}${cfg.kassenwart?' · Kassenwart: '+esc(cfg.kassenwart):''}</small>`; };
    const offen=b=>b.status==='offen'||b.status==='gemeldet';
    const mine=L.filter(b=>b.p===ME.id), myOpen=mine.filter(b=>b.status==='offen'), myG=mine.filter(b=>b.status==='gemeldet'), sum=myOpen.reduce((a,b)=>a+ +b.betrag,0);
    const per=new Map(); L.filter(b=>b.p&&(b.art==='strafe'||b.art==='beitrag')).forEach(b=>{ const o=per.get(b.p)||{name:b.name||'?',off:0,bez:0}; if(offen(b))o.off+= +b.betrag; else if(b.status==='bezahlt')o.bez+= +b.betrag; per.set(b.p,o); });
    const P=[...per.values()].sort((a,b)=>b.off-a.off||b.bez-a.bez);
    const pay=cfg.paypal&&sum>0?`https://www.paypal.com/paypalme/${encodeURIComponent(cfg.paypal)}/${sum.toFixed(2)}EUR`:null;
    B.innerHTML=`<div class="flip" id="flip"><div class="flin"><div class="card hero fl-f">${face(0)}</div><div class="card hero fl-b"></div></div></div>
      ${C.kasse?`<a class="mklink" href="${esc(C.kasse.replace(/\/?$/,'/')+'#k='+encodeURIComponent(KEY))}"><span>🏆</span><b>Top-Supporter &amp; Kassen-Transparenz</b><i>→</i></a>`:''}
      <div class="card mine"><h2>Deine Strafen</h2>${mine.length?`<div class="grid2" style="margin-top:12px"><div class="stat"><span>Offen</span><b class="${sum?'mid':'ok'}">${eur(sum)}</b></div><div class="stat"><span>Bezahlt</span><b>${eur(mine.filter(b=>b.status==='bezahlt').reduce((a,b)=>a+ +b.betrag,0))}</b></div></div>
        ${pay?`<a class="pay" href="${esc(pay)}" target="_blank" rel="noopener">Mit PayPal bezahlen · ${eur(sum)}</a><p class="note">Bitte „Freunde &amp; Familie“ wählen – dann kostet es nichts.</p>`:''}
        ${sum&&cfg.iban?`<div class="iban"><span>Oder per Überweisung</span><b>${esc(cfg.iban.replace(/(.{4})/g,'$1 ').trim())}</b><small>${esc(cfg.kontoinhaber||'')} · Verwendungszweck: Mannschaftskasse ${esc(ME.name)}</small><button class="btn2" id="ibanCp">IBAN kopieren</button></div>`:''}
        ${sum?`<button class="btn2" id="paid">Ich habe bezahlt</button><div class="weg" id="weg" hidden><p class="note"><b>Wie hast du bezahlt?</b> Der Kassenwart schaut dann aufs richtige Konto.</p><div class="ans">${['paypal','bank','bar'].map(k=>`<button data-weg="${k}"><span>${{paypal:'🅿️',bank:'🏦',bar:'💶'}[k]}</span>${{paypal:'PayPal',bank:'Überweisung',bar:'Bar'}[k]}</button>`).join('')}</div></div>`:''}${myG.length?`<p class="note">⏳ ${myG.length} Posten als bezahlt gemeldet${myG[0].zahlweg?' ('+FIX[myG[0].zahlweg]+')':''} – zählt, sobald der Kassenwart den Eingang abhakt.</p>`:''}
        <h3>Deine Posten</h3>${mine.map(b=>`<div class="row"><b>${esc(b.titel)}</b><small>${esc(new Date(b.datum+'T12:00:00').toLocaleDateString('de-DE'))}</small><em>${eur(b.betrag)}</em><span class="st ${esc(b.status)}">${esc(b.status)}</span></div>`).join('')}`
        :'<p class="note">Weiße Weste – keine Strafen. 😇</p>'}${cfg.hinweis?`<p class="note">${esc(cfg.hinweis)}</p>`:''}</div>
      <div class="card"><h2>Alle Spieler</h2>${P.length?P.map(x=>`<div class="row"><b>${esc(x.name)}</b>${x.off?`<em class="mid">${eur(x.off)} offen</em>`:'<em class="ok">✓</em>'}<small>${eur(x.bez)} bezahlt</small></div>`).join(''):'<p class="note">Noch keine Einträge.</p>'}</div>
      ${(K.katalog||[]).length?`<div class="card"><h2>Strafenkatalog</h2>${K.katalog.map(k=>`<div class="row"><b>${esc(k.titel)}</b><em>${eur(k.betrag)}</em></div>`).join('')}</div>`:''}
      <div class="card"><h2>Letzte Buchungen</h2>${L.slice(0,40).map(b=>`<div class="row"><b>${b.art==='ausgabe'?'➖ ':b.art==='einzahlung'?'➕ ':''}${esc(b.p?b.name||'':b.titel)}</b><small>${b.p?esc(b.titel):''}</small><em class="${b.art==='ausgabe'?'bad':''}">${b.art==='ausgabe'?'−':''}${eur(b.betrag)}</em></div>`).join('')||'<p class="note">Noch keine Buchungen.</p>'}</div>`;
    const ic=$('#ibanCp'); if(ic)ic.onclick=async()=>{ try{ await navigator.clipboard.writeText(cfg.iban); toast('✓ IBAN kopiert'); }catch(e){ prompt('IBAN:',cfg.iban); } };
    const pd=$('#paid'); if(pd)pd.onclick=()=>{ pd.hidden=true; $('#weg').hidden=false; };
    document.querySelectorAll('[data-weg]').forEach(b=>b.onclick=async()=>{ if(busy)return; busy=true;
      try{ const n=await rpc('portal_bezahlt',{p_key:KEY,p_player:ME.id,p_weg:b.dataset.weg}); toast(`✓ ${n} Posten gemeldet (${FIX[b.dataset.weg]}) – der Kassenwart hakt ab`); busy=false; await load(); }catch(e){ busy=false; toast('⚠️ '+e.message); } });
    let fi=0, fb=false; const fl=$('#flip'); if(fl&&KO.length>1)fl.onclick=()=>{ if(fb)return; fb=true; const inn=fl.querySelector('.flin'); fl.querySelector('.fl-b').innerHTML=face(fi+1); inn.classList.add('turn');
      setTimeout(()=>{ fi++; fl.querySelector('.fl-f').innerHTML=face(fi); inn.style.transition='none'; inn.classList.remove('turn'); void inn.offsetWidth; inn.style.transition=''; fb=false; },620); };
  }
  window.addEventListener('hashchange',()=>location.reload());
  document.addEventListener('visibilitychange',()=>{ if(document.visibilityState==='visible'&&S)load(); });
  load();
})();
