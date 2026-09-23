/* ================= DATEN ================= */
const DATA = window.__SVBC_DATA;
const LIGA_W = {GL:1.55, KOL:1.25, A:1.00, B:0.78, C:0.60, D:0.42};
const LIGA_NAME = {GL:'Gruppenliga', KOL:'Kreisoberliga', A:'Kreisliga A', B:'Kreisliga B', C:'Kreisliga C', D:'Kreisliga D', JUG:'Jugend'};
const POS_W = {
  'ST':{tempo:.25,technik:.2,zweikampf:.15,spielint:.15,mentalitaet:.25},
  'Flügel':{tempo:.35,technik:.25,zweikampf:.05,spielint:.15,mentalitaet:.2},
  'OM':{tempo:.15,technik:.3,zweikampf:.1,spielint:.3,mentalitaet:.15},
  'ZM':{tempo:.1,technik:.2,zweikampf:.25,spielint:.3,mentalitaet:.15},
  'IV':{tempo:.1,technik:.1,zweikampf:.35,spielint:.25,mentalitaet:.2},
  'AV':{tempo:.3,technik:.15,zweikampf:.25,spielint:.15,mentalitaet:.15},
  'TW':{tempo:.05,technik:.15,zweikampf:.2,spielint:.35,mentalitaet:.25},
};
const DEF_WEIGHTS = {prod:28, share:14, ctx:8, pot:13, trend:14, presse:10, scout:13};
let W = {...DEF_WEIGHTS};

const V6DEF = {photo:null, status:'Neu', geb:null, fuss:null, groesse:null};
let players = DATA.players.map(p=>({...V6DEF, ...p, isJugend:false}));
DATA.jugend.forEach(j=>{
  players.push({
    id:j.id, name:j.name, club:j.club, liga:'JUG', sub:j.kurz, staffel:j.staffel,
    tore:j.tore, teamSp:j.teamSp, tT:j.tT, rank:null, teamCount:null,
    km:j.km, own:j.own, exSvbc:false, zweit:false, kanone:false, manual:false,
    risiko:null, info:null, press:[],
    alter:j.estAlter, alterCa:true, jw:j.w,
    pos:'ST', einsaetze:null, assists:null,
    scout:{tempo:5,technik:5,zweikampf:5,spielint:5,mentalitaet:5}, scouted:true,
    note:'', star:false, prev:null, isJugend:true, ...{photo:null,status:'Neu',geb:null,fuss:null,groesse:null},
  });
});

const activeLigen = new Set(['KOL','A','B','C','D','JUG']);
let maxKm=999, query='', sortBy='score', fPos='', ageMin=null, ageMax=null;

/* ================= SCORING ================= */
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
function ligaBase(l){return (l==='D1'||l==='D2')?'D':l;}
function wOf(p){return p.isJugend ? p.jw : LIGA_W[p.liga];}
function scores(p){
  const sp=p.einsaetze||((p.toreBelegt&&p.kaderDoc&&p.kaderStarts)?Math.max(6,p.kaderStarts):p.teamSp); /* dok.-Spiele-Basis NUR bei Untergrenzen-Toren aus den Heften — offizielle Saisontore rechnen über Team-Spiele */
  const gpg=(p.min&&p.min>=90)?p.tore/(p.min/90):p.tore/Math.max(1,sp);
  const wnow=gpg*wOf(p);
  let prod=clamp(wnow/1.0*100,0,100);
  let share=(p.tT&&p.tT>0)?clamp((p.tore/p.tT)/0.40*100,0,100):50;
  let ctx=50;
  if(p.rank!=null&&p.teamCount>1){const pct=(p.rank-1)/(p.teamCount-1);ctx=clamp(30+pct*70,0,100);}
  let pot=50;
  if(p.alter!=null){const a=p.alter;pot=a<=20?100:a<=23?88:a<=26?70:a<=29?50:a<=32?32:18;}
  let trend=50,tratio=null;
  if(p.prev){
    const wPrevLiga=LIGA_W[ligaBase(p.prev.liga)];
    const wprev=(p.prev.tore/Math.max(1,p.prev.spiele))*wPrevLiga;
    tratio=wnow/Math.max(0.05,wprev);
    trend=clamp(50+(tratio-1)*40,0,100);
    if(wOf(p)<wPrevLiga)trend=Math.min(trend,85);
    if(wOf(p)>wPrevLiga&&tratio>=0.7)trend=Math.max(trend,55);
  }
  if(p.toreBelegt)trend=Math.max(trend,40); /* belegte Tore sind Untergrenzen - fehlende Daten nicht als Formverlust werten */
  let scout=50;
  if(p.scouted&&Object.values(p.scout).some(v=>v!==5)){
    const w=POS_W[p.pos]||POS_W['ST'];let s=0;
    for(const k in w)s+=(p.scout[k]||5)*w[k];
    scout=clamp(s*10,0,100);
  }
  const presse=(p.pressIdx!=null)?p.pressIdx:50;
  let defMode=false, gaTxt=null;
  if(p.pos==='TW'||p.pos==='IV'||p.pos==='AV'){
    defMode=true;
    ctx=50; /* Team-Kontext neutral: der Teamstärke-Effekt steckt bereits im Gegentore-Vergleich */
    const c=(typeof clubFor==='function')?clubFor(p.club):null;
    const s26=c&&c.s2526;
    const lg=(DATA.ligaGA&&DATA.ligaGA['2526']&&s26)?DATA.ligaGA['2526'][s26.liga]:null;
    let defv=50;
    if(s26&&s26.gegentore&&s26.spiele&&lg){
      const ratio=(s26.gegentore/s26.spiele)/lg;
      defv=clamp((1.45-ratio)/0.9*100,0,100);
      gaTxt=(s26.gegentore/s26.spiele).toFixed(2)+' Gegentore/Spiel vs. Liga-Schnitt '+lg.toFixed(2);
      const s25=c.s2425;
      const lgp=(DATA.ligaGA&&DATA.ligaGA['2425']&&s25)?DATA.ligaGA['2425'][s25.liga]:null;
      if(s25&&s25.gegentore&&s25.spiele&&lgp&&!p.prev){
        const rp=(s25.gegentore/s25.spiele)/lgp;
        trend=clamp(50+(rp-ratio)*60,0,100);
      }
    }
    if(p.pos==='AV'&&p.assists)defv=clamp(defv+Math.min(10,p.assists*3),0,100);
    if(p.tore>0)defv=clamp(defv+Math.min(15,p.tore*5),0,100); /* Torgefahr-Bonus: Abwehrspieler mit (Standard-)Toren aufwerten */
    prod=Math.max(prod,defv);
    if(!(p.tore>0))share=defv;
  }
  const sum=W.prod+W.share+W.ctx+W.pot+W.trend+W.presse+W.scout;
  let total=(prod*W.prod+share*W.share+ctx*W.ctx+pot*W.pot+trend*W.trend+presse*W.presse+scout*W.scout)/sum;
  let sdsB=0;
  if(p.sds>0){sdsB=Math.min(6,p.sds*2);total=Math.min(100,total+sdsB);} /* FuPa Elf der Woche/Spieler des Spieltags: +2 je Nominierung, max +6 */
  const _mo=mvpOf(p); let mvpAdj=0, mvpVal=_mo?_mo.v:null, mvpD=_mo?_mo.d:null, mvpBase=total;
  if(mvpVal!=null&&p.adjTo==null){const _b=total;total=Math.min(100,total*mvpFactor(mvpVal));mvpAdj=Math.round((total-_b)*10)/10;} /* FuPa-MVP: team-relativer Leistungswert als ±6 %-Modifikator (50 % = neutral); Insider-Rating hat Vorrang */
  let adjD=0, adjBase=null;
  if(p.adjTo!=null){adjBase=Math.round(total*10)/10;adjD=Math.round((p.adjTo-total)*10)/10;total=p.adjTo;} /* Insider-Rating: Modellwert wird transparent überschrieben */
  const spTeam=(p.toreBelegt&&p.kaderDoc&&p.kaderStarts)?Math.max(6,p.kaderStarts):(p.teamSp||sp);
  const proj=Math.round((p.tore/Math.max(1,spTeam))*wOf(p)*30); /* xT über Team-Spiele: reale Einsatzquote eingerechnet, keine Vollzeit-Hochrechnung */
  return {prod:Math.round(prod),share:Math.round(share),ctx:Math.round(ctx),pot:Math.round(pot),
    trend:Math.round(trend),presse:Math.round(presse),scout:Math.round(scout),total:Math.round(total*10)/10,
    mvp:mvpVal,mvpAdj,mvpD,mvpBase:Math.round(mvpBase*10)/10,gpg,proj,tratio,defMode,gaTxt,sdsB,adjD,adjBase,shareRaw:(p.tT&&p.tT>0)?p.tore/p.tT:null};
}

/* ================= GEMS ================= */
function gemsOf(p){
  const s=scores(p);const out=[];
  if(p.exSvbc)out.push({k:'Rückholer',t:'Kennt den Verein – Ex-SV/BSC mit '+p.tore+' Toren höherklassig'});
  if(p.isJugend&&s.gpg>=0.8)out.push({k:'U19-Sprung',t:'Jugend-Quote '+fmt(s.gpg)+'/Spiel – bereit für Senioren-Minuten'});
  if(!p.isJugend&&p.zweit&&(p.liga==='C'||p.liga==='D')&&s.gpg>=0.65)out.push({k:'Zweite Reihe',t:'Top-Quote im II.-Team – kickt nur so tief, weil das Erstteam höher spielt'});
  if(!p.isJugend&&s.shareRaw!=null&&s.shareRaw>=0.35&&p.rank!=null&&p.rank>p.teamCount/2)out.push({k:'Einsamer Torjäger',t:Math.round(s.shareRaw*100)+'% aller Teamtore in schwachem Team'});
  if(s.tratio!=null&&s.tratio>=1.3&&p.liga!=='KOL')out.push({k:'Formexplosion',t:'Quote +'+Math.round((s.tratio-1)*100)+'% vs. Vorsaison (ligagewichtet)'});
  return out;
}
function gemScore(p){const g=gemsOf(p);return g.length?scores(p).total+6*g.length:null;}

/* ================= HELPERS ================= */
const $=s=>document.querySelector(s);
function fmt(x,d=2){return x==null?'–':x.toLocaleString('de-DE',{maximumFractionDigits:d});}
function tierColor(t){return t>=72?'#b39df7':t>=60?'#2fd27a':t>=48?'#ffd60a':'#ff6b6b';}
function tierName(t){return t>=72?'Elite':t>=60?'Gut':t>=48?'Mittel':'Schwach';}
const STATUS_LIST=['Neu','Beobachten','Kontaktiert','In Gesprächen','Zusage','Absage'];
function statusBadge(p){
  if(!p.status||p.status==='Neu')return '';
  const i=STATUS_LIST.indexOf(p.status)+1;
  return `<span class="badge b-status s${i}">${p.status}</span>`;
}
function avaHtml(p){
  const src=p.photo||p.photoUrl;
  return `<div class="ava l-${p.liga}">${src?`<img src="${src}" alt="" loading="lazy" onerror="this.remove()">`:''}${src?'':initials(p.name)}</div>`;
}
function dash(v,suffix=''){return (v===null||v===undefined||v==='')?'–':v+suffix;}
function clubFor(name){
  if(!name)return null;
  const n=name.toLowerCase().replace(/[^a-zäöüß0-9]/g,'');
  if(!n)return null;
  const cl=DATA.clubs||{};
  if(cl[n])return cl[n];
  for(const k in cl){ if(k.includes(n)||n.includes(k)) return cl[k]; }
  return null;
}
const LIGA_LONG={'GL':'Gruppenliga Darmstadt','KOL':'Kreisoberliga','A':'Kreisliga A','B':'Kreisliga B','C':'Kreisliga C','D':'Kreisliga D','D1':'Kreisliga D','D2':'Kreisliga D','JUG':'Jugend'};
function seasonsOf(p){
  const out=[];const c=clubFor(p.club);
  const t26=c&&c.s2526?` · Team: Platz ${c.s2526.platz} (${c.s2526.punkte} Pkt.)`:'';
  out.push({y:'25/26',type:'player',liga:p.isJugend?(p.sub||'Jugend'):LIGA_NAME[p.liga],verein:p.club,tore:p.tore,sp:p.einsaetze||p.teamSp,extra:t26});
  if(p.prev){
    const pc=clubFor(p.prev.verein);
    const t25=pc&&pc.s2425?` · Team: Platz ${pc.s2425.platz} (${pc.s2425.punkte} Pkt.)`:'';
    out.push({y:'24/25',type:'player',liga:LIGA_NAME[ligaBase(p.prev.liga)]||p.prev.liga,verein:p.prev.verein,tore:p.prev.tore,sp:p.prev.spiele,extra:t25});
  } else if(c&&c.s2425){
    out.push({y:'24/25',type:'team',club:c.name,d:c.s2425,note:'Spieler nicht in den Top-30-Torschützen'});
  } else {
    out.push({y:'24/25',type:'none',note:'keine öffentlichen Daten'});
  }
  for(const [y,key] of [['23/24','s2324'],['22/23','s2223']]){
    if(c&&c[key])out.push({y,type:'team',club:c.name,d:c[key],note:'Spielerdaten älterer Saisons nicht öffentlich'});
    else out.push({y,type:'none',note:'keine öffentlichen Daten (fussball.de-Archiv)'});
  }
  return out;
}
function initials(name){const p=name.split(' ').filter(Boolean);return ((p[0]||'')[0]||'')+((p[p.length-1]||'')[0]||'');}
function ring(t,big=false){return `<div class="ring ${big?'big':''}" style="--v:${t};--c:${tierColor(t)}"><span>${fmt(t,0)}</span></div>`;}
function visible(){
  return players.filter(p=>{
    if(!activeLigen.has(p.liga))return false;
    if(p.km>maxKm)return false;
    if(fPos&&p.pos!==fPos)return false;
    if(ageMin!=null||ageMax!=null){
      if(p.alter==null)return false;
      if(ageMin!=null&&p.alter<ageMin)return false;
      if(ageMax!=null&&p.alter>ageMax)return false;
    }
    if(query&&!(p.name+' '+p.club).toLowerCase().includes(query))return false;
    return true;
  });
}
function sorted(arr){
  const key={score:p=>scores(p).total,tore:p=>p.tore,gpg:p=>scores(p).gpg,
    share:p=>scores(p).shareRaw??-1,trend:p=>scores(p).trend,proj:p=>scores(p).proj,
    alter:p=>p.alter!=null?-p.alter:-99,km:p=>-p.km}[sortBy];
  return [...arr].sort((a,b)=>key(b)-key(a));
}
function trendArrow(p){
  const s=scores(p);
  if(s.tratio==null)return '';
  if(s.tratio>=1.15)return '<span class="tr-up">▲</span>';
  if(s.tratio<=0.85)return '<span class="tr-dn">▼</span>';
  return '<span class="tr-eq">≈</span>';
}
function badges(p){
  let h=`<span class="badge b-${p.liga}">${p.liga==='JUG'?(p.sub||'Jugend'):(p.liga==='KOL'?'KOL':p.liga+'-Klasse')}</span>`;
  if(p.own)h+=`<span class="badge b-own">SV/BSC</span>`;
  if(p.exSvbc)h+=`<span class="badge b-ex">Ex-SV/BSC</span>`;
  if(p.kanone)h+=`<span class="badge b-kan">Kanone</span>`;
  if(p.risiko)h+=`<span class="badge b-risk">⚠</span>`;
  if(!p.isJugend&&p.zweit)h+=`<span class="badge b-zweit">II/III</span>`;
  if(p.manual)h+=`<span class="badge b-man">Sichtung</span>`;
  h+=statusBadge(p);
  {const C=crmOf(p);
   if(C.c)h+=`<span class="badge b-crmc">📞 kontaktiert</span>`;
   if(C.s==='att')h+=`<span class="badge b-crma">💚 attraktiv</span>`;
   if(C.s==='no')h+=`<span class="badge b-crmn">🚫 kein Interesse</span>`;
   if(C.s==='lat')h+=`<span class="badge b-crml">⏰ ${crmDue(p)?'Wiedervorlage FÄLLIG':'später · '+fmtD(C.u)}</span>`;
   if(C.x&&!p.exSvbc)h+=`<span class="badge b-crmx">↩️ Ex-SV/BSC</span>`;}
  if(gemsOf(p).length)h+=`<span class="badge b-gem">💎</span>`;
  if(p.press&&p.press.length)h+=`<span title="Presse">📰</span>`;
  return h;
}
function rowHtml(p,i,extra=''){
  const s=scores(p);
  return `<div class="row" data-id="${p.id}">
    <div class="rankn ${i<3?'top':''}">${i+1}</div>
    ${avaHtml(p)}
    <div class="rmain">
      <div class="pname">${p.name} ${badges(p)}</div>
      <div class="pmeta">
        <span>${p.club}</span>
        <span><b>${p.tore}</b> Tore</span>
        <span><b>${fmt(s.gpg)}</b>/Sp.</span>
        ${s.shareRaw!=null?`<span><b>${Math.round(s.shareRaw*100)}%</b> Teamtore</span>`:''}
        ${p.alter!=null?`<span><b>${p.alter}${p.alterCa?'~':''}</b> J.</span>`:''}
        ${trendArrow(p)}
        <span>${p.km} km</span>
        <span>KLA: <b>${s.proj}</b></span>
      </div>
      ${extra}
    </div>
    <div class="rside">
      ${ring(s.total)}
      <button class="starbtn ${p.star?'on':''}" data-star="${p.id}">★</button>
    </div>
  </div>`;
}

/* ================= RENDER ================= */
function renderHome(){
  const sen=players.filter(p=>!p.isJugend);
  $('#homeTiles').innerHTML=`
    <div class="tile"><div class="v">${sen.length}</div><div class="l">Senioren · 6 Ligen</div></div>
    <div class="tile"><div class="v">${players.filter(p=>p.isJugend).length}</div><div class="l">Jugend-Talente</div></div>
    <div class="tile"><div class="v">${players.filter(p=>gemsOf(p).length).length}</div><div class="l">💎 Rohdiamanten</div></div>
    <div class="tile"><div class="v">${players.filter(p=>p.star).length}</div><div class="l">⭐ Shortlist</div></div>`;
  $('#homeFocus').innerHTML=sorted(players.filter(p=>!crmHidden(p))).slice(0,6).map(p=>{
    const s=scores(p);
    return `<div class="fcard" data-id="${p.id}">
      <div class="shine"></div>
      <div class="top">${avaHtml(p)}${ring(s.total,true)}</div>
      <div class="fname">${p.name}</div>
      <div class="fclub">${p.club}</div>
      <div class="fmeta">${badges(p)}</div>
      <div class="fmeta"><span><b style="color:var(--ink)">${p.tore}</b>&nbsp;Tore</span><span>KLA-Prognose&nbsp;<b style="color:var(--ink)">${s.proj}</b></span></div>
    </div>`;}).join('');
  const gems=players.filter(p=>!crmHidden(p)).map(p=>({p,g:gemsOf(p),gs:gemScore(p)})).filter(x=>x.gs).sort((a,b)=>b.gs-a.gs).slice(0,6);
  {const wk=players.filter(p=>!p.own&&!p.isJugend&&!crmHidden(p)).map(p=>({p,W:wscore(p),s:scores(p)}))
    .filter(x=>x.W&&x.s.total>=45).sort((a,b)=>b.W.w-a.W.w||b.W.k-a.W.k).slice(0,10);
  const el=$('#homeWechsel');
  if(el)el.innerHTML=wk.map(x=>{const p=x.p;const src=p.photo||p.photoUrl;
    return `<div class="rankrow row" data-id="${p.id}">
      <span class="rk" style="color:${tierColor(x.W.w)}" title="Wechsel-Index (Wechselwahrscheinlichkeit)">${x.W.w}</span>
      <div class="ava l-${p.liga}" style="width:30px;height:30px;font-size:11px;border-radius:9px">${src?`<img src="${src}" onerror="this.remove()">`:initials(p.name)}</div>
      <span class="rn">${p.name}${p.club==='SG Wald-Michelbach'?` <b style="color:#4da3ff">●</b>`:``} <i style="color:var(--ink3)">${p.club} · ${LIGA_NAME[p.liga]||p.liga}</i><br><i style="color:#8fa3c7;font-size:11px">Stärke ${Math.round(x.s.total)} · Transfer-Chance ${x.W.k} — ${wreason(x.W,1)}</i></span>
      <span class="rv">${p.km!=null?p.km+' km':''}</span></div>`;}).join('')+
    `<p class="note">Zahl = <b>Wechsel-Index</b> (Wechselwahrscheinlichkeit aus öffentlichen Signalen), nur Spieler mit Stärke ≥ 45. Zeile antippen → Profil mit kompletter Begründung.</p>`;}
  $('#homeGems').innerHTML=gems.map(({p,g})=>{
    const s=scores(p);
    return `<div class="fcard gemcard" data-id="${p.id}">
      <div class="shine"></div>
      <div class="top">${avaHtml(p)}${ring(s.total,true)}</div>
      <div class="fname">${p.name}</div>
      <div class="fclub">${p.club}</div>
      <div class="gemtag">💎 ${g[0].k}</div>
      <div class="fmeta">${g[0].t}</div>
    </div>`;}).join('');
  {const el=$('#homeCrm');
   if(el){
    const T=todayISO();
    const due=players.filter(p=>crmDue(p));
    const att=players.filter(p=>crmOf(p).s==='att').map(p=>({p,W:p.own?null:wscore(p)})).sort((a,b)=>((b.W?b.W.k:0)-(a.W?a.W.k:0)));
    const exs=players.filter(p=>!p.own&&!p.isJugend&&(p.exSvbc||crmOf(p).x)).map(p=>({p,W:wscore(p)})).filter(x=>x.W).sort((a,b)=>b.W.k-a.W.k);
    const hidNo=players.filter(p=>crmOf(p).s==='no');
    const hidLat=players.filter(p=>{const C=crmOf(p);return C.s==='lat'&&C.u&&C.u>T;}).sort((a,b)=>(crmOf(a).u||'').localeCompare(crmOf(b).u||''));
    const cont=players.filter(p=>crmOf(p).c);
    const mini=(p,sub)=>{const src=p.photo||p.photoUrl;const C=crmOf(p);const W=wscoreSafe(p);
      return `<div class="rankrow row" data-id="${p.id}">
        <span class="rk" style="color:${W?tierColor(W.k):'var(--ink3)'}" title="${W?'Transfer-Chance':''}">${W?Math.round(W.k):'–'}</span>
        <div class="ava l-${p.liga}" style="width:30px;height:30px;font-size:11px;border-radius:9px">${src?`<img src="${src}" onerror="this.remove()">`:initials(p.name)}</div>
        <span class="rn">${p.name}${C.c?' <span class="badge b-crmc">📞</span>':''} <i style="color:var(--ink3)">${p.club} · ${LIGA_NAME[p.liga]||p.liga}</i>${sub?`<br><i style="color:#8fa3c7;font-size:11px">${sub}</i>`:''}${C.n?`<div class="crmnote">📝 ${kEsc(C.n.length>90?C.n.slice(0,90)+'…':C.n)}</div>`:''}</span>
        <span class="rv">${p.km!=null?p.km+' km':''}</span></div>`;};
    let out='<div class="sechead">🗂 Scouting-Zentrale <small style="color:var(--ink3)">Kontakte · Merkliste · Wiedervorlagen</small></div><div class="card" style="padding:10px 12px">';
    if(due.length)out+=`<div class="duebox"><b style="color:#ffb347">⏰ Wiedervorlage fällig (${due.length})</b> — die wolltet ihr euch jetzt wieder anschauen:</div>`+
      due.map(p=>mini(p,'Wiedervorlage seit '+fmtD(crmOf(p).u||T)+(wscoreSafe(p)?' · Transfer-Chance '+wscoreSafe(p).k:''))).join('');
    if(att.length)out+=`<div class="sechead" style="margin:10px 0 4px">💚 Unsere Kandidaten (${att.length})</div>`+
      att.map(x=>mini(x.p,x.W?('Transfer-Chance '+x.W.k+' · Wechsel-Index '+x.W.w):'' )).join('');
    if(exs.length)out+=`<div class="sechead" style="margin:10px 0 4px">↩️ Ehemalige im Blick (${exs.length}) <small style="color:var(--ink3)">Rückkehr gibt +15 im Wechsel-Index</small></div>`+
      exs.slice(0,8).map(x=>mini(x.p,'Transfer-Chance '+x.W.k+' — '+wreason(x.W,1))).join('');
    if(!due.length&&!att.length&&!exs.length&&!cont.length)out+=`<p class="note" style="margin:4px 0">So funktioniert's: Im Spielerprofil markierst du <b>📞 kontaktiert</b>, <b>💚 attraktiv</b>, <b>🚫 kein Interesse</b> oder <b>⏰ später</b> (mit Wiedervorlage-Datum). Alles landet hier — geräteübergreifend, auch für Tobi. Kennst du einen, der früher beim SV/BSC gespielt hat? <b>↩️ markieren</b> → er bekommt automatisch den Rückkehr-Bonus im Wechsel-Index.</p>`;
    if(hidNo.length||hidLat.length)out+=`<details class="hidbox"><summary>🚫 Ausgeblendet: ${hidNo.length} kein Interesse · ⏰ ${hidLat.length} auf Wiedervorlage — anzeigen</summary>`+
      hidLat.map(p=>mini(p,'wieder ab '+fmtD(crmOf(p).u))).join('')+
      hidNo.map(p=>mini(p,'kein Interesse — im Profil jederzeit änderbar')).join('')+`</details>`;
    out+='</div>';
    el.innerHTML=out;
   }}
  const pressP=players.filter(p=>p.press&&p.press.length).slice(0,3);
  $('#homePress').innerHTML=pressP.map((p,i)=>`
    <div class="row" data-id="${p.id}">
      ${avaHtml(p)}
      <div class="rmain"><div class="pname">${p.name} ${badges(p)}</div>
      <div class="pmeta"><span>${p.press[0].t.slice(0,150)}${p.press[0].t.length>150?'…':''}</span></div></div>
    </div>`).join('');
}
function renderList(){
  const arr=sorted(visible());
  const hid=(ageMin!=null||ageMax!=null)?players.filter(p=>activeLigen.has(p.liga)&&p.alter==null).length:0;
  $('#filterHint').textContent=`${arr.length} Spieler${hid?` · ${hid} ohne Altersangabe ausgeblendet`:''}${fPos?` · Position ${fPos} (Standard: ST)`:''}`;
  $('#list').innerHTML=arr.length?arr.map((p,i)=>rowHtml(p,i)).join(''):'<div class="empty">Keine Treffer – Filter lockern.</div>';
}
function renderGems(){
  const gems=players.filter(p=>!crmHidden(p)).map(p=>({p,g:gemsOf(p),gs:gemScore(p)})).filter(x=>x.gs).sort((a,b)=>b.gs-a.gs);
  $('#gemlist').innerHTML=gems.map(({p,g},i)=>
    rowHtml(p,i,`<div class="gemreason">${g.map(x=>`💎 <b>${x.k}</b>: ${x.t}`).join(' · ')}</div>`)
  ).join('');
}
function renderJugend(){
  const groups={};
  players.filter(p=>p.isJugend).forEach(j=>{(groups[j.staffel]=groups[j.staffel]||[]).push(j);});
  $('#jugendlist').innerHTML=Object.entries(groups).map(([st,list])=>
    `<div class="jhead">${st}</div>`+sorted(list).map((p,i)=>rowHtml(p,i)).join('')
  ).join('');
}
function renderShortlist(){
  const arr=sorted(players.filter(p=>p.star));
  $('#shortlist').innerHTML=arr.length
    ?arr.map((p,i)=>rowHtml(p,i)).join('')
    :'<div class="empty">Noch keine ⭐-Markierungen.</div>';
}
let dbSort={k:'score',dir:-1};
const DB_COLS=[
  {k:'name',l:'Spieler',get:p=>p.name},
  {k:'club',l:'Verein',get:p=>p.club},
  {k:'liga',l:'Liga',get:p=>p.isJugend?'JUG':p.liga},
  {k:'alter',l:'Alter',num:1,get:p=>p.alter},
  {k:'tore',l:'Tore',num:1,get:p=>p.tore},
  {k:'gpg',l:'T/Sp',num:1,get:p=>scores(p).gpg},
  {k:'share',l:'Anteil',num:1,get:p=>scores(p).shareRaw},
  {k:'trend',l:'Trend',num:1,get:p=>scores(p).tratio},
  {k:'proj',l:'KLA-Prog.',num:1,get:p=>scores(p).proj},
  {k:'km',l:'km',num:1,get:p=>p.km},
  {k:'status',l:'Status',get:p=>p.status||'Neu'},
  {k:'mvp',l:'MVP',num:1,get:p=>scores(p).mvp},
  {k:'score',l:'MScore',num:1,get:p=>scores(p).total},
];
function renderDB(){
  const head=document.getElementById('dbhead');
  if(!head)return;
  {const dc=document.getElementById('dbCount'); if(dc)dc.textContent=players.length.toLocaleString('de-DE');}
  head.innerHTML='<tr>'+DB_COLS.map(c=>`<th class="${c.num?'num':''} ${dbSort.k===c.k?'on':''}" data-k="${c.k}">${c.l}${dbSort.k===c.k?(dbSort.dir<0?' ↓':' ↑'):''}</th>`).join('')+'</tr>';
  head.querySelectorAll('th').forEach(th=>{th.onclick=()=>{
    const k=th.dataset.k;
    if(dbSort.k===k)dbSort.dir*=-1;else dbSort={k,dir:-1};
    renderDB();
  };});
  const col=DB_COLS.find(c=>c.k===dbSort.k);
  const arr=[...players].sort((a,b)=>{
    let va=col.get(a),vb=col.get(b);
    if(va==null)va=dbSort.dir<0?-Infinity:Infinity;
    if(vb==null)vb=dbSort.dir<0?-Infinity:Infinity;
    if(typeof va==='string'&&typeof vb==='string')return dbSort.dir<0?vb.localeCompare(va,'de'):va.localeCompare(vb,'de');
    return dbSort.dir<0?(vb-va):(va-vb);
  });
  document.getElementById('dbbody').innerHTML=arr.map(p=>{
    const s=scores(p);
    return `<tr data-id="${p.id}">
      <td><b>${p.name}</b>${p.own?' 🟢':''}${p.exSvbc?' ↩️':''}${gemsOf(p).length?' 💎':''}</td>
      <td>${p.club}</td>
      <td>${p.isJugend?(p.sub||'JUG'):p.liga}</td>
      <td class="num">${p.alter!=null?p.alter+(p.alterCa?'~':''):'–'}</td>
      <td class="num">${p.tore}</td>
      <td class="num">${fmt(s.gpg)}</td>
      <td class="num">${s.shareRaw!=null?Math.round(s.shareRaw*100)+'%':'–'}</td>
      <td class="num">${s.tratio!=null?(s.tratio>=1.15?'▲':s.tratio<=0.85?'▼':'≈'):'–'}</td>
      <td class="num">${s.proj}</td>
      <td class="num">${p.km}</td>
      <td>${p.status||'Neu'}</td>
      <td class="num">${s.mvp!=null?s.mvp:'–'}</td>
      <td class="num"><b>${fmt(s.total,1)}</b></td>
    </tr>`;
  }).join('');
  document.getElementById('dbbody').querySelectorAll('tr').forEach(tr=>{tr.onclick=()=>startPlayer(tr.dataset.id);});
}
let deferredPrompt=null;
window.addEventListener('beforeinstallprompt',e=>{
  e.preventDefault();deferredPrompt=e;
  const b=document.getElementById('installBtn');
  if(b){b.style.display='inline-block';b.onclick=()=>{deferredPrompt.prompt();};}
});
/* ===== Kaderplaner-Pipeline (Kandidaten-CRM-Sicht) · v2 =====
   Felder je Spieler in CRM[pid]: k=Kontaktdaten (im Browser verschlüsselt, 'enc1:…'), lc=letzter Kontakt (ISO),
   w=Wechselwahrscheinlichkeit 1-4, rl=Zielrolle, tp=Zielposition, pl=verantw. Kaderplaner, mv/mvd=FuPa-MVP + Stand.
   CRM['__meta'] = {pl:[zusätzliche Planer], kv:Prüfwert des Team-Schlüssels}. Sync feldweise (siehe crmMerge). */
const KAND_DUE_DAYS=21;
const META_ID='__meta';
const PLANNERS_DEFAULT=['Dome','Nico'];
const WPROB={1:{t:'gering',c:'#8fa3c7'},2:{t:'mittel',c:'#ffd60a'},3:{t:'hoch',c:'#ffb347'},4:{t:'sehr hoch',c:'#5fe09b'}};
const KPOS=['TW','IV','AV','ZM','OM','Flügel','ST'];
let kandFP='',kandDue=false,kandQ='',kandPanel='',kandAddQ='',kandKeyMsg='',kandDigestContacts=false,kandDigestCache=[],kandPlDraft='',kandKeyDraft='';
function kEsc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function daysSince(iso){if(!iso)return null;const d=new Date(iso+'T00:00:00'),n=new Date(todayISO()+'T00:00:00');return Math.round((n-d)/86400000);}
function metaOf(){try{return CRM[META_ID]||{};}catch(e){return {};}}
function kandOut(C){ /* aus der Pipeline genommen – gilt, bis danach wieder markiert/zugewiesen/eingeschätzt wird */
  if(!C.px)return false; const T=C._t||{}; return (T.px||0)>=Math.max(T.f||0,T.pl||0,T.w||0,T.s||0);}
function kandList(){return players.filter(p=>{const C=crmOf(p);return (C.f||C.pl||C.w||C.lc||C.s==='att')&&C.s!=='no'&&!kandOut(C);});}
function kandIsDue(p){const ds=daysSince(crmOf(p).lc);return ds===null||ds>KAND_DUE_DAYS;}
function metaPlanners(){const M=metaOf();return Object.keys(M).filter(k=>k.slice(0,3)==='pl:'&&M[k]).map(k=>k.slice(3));}
function kandPlanners(){const s=new Set(PLANNERS_DEFAULT);metaPlanners().forEach(x=>{if(x)s.add(x);});kandList().forEach(p=>{const q=crmOf(p).pl;if(q)s.add(q);});return [...s];}
function kandSoftRender(){ setTimeout(()=>{ if(crmIsTyping())_pendingRefresh=true; else renderKandidaten(); },0); } /* nicht neu zeichnen, solange jemand tippt (sonst schließt die Handy-Tastatur) */
function kToast(msg,actLabel,actFn){
  let t=document.getElementById('kToast');
  if(!t){t=document.createElement('div');t.id='kToast';t.className='ktoast';document.body.appendChild(t);}
  t.innerHTML='<span>'+kEsc(msg)+'</span>'+(actLabel?'<button type="button">'+kEsc(actLabel)+'</button>':'');
  if(actLabel){t.querySelector('button').onclick=()=>{t.classList.remove('on');try{actFn();}catch(e){}};}
  t.classList.add('on');clearTimeout(t._h);t._h=setTimeout(()=>t.classList.remove('on'),actLabel?6000:2600);
}
async function kCopy(txt){
  try{await navigator.clipboard.writeText(txt);kToast('📋 In die Zwischenablage kopiert');}
  catch(e){const ta=document.createElement('textarea');ta.value=txt;ta.style.position='fixed';ta.style.opacity='0';document.body.appendChild(ta);ta.select();
    try{document.execCommand('copy');kToast('📋 In die Zwischenablage kopiert');}catch(e2){kToast('Kopieren nicht möglich – Text bitte markieren');}ta.remove();}
}

/* ---------- Team-Schlüssel: Kontaktdaten Ende-zu-Ende verschlüsselt (AES-GCM 256, Schlüssel per PBKDF2 aus einem Satz) ---------- */
const TK_LS='svbcTeamKey';
let TK=null, tkVerified=false, tkBusy=false;
const KDEC={}, KSRC={};
function tkCan(){try{return !!(window.crypto&&crypto.subtle&&window.isSecureContext!==false);}catch(e){return false;}}
function lsGet(k){try{return localStorage.getItem(k);}catch(e){return null;}}
function lsSet(k,v){try{if(v==null)localStorage.removeItem(k);else localStorage.setItem(k,v);}catch(e){}}
function b64e(u){let s='';for(let i=0;i<u.length;i++)s+=String.fromCharCode(u[i]);return btoa(s);}
function b64d(s){const b=atob(s),u=new Uint8Array(b.length);for(let i=0;i<b.length;i++)u[i]=b.charCodeAt(i);return u;}
function isEnc(v){return typeof v==='string'&&v.slice(0,5)==='enc1:';}
async function tkDerive(pass){
  const e=new TextEncoder();
  const base=await crypto.subtle.importKey('raw',e.encode(pass),'PBKDF2',false,['deriveKey']);
  return crypto.subtle.deriveKey({name:'PBKDF2',salt:e.encode('svbc-scout/kontakt/v1'),iterations:600000,hash:'SHA-256'},base,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
}
async function tkEncWith(key,plain,aad){
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const ct=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode('svbc:'+aad)},key,new TextEncoder().encode(plain)));
  const o=new Uint8Array(12+ct.length);o.set(iv,0);o.set(ct,12);return 'enc1:'+b64e(o);
}
async function tkDecWith(key,s,aad){const u=b64d(String(s).slice(5));const pt=await crypto.subtle.decrypt({name:'AES-GCM',iv:u.slice(0,12),additionalData:new TextEncoder().encode('svbc:'+aad)},key,u.slice(12));return new TextDecoder().decode(pt);}
function tkGenerate(){const A='abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789',r=crypto.getRandomValues(new Uint32Array(16));let o='';for(let i=0;i<16;i++){if(i&&i%4===0)o+='-';o+=A[r[i]%A.length];}return o;} /* ~90 Bit Zufall */
async function tkInit(){ if(!tkCan())return; const pass=lsGet(TK_LS); if(!pass)return; try{TK=await tkDerive(pass);}catch(e){TK=null;return;} kandCryptoTick(true); }
async function tkSetPass(pass){
  pass=(pass||'').trim();
  const fail=m=>{kandKeyMsg=m;renderKandidaten();setTimeout(()=>{const i=document.getElementById('kKeyIn');if(i)i.focus();},0);};
  if(pass.length<12)return fail('Bitte mindestens 12 Zeichen – am sichersten: „🎲 Schlüssel erzeugen“ nutzen.');
  if(!tkCan())return fail('Dieser Browser kann nicht verschlüsseln – bitte aktuellen Chrome/Safari/Firefox nutzen.');
  if(!_remoteDone)return fail('Daten werden noch geladen – bitte in ein paar Sekunden erneut versuchen.');
  kandKeyMsg='⏳ Prüfe …'; try{const m=document.querySelector('#panel-kandidaten .kmsg');if(m)m.textContent=kandKeyMsg;}catch(e){}
  let key; try{key=await tkDerive(pass);}catch(e){return fail('Schlüssel konnte nicht erzeugt werden.');}
  if(!metaOf().kv){ try{ const d=await syncFetch(); if(syncAdoptRemote(d))crmAfterRemote(); }catch(e){ return fail('Keine Verbindung zum Speicher – bitte gleich noch einmal versuchen.'); } }
  const kv=metaOf().kv;
  if(kv){ try{ if(await tkDecWith(key,kv,'kv')!=='svbc-ok')throw 0; }catch(e){ return fail('❌ Das ist nicht der Team-Schlüssel.'); } }
  else { crmSet(META_ID,{kv:await tkEncWith(key,'svbc-ok','kv')}); kToast('🔐 Team-Schlüssel festgelegt – teile ihn mit den anderen Kaderplanern'); }
  TK=key; tkVerified=true; lsSet(TK_LS,pass); kandKeyMsg=''; kandKeyDraft=''; kandPanel='';
  await kandCryptoTick(true);
}
function tkForget(){ TK=null; tkVerified=false; lsSet(TK_LS,null); for(const k in KDEC)delete KDEC[k]; for(const k in KSRC)delete KSRC[k]; kandPanel=''; renderKandidaten(); kToast('Schlüssel auf diesem Gerät entfernt'); }
async function kandCryptoTick(force){
  if(!TK||tkBusy){ if(force)try{renderKandidaten();}catch(e){} return; }
  tkBusy=true; let changed=!!force;
  try{
    const kv=metaOf().kv;
    if(!tkVerified&&kv){
      let ok=false; try{ ok=(await tkDecWith(TK,kv,'kv'))==='svbc-ok'; }catch(e){ ok=false; }
      if(!ok){ TK=null; kandKeyMsg='Der gespeicherte Schlüssel passt nicht zum Team-Schlüssel – bitte neu eingeben.'; tkBusy=false; try{renderKandidaten();}catch(e){} return; }
      tkVerified=true; changed=true;
    }
    if(!tkVerified&&!kv){ tkBusy=false; return; } /* ohne Prüfwert nichts ver-/entschlüsseln */
    for(const id in CRM){
      if(id===META_ID)continue; const C=CRM[id]; if(!C||!C.k)continue;
      if(isEnc(C.k)){ if(KSRC[id]!==C.k){ const src=C.k; try{KDEC[id]=await tkDecWith(TK,src,id);}catch(e){KDEC[id]=null;} KSRC[id]=src; changed=true; } }
      else if(tkVerified){ const plain=String(C.k); const ct=await tkEncWith(TK,plain,id); if(CRM[id]&&CRM[id].k===plain){ KDEC[id]=plain; KSRC[id]=ct; crmSet(id,{k:ct}); changed=true; } } /* Altbestand im Klartext → verschlüsseln (nur wenn zwischenzeitlich unverändert) */
    }
  }catch(e){}
  tkBusy=false;
  if(changed){ if(!force&&crmIsTyping())_pendingRefresh=true; else try{renderKandidaten();}catch(e){} }
}
async function kandSaveContact(id,val){
  val=(val||'').trim();
  if(!val){ crmSet(id,{k:undefined}); delete KDEC[id]; delete KSRC[id]; kandSoftRender(); return; }
  if(!TK||!tkVerified){ kToast('🔒 Erst den Team-Schlüssel eingeben'); renderKandidaten(); return; }
  const ct=await tkEncWith(TK,val,id); KDEC[id]=val; KSRC[id]=ct; crmSet(id,{k:ct}); kandSoftRender();
}
function kandContactPlain(p){const C=crmOf(p);if(!C.k)return '';if(isEnc(C.k))return (TK&&tkVerified&&KDEC[p.id])?KDEC[p.id]:'';return String(C.k);}
function kandPhone(v){const m=String(v||'').match(/\+?\d[\d \/().-]{4,}\d/);if(!m)return null;let d=m[0].replace(/[^\d+]/g,'');
  let intl=d.startsWith('+')?d.slice(1):d.startsWith('00')?d.slice(2):d.startsWith('0')?'49'+d.slice(1):d; return {tel:d,wa:intl};}
function kandMail(v){const m=String(v||'').match(/[^\s,;<>]+@[^\s,;<>]+\.[a-z]{2,}/i);return m?m[0]:null;}
function kandContactCell(p,C){
  if(TK&&tkVerified){
    const bad=C.k&&isEnc(C.k)&&KDEC[p.id]===null;
    const v=kandContactPlain(p);
    const ph=kandPhone(v), ml=kandMail(v);
    return '<input class="kand-in" data-kc="'+p.id+'" value="'+kEsc(v)+'" placeholder="'+(bad?'⚠ nicht lesbar':'Handy / E-Mail')+'" autocomplete="off">'
      +((ph||ml)?'<div class="kacts">'+(ph?'<a class="kbtn klink" href="tel:'+kEsc(ph.tel)+'" title="Anrufen">📞</a><a class="kbtn klink" href="https://wa.me/'+kEsc(ph.wa)+'" target="_blank" rel="noopener" title="WhatsApp-Chat öffnen">💬</a>':'')+(ml?'<a class="kbtn klink" href="mailto:'+kEsc(ml)+'" title="E-Mail">✉️</a>':'')+'</div>':'');
  }
  if(C.k&&!isEnc(C.k))return '<span class="kand-lock" style="color:#ffb347" title="Wird verschlüsselt, sobald ein Planer mit Schlüssel die Seite öffnet">⚠ unverschlüsselt</span>';
  if(C.k)return '<span class="kand-lock" title="Verschlüsselt gespeichert – Team-Schlüssel eingeben zum Anzeigen">🔒 hinterlegt</span>';
  return '<span class="kand-lock" title="Kontaktdaten werden verschlüsselt gespeichert – dazu Team-Schlüssel eingeben">🔒 –</span>';
}

/* ---------- Wochen-Digest je Kaderplaner (zum Kopieren / Teilen per WhatsApp) ---------- */
function kandLine(p){
  const C=crmOf(p),ds=daysSince(C.lc),b=[];
  b.push(p.name+' ('+[p.club,(C.tp||p.pos)].filter(Boolean).join(' · ')+')');
  b.push(ds===null?'noch nie kontaktiert':'letzter Kontakt vor '+ds+' T');
  if(C.w)b.push('Wechsel '+WPROB[C.w].t);
  if(C.rl)b.push('Rolle: '+C.rl);
  if(kandDigestContacts){const kd=kandContactPlain(p);if(kd)b.push('☎ '+kd);}
  return '• '+b.join(' · ');
}
function kandDigestText(pl){
  const d=new Date(),ds=String(d.getDate()).padStart(2,'0')+'.'+String(d.getMonth()+1).padStart(2,'0')+'.'+d.getFullYear();
  const all=kandList();
  const sec=(name,L)=>{
    const due=L.filter(kandIsDue).sort((a,b)=>(daysSince(crmOf(b).lc)??1e9)-(daysSince(crmOf(a).lc)??1e9)), ok=L.filter(p=>!kandIsDue(p));
    let t=(name?'👤 '+name:'👤 ohne Verantwortlichen')+' – '+(due.length?due.length+' von '+L.length+' fällig':'alle '+L.length+' im Plan ✓')+'\n';
    if(due.length)t+='⏰ Jetzt melden:\n'+due.map(kandLine).join('\n')+'\n';
    if(ok.length)t+='✅ Im Plan: '+ok.map(p=>p.name+' ('+daysSince(crmOf(p).lc)+' T)').join(', ')+'\n';
    return t;
  };
  let t='⚽ SV/BSC Kaderplanung · Digest '+ds+'\n(überfällig = Erinnerung je Kandidat überschritten, Standard '+KAND_DUE_DAYS+' Tage)\n\n';
  if(pl!=null){ t+=sec(pl,all.filter(p=>(crmOf(p).pl||'')===pl)); return t.trim(); }
  const groups={}; all.forEach(p=>{const k=crmOf(p).pl||'';(groups[k]=groups[k]||[]).push(p);});
  Object.keys(groups).sort((a,b)=>(a===''?1:0)-(b===''?1:0)||a.localeCompare(b,'de')).forEach(k=>{t+=sec(k||null,groups[k])+'\n';});
  return t.trim();
}
function kandDigestPanel(){
  const planners=kandPlanners(), metaPl=metaPlanners(), all=kandList();
  const chips=planners.map(n=>'<span class="kplchip">'+kEsc(n)+(metaPl.includes(n)&&!PLANNERS_DEFAULT.includes(n)?'<button class="kx" data-plrm="'+kEsc(n)+'" title="Planer entfernen">×</button>':'<span style="width:6px"></span>')+'</span>').join(' ');
  kandDigestCache=[];
  let cards='';
  if(!all.length){ cards='<div class="kand-sub" style="padding:8px 0">Noch keine Kandidaten in der Pipeline – dann gibt es auch nichts zu erinnern.</div>'; }
  else{
    const items=[{t:'👥 Alle Planer',pl:null,n:all.filter(kandIsDue).length}];
    planners.forEach(n=>{const L=all.filter(p=>(crmOf(p).pl||'')===n);if(L.length)items.push({t:'👤 '+n,pl:n,n:L.filter(kandIsDue).length});});
    cards='<div class="kdgrid">'+items.map((it,i)=>{const txt=kandDigestText(it.pl);kandDigestCache[i]=txt;
      return '<div class="kdcard"><div class="kdh"><b>'+kEsc(it.t)+'</b> <span class="kchip" style="background:'+(it.n?'rgba(255,70,70,.15);color:#ff8a8a':'rgba(47,210,122,.15);color:#5fe09b')+'">'+(it.n?it.n+' fällig':'alles im Plan')+'</span></div>'
        +'<textarea readonly>'+kEsc(txt)+'</textarea><div class="btnrow" style="margin-top:6px;display:flex;gap:6px"><button class="kbtn" data-kdcopy="'+i+'">📋 Kopieren</button><a class="kbtn kbtn-go" href="https://wa.me/?text='+encodeURIComponent(txt)+'" target="_blank" rel="noopener">💬 Per WhatsApp teilen</a></div></div>';}).join('')+'</div>';
  }
  return '<div class="card kpanel"><div class="kpanel-h"><b>📨 Wochen-Digest &amp; Kaderplaner</b><span style="flex:1"></span><button class="kx" id="kpClose" title="Schließen">✕</button></div>'
    +'<div class="kand-sub" style="margin-bottom:8px">Pro Planer eine fertige Erinnerung: wer ist fällig, wer ist im Plan. Kopieren oder direkt in WhatsApp teilen – z.B. jeden Montag.</div>'
    +'<div class="kctrl"><span class="kand-sub">Kaderplaner:</span> '+chips+' <input id="kplNew" class="kand-in" style="max-width:150px" placeholder="＋ Name" autocomplete="off" value="'+kEsc(kandPlDraft)+'"><button class="kbtn" id="kplAdd">Hinzufügen</button></div>'
    +'<label style="display:flex;align-items:center;gap:6px;font-size:12px;margin-top:8px"><input type="checkbox" id="kdContacts"'+(kandDigestContacts?' checked':'')+'> Kontaktdaten mit in den Text nehmen'+(canContacts()?'':' <i class="kand-sub">(nur für Kaderplaner)</i>')+'</label>'
    +cards+'</div>';
}
function kandKeyPanel(){
  const kv=metaOf().kv;
  let body;
  if(!tkCan()) body='<p class="kand-sub">Dieser Browser unterstützt keine Verschlüsselung. Bitte einen aktuellen Browser verwenden.</p>';
  else if(TK&&tkVerified) body='<p style="font-size:13px;margin:0 0 8px">✅ Auf diesem Gerät entsperrt. Kontaktdaten werden <b>im Browser verschlüsselt</b>, bevor sie gespeichert werden – online (GitHub, Make-Speicher) liegen sie nur als unlesbarer Code.</p><button class="kbtn" id="kKeyForget">Schlüssel auf diesem Gerät entfernen</button>';
  else body='<p style="font-size:13px;margin:0 0 8px">'+(kv?'Gib den <b>Team-Schlüssel</b> ein, den ihr unter euch Kaderplanern geteilt habt. Er wird nur auf diesem Gerät gespeichert.':'<b>Noch kein Team-Schlüssel festgelegt.</b> Am sichersten: <b>🎲 erzeugen</b> lassen, kopieren und den anderen Kaderplanern schicken. Eigener Schlüssel geht auch (mind. 12 Zeichen). Ohne Schlüssel sind die Kontaktdaten für niemanden lesbar – auch nicht für GitHub oder den Make-Speicher.')+'</p>'
    +'<div class="kctrl"><input type="'+(kv?'password':'text')+'" id="kKeyIn" class="kand-in" style="max-width:280px" placeholder="Team-Schlüssel" autocomplete="off" autocapitalize="off" spellcheck="false" value="'+kEsc(kandKeyDraft)+'">'+(kv?'':'<button class="kbtn" id="kKeyGen">🎲 Schlüssel erzeugen</button><button class="kbtn" id="kKeyCopy" title="Kopieren">📋</button>')+'<button class="kbtn kbtn-go" id="kKeyOk">'+(kv?'🔓 Entsperren':'🔐 Festlegen')+'</button></div>'
    +'<div class="kmsg">'+kEsc(kandKeyMsg)+'</div><p class="kand-sub" style="margin-top:4px">Der Schlüssel lässt sich nicht wiederherstellen – wer ihn vergisst, fragt einfach einen anderen Planer.</p>';
  return '<div class="card kpanel"><div class="kpanel-h"><b>🔐 Team-Schlüssel für Kontaktdaten</b><span style="flex:1"></span><button class="kx" id="kpClose" title="Schließen">✕</button></div>'+body+'</div>';
}

/* ---------- Ansicht ---------- */
function renderHomeKand(){
  const el=document.getElementById('homeKand'); if(!el)return;
  const L=kandList(); if(!L.length){el.innerHTML='';return;}
  const due=L.filter(kandIsDue).length;
  el.innerHTML='<div class="card homekand" role="button" tabindex="0"><div><b>🗂️ Kaderplaner-Pipeline</b><div class="kand-sub" style="font-size:12.5px;margin-top:2px">'+L.length+' Kandidat'+(L.length>1?'en':'')+(due?' · <span style="color:#ff8a8a;font-weight:700">'+due+' Kontakt'+(due>1?'e':'')+' überfällig</span>':' · alle Kontakte im Plan ✓')+'</div></div><span style="font-weight:800;font-size:20px;color:var(--accent)">›</span></div>';
  el.firstChild.onclick=()=>goTab('kandidaten');
}
function renderKandidaten(){
  try{renderHomeKand();}catch(e){}
  const wrap=document.getElementById('kandWrap'); if(!wrap)return;
  if(TK)kandCryptoTick();
  const planners=kandPlanners();
  const all=kandList();
  let list=all;
  if(kandFP)list=list.filter(p=>kandFP==='__me'?svIsMine(crmOf(p).pl):(crmOf(p).pl||'')===kandFP);
  if(kandDue)list=list.filter(kandIsDue);
  if(kandQ){const q=_mvpNorm(kandQ);list=list.filter(p=>_mvpNorm(p.name+' '+(p.club||'')).includes(q));}
  list=list.slice().sort((a,b)=>{
    const da=kandIsDue(a)?1:0,db=kandIsDue(b)?1:0; if(da!==db)return db-da;
    const sa=daysSince(crmOf(a).lc),sb=daysSince(crmOf(b).lc);
    const va=sa===null?1e9:sa,vb=sb===null?1e9:sb; if(va!==vb)return vb-va;
    const wa=crmOf(a).w||0,wb=crmOf(b).w||0; if(wa!==wb)return wb-wa;
    return (a.name||'').localeCompare(b.name||'');
  });
  const opt=(arr,cur,ph)=>'<option value="">'+ph+'</option>'+arr.map(o=>'<option value="'+kEsc(o)+'"'+(String(cur)===String(o)?' selected':'')+'>'+kEsc(o)+'</option>').join('');
  const dueCount=all.filter(kandIsDue).length;
  const keyBtn='';
  const stT={pending:'⏳ speichert…',ok:'☁️ gespeichert',err:'⚠️ offline – wird nachgeholt'}[SYNC_ST]||'';
  let html='<div class="card" style="padding:10px 12px;margin-bottom:8px">'
    +'<div class="kctrl">'
    +'<input id="kandSearch" class="kand-in" style="max-width:190px" placeholder="🔎 In Pipeline suchen…" value="'+kEsc(kandQ)+'" autocomplete="off">'
    +'<select id="kandPl" class="kand-in" style="max-width:160px">'+svPlOpts(opt(planners,kandFP,'Alle Planer'))+'</select>'
    +'<label style="display:flex;align-items:center;gap:5px;font-size:12px;color:var(--ink)"><input type="checkbox" id="kandDueChk"'+(kandDue?' checked':'')+'> nur überfällig</label>'
    +'<span style="flex:1"></span>'
    +'<span class="kchip" style="background:rgba(255,70,70,.15);color:#ff8a8a">'+dueCount+' überfällig</span>'
    +'<span class="kchip" style="background:var(--card2);color:var(--ink3)">'+all.length+' Kandidaten</span>'
    +'</div><div class="kctrl">'
    +'<div class="kadd"><input id="kandAdd" class="kand-in" placeholder="＋ Spieler aufnehmen (Name tippen)…" value="'+kEsc(kandAddQ)+'" autocomplete="off"><div id="kandAddRes" class="kaddres"></div></div>'
    +'<button class="kbtn" id="kDigBtn">📨 Digest &amp; Planer</button>'+keyBtn
    +'<span class="kchip ksync" style="background:var(--card2);color:var(--ink3)'+(stT?'':';display:none')+'">'+stT+'</span>'
    +'</div></div>';
  if(kandPanel==='digest')html+=kandDigestPanel();
  if(kandPanel==='key')html+=kandKeyPanel();
  if(!list.length){
    html+='<div class="card" style="padding:18px;text-align:center;color:var(--ink3,#8fa3c7)">'+(all.length?'Keine Kandidaten für diesen Filter.':'Noch keine Kandidaten. Oben bei <b>„＋ Spieler aufnehmen"</b> einen Namen tippen – oder im Spielerprofil ☆ „Auf die Shortlist".')+'</div>';
    wrap.innerHTML=html; wireKand(); return;
  }
  const rows=list.map(p=>{
    const C=crmOf(p),ds=daysSince(C.lc),due=kandIsDue(p),s=scores(p),W=p.own?null:wscoreSafe(p);
    const wsel='<select class="kand-in" data-kf="w" data-id="'+p.id+'"><option value="">–</option>'+[1,2,3,4].map(n=>'<option value="'+n+'"'+(C.w==n?' selected':'')+'>'+WPROB[n].t+'</option>').join('')+'</select>'
      +(W?'<div class="kand-sub" style="margin-top:2px" title="Modell-Wechselbereitschaft: '+kEsc(wreason(W,3))+'">Modell: '+W.w+'/100</div>':'');
    const posSel='<select class="kand-in" data-kf="tp" data-id="'+p.id+'">'+opt(KPOS,C.tp,(p.pos?p.pos+' (akt.)':'Pos'))+'</select>';
    const plSel='<select class="kand-in" data-kf="pl" data-id="'+p.id+'">'+opt(planners,C.pl,'—')+'</select>';
    const badge=due?(ds===null?'<span class="kchip" style="background:#ff5b5b22;color:#ff8a8a">nie kontaktiert</span>':'<span class="kchip" style="background:#ff5b5b22;color:#ff8a8a">überfällig · '+ds+' T</span>'):'<span class="kand-sub">vor '+ds+' T · fällig in '+(kandIv(p)-ds+1)+' T</span>';
    const mv=s.mvp!=null?' <span class="kchip" style="background:rgba(47,210,122,.14);color:#5fe09b" title="FuPa-MVP (team-relativ)">MVP '+s.mvp+'</span>':'';
    return '<tr class="'+(due?'due':'')+'">'
      +'<td class="kfull" data-l="Kandidat"><div style="display:flex;align-items:flex-start;gap:6px"><div style="flex:1;min-width:0"><span class="kand-name" data-open="'+p.id+'">'+kEsc(p.name)+'</span>'+mv
        +'<div class="kand-sub">'+kEsc(p.club||'')+(p.pos?' · '+kEsc(p.pos):'')+(p.alter?' · '+p.alter+' J':'')+' · MScore '+fmt(s.total,1)+'</div></div><button class="kx" data-krm="'+p.id+'" title="Aus der Pipeline nehmen">✕</button></div></td>'
      +'<td data-l="Wechsel-W.">'+wsel+'</td>'
      +'<td data-l="Rolle"><input class="kand-in" data-kf="rl" data-id="'+p.id+'" value="'+kEsc(C.rl||'')+'" placeholder="z.B. Stammspieler" list="kRoleList"></td>'
      +'<td data-l="Zielposition">'+posSel+'</td>'
      +'<td class="kfull" data-l="Kontakt 🔒">'+kandContactCell(p,C)+'</td>'
      +'<td class="kfull" data-l="Letzter Kontakt" style="white-space:nowrap"><input type="date" class="kand-in" style="width:128px;display:inline-block" data-kf="lc" data-id="'+p.id+'" value="'+kEsc(C.lc||'')+'"> <button class="kbtn" data-today="'+p.id+'">heute</button><div style="margin-top:3px">'+badge+'</div>'+kandIvSel(p,C)+'</td>'
      +'<td data-l="Verantwortlich">'+plSel+'</td>'
      +'<td class="kfull" data-l="Notiz"><input class="kand-in" data-kf="n" data-id="'+p.id+'" value="'+kEsc(C.n||'')+'" placeholder="Notiz"></td>'
      +'</tr>';
  }).join('');
  html+='<div class="kwrap"><table class="kand-table"><thead><tr><th>Kandidat</th><th>Wechsel-W.</th><th>Rolle</th><th>Zielposition</th><th>Kontakt 🔒</th><th>Letzter Kontakt</th><th>Verantw.</th><th>Notiz</th></tr></thead><tbody>'+rows+'</tbody></table></div>';
  wrap.innerHTML=html; wireKand();
}
function kandAddResults(){
  const box=document.getElementById('kandAddRes'); if(!box)return;
  const q=_mvpNorm(kandAddQ); if(q.length<2){box.innerHTML='';box.style.display='none';return;}
  const inPipe=new Set(kandList().map(p=>p.id));
  const res=players.filter(p=>!inPipe.has(p.id)&&_mvpNorm(p.name).includes(q))
    .map(p=>({p,t:scores(p).total,st:_mvpNorm(p.name).startsWith(q)||_mvpNorm(p.name.split(' ').slice(-1)[0]).startsWith(q)?1:0}))
    .sort((a,b)=>b.st-a.st||b.t-a.t).slice(0,8);
  box.innerHTML=res.length?res.map(({p,t})=>'<button type="button" class="kaddit" data-addid="'+p.id+'"><b>'+kEsc(p.name)+'</b>'+(p.own?' 🟢':'')+'<div class="kand-sub">'+kEsc(p.club||'')+' · '+kEsc(p.pos||'–')+' · '+(p.isJugend?'Jugend':kEsc(p.liga||''))+' · MScore '+fmt(t,1)+'</div></button>').join('')
    :'<div class="kand-sub" style="padding:10px">Kein Treffer (oder schon in der Pipeline).</div>';
  box.style.display='block';
  box.querySelectorAll('[data-addid]').forEach(b=>b.onclick=()=>{
    const id=b.dataset.addid,p=players.find(x=>x.id===id);
    if(p)p.star=true; crmSet(id,{f:1,px:undefined}); kandAddQ=''; renderKandidaten();
    kToast('✓ '+(p?p.name:'Spieler')+' in die Pipeline aufgenommen');
  });
}
function kandRemove(id){
  const p=players.find(x=>x.id===id), C=crmOf({id}), prev={f:C.f,pl:C.pl,w:C.w,s:C.s,px:C.px};
  const upd={f:undefined,pl:undefined,w:undefined,px:1}; if(C.s==='att')upd.s=undefined;
  if(p)p.star=false; crmSet(id,upd); const tRem=(CRM[id]&&CRM[id]._t&&CRM[id]._t.px)||0; renderKandidaten();
  kToast((p?p.name:'Spieler')+' aus der Pipeline genommen','Rückgängig',()=>{ const T=(CRM[id]&&CRM[id]._t)||{}, back={}; Object.keys(prev).forEach(k=>{ if((T[k]||0)===tRem)back[k]=prev[k]; }); if(p&&('f' in back))p.star=!!prev.f; crmSet(id,back); renderKandidaten(); });
}
function wireKand(){
  const w=document.getElementById('kandWrap'); if(!w)return;
  const s=document.getElementById('kandSearch'); if(s){s.oninput=e=>{kandQ=e.target.value;};s.onchange=e=>{kandQ=e.target.value;renderKandidaten();};s.onkeydown=e=>{if(e.key==='Enter'){kandQ=e.target.value;renderKandidaten();}};}
  const pl=document.getElementById('kandPl'); if(pl)pl.onchange=e=>{kandFP=e.target.value;renderKandidaten();};
  const dc=document.getElementById('kandDueChk'); if(dc)dc.onchange=e=>{kandDue=e.target.checked;renderKandidaten();};
  const ad=document.getElementById('kandAdd');
  if(ad){ ad.oninput=e=>{kandAddQ=e.target.value;kandAddResults();}; ad.onfocus=()=>kandAddResults();
    ad.onkeydown=e=>{ if(e.key==='Escape'){kandAddQ='';ad.value='';kandAddResults();} if(e.key==='Enter'){const f=document.querySelector('#kandAddRes [data-addid]');if(f)f.click();} };
    if(kandAddQ){kandAddResults();} }
  const db=document.getElementById('kDigBtn'); if(db)db.onclick=()=>{kandPanel=kandPanel==='digest'?'':'digest';renderKandidaten();};
  const kb=document.getElementById('kKeyBtn'); if(kb)kb.onclick=()=>{kandPanel=kandPanel==='key'?'':'key';kandKeyMsg='';renderKandidaten();setTimeout(()=>{const i=document.getElementById('kKeyIn');if(i)i.focus();},0);};
  const pc=document.getElementById('kpClose'); if(pc)pc.onclick=()=>{kandPanel='';renderKandidaten();};
  const ko=document.getElementById('kKeyOk'), ki=document.getElementById('kKeyIn');
  if(ko&&ki){ko.onclick=()=>tkSetPass(ki.value);ki.onkeydown=e=>{if(e.key==='Enter')tkSetPass(ki.value);};ki.oninput=e=>{if(ki.type==='text')kandKeyDraft=e.target.value;};}
  const kg=document.getElementById('kKeyGen'); if(kg&&ki)kg.onclick=()=>{ki.value=tkGenerate();kandKeyDraft=ki.value;ki.focus();ki.select();};
  const kc=document.getElementById('kKeyCopy'); if(kc&&ki)kc.onclick=()=>{if(ki.value)kCopy(ki.value);};
  const kf=document.getElementById('kKeyForget'); if(kf)kf.onclick=tkForget;
  const pa=document.getElementById('kplAdd'), pn=document.getElementById('kplNew');
  const addPl=()=>{const n=(pn.value||'').replace(/[^\p{L}\p{N} .\-]/gu,'').trim().replace(/\s+/g,' ').slice(0,30); if(!n)return; if(!PLANNERS_DEFAULT.includes(n)&&!metaPlanners().includes(n)){const u={};u['pl:'+n]=1;crmSet(META_ID,u);} kandPlDraft=''; renderKandidaten(); kToast('✓ '+n+' als Kaderplaner ergänzt');};
  if(pa&&pn){pa.onclick=addPl;pn.onkeydown=e=>{if(e.key==='Enter')addPl();};pn.oninput=e=>{kandPlDraft=e.target.value;};}
  w.querySelectorAll('[data-plrm]').forEach(b=>b.onclick=()=>{const u={};u['pl:'+b.dataset.plrm]=undefined;crmSet(META_ID,u);renderKandidaten();});
  const dcx=document.getElementById('kdContacts'); if(dcx)dcx.onchange=e=>{kandDigestContacts=e.target.checked;renderKandidaten();};
  w.querySelectorAll('[data-kdcopy]').forEach(b=>b.onclick=()=>kCopy(kandDigestCache[+b.dataset.kdcopy]||''));
  w.querySelectorAll('[data-kf]').forEach(el=>{el.onchange=()=>{
    const id=el.dataset.id,kf=el.dataset.kf;let v=el.value;
    if(kf==='w'||kf==='ri')v=v?+v:'';
    const upd={};upd[kf]=(v===''||v==null)?undefined:(typeof v==='string'?v.trim():v);
    if(kf==='lc'&&v)upd.c=1;
    crmSet(id,upd);kandSoftRender();
  };});
  w.querySelectorAll('[data-kc]').forEach(el=>{el.onchange=()=>kandSaveContact(el.dataset.kc,el.value);});
  w.querySelectorAll('[data-today]').forEach(b=>{b.onclick=()=>{crmSet(b.dataset.today,{lc:todayISO(),c:1});renderKandidaten();kToast('✓ Kontakt heute eingetragen');};});
  w.querySelectorAll('[data-krm]').forEach(b=>{b.onclick=()=>kandRemove(b.dataset.krm);});
  w.querySelectorAll('[data-open]').forEach(el=>{el.onclick=()=>{try{startPlayer(el.dataset.open);}catch(e){}};});
}

/* ===== Kaderplan-Board: druckbare Kaderplanung (Stamm/Backup/Ziel je Position) auf LINEUP+SHADOW ===== */
let kpShowZiel=true;
function kpCellOwn(p,want){
  if(!p)return '<span class="kp-none">—</span>';
  const s=scores(p),tag=want?posFit(p,want):null;
  return '<span class="kp-ov" style="background:'+tierColor(s.total)+'">'+Math.round(s.total)+'</span> <span class="kp-name" data-open="'+p.id+'">'+kEsc(p.name)+'</span>'+(tag?' <span class="kp-fit" style="color:'+tag.col+'">'+kEsc(tag.tag)+'</span>':'');
}
function kpCellExt(p,want){
  if(!p)return '<span class="kp-none">—</span>';
  const W=p.own?null:wscore(p),v=W?W.k:scores(p).total,tag=want?posFit(p,want):null;
  return '<span class="kp-ov" style="background:'+tierColor(v)+'">'+Math.round(v)+'</span> <span class="kp-name" data-open="'+p.id+'">'+kEsc(p.name)+'</span> <i class="kp-club">'+kEsc(p.own?'eigen':(p.club||''))+'</i>'+(tag?' <span class="kp-fit" style="color:'+tag.col+'">'+kEsc(tag.tag)+'</span>':'');
}
function renderKaderplan(){
  const wrap=document.getElementById('kaderplanWrap'); if(!wrap)return;
  if(!Object.keys(LINEUP.slots).length){ try{initLineupSeed();}catch(e){} }
  const form=FORMATIONS[LINEUP.formation];
  const P=id=>id&&players.find(z=>z.id===id);
  const groups={TOR:[],ABWEHR:[],MITTELFELD:[],ANGRIFF:[]};
  form.forEach((sl,i)=>{const role=sl[0],y=sl[2];const g=role==='TW'?'TOR':(y>=66?'ABWEHR':(y>=40?'MITTELFELD':'ANGRIFF'));groups[g].push({i,role,x:sl[1]});});
  Object.values(groups).forEach(a=>a.sort((p,q)=>p.x-q.x));
  let open=0,thin=0,ok=0,body='';
  ['TOR','ABWEHR','MITTELFELD','ANGRIFF'].forEach(g=>{
    if(!groups[g].length)return;
    body+='<tr class="kp-grp"><td colspan="'+(kpShowZiel?5:4)+'">'+g+'</td></tr>';
    groups[g].forEach(o=>{
      const i=o.i,role=o.role,want=ROLE2POS[role];
      const st=P(LINEUP.slots[i]),b=P((SHADOW[i]||{}).b),z=P((SHADOW[i]||{}).z);
      let status;
      if(!st){status='<span class="kp-st off">✕ offen</span>';open++;}
      else if(!b){status='<span class="kp-st thin">⚠ kein Backup</span>';thin++;}
      else{status='<span class="kp-st ok">✓ besetzt</span>';ok++;}
      body+='<tr'+(!st?' class="kp-open"':'')+'><td class="kp-pos" data-l="Pos">'+role+'</td>'
        +'<td data-l="Stammspieler">'+kpCellOwn(st,null)+'</td>'
        +'<td class="kp-sub" data-l="Backup">'+kpCellOwn(b,want)+'</td>'
        +(kpShowZiel?'<td class="kp-sub" data-l="🎯 Ziel">'+kpCellExt(z,want)+'</td>':'')
        +'<td class="kp-stc" data-l="Status">'+status+'</td></tr>';
    });
  });
  const d=new Date(),dstr=String(d.getDate()).padStart(2,'0')+'.'+String(d.getMonth()+1).padStart(2,'0')+'.'+d.getFullYear();
  let html='<div class="kp-print-only"><div style="font-size:20px;font-weight:800">SV/BSC Mörlenbach – Kaderplanung</div><div style="font-size:11px;color:#555;margin-top:2px">Formation '+LINEUP.formation+' · Stand '+dstr+' · Stammspieler + Backup = aktueller Kader · 🎯 Ziel = Wunsch/Transferziel nächste Saison</div></div>';
  html+='<div class="sechead">📋 Kaderplan <small style="color:var(--ink3)">Formation '+LINEUP.formation+' · Stand '+dstr+'</small></div>';
  html+='<div class="card" style="padding:8px 10px;margin-bottom:8px"><div class="kp-head">'
    +'<div class="kp-sum"><span class="kchip" style="background:rgba(47,210,122,.15);color:#5fe09b">'+ok+' besetzt</span>'
    +'<span class="kchip" style="background:rgba(255,179,71,.15);color:#ffb347">'+thin+' ohne Backup</span>'
    +'<span class="kchip" style="background:rgba(255,70,70,.18);color:#ff8a8a">'+open+' offen</span></div>'
    +'<span style="flex:1"></span>'
    +'<label class="kp-noprint" style="display:flex;align-items:center;gap:5px;font-size:12px"><input type="checkbox" id="kpZiel"'+(kpShowZiel?' checked':'')+'> 🎯 Zielbild nächste Saison</label>'
    +'<button class="kbtn kp-noprint" id="kpFill">⚡ Backups &amp; Ziele auto-füllen</button>'
    +'<button class="kbtn kp-noprint" id="kpPrint">🖨️ Als PDF / drucken</button></div>'
    +'<div class="kp-noprint" style="font-size:11px;color:var(--ink3);margin-top:4px">„Stammspieler" + „Backup" = so sieht der Kader jetzt aus · „🎯 Ziel" = Wunsch/Transferziel nächste Saison. Formation &amp; Startelf im Tab ⚽ Aufstellung setzen; Backup/Ziel je Position dort in der Schattenelf editierbar. Positions-Tags (✓/◐/~) zeigen Mehrfachpositionen.</div></div>';
  html+='<div class="kwrap"><table class="kp-table"><thead><tr><th>Pos</th><th>Stammspieler (jetzt)</th><th>Backup (jetzt)</th>'+(kpShowZiel?'<th>🎯 Ziel nächste Saison</th>':'')+'<th>Status</th></tr></thead><tbody>'+body+'</tbody></table></div>'
    +'<div class="kand-sub" style="margin-top:8px">Zahl = MScore (0–100) · Positions-Tags: ✓ Hauptposition · ◐ Nebenposition · ~ möglich · Ziel-Spieler mit Verein.</div>';
  wrap.innerHTML=html; wireKaderplan();
}
function wireKaderplan(){
  const w=document.getElementById('kaderplanWrap'); if(!w)return;
  const z=document.getElementById('kpZiel'); if(z)z.onchange=e=>{kpShowZiel=e.target.checked;renderKaderplan();};
  const f=document.getElementById('kpFill'); if(f)f.onclick=()=>{try{shadowAutoFill();}catch(e){}renderKaderplan();};
  const pr=document.getElementById('kpPrint'); if(pr)pr.onclick=()=>{try{window.print();}catch(e){}};
  w.querySelectorAll('[data-open]').forEach(el=>{el.onclick=()=>{try{startPlayer(el.dataset.open);}catch(e){}};});
}
/* ===== FuPa-MVP (Saison 26/27): team-relativer Leistungswert 0–100 aus der FuPa-Spielerstatistik =====
   Fließt als ±6 %-Modifikator in den MScore (50 % = neutral), siehe scores(). Quelle: CRM[pid].mv/.mvd
   (in der App gepflegt, geräteübergreifend) – sonst der Start-Datensatz MVP_SEED (Stand 22.09.2026). */
function _mvpNorm(s){s=(s||'').toLowerCase();s=s.split('ä').join('ae').split('ö').join('oe').split('ü').join('ue').split('ß').join('ss');try{s=s.normalize('NFKD').replace(/[\u0300-\u036f]/g,'');}catch(e){}return s.replace(/[^a-z]/g,'');}
const MVP_SEED={
 'juliusfries':82,'florianseltenreich':78,'simongoderbauer':100,'paulbartmann':76,
 'andrewalter':78,'nicogarotti':78,'svenschill':66,'lukasgoderbauer':70,'juliangoderbauer':71
};
const MVP_SEED_DATE='2026-09-22';
let _mvpSeeded=false, mvpSeedHits=0;
function applyMvpSeed(){ if(_mvpSeeded)return; _mvpSeeded=true; mvpSeedHits=0;
  players.forEach(p=>{ if(!p.own)return; const k=_mvpNorm(p.name); if(MVP_SEED[k]!=null){ p.mvp=MVP_SEED[k]; mvpSeedHits++; } });
}
function mvpOf(p){
  let C=null; try{C=CRM[p.id];}catch(e){C=null;}
  if(C&&typeof C.mv==='number')return {v:C.mv,d:C.mvd||null,src:'app'};
  if(typeof p.mvp==='number')return {v:p.mvp,d:MVP_SEED_DATE,src:'seed'};
  return null;
}
function mvpFactor(v){return 0.94+0.12*(v/100);}

/* ---------- Pflege-Maske (Tab Datenbank): Team wählen → Werte von der FuPa-Spielerstatistik eintragen ---------- */
let mvpTeam=null, mvpDraft={}, mvpDirty=false, mvpOpen=false, mvpMsg='', mvpDate=null, mvpPasteOpen=false, mvpPasteText='';
const MVP_POS_ORDER={TW:0,IV:1,AV:2,ZM:3,OM:4,'Flügel':5,ST:6};
function mvpClubs(){
  const cnt={}; players.forEach(p=>{if(p.isJugend||!p.club)return;cnt[p.club]=(cnt[p.club]||0)+1;});
  const own=[...new Set(players.filter(p=>p.own&&!p.isJugend&&p.club).map(p=>p.club))];
  const rest=Object.keys(cnt).filter(c=>!own.includes(c)).sort((a,b)=>a.localeCompare(b,'de'));
  return {own,rest,cnt};
}
function mvpTeamPlayers(){return players.filter(p=>p.club===mvpTeam&&!p.isJugend).sort((a,b)=>((MVP_POS_ORDER[a.pos]??9)-(MVP_POS_ORDER[b.pos]??9))||(a.name||'').localeCompare(b.name||'','de'));}
function mvpPreviewCell(p,raw){
  const s=scores(p);
  if(p.adjTo!=null)return '<span class="kand-sub">Insider-Rating '+fmt(s.total,1)+' (fix)</span>';
  const v=String(raw==null?'':raw).trim();
  const nt=v===''||isNaN(+v)?s.mvpBase:Math.min(100,s.mvpBase*mvpFactor(clamp(+v,0,100)));
  const d=Math.round((nt-s.total)*10)/10;
  return fmt(s.total,1)+(Math.abs(d)>=0.1?' → <b>'+fmt(nt,1)+'</b> <span class="'+(d>0?'up':'dn')+'">'+(d>0?'+':'')+fmt(d,1)+'</span>':'');
}
function renderMvpCard(force){
  const el=document.getElementById('mvpCard'); if(!el)return;
  if(mvpDirty&&!force)return; /* nicht mitten in der Eingabe neu zeichnen */
  const {own,rest,cnt}=mvpClubs();
  if(!mvpTeam||(!own.includes(mvpTeam)&&!rest.includes(mvpTeam)))mvpTeam=own[0]||rest[0];
  if(!mvpDate)mvpDate=todayISO();
  const team=mvpTeamPlayers();
  const withMvp=players.filter(p=>!p.isJugend&&mvpOf(p)).length;
  const lastD=team.map(p=>{const m=mvpOf(p);return m&&m.d;}).filter(Boolean).sort().pop();
  const opt=c=>'<option value="'+kEsc(c)+'"'+(c===mvpTeam?' selected':'')+'>'+kEsc(c)+' ('+cnt[c]+')</option>';
  const rows=team.map(p=>{
    const m=mvpOf(p), raw=(p.id in mvpDraft)?mvpDraft[p.id]:(m?m.v:'');
    return '<tr><td><b>'+kEsc(p.name)+'</b>'+(p.own?' 🟢':'')+'<div class="kand-sub">'+kEsc(p.pos||'–')+(m?' · jetzt '+m.v+' % ('+kEsc(fmtD(m.d))+')':'')+'</div></td>'
      +'<td><input class="mvin" type="number" min="0" max="100" step="1" inputmode="numeric" data-mv="'+p.id+'" value="'+kEsc(raw)+'" placeholder="–"></td>'
      +'<td class="mvprev" data-mvprev="'+p.id+'">'+mvpPreviewCell(p,raw)+'</td></tr>';
  }).join('');
  el.innerHTML='<details id="mvpDet"'+(mvpOpen?' open':'')+'><summary>📥 FuPa-MVP nach dem Spieltag eintragen <span class="kand-sub" style="font-weight:600">· '+withMvp+' Spieler mit MVP-Wert · fließt mit max. ±6 % ins MScore</span></summary>'
    +'<p class="kand-sub" style="margin:8px 0">So geht\'s: In der FuPa-App das Team öffnen → <b>Spielerstatistik</b> → Spalte <b>MVP</b>. Werte hier eintippen (0–100) und speichern – alle Ratings rechnen sofort neu, auf allen Geräten. Leeres Feld = kein MVP-Wert.</p>'
    +'<div class="kctrl"><label class="kand-sub">Team</label><select id="mvpTeamSel">'+(own.length?'<optgroup label="Eigene Teams">'+own.map(opt).join('')+'</optgroup>':'')+'<optgroup label="Alle Teams">'+rest.map(opt).join('')+'</optgroup></select>'
    +'<label class="kand-sub">Stand</label><input type="date" id="mvpDateIn" value="'+kEsc(mvpDate)+'">'
    +(lastD?'<span class="kand-sub">zuletzt gepflegt: '+kEsc(fmtD(lastD))+'</span>':'')+'</div>'
    +'<details id="mvpPasteDet" style="margin-top:8px"'+(mvpPasteOpen?' open':'')+'><summary class="kand-sub" style="font-size:12.5px">📋 Oder: Text von der FuPa-Seite einfügen und Werte automatisch erkennen</summary>'
    +'<textarea id="mvpPaste" placeholder="Auf fupa.net die Spielerstatistik des Teams markieren, kopieren und hier einfügen…">'+kEsc(mvpPasteText)+'</textarea>'
    +'<div class="kctrl" style="margin-top:6px"><button class="kbtn" id="mvpParseBtn">Werte erkennen</button><span class="kand-sub">Erkannte Werte erscheinen unten zum Prüfen – gespeichert wird erst mit „Speichern".</span></div></details>'
    +'<div style="overflow-x:auto"><table class="mvtbl"><thead><tr><th>Spieler</th><th>MVP %</th><th>MScore → neu</th></tr></thead><tbody>'+(rows||'<tr><td colspan="3" class="kand-sub">Keine Spieler für dieses Team erfasst.</td></tr>')+'</tbody></table></div>'
    +'<div class="kctrl" style="margin-top:10px"><button class="btn" id="mvpSaveBtn">💾 Speichern &amp; neu bewerten</button>'+(mvpDirty?'<button class="kbtn" id="mvpResetBtn">Verwerfen</button>':'')+'<span class="kand-sub" id="mvpMsgEl" style="color:'+(/^✓/.test(mvpMsg)?'#5fe09b':'var(--ink3)')+'">'+kEsc(mvpMsg)+'</span></div>'
    +'</details>';
  const det=document.getElementById('mvpDet'); det.ontoggle=()=>{mvpOpen=det.open;};
  const pdet=document.getElementById('mvpPasteDet'); pdet.ontoggle=()=>{mvpPasteOpen=pdet.open;};
  document.getElementById('mvpTeamSel').onchange=e=>{ if(mvpDirty&&!confirmDiscard())return renderMvpCard(true); mvpTeam=e.target.value; mvpDraft={}; mvpDirty=false; mvpMsg=''; renderMvpCard(true); };
  document.getElementById('mvpDateIn').onchange=e=>{mvpDate=e.target.value||todayISO();};
  el.querySelectorAll('[data-mv]').forEach(inp=>{inp.oninput=()=>{
    mvpDraft[inp.dataset.mv]=inp.value; mvpDirty=true;
    const p=players.find(x=>x.id===inp.dataset.mv), c=el.querySelector('[data-mvprev="'+inp.dataset.mv+'"]'); if(p&&c)c.innerHTML=mvpPreviewCell(p,inp.value);
  };});
  document.getElementById('mvpPaste').oninput=e=>{mvpPasteText=e.target.value;};
  document.getElementById('mvpParseBtn').onclick=()=>{ const n=mvpParse(document.getElementById('mvpPaste').value); mvpMsg=n?(n+' Wert'+(n>1?'e':'')+' erkannt – bitte kurz prüfen und speichern.'):'Keine Werte erkannt – bitte Namen/Zahlen prüfen oder direkt eintippen.'; mvpPasteOpen=!n; if(n)mvpPasteText=''; renderMvpCard(true); };
  document.getElementById('mvpSaveBtn').onclick=mvpSave;
  const rb=document.getElementById('mvpResetBtn'); if(rb)rb.onclick=()=>{mvpDraft={};mvpDirty=false;mvpMsg='';renderMvpCard(true);};
}
function confirmDiscard(){try{return window.confirm('Nicht gespeicherte MVP-Eingaben verwerfen?');}catch(e){return true;}}
function mvpParse(text){
  /* Erkennt je Spieler den MVP-Wert in kopiertem FuPa-Text: vollständiger Name (mind. Vor- + Nachname),
     danach die erste Zahl 0–100 – "2/2" (Elfmeter) wird übersprungen, "2." (nächster Platz) oder "–" beendet die Zeile. */
  const toks=String(text||'').split(/\s+/).filter(Boolean), nt=toks.map(_mvpNorm); let found=0;
  const team=mvpTeamPlayers(), cnt={};
  team.forEach(p=>{const f=_mvpNorm(p.name);cnt[f]=(cnt[f]||0)+1;});
  team.forEach(p=>{
    const parts=String(p.name||'').split(/\s+/).map(_mvpNorm).filter(Boolean);
    if(parts.length<2||cnt[_mvpNorm(p.name)]>1)return;          /* Einzelnamen / doppelte Namen: lieber von Hand */
    for(let i=0;i<=nt.length-parts.length;i++){
      let ok=true; for(let j=0;j<parts.length;j++){ if(nt[i+j]!==parts[j]){ok=false;break;} } if(!ok)continue;
      let val=null;
      for(let k=i+parts.length;k<Math.min(toks.length,i+parts.length+8);k++){
        const raw=toks[k];
        if(/^\d+\.$/.test(raw)||/^[–—-]$/.test(raw))break;       /* nächster Platz oder "kein Wert" */
        if(/[\/:]/.test(raw))continue;                             /* 2/2, 90:00 */
        const m=raw.replace(/%$/,'').match(/^(\d{1,3})(?:[.,](\d+))?$/);
        if(m){ const v=Math.round(parseFloat(m[1]+(m[2]?'.'+m[2]:''))); if(v>=0&&v<=100)val=v; break; }
        if(/[a-zäöüß]{2,}/i.test(raw))break;                        /* Text → nächster Name */
      }
      if(val!=null){ mvpDraft[p.id]=String(val); found++; break; }   /* sonst nächstes Vorkommen prüfen */
    }
  });
  if(found)mvpDirty=true;
  return found;
}
function mvpSave(){
  const date=mvpDate||todayISO(); let n=0;
  for(const id in mvpDraft){
    const p=players.find(x=>x.id===id); if(!p)continue;
    const raw=String(mvpDraft[id]).trim(), cur=mvpOf(p);
    if(raw===''){ if(cur&&cur.src==='app'){crmSet(id,{mv:undefined,mvd:undefined});n++;} continue; }
    const v=clamp(Math.round(+raw),0,100); if(isNaN(v))continue;
    if(cur&&cur.src==='app'&&cur.v===v&&cur.d===date)continue;
    crmSet(id,{mv:v,mvd:date}); n++;
  }
  mvpDraft={}; mvpDirty=false;
  mvpMsg=n?('✓ '+n+' MVP-Wert'+(n>1?'e':'')+' gespeichert – alle Ratings sind neu berechnet.'):'Keine Änderungen zu speichern.';
  renderAll(); renderMvpCard(true);
}

function renderAll(){try{applyMvpSeed();}catch(e){}renderHome();renderList();renderGems();renderJugend();renderShortlist();renderDB();fillCompareSelects();updateCompare();try{renderLineup();}catch(e){}try{renderKandidaten();}catch(e){}try{renderKaderplan();}catch(e){}try{renderMvpCard();}catch(e){}}

/* ================= MODAL ================= */
function nrm(s){return (s||'').toLowerCase().replace(/ä/g,'ae').replace(/ö/g,'oe').replace(/ü/g,'ue').replace(/ß/g,'ss').replace(/\s+/g,' ').trim();}
function wscore(p){
  if(p.own)return null;
  const f=[]; let w=50;
  const add=(v,t)=>{w+=v;f.push([v,t]);};
  if(p.exSvbc)add(15,'Ex-SV/BSC — Rückkehr hat Anknüpfungspunkte');
  else if(crmOf(p).x)add(15,'Ex-SV/BSC (von euch markiert) — Rückkehr hat Anknüpfungspunkte');
  if(p.isJugend)add(15,'Jugendspieler: Sprung in den Seniorenbereich steht ohnehin an');
  if(p.zweit)add(14,'Spielt in einer Zweitvertretung — bei uns winkt 1.-Mannschafts-Fußball');
  const lowPlay=(p.min&&p.teamSp&&p.min/(p.teamSp*90)<0.45)||(!p.min&&p.einsaetze&&p.teamSp&&p.einsaetze/p.teamSp<0.6);
  if(p.min&&p.teamSp&&p.min/(p.teamSp*90)<0.45)add(12,'Wenig Spielzeit ('+p.min.toLocaleString('de-DE')+' Min.) — sitzt offenbar oft draußen');
  else if(p.einsaetze&&p.teamSp&&p.einsaetze/p.teamSp<0.6)add(7,'Nur '+p.einsaetze+' von '+p.teamSp+' Teamspielen absolviert');
  if(p.liga==='KOL'){
    if(lowPlay)add(-5,'Kickt eine Liga höher (KOL), dort aber ohne Stammplatz — Schritt runter für Spielzeit ist ein Klassiker');
    else add(-18,'Kickt eine Liga über uns (KOL) — müsste sportlich absteigen');
  }
  if(p.liga==='GL'){
    if(lowPlay)add(-8,'Kickt zwei Ligen höher (Gruppenliga), dort aber meist draußen — für garantierte Spielzeit ansprechbar');
    else add(-26,'Gruppenliga-Stammspieler (2 Ligen über uns) — Wechsel in die A-Klasse sehr unwahrscheinlich');
  }
  if(p.liga==='B')add(8,'Kreisliga B: Schritt in die A-Klasse wäre attraktiv');
  if(p.liga==='C')add(11,'Kreisliga C: deutlicher sportlicher Aufstieg möglich');
  if(p.liga==='D'&&!p.isJugend)add(13,'Kreisliga D: A-Klasse wäre ein großer Schritt nach oben');
  if(p.km!=null){
    if(p.km<=5)add(10,'Nur '+p.km+' km entfernt — quasi Nachbarschaft');
    else if(p.km<=10)add(6,p.km+' km — gut erreichbar');
    else if(p.km<=15)add(2,p.km+' km — machbar');
    else if(p.km<=25)add(-6,p.km+' km — schon ein Stück Fahrt');
    else add(-14,p.km+' km — unrealistische Distanz für die A-Klasse');
  }
  if(p.rank!=null&&p.teamCount>1){
    const q=(p.rank-1)/(p.teamCount-1);
    if(q>=0.7)add(8,'Sein Team steckt im Tabellenkeller (Platz '+p.rank+') — Frust möglich');
    else if(q<=0.2)add(-10,'Sein Team spielt oben mit (Platz '+p.rank+') — wenig Wechselgrund');
  }
  if(p.kanone)add(-12,'Torschützenkönig — steht auf jeder Wunschliste, schwer zu bekommen');
  const sh=(p.tT&&p.tT>0)?p.tore/p.tT:0;
  if(sh>=0.35&&!p.zweit)add(-7,'Trägt '+Math.round(sh*100)+' % der Teamtore — sein Verein wird um ihn kämpfen');
  if(p.alter!=null&&p.alter<=19&&!p.isJugend)add(5,'U20 — sucht den nächsten Entwicklungsschritt');
  if(p.pressStats&&p.pressStats.wechsel)add(7,'Wechsel-Historie in der Presse — grundsätzlich mobil');
  if(p.status&&/verletzt/i.test(p.status))add(-8,'Aktuell verletzt gemeldet');
  const _sc=scores(p);
  if(_sc.mvp!=null){ if(_sc.mvp>=90)add(-6,'FuPa-MVP '+_sc.mvp+' % – Schlüsselspieler seines Teams, der Verein wird ihn halten wollen'); else if(_sc.mvp<=55)add(5,'FuPa-MVP nur '+_sc.mvp+' % – eher Randfigur, bei uns winkt mehr Verantwortung'); }
  w=clamp(Math.round(w),3,97);
  const k=Math.round((_sc.total*0.55+w*0.45)*10)/10;
  f.sort((a,b)=>Math.abs(b[0])-Math.abs(a[0]));
  return {w,k,f};
}
function wscoreSafe(p){try{return p.own?null:wscore(p);}catch(e){return null;}}
function wreason(W,n){return W.f.slice(0,n||2).map(x=>x[1]).join(' · ');}
let radarChart=null;
let NAV=[], CURVIEW=null;
function closeOverlay(){document.getElementById('overlay').classList.remove('open');NAV=[];CURVIEW=null;}
function renderView(d){ if(d.t==='player'){CURVIEW=d;openModal(d.id);} else if(d.t==='rank'){openRanking(d.cfg);} }
function nav(d){ if(CURVIEW)NAV.push(CURVIEW); renderView(d); }
function navBack(){ const d=NAV.pop(); if(!d)return closeOverlay(); renderView(d); }
function startPlayer(id){ NAV=[]; CURVIEW=null; renderView({t:'player',id}); }
function avaMini(r){ const p=players.find(x=>x.id===r.id); const src=p&&(p.photo||p.photoUrl); return `<div class="ava l-${p?p.liga:'A'}" style="width:30px;height:30px;font-size:11px;border-radius:9px">${src?`<img src="${src}" alt="" onerror="this.remove()">`:(p?initials(p.name):'?')}</div>`; }
function buildRanking(liga,isJugend,metric,hid){
  const pool=players.filter(x=>x.liga===liga && x.isJugend===isJugend);
  const gv=(x)=> metric==='score'?scores(x).total : metric==='gpg'?scores(x).gpg : x.tore;
  const arr=[...pool].sort((a,b)=>gv(b)-gv(a));
  const fv=(x)=> metric==='score'?fmt(scores(x).total,1) : metric==='gpg'?fmt(scores(x).gpg)+'/Sp.' : x.tore+' Tore';
  const ligaName=isJugend?'Jugend':LIGA_NAME[liga];
  const tmap={tore:'⚽ Torjäger',score:'⭐ MScore-Rangliste',gpg:'📊 Tore pro Spiel'};
  return {liga, isJugend, metric, hid,
    title:`${tmap[metric]} · ${ligaName}`,
    subtitle:`${arr.length} erfasste Spieler`,
    tabs:[['tore','Tore'],['score','MScore'],['gpg','Tore/Sp.']],
    rows:arr.map(x=>({id:x.id,name:x.name,club:x.club,val:fv(x),me:x.id===hid})),
    note:'Zeile antippen → Profil. Oben umschalten: Tore · MScore · Quote.'};
}
function buildClubView(clubName,hid){
  const c=(typeof clubFor==='function')?clubFor(clubName):null;
  const pool=players.filter(x=>x.club===clubName).sort((a,b)=>scores(b).total-scores(a).total);
  let hist='';
  if(c){ hist=[['s2526','25/26'],['s2425','24/25'],['s2324','23/24'],['s2223','22/23']].filter(k=>c[k[0]]).map(k=>`${k[1]}: ${(LIGA_LONG[c[k[0]].liga]||c[k[0]].liga)} Platz ${c[k[0]].platz}`).join(' · '); }
  return {liga:null,isJugend:false,metric:'score',hid,
    title:`🏟 ${clubName}`,
    subtitle: hist||'Vereins-Historie nicht öffentlich verfügbar',
    tabs:null,
    rows:pool.map(x=>({id:x.id,name:x.name,club:LIGA_NAME[x.liga]||'',val:fmt(scores(x).total,1),me:x.id===hid})),
    note:'Erfasste Spieler dieses Vereins nach MScore. Zeile antippen → Profil.'};
}
function openRanking(cfg){
  CURVIEW={t:'rank',cfg};
  const back = NAV.length?`<button class="close" id="mback" style="right:56px" title="Zurück">‹</button>`:'';
  const tabs = cfg.tabs?`<div style="display:flex;gap:6px;flex-wrap:wrap;margin:10px 0 2px">${cfg.tabs.map(t=>`<button class="rtab ${t[0]===cfg.metric?'on':''}" data-m="${t[0]}">${t[1]}</button>`).join('')}</div>`:'';
  document.getElementById('modal').innerHTML=`${back}<button class="close" id="mclose">✕</button>
    <h2 style="font-size:19px">${cfg.title}</h2>
    <div class="msub">${cfg.subtitle||''}</div>
    ${tabs}
    <div style="margin-top:10px;max-height:62vh;overflow:auto">
      ${cfg.rows.map((r,i)=>`<div class="rankrow ${r.me?'me':''}" ${r.id?`data-goid="${r.id}"`:''}>
        <span class="rk">${i+1}</span>${r.id?avaMini(r):'<span></span>'}
        <span class="rn">${r.name}${r.me?' <b style="color:var(--accent)">· hier</b>':''}<br><i>${r.club||''}</i></span>
        <span class="rv">${r.val}</span></div>`).join('')}
    </div>
    ${cfg.note?`<p class="note">${cfg.note}</p>`:''}`;
  document.getElementById('overlay').classList.add('open');
  document.getElementById('mclose').onclick=closeOverlay;
  {const b=document.getElementById('mback'); if(b)b.onclick=navBack;}
  document.querySelectorAll('#modal .rtab').forEach(bt=>bt.onclick=()=>openRanking(buildRanking(cfg.liga,cfg.isJugend,bt.dataset.m,cfg.hid)));
  document.querySelectorAll('#modal [data-goid]').forEach(el=>el.onclick=()=>nav({t:'player',id:el.dataset.goid}));
}
function openLegend(){
  const ring=(v)=>`<span style="display:inline-grid;place-items:center;width:40px;height:40px;border-radius:50%;background:conic-gradient(${tierColor(v)} ${v}%, rgba(255,255,255,.09) 0);vertical-align:middle;margin-right:8px"><span style="width:32px;height:32px;border-radius:50%;background:var(--card);display:grid;place-items:center;font-size:11px;font-weight:900">${v}</span></span>`;
  document.getElementById('modal').innerHTML=`
    <button class="close" id="mclose">✕</button>
    <h2>ⓘ Legende &amp; Erklärungen</h2>
    <div class="seas"><h4>Score-Farben (MScore 0–100)</h4>
      <div class="srow"><span class="sy">${ring(85)}</span><span class="sm"><b style="color:#b39df7">Lila = Supergut</b> · 72–100 · sofort anschauen, Top-Priorität</span><span></span></div>
      <div class="srow"><span class="sy">${ring(65)}</span><span class="sm"><b style="color:#2fd27a">Grün = Gut</b> · 60–71 · starker Kandidat</span><span></span></div>
      <div class="srow"><span class="sy">${ring(53)}</span><span class="sm"><b style="color:#ffd60a">Gelb = Mittel</b> · 48–59 · beobachten</span><span></span></div>
      <div class="srow"><span class="sy">${ring(40)}</span><span class="sm"><b style="color:#ff6b6b">Rot = (noch) schwach</b> · unter 48 · aktuell keine Verstärkung</span><span></span></div>
    </div>
    <div class="seas"><h4>💎 Rohdiamant – wer bekommt den Diamanten?</h4>
      <div class="srow"><span class="sy">💎</span><span class="sm"><b>Zweite Reihe:</b> II./III.-Team in C/D-Klasse + mind. 0,65 Tore/Spiel – kickt nur so tief, weil das Erstteam höher spielt</span><span></span></div>
      <div class="srow"><span class="sy">💎</span><span class="sm"><b>Einsamer Torjäger:</b> mind. 35 % aller Teamtore + Team in unterer Tabellenhälfte</span><span></span></div>
      <div class="srow"><span class="sy">💎</span><span class="sm"><b>U19-Sprung:</b> Jugendspieler mit mind. 0,8 Toren/Spiel</span><span></span></div>
      <div class="srow"><span class="sy">💎</span><span class="sm"><b>Formexplosion:</b> ligagewichtete Quote mind. +30 % vs. Vorsaison</span><span></span></div>
      <div class="srow"><span class="sy">💎</span><span class="sm"><b>Rückholer:</b> Ex-SV/BSC-Spieler, der woanders höherklassig trifft</span><span></span></div>
    </div>
    <div class="seas"><h4>Badges &amp; Symbole</h4>
      <div class="srow"><span class="sy"><span class="badge b-KOL">KOL</span></span><span class="sm">Liga des Spielers (KOL = Kreisoberliga, eine Liga über euch)</span><span></span></div>
      <div class="srow"><span class="sy"><span class="badge b-own">SV/BSC</span></span><span class="sm">Eigener Spieler / eigenes Talent</span><span></span></div>
      <div class="srow"><span class="sy"><span class="badge b-ex">Ex-SV/BSC</span></span><span class="sm">Früherer SV/BSC-Spieler – Rückhol-Kandidat</span><span></span></div>
      <div class="srow"><span class="sy"><span class="badge b-kan">Kanone</span></span><span class="sm">Torschützenkönig seiner Liga 25/26</span><span></span></div>
      <div class="srow"><span class="sy"><span class="badge b-risk">⚠</span></span><span class="sm">Risiko laut Presse (z. B. Spielertrainer, Karriereende) – im Profil nachlesen</span><span></span></div>
      <div class="srow"><span class="sy"><span class="badge b-zweit">II/III</span></span><span class="sm">Spielt in einer Zweit-/Drittmannschaft (evtl. ans Erstteam gebunden)</span><span></span></div>
      <div class="srow"><span class="sy">📰</span><span class="sm">Presse-Dossier im Profil vorhanden</span><span></span></div>
      <div class="srow"><span class="sy">📞💚🚫⏰</span><span class="sm"><b>Scouting-Status</b> (im Profil setzen): kontaktiert · attraktiv · kein Interesse (wird nicht mehr vorgeschlagen) · später mit Wiedervorlage-Datum — synchronisiert über alle Geräte</span><span></span></div>
      <div class="srow"><span class="sy">↩️</span><span class="sm"><b>Ex-SV/BSC-Markierung:</b> „hat früher bei uns gespielt" — gibt +15 auf den Wechsel-Index (Rückkehr-Bonus)</span><span></span></div>
      <div class="srow"><span class="sy">▲ ≈ ▼</span><span class="sm">Formtrend vs. Vorsaison (ligagewichtet, steigend/stabil/fallend)</span><span></span></div>
      <div class="srow"><span class="sy">~</span><span class="sm">ca.-Wert, aus datierter Quelle hochgerechnet (Beleg im Profil)</span><span></span></div>
      <div class="srow"><span class="sy">📰</span><span class="sm"><b>Presse-Index (0–100):</b> aus 194 analysierten Regionalartikeln (WNOZ, fussball.de, Vereinsseiten). Tore/Vorlagen/Paraden/Lob im Artikel = Pluspunkte, Kritik/Verletzung = Minus, neuere Artikel zählen mehr. Fairness-Bremse: Wenige Nennungen bewegen den Wert kaum (kein Spieler wird wegen 1 Artikel hochgejubelt). Ohne Nennungen = neutral 50. Alle Belege im Profil verlinkt.</span><span></span></div>
      <div class="srow"><span class="sy">KLA</span><span class="sm">„KLA-Prognose“: erwartete Tore über 30 Spiele in der Kreisliga A</span><span></span></div>
    </div>
    <p class="note">Tipp: Jeden farbigen Score-Ring antippen öffnet diese Legende. Das Rechenmodell im Detail steht im Tab „Modell".</p>`;
  document.getElementById('overlay').classList.add('open');
  document.getElementById('mclose').onclick=()=>document.getElementById('overlay').classList.remove('open');
}
function openModal(id){
  const p=players.find(x=>x.id===id);if(!p)return;
  const s=scores(p);
  const WV=p.own?null:wscore(p);
  const g=gemsOf(p);
  const prevLine=p.prev?`<div><span>Vorsaison 24/25</span><b>${p.prevBelegt?'min. ':''}${p.prev.tore} T · ${LIGA_NAME[ligaBase(p.prev.liga)]||p.prev.liga} · ${p.prev.verein}${p.prevBelegt?' <i style="color:var(--ink3);font-weight:600">(belegt, Vereinsheft)</i>':''}</b></div>`:'';
  $('#modal').innerHTML=`
    ${NAV.length?`<button class="close" id="mback" style="right:56px" title="Zurück">‹</button>`:''}
    <button class="close" id="mclose">✕</button>
    <div class="mhead">
      <div class="ava l-${p.liga} ${p.photo?'':'avaCam'}" id="mAva" title="Foto hinzufügen" style="width:56px;height:56px;font-size:19px;border-radius:16px">${(p.photo||p.photoUrl)?`<img src="${p.photo||p.photoUrl}" alt="" onerror="this.remove()">`:initials(p.name)}</div>
      <div>
        <h2>${p.name}</h2>
        <div class="msub">${p.club} · ${p.isJugend?p.staffel:LIGA_NAME[p.liga]+(p.rank!=null?' · Platz '+p.rank+'/'+p.teamCount:'')} · ${p.km} km</div>
        <div style="margin-top:5px;display:flex;gap:5px;flex-wrap:wrap">${badges(p)}</div>
      </div>
    </div>
    ${p.photoUrl&&!p.photo?`<div class="note" style="margin-top:6px">Foto & Profildaten: öffentliches fussball.de-Spielerprofil</div>`:''}
    ${p.risiko?`<div class="riskbox">⚠ ${p.risiko}</div>`:''}
    ${p.own?'':(()=>{const C=crmOf(p);return `
    <div class="crmbar" id="crmbar">
      <button class="crmb ${C.c?'on-c':''}" data-crm="c">📞 ${C.c?'Kontaktiert ✓':'Kontaktiert?'}</button>
      <button class="crmb ${C.s==='att'?'on-att':''}" data-crm="att">💚 Attraktiv</button>
      <button class="crmb ${C.s==='no'?'on-no':''}" data-crm="no">🚫 Kein Interesse</button>
      <button class="crmb ${C.s==='lat'?'on-lat':''}" data-crm="lat">⏰ Später${C.s==='lat'&&C.u?' · '+fmtD(C.u):''}</button>
      ${p.exSvbc?'':`<button class="crmb ${C.x?'on-x':''}" data-crm="x">↩️ Hat früher bei uns gespielt</button>`}
    </div>
    ${C.s==='lat'?`<div class="latopts" id="latopts"><span style="font-size:12px;color:var(--ink3);font-weight:800">Wiedervorlage:</span>
      <button class="crmb" data-lat="w">Winterpause (Jan. 27)</button>
      <button class="crmb" data-lat="s">Sommer 27 (nächste Saison)</button>
      <button class="crmb" data-lat="2">Sommer 28 (in 2 Jahren)</button>
      <input type="date" id="latdate" value="${kEsc(C.u||'')}" title="individuelles Datum"></div>
      <p class="note" style="margin:2px 0 0">Bis dahin taucht er in keinen Vorschlägen auf — am Stichtag ploppt er auf der Startseite als Wiedervorlage wieder hoch.</p>`:''}
    ${C.s==='no'?`<p class="note" style="margin:2px 0 0">Ausgeblendet: taucht in keinen Vorschlägen mehr auf (Datenbank &amp; Suche zeigen ihn weiter, Startseite listet ihn unter „Ausgeblendet").</p>`:''}
    ${C.n?`<div class="crmnote">📝 ${kEsc(C.n)}</div>`:''}`;})()}
    ${p.info?`<div class="infobox">💡 ${p.info}</div>`:''}
    ${p.adjWhy?`<div class="infobox" style="border-color:rgba(77,163,255,.4)">🎯 ${p.adjWhy}<br><b>Rating manuell auf ${p.adjTo} gesetzt</b>${s.adjBase!=null?` <i style="color:var(--ink3)">(reines Daten-Modell: ${s.adjBase})</i>`:``}</div>`:''}
    ${g.length?`<div class="gembox">${g.map(x=>`💎 <b>${x.k}</b>: ${x.t}`).join('<br>')}</div>`:''}
    <div class="mgrid">
      <div class="radarbox"><canvas id="pradar" height="240"></canvas></div>
      <div class="statlist">
        <div><span>MScore</span><b>${fmt(s.total,1)} / 100</b></div>
        <div><span>Tore 25/26</span><b>${p.toreBelegt?('min. '+p.tore+' (belegt)'):p.tore}</b></div>
        <div><span>Tore/Spiel${p.einsaetze?'':' (Team-Sp.)'}</span><b>${fmt(s.gpg)}</b></div>
        ${s.shareRaw!=null?`<div><span>Anteil Teamtore</span><b>${Math.round(s.shareRaw*100)} %</b></div>`:''}
        ${p.min?`<div><span>Minuten 25/26</span><b>${p.min.toLocaleString('de-DE')} (${p.einsaetze||'–'} Einsätze)</b></div>`:''}
        ${p.kaderDoc?`<div><span>Startelf 25/26 (dok.)</span><b>${p.kaderStarts} von ${p.kaderDoc} Spielen</b></div>`:''}
        ${p.starts2425!=null?`<div><span>Startelf 24/25 (dok.)</span><b>${p.starts2425} von ${p.docPrev||8} Spielen</b></div>`:''}
        ${p.sds?`<div><span>Elf der Woche (FuPa)</span><b>${p.sds}× nominiert</b></div>`:''}
        ${s.mvp!=null?`<div><span>FuPa-MVP 26/27</span><b>${s.mvp} % <i style="color:var(--ink3);font-weight:600">(team-relativ${s.mvpD?' · Stand '+fmtD(s.mvpD):''})</i></b></div>`:''}
        ${prevLine}
        <div><span>Formtrend</span><b>${s.tratio!=null?(s.tratio>=1.15?'▲ steigend':s.tratio<=0.85?'▼ fallend':'≈ stabil'):'–'}</b></div>
        <div><span>Liga-Gewicht</span><b>× ${wOf(p).toFixed(2)}</b></div>
        <div><span>Geburtsdatum</span><b>${dash(p.geb)}</b></div>
        <div><span>Alter</span><b>${p.alter!=null?(p.alter+(p.alterCa?' (ca.)':'')):'–'}</b></div>
        <div><span>Position</span><b>${p.pos||'–'}${p.pos2&&p.pos2.length?` <i style="color:var(--ink3);font-weight:600">· Neben: ${p.pos2.join(', ')}</i>`:``}</b></div>
        <div><span>Starker Fuß</span><b>${dash(p.fuss)}</b></div>
        <div><span>Größe</span><b>${dash(p.groesse,' cm')}</b></div>
        <div><span>Gewicht</span><b>${dash(p.gewicht,' kg')}</b></div>
        <div><span>Status</span><b>${p.status||'Neu'}</b></div>
        ${p.fdeUrl?`<div><span>Offizielles Profil</span><b><a href="${p.fdeUrl}" target="_blank" rel="noopener">fussball.de ↗</a></b></div>`:''}
      </div>
    </div>
    ${s.defMode?`<div class="proj">🛡 Defensiv-Profil — Bewertung über <b>Team-Gegentore</b>${s.gaTxt?` (${s.gaTxt})`:``} + Presse${p.pos===`AV`?` + Vorlagen (wo belegt)`:``}${p.tore>0?` + <b>Torgefahr-Bonus</b> (${p.toreBelegt?`min. `:``}${p.tore} Tore)`:``}. Individuelle Defensivdaten sind für die Kreisligen öffentlich nicht verfügbar.</div>`:`<div class="proj">📈 <b>${s.proj} Tore</b> – erwartete Ausbeute über 30 Spiele in der <b>Kreisliga A</b></div>`}
    <div class="d2col">
    <div class="seas"><h4>Saison-Record (Spieler + Vereins-Kontext)</h4>
      ${seasonsOf(p).map(x=>{
        if(x.type==='player')return `<div class="srow"><span class="sy">${x.y}</span><span class="sm">${x.liga} · ${x.verein} · <b>${x.tore}</b> Tore in ${x.sp} Sp. (<b>${fmt(x.tore/Math.max(1,x.sp))}</b>/Sp.)${x.extra||''}</span><span class="sbar"><i style="width:${Math.min(100,Math.round(x.tore/Math.max(1,x.sp)*50))}%"></i></span></div>`;
        if(x.type==='team')return `<div class="srow"><span class="sy">${x.y}</span><span class="sm">🏟 ${x.club}: ${LIGA_LONG[x.d.liga]||x.d.liga} · Platz <b>${x.d.platz}</b> · ${x.d.tore} Teamtore · ${x.d.punkte} Pkt. <i style="color:var(--ink3)">(${x.note})</i></span><span></span></div>`;
        return `<div class="srow nodata"><span class="sy">${x.y}</span><span class="sm">– ${x.note}</span><span></span></div>`;
      }).join('')}
    </div>
    <div>
    <div class="seas"><h4>MScore-Zerlegung (${fmt(s.total,1)} gesamt)</h4>
      ${(s.defMode?[['Defensivstärke',s.prod,W.prod],['Dominanz/Def.',s.share,W.share],['Kontext',s.ctx,W.ctx],['Potenzial',s.pot,W.pot],['GT-Trend',s.trend,W.trend],['Presse',s.presse,W.presse],['Scout-Note',s.scout,W.scout]]:[['Produktion',s.prod,W.prod],['Dominanz',s.share,W.share],['Kontext',s.ctx,W.ctx],['Potenzial',s.pot,W.pot],['Formtrend',s.trend,W.trend],['Presse',s.presse,W.presse],['Scout-Note',s.scout,W.scout]]).map(([l,v,w])=>`
        <div class="srow"><span class="sy" style="font-size:11px">${l}</span><span class="sbar" style="width:100%;max-width:none"><i style="width:${v}%;background:${tierColor(v)}"></i></span><b style="font-variant-numeric:tabular-nums">${v} <i style="color:var(--ink3);font-style:normal;font-weight:600">· ${w}%</i></b></div>`).join('')}
      ${s.adjD?`<div class="srow"><span class="sy" style="font-size:11px">🎯 Insider</span><span class="sbar" style="width:100%;max-width:none"><i style="width:${Math.min(100,Math.abs(s.adjD)*4)}%;background:#4da3ff"></i></span><b>${s.adjD>0?'+':''}${s.adjD}</b></div>`:''}
      ${s.sdsB?`<div class="srow"><span class="sy" style="font-size:11px">🏅 Elf d. Woche</span><span class="sbar" style="width:100%;max-width:none"><i style="width:${s.sdsB*10}%;background:#b39df7"></i></span><b>+${s.sdsB}</b></div>`:''}
      ${s.mvpAdj?`<div class="srow"><span class="sy" style="font-size:11px">🔵 FuPa-MVP ${s.mvp}%</span><span class="sbar" style="width:100%;max-width:none"><i style="width:${Math.min(100,Math.abs(s.mvpAdj)*8)}%;background:#2fd27a"></i></span><b>${s.mvpAdj>0?'+':''}${s.mvpAdj}</b></div>`:''}
    </div>
    <div class="seas"><h4>Einordnung — antippen ›</h4>
      ${(!s.defMode||p.tore>0)?`<div class="srow clk" data-rank="tore"><span class="sy">🏅</span><span class="sm">Torjäger-Rang: <b>#${(()=>{const pool=players.filter(x=>x.liga===p.liga&&x.isJugend===p.isJugend).sort((a,b)=>b.tore-a.tore);return pool.findIndex(x=>x.id===p.id)+1;})()}</b> von ${players.filter(x=>x.liga===p.liga&&x.isJugend===p.isJugend).length} erfassten Spielern (${p.isJugend?'Jugend':LIGA_NAME[p.liga]})</span><span></span></div>`:``}
      ${(!s.defMode||p.tore>0)?`<div class="srow clk" data-rank="gpg"><span class="sy">📊</span><span class="sm">Tore/Spiel: besser als <b>${(()=>{const pool=players.filter(x=>x.liga===p.liga&&x.isJugend===p.isJugend);const me=s.gpg;return Math.round(pool.filter(x=>scores(x).gpg<me).length/Math.max(1,pool.length)*100);})()} %</b> der Liga-Konkurrenz</span></div>`:``}
      <div class="srow clk" data-rank="score"><span class="sy">⭐</span><span class="sm">MScore-Rang: <b>#${(()=>{const pool=players.filter(x=>x.liga===p.liga&&x.isJugend===p.isJugend).sort((a,b)=>scores(b).total-scores(a).total);return pool.findIndex(x=>x.id===p.id)+1;})()}</b> von ${players.filter(x=>x.liga===p.liga&&x.isJugend===p.isJugend).length}</span></div>
      <div class="srow clk" data-clubview="1"><span class="sy">🏟</span><span class="sm">Kader &amp; Vereins-Historie: <b>${p.club}</b></span></div>
    </div>
    ${WV?`<div class="seas"><h4>🕵️ Digital-Scout — Wechsel-Index <b style="color:${tierColor(WV.w)}">${WV.w}</b> · Transfer-Chance <b style="color:${tierColor(WV.k)}">${WV.k}</b></h4>
      ${WV.f.map(x=>`<div class="srow"><span class="sy">${x[0]>0?'🟢':'🔴'}</span><span class="sm">${x[1]}</span><b style="color:${x[0]>0?'#5fe09b':'#ff8a8a'};font-variant-numeric:tabular-nums">${x[0]>0?'+':''}${x[0]}</b></div>`).join('')}
      ${WV.f.length?'':'<div class="srow"><span class="sy">·</span><span class="sm">Keine besonderen Signale — neutraler Basiswert 50</span><span></span></div>'}
      <p class="note">Start bei 50, öffentliche Signale werden addiert/abgezogen. <b>Transfer-Chance</b> = 55 % MScore + 45 % Wechsel-Index — die Kennzahl für „stark UND realistisch holbar“.</p></div>`:''}
    ${p.pressNews&&p.pressNews.length?`<div class="pressbox"><h4>📰 Presse-Engine · Index ${p.pressIdx} · ${p.pressNews.length} Nennungen</h4>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:9px">${Object.entries(p.pressStats||{}).map(([t,n])=>`<span class="badge b-zweit" style="text-transform:none">${({tor:'⚽',vorlage:'🅰️',parade:'🧤',lob:'👍',kritik:'⚠️',verletzung:'🚑',wechsel:'🔁',neutral:'📄'})[t]||'📄'} ${t}: ${n}</span>`).join('')}</div>
      ${p.pressNews.map(m=>`<div class="pressitem" style="padding-left:20px"><b>${({tor:'⚽',vorlage:'🅰️',parade:'🧤',lob:'👍',kritik:'⚠️',verletzung:'🚑',wechsel:'🔁',neutral:'📄'})[m.typ]||'📄'} ${m.h||'(ohne Überschrift)'}</b>${m.d?` <i style="color:var(--ink3);font-style:normal">· ${m.d}</i>`:''}<br>${m.x||''} <a href="${m.u}" target="_blank" rel="noopener">Artikel ↗</a></div>`).join('')}
    </div>`:''}
    ${p.quellen&&p.quellen.length?`<div class="pressbox"><h4>📚 Kader-Belege (Vereinsheft)</h4>${p.quellen.map(q=>`<div class="pressitem">${q.t} <a href="${q.u}" target="_blank" rel="noopener">PDF ↗</a></div>`).join('')}${p.kaderDoc?`<div class="pressitem" style="color:var(--ink2)">Startelf-Zählung basiert auf ${p.kaderDoc} im Vereinsheft dokumentierten Spielen (Sep./Okt. 2025 + März/April 2026), nicht auf allen 28 Saisonspielen. Belegte Tore sind Untergrenzen.</div>`:''}</div>`:''}
    ${p.press&&p.press.length?`<div class="pressbox"><h4>Presse &amp; Recherche</h4>${p.press.map(x=>`<div class="pressitem">${x.t} <a href="${x.u}" target="_blank" rel="noopener">Quelle ↗</a></div>`).join('')}</div>`:''}
    </div></div>
    <div class="editsec">
      <h4>Scouting-Daten pflegen</h4>
      <div class="editgrid">
        <div class="field"><label>Geburtsdatum</label><input type="date" id="e_geb" value="${p.geb??''}"></div>
        <div class="field"><label>Alter (falls Datum unbekannt)</label><input type="number" id="e_alter" min="14" max="45" value="${p.alter??''}"></div>
        <div class="field"><label>Position</label><select id="e_pos">${Object.keys(POS_W).map(x=>`<option ${x===p.pos?'selected':''}>${x}</option>`).join('')}</select></div>
        <div class="field"><label>Status</label><select id="e_status">${STATUS_LIST.map(x=>`<option ${x===(p.status||'Neu')?'selected':''}>${x}</option>`).join('')}</select></div>
        <div class="field"><label>Einsätze 25/26</label><input type="number" id="e_eins" min="1" max="40" value="${p.einsaetze??''}" placeholder="${p.teamSp} (Team)"></div>
        <div class="field"><label>Assists</label><input type="number" id="e_ass" min="0" value="${p.assists??''}"></div>
        <div class="field"><label>Starker Fuß</label><select id="e_fuss"><option value="">–</option>${['Rechts','Links','Beidfüßig'].map(x=>`<option ${x===p.fuss?'selected':''}>${x}</option>`).join('')}</select></div>
        <div class="field"><label>Größe (cm)</label><input type="number" id="e_gro" min="150" max="210" value="${p.groesse??''}"></div>
      </div>
      <div class="btnrow" style="margin-top:10px">
        <label class="photobtn">📷 ${p.photo?'Foto ändern':'Foto hinzufügen'} <input type="file" id="e_photo" accept="image/*" style="display:none"></label>
        ${p.photo?'<button class="photobtn" id="delPhoto">🗑 Foto entfernen</button>':''}
      </div>
      <h4 style="margin-top:14px">Eye-Test (1–10)</h4>
      <div class="sliders">
        ${['tempo','technik','zweikampf','spielint','mentalitaet'].map(k=>`
          <div class="sl"><label>${{tempo:'Tempo',technik:'Technik',zweikampf:'Zweikampf',spielint:'Spielintelligenz',mentalitaet:'Mentalität'}[k]}</label>
          <input type="range" min="1" max="10" value="${p.scout[k]}" data-sc="${k}"><output>${p.scout[k]}</output></div>`).join('')}
      </div>
      <div class="field" style="margin-top:12px"><label>Notizen</label><textarea id="e_note">${kEsc(p.note||'')}</textarea></div>
      <div class="field" style="margin-top:10px"><label>FuPa-MVP 26/27 in % (0–100, aus der FuPa-Spielerstatistik · leer = keiner)</label><input type="number" id="e_mvp" min="0" max="100" step="1" inputmode="numeric" value="${(()=>{const m=mvpOf(p);return m?m.v:'';})()}" placeholder="–"></div>
      <div class="btnrow" style="margin-top:12px">
        <button class="btn" id="saveP">Speichern</button>
        <button class="btn ghost" id="starP">${p.star?'★ Von Shortlist entfernen':'☆ Auf die Shortlist'}</button>
      </div>
    </div>`;
  $('#overlay').classList.add('open');
  $('#mclose').onclick=closeOverlay;
  {const _b=document.getElementById('mback'); if(_b)_b.onclick=navBack;}
  $('#modal').querySelectorAll('[data-rank]').forEach(el=>el.onclick=()=>nav({t:'rank',cfg:buildRanking(p.liga,p.isJugend,el.dataset.rank,p.id)}));
  {const _cv=$('#modal').querySelector('[data-clubview]'); if(_cv)_cv.onclick=()=>nav({t:'rank',cfg:buildClubView(p.club,p.id)});}
  $('#modal').querySelectorAll('[data-crm]').forEach(b=>b.onclick=()=>{
    const C=crmOf(p),k=b.dataset.crm;
    if(k==='c')crmSet(p.id,{c:C.c?undefined:1});
    else if(k==='x')crmSet(p.id,{x:C.x?undefined:1});
    else if(C.s===k)crmSet(p.id,{s:undefined,u:undefined});
    else if(k==='lat'){const d=new Date();d.setMonth(d.getMonth()+6);crmSet(p.id,{s:'lat',u:d.toISOString().slice(0,10)});}
    else crmSet(p.id,{s:k,u:undefined});
    renderAll();openModal(p.id);});
  $('#modal').querySelectorAll('[data-lat]').forEach(b=>b.onclick=()=>{
    const m={w:'2027-01-15',s:'2027-06-01','2':'2028-06-01'};
    crmSet(p.id,{s:'lat',u:m[b.dataset.lat]});renderAll();openModal(p.id);});
  {const ld=$('#modal').querySelector('#latdate');
   if(ld)ld.onchange=()=>{if(ld.value){crmSet(p.id,{s:'lat',u:ld.value});renderAll();openModal(p.id);}};}
  document.querySelectorAll('[data-sc]').forEach(inp=>{inp.oninput=e=>{e.target.nextElementSibling.value=e.target.value;};});
  const photoInp=document.getElementById('e_photo');
  if(photoInp)photoInp.onchange=e=>{
    const f=e.target.files[0];if(!f)return;
    const rd=new FileReader();
    rd.onload=()=>{const img=new Image();img.onload=()=>{
      const c=document.createElement('canvas');const m=256;
      const sc=Math.max(m/img.width,m/img.height);
      c.width=Math.round(img.width*sc);c.height=Math.round(img.height*sc);
      c.getContext('2d').drawImage(img,0,0,c.width,c.height);
      p.photo=c.toDataURL('image/jpeg',0.82);renderAll();openModal(p.id);
    };img.src=rd.result;};
    rd.readAsDataURL(f);
  };
  const mAva=document.getElementById('mAva');
  if(mAva&&photoInp)mAva.onclick=()=>photoInp.click();
  const delP=document.getElementById('delPhoto');
  if(delP)delP.onclick=()=>{p.photo=null;renderAll();openModal(p.id);};
  $('#saveP').onclick=()=>{
    p.geb=$('#e_geb').value||null;
    if(p.geb){const d=new Date(p.geb);const now=new Date();
      p.alter=Math.floor((now-d)/31557600000);p.alterCa=false;}
    else p.alter=$('#e_alter').value?+$('#e_alter').value:null;
    if($('#e_alter').value&&!p.isJugend&&!p.geb)p.alterCa=false;
    p.status=$('#e_status').value;
    p.fuss=$('#e_fuss').value||null;
    p.groesse=$('#e_gro').value?+$('#e_gro').value:null;
    p.pos=$('#e_pos').value;
    p.einsaetze=$('#e_eins').value?+$('#e_eins').value:null;
    p.assists=$('#e_ass').value?+$('#e_ass').value:null;
    {const _nn=$('#e_note').value.trim(); if(_nn!==(p.note||'')){p.note=_nn;p._noteLocal=true;crmSet(p.id,{n:_nn||undefined});}}
    {const _mvIn=document.getElementById('e_mvp'); if(_mvIn){const raw=_mvIn.value.trim(), cur=mvpOf(p);
      if(raw===''){ if(cur&&cur.src==='app')crmSet(p.id,{mv:undefined,mvd:undefined}); }
      else { const nv=clamp(Math.round(+raw),0,100); if(!isNaN(nv)&&!(cur&&cur.v===nv))crmSet(p.id,{mv:nv,mvd:todayISO()}); } }}
    document.querySelectorAll('[data-sc]').forEach(inp=>{p.scout[inp.dataset.sc]=+inp.value;});
    p.scouted=true;
    $('#overlay').classList.remove('open');renderAll();
  };
  $('#starP').onclick=()=>{p.star=!p.star;crmSet(p.id,{f:p.star?1:undefined});$('#overlay').classList.remove('open');renderAll();};
  try{
    if(radarChart)radarChart.destroy();
    radarChart=new Chart($('#pradar'),{type:'radar',
      data:{labels:s.defMode?['Defensiv','Dom./Def.','Kontext','Potenzial','GT-Trend','Presse','Scout']:['Produktion','Dominanz','Kontext','Potenzial','Trend','Presse','Scout'],
        datasets:[{label:p.name,data:[s.prod,s.share,s.ctx,s.pot,s.trend,s.presse,s.scout],
          borderColor:'#4da3ff',backgroundColor:'rgba(77,163,255,0.18)',borderWidth:2,pointRadius:4,pointBackgroundColor:'#4da3ff'}]},
      options:{responsive:true,plugins:{legend:{display:false}},
        scales:{r:{min:0,max:100,ticks:{display:false,stepSize:25},grid:{color:'#262d3d'},angleLines:{color:'#262d3d'},pointLabels:{color:'#9aa3b5',font:{size:11}}}}}});
  }catch(err){console.warn('Radar:',err);}
}
$('#overlay').addEventListener('click',e=>{if(e.target.id==='overlay')closeOverlay();});

/* ================= VERGLEICH ================= */
let cmpRadar=null,cmpBar=null;
const CMP_COLORS=['#4da3ff','#ff7ab8','#ffb547'];
function fillCompareSelects(){
  const opts=sorted(players).map(p=>`<option value="${p.id}">${p.name} (${p.club})</option>`).join('');
  ['cmp1','cmp2','cmp3'].forEach((id,i)=>{
    const el=$('#'+id);const cur=el.value;
    el.innerHTML=`<option value="">– Spieler ${i+1} –</option>`+opts;
    if(cur&&players.find(p=>p.id===cur))el.value=cur;
    else if(i<2){const def=sorted(players)[i];if(def)el.value=def.id;}
  });
}
function updateCompare(){
  const sel=['cmp1','cmp2','cmp3'].map(id=>$('#'+id).value).filter(Boolean)
    .map(id=>players.find(p=>p.id===id)).filter(Boolean);
  if(cmpRadar)cmpRadar.destroy();if(cmpBar)cmpBar.destroy();
  if(!sel.length)return;
  try{
    cmpRadar=new Chart($('#cmpRadar'),{type:'radar',
      data:{labels:['Produktion','Dominanz','Kontext','Potenzial','Trend','Presse','Scout'],
        datasets:sel.map((p,i)=>{const s=scores(p);return{label:p.name,
          data:[s.prod,s.share,s.ctx,s.pot,s.trend,s.presse,s.scout],
          borderColor:CMP_COLORS[i],backgroundColor:CMP_COLORS[i]+'26',borderWidth:2,pointRadius:3,pointBackgroundColor:CMP_COLORS[i]};})},
      options:{responsive:true,plugins:{legend:{labels:{color:'#9aa3b5',boxWidth:14}}},
        scales:{r:{min:0,max:100,ticks:{display:false},grid:{color:'#262d3d'},angleLines:{color:'#262d3d'},pointLabels:{color:'#9aa3b5',font:{size:11}}}}}});
    cmpBar=new Chart($('#cmpBar'),{type:'bar',
      data:{labels:['MScore','Prognose Tore (KLA)'],
        datasets:sel.map((p,i)=>{const s=scores(p);return{label:p.name,data:[s.total,s.proj],
          backgroundColor:CMP_COLORS[i],borderRadius:5,maxBarThickness:38};})},
      options:{responsive:true,plugins:{legend:{labels:{color:'#9aa3b5',boxWidth:14}}},
        scales:{x:{ticks:{color:'#9aa3b5'},grid:{display:false}},
          y:{beginAtZero:true,ticks:{color:'#8b93a7'},grid:{color:'#262d3d'}}}}});
  }catch(err){console.warn('Charts:',err);}
}
['cmp1','cmp2','cmp3'].forEach(id=>$('#'+id).addEventListener('change',updateCompare));

/* ================= GEWICHTE ================= */
const WLBL={prod:'Produktion (ligagewichtet)',share:'Dominanz / Tor-Anteil',ctx:'Kontext (Teamstärke)',pot:'Potenzial (Alter)',trend:'Formtrend (vs. 24/25)',presse:'Presse-Index (Engine)',scout:'Scout-Note (Eye-Test)'};
function renderWeights(){
  $('#weights').innerHTML=Object.keys(W).map(k=>`
    <div class="wrow"><label>${WLBL[k]}</label>
    <input type="range" min="0" max="60" value="${W[k]}" data-w="${k}">
    <output>${W[k]} %</output></div>`).join('');
  document.querySelectorAll('[data-w]').forEach(inp=>{
    inp.oninput=e=>{W[e.target.dataset.w]=+e.target.value;
      e.target.nextElementSibling.value=e.target.value+' %';renderAll();};
  });
}
$('#resetW').onclick=()=>{W={...DEF_WEIGHTS};renderWeights();renderAll();};

/* ================= EXPORT / IMPORT / ADD ================= */
function download(name,text,type){
  const b=new Blob([text],{type});const a=document.createElement('a');
  a.href=URL.createObjectURL(b);a.download=name;a.click();URL.revokeObjectURL(a.href);
}
$('#exportBtn').onclick=()=>download('svbc-scout-daten.json',JSON.stringify({weights:W,players,lineup:LINEUP},null,2),'application/json');
$('#exportCsv').onclick=()=>{
  const arr=sorted(players.filter(p=>p.star));
  const rows=[['Name','Verein','Liga','Tore','MScore','PrognoseKLA','Alter','km','Notiz']]
    .concat(arr.map(p=>{const s=scores(p);
      return[p.name,p.club,p.liga,p.tore,s.total,s.proj,p.alter??'',p.km,(p.note||'').replace(/[\n;]/g,' ')];}));
  download('svbc-shortlist.csv',rows.map(r=>r.join(';')).join('\n'),'text/csv');
};
$('#importFile').onchange=e=>{
  const f=e.target.files[0];if(!f)return;
  const rd=new FileReader();
  rd.onload=()=>{try{
    const d=JSON.parse(rd.result);
    if(d.weights)W=d.weights;
    if(Array.isArray(d.players))players=d.players;
    if(d.lineup)LINEUP=d.lineup;
    renderWeights();renderAll();
  }catch(err){alert('Import fehlgeschlagen: '+err.message);}};
  rd.readAsText(f);
};
$('#addBtn').onclick=()=>{
  const n=$('#an').value.trim(),c=$('#ac').value.trim();
  if(!n||!c){$('#addMsg').textContent='Bitte mindestens Name und Verein angeben.';return;}
  const tore=+$('#at').value||0;
  players.push({id:'m'+players.length,name:n,club:c,liga:$('#al').value,sub:$('#al').value,
    tore,teamSp:+$('#ae').value||25,tT:Math.max(1,tore*3),rank:8,teamCount:15,km:+$('#akm').value||10,
    own:false,exSvbc:false,zweit:false,kanone:false,manual:true,risiko:null,info:null,press:[],
    alter:$('#aa').value?+$('#aa').value:null,alterCa:false,pos:$('#ap').value,
    einsaetze:+$('#ae').value||null,assists:null,
    scout:{tempo:5,technik:5,zweikampf:5,spielint:5,mentalitaet:5},scouted:!!$('#aa').value,
    note:'Manuell erfasst',star:true,prev:null,isJugend:false});
  $('#addMsg').textContent='✅ '+n+' hinzugefügt (direkt auf der Shortlist).';
  ['an','ac','aa'].forEach(id=>$('#'+id).value='');
  renderAll();
};

/* ================= NAV / FILTER / PRESETS ================= */
function goTab(tab){
  document.querySelectorAll('nav button').forEach(x=>x.classList.toggle('active',x.dataset.tab===tab));
  document.querySelectorAll('.tabbar .ti').forEach(x=>x.classList.toggle('active',x.dataset.tab===tab));
  document.querySelectorAll('.panel').forEach(x=>x.classList.remove('active'));
  const el=document.getElementById('panel-'+tab);
  if(el)el.classList.add('active');
  if(tab==='cmp')updateCompare();
  if(tab==='kandidaten')renderKandidaten();
  if(tab==='kaderplan')renderKaderplan();
  try{const _a=document.querySelector('.tabbar .ti.active');if(_a&&_a.scrollIntoView)_a.scrollIntoView({inline:'center',block:'nearest'});}catch(e){}
  if(tab==='sxi'){try{renderLineup();}catch(e){}}
  try{window.scrollTo({top:0});}catch(e){}
}
document.querySelectorAll('nav button,.tabbar .ti').forEach(b=>{b.addEventListener('click',()=>goTab(b.dataset.tab));});
document.querySelectorAll('[data-goto]').forEach(el=>{el.addEventListener('click',()=>goTab(el.dataset.goto));});
document.querySelectorAll('.chip[data-liga]').forEach(ch=>{
  ch.addEventListener('click',()=>{
    const l=ch.dataset.liga;
    if(activeLigen.has(l)){activeLigen.delete(l);ch.classList.remove('on');}
    else{activeLigen.add(l);ch.classList.add('on');}
    renderList();
  });
});
$('#q').oninput=e=>{query=e.target.value.toLowerCase();renderList();};
$('#km').oninput=e=>{
  maxKm=+e.target.value>=30?999:+e.target.value;
  $('#kmv').textContent=maxKm>900?'alle':'≤ '+maxKm+' km';
  renderList();
};
$('#sort').onchange=e=>{sortBy=e.target.value;renderList();};
$('#fpos').onchange=e=>{fPos=e.target.value;renderList();};
$('#ageMin').oninput=e=>{ageMin=e.target.value?+e.target.value:null;renderList();};
$('#ageMax').oninput=e=>{ageMax=e.target.value?+e.target.value:null;renderList();};
function setLigen(list){
  activeLigen.clear();list.forEach(l=>activeLigen.add(l));
  document.querySelectorAll('.chip[data-liga]').forEach(ch=>ch.classList.toggle('on',activeLigen.has(ch.dataset.liga)));
}
function applyPreset(name){
  query='';$('#q').value='';
  setLigen(['KOL','A','B','C','D','JUG']);
  fPos='';$('#fpos').value='';ageMin=null;ageMax=null;$('#ageMin').value='';$('#ageMax').value='';
  maxKm=999;$('#km').value=30;$('#kmv').textContent='alle';sortBy='score';$('#sort').value='score';
  if(name==='st1619'){fPos='ST';$('#fpos').value='ST';ageMin=16;ageMax=19;$('#ageMin').value=16;$('#ageMax').value=19;}
  if(name==='u23'){ageMax=23;$('#ageMax').value=23;}
  if(name==='nah'){maxKm=10;$('#km').value=10;$('#kmv').textContent='≤ 10 km';}
  goTab('scout');renderList();
  if(name==='rueck'){
    const arr=sorted(players.filter(p=>p.exSvbc||p.own));
    $('#filterHint').textContent=arr.length+' Rückhol-Kandidaten & Eigengewächse';
    $('#list').innerHTML=arr.map((p,i)=>rowHtml(p,i)).join('');
  }
}
document.querySelectorAll('.preset').forEach(b=>{b.addEventListener('click',()=>{ if(b.dataset.goto){goTab(b.dataset.goto);} else {applyPreset(b.dataset.preset);} });});
document.addEventListener('click',e=>{
  const rg=e.target.closest('.ring');
  if(rg){e.stopPropagation();openLegend();return;}
  const lg=e.target.closest('[data-legend]');
  if(lg){e.stopPropagation();openLegend();return;}
  const star=e.target.closest('[data-star]');
  if(star){e.stopPropagation();
    const p=players.find(x=>x.id===star.dataset.star);
    if(p){p.star=!p.star;crmSet(p.id,{f:p.star?1:undefined});renderAll();}
    return;}
  const row=e.target.closest('.row[data-id],.fcard[data-id]');
  if(row)startPlayer(row.dataset.id);
});

/* ================= AUFSTELLUNG (FIFA-Style) ================= */
const FORMATIONS={
 '4-4-2':[['TW',50,90],['LV',17,72],['IV',39,75],['IV',61,75],['RV',83,72],['LM',17,48],['ZM',39,51],['ZM',61,51],['RM',83,48],['ST',38,25],['ST',62,25]],
 '4-3-3':[['TW',50,90],['LV',17,72],['IV',39,75],['IV',61,75],['RV',83,72],['ZM',30,53],['ZM',50,56],['ZM',70,53],['LA',18,28],['ST',50,22],['RA',82,28]],
 '3-5-2':[['TW',50,90],['IV',30,75],['IV',50,77],['IV',70,75],['LM',12,53],['ZM',35,55],['ZM',50,50],['ZM',65,55],['RM',88,53],['ST',38,25],['ST',62,25]],
 '4-2-3-1':[['TW',50,90],['LV',17,74],['IV',39,77],['IV',61,77],['RV',83,74],['ZM',38,58],['ZM',62,58],['LM',20,38],['OM',50,35],['RM',80,38],['ST',50,20]],
 '4-5-1':[['TW',50,90],['LV',17,72],['IV',39,75],['IV',61,75],['RV',83,72],['LM',13,48],['ZM',33,53],['ZM',50,57],['ZM',67,53],['RM',87,48],['ST',50,22]],
 '4-1-4-1':[['TW',50,90],['LV',17,72],['IV',39,75],['IV',61,75],['RV',83,72],['ZM',50,63],['LM',15,44],['ZM',37,45],['ZM',63,45],['RM',85,44],['ST',50,20]],
 '5-1-2-2':[['TW',50,91],['LV',11,62],['IV',31,74],['IV',50,76],['IV',69,74],['RV',89,62],['ZM',50,57],['OM',32,40],['OM',68,40],['ST',38,21],['ST',62,21]],
 '5-4-1':[['TW',50,91],['LV',11,64],['IV',31,74],['IV',50,76],['IV',69,74],['RV',89,64],['LM',17,44],['ZM',39,48],['ZM',61,48],['RM',83,44],['ST',50,21]],
};
const ROLE2POS={TW:'TW',IV:'IV',LV:'AV',RV:'AV',ZM:'ZM',LM:'Flügel',RM:'Flügel',LA:'Flügel',RA:'Flügel',OM:'OM',ST:'ST'};
const POSSIM={ /* welche Positionen eine Rolle realistisch vertreten können (Kreisliga-Polyvalenz) */
 'TW':{},
 'IV':{'AV':1,'ZM':0.5},
 'AV':{'IV':1,'Flügel':1,'ZM':0.5},
 'ZM':{'OM':1,'AV':0.5,'IV':0.5},
 'OM':{'ZM':1,'Flügel':1,'ST':0.5},
 'Flügel':{'OM':1,'ST':1,'AV':1,'ZM':0.5},
 'ST':{'OM':1,'Flügel':1},
};
function posFit(p,want){
  if(!want)return null;
  if(p.pos===want)return {lvl:2,tag:'✓ '+want,col:'#5fe09b'};
  if(p.pos2&&p.pos2.includes(want))return {lvl:1.5,tag:'◐ '+want+' (Neben)',col:'#ffd60a'};
  const s=(POSSIM[want]||{})[p.pos];
  if(s===1)return {lvl:1,tag:'~ '+want+' möglich (spielt '+p.pos+')',col:'#ffb347'};
  if(s===0.5)return {lvl:0.5,tag:'~ zur Not (spielt '+p.pos+')',col:'#8fa3c7'};
  if(!p.pos)return {lvl:0.2,tag:'Position unbekannt',col:'#8fa3c7'};
  return null;
}
let LINEUP={formation:'4-4-2',slots:{}};
/* ===== Aufstellungs-Sync: die zuletzt gesetzte Elf liegt zentral im Make-Datastore ===== */
const SYNCU='https://hook.eu1.make.com/hjm7vhk0hrgcg50f816k74klrpbbiszf';
let SHADOW={};
let _lastSync=null,_syncT=null,_remoteLoaded=false;
/* ===== Scouting-CRM: Status je Spieler, geräteübergreifend im selben Datastore-Record =====
   CRM[pid] = {c:1 kontaktiert, s:'att'|'no'|'lat', u:'JJJJ-MM-TT' Wiedervorlage, x:1 Ex-SV/BSC (markiert), f:1 Shortlist-Stern, n:'Notiz'} */
let CRM={}, _remoteDone=false, _crmDirty=false;
function todayISO(){const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
function crmOf(p){return CRM[p.id]||{};}
function crmHidden(p){const C=crmOf(p);if(C.s==='no')return true;if(C.s==='lat'&&C.u&&C.u>todayISO())return true;return false;}
function crmDue(p){const C=crmOf(p);return C.s==='lat'&&(!C.u||C.u<=todayISO());}
function fmtD(iso){if(!iso)return '';const [y,m,d]=iso.split('-');return d+'.'+m+'.'+y.slice(2);}
/* ===== Sync v2: feldweises Zusammenführen statt Überschreiben =====
   - Jeder CRM-Eintrag trägt _t = {feld: Zeitstempel}; Aufstellung/Schattenelf tragen gemeinsam "lt".
   - Vor jedem Speichern wird der Online-Stand geholt und pro Feld der jüngere Wert übernommen.
     OHNE gültigen Online-Stand wird NIE geschrieben (sonst könnte ein Handy mit Funkloch alles überschreiben).
   - Nach dem Speichern wird nachgeprüft, ob der Server alles hat; sonst wird erneut gesendet.
   - Zeitstempel als "hybride Uhr": nie kleiner als alles schon Gesehene → falsch gehende Handy-Uhren schaden nicht.
   - Eingehende Werte werden geprüft (Datumsformat, Zahlenbereiche, Längen) – Schutz vor eingeschleustem Code. */
let SYNC_ST='idle', _pendingRefresh=false, _hlc=0, _lineupT=0, _lastLineupSer=null, _pushTries=0, _verifyT=null, _kvChanged=false, _lineupAdopted=false;
const SYNC_BAD_KEYS={'__proto__':1,'constructor':1,'prototype':1};
const SYNC_DATE=/^\d{4}-\d{2}-\d{2}$/;
function hlcNow(){ _hlc=Math.max(Date.now(),_hlc+1); return _hlc; }
function hlcSeen(t){ if(typeof t==='number'&&isFinite(t)&&t<=Date.now()+86400000&&t>_hlc)_hlc=t; }
function syncTime(t){ t=+t||0; return (isFinite(t)&&t>0&&t<=Date.now()+86400000)?t:0; } /* Stempel aus der Zukunft ignorieren */
function crmValid(id,k,v){
  if(SYNC_BAD_KEYS[k]||v===null||v===undefined)return false;
  switch(k){
    case 'lc': case 'u': case 'mvd': return typeof v==='string'&&SYNC_DATE.test(v);
    case 'mv': return typeof v==='number'&&isFinite(v)&&v>=0&&v<=100;
    case 'w': return v===1||v===2||v===3||v===4;
    case 's': return v==='att'||v==='no'||v==='lat';
    case 'f': case 'c': case 'x': case 'px': return v===1||v===true;
    case 'tp': return typeof v==='string'&&v.length<=12;
    case 'k': case 'n': case 'rl': case 'pl': case 'kv': return typeof v==='string'&&v.length<=4000;
    default:
      if(id===META_ID&&k.slice(0,3)==='pl:')return v===1;
      return (typeof v==='string'&&v.length<=4000)||(typeof v==='number'&&isFinite(v))||typeof v==='boolean';
  }
}
function crmSet(id,upd){
  if(SYNC_BAD_KEYS[id])return;
  const C=Object.prototype.hasOwnProperty.call(CRM,id)?CRM[id]:{}; const T=(C._t&&typeof C._t==='object')?C._t:{}; const now=hlcNow();
  for(const k in upd){ if(k==='_t'||SYNC_BAD_KEYS[k])continue;
    if(upd[k]===undefined||upd[k]===null||upd[k]===false||upd[k]==='')delete C[k]; else C[k]=upd[k];
    T[k]=now; }
  C._t=T; CRM[id]=C;
  if(_remoteDone)lineupSync(); else _crmDirty=true;
}
function crmApply(){ /* synchronisierte Sterne & Notizen auf die Spieler-Objekte spiegeln */
  players.forEach(p=>{const C=CRM[p.id];if(!C)return;
    if(C._t&&Object.prototype.hasOwnProperty.call(C._t,'f'))p.star=!!C.f; else if(C.f)p.star=true;
    if(C.n!=null&&!p._noteLocal)p.note=C.n;});
}
function crmMerge(remote){
  let changed=false;
  if(!remote||typeof remote!=='object'||Array.isArray(remote))return false;
  for(const id of Object.keys(remote)){
    if(SYNC_BAD_KEYS[id])continue;
    const R=remote[id]; if(!R||typeof R!=='object'||Array.isArray(R))continue;
    const RT=(R._t&&typeof R._t==='object'&&!Array.isArray(R._t))?R._t:{};
    const had=Object.prototype.hasOwnProperty.call(CRM,id);
    const L=had?CRM[id]:{};
    const LT=(L._t&&typeof L._t==='object')?L._t:{};
    const keys=new Set([...Object.keys(R),...Object.keys(L),...Object.keys(RT)]); keys.delete('_t');
    keys.forEach(k=>{
      if(SYNC_BAD_KEYS[k])return;
      const rHas=Object.prototype.hasOwnProperty.call(R,k), lHas=Object.prototype.hasOwnProperty.call(L,k);
      if(rHas&&!crmValid(id,k,R[k]))return;                       /* ungültiger/manipulierter Wert: ignorieren */
      const rt=syncTime(RT[k]), lt=+LT[k]||0;
      if(id===META_ID&&k==='kv'){                                 /* Prüfwert des Team-Schlüssels: der ERSTE gewinnt, Löschen zählt nicht */
        if(!rHas)return;
        if(!lHas||(L.kv!==R.kv&&rt>0&&(lt===0||rt<lt))){ L.kv=R.kv; LT.kv=rt; changed=true; _kvChanged=true; }
        return;
      }
      hlcSeen(rt);
      const same=rHas&&lHas&&JSON.stringify(R[k])===JSON.stringify(L[k]);
      const differ=(rHas!==lHas)||(rHas&&!same);
      if(rt>lt||(rt===lt&&differ)){                                /* jüngerer Stand gewinnt; Gleichstand mit Unterschied → Server */
        if(!differ){ if(rt>lt)LT[k]=rt; return; }
        if(rHas)L[k]=R[k]; else delete L[k];
        LT[k]=Math.max(rt,lt); changed=true;
      }
    });
    if(Object.keys(LT).length)L._t=LT;
    if(!had&&Object.keys(L).length)CRM[id]=L;
  }
  return changed;
}
function lineupSer(){ try{return JSON.stringify({formation:LINEUP.formation,slots:LINEUP.slots,shadow:SHADOW});}catch(e){return null;} }
function syncSer(){ return JSON.stringify({formation:LINEUP.formation,slots:LINEUP.slots,shadow:SHADOW,crm:CRM,lt:_lineupT}); }
async function syncFetch(){
  const r=await fetch(SYNCU+'?getl=1',{cache:'no-store'}); const d=await r.json();
  if(!d||typeof d!=='object'||Array.isArray(d))throw new Error('ungültiger Online-Stand');
  return d;
}
function syncAdoptRemote(d){ /* Online-Stand einarbeiten; true = lokal hat sich etwas geändert */
  let ch=false;
  if(d.crm&&crmMerge(d.crm))ch=true;
  const rlt=syncTime(d.lt);
  if(d.formation&&FORMATIONS[d.formation]&&d.slots&&typeof d.slots==='object'&&rlt>=_lineupT){
    const slots={}; for(const k in d.slots){ if(players.some(p=>p.id===d.slots[k]))slots[+k]=d.slots[k]; }
    const shadow=(d.shadow&&typeof d.shadow==='object'&&!Array.isArray(d.shadow))?d.shadow:SHADOW;
    const ser=JSON.stringify({formation:d.formation,slots,shadow});
    if(ser!==lineupSer()){ LINEUP={formation:d.formation,slots}; SHADOW=shadow; ch=true; _lineupAdopted=true; }
    _lineupT=rlt; hlcSeen(rlt); _lastLineupSer=lineupSer();
  }
  return ch;
}
function syncState(st){
  SYNC_ST=st;
  const t={idle:'',pending:'⏳ speichert…',ok:'☁️ gespeichert',err:'⚠️ offline – wird nachgeholt'}[st]||'';
  document.querySelectorAll('.ksync').forEach(el=>{el.textContent=t;el.style.display=t?'':'none';});
}
function lineupSync(){
  const ls=lineupSer(); if(ls===null)return;
  if(_lastLineupSer===null)_lastLineupSer=ls; else if(ls!==_lastLineupSer){ _lastLineupSer=ls; _lineupT=hlcNow(); }
  let s; try{s=syncSer();}catch(e){return;}
  if(_lastSync===null){_lastSync=s;return;} /* erster Render: nur Stand merken, nicht speichern */
  if(s===_lastSync)return;
  _lastSync=s; outboxSave();
  clearTimeout(_syncT); clearTimeout(_verifyT); _pushTries=0;
  syncState('pending');
  _syncT=setTimeout(syncPush,1500);
}
async function syncPush(){
  try{
    const d=await syncFetch();                       /* ohne gültigen Online-Stand wird NICHT geschrieben */
    if(syncAdoptRemote(d))crmAfterRemote();
    const s=syncSer(); _lastSync=s;
    const fd=new FormData();fd.append('lk','svbc-elf-4471');fd.append('lineup',s);
    await fetch(SYNCU,{method:'POST',mode:'no-cors',body:fd});
    clearTimeout(_verifyT); _verifyT=setTimeout(syncVerify,3500);
  }catch(e){
    _pushTries++; syncState('err');
    clearTimeout(_syncT); _syncT=setTimeout(syncPush,Math.min(120000,15000*_pushTries));
  }
}
function syncMissing(d){ /* fehlt dem Server etwas, das wir haben? */
  const R=(d&&d.crm&&typeof d.crm==='object')?d.crm:{};
  for(const id of Object.keys(CRM)){
    const L=CRM[id], LT=(L&&L._t)||{}, RT=(R[id]&&R[id]._t)||{};
    for(const k of Object.keys(LT)){ if(id===META_ID&&k==='kv')continue; if((+RT[k]||0)<LT[k])return true; }
  }
  return _lineupT>syncTime(d.lt);
}
async function syncVerify(){
  try{
    const d=await syncFetch();
    if(syncAdoptRemote(d))crmAfterRemote();
    if(syncMissing(d)){
      if(_pushTries<3){ _pushTries++; syncState('pending'); clearTimeout(_syncT); _syncT=setTimeout(syncPush,600); }
      else { syncState('err'); clearTimeout(_syncT); _syncT=setTimeout(()=>{_pushTries=0;syncPush();},60000); }
    } else { _pushTries=0; syncState('ok'); }
  }catch(e){ syncState('err'); clearTimeout(_syncT); _syncT=setTimeout(syncPush,20000); }
}
function crmIsTyping(){const ae=document.activeElement;return !!(ae&&/^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName)&&ae.type!=='checkbox');}
function crmRefreshViews(){
  if(_kvChanged){ _kvChanged=false; try{tkVerified=false;}catch(e){} }
  try{crmApply();}catch(e){}
  if(_lineupAdopted){ _lineupAdopted=false; try{renderLineup();}catch(e){} }
  try{renderKandidaten();}catch(e){} try{renderKaderplan();}catch(e){} try{renderHome();}catch(e){} try{renderMvpCard();}catch(e){}
  outboxSave();
}
function crmAfterRemote(){ if(crmIsTyping()){_pendingRefresh=true;return;} crmRefreshViews(); }
document.addEventListener('focusout',()=>{ if(!_pendingRefresh)return; setTimeout(()=>{ if(_pendingRefresh&&!crmIsTyping()){_pendingRefresh=false;crmRefreshViews();} },350); });
/* App kommt wieder in den Vordergrund (z.B. am Handy): Änderungen der anderen Planer holen */
document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState!=='visible'||!_remoteDone)return;
  syncFetch().then(d=>{ if(syncAdoptRemote(d))crmAfterRemote(); }).catch(()=>{});
});
function lineupRemoteLoad(){
  if(_remoteLoaded)return; _remoteLoaded=true;
  const ob=outboxLoad(); if(ob){ try{crmApply();}catch(e){} } /* letzter Stand vom Gerät (auch offline) */
  syncFetch().then(d=>{
    syncAdoptRemote(d); _lineupAdopted=false;
    crmApply();
    _lastLineupSer=lineupSer(); _lastSync=syncSer(); _remoteDone=true;
    if(ob&&syncMissing(d))_lastSync=''; /* auf dem Gerät liegt Neueres → gleich hochladen */
    outboxSave();
    if(_crmDirty){_crmDirty=false;_lastSync='';lineupSync();}
    renderAll();
  }).catch(()=>{
    /* Online-Stand nicht erreichbar: Bearbeiten ist erlaubt – geschrieben wird erst, wenn ein Abgleich klappt */
    _remoteDone=true; syncState('err');
    if(_crmDirty){_crmDirty=false;lineupSync();}
    if(ob){ try{renderAll();}catch(e){} }
    let tries=0; const retry=()=>{ if(++tries>5)return; setTimeout(()=>syncFetch().then(d=>{ if(syncAdoptRemote(d))crmAfterRemote(); if(SYNC_ST==='err')syncState('idle'); }).catch(retry),15000*tries); }; retry();
  });
}

function xiVal(p){ /* Engine-Wert: Stärke + Trainer-Vertrauen − Disziplin-Risiko */
  let v=scores(p).total*0.75 + Math.min(12,(p.kaderStarts||0)*1.2);
  if(p.risiko&&/diszip/i.test(p.risiko))v-=12; /* nur echte Disziplin-Historie (mehrfach Rot), nicht eine einzelne Gelb-Rote */
  return v;
}
function bestXI(){
  const pool=players.filter(p=>p.own&&p.kader===1&&!p.verzicht&&!(p.status&&/erletzt/.test(p.status))&&((p.kaderStarts||0)>0||p.bankOk));
  let best=null;
  for(const fname in FORMATIONS){
    const form=FORMATIONS[fname];
    const used=new Set(); const slots={}; let sum=0;
    const take=(i,p,bonus)=>{slots[i]=p.id;used.add(p.id);sum+=xiVal(p)+bonus;};
    form.forEach((sl,i)=>{ /* Pass 1: Hauptposition */
      const want=ROLE2POS[sl[0]];
      let bp=null,bv=-1;
      pool.forEach(p=>{if(used.has(p.id)||p.pos!==want)return;const v=xiVal(p);if(v>bv){bv=v;bp=p;}});
      if(bp)take(i,bp,8);
    });
    form.forEach((sl,i)=>{ /* Pass 2: Nebenposition UND (für LM/RM) zentrale Alternativen im direkten Vergleich */
      if(slots[i]!==undefined)return;
      const want=ROLE2POS[sl[0]];
      let bp=null,bv=-1,bb=0;
      pool.forEach(p=>{
        if(used.has(p.id))return;
        let bonus=null;
        if(p.pos2&&p.pos2.includes(want))bonus=3;
        else if((sl[0]==='LM'||sl[0]==='RM')&&(p.pos==='ZM'||p.pos==='OM'||p.pos==='ST'))bonus=-5;
        if(bonus===null)return;
        const v=xiVal(p)+bonus;
        if(v>bv){bv=v;bp=p;bb=bonus;}
      });
      if(bp)take(i,bp,bb);
    });
    if(!best||sum>best.sum)best={sum,formation:fname,slots,label:'Beste Elf (automatisch, '+fname+')'};
  }
  return best;
}
function initLineupSeed(){
  if(DATA.startelfNow&&DATA.startelfNow.slots){
    LINEUP={formation:DATA.startelfNow.formation,slots:{}};
    for(const k in DATA.startelfNow.slots){const id=DATA.startelfNow.slots[k];
      if(players.some(p=>p.id===id))LINEUP.slots[+k]=id;}
    return; /* Cloud-Stand überschreibt das gleich asynchron, falls neuer */
  }
  if(DATA.startelf&&DATA.startelf.slots){
    LINEUP={formation:DATA.startelf.formation,slots:{}};
    for(const k in DATA.startelf.slots){const id=DATA.startelf.slots[k];
      if(players.some(p=>p.id===id))LINEUP.slots[+k]=id;}
    return;
  }
  const form=FORMATIONS[LINEUP.formation];
  const own=players.filter(p=>p.own&&!p.isJugend);
  own.forEach(p=>{
    let bi=-1;
    for(let i=0;i<form.length;i++){ if(!LINEUP.slots[i]&&ROLE2POS[form[i][0]]===p.pos){bi=i;break;} }
    if(bi<0)for(let i=0;i<form.length;i++){ if(!LINEUP.slots[i]&&form[i][0]!=='TW'){bi=i;break;} }
    if(bi>=0)LINEUP.slots[bi]=p.id;
  });
}
function lineupCardHtml(p,role,i){
  const s=scores(p);const ov=Math.round(s.total);const c=tierColor(s.total);const src=p.photo||p.photoUrl;
  return `<div class="fcardm" style="--tc:${c}">${i!=null?`<button class="swapbtn" data-swap="${i}" title="Ersatzspieler anzeigen">⇄</button>`:``}<div class="ov">${ov}</div>`+
    `<div class="pic">${src?`<img src="${src}" alt="" onerror="this.remove()">`:initials(p.name)}</div>`+
    `<div class="nm">${p.name.split(' ').slice(-1)[0]}</div>`+
    (p.pos!=='TW'?`<div class="xg" title="Erwartete Tore über 30 Spiele Kreisliga A: Tore pro Team-Spiel × Liga-Gewicht × 30 — reale Einsatzquote eingerechnet">${role} · ≈${s.proj} xT</div>`:`<div class="xg">🧤 ${role}</div>`)+`</div>`;
}
function renderLineup(){
  const pitch=document.getElementById('pitch');if(!pitch)return;
  const form=FORMATIONS[LINEUP.formation];
  // Formationswahl
  document.getElementById('formRow').innerHTML='<span class="lbl">Formation</span>'+
    Object.keys(FORMATIONS).map(f=>`<button class="fpick ${f===LINEUP.formation?'on':''}" data-f="${f}">${f}</button>`).join('');
  document.querySelectorAll('#formRow .fpick').forEach(b=>b.onclick=()=>{
    const nf=b.dataset.f, old=FORMATIONS[LINEUP.formation], nw=FORMATIONS[nf];
    const ns={}; // Spieler nach Rolle möglichst mitnehmen
    const taken=new Set();
    nw.forEach((slot,i)=>{
      for(const oi in LINEUP.slots){ if(taken.has(oi))continue; if(old[oi]&&old[oi][0]===slot[0]){ns[i]=LINEUP.slots[oi];taken.add(oi);break;} }
    });
    let pool=Object.keys(LINEUP.slots).filter(oi=>!taken.has(oi)).map(oi=>LINEUP.slots[oi]);
    nw.forEach((slot,i)=>{ if(ns[i]===undefined&&pool.length){ns[i]=pool.shift();} });
    LINEUP={formation:nf,slots:ns};renderLineup();
  });
  // Elf-Knöpfe (oben)
  {const sr=document.getElementById('seedRow');
   if(sr){
     sr.innerHTML=`<span class="lbl">Elf laden</span>`
       +(DATA.startelfNow?`<button class="rtab" data-seed="now" style="border-color:rgba(77,163,255,.55);color:#4da3ff">📌 Aktuelle Startelf</button>`:``)
       +(DATA.startelf?`<button class="rtab" data-seed="stamm">⭐ Stammelf 25/26</button>`:``)
       +`<button class="rtab" data-seed="best" style="border-color:rgba(179,157,247,.5);color:#b39df7">🏆 Beste Elf (auto)</button>`;
     sr.querySelectorAll('[data-seed]').forEach(b=>b.onclick=()=>{
       const dd=b.dataset.seed==='stamm'?DATA.startelf:(b.dataset.seed==='best'?bestXI():DATA.startelfNow); if(!dd)return;
       LINEUP={formation:dd.formation,slots:{}};
       for(const k in dd.slots){ if(players.some(p=>p.id===dd.slots[k]))LINEUP.slots[+k]=dd.slots[k]; }
       renderLineup();
     });
   }}
  // Pitch
  let html='<div class="pl mid"></div><div class="pl circ"></div><div class="pl boxT"></div><div class="pl boxB"></div>';
  form.forEach((slot,i)=>{
    const [role,x,y]=slot;const pid=LINEUP.slots[i];const p=pid&&players.find(z=>z.id===pid);
    html+=`<div class="slot ${p?'':'vac'}" data-slot="${i}" style="left:${x}%;top:${y}%;z-index:${Math.round(y)}">`+
      (p?lineupCardHtml(p,role,i):`<div class="vcard">＋<span>${role}</span></div>`)+`</div>`;
  });
  pitch.innerHTML=html;
  // Ersatzbank: alle eigenen Spieler, die nicht aufgestellt sind
  {const benchEl=document.getElementById('bench');
   if(benchEl){
     const inXI=new Set(Object.values(LINEUP.slots));
     const bench=players.filter(p=>p.own&&p.kader===1&&!p.verzicht&&!(p.status&&/erletzt/.test(p.status))&&((p.kaderStarts||0)>0||p.bankOk)&&!inXI.has(p.id)).sort((a,b)=>(b.kaderStarts||0)-(a.kaderStarts||0)||scores(b).total-scores(a).total);
     benchEl.innerHTML=`<div class="lbl" style="display:block;margin:12px 2px 2px">🪑 Ersatzbank 25/26 (${bench.length}) — nur Spieler mit dokumentiertem Einsatz in der Ersten, sortiert nach Startelf-Häufigkeit. Aufs Feld ziehen = einwechseln · Feldspieler hierher ziehen = auswechseln · antippen = Profil.</div>
       <div class="benchrow">${bench.map(p=>`<div class="bcard" data-bpid="${p.id}">${lineupCardHtml(p,p.pos||'–')}<div class="btag" title="${p.kaderStarts||0}× Startelf 25/26 (dokumentiert)">${p.kaderStarts||0}×</div></div>`).join('')}</div>`;
   }}
  // Statistik / Lücken
  const filled=form.filter((_,i)=>LINEUP.slots[i]).length;
  const gaps=form.filter((_,i)=>!LINEUP.slots[i]).map(s=>s[0]);
  const gapCount={};gaps.forEach(g=>gapCount[ROLE2POS[g]]=(gapCount[ROLE2POS[g]]||0)+1);
  document.getElementById('gapRow').innerHTML=`<span class="lbl">${filled}/11 besetzt</span>`+
    (gaps.length?Object.entries(gapCount).map(([p,n])=>`<span class="gapchip" style="cursor:pointer" onclick="document.getElementById('needs').scrollIntoView({behavior:'smooth'})">Lücke: ${n}× ${p} ›</span>`).join(''):'<span class="gapchip" style="border-color:rgba(47,210,122,.4);background:rgba(47,210,122,.1);color:#5fe09b">Elf komplett ✓</span>');
  // Team-OVR
  const ids=form.map((_,i)=>LINEUP.slots[i]).filter(Boolean);
  const ovrs=ids.map(id=>scores(players.find(z=>z.id===id)).total);
  const teamOvr=ovrs.length?Math.round(ovrs.reduce((a,b)=>a+b,0)/ovrs.length):0;
  const lines=(function(){
    const zone=(y)=>y>=66?'def':y>=40?'mid':'att';
    const acc={def:[],mid:[],att:[]};
    form.forEach((s,i)=>{if(s[0]==='TW')return;const id=LINEUP.slots[i];if(id)acc[zone(s[2])].push(scores(players.find(z=>z.id===id)).total);});
    const avg=a=>a.length?Math.round(a.reduce((x,y)=>x+y,0)/a.length):'–';
    return `Abwehr ${avg(acc.def)} · Mittelfeld ${avg(acc.mid)} · Angriff ${avg(acc.att)}`;
  })();
  document.getElementById('lineupStats').innerHTML=`
    <div class="tiles" style="margin-top:14px">
      <div class="tile"><div class="v">${teamOvr}</div><div class="l">Team-OVR (Ø MScore)</div></div>
      <div class="tile"><div class="v">${filled}/11</div><div class="l">Positionen besetzt</div></div>
      <div class="tile" style="flex:2 1 260px"><div class="v" style="font-size:16px">${lines}</div><div class="l">Mannschaftsteile (Ø MScore)</div></div>
    </div>`;
  wireSlots();
  renderShadow();
  renderNeeds();
  lineupSync();
  lineupRemoteLoad();
}
function shadowAutoFill(){
  const form=FORMATIONS[LINEUP.formation];
  const inXI=new Set(Object.values(LINEUP.slots));
  const usedB=new Set(), usedZ=new Set();
  for(const k in SHADOW){ if(SHADOW[k].b)usedB.add(SHADOW[k].b); if(SHADOW[k].z)usedZ.add(SHADOW[k].z); }
  form.forEach((sl,i)=>{
    const want=ROLE2POS[sl[0]];
    SHADOW[i]=SHADOW[i]||{};
    if(!SHADOW[i].b){
      let bp=null,bv=-1;
      players.forEach(p=>{
        if(!p.own||p.verzicht||inXI.has(p.id)||usedB.has(p.id))return;
        if(p.status&&/erletzt/.test(p.status))return;
        const F=posFit(p,want); if(!F||F.lvl<1)return;
        const v=scores(p).total+F.lvl*4; if(v>bv){bv=v;bp=p;}
      });
      if(bp){SHADOW[i].b=bp.id;usedB.add(bp.id);}
    }
    if(!SHADOW[i].z){
      let bp=null,bv=-1;
      players.forEach(p=>{
        if(p.own||usedZ.has(p.id)||crmHidden(p))return;
        const F=posFit(p,want); if(!F||F.lvl<1)return;
        const W=wscore(p); if(!W)return;
        const v=W.k+F.lvl*4; if(v>bv){bv=v;bp=p;}
      });
      if(bp){SHADOW[i].z=bp.id;usedZ.add(bp.id);}
    }
  });
  renderLineup();
}
const SXI_L=['S','B','Z'];
const SXI_COL={S:'#4da3ff',B:'#5fe09b',Z:'#ffb347'};
function sxiStack(i){return [LINEUP.slots[i]||null,(SHADOW[i]||{}).b||null,(SHADOW[i]||{}).z||null];}
function renderShadowXI(){
  const pitch=document.getElementById('spitch'); if(!pitch)return;
  const form=FORMATIONS[LINEUP.formation];
  let html='<div class="pl mid"></div><div class="pl circ"></div><div class="pl boxT"></div><div class="pl boxB"></div>';
  form.forEach((sl,i)=>{
    const [role,x,y]=sl;
    const st=sxiStack(i);
    const li=(((SHADOW[i]||{}).r)||0)%3;
    const pid=st[li];
    const p=pid&&players.find(z2=>z2.id===pid);
    const nexts=[1,2].map(k=>{const idx=(li+k)%3;const pp=st[idx]&&players.find(z2=>z2.id===st[idx]);
      return `<b style="color:${SXI_COL[SXI_L[idx]]}">${SXI_L[idx]}</b> ${pp?pp.name.split(' ').slice(-1)[0]:'–'}`;}).join(' · ');
    let card;
    if(p){
      const s=scores(p);const W=p.own?null:wscore(p);const v=W?W.k:s.total;const c=tierColor(v);const src=p.photo||p.photoUrl;
      card=`<div class="fcardm" style="--tc:${c}" data-sxigo="${p.id}">
        <button class="swapbtn" data-sxirot="${i}" title="Ebene durchrotieren">↻</button>
        <div class="ov">${Math.round(v)}</div>
        <div class="pic">${src?`<img src="${src}" alt="" onerror="this.remove()">`:initials(p.name)}</div>
        <div class="nm">${p.name.split(' ').slice(-1)[0]}</div>
        <div class="xg"><b style="color:${SXI_COL[SXI_L[li]]}">${SXI_L[li]}</b> · ${role}${p.own?'':' · extern'}</div></div>`;
    } else {
      card=`<div class="vcard" data-sxiedit="${i}:${li}" style="position:relative">＋<span>${SXI_L[li]} · ${role}</span><button class="swapbtn" data-sxirot="${i}" title="Ebene durchrotieren">↻</button></div>`;
    }
    html+=`<div class="slot ${p?'':'vac'}" style="left:${x}%;top:${y}%;z-index:${Math.round(y)}">${card}<div class="sxinext">${nexts}</div></div>`;
  });
  pitch.innerHTML=html;
  // Ebenen-Schnellwahl + Statistik
  const seed=document.getElementById('sxiSeed');
  if(seed){
    seed.innerHTML=`<span class="lbl">Ebene</span>
      <button class="rtab" data-sxiall="0" style="border-color:rgba(77,163,255,.5);color:#4da3ff">S · Startelf</button>
      <button class="rtab" data-sxiall="1" style="border-color:rgba(47,210,122,.4);color:#5fe09b">B · Backup-Elf</button>
      <button class="rtab" data-sxiall="2" style="border-color:rgba(255,179,71,.5);color:#ffb347">Z · Ziel-Elf</button>
      <button class="rtab" data-sxifill="1">⚡ Auto-Vervollständigen</button>`;
    seed.querySelectorAll('[data-sxiall]').forEach(b=>b.onclick=()=>{
      const r=+b.dataset.sxiall;
      FORMATIONS[LINEUP.formation].forEach((_,i)=>{SHADOW[i]=SHADOW[i]||{};SHADOW[i].r=r;});
      renderLineup();});
    const f=seed.querySelector('[data-sxifill]'); if(f)f.onclick=shadowAutoFill;
  }
  const stats=document.getElementById('sxiStats');
  if(stats){
    const avg=(li)=>{const vs=form.map((_,i)=>{const pid=sxiStack(i)[li];const p=pid&&players.find(z2=>z2.id===pid);if(!p)return null;const W=p.own?null:wscore(p);return W?W.k:scores(p).total;}).filter(v=>v!=null);
      return vs.length?Math.round(vs.reduce((a,b)=>a+b,0)/vs.length)+' <i style="font-size:11px;color:var(--ink3)">('+vs.length+'/11)</i>':'–';};
    stats.innerHTML=`<div class="tiles" style="margin-top:14px">
      <div class="tile"><div class="v" style="color:#4da3ff">${avg(0)}</div><div class="l">Ø Startelf</div></div>
      <div class="tile"><div class="v" style="color:#5fe09b">${avg(1)}</div><div class="l">Ø Backup-Elf</div></div>
      <div class="tile"><div class="v" style="color:#ffb347">${avg(2)}</div><div class="l">Ø Ziel-Elf (Transfer-Chance)</div></div>
    </div>`;
  }
  pitch.querySelectorAll('[data-sxirot]').forEach(b=>b.onclick=(e)=>{e.stopPropagation();
    const i=+b.dataset.sxirot;SHADOW[i]=SHADOW[i]||{};SHADOW[i].r=(((SHADOW[i].r)||0)+1)%3;renderLineup();});
  pitch.querySelectorAll('[data-sxigo]').forEach(c=>c.onclick=()=>startPlayer(c.dataset.sxigo));
  pitch.querySelectorAll('[data-sxiedit]').forEach(c=>c.onclick=(e)=>{if(e.target.closest('.swapbtn'))return;
    const [i,li]=c.dataset.sxiedit.split(':').map(Number);
    if(li===0)openSlotPicker(i); else openSlotPicker(i, li===1?'b':'z');});
}
function renderShadow(){
  const el=document.getElementById('shadow'); if(!el)return;
  const form=FORMATIONS[LINEUP.formation];
  const cell=(pid,i,depth)=>{
    if(!pid)return `<div class="shcell empty" data-shadow="${i}:${depth}">＋ planen</div>`;
    const p=players.find(x=>x.id===pid);
    if(!p)return `<div class="shcell empty" data-shadow="${i}:${depth}">＋ planen</div>`;
    const s=scores(p);const W=p.own?null:wscore(p);
    return `<div class="shcell" data-shadow="${i}:${depth}" title="Antippen: ändern">
      <span class="sc" style="color:${tierColor(W?W.k:s.total)}">${Math.round(W?W.k:s.total)}</span>
      <span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${p.name.split(' ').slice(-1)[0]}<br><i>${p.own?'eigen':p.club}</i></span></div>`;
  };
  el.innerHTML=`<div class="card needcard"><h3>👥 Schattenmannschaft <i style="color:var(--ink2);font-weight:600;font-size:12px">Kaderplanung — pro Position: Startelf · Backup · Transferziel</i></h3>
    <div style="display:flex;gap:8px;margin:8px 0 4px"><button class="rtab" id="shFill">⚡ Auto-Vervollständigen</button><button class="rtab" id="shClear">✕ Planung leeren</button></div>
    <div class="shrow" style="border-bottom:1px solid var(--line)"><span class="shhead">Pos</span><span class="shhead">Startelf</span><span class="shhead">Backup (Kader)</span><span class="shhead">🎯 Ziel (extern)</span></div>
    ${form.map((sl,i)=>{
      const st=LINEUP.slots[i];const sh=SHADOW[i]||{};
      const stp=st?players.find(x=>x.id===st):null;
      return `<div class="shrow"><span class="shrole">${sl[0]}</span>
        ${stp?`<div class="shcell" data-goid="${stp.id}"><span class="sc" style="color:${tierColor(scores(stp).total)}">${Math.round(scores(stp).total)}</span><span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${stp.name.split(' ').slice(-1)[0]}</span></div>`:`<div class="shcell empty">— vakant —</div>`}
        ${cell(sh.b,i,'b')}${cell(sh.z,i,'z')}</div>`;
    }).join('')}
    <p class="note">Backup = bester verfügbarer eigener Spieler der Position · Ziel = externes Wunschziel (Zahl = Transfer-Chance). Zellen antippen zum Ändern, Startelf-Zelle → Profil. Wird wie die Aufstellung <b>geräteübergreifend gespeichert</b>.</p></div>`;
  el.querySelectorAll('[data-shadow]').forEach(c=>c.onclick=()=>{const [i,dep]=c.dataset.shadow.split(':');openSlotPicker(+i,dep);});
  el.querySelectorAll('[data-goid]').forEach(c=>c.onclick=()=>startPlayer(c.dataset.goid));
  const f=document.getElementById('shFill'); if(f)f.onclick=shadowAutoFill;
  const cl=document.getElementById('shClear'); if(cl)cl.onclick=()=>{SHADOW={};renderLineup();};
  renderShadowXI();
}
function renderNeeds(){
  const el=document.getElementById('needs'); if(!el)return;
  const form=FORMATIONS[LINEUP.formation];
  const inXI=new Set(Object.values(LINEUP.slots));
  const byScore=(a,b)=>scores(b).total-scores(a).total;
  const ext=players.filter(p=>!p.own&&!inXI.has(p.id));
  const OFF=new Set(['ST','OM','Flügel']);
  // vakante Rollen gruppieren
  const vac={};
  form.forEach((s,i)=>{ if(LINEUP.slots[i]===undefined){const w=ROLE2POS[s[0]];
    if(!vac[w])vac[w]={n:0,slot:i,roles:new Set()};
    vac[w].n++; vac[w].roles.add(s[0]); }});
  const byK=(a,b)=>{const x=wscore(a),y=wscore(b);return (y?y.k:scores(b).total)-(x?x.k:scores(a).total);};
  const row=(p,slot,tag,tagCol)=>{const s=scores(p);const W=wscore(p);const c=tierColor(W?W.k:s.total);const src=p.photo||p.photoUrl;
    return `<div class="rankrow" data-goid="${p.id}">
      <span class="rk" style="color:${c}" title="${W?`Transfer-Chance`:`MScore`}">${Math.round(W?W.k:s.total)}</span>
      <div class="ava l-${p.liga}" style="width:30px;height:30px;font-size:11px;border-radius:9px">${src?`<img src="${src}" onerror="this.remove()">`:initials(p.name)}</div>
      <span class="rn">${p.name}${p.risiko?` <span title="${p.risiko}">⚠</span>`:''} <b style="color:${tagCol||'#5fe09b'};font-size:10.5px">${tag}</b><br><i>${p.club} · ${p.km!=null?p.km+' km':'km –'} · ${p.alter?(p.alterCa?'ca. ':'')+p.alter+' J.':'Alter –'} · <b style="color:var(--ink)">≈${s.proj} xT</b> · ${p.tore} Tore 25/26</i>${W?`<br><i style="color:#8fa3c7;font-size:11px">🕵️ Stärke ${Math.round(s.total)} · Wechsel ${W.w} — ${wreason(W,2)}</i>`:``}</span>
      ${slot!=null?`<button class="fillbtn" data-fill="${slot}:${p.id}" title="Direkt aufstellen">＋</button>`:'<span></span>'}</div>`;};
  let html='';
  // Kader-Bedarfsanalyse-Überblick
  const xiP=form.map((_,i)=>LINEUP.slots[i]).filter(Boolean).map(id=>players.find(z=>z.id===id)).filter(Boolean);
  const ages=xiP.filter(p=>p.alter).map(p=>p.alter);
  const oldies=xiP.filter(p=>p.alter&&p.alter>=32);
  const vacChips=Object.entries(vac).map(([w,v])=>`<span class="needchip" style="border-color:rgba(255,214,10,.4);color:#ffe064">${v.n}× ${w} offen</span>`).join('');
  html+=`<div class="card needcard"><h3>📋 Kader-Bedarfsanalyse</h3>
    <div style="margin-top:6px">${vacChips||'<span class="needchip" style="border-color:rgba(47,210,122,.4);color:#5fe09b">Alle 11 Positionen besetzt ✓</span>'}
    ${ages.length?`<span class="needchip">Ø Alter der Elf: ${(ages.reduce((a,b)=>a+b,0)/ages.length).toFixed(1)} J. (${ages.length}/${xiP.length} bekannt)</span>`:''}
    ${oldies.length?`<span class="needchip" style="border-color:rgba(255,107,107,.4);color:#ff8a8a">Nachfolge planen: ${oldies.map(p=>p.name.split(' ').slice(-1)[0]+' ('+(p.alterCa?'ca. ':'')+p.alter+')').join(', ')}</span>`:''}</div>
    <p class="note">☁️ Die Aufstellung wird automatisch <b>geräteübergreifend gespeichert</b> — die zuletzt gesetzte Elf erscheint auf jedem Gerät.</p>
    ${DATA.startelf?`<p class="note">Stammelf-Referenz: <b>${DATA.startelf.label}</b> — <a href="${DATA.startelf.quelle}" target="_blank" rel="noopener" style="color:var(--accent)">Quelle: Vereinsheft ↗</a>. Per Antippen/Ziehen frei änderbar.</p>`:``}<p class="note">Basis: öffentliche Torjägerlisten &amp; fussball.de-Profile. Torhüter/Verteidiger tauchen dort kaum auf – für Defensiv-Positionen ersetzt kein Datensatz die Sichtung vor Ort.</p></div>`;
  {const pool=ext.filter(p=>{const W=wscore(p);return W&&W.w>=55;}).sort(byK).slice(0,6);
   if(pool.length){
     html+=`<div class="card needcard"><h3>🕵️ Digital-Scout — die realistischsten Verstärkungen</h3>
       <div style="margin-top:6px">${pool.map(p=>row(p,null,p.pos||'Pos. –','#8fd0ff')).join('')}</div>
       <p class="note"><b>Transfer-Chance</b> = 55 % Stärke (MScore) + 45 % <b>Wechsel-Index</b>. Der Wechsel-Index schätzt aus öffentlichen Signalen (Zweitvertretung, Spielzeit, Liga-Differenz, Entfernung, Tabellenlage, Torjäger-Status, Verletzung), wie realistisch ein Wechsel zum SV/BSC ist — ein Superstürmer, der höherklassig oben mitspielt, landet bewusst weit unten. Komplette Begründung im Spielerprofil.</p></div>`;
   }}
  const entries=Object.entries(vac);
  if(entries.length){
    html+=entries.map(([want,v])=>{
      const match=ext.filter(p=>p.pos===want).sort(byK).slice(0,4);
      let extra=[];
      if(OFF.has(want)&&match.length<4){
        extra=ext.filter(p=>p.pos!==want&&(p.pos==='ST'||!p.pos)).sort(byK).slice(0,4-match.length);
      }
      const rows=match.map(p=>row(p,v.slot,'✓ '+want)).concat(
        extra.map(p=>row(p,v.slot,p.isJugend?'Jugend-Torjäger':(p.pos?'geführt als '+p.pos:'Pos. nicht erfasst'),'#ffd60a')));
      const empty=!rows.length?`<p class="note">Für <b>${want}</b> ist in den öffentlichen Torjägerlisten kein Spieler mit Positionsangabe erfasst – hier hilft nur klassische Sichtung. Über die Position auf dem Feld (＋) kannst du trotzdem jeden Spieler manuell einplanen.</p>`:'';
      return `<div class="card needcard"><h3>🎯 Transfer-Vorschläge: ${v.n}× ${[...v.roles].join(' / ')} <i>(${want})</i></h3>
        <div style="margin-top:6px">${rows.join('')}</div>${empty}
        ${rows.length?'<p class="note">Beste verfügbare Spieler nach MScore (ohne eigene &amp; bereits aufgestellte). Zeile → Profil · ＋ → direkt aufstellen.</p>':''}</div>`;
    }).join('');
  } else {
    const ups=[];
    form.forEach((s,i)=>{const pid=LINEUP.slots[i];if(!pid)return;const cur=players.find(z=>z.id===pid);if(!cur)return;
      const want=ROLE2POS[s[0]];
      const best=ext.filter(p=>p.pos===want).sort(byScore)[0];
      if(best&&scores(best).total-scores(cur).total>=8)ups.push({i,role:s[0],cur,best,diff:scores(best).total-scores(cur).total});});
    ups.sort((a,b)=>b.diff-a.diff);
    html+= ups.length?`<div class="card needcard"><h3>📈 Upgrade-Potenzial <i>(Elf ist komplett)</i></h3>
        <div style="margin-top:6px">${ups.slice(0,5).map(u=>row(u.best,u.i,`＋${u.diff.toFixed(0)} MScore vs. ${u.cur.name.split(' ').slice(-1)[0]} (${u.role})`,'#b39df7')).join('')}</div>
        <p class="note">Erfasste externe Spieler, die auf ihrer Position deutlich stärker bewertet sind als der aktuelle Elf-Spieler. ＋ ersetzt ihn in der Aufstellung.</p></div>`
      :`<div class="card needcard"><h3>✓ Kader-Check</h3><p class="note">Elf komplett – aktuell ist kein erfasster externer Spieler auf seiner Position deutlich stärker bewertet als deine Aufstellung.</p></div>`;
  }
  if(DATA.elfSaison&&DATA.elfSaison.names&&DATA.elfSaison.names.length){
    html+=`<div class="card needcard"><h3>🏆 ${DATA.elfSaison.label||'Elf der Saison'}</h3>
      <div style="margin-top:6px">${DATA.elfSaison.names.map(n=>{
        const p=players.find(x=>nrm(x.name)===nrm(n));
        if(!p)return `<span class="needchip">${n}</span>`;
        const mine=p.own?` style="border-color:rgba(77,163,255,.55);color:#4da3ff"`:``;
        return `<span class="needchip" data-goid="${p.id}"${mine} title="Profil öffnen">${n} · ${Math.round(scores(p).total)}</span>`;
      }).join('')}</div>
      <p class="note">Blau = eigener Spieler. Chip antippen → Profil (falls im Datenpool). ${DATA.elfSaison.quelle?`Quelle: <a href="${DATA.elfSaison.quelle}" target="_blank" rel="noopener">${DATA.elfSaison.quelleName||'FuPa'} ↗</a>`:''}</p></div>`;
  }
  el.innerHTML=html;
  el.querySelectorAll('[data-goid]').forEach(r=>{r.style.cursor='pointer';r.onclick=()=>startPlayer(r.dataset.goid);});
  el.querySelectorAll('[data-fill]').forEach(b=>b.onclick=(e)=>{e.stopPropagation();
    const [si,pid]=b.dataset.fill.split(':');LINEUP.slots[+si]=pid;renderLineup();
    const n=document.getElementById('pitch');if(n)n.scrollIntoView({behavior:'smooth',block:'center'});});
  el.querySelectorAll('[data-seed]').forEach(b=>b.onclick=()=>{
    const d=b.dataset.seed==='stamm'?DATA.startelf:(b.dataset.seed==='best'?bestXI():(b.dataset.seed==='now'?DATA.startelfNow:DATA.startelfLast)); if(!d)return;
    LINEUP={formation:d.formation,slots:{}};
    for(const k in d.slots){ if(players.some(p=>p.id===d.slots[k]))LINEUP.slots[+k]=d.slots[k]; }
    renderLineup();
    const n=document.getElementById('pitch');if(n)n.scrollIntoView({behavior:'smooth',block:'center'});});
}
let dragState=null;
let autoScrollDir=0, autoScrollRAF=null;
function dragAutoScroll(e){
  const m=90;
  autoScrollDir = e.clientY<m ? -1 : (e.clientY>window.innerHeight-m ? 1 : 0);
  if(autoScrollDir&&!autoScrollRAF){
    const step=()=>{
      if(!autoScrollDir||!dragState){autoScrollRAF=null;return;}
      /* App scrollt im <body> (overflow:auto), nicht im window */
      document.body.scrollTop+=autoScrollDir*16;
      window.scrollBy(0,autoScrollDir*16);
      autoScrollRAF=requestAnimationFrame(step);
    };
    autoScrollRAF=requestAnimationFrame(step);
  }
}
function slotAtPoint(x,y){
  const el=document.elementFromPoint(x,y);
  const direct=el&&el.closest('.slot'); if(direct)return direct;
  let best=null,bd=95*95;
  document.querySelectorAll('#pitch .slot').forEach(sl=>{
    const r=sl.getBoundingClientRect();
    const dx=r.x+r.width/2-x, dy=r.y+r.height/2-y, d=dx*dx+dy*dy;
    if(d<bd){bd=d;best=sl;}
  });
  return best;
}
function dragCleanup(){
  autoScrollDir=0;
  document.querySelectorAll('.slot.droptgt').forEach(x=>x.classList.remove('droptgt'));
  if(dragState&&dragState.ghost)dragState.ghost.remove();
  if(dragState&&dragState.el)dragState.el.classList.remove('drag');
  dragState=null;
}
function wireSlots(){
  document.querySelectorAll('#pitch .slot').forEach(sl=>{
    sl.onpointerdown=(e)=>{
      if(e.target.closest('.swapbtn'))return;
      const i=+sl.dataset.slot;const pid=LINEUP.slots[i];
      dragState={i,pid,x0:e.clientX,y0:e.clientY,moved:false,ghost:null,el:sl};
      try{sl.setPointerCapture&&sl.setPointerCapture(e.pointerId);}catch(_e){}
    };
    sl.onpointermove=(e)=>{
      if(!dragState||dragState.el!==sl)return;
      const dx=e.clientX-dragState.x0,dy=e.clientY-dragState.y0;
      if(!dragState.moved&&Math.hypot(dx,dy)>8&&dragState.pid){
        dragState.moved=true;sl.classList.add('drag');
        const g=document.createElement('div');g.className='ghost';
        g.innerHTML=sl.innerHTML;document.body.appendChild(g);dragState.ghost=g;
      }
      if(dragState.moved&&dragState.ghost){dragState.ghost.style.left=e.clientX+'px';dragState.ghost.style.top=e.clientY+'px';dragAutoScroll(e);
        document.querySelectorAll('.slot.droptgt').forEach(x=>x.classList.remove('droptgt'));
        const t=slotAtPoint(e.clientX,e.clientY); if(t&&+t.dataset.slot!==dragState.i)t.classList.add('droptgt');}
    };
    sl.onpointercancel=()=>{if(dragState&&dragState.el===sl)dragCleanup();};
    sl.onpointerup=(e)=>{
      if(!dragState||dragState.el!==sl)return;
      const i=dragState.i;
      if(dragState.moved){
        sl.classList.remove('drag');
        if(dragState.ghost)dragState.ghost.remove();
        const tgt=document.elementFromPoint(e.clientX,e.clientY);
        const overBench=tgt&&tgt.closest('#bench');
        const tslot=overBench?null:slotAtPoint(e.clientX,e.clientY);
        if(tslot&&+tslot.dataset.slot!==i){const j=+tslot.dataset.slot;const a=LINEUP.slots[i],b=LINEUP.slots[j];
          if(b)LINEUP.slots[i]=b;else delete LINEUP.slots[i];
          if(a)LINEUP.slots[j]=a;else delete LINEUP.slots[j];}
        else if(overBench){delete LINEUP.slots[i];}
        autoScrollDir=0;
        document.querySelectorAll('.slot.droptgt').forEach(x=>x.classList.remove('droptgt'));
        renderLineup();
      } else if(!e.target.closest('.swapbtn')) {
        const pid2=LINEUP.slots[i];
        if(pid2)startPlayer(pid2); else openSlotPicker(i);
      }
      dragState=null;
    };
  });
  document.querySelectorAll('#pitch .swapbtn').forEach(b=>{
    b.onpointerdown=e=>{e.stopPropagation();};
    b.onclick=e=>{e.stopPropagation();openSlotPicker(+b.dataset.swap);};
  });
  document.querySelectorAll('#bench [data-bpid]').forEach(bc=>{
    bc.onpointerdown=(e)=>{
      dragState={bench:true,pid:bc.dataset.bpid,x0:e.clientX,y0:e.clientY,moved:false,ghost:null,el:bc};
      try{bc.setPointerCapture&&bc.setPointerCapture(e.pointerId);}catch(_e){}
    };
    bc.onpointermove=(e)=>{
      if(!dragState||dragState.el!==bc)return;
      const dx=e.clientX-dragState.x0,dy=e.clientY-dragState.y0;
      if(!dragState.moved&&Math.hypot(dx,dy)>8){
        dragState.moved=true;bc.classList.add('drag');
        const g=document.createElement('div');g.className='ghost';
        g.innerHTML=bc.innerHTML;document.body.appendChild(g);dragState.ghost=g;
      }
      if(dragState.moved&&dragState.ghost){dragState.ghost.style.left=e.clientX+'px';dragState.ghost.style.top=e.clientY+'px';dragAutoScroll(e);
        document.querySelectorAll('.slot.droptgt').forEach(x=>x.classList.remove('droptgt'));
        const t=slotAtPoint(e.clientX,e.clientY); if(t)t.classList.add('droptgt');}
    };
    bc.onpointercancel=()=>{if(dragState&&dragState.el===bc)dragCleanup();};
    bc.onpointerup=(e)=>{
      if(!dragState||dragState.el!==bc)return;
      if(dragState.moved){
        bc.classList.remove('drag');
        if(dragState.ghost)dragState.ghost.remove();
        const tslot=slotAtPoint(e.clientX,e.clientY);
        autoScrollDir=0;
        document.querySelectorAll('.slot.droptgt').forEach(x=>x.classList.remove('droptgt'));
        if(tslot){LINEUP.slots[+tslot.dataset.slot]=dragState.pid;renderLineup();}
      } else { startPlayer(dragState.pid); }
      dragState=null;
    };
  });
}
function openSlotPicker(i,depth){
  const role=FORMATIONS[LINEUP.formation][i][0];const want=ROLE2POS[role];
  const pid=depth?((SHADOW[i]||{})[depth]):LINEUP.slots[i];
  const rank=(p)=>{const W=wscore(p);const base=W?W.k:scores(p).total;
    const F=posFit(p,want);let m=F?F.lvl*400:-500;
    if(depth==='z'){ if(!p.own)m+=3000; } else { if(p.own)m+=3000; }
    if(p.isJugend)m-=100;
    return base+m;};
  let q='';
  const draw=()=>{
    let arr=players.filter(p=>!(q&&!(p.name+' '+p.club).toLowerCase().includes(q)));
    arr=arr.filter(p=>!Object.values(LINEUP.slots).includes(p.id)||p.id===pid);
    arr=arr.filter(p=>!p.verzicht);
    if(!q)arr=arr.filter(p=>posFit(p,want)&&(p.own||!crmHidden(p))); /* ohne Suche: nur realistisch passende, nicht ausgeblendete Spieler */
    arr.sort((a,b)=>rank(b)-rank(a));
    document.getElementById('modal').innerHTML=`<button class="close" id="mclose">✕</button>
      <h2 style="font-size:19px">${depth?`${depth===`b`?`👥 Backup`:`🎯 Transferziel`} für ${role} planen`:(pid?`Ersatz für ${(players.find(z=>z.id===pid)||{name:role}).name}`:`Position ${role} besetzen`)}</h2>
      <div class="msub">Nur Spieler, die <b>${want}</b> realistisch spielen können: ✓ Hauptposition · ◐ dokumentierte Nebenposition · ~ ähnliche Position (Kreisliga-Polyvalenz: LV↔LM, ST↔Flügel …). Eigene zuerst (MScore), dann Externe nach 🕵️ Transfer-Chance. Die Suche findet weiterhin jeden Spieler.</div>
      <input type="search" class="search" id="pkq" placeholder="Spieler oder Verein suchen …" style="margin:12px 0" value="${q}">
      ${pid?`<button class="fpick" id="clr" style="margin-bottom:8px">✕ ${depth?`Planung entfernen`:`Position frei machen`}</button>`:''}
      <div style="max-height:52vh;overflow:auto">
        ${arr.slice(0,80).map(p=>{const s=scores(p);const W=wscore(p);const src=p.photo||p.photoUrl;const F=posFit(p,want);
          return `<div class="rankrow" data-pk="${p.id}">
            <span class="rk" style="color:${tierColor(W?W.k:s.total)}" title="${W?`Transfer-Chance (55% Stärke + 45% Wechsel-Index)`:`MScore`}">${Math.round(W?W.k:s.total)}</span>
            <div class="ava l-${p.liga}" style="width:30px;height:30px;font-size:11px;border-radius:9px">${src?`<img src="${src}" onerror="this.remove()">`:initials(p.name)}</div>
            <span class="rn">${p.own?'<b style="color:#4da3ff">●</b> ':''}${p.name} ${F?`<b style="color:${F.col}">${F.tag}</b>`:'<i style="color:var(--ink3)">'+(p.pos||'–')+'</i>'}<br><i>${p.club}${W?` · Stärke ${Math.round(s.total)} · Wechsel ${W.w}`:``}</i></span>
            <span class="rv">≈${s.proj} <i style="font-style:normal;font-size:10px">xT</i><br><i style="font-size:10px;color:var(--ink3);font-style:normal">${p.tore} Tore 25/26</i></span></div>`;}).join('')}
      </div>
      <p class="note">● = eigener Spieler. Unpassende Positionen (z.B. IV für einen Sturmplatz) sind bewusst ausgeblendet — über die Suche erreichbar, falls du es doch wissen willst.</p>`;
    document.getElementById('overlay').classList.add('open');
    document.getElementById('mclose').onclick=closeOverlay;
    const inp=document.getElementById('pkq');inp.oninput=e=>{q=e.target.value.toLowerCase();const c=inp.selectionStart;draw();const n=document.getElementById('pkq');n.focus();n.setSelectionRange(c,c);};
    const clr=document.getElementById('clr');if(clr)clr.onclick=()=>{if(depth){if(SHADOW[i])delete SHADOW[i][depth];}else{delete LINEUP.slots[i];}closeOverlay();renderLineup();};
    document.querySelectorAll('#modal [data-pk]').forEach(el=>el.onclick=()=>{if(depth){SHADOW[i]=SHADOW[i]||{};SHADOW[i][depth]=el.dataset.pk;}else{LINEUP.slots[i]=el.dataset.pk;}closeOverlay();renderLineup();});
  };
  draw();
}

/* ===== App-Modus: installierbar, offline-fest, aktualisiert sich selbst ===== */
const APP_BUILD='20260923-1243', OUTBOX_KEY='svbcOutbox', APP_HIDE_KEY='svbcInstallHide';
let _appPrompt=null, _appNew=null, _obT=null;
function appStandalone(){ try{ return !!(window.matchMedia&&matchMedia('(display-mode: standalone)').matches)||navigator.standalone===true; }catch(e){ return false; } }
function appPlatform(){
  const ua=navigator.userAgent||'';
  const ios=/iPhone|iPad|iPod/.test(ua)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
  return { ios, android:/Android/i.test(ua), inApp:/FBAN|FBAV|Instagram|WhatsApp|Line\//i.test(ua), iosOther:ios&&/CriOS|FxiOS|EdgiOS/.test(ua) };
}

/* --- Offline-Ausgang: letzter Stand liegt auf dem Gerät, nichts geht bei Funkloch/App-Schließen verloren --- */
function outboxSave(){ clearTimeout(_obT); _obT=setTimeout(()=>{ if(window.__svbcOut)return; try{ lsSet(OUTBOX_KEY,syncSer()); }catch(e){} },250); }
function outboxLoad(){
  let d=null; try{ const s=lsGet(OUTBOX_KEY); if(s)d=JSON.parse(s); }catch(e){ d=null; }
  if(!d||typeof d!=='object'||Array.isArray(d))return null;
  try{ syncAdoptRemote(d); _lineupAdopted=false; return d; }catch(e){ return null; }
}
window.addEventListener('online',()=>{ if(_remoteDone&&SYNC_ST==='err'){ clearTimeout(_syncT); _pushTries=0; _syncT=setTimeout(syncPush,800); } });
window.addEventListener('pagehide',()=>{ if(window.__svbcOut)return; try{ clearTimeout(_obT); lsSet(OUTBOX_KEY,syncSer()); }catch(e){} });

/* --- Service Worker --- */
function appRegisterSW(){
  if(!('serviceWorker' in navigator)||!/^https?:$/.test(location.protocol))return;
  navigator.serviceWorker.register('sw.js',{scope:'./'}).catch(()=>{});
}

/* --- Selbst-Aktualisierung: neue Version wird erkannt, ohne dass jemand „neu laden“ muss --- */
function appSafeToReload(){
  if(crmIsTyping())return false;
  if(SYNC_ST==='pending'||SYNC_ST==='err')return false;
  try{ if(document.getElementById('overlay').classList.contains('open'))return false; }catch(e){}
  try{ if(mvpDirty)return false; }catch(e){}
  return true;
}
function appReload(){
  try{ sessionStorage.setItem('svbcReloadFor',_appNew||''); }catch(e){}
  try{ lsSet(OUTBOX_KEY,syncSer()); }catch(e){}
  const go=()=>location.replace(location.pathname+'?v='+encodeURIComponent(_appNew||Date.now()));
  if(navigator.serviceWorker&&navigator.serviceWorker.getRegistration){
    navigator.serviceWorker.getRegistration().then(r=>r?r.update().catch(()=>{}):null).finally(go);
  } else go();
}
function appShowUpdate(){
  let el=document.getElementById('appUpd');
  if(!el){ el=document.createElement('button'); el.id='appUpd'; el.className='appupd'; el.type='button'; document.body.appendChild(el);
    el.onclick=()=>{ if(!appSafeToReload()&&SYNC_ST==='pending'){ kToast('Wird noch gespeichert – gleich nochmal tippen'); return; } appReload(); }; }
  el.innerHTML='🔄 <b>Neue Version</b> – tippen zum Laden';
  el.style.display='';
}
let _appLastCheck=0;
async function appCheckUpdate(auto){
  if(!/^https?:$/.test(location.protocol))return;
  const now=Date.now(); if(now-_appLastCheck<30000)return; _appLastCheck=now;
  try{
    const r=await fetch('version.json?t='+now,{cache:'no-store'}); if(!r.ok)return;
    const v=await r.json(); if(!v||typeof v.build!=='string'||!v.build||v.build===APP_BUILD)return;
    _appNew=v.build;
    let tried=''; try{ tried=sessionStorage.getItem('svbcReloadFor')||''; }catch(e){}
    if(auto&&tried!==v.build&&appSafeToReload()){ appReload(); return; }
    appShowUpdate();
  }catch(e){}
}
document.addEventListener('visibilitychange',()=>{ if(document.visibilityState==='visible')appCheckUpdate(true); });
setInterval(()=>{ if(document.visibilityState==='visible')appCheckUpdate(false); },20*60*1000);

/* --- Installieren (Home) --- */
window.addEventListener('beforeinstallprompt',e=>{ e.preventDefault(); _appPrompt=e; renderAppInstall(); });
window.addEventListener('appinstalled',()=>{ _appPrompt=null; lsSet(APP_HIDE_KEY,'1'); renderAppInstall(); try{kToast('📲 Installiert – ab jetzt über das Icon öffnen');}catch(e){} });
function appShare(){
  const url=location.origin+location.pathname.replace(/index\.html$/,'');
  const text='SV/BSC Scout – unsere Kaderplanungs-App. Link öffnen und „Zum Home-Bildschirm“ wählen: ';
  if(navigator.share){ navigator.share({title:'SV/BSC Scout',text,url}).catch(()=>{}); return; }
  kCopy(text+url);
}
function renderAppInstall(){
  const box=document.getElementById('appInstall'); if(!box)return;
  const P=appPlatform();
  if(appStandalone()||lsGet(APP_HIDE_KEY)==='1'||!(_appPrompt||P.ios||P.android)){ box.innerHTML=''; return; }
  let how;
  if(_appPrompt) how=`<button class="kbtn appgo" id="appInstBtn">📲 Jetzt installieren</button>`;
  else if(P.ios&&P.inApp) how=`<ol class="appsteps"><li>Unten rechts auf <b>„In Safari öffnen“</b> (Kompass-Symbol) tippen</li><li>Dort <b>Teilen</b> <span class="appico">⬆︎</span> → <b>„Zum Home-Bildschirm“</b></li><li>Oben rechts <b>„Hinzufügen“</b></li></ol>`;
  else if(P.ios) how=`<ol class="appsteps"><li>Unten (bzw. oben) auf <b>Teilen</b> <span class="appico">⬆︎</span> tippen</li><li>Runterscrollen: <b>„Zum Home-Bildschirm“</b></li><li>Oben rechts <b>„Hinzufügen“</b> – fertig</li></ol>`;
  else how=`<ol class="appsteps"><li>Oben rechts das Browser-Menü <span class="appico">⋮</span> öffnen</li><li><b>„App installieren“</b> bzw. <b>„Zum Startbildschirm hinzufügen“</b></li></ol>`;
  box.innerHTML=`<div class="card appcard"><button class="kx" id="appInstHide" title="Ausblenden" aria-label="Ausblenden">×</button>
    <div class="apphead"><img src="icon-192.png" alt="" class="appicon"><div><h3>SV/BSC Scout als App</h3>
    <p>Eigenes Icon auf dem Startbildschirm, Vollbild, startet auch im Funkloch am Sportplatz – und aktualisiert sich von selbst.</p></div></div>
    ${how}
    <div class="approw"><button class="kbtn" id="appShareBtn">📤 Link an Planer schicken</button></div></div>`;
  const b=document.getElementById('appInstBtn');
  if(b)b.onclick=async()=>{ const p=_appPrompt; if(!p)return; _appPrompt=null; try{ await p.prompt(); await p.userChoice; }catch(e){} renderAppInstall(); };
  document.getElementById('appInstHide').onclick=()=>{ lsSet(APP_HIDE_KEY,'1'); renderAppInstall(); };
  document.getElementById('appShareBtn').onclick=appShare;
}
function appInit(){
  document.documentElement.classList.toggle('standalone',appStandalone());
  const acts=document.getElementById('appActs');
  if(acts){
    acts.innerHTML=`<button class="appact" id="appRefresh" title="Neu laden" aria-label="Neu laden">↻</button><button class="appact" id="appShareTop" title="App teilen" aria-label="App teilen">📤</button>`;
    document.getElementById('appRefresh').onclick=()=>{ if(SYNC_ST==='pending'){kToast('Wird noch gespeichert – gleich nochmal');return;} _appNew=_appNew||String(Date.now()); appReload(); };
    document.getElementById('appShareTop').onclick=appShare;
  }
  if(/[?&]v=/.test(location.search)){ try{ history.replaceState(null,'',location.pathname+location.hash); }catch(e){} }
  const h=(location.hash||'').slice(1); if(/^[a-z]+$/.test(h)&&document.getElementById('panel-'+h)){ try{goTab(h);}catch(e){} }
  renderAppInstall();
  appRegisterSW();
  setTimeout(()=>appCheckUpdate(true),4000);
}

/* =====================================================================
   SV/BSC Scout v3 · Rollen, Supabase-Sync, Nutzerverwaltung, App-Shell
   (wird an den App-Code angehängt und überschreibt gezielt einzelne Funktionen)
   ===================================================================== */
const SVB=window.SVBC, SVU=window.__SVBC_USER||{role:'viewer',name:'',email:''};
const svEsc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const svIni=n=>String(n||'?').trim().split(/\s+/).map(w=>w[0]).slice(0,2).join('').toUpperCase()||'?';
const svFirst=n=>String(n||'').trim().split(/\s+/)[0]||'';
function svRole(){ return SVU.role||'viewer'; }
function canEdit(){ const r=svRole(); return r==='admin'||r==='vorstand'||r==='planer'; }
function canNotes(){ return canEdit()||svRole()==='trainer'; }
function canContacts(){ return canEdit(); }
function isAdmin(){ return svRole()==='admin'; }
function canManage(){ const r=svRole(); return r==='admin'||r==='vorstand'; }
const SV_TRAINER_FIELDS={n:1,f:1,mv:1,mvd:1,x:1,ps:1,ps2:1,ph:1,gb:1,al:1,fu:1,gr:1,sc:1};
function canWriteField(k){ if(canEdit())return true; if(svRole()==='trainer')return !!SV_TRAINER_FIELDS[k]; return false; }
let _svDeniedT=0;
function svDenied(t){ const n=Date.now(); if(n-_svDeniedT<2500)return; _svDeniedT=n; try{kToast('🔒 '+(t||'Dafür fehlt dir die Berechtigung – das machen die Kaderplaner.'));}catch(e){} }
function svAgo(ts){ const d=(Date.now()-new Date(ts).getTime())/1000; if(!isFinite(d))return ''; if(d<60)return 'gerade eben'; if(d<3600)return 'vor '+Math.round(d/60)+' Min.'; if(d<86400)return 'vor '+Math.round(d/3600)+' Std.';
  const days=Math.round(d/86400); if(days===1)return 'gestern'; if(days<7)return 'vor '+days+' Tagen'; return new Date(ts).toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit',year:'2-digit'}); }

/* ---------- Supabase-Sync (ersetzt den öffentlichen Webhook) ---------- */
async function syncFetch(){
  const {data,error}=await SVB.sb.rpc('scout_state'); if(error)throw error;
  if(!data||typeof data!=='object'||Array.isArray(data))throw new Error('ungültiger Online-Stand');
  if(!data.crm||typeof data.crm!=='object')data.crm={};
  return data;
}
function syncDiff(d){
  const R=(d&&d.crm)||{}, rows=[];
  for(const id of Object.keys(CRM)){
    const L=CRM[id], LT=(L&&L._t)||{}, RT=(R[id]&&R[id]._t)||{};
    for(const k of Object.keys(LT)){
      if(k==='kv'||!canWriteField(k))continue;
      if((+RT[k]||0)<LT[k]) rows.push({id,f:k,v:Object.prototype.hasOwnProperty.call(L,k)?L[k]:null,t:LT[k]});
    }
  }
  return rows;
}
function syncMissing(d){ return syncDiff(d).length>0||(canEdit()&&_lineupT>syncTime(d.lt)); }
async function syncPush(){
  try{
    const d=await syncFetch();
    if(syncAdoptRemote(d))crmAfterRemote();
    const rows=syncDiff(d), lin=canEdit()&&_lineupT>syncTime(d.lt);
    _lastSync=syncSer();
    for(let i=0;i<rows.length;i+=500){ const {error}=await SVB.sb.rpc('crm_put',{rows:rows.slice(i,i+500)}); if(error)throw error; }
    if(lin){ const {error}=await SVB.sb.rpc('lineup_put',{p_formation:LINEUP.formation,p_slots:LINEUP.slots,p_shadow:SHADOW,p_lt:_lineupT}); if(error)throw error; }
    clearTimeout(_verifyT); _verifyT=setTimeout(syncVerify,(rows.length||lin)?700:0);
  }catch(e){
    _pushTries++; syncState('err');
    clearTimeout(_syncT); _syncT=setTimeout(syncPush,Math.min(120000,15000*_pushTries));
  }
}
function svPull(){ if(!_remoteDone)return; syncFetch().then(d=>{ if(syncAdoptRemote(d))crmAfterRemote(); }).catch(()=>{}); }

/* ---------- Kontaktdaten: durch Rechte geschützt (kein Team-Schlüssel mehr nötig) ---------- */
async function tkInit(){}
async function kandCryptoTick(){}
function kandKeyPanel(){ return ''; }
async function kandSaveContact(id,val){
  if(!canContacts())return svDenied();
  val=(val||'').trim(); crmSet(id,{k:val||undefined}); kandSoftRender();
}
function kandContactPlain(p){ const C=crmOf(p); if(!C.k||isEnc(C.k))return ''; return String(C.k); }
function kandContactCell(p,C){
  if(!canContacts())return '<span class="kand-lock" title="Kontaktdaten sehen nur Kaderplaner">🔒</span>';
  if(C.k&&isEnc(C.k))return '<span class="kand-lock" title="Mit altem Team-Schlüssel verschlüsselt – bitte neu eintragen">🔒 alt – neu eintragen</span><input class="kand-in" data-kc="'+p.id+'" value="" placeholder="Handy / E-Mail" autocomplete="off">';
  const v=kandContactPlain(p), ph=kandPhone(v), ml=kandMail(v);
  return '<input class="kand-in" data-kc="'+p.id+'" value="'+kEsc(v)+'" placeholder="Handy / E-Mail" autocomplete="off">'
    +((ph||ml)?'<div class="kacts">'+(ph?'<a class="kbtn klink" href="tel:'+kEsc(ph.tel)+'" title="Anrufen">📞</a><a class="kbtn klink" href="https://wa.me/'+kEsc(ph.wa)+'" target="_blank" rel="noopener" title="WhatsApp-Chat öffnen">💬</a>':'')+(ml?'<a class="kbtn klink" href="mailto:'+kEsc(ml)+'" title="E-Mail">✉️</a>':'')+'</div>':'');
}

/* ---------- Schreibschutz je Rolle ---------- */
{ const _cs=crmSet; crmSet=function(id,upd){ const u={}; let blocked=false;
    for(const k in upd){ if(canWriteField(k))u[k]=upd[k]; else blocked=true; }
    if(blocked)svDenied(); if(Object.keys(u).length)_cs(id,u); }; }
{ const _rk=renderKandidaten; renderKandidaten=function(){
    const r=_rk.apply(this,arguments);
    const P=document.getElementById('panel-kandidaten');
    if(P&&!canEdit()){
      P.querySelectorAll('.kand-table input,.kand-table select,.kand-table textarea').forEach(el=>{ el.disabled=true; });
      P.querySelectorAll('.kand-table button:not(.kand-name)').forEach(el=>{ el.disabled=true; el.style.visibility='hidden'; });
      P.querySelectorAll('.kadd,#kDigBtn').forEach(el=>el.style.display='none');
      if(!P.querySelector('.ro-note')){ const n=document.createElement('div'); n.className='ro-note'; n.innerHTML=SVI('lock')+'<span><b>Nur lesen.</b> Die Pipeline pflegen die Kaderplaner – Kontaktdaten sind für deine Rolle ausgeblendet.</span>'; P.prepend(n); }
    }
    svBadges(); return r; }; }
function svGateModal(){
  const M=document.getElementById('modal'); if(!M||svRole()!=='viewer')return;
  M.querySelectorAll('.editsec').forEach(el=>{ el.style.display='none'; });
  const av=M.querySelector('#mAva'); if(av){ av.classList.remove('avaCam'); av.title=''; const c=av.cloneNode(true); av.replaceWith(c); }
}
{ const _rv=renderView; renderView=function(){ const r=_rv.apply(this,arguments); svGateModal(); return r; }; }
{ const _om=openModal; openModal=function(){ const r=_om.apply(this,arguments); svGateModal(); return r; }; }
/* Aufstellung/Schattenelf: nur Kaderplaner ändern */
['pointerdown','click','dragstart','touchstart'].forEach(ev=>document.addEventListener(ev,e=>{
  if(canEdit())return;
  const t=e.target&&e.target.closest&&e.target.closest('#panel-elf .slot,#panel-elf .bcard,#panel-elf .fpick,#panel-elf .fillbtn,#panel-elf .swapbtn,#panel-elf button,#panel-sxi .slot,#panel-sxi .shcell,#panel-sxi button,#panel-sxi .fillbtn');
  if(!t)return;
  e.preventDefault(); e.stopPropagation(); if(ev==='click')svDenied('Die Aufstellung ändern nur Kaderplaner.');
},true));

/* ---------- Shell: Titel, Navigation, Mehr-Menü ---------- */
const SV_PAGES={home:['Übersicht','Dein Lagebild für die Kaderplanung'],scout:['Scouting','Alle Spieler der Region – filtern, vergleichen, merken'],
  kandidaten:['Kandidaten','Kontakte, Wechselchancen und Zuständigkeiten'],kaderplan:['Kaderplan','Traumelf, Backups und offene Positionen'],
  db:['Datenbank','Alle Spieler als Tabelle – sortieren und filtern'],elf:['Aufstellung','Startelf planen und Positionen besetzen'],
  sxi:['Schattenelf','Backups und Wunschspieler je Position'],gems:['Rohdiamanten','Unterschätzte Spieler mit Potenzial'],
  jugend:['Jugend','Nachwuchs-Radar im Umkreis'],cmp:['Vergleich','Spieler direkt gegenüberstellen'],
  play:['Playbook','Wie datenbasierte Klubs Kader bauen'],model:['Modell','So rechnet der Scout'],admin:['Nutzer & Rollen','Wer hat Zugang – und was darf wer']};
function svTabAllowed(t){ if(t==='admin')return canManage(); if(t==='kandidaten')return svRole()!=='viewer'; return true; }
{ const _gt=goTab; goTab=function(tab){
    if(!tab||!svTabAllowed(tab)||!document.getElementById('panel-'+tab))tab='home';
    _gt(tab);
    const m=SV_PAGES[tab]||['',''];
    const h=document.getElementById('pgTitle'), s=document.getElementById('pgSub');
    if(h)h.textContent=m[0]; if(s)s.textContent=m[1];
    document.title=m[0]+' · SV/BSC Scout';
    document.querySelectorAll('.sgrid [data-sheet]').forEach(b=>b.classList.toggle('active',b.dataset.sheet===tab));
    const inBar=!!document.querySelector('.tabbar .ti.active'); const mb=document.getElementById('tMore'); if(mb)mb.classList.toggle('on',!inBar);
    if(tab==='admin')svAdminRender();
    try{ history.replaceState(null,'',location.pathname+(tab==='home'?'':'#'+tab)); }catch(e){}
    svSheet(false);
  }; }
function svSheet(open){ const s=document.getElementById('moreSheet'), bg=document.getElementById('sheetBg'); if(!s)return; s.classList.toggle('open',!!open); bg.classList.toggle('open',!!open); }
function svBadges(){
  try{ const due=kandList().filter(kandIsDue).length; document.querySelectorAll('[data-cnt="kandidaten"]').forEach(el=>{ el.textContent=due; el.style.display=due&&svRole()!=='viewer'?'':'none'; }); }catch(e){}
}

/* ---------- Kennzahlen auf der Übersicht ---------- */
function svTiles(){
  const el=document.getElementById('homeTiles'); if(!el)return;
  let kand=[],due=0; try{ kand=kandList(); due=kand.filter(kandIsDue).length; }catch(e){}
  let filled=0,total=11,form=''; try{ form=LINEUP.formation; const F=FORMATIONS[form]; total=F.length; filled=F.filter((_,i)=>LINEUP.slots[i]).length; }catch(e){}
  const stars=players.filter(p=>p.star).length, sen=players.filter(p=>!p.isJugend).length, jug=players.length-sen;
  const T=[];
  if(svRole()!=='viewer')T.push({go:'kandidaten',ic:'kand',c:'b',v:kand.length,l:'Kandidaten in der Pipeline',s:due?`<b class="bad">${due} Kontakt${due>1?'e':''} überfällig</b>`:(kand.length?'<b class="ok">alles im Plan</b>':'noch keine aufgenommen')});
  T.push({go:'elf',ic:'pitch',c:'g',v:filled+'<small>/'+total+'</small>',l:'Startelf besetzt',s:'Formation '+svEsc(form||'–')});
  T.push({go:'scout',ic:'gem',c:'v',v:stars,l:'Auf der Merkliste',s:'Favoriten im Blick'});
  T.push({go:'db',ic:'db',c:'y',v:sen.toLocaleString('de-DE'),l:'Spieler im Radar',s:(DATA.updated?'Stand '+new Date(DATA.updated).toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit'})+' · ':'')+'7 Ligen'});
  if(svRole()==='viewer')T.push({go:'kaderplan',ic:'plan',c:'b',v:'26/27',l:'Kaderplan',s:'Traumelf & Backups'});
  el.innerHTML=T.map(t=>`<button class="tile ktile c-${t.c}" data-go="${t.go}"><span class="ti-ic">${SVI(t.ic)}</span><div class="v">${t.v}</div><div class="l">${svEsc(t.l)}</div><div class="s">${t.s}</div></button>`).join('');
  el.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>goTab(b.dataset.go));
}

/* ---------- Begrüßung, Aktivität, Online ---------- */
function svHello(){
  const el=document.getElementById('svHello'); if(!el)return;
  const h=new Date().getHours(), g=h<11?'Guten Morgen':h<17?'Hallo':'Guten Abend';
  const d=new Date().toLocaleDateString('de-DE',{weekday:'long',day:'numeric',month:'long'});
  const st=(typeof DATA!=='undefined'&&DATA.updated)?' · Daten vom '+new Date(DATA.updated).toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit'}):'';
  el.innerHTML=`<div><h2>${g}, <span>${svEsc(svFirst(SVU.name)||'Coach')}</span></h2><p>${svEsc(d+st)} · <span class="rolechip r-${svEsc(svRole())}"><i></i>${svEsc(SVB.ROLE_T[svRole()]||'')}</span></p></div>
    <div class="online" id="svOnline2"></div>`;
  svOnlineRender();
}
const SV_FIELD={k:'Kontaktdaten',n:'Notiz',w:'Wechselchance',s:'Status',lc:'Kontakt',pl:'Zuständigkeit',rl:'Rolle',tp:'Zielposition',f:'Merkliste',mv:'FuPa-MVP',mvd:'FuPa-MVP',c:'Kontakt-Status',x:'Ex-Spieler',px:'Pipeline',u:'Wiedervorlage'};
let _svActT=null;
async function svActivity(){
  const el=document.getElementById('svAct'); if(!el||!navigator.onLine)return;
  try{
    const {data,error}=await SVB.sb.rpc('recent_activity',{lim:40}); if(error)throw error;
    const seen=new Set(), items=[];
    for(const r of (data||[])){ if(r.field==='mvd')continue; const key=r.player_id+'|'+r.who; if(seen.has(key))continue; seen.add(key);
      const p=players.find(x=>x.id===r.player_id); if(!p)continue; items.push({r,p}); if(items.length>=7)break; }
    if(!items.length){ el.innerHTML=''; return; }
    el.innerHTML=`<div class="card"><h3 style="display:flex;align-items:center;gap:8px">${SVI('activity')} Letzte Aktivität</h3><ul class="act">`+items.map(({r,p})=>{
      const what=r.field==='px'?(r.deleted?'wieder aufgenommen':'aus der Pipeline genommen'):(SV_FIELD[r.field]||'Eintrag')+(r.deleted?' entfernt':'');
      return `<li><div class="uav">${svEsc(svIni(r.who))}</div><div><b>${svEsc(r.who)}</b> · ${svEsc(what)} · <span class="pl" data-svp="${svEsc(p.id)}">${svEsc(p.name)}</span><span class="tm">${svEsc(svAgo(r.at))}</span></div></li>`; }).join('')+'</ul></div>';
    el.querySelectorAll('[data-svp]').forEach(a=>a.onclick=()=>openModal(a.dataset.svp));
  }catch(e){}
}
function svActivitySoon(){ clearTimeout(_svActT); _svActT=setTimeout(svActivity,900); }
let SV_ONLINE=[];
function svOnlineRender(){
  const others=SV_ONLINE.filter(u=>u.id!==SVU.id);
  const html=others.length?`<span class="dot"></span><span class="avs">${others.slice(0,5).map(u=>`<i class="r-${svEsc(u.role)}" title="${svEsc(u.name)} ist online">${svEsc(svIni(u.name))}</i>`).join('')}</span><span class="lbl">${others.length===1?svEsc(svFirst(others[0].name))+' ist online':others.length+' Kollegen online'}</span>`
    :'<span class="lbl">Nur du bist gerade online</span>';
  document.querySelectorAll('#svOnline,#svOnline2').forEach(el=>el.innerHTML=html);
}
function svRealtime(){
  try{
    const ch=SVB.sb.channel('scout-live',{config:{presence:{key:SVU.id||'x'}}});
    let t=null; const pull=()=>{ clearTimeout(t); t=setTimeout(()=>{ svPull(); svActivitySoon(); },400); };
    ch.on('postgres_changes',{event:'*',schema:'public',table:'crm_fields'},pull)
      .on('postgres_changes',{event:'*',schema:'public',table:'lineup'},pull)
      .on('presence',{event:'sync'},()=>{ const st=ch.presenceState(), m=new Map();
        Object.values(st).forEach(arr=>arr.forEach(u=>{ if(u&&u.id)m.set(u.id,u); })); SV_ONLINE=[...m.values()]; svOnlineRender(); })
      .subscribe(async s=>{ if(s==='SUBSCRIBED'){ try{ await ch.track({id:SVU.id,name:SVU.name||SVU.email,role:svRole()}); }catch(e){} } });
    SVB.channel=ch;
  }catch(e){}
}

/* ---------- Globale Spielersuche (⌘K) ---------- */
function svNorm(s){ return String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/ß/g,'ss'); }
function svSearchWire(){
  const box=document.getElementById('gSearchBox'), inp=document.getElementById('gSearch'), res=document.getElementById('gRes'); if(!inp)return;
  let sel=0, list=[];
  const idx=players.map(p=>({p,k:svNorm(p.name+' '+(p.club||''))}));
  const draw=()=>{
    const q=svNorm(inp.value.trim());
    if(!q){ res.classList.remove('open'); return; }
    const parts=q.split(/\s+/);
    list=idx.filter(x=>parts.every(w=>x.k.includes(w))).map(x=>({p:x.p,s:scores(x.p).total})).sort((a,b)=>{ const sa=svNorm(a.p.name).startsWith(q)?1:0, sb2=svNorm(b.p.name).startsWith(q)?1:0; return sb2-sa||b.s-a.s; }).slice(0,8);
    sel=Math.min(sel,Math.max(0,list.length-1));
    res.innerHTML=list.length?'<div class="gh">Spieler</div>'+list.map((x,i)=>`<div class="gi${i===sel?' sel':''}" data-i="${i}">${avaHtml(x.p)}<div style="min-width:0"><b>${svEsc(x.p.name)}</b><span>${svEsc(x.p.club||'')} · ${svEsc((typeof LIGA_NAME!=='undefined'&&LIGA_NAME[x.p.liga])||x.p.liga||'')}${x.p.pos?' · '+svEsc(x.p.pos):''}</span></div><div class="sc">${Math.round(x.s)}</div></div>`).join('')
      :'<div class="ge">Kein Spieler gefunden</div>';
    res.classList.add('open');
    res.querySelectorAll('.gi').forEach(g=>g.onmousedown=e=>{ e.preventDefault(); go(+g.dataset.i); });
  };
  const go=i=>{ const x=list[i]; if(!x)return; inp.value=''; res.classList.remove('open'); inp.blur(); box.classList.remove('mopen'); openModal(x.p.id); };
  inp.addEventListener('input',()=>{ sel=0; draw(); });
  inp.addEventListener('keydown',e=>{
    if(e.key==='ArrowDown'){ e.preventDefault(); sel=Math.min(sel+1,list.length-1); draw(); }
    else if(e.key==='ArrowUp'){ e.preventDefault(); sel=Math.max(sel-1,0); draw(); }
    else if(e.key==='Enter'){ e.preventDefault(); go(sel); }
    else if(e.key==='Escape'){ inp.value=''; res.classList.remove('open'); inp.blur(); box.classList.remove('mopen'); }
  });
  inp.addEventListener('blur',()=>setTimeout(()=>{ res.classList.remove('open'); box.classList.remove('mopen'); },150));
  document.addEventListener('keydown',e=>{
    if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){ e.preventDefault(); svSearchOpen(); }
    else if(e.key==='/'&&!crmIsTyping()&&!document.getElementById('overlay').classList.contains('open')){ e.preventDefault(); svSearchOpen(); }
  });
}
function svSearchOpen(){ const box=document.getElementById('gSearchBox'), inp=document.getElementById('gSearch'); if(!inp)return; if(innerWidth<=760)box.classList.add('mopen'); inp.focus(); inp.select(); }

/* ---------- Mein Konto ---------- */
function svModal(html){ const M=document.getElementById('modal'); M.innerHTML='<button class="close" id="svClose" aria-label="Schließen">✕</button>'+html; document.getElementById('overlay').classList.add('open'); document.getElementById('svClose').onclick=()=>closeOverlay(); return M; }
function svAccount(){
  const R=SVB.ROLE_T[svRole()]||'';
  const M=svModal(`<div class="mhead" style="gap:16px"><div class="uav r-${svEsc(svRole())}" style="width:58px;height:58px;border-radius:18px;font-size:20px">${svEsc(svIni(SVU.name||SVU.email))}</div>
      <div><h2 style="margin:0">${svEsc(SVU.name||'Mein Konto')}</h2><div class="msub">${svEsc(SVU.email||'')}</div><div style="margin-top:8px"><span class="rolechip r-${svEsc(svRole())}"><i></i>${svEsc(R)}</span></div></div></div>
    <div class="editsec" style="margin-top:22px"><h4>Passwort ändern</h4>
      <div class="editgrid" style="grid-template-columns:1fr 1fr auto;align-items:end">
        <div class="field"><label>Neues Passwort</label><input id="svPw1" type="password" autocomplete="new-password" placeholder="mind. 10 Zeichen"></div>
        <div class="field"><label>Wiederholen</label><input id="svPw2" type="password" autocomplete="new-password"></div>
        <button class="btn" id="svPwGo">Speichern</button></div>
      <div class="note" id="svPwMsg"></div></div>
    <div class="editsec"><h4>App</h4><div class="btnrow">
      <button class="btn ghost" id="svShare">${SVI('share')} App-Link teilen</button>
      <button class="btn ghost" id="svReload">${SVI('refresh')} Neu laden</button>
      <button class="btn ghost" id="svOut" style="color:#fca5a5">${SVI('logout')} Abmelden</button></div>
      <p class="note">Version ${svEsc((window.SVBC_CFG||{}).build||'')} · Datenstand ${svEsc(window.__SVBC_DSVER||'')}${SVB.offline?' · offline':''}</p></div>`);
  M.querySelectorAll('.btn svg').forEach(s=>{ s.style.cssText='width:16px;height:16px;vertical-align:-3px;margin-right:4px'; });
  document.getElementById('svOut').onclick=()=>SVB.signOut();
  document.getElementById('svReload').onclick=()=>{ try{appReload();}catch(e){ location.reload(); } };
  document.getElementById('svShare').onclick=()=>{ try{appShare();}catch(e){} };
  document.getElementById('svPwGo').onclick=async()=>{
    const a=document.getElementById('svPw1').value, b=document.getElementById('svPw2').value, m=document.getElementById('svPwMsg');
    if(a.length<10){ m.textContent='Bitte mindestens 10 Zeichen.'; m.style.color='#fca5a5'; return; }
    if(a!==b){ m.textContent='Die Passwörter sind nicht gleich.'; m.style.color='#fca5a5'; return; }
    try{ await SVB.changePassword(a); m.textContent='✓ Passwort geändert.'; m.style.color='#86efac'; document.getElementById('svPw1').value=document.getElementById('svPw2').value=''; }
    catch(e){ m.textContent=e.message; m.style.color='#fca5a5'; }
  };
}

/* ---------- Admin: Nutzer & Rollen ---------- */
const SV_ROLE_INFO={
  admin:{t:'Admin',d:'Voller Zugriff und Nutzerverwaltung',yes:['Alles sehen & bearbeiten','Kontaktdaten','Leute einladen & Rollen vergeben'],no:[]},
  vorstand:{t:'Vorstand',d:'Alles wie die Kaderplaner – plus einladen',yes:['Alles sehen & bearbeiten','Kandidaten, Kontakte & Aufstellung','Leute einladen (bis Kaderplaner)'],no:['Rollen ändern, sperren, löschen']},
  planer:{t:'Kaderplaner',d:'Die operative Kaderplanung',yes:['Kandidaten & Kontakte pflegen','Kaderplan & Aufstellung','Positionen & Spielerdaten','Notizen, MVP, Merkliste'],no:['Nutzerverwaltung']},
  trainer:{t:'Trainer / Scout',d:'Bewerten und einschätzen',yes:['Alles ansehen','Positionen & Spielerdaten ändern','Notizen, Eye-Test & MVP','Merkliste'],no:['Kontaktdaten','Kaderplanung ändern']},
  viewer:{t:'Gast',d:'Nur lesen – z.B. für Gäste und Sponsoren',yes:['Kaderplan & Aufstellung ansehen','Scouting & Datenbank'],no:['Kontaktdaten & Notizen','Änderungen']}
};
let SV_USERS=[], _svDel=null;
async function svAdminLoad(){ const {data,error}=await SVB.sb.rpc('admin_list'); if(error)throw error; SV_USERS=data||[]; }
const SV_ROLES=['admin','vorstand','planer','trainer','viewer'], SV_VORSTAND_INVITE=['planer','trainer','viewer'];
function svRoleOpts(cur,list){ return (list||SV_ROLES).map(r=>`<option value="${r}"${r===cur?' selected':''}>${svEsc(SV_ROLE_INFO[r].t)}</option>`).join(''); }
async function svAdminRender(reload){
  const P=document.getElementById('panel-admin'); if(!P||!canManage())return; const ADM=isAdmin();
  if(!P.dataset.init){ P.dataset.init='1'; P.innerHTML='<div class="card"><div class="empty">Lade Nutzer …</div></div>'; reload=true; }
  if(reload){ try{ await svAdminLoad(); }catch(e){ P.innerHTML='<div class="card"><div class="empty">Nutzer konnten nicht geladen werden: '+svEsc(SVB.errText(e))+'</div></div>'; return; } }
  const act=SV_USERS.filter(u=>u.active), wait=SV_USERS.filter(u=>u.active&&!u.pw_set&&!u.last_sign_in_at), off=SV_USERS.filter(u=>!u.active);
  const cnt=r=>act.filter(u=>u.role===r).length;
  const draft=P._draft||{name:'',email:'',role:'planer'};
  P.innerHTML=`
  <div class="card">
    <div class="adm-head"><div><h3 style="margin:0">Person einladen</h3><p style="margin:6px 0 0;font-size:13.5px">Du bekommst einen persönlichen Link – den schickst du per WhatsApp oder Mail. Wer ihn öffnet, legt sein Passwort fest und ist drin.${ADM?'':' Als Vorstand kannst du Kaderplaner, Trainer und Gäste einladen – Rollen ändern, sperren und löschen macht der Admin.'}</p></div></div>
    <form class="invite" id="svInv" autocomplete="off">
      <div><label for="svInvName">Name</label><input id="svInvName" class="search" placeholder="z.B. Erwin Müller" value="${svEsc(draft.name)}" required></div>
      <div><label for="svInvMail">E-Mail</label><input id="svInvMail" class="search" type="email" placeholder="name@beispiel.de" value="${svEsc(draft.email)}" required></div>
      <div><label for="svInvRole">Rolle</label><select id="svInvRole">${svRoleOpts(draft.role,ADM?SV_ROLES:SV_VORSTAND_INVITE)}</select></div>
      <button class="btn" id="svInvGo" type="submit" style="height:46px">${SVI('plus')} Einladen</button>
    </form>
    <div id="svInvOut"></div>
  </div>
  <div class="card">
    <div class="adm-head"><h3 style="margin:0">Team</h3>
      <div class="adm-stats"><div class="adm-stat"><b>${act.length}</b><span>aktiv</span></div><div class="adm-stat"><b>${cnt('planer')+cnt('admin')+cnt('vorstand')}</b><span>mit Schreibrechten</span></div><div class="adm-stat"><b>${wait.length}</b><span>Einladung offen</span></div>${off.length?`<div class="adm-stat"><b>${off.length}</b><span>gesperrt</span></div>`:''}</div></div>
    <div class="ulist">${SV_USERS.map(u=>{
      const me=u.id===SVU.id, pend=!u.pw_set&&!u.last_sign_in_at, canLink=ADM||(pend&&u.active&&SV_VORSTAND_INVITE.includes(u.role));
      const st=!u.active?'<span class="pill off">gesperrt</span>':pend?'<span class="pill wait">Einladung offen</span>':'<span class="pill on">aktiv</span>';
      const seen=u.last_seen?'zuletzt aktiv '+svAgo(u.last_seen):pend?'eingeladen '+svAgo(u.created_at):'noch nicht aktiv';
      return `<div class="urow${u.active?'':' off'}" data-u="${svEsc(u.id)}">
        <div class="uav r-${svEsc(u.role)}">${svEsc(svIni(u.name||u.email))}</div>
        <div class="nm"><b>${svEsc(u.name||'–')}${me?' <span style="color:var(--ink3);font-weight:600">(du)</span>':''}</b><span>${svEsc(u.email)}</span></div>
        <div class="st">${st}<br>${svEsc(seen)}${u.invited_by_name?' · von '+svEsc(u.invited_by_name):''}</div>
        ${ADM?`<select data-role="${svEsc(u.id)}"${me?' disabled title="Deine eigene Rolle kannst du nicht ändern"':''}>${svRoleOpts(u.role)}</select>`:`<span class="rolechip r-${svEsc(u.role)}" style="justify-self:start"><i></i>${svEsc((SV_ROLE_INFO[u.role]||{}).t||u.role)}</span>`}
        <div class="acts">${me?'':`
          ${canLink?`<button class="iconbtn" data-link="${svEsc(u.id)}" title="${pend?'Neuen Einladungslink erstellen':'Neuen Anmelde-Link erstellen'}">${SVI('link')}</button>`:''}
          ${ADM?`<button class="iconbtn" data-act="${svEsc(u.id)}" title="${u.active?'Zugang sperren':'Zugang wieder freigeben'}">${SVI(u.active?'ban':'check')}</button>
          <button class="iconbtn danger" data-del="${svEsc(u.id)}" title="Zugang löschen">${SVI('trash')}</button>`:''}`}</div>
      </div>`; }).join('')}</div>
  </div>
  <div class="sechead">Was darf wer?</div>
  <div class="rolegrid">${SV_ROLES.map(r=>{ const R=SV_ROLE_INFO[r]; return `<div class="rolecard"><span class="rolechip r-${r}"><i></i>${svEsc(R.t)}</span><h4>${svEsc(R.d)}</h4><ul>${R.yes.map(x=>`<li>${svEsc(x)}</li>`).join('')}${R.no.map(x=>`<li class="no">${svEsc(x)}</li>`).join('')}</ul></div>`; }).join('')}</div>`;
  const $$=s=>P.querySelector(s);
  ['svInvName','svInvMail','svInvRole'].forEach(id=>$$('#'+id).addEventListener('input',()=>{ P._draft={name:$$('#svInvName').value,email:$$('#svInvMail').value,role:$$('#svInvRole').value}; }));
  $$('#svInv').onsubmit=async e=>{
    e.preventDefault(); const b=$$('#svInvGo'); b.disabled=true; b.textContent='Einladen …';
    const name=$$('#svInvName').value.trim(), email=$$('#svInvMail').value.trim(), role=$$('#svInvRole').value;
    try{ const r=await SVB.admin('invite',{name,email,role}); P._draft=null; await svAdminRender(true); svLinkBox(r.link,name,role,'invite'); }
    catch(err){ b.disabled=false; b.innerHTML=SVI('plus')+' Einladen'; kToast('⚠️ '+err.message); }
  };
  P.querySelectorAll('[data-role]').forEach(s=>s.onchange=async()=>{
    const u=SV_USERS.find(x=>x.id===s.dataset.role);
    try{ const {error}=await SVB.sb.rpc('admin_update',{p_id:s.dataset.role,p_role:s.value,p_active:null,p_name:null}); if(error)throw error; kToast('✓ '+(u&&u.name||'')+' ist jetzt '+SV_ROLE_INFO[s.value].t); svAdminRender(true); }
    catch(e){ kToast('⚠️ '+String(e.message||e)); svAdminRender(true); }
  });
  P.querySelectorAll('[data-act]').forEach(b=>b.onclick=async()=>{
    const u=SV_USERS.find(x=>x.id===b.dataset.act); if(!u)return;
    try{ const {error}=await SVB.sb.rpc('admin_update',{p_id:u.id,p_role:null,p_active:!u.active,p_name:null}); if(error)throw error; kToast(u.active?'🔒 '+u.name+' gesperrt':'✓ '+u.name+' wieder freigegeben'); svAdminRender(true); }
    catch(e){ kToast('⚠️ '+String(e.message||e)); }
  });
  P.querySelectorAll('[data-link]').forEach(b=>b.onclick=async()=>{
    const u=SV_USERS.find(x=>x.id===b.dataset.link); if(!u)return; b.disabled=true;
    try{ const r=await SVB.admin('link',{user_id:u.id,kind:'magiclink'}); svLinkBox(r.link,u.name,u.role,u.pw_set?'login':'invite'); }
    catch(e){ kToast('⚠️ '+e.message); } b.disabled=false;
  });
  P.querySelectorAll('[data-del]').forEach(b=>b.onclick=async()=>{
    const u=SV_USERS.find(x=>x.id===b.dataset.del); if(!u)return;
    if(_svDel!==u.id){ _svDel=u.id; b.style.cssText='width:auto;padding:0 10px;background:rgba(240,82,82,.18);color:#fecaca;border-color:rgba(240,82,82,.5);font-size:12px;font-weight:700'; b.textContent='Wirklich löschen?'; setTimeout(()=>{ if(_svDel===u.id){ _svDel=null; svAdminRender(); } },4000); return; }
    _svDel=null; b.disabled=true;
    try{ await SVB.admin('delete',{user_id:u.id}); kToast('🗑️ Zugang von '+u.name+' gelöscht'); svAdminRender(true); }
    catch(e){ kToast('⚠️ '+e.message); svAdminRender(); }
  });
}
function svLinkBox(link,name,role,kind){
  const out=document.getElementById('svInvOut'); if(!out)return;
  const fn=svFirst(name)||'du', R=(SV_ROLE_INFO[role]||{}).t||'';
  const txt=kind==='invite'
    ?`Hallo ${fn}! Du bist zum SV/BSC Scout eingeladen – unserer Kaderplanungs-App (Rolle: ${R}).\n\nTipp auf den Link, leg dein Passwort fest – fertig:\n${link}\n\nDer Link ist nur für dich und nur begrenzt gültig. Danach kannst du die App auch aufs Handy legen.`
    :`Hallo ${fn}! Hier dein neuer Anmelde-Link für den SV/BSC Scout:\n${link}\n\nNur für dich und nur begrenzt gültig.`;
  out.innerHTML=`<div class="linkbox"><b style="display:flex;align-items:center;gap:8px">${SVI('check')} ${kind==='invite'?'Einladung für '+svEsc(name)+' ist bereit':'Neuer Link für '+svEsc(name)}</b>
    <code>${svEsc(link)}</code>
    <div class="btnrow">
      <a class="btn" href="https://wa.me/?text=${encodeURIComponent(txt)}" target="_blank" rel="noopener">${SVI('chat')} Per WhatsApp</a>
      <a class="btn ghost" href="mailto:?subject=${encodeURIComponent('Dein Zugang zum SV/BSC Scout')}&body=${encodeURIComponent(txt)}">${SVI('mail')} Per Mail</a>
      <button class="btn ghost" id="svLinkCopy">${SVI('copy')} Text kopieren</button>
    </div><p class="note" style="margin-top:10px">Der Link ist einmalig und nur begrenzt gültig. Abgelaufen? Einfach über ${SVI('link').replace('<svg','<svg style="width:13px;height:13px;vertical-align:-2px"')} einen neuen erzeugen.</p></div>`;
  out.querySelectorAll('.btn svg').forEach(s=>{ s.style.cssText='width:16px;height:16px;vertical-align:-3px;margin-right:4px'; });
  document.getElementById('svLinkCopy').onclick=()=>kCopy(txt);
  out.scrollIntoView({behavior:'smooth',block:'nearest'});
}

/* ---------- Start ---------- */
function svInit(){
  document.body.classList.add('role-'+svRole()); if(!canEdit())document.body.classList.add('ro');
  document.querySelectorAll('[data-tab="kandidaten"],[data-sheet="kandidaten"]').forEach(b=>{ if(svRole()==='viewer')b.style.display='none'; });
  document.querySelectorAll('[data-tab="admin"],[data-sheet="admin"],.adm-only').forEach(b=>{ if(!canManage())b.style.display='none'; });
  document.querySelectorAll('.tabbar .ti[data-tab="elf"]').forEach(b=>{ b.style.display=svRole()==='viewer'?'':'none'; });
  const R=SVB.ROLE_T[svRole()]||'', nm=SVU.name||SVU.email||'';
  document.querySelectorAll('[data-me-name]').forEach(el=>el.textContent=nm);
  document.querySelectorAll('[data-me-role]').forEach(el=>el.textContent=R);
  document.querySelectorAll('[data-me-ini]').forEach(el=>{ el.textContent=svIni(nm); el.className='uav r-'+svRole(); });
  document.querySelectorAll('[data-me]').forEach(b=>b.onclick=()=>{ svSheet(false); svAccount(); });
  document.querySelectorAll('.sgrid [data-sheet]').forEach(b=>b.onclick=()=>goTab(b.dataset.sheet));
  const mb=document.getElementById('tMore'); if(mb)mb.onclick=()=>svSheet(!document.getElementById('moreSheet').classList.contains('open'));
  const bg=document.getElementById('sheetBg'); if(bg)bg.onclick=()=>svSheet(false);
  const ms=document.getElementById('tbSearch'); if(ms)ms.onclick=svSearchOpen;
  svSearchWire(); svHello(); svRealtime(); svActivity(); svBadges();
  const h=(location.hash||'').slice(1); goTab(/^[a-z]+$/.test(h)?h:'home');
  { const _rh=renderHome; renderHome=function(){ const r=_rh.apply(this,arguments); svHello(); svTiles(); svActivitySoon(); svBadges(); return r; }; }
  svTiles();
  { const _ar=crmAfterRemote; crmAfterRemote=function(){ const r=_ar.apply(this,arguments); svActivitySoon(); return r; }; }
  if(SVB.offline)syncState('err');
}

/* =====================================================================
   SV/BSC Scout · Saison 26/27 live: Bewertung aus Vorsaison + laufender Saison
   - Produktion/Teamanteil: gleitend über 25/26 + 26/27 (ligagewichtet) → aktuell, aber stabil
   - Formtrend: laufende Saison gegen Vorsaison (ab 3 Spielen)
   - Tabellenkontext/Gegentore: ab 3 Spielen aus der aktuellen Tabelle
   ===================================================================== */
const SV_SEASON_MIN=3;
function svCurOk(p){ return !!(p&&p.cur&&p.cur.spiele>0&&!p.isJugend); }
function svSeasonLabel(){ const s=(DATA&&DATA.season)||'2526'; return s.slice(0,2)+'/'+s.slice(2); }
{ const _sc0=scores; scores=function(p){
  if(!svCurOk(p))return _sc0(p);
  const c=p.cur, w25=wOf(p), w26=LIGA_W[ligaBase(c.sub||c.liga)]||LIGA_W[ligaBase(c.liga)]||w25;
  const sp25=p.einsaetze||((p.toreBelegt&&p.kaderDoc&&p.kaderStarts)?Math.max(6,p.kaderStarts):p.teamSp)||0;
  const t25=p.tore||0, t26=c.tore||0, sp26=c.spiele||0, spAll=Math.max(1,sp25+sp26);
  const gw=(t25*w25+t26*w26)/spAll;                       /* ligagewichtete Tore/Spiel über beide Saisons */
  const gpg=(t25+t26)/spAll;
  let prod=clamp(gw/1.0*100,0,100);
  const tTall=(p.tT||0)+(c.tT||0);
  let share=tTall>0?clamp(((t25+t26)/tTall)/0.40*100,0,100):50;
  const useCur=sp26>=SV_SEASON_MIN;
  const rank=useCur?c.rank:p.rank, tc=useCur?c.teamCount:p.teamCount;
  let ctx=50; if(rank!=null&&tc>1){const pct=(rank-1)/(tc-1);ctx=clamp(30+pct*70,0,100);}
  let pot=50; if(p.alter!=null){const a=p.alter;pot=a<=20?100:a<=23?88:a<=26?70:a<=29?50:a<=32?32:18;}
  let trend=50,tratio=null;
  if(useCur&&sp25>0){                                       /* Form: laufende Saison vs. Vorsaison */
    const r26=(t26/sp26)*w26, r25=(t25/sp25)*w25;
    if(r25>0.02||r26>0.02){ tratio=r26/Math.max(0.05,r25); trend=clamp(50+(tratio-1)*40,0,100); if(w26<w25)trend=Math.min(trend,85); if(w26>w25&&tratio>=0.7)trend=Math.max(trend,55); }
  } else if(p.prev){
    const wPrevLiga=LIGA_W[ligaBase(p.prev.liga)]; const wprev=(p.prev.tore/Math.max(1,p.prev.spiele))*wPrevLiga;
    tratio=((t25/Math.max(1,sp25))*w25)/Math.max(0.05,wprev); trend=clamp(50+(tratio-1)*40,0,100);
  }
  let scout=50;
  if(p.scouted&&Object.values(p.scout).some(v=>v!==5)){const w=POS_W[p.pos]||POS_W['ST'];let s=0;for(const k in w)s+=(p.scout[k]||5)*w[k];scout=clamp(s*10,0,100);}
  const presse=(p.pressIdx!=null)?p.pressIdx:50;
  let defMode=false,gaTxt=null;
  if(p.pos==='TW'||p.pos==='IV'||p.pos==='AV'){
    defMode=true; ctx=50;
    const cl=(typeof clubFor==='function')?clubFor(p.club):null;
    const s26=cl&&cl.s2526, s27=cl&&cl['s'+(DATA.season||'2627')];
    const lg25=(DATA.ligaGA&&DATA.ligaGA['2526']&&s26)?DATA.ligaGA['2526'][s26.liga]:null;
    const lg27=(DATA.ligaGA&&DATA.ligaGA[DATA.season]&&s27)?DATA.ligaGA[DATA.season][s27.liga]:null;
    let ga=0,sp=0,exp=0;
    if(s26&&s26.spiele&&lg25){ga+=s26.gegentore;sp+=s26.spiele;exp+=lg25*s26.spiele;}
    if(s27&&s27.spiele&&lg27){ga+=s27.gegentore;sp+=s27.spiele;exp+=lg27*s27.spiele;}
    let defv=50;
    if(sp>0&&exp>0){ const ratio=ga/exp; defv=clamp((1.45-ratio)/0.9*100,0,100); gaTxt=(ga/sp).toFixed(2)+' Gegentore/Spiel (25/26 + '+svSeasonLabel()+') vs. Liga-Schnitt '+(exp/sp).toFixed(2);
      if(s27&&s27.spiele>=SV_SEASON_MIN&&lg27&&s26&&s26.spiele&&lg25){ const r27=(s27.gegentore/s27.spiele)/lg27, r26=(s26.gegentore/s26.spiele)/lg25; trend=clamp(50+(r26-r27)*60,0,100); } }
    if(p.pos==='AV'&&p.assists)defv=clamp(defv+Math.min(10,p.assists*3),0,100);
    if(t25+t26>0)defv=clamp(defv+Math.min(15,(t25+t26)*5),0,100);
    prod=Math.max(prod,defv); if(!(t25+t26>0))share=defv;
  }
  const sum=W.prod+W.share+W.ctx+W.pot+W.trend+W.presse+W.scout;
  let total=(prod*W.prod+share*W.share+ctx*W.ctx+pot*W.pot+trend*W.trend+presse*W.presse+scout*W.scout)/sum;
  let sdsB=0; if(p.sds>0){sdsB=Math.min(6,p.sds*2);total=Math.min(100,total+sdsB);}
  const _mo=mvpOf(p); let mvpAdj=0,mvpVal=_mo?_mo.v:null,mvpD=_mo?_mo.d:null,mvpBase=total;
  if(mvpVal!=null&&p.adjTo==null){const _b=total;total=Math.min(100,total*mvpFactor(mvpVal));mvpAdj=Math.round((total-_b)*10)/10;}
  let adjD=0,adjBase=null; if(p.adjTo!=null){adjBase=Math.round(total*10)/10;adjD=Math.round((p.adjTo-total)*10)/10;total=p.adjTo;}
  const proj=Math.round(gw*30);
  return {prod:Math.round(prod),share:Math.round(share),ctx:Math.round(ctx),pot:Math.round(pot),trend:Math.round(trend),presse:Math.round(presse),scout:Math.round(scout),total:Math.round(total*10)/10,
    mvp:mvpVal,mvpAdj,mvpD,mvpBase:Math.round(mvpBase*10)/10,gpg,proj,tratio,defMode,gaTxt,sdsB,adjD,adjBase,shareRaw:tTall>0?(t25+t26)/tTall:null,cur:c};
}; }

/* Liste: aktuelle Saison zuerst zeigen */
{ const _rh0=rowHtml; rowHtml=function(p,i,extra){
  let h=_rh0(p,i,extra);
  if(svCurOk(p)){ const c=p.cur; h=h.replace(`<span><b>${p.tore}</b> Tore</span>`,`<span><b>${c.tore}</b> Tore ${svSeasonLabel()}</span><span>${p.tore} T 25/26</span>`);
    if(c.wechsel)h=h.replace(`<span>${p.club}</span>`,`<span>${svEsc(c.club)} <i style="color:var(--gold);font-style:normal" title="Vereinswechsel – vorher ${svEsc(p.club)}">⇄</i></span>`); }
  if(p.neu27)h=h.replace('<div class="pname">','<div class="pname"><span class="badge" style="background:rgba(34,197,94,.15);color:#86efac">neu</span> ');
  return h; }; }
/* Profil: Zeile für die laufende Saison */
function svSeasonProfile(pid){
  const M=document.getElementById('modal'); if(!M)return;
  const p=players.find(x=>x.id===pid); if(!p||!svCurOk(p))return;
  const c=p.cur, sl=M.querySelector('.statlist'); if(!sl||sl.querySelector('.sv-cur'))return;
  const row=document.createElement('div'); row.className='sv-cur';
  row.innerHTML=`<span>Saison ${svSeasonLabel()} <i style="font-size:11px;color:var(--ink3);font-style:normal">Stand ${new Date(c.stand).toLocaleDateString('de-DE')}</i></span><b>${c.tore} Tore · ${c.spiele} Sp.${c.rank?' · Platz '+c.rank+'/'+c.teamCount:''}</b>`;
  sl.insertBefore(row,sl.firstChild.nextSibling);
  if(c.wechsel){ const w=document.createElement('div'); w.className='sv-cur'; w.innerHTML=`<span>Neuer Verein</span><b>${svEsc(c.club)}</b>`; sl.insertBefore(w,row.nextSibling); }
}
{ const _om1=openModal; openModal=function(){ const r=_om1.apply(this,arguments); try{svSeasonProfile(arguments[0]);}catch(e){} return r; }; }

/* ---------- Datenstand & Update (Admin) ---------- */
function svFmtDate(s){ try{ return new Date(s).toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit',year:'numeric'}); }catch(e){ return s||''; } }
async function svDataCard(P){
  if(!P||!canManage())return;
  let rows=[]; try{ const {data}=await SVB.sb.from('data_updates').select('at,ok,source,version,summary').order('at',{ascending:false}).limit(6); rows=data||[]; }catch(e){}
  const last=rows.find(r=>r.ok), lastSt=last&&last.summary||{};
  const el=document.createElement('div'); el.className='card'; el.id='svData';
  const lg=(lastSt.leagues||[]).map(l=>`<tr><td>${svEsc(l.name)}</td><td class="num">${l.spieltag}</td><td class="num">${l.teams}</td><td class="num">${l.scorers}</td><td class="num">${l.added}</td></tr>`).join('');
  el.innerHTML=`<div class="adm-head"><div><h3 style="margin:0;display:flex;gap:8px;align-items:center">${SVI('refresh')} Datenstand</h3>
      <p style="margin:6px 0 0;font-size:13.5px">Tore, Spiele und Tabellen aller 7 Ligen kommen automatisch von FUSSBALL.DE – <b>jeden Montag und Donnerstag um 6 Uhr</b>. Die Bewertungen rechnen die laufende Saison 26/27 mit der Vorsaison zusammen.</p></div>
      <button class="btn" id="svDataGo">${SVI('refresh')} Jetzt aktualisieren</button></div>
    <div class="adm-stats" style="margin-bottom:12px"><div class="adm-stat"><b>${svEsc(svFmtDate((DATA&&DATA.updated)||last&&last.at))}</b><span>Stand der Daten</span></div>
      ${last?`<div class="adm-stat"><b>${lastSt.matched||0}</b><span>Torschützen zugeordnet</span></div><div class="adm-stat"><b>${lastSt.added||0}</b><span>neu im Radar</span></div><div class="adm-stat"><b>${lastSt.transfers||0}</b><span>Vereinswechsel erkannt</span></div>`:''}</div>
    ${lg?`<div class="dbwrap" style="max-height:none"><table class="db" style="min-width:0"><thead><tr><th>Liga</th><th class="num">Spieltag</th><th class="num">Teams</th><th class="num">Torschützen</th><th class="num">neu</th></tr></thead><tbody>${lg}</tbody></table></div>`:''}
    <p class="note" id="svDataMsg">${rows.length?'Letzte Läufe: '+rows.slice(0,4).map(r=>(r.ok?'✓ ':'⚠ ')+new Date(r.at).toLocaleString('de-DE',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})+' ('+svEsc(r.source||'')+')').join(' · '):'Noch kein automatischer Lauf.'}</p>`;
  const old=P.querySelector('#svData'); if(old)old.replaceWith(el); else P.appendChild(el);
  el.querySelector('#svDataGo').onclick=async()=>{
    const b=el.querySelector('#svDataGo'), m=el.querySelector('#svDataMsg'); b.disabled=true; b.textContent='Lädt von FUSSBALL.DE …';
    try{ const {data,error}=await SVB.sb.functions.invoke('data-update',{body:{}}); if(error){ let t=error.message; try{ const j=await error.context.json(); if(j&&j.error)t=j.error; }catch(_){} throw new Error(t); }
      m.innerHTML='✓ Aktualisiert: '+(data.stats.matched||0)+' Torschützen, '+(data.stats.added||0)+' neu. <b>Die App lädt die neuen Daten jetzt …</b>'; setTimeout(()=>{ try{appReload();}catch(e){location.reload();} },1800); }
    catch(e){ b.disabled=false; b.innerHTML=SVI('refresh')+' Jetzt aktualisieren'; m.textContent='⚠ '+e.message; }
  };
}
{ const _ar0=svAdminRender; svAdminRender=async function(){ const r=await _ar0.apply(this,arguments); try{ await svDataCard(document.getElementById('panel-admin')); }catch(e){} return r; }; }

/* =====================================================================
   SV/BSC Scout · Runde 5
   - Positionen & Spielerdaten fürs ganze Team (auch Trainer) – statt nur auf einem Gerät
   - „Meine Kandidaten“: wer bin ich in der Spalte „Verantwortlich“?
   - Erinnerungs-Intervall je Kandidat, Erinnerungskarte auf der Übersicht, App-Symbol-Zähler
   - Push-Erinnerungen aufs Handy (Web Push)
   ===================================================================== */
Object.assign(SV_FIELD,{ps:'Position',ps2:'Nebenposition',ph:'Position',gb:'Geburtsdatum',al:'Alter',fu:'Starker Fuß',gr:'Größe',sc:'Eye-Test',ri:'Erinnerung'});

/* ---------- Wer bin ich in der Spalte „Verantwortlich“? (gleiche Regeln wie der Erinnerungs-Dienst) ---------- */
const SV_ALIAS={dome:['dominik','dome'],nico:['nico','nicolas','nicola'],ervin:['ervin','erwin'],tobi:['tobias','tobi'],lukas:['lukas','luke']};
const SV_PLANNERS=['Dome','Nico','Ervin'];
let SV_TEAM=[];
function svK(s){ return String(s||'').toLowerCase().replace(/ä/g,'ae').replace(/ö/g,'oe').replace(/ü/g,'ue').replace(/ß/g,'ss').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,''); }
function svKeysOf(u){ if(u&&u.pl_name)return [svK(u.pl_name)]; const nm=String((u&&u.name)||'').trim(), first=svK(nm.split(/\s+/)[0]), full=svK(nm);
  const k=new Set([full,first].filter(Boolean)); for(const a in SV_ALIAS) if(first&&SV_ALIAS[a].includes(first))k.add(a); return [...k]; }
function svPlOf(u,pl){ const p=svK(pl); if(!p)return false; if(svKeysOf(u).includes(p))return true; if(u&&u.pl_name)return false;
  const first=svK(String((u&&u.name)||'').trim().split(/\s+/)[0]); return p.length>=4&&first.length>p.length&&first.startsWith(p); }
function svIsMine(pl){ return svPlOf(SVU,pl); }
function kandPlanners(){
  const m=new Map(); const add=n=>{ n=String(n||'').trim(); const k=svK(n); if(k&&!m.has(k))m.set(k,n); };
  SV_PLANNERS.forEach(add); try{ PLANNERS_DEFAULT.forEach(add); metaPlanners().forEach(add); }catch(e){}
  SV_TEAM.forEach(u=>{ if(u.pl_name)add(u.pl_name); });
  try{ kandList().forEach(p=>add(crmOf(p).pl)); }catch(e){}
  if(canEdit()&&![...m.values()].some(svIsMine))add(SVU.pl_name||svFirst(SVU.name));
  return [...m.values()];
}
function svMyPlName(){ return kandPlanners().find(svIsMine)||SVU.pl_name||svFirst(SVU.name)||''; }
function svPlOpts(html){ const me='<option value="__me"'+(kandFP==='__me'?' selected':'')+'>Meine Kandidaten</option>'; const i=html.indexOf('</option>'); return i<0?me+html:html.slice(0,i+9)+me+html.slice(i+9); }

/* ---------- Erinnerungs-Intervall je Kandidat ---------- */
const SV_IV=[7,14,21,30,45,60];
function kandIv(p){ const v=+crmOf(p).ri; return v>=3&&v<=120?v:KAND_DUE_DAYS; }
function kandIsDue(p){ const ds=daysSince(crmOf(p).lc); return ds===null||ds>kandIv(p); }
function kandIvSel(p,C){
  return '<select class="kand-in kiv" data-kf="ri" data-id="'+p.id+'" title="Erinnern, wenn der letzte Kontakt länger her ist als …">'
    +'<option value="">⏰ nach '+KAND_DUE_DAYS+' T (Standard)</option>'
    +SV_IV.filter(n=>n!==KAND_DUE_DAYS).map(n=>'<option value="'+n+'"'+(+C.ri===n?' selected':'')+'>⏰ nach '+n+' Tagen</option>').join('')+'</select>';
}
function svMyCands(){ try{ return kandList().filter(p=>svIsMine(crmOf(p).pl)); }catch(e){ return []; } }
function svMyDue(){ return svMyCands().filter(kandIsDue); }
function svBadges(){
  try{
    const all=kandList(), mine=svMyCands(), myDue=mine.filter(kandIsDue).length, due=all.filter(kandIsDue).length;
    const n=mine.length?myDue:due;
    document.querySelectorAll('[data-cnt="kandidaten"]').forEach(el=>{ el.textContent=n; el.style.display=n&&svRole()!=='viewer'?'':'none'; el.title=mine.length?'deine fälligen Kontakte':'fällige Kontakte'; });
    if('setAppBadge' in navigator){ if(myDue)navigator.setAppBadge(myDue).catch(()=>{}); else navigator.clearAppBadge().catch(()=>{}); }
  }catch(e){}
}

/* ---------- Erinnerungskarte auf der Übersicht ---------- */
function svRemindRender(){
  const host=document.getElementById('svHello'); if(!host)return;
  let el=document.getElementById('svRemind'); if(!el){ el=document.createElement('div'); el.id='svRemind'; host.after(el); }
  if(svRole()==='viewer'){ el.innerHTML=''; return; }
  const mine=svMyCands(); if(!mine.length){ el.innerHTML=''; return; }
  const due=mine.filter(kandIsDue).sort((a,b)=>(daysSince(crmOf(b).lc)??1e9)-(daysSince(crmOf(a).lc)??1e9)||(crmOf(b).w||0)-(crmOf(a).w||0));
  const row=p=>{ const C=crmOf(p), ds=daysSince(C.lc), v=canContacts()?kandContactPlain(p):'', ph=v?kandPhone(v):null;
    const w=C.w&&WPROB[C.w]?' · Wechsel <b style="color:'+WPROB[C.w].c+'">'+WPROB[C.w].t+'</b>':'';
    return `<div class="rm-row">${avaHtml(p)}<div class="rm-n"><b data-svp="${svEsc(p.id)}">${svEsc(p.name)}</b><span>${svEsc(p.club||'')} · <em>${ds===null?'noch nie kontaktiert':'letzter Kontakt vor '+ds+' Tagen'}</em>${w}</span></div>
      <div class="rm-a">${ph?`<a class="iconbtn" href="tel:${svEsc(ph.tel)}" title="Anrufen">${SVI('phone')}</a><a class="iconbtn" href="https://wa.me/${svEsc(ph.wa)}" target="_blank" rel="noopener" title="WhatsApp">${SVI('chat')}</a>`:''}
      ${canEdit()?`<button class="btn sm" data-done="${svEsc(p.id)}">${SVI('check')} Kontakt heute</button>`:''}</div></div>`; };
  el.innerHTML=`<div class="card remind${due.length?' hot':''}">
    <div class="rm-h"><div class="rm-ic">${SVI(due.length?'bell':'check')}</div>
      <div class="rm-t"><h3>${due.length?(due.length===1?'1 Kontakt ist fällig':due.length+' Kontakte sind fällig'):'Alle deine Kontakte sind im Plan'}</h3>
      <p>Deine Kandidaten als „${svEsc(svMyPlName())}“ · ${mine.length} in der Pipeline</p></div>
      <span class="rm-push" id="svPushHome"></span></div>
    ${due.slice(0,5).map(row).join('')}
    ${due.length>5?`<p class="rm-more">… und ${due.length-5} weitere</p>`:''}
    <div class="rm-f"><button class="btn ghost" data-go-me>Meine Kandidaten öffnen →</button></div></div>`;
  el.querySelectorAll('[data-svp]').forEach(a=>a.onclick=()=>openModal(a.dataset.svp));
  el.querySelectorAll('[data-done]').forEach(b=>b.onclick=()=>{ const p=players.find(x=>x.id===b.dataset.done); crmSet(b.dataset.done,{lc:todayISO(),c:1}); kToast('✓ Kontakt mit '+(p?p.name:'Spieler')+' eingetragen'); svAfterKand(); });
  el.querySelector('[data-go-me]').onclick=()=>{ kandFP='__me'; kandDue=false; goTab('kandidaten'); try{renderKandidaten();}catch(e){} };
  svPushChip(document.getElementById('svPushHome'));
}
function svAfterKand(){ try{renderKandidaten();}catch(e){} svRemindRender(); try{svTiles();}catch(e){} svBadges(); }

/* ---------- Push-Erinnerungen ---------- */
function svPushSupported(){ return 'serviceWorker' in navigator&&'PushManager' in window&&'Notification' in window; }
function svIsIOS(){ return /iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1); }
function svStandalone(){ try{ return navigator.standalone===true||matchMedia('(display-mode: standalone)').matches; }catch(e){ return false; } }
function svB64ToU8(s){ s=s.replace(/-/g,'+').replace(/_/g,'/'); s+='='.repeat((4-s.length%4)%4); const b=atob(s), u=new Uint8Array(b.length); for(let i=0;i<b.length;i++)u[i]=b.charCodeAt(i); return u; }
function svU8ToB64(u){ let s=''; new Uint8Array(u).forEach(c=>s+=String.fromCharCode(c)); return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''); }
function svDeviceName(){ const u=navigator.userAgent; const d=/iPhone/.test(u)?'iPhone':/iPad/.test(u)||svIsIOS()&&/Mac/.test(u)?'iPad':/Android/.test(u)?'Android':/Mac/.test(u)?'Mac':/Windows/.test(u)?'Windows':'Gerät';
  const b=/Edg\//.test(u)?'Edge':/Firefox\//.test(u)?'Firefox':/Chrome\//.test(u)?'Chrome':/Safari\//.test(u)?'Safari':''; return (d+(b?' · '+b:'')).slice(0,60); }
async function svPushState(){
  if(svIsIOS()&&!svStandalone())return 'ios-install';
  if(!svPushSupported())return 'unsupported';
  if(Notification.permission==='denied')return 'denied';
  try{ const reg=await navigator.serviceWorker.getRegistration(); const sub=reg&&await reg.pushManager.getSubscription(); if(!sub)return 'off';
    const {data}=await SVB.sb.from('push_subs').select('endpoint').eq('endpoint',sub.endpoint).maybeSingle(); return data?'on':'off'; }catch(e){ return 'off'; }
}
async function svPushTest(){
  const {data,error}=await SVB.sb.functions.invoke('reminders',{body:{action:'test'}});
  if(error)throw new Error('Test-Mitteilung ging nicht raus');
  if(data&&data.ok===false)throw new Error(data.error||'Test-Mitteilung ging nicht raus');
  return data;
}
async function svPushOn(){
  const st=await svPushState();
  if(st==='ios-install'){ svPushHelp('ios'); return false; }
  if(st==='unsupported'){ kToast('Dieser Browser kann leider keine Mitteilungen empfangen.'); return false; }
  if(st==='denied'){ svPushHelp('denied'); return false; }
  const perm=await Notification.requestPermission();
  if(perm!=='granted'){ svPushHelp('denied'); return false; }
  const {data:pub,error:e1}=await SVB.sb.rpc('push_public_key'); if(e1||!pub)throw new Error('Erinnerungen sind noch nicht eingerichtet');
  const reg=await navigator.serviceWorker.ready;
  let sub=await reg.pushManager.getSubscription();
  if(sub){ try{ const k=sub.options&&sub.options.applicationServerKey; if(k&&svU8ToB64(k)!==pub){ await sub.unsubscribe(); sub=null; } }catch(e){} }
  if(!sub)sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:svB64ToU8(pub)});
  const j=sub.toJSON();
  const {error}=await SVB.sb.rpc('push_sub',{p_endpoint:j.endpoint,p_p256dh:j.keys.p256dh,p_auth:j.keys.auth,p_ua:svDeviceName()});
  if(error){ try{await sub.unsubscribe();}catch(e){} throw new Error(/check/.test(error.message||'')?'Dieser Browser nutzt einen unbekannten Mitteilungsdienst':'Anmelden fehlgeschlagen'); }
  try{ await svPushTest(); kToast('🔔 Erinnerungen sind an – gleich kommt eine Test-Mitteilung'); }catch(e){ kToast('🔔 Erinnerungen sind an'); }
  return true;
}
async function svPushOff(){
  try{ const reg=await navigator.serviceWorker.getRegistration(); const sub=reg&&await reg.pushManager.getSubscription();
    if(sub){ await SVB.sb.rpc('push_unsub',{p_endpoint:sub.endpoint}); await sub.unsubscribe(); } }catch(e){}
  kToast('🔕 Erinnerungen auf diesem Gerät ausgeschaltet');
}
function svPushHelp(kind){
  const ios=`<ol class="svsteps"><li>Unten in Safari auf <b>Teilen</b> tippen (Quadrat mit Pfeil).</li><li><b>„Zum Home-Bildschirm“</b> wählen und bestätigen.</li><li>Die App <b>vom Home-Bildschirm</b> öffnen und hier nochmal auf „Erinnerungen aufs Handy“ tippen.</li></ol><p class="note">Apple erlaubt Mitteilungen nur für Apps auf dem Home-Bildschirm (ab iOS 16.4).</p>`;
  const den=`<p>Mitteilungen sind für diese App gerade <b>blockiert</b>.</p><ol class="svsteps"><li><b>iPhone:</b> Einstellungen → Mitteilungen → SV/BSC Scout → Mitteilungen erlauben.</li><li><b>Android/Chrome:</b> Schloss-Symbol neben der Adresse bzw. App-Info → Benachrichtigungen → erlauben.</li><li>Danach hier nochmal einschalten.</li></ol>`;
  svModal(`<div class="mhead" style="gap:14px"><div class="rm-ic" style="width:48px;height:48px">${SVI('bell')}</div><div><h2 style="margin:0">Erinnerungen aufs Handy</h2><div class="msub">${kind==='ios'?'So geht’s auf dem iPhone':'Mitteilungen erlauben'}</div></div></div><div style="margin-top:16px">${kind==='ios'?ios:den}</div>`);
}
async function svPushChip(host,big){
  if(!host)return; if(!canEdit()&&!svMyCands().length){ host.innerHTML=''; return; }
  const st=await svPushState(); if(st==='unsupported'){ host.innerHTML=''; return; }
  if(st==='on'){ host.innerHTML=big?'':`<span class="pushchip on" title="Du bekommst Erinnerungen auf dieses Gerät">${SVI('bell')} Erinnerungen an</span>`; if(!big)return; }
  const lbl=st==='denied'?'Mitteilungen blockiert':'Erinnerungen aufs Handy';
  if(big){
    host.innerHTML=st==='on'?`<div class="pushrow"><span class="pushchip on">${SVI('bell')} Auf diesem Gerät an</span><button class="btn ghost sm" data-ptest>Test senden</button><button class="btn ghost sm" data-poff>Ausschalten</button></div>`
      :`<div class="pushrow"><button class="btn sm" data-pon>${SVI('bell')} ${lbl}</button></div>`;
    host.insertAdjacentHTML('beforeend','<p class="note">Du bekommst eine Mitteilung, sobald bei einem deiner Kandidaten der letzte Kontakt zu lange her ist – und montags eine kurze Übersicht. Jedes Gerät einzeln einschalten.</p>');
  } else host.innerHTML=`<button class="pushchip" data-pon>${SVI('bell')} ${lbl}</button>`;
  const on=host.querySelector('[data-pon]'); if(on)on.onclick=async()=>{ on.disabled=true; try{ await svPushOn(); }catch(e){ kToast('⚠️ '+e.message); } on.disabled=false; svPushChip(host,big); svPushRefreshAll(host); };
  const te=host.querySelector('[data-ptest]'); if(te)te.onclick=async()=>{ te.disabled=true; try{ const r=await svPushTest(); kToast('📨 Test verschickt'+(r&&r.devices>1?' an '+r.devices+' Geräte':'')); }catch(e){ kToast('⚠️ '+e.message); } te.disabled=false; };
  const of=host.querySelector('[data-poff]'); if(of)of.onclick=async()=>{ await svPushOff(); svPushChip(host,big); svPushRefreshAll(host); };
}
function svPushRefreshAll(except){ ['svPushHome','svPushKand'].forEach(id=>{ const h=document.getElementById(id); if(h&&h!==except)svPushChip(h); }); }

/* ---------- Kandidaten-Ansicht: Push-Schalter + Hinweis bei „Meine“ ---------- */
{ const _rk2=renderKandidaten; renderKandidaten=function(){
    const r=_rk2.apply(this,arguments);
    const db=document.getElementById('kDigBtn');
    if(db&&!document.getElementById('svPushKand')){ const s=document.createElement('span'); s.id='svPushKand'; db.after(s); svPushChip(s); }
    if(kandFP==='__me'){ const w=document.getElementById('kandWrap'), empty=w&&w.querySelector('.card:last-child');
      if(empty&&!w.querySelector('.kand-table')&&!svMyCands().length)empty.innerHTML='Dir sind noch keine Kandidaten zugeordnet. In der Spalte <b>„Verantwortlich“</b> einfach <b>'+svEsc(svMyPlName())+'</b> auswählen.'; }
    try{svRemindRender();}catch(e){}
    return r; }; }

/* ---------- Positionen & Spielerdaten: fürs ganze Team statt nur auf diesem Gerät ---------- */
const SV_PD_KEYS=['ps','ps2','ph','gb','al','fu','gr','sc'], SV_SC_KEYS=['tempo','technik','zweikampf','spielint','mentalitaet'];
function svAge(geb){ const d=new Date(geb); if(isNaN(d))return null; return Math.floor((Date.now()-d)/31557600000); }
function svApplyPlayerData(){
  players.forEach(p=>{
    const C=CRM[p.id], has=C&&SV_PD_KEYS.some(k=>C[k]!=null);
    if(!has&&!p._o)return;
    if(!p._o)p._o={pos:p.pos,pos2:p.pos2,geb:p.geb,alter:p.alter,alterCa:p.alterCa,fuss:p.fuss,groesse:p.groesse,scout:{...(p.scout||{})},scouted:p.scouted};
    const O=p._o, X=C||{};
    p.pos=(X.ps&&POS_W[X.ps])?X.ps:O.pos;
    p.pos2=X.ps2!=null?String(X.ps2).split(',').filter(x=>POS_W[x]&&x!==p.pos):O.pos2;
    p.posAlt=(X.ph&&POS_W[X.ph]&&X.ph!==p.pos)?X.ph:null;
    if(typeof X.gb==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(X.gb)){ p.geb=X.gb; p.alter=svAge(X.gb); p.alterCa=false; }
    else if(+X.al>=14&&+X.al<=50){ p.geb=O.geb; p.alter=+X.al; p.alterCa=false; }
    else { p.geb=O.geb; p.alter=O.alter; p.alterCa=O.alterCa; }
    p.fuss=['Rechts','Links','Beidfüßig'].includes(X.fu)?X.fu:O.fuss;
    p.groesse=(+X.gr>=140&&+X.gr<=215)?+X.gr:O.groesse;
    const sc=typeof X.sc==='string'?X.sc.split(',').map(Number):null;
    if(sc&&sc.length===5&&sc.every(v=>v>=1&&v<=10)){ p.scout={...(p.scout||{})}; SV_SC_KEYS.forEach((k,i)=>{ p.scout[k]=sc[i]; }); p.scouted=true; }
    else { p.scout={...O.scout}; p.scouted=O.scouted; }
  });
}
{ const _ca=crmApply; crmApply=function(){ const r=_ca.apply(this,arguments); try{svApplyPlayerData();}catch(e){ console.warn('Spielerdaten',e); } return r; }; }
function svCanPD(){ return canWriteField('ps'); }
function svPosLine(pid){
  const M=document.getElementById('modal'); const p=players.find(x=>x.id===pid); if(!M||!p)return;
  const sub=M.querySelector('.mhead .msub'); if(!sub||M.querySelector('.svpos'))return;
  const alt=(p.pos2||[]).filter(x=>x!==p.pos);
  const el=document.createElement('div'); el.className='svpos';
  el.innerHTML=`<span class="pp" title="Position">${SVI('move')}<b>${svEsc(p.pos||'–')}</b></span>${alt.length?`<span class="pa">kann auch ${svEsc(alt.join(', '))}</span>`:''}${p.posAlt?`<span class="pa">früher ${svEsc(p.posAlt)}</span>`:''}${svCanPD()?'<button class="svpos-ed" type="button">Position ändern</button>':''}`;
  sub.after(el);
  const b=el.querySelector('.svpos-ed'); if(b)b.onclick=()=>svPosEditor(p,el);
}
function svPosEditor(p,host){
  const keys=Object.keys(POS_W), cur=p.pos; let sel=cur; const alt=new Set((p.pos2||[]).filter(x=>x!==cur));
  const M=document.getElementById('modal'), old=M.querySelector('.svpos-box'); if(old){ old.remove(); return; }
  const box=document.createElement('div'); box.className='svpos-box'; (M.querySelector('.mhead')||host).after(box);
  setTimeout(()=>{ try{ box.scrollIntoView({behavior:'smooth',block:'nearest'}); }catch(e){} },30);
  const draw=()=>{
    box.innerHTML=`<div class="lbl">Position von ${svEsc(svFirst(p.name))} – Hauptposition</div><div class="chips">${keys.map(k=>`<button type="button" class="pchip${k===sel?' on':''}" data-m="${k}">${k}</button>`).join('')}</div>
      <div class="lbl">Kann auch spielen</div><div class="chips">${keys.filter(k=>k!==sel).map(k=>`<button type="button" class="pchip alt${alt.has(k)?' on':''}" data-a="${k}">${k}</button>`).join('')}</div>
      ${sel!==cur?`<div class="hint">${SVI('info')}<span>Neu: <b>${svEsc(cur||'–')} → ${svEsc(sel)}</b>. Die alte Position bleibt als „früher ${svEsc(cur||'–')}“ sichtbar.</span></div>`:''}
      <div class="btnrow"><button type="button" class="btn" data-save>Für alle speichern</button><button type="button" class="btn ghost" data-cancel>Abbrechen</button></div>`;
    box.querySelectorAll('[data-m]').forEach(b=>b.onclick=()=>{ sel=b.dataset.m; alt.delete(sel); draw(); });
    box.querySelectorAll('[data-a]').forEach(b=>b.onclick=()=>{ const k=b.dataset.a; if(alt.has(k))alt.delete(k); else alt.add(k); draw(); });
    box.querySelector('[data-cancel]').onclick=()=>box.remove();
    box.querySelector('[data-save]').onclick=()=>svSavePos(p,sel,[...alt]);
  };
  draw();
}
function svSavePos(p,sel,alt){
  const upd={}, before=p.pos;
  const a=keysSorted(alt.filter(k=>k!==sel)).join(',')||'-';
  const curA=keysSorted((p.pos2||[]).filter(x=>x!==p.pos)).join(',')||'-';
  if(sel!==p.pos){ upd.ps=sel; upd.ph=p.pos||undefined; }
  if(a!==curA||upd.ps)upd.ps2=a;
  if(!Object.keys(upd).length){ kToast('Keine Änderung'); return; }
  crmSet(p.id,upd); try{crmApply();}catch(e){}
  try{renderAll();}catch(e){} openModal(p.id);
  kToast(upd.ps?'✓ '+p.name+': '+(before||'–')+' → '+sel+' – für alle gespeichert':'✓ Nebenpositionen gespeichert');
}
function keysSorted(arr){ const o=Object.keys(POS_W); return arr.slice().sort((x,y)=>o.indexOf(x)-o.indexOf(y)); }
function svHookSave(pid){
  const p=players.find(x=>x.id===pid), b=document.getElementById('saveP'); if(!p||!b||!svCanPD()||b.dataset.sv)return; b.dataset.sv='1';
  const snap={pos:p.pos,geb:p.geb||null,alter:p.alter??null,fuss:p.fuss||null,groesse:p.groesse??null,sc:SV_SC_KEYS.map(k=>(p.scout||{})[k]).join(',')};
  b.addEventListener('click',()=>{
    const u={};
    if(p.pos!==snap.pos){ u.ps=p.pos; u.ph=snap.pos||undefined; }
    if((p.geb||null)!==snap.geb){ u.gb=p.geb||undefined; if(!p.geb)u.al=p.alter||undefined; }
    else if(!p.geb&&(p.alter??null)!==snap.alter)u.al=p.alter||undefined;
    if((p.fuss||null)!==snap.fuss)u.fu=p.fuss||undefined;
    if((p.groesse??null)!==snap.groesse)u.gr=p.groesse||undefined;
    const sc=SV_SC_KEYS.map(k=>(p.scout||{})[k]).join(','); if(sc!==snap.sc)u.sc=sc;
    if(Object.keys(u).length){ crmSet(p.id,u); try{crmApply();}catch(e){} try{renderAll();}catch(e){} kToast('✓ Für das ganze Team gespeichert'); }
  });
  const sec=b.closest('.editsec'); const h=sec&&sec.querySelector('h4');
  if(h&&!sec.querySelector('.sv-shared'))h.insertAdjacentHTML('afterend','<p class="note sv-shared" style="margin:-4px 0 10px">Position, Geburtsdatum, Fuß, Größe und Eye-Test sieht nach dem Speichern das ganze Team. Foto, Status, Einsätze und Assists bleiben auf diesem Gerät.</p>');
}
{ const _om2=openModal; openModal=function(){ const r=_om2.apply(this,arguments); try{ svPosLine(arguments[0]); svHookSave(arguments[0]); }catch(e){ console.warn(e); } return r; }; }

/* ---------- Mein Konto: Zuordnung + Erinnerungen ---------- */
{ const _acc=svAccount; svAccount=function(){
    const r=_acc.apply(this,arguments);
    const M=document.getElementById('modal'), app=M&&[...M.querySelectorAll('.editsec')].pop(); if(!app||svRole()==='viewer')return r;
    const auto=kandPlanners().find(n=>svPlOf({name:SVU.name},n));
    const sec=document.createElement('div'); sec.className='editsec';
    sec.innerHTML=`<h4>Kandidaten &amp; Erinnerungen</h4>
      <div class="field"><label for="svMyPl">In der Spalte „Verantwortlich“ bin ich</label><select id="svMyPl"><option value="">Automatisch${auto?' – '+svEsc(auto):''}</option>${kandPlanners().map(n=>`<option${SVU.pl_name===n?' selected':''}>${svEsc(n)}</option>`).join('')}</select></div>
      <div id="svPushAcc" style="margin-top:12px"></div>`;
    app.before(sec);
    document.getElementById('svMyPl').onchange=async e=>{
      const v=e.target.value;
      try{ const {error}=await SVB.sb.rpc('me_update',{p_name:null,p_pw_set:null,p_pl:v}); if(error)throw error;
        SVU.pl_name=v||null; try{ const c=JSON.parse(localStorage.getItem('svbcProfile')||'null'); if(c){ c.pl_name=SVU.pl_name; localStorage.setItem('svbcProfile',JSON.stringify(c)); } }catch(x){}
        kToast('✓ Gespeichert – „Meine Kandidaten“ zeigt jetzt '+(v||auto||'deine')); svAfterKand(); }
      catch(err){ kToast('⚠️ '+(err.message||err)); }
    };
    svPushChip(document.getElementById('svPushAcc'),true);
    return r; }; }

/* ---------- Start ---------- */
async function svTeamLoad(){ try{ const {data}=await SVB.sb.rpc('team_names'); if(Array.isArray(data)){ SV_TEAM=data; const me=data.find(u=>u.id===SVU.id); if(me&&me.pl_name!==undefined)SVU.pl_name=me.pl_name; } }catch(e){} }
{ const _si=svInit; svInit=function(){
    const r=_si.apply(this,arguments);
    try{svApplyPlayerData();}catch(e){}
    if(!document.getElementById('kRoleList'))document.body.insertAdjacentHTML('beforeend','<datalist id="kRoleList"><option value="Stammspieler"><option value="Führungsspieler"><option value="Rotation"><option value="Backup"><option value="Perspektivspieler"><option value="Torjäger"><option value="Ersatz-TW"><option value="Zweite Mannschaft"></datalist>');
    if(navigator.serviceWorker)navigator.serviceWorker.addEventListener('message',e=>{ const t=e.data&&e.data.svbcGo; if(typeof t==='string'&&/^[a-z]+$/.test(t)){ if(t==='kandidaten'&&svMyCands().length)kandFP='__me'; goTab(t); } });
    { const _rh2=renderHome; renderHome=function(){ const x=_rh2.apply(this,arguments); try{svRemindRender();}catch(e){} return x; }; }
    svRemindRender(); svBadges();
    svTeamLoad().then(()=>{ svRemindRender(); svBadges(); if(document.querySelector('#panel-kandidaten.active'))try{renderKandidaten();}catch(e){} });
    if(/(^|&)kandidaten/.test((location.hash||'').slice(1))&&svMyCands().length){ kandFP='__me'; try{renderKandidaten();}catch(e){} }
    return r; }; }

/* ================= INIT ================= */
renderWeights();
initLineupSeed();
renderAll();
try{tkInit();}catch(e){}
try{appInit();}catch(e){}
try{svInit();}catch(e){console.error('svInit',e);}