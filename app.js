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
const APP_BUILD='r14-202609240534', OUTBOX_KEY='svbcOutbox', APP_HIDE_KEY='svbcInstallHide';
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
    try{ svHist(tab); }catch(e){}
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

/* =====================================================================
   SV/BSC Scout · Runde 6: Spielerbogen wie in EA FC
   - Spielerrolle je Position, Special Skills (mit „+“ für herausragend), starker & schwacher Fuß
   - Charakter & Training (1–5), Charakter-Tags, Stärken/Schwächen
   - Spielerkarte im Profil, Positions-Check + Auto-Sortieren in der Aufstellung
   - Kader-Profil: Was haben wir, was fehlt – und Suche nach Rollen/Skills/Fuß
   ===================================================================== */
Object.assign(SV_FIELD,{wf:'Schwacher Fuß',rol:'Spielerrolle',sk:'Special Skills',ch:'Charakter & Training',tg:'Charakter-Tags',sts:'Stärken',sws:'Schwächen'});
Object.assign(SV_TRAINER_FIELDS,{wf:1,rol:1,sk:1,ch:1,tg:1,sts:1,sws:1});

/* ---------- Kataloge (angelehnt an EA SPORTS FC: PlayStyles & Player Roles) ---------- */
const SB_IC={
  abschluss:'<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r=".6" fill="currentColor"/>',
  wucht:'<path d="M3 12h9"/><path d="m9 8 4 4-4 4"/><path d="M16 5l2 3 3-1-1 3 2 2-3 1v3l-3-1-2 2"/>',
  kopfball:'<circle cx="10" cy="9" r="4"/><path d="M5 21v-2a5 5 0 0 1 10 0v2"/><circle cx="18" cy="5" r="2.2"/>',
  standard:'<path d="M5 21V4"/><path d="M5 4h10l-2 3.5 2 3.5H5"/><circle cx="17" cy="18" r="2.5"/>',
  elfer:'<rect x="3" y="4" width="18" height="10" rx="1"/><circle cx="12" cy="19" r="2"/><path d="M12 14v3"/>',
  steilpass:'<path d="M4 20 20 4"/><path d="M13 4h7v7"/><path d="M4 12l3 3M10 18l-3-3"/>',
  flanke:'<path d="M4 20c2-10 9-15 16-15"/><path d="m16 3 4 2-2 4"/>',
  langball:'<path d="M3 18c4-12 14-12 18 0"/><path d="m18 14 3 4-5 1"/>',
  kurzpass:'<circle cx="5" cy="17" r="2"/><circle cx="12" cy="6" r="2"/><circle cx="19" cy="17" r="2"/><path d="M6.5 15 10.5 8M13.5 8l4 7M7 17h10"/>',
  dribbling:'<path d="M4 18c3 0 3-4 6-4s3 4 6 4 3-4 4-4"/><circle cx="12" cy="7" r="3"/>',
  tempo:'<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
  erstkontakt:'<path d="M6 3v7a6 6 0 0 0 12 0V3"/><path d="M6 7h3M15 7h3"/>',
  pressresistent:'<path d="M12 3 4 6v6c0 4.5 3.4 8 8 9 4.6-1 8-4.5 8-9V6z"/><circle cx="12" cy="12" r="3"/>',
  zweikampf:'<path d="M12 3 4 6v6c0 4.5 3.4 8 8 9 4.6-1 8-4.5 8-9V6z"/><path d="m9 12 2 2 4-4"/>',
  antizipation:'<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  luftduell:'<path d="M12 21V9"/><path d="m7 13 5-5 5 5"/><path d="m7 7 5-5 5 5"/>',
  block:'<rect x="3" y="4" width="18" height="16" rx="1"/><path d="M3 9h18M3 15h18M9 4v5M15 9v6M9 15v5"/>',
  graetsche:'<path d="M3 17h14l4-4"/><circle cx="7" cy="9" r="3"/><path d="M10 11l5 3"/>',
  motor:'<path d="M3 12h4l2-5 4 10 2-5h6"/>',
  robust:'<path d="M12 21V3"/><circle cx="12" cy="5" r="2"/><path d="M5 12a7 7 0 0 0 14 0"/><path d="M3 12h4M17 12h4"/>',
  einwurf:'<path d="M7 20V9a3 3 0 0 1 6 0v11"/><circle cx="10" cy="4" r="2"/><path d="M13 12c3-4 6-5 8-5"/>',
  reflexe:'<path d="M8 13V5a2 2 0 0 1 4 0v6-8a2 2 0 0 1 4 0v8-5a2 2 0 0 1 4 0v8a8 8 0 0 1-16 0v-3a2 2 0 0 1 4 0"/>',
  strafraum:'<rect x="3" y="6" width="18" height="14" rx="1"/><path d="M7 20v-6h10v6"/><path d="M12 2v6"/>',
  fussarbeit:'<path d="M5 20c0-5 2-9 4-12 1-2 4-2 4 1 0 2-1 4 1 5 2 1 6 1 6 4 0 2-3 2-6 2z"/>',
  einsgegeneins:'<circle cx="7" cy="7" r="3"/><circle cx="17" cy="17" r="3"/><path d="M10 10l4 4"/>',
  abwurf:'<path d="M4 18c5-10 11-12 16-12"/><path d="M4 18h4"/><path d="m17 3 3 3-3 3"/>'
};
const SB_SKILLS=[
  {k:'abschluss',t:'Knipser',g:'Abschluss',fc:'Finesse Shot',d:'Eiskalt vor dem Tor, platziert sicher'},
  {k:'wucht',t:'Wuchtiger Schuss',g:'Abschluss',fc:'Power Shot',d:'Harter Schuss, auch aus der Distanz'},
  {k:'kopfball',t:'Kopfballstark',g:'Abschluss',fc:'Precision Header',d:'Trifft mit dem Kopf, stark bei Flanken'},
  {k:'standard',t:'Standardspezialist',g:'Abschluss',fc:'Dead Ball',d:'Freistöße und Ecken mit Qualität'},
  {k:'elfer',t:'Elfmeterschütze',g:'Abschluss',fc:'—',d:'Nervenstark vom Punkt'},
  {k:'steilpass',t:'Tödlicher Pass',g:'Passspiel',fc:'Incisive Pass',d:'Sieht und spielt den Pass in die Tiefe'},
  {k:'flanke',t:'Flankengott',g:'Passspiel',fc:'Whipped Pass',d:'Scharfe, präzise Flanken'},
  {k:'langball',t:'Spielverlagerung',g:'Passspiel',fc:'Long Ball Pass',d:'Lange Bälle kommen an'},
  {k:'kurzpass',t:'Ballsicher im Kurzpass',g:'Passspiel',fc:'Tiki Taka',d:'Verliert kaum einen Ball, hält das Spiel am Laufen'},
  {k:'dribbling',t:'Dribbler',g:'Ballkontrolle',fc:'Technical / Trickster',d:'Geht ins Eins-gegen-eins und kommt vorbei'},
  {k:'tempo',t:'Tempo',g:'Ballkontrolle',fc:'Rapid / Quick Step',d:'Antritt und Endgeschwindigkeit'},
  {k:'erstkontakt',t:'Erster Kontakt',g:'Ballkontrolle',fc:'First Touch',d:'Saubere Ballannahme auch unter Druck'},
  {k:'pressresistent',t:'Pressingresistent',g:'Ballkontrolle',fc:'Press Proven',d:'Behauptet den Ball gegen Druck'},
  {k:'zweikampf',t:'Zweikampfmonster',g:'Defensive',fc:'Bruiser / Anticipate',d:'Gewinnt die Duelle am Boden'},
  {k:'antizipation',t:'Antizipation',g:'Defensive',fc:'Intercept',d:'Liest das Spiel, fängt Bälle ab'},
  {k:'luftduell',t:'Lufthoheit',g:'Defensive',fc:'Aerial Fortress',d:'Gewinnt Kopfballduelle'},
  {k:'block',t:'Blockt alles',g:'Defensive',fc:'Block',d:'Wirft sich in jeden Schuss'},
  {k:'graetsche',t:'Grätsche',g:'Defensive',fc:'Slide Tackle',d:'Saubere Tacklings im richtigen Moment'},
  {k:'motor',t:'Laufmaschine',g:'Physis',fc:'Relentless',d:'Läuft 90 Minuten durch'},
  {k:'robust',t:'Robust',g:'Physis',fc:'Enforcer',d:'Körperlich präsent, schwer wegzuschieben'},
  {k:'einwurf',t:'Weiter Einwurf',g:'Physis',fc:'Long Throw',d:'Einwurf als Standard-Waffe'},
  {k:'reflexe',t:'Reflexe',g:'Torwart',fc:'Far Reach',d:'Hält die Unhaltbaren',tw:1},
  {k:'strafraum',t:'Strafraumbeherrschung',g:'Torwart',fc:'Cross Claimer',d:'Kommt raus, pflückt Flanken',tw:1},
  {k:'fussarbeit',t:'Mitspielender Torwart',g:'Torwart',fc:'Footwork',d:'Sicher mit dem Ball am Fuß',tw:1},
  {k:'einsgegeneins',t:'Stark im 1 gegen 1',g:'Torwart',fc:'Rush Out',d:'Verkürzt den Winkel, gewinnt Duelle',tw:1},
  {k:'abwurf',t:'Weiter Abwurf',g:'Torwart',fc:'Far Throw',d:'Schnelles Umschalten per Abwurf/Abstoß',tw:1}
];
const SB_SK={}; SB_SKILLS.forEach(s=>SB_SK[s.k]=s);
const SB_GROUPS=['Abschluss','Passspiel','Ballkontrolle','Defensive','Physis','Torwart'];
const SB_ROLES={
  TW:[{k:'tw-linie',t:'Linienkeeper',fc:'Goalkeeper',d:'Bleibt im Tor, stark auf der Linie'},{k:'tw-sweeper',t:'Mitspielender Keeper',fc:'Sweeper Keeper',d:'Verteidigt den Raum hinter der Kette'},{k:'tw-aufbau',t:'Spieleröffnender Keeper',fc:'Ball-Playing Keeper',d:'Rückt im Ballbesitz mit auf, eröffnet das Spiel'}],
  IV:[{k:'iv-klassisch',t:'Verteidiger',fc:'Defender',d:'Hält die Position, sichert ab'},{k:'iv-stopper',t:'Stopper',fc:'Stopper',d:'Rückt heraus, attackiert früh'},{k:'iv-spiel',t:'Spieleröffner',fc:'Ball-Playing Defender',d:'Eröffnet mit guten Pässen'},{k:'iv-halb',t:'Halbverteidiger',fc:'Wide Back',d:'Außen in der Dreierkette, schiebt mit auf'}],
  AV:[{k:'av-klassisch',t:'Außenverteidiger',fc:'Fullback',d:'Defensiv solide, wenig Vorwärtsdrang'},{k:'av-falsch',t:'Einrückender AV',fc:'Falseback',d:'Rückt im Aufbau ins Zentrum'},{k:'av-schiene',t:'Schienenspieler',fc:'Wingback',d:'Beackert die ganze Seite'},{k:'av-offensiv',t:'Offensiver Schienenspieler',fc:'Attacking Wingback',d:'Geht bis zur Grundlinie, flankt'},{k:'av-invers',t:'Inverser AV',fc:'Inverted Wingback',d:'Zieht nach innen ins Mittelfeld'}],
  ZM:[{k:'zm-sechser',t:'Abräumer (Sechser)',fc:'Holding',d:'Schützt die Abwehr, gewinnt Bälle'},{k:'zm-abkipp',t:'Abkippender Sechser',fc:'Centre-Half',d:'Lässt sich zwischen die IV fallen'},{k:'zm-tief',t:'Tiefer Spielmacher',fc:'Deep-Lying Playmaker',d:'Lenkt das Spiel von hinten'},{k:'zm-b2b',t:'Box-to-Box',fc:'Box-to-Box',d:'Von Strafraum zu Strafraum'},{k:'zm-crasher',t:'Strafraum-Crasher',fc:'Box Crasher',d:'Späte Läufe in den Strafraum, torgefährlich'},{k:'zm-halbraum',t:'Halbraumspieler',fc:'Half-Winger',d:'Zieht in den Halbraum, bindet Außen'}],
  OM:[{k:'om-spielmacher',t:'Spielmacher',fc:'Playmaker',d:'Kreativzentrale, letzter Pass'},{k:'om-zehn',t:'Klassische 10',fc:'Classic 10',d:'Zwischen den Linien, Technik und Übersicht'},{k:'om-schatten',t:'Hängende Spitze',fc:'Shadow Striker',d:'Geht mit in die Spitze, torgefährlich'},{k:'om-halbraum',t:'Halbraumspieler',fc:'Half-Winger',d:'Pendelt zwischen Zentrum und Flügel'}],
  'Flügel':[{k:'fl-winger',t:'Flügelspieler',fc:'Winger',d:'Tempo und Flanken an der Linie'},{k:'fl-breit',t:'Außenbahnspieler',fc:'Wide Midfielder',d:'Arbeitet auch nach hinten mit'},{k:'fl-spielmacher',t:'Flügel-Spielmacher',fc:'Wide Playmaker',d:'Kreativ von außen'},{k:'fl-invers',t:'Inverser Flügel',fc:'Inside Forward',d:'Zieht nach innen, schließt ab'}],
  ST:[{k:'st-knipser',t:'Knipser',fc:'Poacher',d:'Lauert im Strafraum, macht die Tore'},{k:'st-ziel',t:'Zielspieler',fc:'Target Forward',d:'Macht Bälle fest, stark im Kopfball'},{k:'st-tief',t:'Pressing-/Konterstürmer',fc:'Advanced Forward',d:'Läuft an, sprintet in die Tiefe'},{k:'st-falsch9',t:'Falsche 9',fc:'False 9',d:'Lässt sich fallen, verbindet das Spiel'}]
};
const SB_ROLE={}; Object.entries(SB_ROLES).forEach(([pos,arr])=>arr.forEach(r=>{ SB_ROLE[r.k]={...r,pos}; }));
const SB_CHAR=[{k:'fleiss',t:'Trainingsfleiß',s:'FLE'},{k:'lauf',t:'Laufstärke',s:'LAU'},{k:'team',t:'Teamgeist',s:'TEA'},{k:'zuv',t:'Zuverlässigkeit',s:'ZUV'},{k:'fuehr',t:'Führung',s:'FÜH'},{k:'ehrg',t:'Ehrgeiz',s:'EHR'}];
const SB_TAGS=[{k:'twm',t:'Trainingsweltmeister'},{k:'seele',t:'Kabinen-Seele'},{k:'leader',t:'Führungsspieler'},{k:'coach',t:'Coach auf dem Platz'},{k:'mental',t:'Mentalitätsmonster'},{k:'joker',t:'Joker'},{k:'allround',t:'Allrounder'},{k:'jung',t:'Entwicklungspotenzial'},
  {k:'verl',t:'Verletzungsanfällig',w:1},{k:'karten',t:'Kartengefährdet',w:1},{k:'muffel',t:'Trainingsmuffel',w:1},{k:'unzuv',t:'Unzuverlässig',w:1},{k:'hitz',t:'Hitzkopf',w:1}];
const SB_TG={}; SB_TAGS.forEach(t=>SB_TG[t.k]=t);
const SB_FOOT={Rechts:'R',Links:'L','Beidfüßig':'B'};

/* ---------- Daten lesen / schreiben ---------- */
function sbSk(v){ return String(v||'').split(',').map(x=>x.trim()).filter(Boolean).map(x=>({k:x.replace(/\+$/,''),plus:/\+$/.test(x)})).filter(x=>SB_SK[x.k]); }
function sbCh(v){ const a=String(v||'').split(',').map(Number), o={}; SB_CHAR.forEach((c,i)=>{ const n=a[i]; o[c.k]=n>=1&&n<=5?n:0; }); return o; }
function sbOf(p){ const C=crmOf(p);
  return { foot:p.fuss||null, wf:(+C.wf>=1&&+C.wf<=5)?+C.wf:0, rol:SB_ROLE[C.rol]?C.rol:'', sk:sbSk(C.sk), ch:sbCh(C.ch),
    tg:String(C.tg||'').split(',').filter(k=>SB_TG[k]), sts:String(C.sts||''), sws:String(C.sws||'') }; }
function sbHas(b){ return !!(b.rol||b.sk.length||b.wf||b.tg.length||b.sts||b.sws||Object.values(b.ch).some(Boolean)); }
function sbCanEdit(){ return canWriteField('sk'); }
function sbStars(n,max){ let s=''; for(let i=1;i<=(max||5);i++)s+=`<i class="${i<=n?'on':''}">★</i>`; return `<span class="sbstars">${s}</span>`; }
function sbHex(s,plus,size){ const S=SB_SK[s]; return `<span class="sbhex${plus?' plus':''}${size?' '+size:''}" title="${svEsc(S.t+(plus?'+ (herausragend)':'')+' – '+S.d)}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${SB_IC[s]||''}</svg>${plus?'<b>+</b>':''}</span>`; }
function sbFootChip(p){ const f=SB_FOOT[p.fuss]; return f?`<span class="sbfoot f-${f}" title="Starker Fuß: ${svEsc(p.fuss)}">${f}</span>`:''; }
function sbEye(p){ const s=p.scout||{}; const keys=['tempo','technik','zweikampf','spielint','mentalitaet']; const vals=keys.map(k=>+s[k]||5); return vals.every(v=>v===5)?null:vals; }

/* ---------- Spielerkarte im Profil ---------- */
function sbProfile(pid){
  const M=document.getElementById('modal'), p=players.find(x=>x.id===pid); if(!M||!p||M.querySelector('.sbwrap'))return;
  const anchor=M.querySelector('.svpos-box')||M.querySelector('.mhead'); if(!anchor)return;
  const b=sbOf(p), sc=scores(p), ov=Math.round(sc.total), R=SB_ROLE[b.rol], eye=sbEye(p), ed=sbCanEdit();
  const attrs=[['TEM',eye&&eye[0]*10],['TEC',eye&&eye[1]*10],['ZWK',eye&&eye[2]*10],['SPI',eye&&eye[3]*10],['MEN',eye&&eye[4]*10],['FLE',b.ch.fleiss?b.ch.fleiss*20:null],['LAU',b.ch.lauf?b.ch.lauf*20:null],['TEA',b.ch.team?b.ch.team*20:null]].filter(a=>a[1]).map(([k,v])=>[k,Math.min(99,v)]).slice(0,6);
  const el=document.createElement('div'); el.className='sbwrap';
  const tier=ov>=72?'t-elite':ov>=60?'t-gold':ov>=48?'t-silver':'t-bronze';
  const chars=SB_CHAR.filter(c=>b.ch[c.k]);
  el.innerHTML=`<div class="sbcard ${tier}">
      <div class="sbc-top"><div class="sbc-ovr">${ov}<span>${svEsc(p.pos||'–')}</span></div>
        <div class="sbc-foot">${b.foot?`<b>${svEsc(SB_FOOT[b.foot]||'')}</b><small>${svEsc(b.foot)}</small>`:'<small>Fuß ?</small>'}${b.wf?`<div title="Schwacher Fuß">${sbStars(b.wf)}</div>`:''}</div></div>
      <div class="sbc-name">${svEsc(p.name)}</div>
      <div class="sbc-role">${R?svEsc(R.t):'Rolle noch offen'}${R?`<small>${svEsc(R.fc)}</small>`:''}</div>
      ${attrs.length?`<div class="sbc-attrs">${attrs.map(([k,v])=>`<div><b>${v}</b><span>${k}</span></div>`).join('')}</div>`:`<div class="sbc-attrs empty">Eye-Test und Charakter noch nicht bewertet</div>`}
      ${b.sk.length?`<div class="sbc-sk">${b.sk.slice(0,4).map(x=>sbHex(x.k,x.plus,'sm')).join('')}</div>`:''}
    </div>
    <div class="sbside">
      ${b.sk.length?`<div class="sbblk"><h5>Special Skills</h5><div class="sbsklist">${b.sk.map(x=>`<div class="sbsk">${sbHex(x.k,x.plus)}<div><b>${svEsc(SB_SK[x.k].t)}${x.plus?' <em>+</em>':''}</b><span>${svEsc(SB_SK[x.k].d)}</span></div></div>`).join('')}</div></div>`:''}
      ${chars.length?`<div class="sbblk"><h5>Charakter &amp; Training</h5>${chars.map(c=>`<div class="sbbar"><span>${svEsc(c.t)}</span><i><u style="width:${b.ch[c.k]*20}%" class="v${b.ch[c.k]}"></u></i><b>${b.ch[c.k]}</b></div>`).join('')}</div>`:''}
      ${b.tg.length?`<div class="sbblk sbtags">${b.tg.map(k=>`<span class="sbtag${SB_TG[k].w?' warn':''}">${svEsc(SB_TG[k].t)}</span>`).join('')}</div>`:''}
      ${b.sts||b.sws?`<div class="sbblk sbnotes">${b.sts?`<p><b class="ok">Stärken</b> ${svEsc(b.sts)}</p>`:''}${b.sws?`<p><b class="bad">Schwächen</b> ${svEsc(b.sws)}</p>`:''}</div>`:''}
      ${!sbHas(b)?`<div class="sbempty">${ed?'Noch kein Spielerbogen. Rolle, Special Skills, Fuß und Charakter in einer Minute anlegen.':'Für diesen Spieler gibt es noch keinen Spielerbogen.'}</div>`:''}
      ${ed?`<button class="btn ${sbHas(b)?'ghost ':''}sm sbedit" type="button">${SVI('sliders')} ${sbHas(b)?'Spielerbogen bearbeiten':'Spielerbogen anlegen'}</button>`:''}
    </div>`;
  anchor.after(el);
  const bt=el.querySelector('.sbedit'); if(bt)bt.onclick=()=>sbEditor(p.id);
}

/* ---------- Spielerbogen bearbeiten ---------- */
function sbEditor(pid){
  const p=players.find(x=>x.id===pid); if(!p||!sbCanEdit())return;
  const b0=sbOf(p), st={foot:b0.foot, wf:b0.wf, rol:b0.rol, sk:Object.fromEntries(b0.sk.map(x=>[x.k,x.plus?2:1])), ch:{...b0.ch}, tg:new Set(b0.tg), sts:b0.sts, sws:b0.sws};
  const isTW=p.pos==='TW', posList=[p.pos,...(p.pos2||[])].filter((x,i,a)=>x&&SB_ROLES[x]&&a.indexOf(x)===i);
  const M=svModal(`<div class="mhead" style="gap:14px">${avaHtml(p)}<div><h2 style="margin:0">Spielerbogen</h2><div class="msub">${svEsc(p.name)} · ${svEsc(p.pos||'–')}${(p.pos2||[]).length?' · kann auch '+svEsc(p.pos2.join(', ')):''}</div></div></div><div id="sbEd"></div>`);
  const draw=()=>{
    const E=document.getElementById('sbEd'); if(!E)return;
    E.innerHTML=`
    <section class="sbsec"><h4>Fuß</h4>
      <div class="sbseg">${['Rechts','Links','Beidfüßig'].map(f=>`<button type="button" data-foot="${f}" class="${st.foot===f?'on':''}">${f}</button>`).join('')}</div>
      <div class="sbwf"><span>Schwacher Fuß</span>${[1,2,3,4,5].map(n=>`<button type="button" data-wf="${n}" class="${n<=st.wf?'on':''}" aria-label="${n} Sterne">★</button>`).join('')}<small>${['nicht bewertet','kaum','schwach','ordentlich','stark','wie der starke'][st.wf]}</small></div>
      <p class="note">Gerade in der Innenverteidigung und auf den Außenbahnen wichtig: Linksfuß links, Rechtsfuß rechts.</p></section>
    <section class="sbsec"><h4>Spielerrolle <small>wie in EA FC</small></h4>
      ${posList.map(pos=>`<div class="sbrolegrp"><span class="lbl">${svEsc(pos)}</span><div class="chips">${SB_ROLES[pos].map(r=>`<button type="button" class="pchip role${st.rol===r.k?' on':''}" data-rol="${r.k}" title="${svEsc(r.fc)}">${svEsc(r.t)}</button>`).join('')}</div></div>`).join('')||'<p class="note">Erst eine Position festlegen.</p>'}
      ${st.rol&&SB_ROLE[st.rol]?`<p class="sbroled"><b>${svEsc(SB_ROLE[st.rol].t)}</b> <em>${svEsc(SB_ROLE[st.rol].fc)}</em> – ${svEsc(SB_ROLE[st.rol].d)}</p>`:''}</section>
    <section class="sbsec"><h4>Special Skills <small>1× tippen = hat er · 2× = herausragend (+)</small></h4>
      ${SB_GROUPS.filter(g=>isTW?(g==='Torwart'||g==='Passspiel'):g!=='Torwart').map(g=>`<div class="sbskgrp"><span class="lbl">${g}</span><div class="chips">${SB_SKILLS.filter(s=>s.g===g).map(s=>{ const v=st.sk[s.k]||0; return `<button type="button" class="sbskchip v${v}" data-sk="${s.k}" title="${svEsc(s.d+' · EA FC: '+s.fc)}">${sbHex(s.k,v===2,'xs')}<span>${svEsc(s.t)}</span></button>`; }).join('')}</div></div>`).join('')}</section>
    <section class="sbsec"><h4>Charakter &amp; Training <small>1 = schwach · 5 = top · nochmal tippen = leeren</small></h4>
      ${SB_CHAR.map(c=>`<div class="sbrate"><span>${c.t}</span><div>${[1,2,3,4,5].map(n=>`<button type="button" data-ch="${c.k}:${n}" class="${n<=st.ch[c.k]?'on v'+st.ch[c.k]:''}">${n}</button>`).join('')}</div></div>`).join('')}</section>
    <section class="sbsec"><h4>Charakter-Tags</h4><div class="chips">${SB_TAGS.map(t=>`<button type="button" class="pchip tag${t.w?' warn':''}${st.tg.has(t.k)?' on':''}" data-tg="${t.k}">${svEsc(t.t)}</button>`).join('')}</div></section>
    <section class="sbsec"><h4>Bemerkungen</h4>
      <div class="field"><label>Stärken</label><input id="sbSts" maxlength="160" value="${svEsc(st.sts)}" placeholder="z.B. Kopfballstark, gutes Timing, Führungsstimme"></div>
      <div class="field" style="margin-top:8px"><label>Schwächen</label><input id="sbSws" maxlength="160" value="${svEsc(st.sws)}" placeholder="z.B. langsam im Antritt, schwacher linker Fuß"></div></section>
    <div class="btnrow sbact"><button class="btn" type="button" id="sbSave">Für alle speichern</button><button class="btn ghost" type="button" id="sbCancel">Abbrechen</button></div>`;
    const keep=()=>{ const a=document.getElementById('sbSts'), c=document.getElementById('sbSws'); if(a)st.sts=a.value; if(c)st.sws=c.value; };
    E.querySelectorAll('[data-foot]').forEach(x=>x.onclick=()=>{ keep(); st.foot=st.foot===x.dataset.foot?null:x.dataset.foot; draw(); });
    E.querySelectorAll('[data-wf]').forEach(x=>x.onclick=()=>{ keep(); const n=+x.dataset.wf; st.wf=st.wf===n?0:n; draw(); });
    E.querySelectorAll('[data-rol]').forEach(x=>x.onclick=()=>{ keep(); st.rol=st.rol===x.dataset.rol?'':x.dataset.rol; draw(); });
    E.querySelectorAll('[data-sk]').forEach(x=>x.onclick=()=>{ keep(); const k=x.dataset.sk; st.sk[k]=((st.sk[k]||0)+1)%3; if(!st.sk[k])delete st.sk[k]; draw(); });
    E.querySelectorAll('[data-ch]').forEach(x=>x.onclick=()=>{ keep(); const [k,n]=x.dataset.ch.split(':'); st.ch[k]=st.ch[k]===+n?0:+n; draw(); });
    E.querySelectorAll('[data-tg]').forEach(x=>x.onclick=()=>{ keep(); const k=x.dataset.tg; if(st.tg.has(k))st.tg.delete(k); else st.tg.add(k); draw(); });
    document.getElementById('sbCancel').onclick=()=>openModal(p.id);
    document.getElementById('sbSave').onclick=()=>{ keep(); sbSave(p,b0,st); };
  };
  draw();
}
function sbSave(p,b0,st){
  const u={};
  const sk=SB_SKILLS.map(s=>s.k).filter(k=>st.sk[k]).map(k=>k+(st.sk[k]===2?'+':'')).join(',');
  const skOld=b0.sk.map(x=>x.k+(x.plus?'+':'')).sort().join(','); if(sk.split(',').filter(Boolean).sort().join(',')!==skOld)u.sk=sk||undefined;
  if((st.foot||null)!==(b0.foot||null))u.fu=st.foot||undefined;
  if(st.wf!==b0.wf)u.wf=st.wf||undefined;
  if(st.rol!==b0.rol)u.rol=st.rol||undefined;
  const ch=SB_CHAR.map(c=>st.ch[c.k]||0).join(','), chOld=SB_CHAR.map(c=>b0.ch[c.k]||0).join(','); if(ch!==chOld)u.ch=/[1-5]/.test(ch)?ch:undefined;
  const tg=SB_TAGS.map(t=>t.k).filter(k=>st.tg.has(k)).join(','); if(tg!==b0.tg.slice().sort((a,b)=>SB_TAGS.findIndex(t=>t.k===a)-SB_TAGS.findIndex(t=>t.k===b)).join(','))u.tg=tg||undefined;
  const sts=st.sts.trim().slice(0,160), sws=st.sws.trim().slice(0,160); if(sts!==b0.sts)u.sts=sts||undefined; if(sws!==b0.sws)u.sws=sws||undefined;
  if(!Object.keys(u).length){ openModal(p.id); kToast('Keine Änderung'); return; }
  crmSet(p.id,u); try{crmApply();}catch(e){} try{renderAll();}catch(e){} openModal(p.id);
  kToast('✓ Spielerbogen von '+p.name+' für alle gespeichert');
}
{ const _om3=openModal; openModal=function(){ const r=_om3.apply(this,arguments); try{ sbProfile(arguments[0]); }catch(e){ console.warn('Spielerbogen',e); } return r; }; }

/* ---------- Aufstellung: Positions-Check, Fuß, automatisch sortieren ---------- */
function sbSlotSide(x){ return x<35?'L':x>65?'R':'Z'; }
function sbSlotScore(p,slot){
  const [role,x]=slot, want=ROLE2POS[role];
  if(role==='TW')return p.pos==='TW'?1000:-1000;
  if(p.pos==='TW')return -1000;
  const F=posFit(p,want); let s=F?F.lvl*100:-80;
  const side=sbSlotSide(x), f=SB_FOOT[p.fuss];
  if(f&&side!=='Z'&&(want==='IV'||want==='AV'||want==='Flügel')){ if(f===side)s+=14; else if(f==='B')s+=8; else s-=6; }
  return s;
}
function sbFitInfo(p,slot){
  const want=ROLE2POS[slot[0]], F=slot[0]==='TW'?(p.pos==='TW'?{lvl:2}:null):posFit(p,want);
  const side=sbSlotSide(slot[1]), f=SB_FOOT[p.fuss];
  const footWarn=f&&side!=='Z'&&(want==='IV'||want==='AV'||want==='Flügel')&&f!=='B'&&f!==side;
  const cls=!F?'bad':F.lvl>=2?'ok':F.lvl>=1.5?'neben':F.lvl>=1?'mid':'weak';
  return {F,cls,footWarn,want};
}
{ const _lc=lineupCardHtml; lineupCardHtml=function(p,role,i){
    let h=_lc.apply(this,arguments);
    try{
      const foot=sbFootChip(p);
      if(i!=null){ const slot=FORMATIONS[LINEUP.formation][i]; const fi=sbFitInfo(p,slot);
        const t={ok:'Passt: Hauptposition',neben:'Passt: Nebenposition',mid:'Möglich: '+(p.pos||'?')+' auf '+fi.want,weak:'Nur zur Not: '+(p.pos||'?')+' auf '+fi.want,bad:'Passt nicht: '+(p.pos||'?')+' auf '+fi.want}[fi.cls]+(fi.footWarn?' · falscher Fuß für diese Seite':'');
        h=h.replace('<div class="ov">',`<span class="sbfit ${fi.cls}${fi.footWarn?' fw':''}" title="${svEsc(t)}"></span><div class="ov">`); }
      if(foot)h=h.replace(/<\/div>$/,foot+'</div>');
    }catch(e){}
    return h; }; }
function sbHungarian(a){ // Maximum-Zuordnung (n×n), klassischer Ungarischer Algorithmus
  const n=a.length, INF=1e15, u=Array(n+1).fill(0), v=Array(n+1).fill(0), pp=Array(n+1).fill(0), way=Array(n+1).fill(0);
  const cost=(i,j)=>-a[i][j];
  for(let i=1;i<=n;i++){ pp[0]=i; let j0=0; const minv=Array(n+1).fill(INF), used=Array(n+1).fill(false);
    do{ used[j0]=true; const i0=pp[j0]; let d=INF, j1=0;
      for(let j=1;j<=n;j++) if(!used[j]){ const cur=cost(i0-1,j-1)-u[i0]-v[j]; if(cur<minv[j]){minv[j]=cur;way[j]=j0;} if(minv[j]<d){d=minv[j];j1=j;} }
      for(let j=0;j<=n;j++){ if(used[j]){u[pp[j]]+=d;v[j]-=d;} else minv[j]-=d; }
      j0=j1; }while(pp[j0]!==0);
    do{ const j1=way[j0]; pp[j0]=pp[j1]; j0=j1; }while(j0); }
  const res=Array(n); for(let j=1;j<=n;j++)res[pp[j]-1]=j-1; return res; }
function sbOptimize(){
  if(!canEdit())return svDenied('Die Aufstellung ändern nur Kaderplaner.');
  const form=FORMATIONS[LINEUP.formation], idx=form.map((_,i)=>i).filter(i=>LINEUP.slots[i]);
  const ps=idx.map(i=>players.find(z=>z.id===LINEUP.slots[i])).filter(Boolean); if(ps.length!==idx.length||!ps.length)return;
  const mat=ps.map((p,pi)=>idx.map(si=>sbSlotScore(p,form[si])+(idx[pi]===si?3:0)));
  const asg=sbHungarian(mat), ns={}; let moved=0;
  ps.forEach((p,pi)=>{ const si=idx[asg[pi]]; ns[si]=p.id; if(si!==idx[pi])moved++; });
  if(!moved){ kToast('✓ Alle stehen schon auf der besten Position'); return; }
  LINEUP={formation:LINEUP.formation,slots:ns}; renderLineup();
  kToast('✓ Positionen sortiert – '+moved+' Spieler umgestellt');
}
function sbFitRow(){
  const host=document.getElementById('gapRow'); if(!host)return;
  let el=document.getElementById('sbFitRow'); if(!el){ el=document.createElement('div'); el.id='sbFitRow'; el.className='sbfitrow'; host.after(el); }
  const form=FORMATIONS[LINEUP.formation], issues=[], foot=[]; let n=0, ok=0, main=0;
  form.forEach((slot,i)=>{ const p=players.find(z=>z.id===LINEUP.slots[i]); if(!p)return; n++; const fi=sbFitInfo(p,slot);
    if(fi.cls==='bad'||fi.cls==='weak')issues.push(`<b>${svEsc(p.name.split(' ').slice(-1)[0])}</b> (${svEsc(p.pos||'?')}) als ${svEsc(slot[0])}`); else { ok++; if(fi.cls==='ok'||fi.cls==='neben')main++; }
    if(fi.footWarn)foot.push(`<b>${svEsc(p.name.split(' ').slice(-1)[0])}</b> (${svEsc(p.fuss)}) auf ${sbSlotSide(slot[1])==='L'?'links':'rechts'}`); });
  if(!n){ el.innerHTML=''; return; }
  const good=!issues.length&&!foot.length;
  el.innerHTML=`<div class="sbfitbox ${good?'good':'warn'}"><span class="sbfit-ic">${SVI(good?'check':'info')}</span>
    <div class="sbfit-t"><b>Positions-Check: ${ok}/${n} auf passender Position</b>${issues.length?`<span>Passt nicht: ${issues.join(' · ')}</span>`:''}${foot.length?`<span>Fuß/Seite: ${foot.join(' · ')}</span>`:''}${good?`<span>${main===ok?'Alle auf Haupt- oder Nebenposition':main+' auf Haupt-/Nebenposition, '+(ok-main)+' auf verwandter Position'} – realistisch aufgestellt. Grüner Punkt = Hauptposition, gelber = verwandte Position.</span>`:''}</div>
    ${canEdit()&&!good?`<button class="btn sm" id="sbOpt" type="button">${SVI('move')} Automatisch sortieren</button>`:''}</div>`;
  const b=document.getElementById('sbOpt'); if(b)b.onclick=sbOptimize;
}
{ const _rl=renderLineup; renderLineup=function(){ const r=_rl.apply(this,arguments); try{sbFitRow();}catch(e){ console.warn(e); } return r; }; }

/* ---------- Kader-Profil: Was haben wir, was fehlt? ---------- */
const SB_POSG=['TW','IV','AV','ZM','OM','Flügel','ST'];
let sbQ={pos:'',rol:'',sk:'',foot:'',kreis:'alle'}, sbQuickOpen=false;
function sbSquad(){ return players.filter(p=>p.own&&!p.isJugend&&!p.verzicht&&(p.kader===1||(p.kader==null&&!/\bII\b/.test(p.club||'')))); }
function sbGaps(sq){
  const G=[], by=pos=>sq.filter(p=>p.pos===pos), bogen=p=>sbOf(p), hasSk=(k,list)=>(list||sq).some(p=>bogen(p).sk.some(x=>x.k===k)), hasRole=(k,list)=>(list||sq).some(p=>bogen(p).rol===k);
  const iv=by('IV'), av=by('AV'), st=by('ST'), tw=by('TW');
  const rated=sq.filter(p=>sbHas(bogen(p))).length;
  if(tw.length<2)G.push({lvl:'hoch',t:'Nur '+tw.length+' Torwart im Kader',q:{pos:'TW'}});
  if(iv.length&&!iv.some(p=>p.fuss==='Links'||p.fuss==='Beidfüßig'))G.push({lvl:'hoch',t:'Kein Linksfuß in der Innenverteidigung'+(iv.some(p=>!p.fuss)?' (Fuß bei '+iv.filter(p=>!p.fuss).length+' IV noch offen)':''),q:{pos:'IV',foot:'Links'}});
  if(av.length<3)G.push({lvl:'mittel',t:'Nur '+av.length+' gelernte Außenverteidiger',q:{pos:'AV'}});
  if(av.length&&!av.some(p=>p.fuss==='Links'||p.fuss==='Beidfüßig'))G.push({lvl:'mittel',t:'Kein Linksfuß auf der Außenverteidiger-Position',q:{pos:'AV',foot:'Links'}});
  if(rated>=5){
    if(!hasRole('st-ziel',st)&&!hasSk('kopfball',st))G.push({lvl:'mittel',t:'Kein Zielspieler / kopfballstarker Stürmer',q:{pos:'ST',rol:'st-ziel'}});
    if(!hasSk('standard'))G.push({lvl:'mittel',t:'Kein Standardspezialist',q:{sk:'standard'}});
    if(sq.filter(p=>bogen(p).sk.some(x=>x.k==='tempo')).length<2)G.push({lvl:'mittel',t:'Wenig Tempo im Kader (unter 2 Spieler mit „Tempo“)',q:{sk:'tempo'}});
    if(!sq.some(p=>{const b=bogen(p); return b.tg.includes('leader')||b.ch.fuehr>=4;}))G.push({lvl:'mittel',t:'Kein ausgewiesener Führungsspieler',q:{}});
    if(!hasRole('zm-sechser')&&!hasSk('zweikampf',by('ZM')))G.push({lvl:'niedrig',t:'Kein echter Abräumer auf der Sechs',q:{pos:'ZM',rol:'zm-sechser'}});
    if(!hasSk('steilpass')&&!hasRole('om-spielmacher')&&!hasRole('zm-tief'))G.push({lvl:'niedrig',t:'Kein Spielmacher / tödlicher Pass',q:{sk:'steilpass'}});
  }
  return {G,rated};
}
function sbKaderRender(){
  const wrap=document.getElementById('kaderplanWrap'); if(!wrap)return;
  let el=document.getElementById('sbKader'); if(!el){ el=document.createElement('div'); el.id='sbKader'; wrap.parentNode.insertBefore(el,wrap); }
  const sq=sbSquad(), {G,rated}=sbGaps(sq), ed=sbCanEdit();
  const avg=k=>{ const v=sq.map(p=>sbOf(p).ch[k]).filter(Boolean); return v.length?(v.reduce((a,b)=>a+b,0)/v.length):0; };
  const grp=SB_POSG.map(pos=>{ const L=sq.filter(p=>p.pos===pos).sort((a,b)=>scores(b).total-scores(a).total);
    const feet={R:0,L:0,B:0,'?':0}; L.forEach(p=>feet[SB_FOOT[p.fuss]||'?']++);
    return `<div class="sbpg"><div class="sbpg-h"><b>${pos}</b><span>${L.length}</span></div>
      <div class="sbpg-f">${feet.R?`<i class="f-R">${feet.R}× R</i>`:''}${feet.L?`<i class="f-L">${feet.L}× L</i>`:''}${feet.B?`<i class="f-B">${feet.B}× B</i>`:''}${feet['?']?`<i>${feet['?']}× ?</i>`:''}</div>
      <div class="sbpg-l">${L.map(p=>{ const b=sbOf(p), R=SB_ROLE[b.rol]; return `<div class="sbpl" data-svp="${svEsc(p.id)}"><span class="sbpl-n">${svEsc(p.name)}</span>${sbFootChip(p)}${R?`<em>${svEsc(R.t)}</em>`:''}<span class="sbpl-sk">${b.sk.slice(0,3).map(x=>sbHex(x.k,x.plus,'xs')).join('')}</span></div>`; }).join('')||'<div class="note">—</div>'}</div></div>`; }).join('');
  const rolesAll=Object.values(SB_ROLES).flat();
  const res=sbSearch();
  el.innerHTML=`<div class="card sbkader">
    <div class="adm-head"><div><h3 style="margin:0;display:flex;gap:8px;align-items:center">${SVI('layers')} Kader-Profil 26/27</h3>
      <p style="margin:6px 0 0;font-size:13.5px">Rollen, Special Skills, Fuß und Charakter der Ersten – wie im Karrieremodus. So seht ihr, welche Typen fehlen, und sucht gezielt danach.</p></div>
      <div class="adm-stats"><div class="adm-stat"><b>${sq.length}</b><span>im Kader</span></div><div class="adm-stat"><b>${rated}</b><span>mit Spielerbogen</span></div><div class="adm-stat"><b>${sq.filter(p=>p.fuss).length}</b><span>Fuß bekannt</span></div></div></div>
    ${rated<sq.length?`<div class="sbhint">${SVI('info')}<span><b>${sq.length-rated} Spieler</b> haben noch keinen Spielerbogen, bei <b>${sq.length-sq.filter(p=>p.fuss).length}</b> fehlt der starke Fuß. Öffentlich steht das nirgends – am schnellsten geht es unten mit der <b>Schnell-Erfassung</b>.</span></div>`:''}
    <div class="sbsub">Was uns fehlt</div>
    <div class="sbgaps">${G.length?G.map((g,i)=>`<button class="sbgap l-${g.lvl==='hoch'?'h':g.lvl==='mittel'?'m':'n'}" data-gap="${i}"><span>${svEsc(g.t)}</span><em>Passende suchen →</em></button>`).join(''):`<div class="note">${rated>=5?'Keine offensichtlichen Lücken – stark!':'Sobald mindestens 5 Spielerbögen angelegt sind, zeigt die App hier auch fehlende Rollen und Skills.'}</div>`}</div>
    ${rated?`<div class="sbsub">Charakter der Mannschaft (Ø)</div><div class="sbteamch">${SB_CHAR.map(c=>{ const a=avg(c.k); return `<div class="sbbar"><span>${c.t}</span><i><u style="width:${a*20}%" class="v${Math.round(a)}"></u></i><b>${a?a.toFixed(1):'–'}</b></div>`; }).join('')}</div>`:''}
    <div class="sbsub">Kader nach Positionen</div>
    <div class="sbpgrid">${grp}</div>
    <div class="sbsub" id="sbSearchAnchor">Profil-Suche</div>
    <div class="sbsearch">
      <select id="sbQpos"><option value="">Alle Positionen</option>${SB_POSG.map(p=>`<option${sbQ.pos===p?' selected':''}>${p}</option>`).join('')}</select>
      <select id="sbQrol"><option value="">Jede Rolle</option>${(sbQ.pos?SB_ROLES[sbQ.pos]:rolesAll).map(r=>`<option value="${r.k}"${sbQ.rol===r.k?' selected':''}>${svEsc(r.t)}</option>`).join('')}</select>
      <select id="sbQsk"><option value="">Jeder Skill</option>${SB_SKILLS.map(s=>`<option value="${s.k}"${sbQ.sk===s.k?' selected':''}>${svEsc(s.t)}</option>`).join('')}</select>
      <select id="sbQfoot"><option value="">Jeder Fuß</option>${['Rechts','Links','Beidfüßig'].map(f=>`<option${sbQ.foot===f?' selected':''}>${f}</option>`).join('')}</select>
      <select id="sbQkreis"><option value="alle"${sbQ.kreis==='alle'?' selected':''}>Alle Spieler</option><option value="eigene"${sbQ.kreis==='eigene'?' selected':''}>Nur eigene</option><option value="extern"${sbQ.kreis==='extern'?' selected':''}>Nur externe</option></select>
    </div>
    <div class="sbres">${res.html}</div>
    ${ed?`<div class="sbsub sbquick-h"><button type="button" id="sbQuickT" class="btn ghost sm">${SVI('updown')} Schnell-Erfassung: Fuß, Rolle &amp; Charakter für den ganzen Kader</button></div>${sbQuickOpen?sbQuick(sq):''}`:''}
  </div>`;
  el.querySelectorAll('[data-svp]').forEach(a=>a.onclick=()=>openModal(a.dataset.svp));
  el.querySelectorAll('[data-gap]').forEach(b=>b.onclick=()=>{ const g=G[+b.dataset.gap]; sbQ={pos:'',rol:'',sk:'',foot:'',kreis:'extern',...g.q}; sbKaderRender(); document.getElementById('sbSearchAnchor').scrollIntoView({behavior:'smooth',block:'start'}); });
  const on=(id,k)=>{ const s=document.getElementById(id); if(s)s.onchange=()=>{ sbQ[k]=s.value; if(k==='pos'&&sbQ.rol&&SB_ROLE[sbQ.rol]&&SB_ROLE[sbQ.rol].pos!==sbQ.pos)sbQ.rol=''; sbKaderRender(); }; };
  on('sbQpos','pos'); on('sbQrol','rol'); on('sbQsk','sk'); on('sbQfoot','foot'); on('sbQkreis','kreis');
  const qt=document.getElementById('sbQuickT'); if(qt)qt.onclick=()=>{ sbQuickOpen=!sbQuickOpen; sbKaderRender(); };
  el.querySelectorAll('[data-qf]').forEach(s=>s.onchange=()=>{ const [pid,f]=s.dataset.qf.split('|'); const p=players.find(x=>x.id===pid); if(!p)return;
    const u={};
    if(f==='fu')u.fu=s.value||undefined;
    else if(f==='wf')u.wf=s.value?+s.value:undefined;
    else if(f==='rol')u.rol=s.value||undefined;
    else { const b=sbOf(p); b.ch[f]=+s.value||0; const ch=SB_CHAR.map(c=>b.ch[c.k]||0).join(','); u.ch=/[1-5]/.test(ch)?ch:undefined; }
    crmSet(pid,u); try{crmApply();}catch(e){} kToast('✓ '+p.name+' gespeichert'); });
}
function sbSearch(){
  const q=sbQ, active=q.pos||q.rol||q.sk||q.foot;
  if(!active)return {html:'<div class="note">Position, Rolle, Skill oder Fuß wählen – z.B. „IV + Linksfuß“ oder „ST + Kopfballstark“.</div>'};
  let L=players.filter(p=>!p.isJugend&&(q.kreis==='eigene'?p.own:q.kreis==='extern'?!p.own:true));
  if(q.pos)L=L.filter(p=>p.pos===q.pos||(p.pos2||[]).includes(q.pos));
  if(q.foot)L=L.filter(p=>p.fuss===q.foot||(q.foot!=='Beidfüßig'&&p.fuss==='Beidfüßig'));
  if(q.rol)L=L.filter(p=>sbOf(p).rol===q.rol);
  if(q.sk)L=L.filter(p=>sbOf(p).sk.some(x=>x.k===q.sk));
  L=L.map(p=>({p,s:scores(p).total})).sort((a,b)=>b.s-a.s);
  const unknownFoot=q.foot&&!L.length?players.filter(p=>!p.isJugend&&(!q.pos||p.pos===q.pos)&&!p.fuss&&(q.kreis==='eigene'?p.own:q.kreis==='extern'?!p.own:true)).length:0;
  if(!L.length)return {html:`<div class="note">Kein Spieler mit diesem Profil erfasst.${unknownFoot?' Bei '+unknownFoot+' passenden Spielern ist der Fuß noch unbekannt – Spielerbögen für Kandidaten anlegen, dann tauchen sie hier auf.':' Rollen und Skills gibt es nur für Spieler mit Spielerbogen.'}</div>`};
  return {html:`<div class="sbresl">${L.slice(0,40).map(({p,s})=>{ const b=sbOf(p), R=SB_ROLE[b.rol]; return `<div class="sbri" data-svp="${svEsc(p.id)}">${avaHtml(p)}<div class="sbri-n"><b>${svEsc(p.name)}</b><span>${svEsc(p.club||'')} · ${svEsc(p.pos||'–')}${R?' · '+svEsc(R.t):''}</span></div>${sbFootChip(p)}<span class="sbri-sk">${b.sk.slice(0,3).map(x=>sbHex(x.k,x.plus,'xs')).join('')}</span><span class="sbri-s" style="color:${tierColor(s)}">${Math.round(s)}</span></div>`; }).join('')}</div>${L.length>40?`<div class="note">… und ${L.length-40} weitere</div>`:''}`};
}
function sbQuick(sq){
  const L=sq.slice().sort((a,b)=>SB_POSG.indexOf(a.pos)-SB_POSG.indexOf(b.pos)||a.name.localeCompare(b.name,'de'));
  const opt=(arr,cur)=>arr.map(([v,t])=>`<option value="${svEsc(v)}"${String(cur)===String(v)?' selected':''}>${svEsc(t)}</option>`).join('');
  return `<div class="sbquick"><div class="note" style="margin-bottom:8px">Jede Änderung wird sofort für alle gespeichert. Details (Skills, Tags, Bemerkungen) im Spielerprofil unter „Spielerbogen“.</div><div class="sbqt">
    <div class="sbqr sbqhead"><span>Spieler</span><span>Fuß</span><span>Schw. Fuß</span><span>Rolle</span><span>Fleiß</span><span>Laufst.</span><span>Teamg.</span></div>
    ${L.map(p=>{ const b=sbOf(p), roles=SB_ROLES[p.pos]||[]; const r15=[['','–'],[1,'1'],[2,'2'],[3,'3'],[4,'4'],[5,'5']];
      return `<div class="sbqr"><span class="sbqn" data-svp="${svEsc(p.id)}"><b>${svEsc(p.name)}</b><em>${svEsc(p.pos||'–')}</em></span>
        <select data-qf="${svEsc(p.id)}|fu" aria-label="Fuß">${opt([['','?'],['Rechts','Rechts'],['Links','Links'],['Beidfüßig','Beidf.']],p.fuss||'')}</select>
        <select data-qf="${svEsc(p.id)}|wf" aria-label="Schwacher Fuß">${opt([['','–'],[1,'★'],[2,'★★'],[3,'★★★'],[4,'★★★★'],[5,'★★★★★']],b.wf||'')}</select>
        <select data-qf="${svEsc(p.id)}|rol" aria-label="Rolle">${opt([['','–'],...roles.map(r=>[r.k,r.t])],b.rol)}</select>
        <select data-qf="${svEsc(p.id)}|fleiss" aria-label="Trainingsfleiß">${opt(r15,b.ch.fleiss||'')}</select>
        <select data-qf="${svEsc(p.id)}|lauf" aria-label="Laufstärke">${opt(r15,b.ch.lauf||'')}</select>
        <select data-qf="${svEsc(p.id)}|team" aria-label="Teamgeist">${opt(r15,b.ch.team||'')}</select></div>`; }).join('')}</div></div>`;
}
{ const _rkp=renderKaderplan; renderKaderplan=function(){ const r=_rkp.apply(this,arguments); try{ if(!crmIsTyping())sbKaderRender(); }catch(e){ console.warn('Kader-Profil',e); } return r; }; }

/* =====================================================================
   SV/BSC Scout · Trainings-Kern (läuft in der App UND im Erinnerungs-/Co-Trainer-Dienst)
   - Kennzahlen je Spieler & Team, Tendenz-Warnungen, einfacher Sprach-/Text-Parser
   ===================================================================== */
const TRC=(function(){
  const REASONS={verletzt:'Verletzt',krank:'Krank',arbeit:'Arbeit/Schicht',urlaub:'Urlaub',uni:'Schule/Uni',familie:'Familie',zweite:'In der Zweiten',privat:'Privat',ohne:'Ohne Grund'};
  const EXCUSE_NEUTRAL={verletzt:1,krank:1,zweite:1};          // zählen nicht gegen die Beteiligung
  const FOKUS={lauf:'Laufintensiv',athletik:'Athletik/Kraft',taktik:'Taktik',technik:'Technik',spielform:'Spielformen',abschluss:'Torabschluss',standards:'Standards',umschalt:'Umschalten',regeneration:'Regeneration',torwart:'Torwarttraining'};
  const ART={muskel:'Muskel',band:'Bänder/Sehnen',knochen:'Knochen',gelenk:'Gelenk/Meniskus',prellung:'Prellung',krankheit:'Krankheit',sonstiges:'Sonstiges'};
  const DAY=86400000;
  const iso=d=>{ const x=new Date(d); return x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')+'-'+String(x.getDate()).padStart(2,'0'); };
  const addDays=(s,n)=>iso(new Date(new Date(s+'T12:00:00').getTime()+n*DAY));
  const diffDays=(a,b)=>Math.round((new Date(a+'T12:00:00')-new Date(b+'T12:00:00'))/DAY);
  const fmt=s=>{ if(!s)return ''; const [y,m,d]=String(s).split('-'); return d+'.'+m+'.'; };
  const trainings=st=>(st&&st.sessions||[]).filter(s=>s.t==='training');
  function rows(st,pid){ const out=[]; for(const s of trainings(st)){ for(const a of s.a||[]){ if(a[0]===pid){ out.push({d:s.d,st:a[1],g:a[2],mot:a[3],fit:a[4],n:a[5]}); break; } } } return out.sort((x,y)=>x.d<y.d?1:-1); }
  function rate(list){ const c=list.filter(r=>!(r.st==='weg'&&EXCUSE_NEUTRAL[r.g])); if(!c.length)return null; return c.filter(r=>r.st!=='weg').length/c.length; }
  function activeInjury(st,pid,today){ return (st&&st.injuries||[]).find(i=>i.p===pid&&!i.z&&i.b<=today)||null; }
  function playerStats(st,pid,today){
    const R=rows(st,pid), w=(a,b)=>R.filter(r=>{ const dd=diffDays(today,r.d); return dd>=a&&dd<b; });
    const r28=w(0,28), rPrev=w(28,84), rSeason=w(0,365);
    const mot=R.filter(r=>r.mot).map(r=>({d:r.d,v:r.mot})), fit=R.filter(r=>r.fit).map(r=>({d:r.d,v:r.fit}));
    const seen=R.find(r=>r.st!=='weg');
    let streak=0; for(const r of R){ if(r.st==='weg'&&!EXCUSE_NEUTRAL[r.g])streak++; else break; }
    const inj=(st&&st.injuries||[]).filter(i=>i.p===pid);
    return { n28:r28.length, rate28:rate(r28), ratePrev:rate(rPrev), rateSeason:rate(rSeason), da28:r28.filter(r=>r.st!=='weg').length,
      ohne28:r28.filter(r=>r.st==='weg'&&r.g==='ohne').length, spaet28:r28.filter(r=>r.st==='spaet').length,
      mot, fit, lastSeen:seen?seen.d:null, streak, rows:R, injury:activeInjury(st,pid,today), injuries:inj,
      inj12:inj.filter(i=>diffDays(today,i.b)<=365).length };
  }
  function teamStats(st,today,squadIds){
    const S=trainings(st), set=squadIds?new Set(squadIds):null;
    const win=(a,b)=>{ let da=0,n=0,cnt=0; for(const s of S){ const dd=diffDays(today,s.d); if(dd<a||dd>=b)continue; cnt++; for(const x of s.a||[]){ if(set&&!set.has(x[0]))continue; if(x[1]==='weg'&&EXCUSE_NEUTRAL[x[2]])continue; n++; if(x[1]!=='weg')da++; } } return {rate:n?da/n:null,sessions:cnt}; };
    const weeks=[]; for(let k=11;k>=0;k--){ const w=win(k*7,k*7+7); weeks.push({from:addDays(today,-k*7-6),rate:w.rate,sessions:w.sessions}); }
    const perSession=S.slice(0,12).map(s=>({d:s.d,da:(s.a||[]).filter(x=>x[1]!=='weg'&&(!set||set.has(x[0]))).length}));
    return {r21:win(0,21),prev:win(21,63),r28:win(0,28),season:win(0,365),weeks,perSession};
  }
  const pct=v=>v==null?'–':Math.round(v*100)+' %';
  function avg(a){ return a.length?a.reduce((x,y)=>x+y,0)/a.length:null; }
  /* Tendenz-Warnungen: [{key, lvl:'hoch'|'mittel'|'info', pid, t (Titel), d (Details), ask:{…} (Rückfrage)}] */
  function alerts(st,squad,today){
    const out=[], name=p=>p.name;
    for(const p of squad){
      const s=playerStats(st,p.id,today);
      if(s.injury){
        const i=s.injury;
        if(i.pr&&i.pr<today)out.push({key:'inj-over:'+i.id,lvl:'mittel',pid:p.id,t:`Ist ${name(p)} wieder fit?`,d:`${i.dg} seit ${fmt(i.b)} – Prognose war ${fmt(i.pr)}`,ask:{type:'fit',injury:i.id}});
        const back=s.rows.find(r=>r.st!=='weg'&&r.d>i.b);
        if(back)out.push({key:'inj-back:'+i.id,lvl:'info',pid:p.id,t:`${name(p)} war wieder im Training`,d:`Am ${fmt(back.d)} dabei – Verletzung (${i.dg}) als ausgeheilt abschließen?`,ask:{type:'close',injury:i.id,date:back.d}});
        continue;                                                  // Verletzte nicht zusätzlich wegen Beteiligung warnen
      }
      if(s.ohne28>=2)out.push({key:'ohne:'+p.id+':'+s.ohne28,lvl:'hoch',pid:p.id,t:`${name(p)} fehlt ohne Grund`,d:`${s.ohne28}× unentschuldigt in den letzten 4 Wochen – Gespräch suchen?`});
      else if(s.streak>=3)out.push({key:'streak:'+p.id+':'+s.streak,lvl:'hoch',pid:p.id,t:`${name(p)} war ${s.streak}× in Folge nicht da`,d:`Zuletzt im Training: ${s.lastSeen?fmt(s.lastSeen):'unbekannt'}.`});
      if(s.rate28!=null&&s.ratePrev!=null&&s.n28>=3&&s.ratePrev-s.rate28>=0.25&&s.rate28<0.7)
        out.push({key:'drop:'+p.id+':'+Math.round(s.rate28*10),lvl:'mittel',pid:p.id,t:`Trainingsbeteiligung von ${name(p)} sinkt`,d:`${pct(s.ratePrev)} → ${pct(s.rate28)} (letzte 4 Wochen).`});
      const m3=s.mot.slice(0,3).map(x=>x.v), mPrev=s.mot.slice(3,8).map(x=>x.v);
      if(m3.length>=2&&avg(m3)<=2.3)out.push({key:'mot:'+p.id+':'+s.mot[0].d,lvl:'mittel',pid:p.id,t:`${name(p)} wirkt lustlos`,d:`Motivation zuletzt Ø ${avg(m3).toFixed(1)} von 5.`});
      else if(m3.length>=2&&mPrev.length>=2&&avg(mPrev)-avg(m3)>=1.2)out.push({key:'motd:'+p.id+':'+s.mot[0].d,lvl:'info',pid:p.id,t:`Motivation von ${name(p)} lässt nach`,d:`Ø ${avg(mPrev).toFixed(1)} → ${avg(m3).toFixed(1)}.`});
      const f2=s.fit.slice(0,2).map(x=>x.v);
      if(f2.length===2&&avg(f2)<=2)out.push({key:'fit:'+p.id+':'+s.fit[0].d,lvl:'info',pid:p.id,t:`${name(p)} wirkt platt`,d:`Fitness zuletzt ${f2.join(' / ')} von 5 – Belastung steuern.`});
      if(s.inj12>=3)out.push({key:'injmany:'+p.id+':'+s.inj12,lvl:'info',pid:p.id,t:`${name(p)}: ${s.inj12} Verletzungen in 12 Monaten`,d:`Verletzungsanfällig – Belastung und Prävention im Blick behalten.`});
    }
    const T=teamStats(st,today,squad.map(p=>p.id));
    if(T.r21.rate!=null&&T.prev.rate!=null&&T.r21.sessions>=3&&T.prev.rate-T.r21.rate>=0.12)
      out.push({key:'team:'+Math.round(T.r21.rate*20),lvl:'hoch',pid:null,t:'Trainingsbeteiligung im Team sinkt',d:`${pct(T.prev.rate)} → ${pct(T.r21.rate)} in den letzten 3 Wochen.`});
    const order={hoch:0,mittel:1,info:2}; return out.sort((a,b)=>order[a.lvl]-order[b.lvl]);
  }

  /* ---------- Einfacher Text-Parser (ohne KI): „Max und Tim waren heute nicht da, Tom verletzt (Zerrung, 3 Wochen)“ ---------- */
  const N=s=>String(s||'').toLowerCase().replace(/ä/g,'ae').replace(/ö/g,'oe').replace(/ü/g,'ue').replace(/ß/g,'ss').normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  const NUM={ein:1,eine:1,einen:1,zwei:2,drei:3,vier:4,fuenf:5,sechs:6,sieben:7,acht:8,neun:9,zehn:10,zwoelf:12};
  function nameIndex(squad){
    const first={}, last={}; squad.forEach(p=>{ const w=N(p.name).split(/\s+/).filter(Boolean); if(!w.length)return; (first[w[0]]=first[w[0]]||[]).push(p); const l=w[w.length-1]; (last[l]=last[l]||[]).push(p); });
    const idx=[]; squad.forEach(p=>{ const w=N(p.name).split(/\s+/).filter(Boolean); if(!w.length)return; idx.push({k:w.join(' '),p,len:3});
      const l=w[w.length-1]; if(last[l].length===1&&l.length>=3)idx.push({k:l,p,len:2}); if(first[w[0]].length===1&&w[0].length>=3)idx.push({k:w[0],p,len:1});
      (p.alias||[]).forEach(a=>{ const k=N(a); if(k.length>=3)idx.push({k,p,len:2}); }); });
    const out=idx.sort((a,b)=>b.k.length-a.k.length);
    out.ambig={}; Object.entries(last).forEach(([k,L])=>{ if(L.length>1&&k.length>=3)out.ambig[k]=L; }); Object.entries(first).forEach(([k,L])=>{ if(L.length>1&&k.length>=3)out.ambig[k]=(out.ambig[k]||[]).concat(L.filter(x=>!(out.ambig[k]||[]).includes(x))); });
    return out;
  }
  function ambiguous(text,idx,found){
    const t=' '+N(text).replace(/[^a-z0-9]+/g,' ')+' ', res=[];
    for(const [k,L] of Object.entries(idx.ambig||{})){ if(!t.includes(' '+k+' '))continue; if(L.some(p=>found.includes(p.id)&&t.includes(' '+N(p.name)+' ')))continue;
      const rest=L.filter(p=>!t.includes(' '+N(p.name)+' ')); if(rest.length>1)res.push({k,names:rest.map(p=>p.name)}); }
    return res;
  }
  function findPlayers(clause,idx){
    const hits=[]; let s=' '+clause.replace(/[^a-z0-9]+/g,' ')+' ';
    for(const e of idx){ const k=' '+e.k+' '; let pos=s.indexOf(k); while(pos>=0){ if(!hits.some(h=>h.p.id===e.p.id))hits.push({p:e.p,pos}); s=s.slice(0,pos)+' '+'#'.repeat(e.k.length)+' '+s.slice(pos+k.length); pos=s.indexOf(k); } }
    return hits.sort((a,b)=>a.pos-b.pos).map(h=>h.p);
  }
  function parseDate(t,today){
    if(/\bvorgestern\b/.test(t))return addDays(today,-2);
    if(/\bgestern\b/.test(t))return addDays(today,-1);
    const m=t.match(/\b(\d{1,2})\.(\d{1,2})\.?(\d{2,4})?/); if(m){ const y=m[3]?(m[3].length===2?'20'+m[3]:m[3]):today.slice(0,4); const d=`${y}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`; return d>today?`${+y-1}${d.slice(4)}`:d; }
    const wd={montag:1,dienstag:2,mittwoch:3,donnerstag:4,freitag:5,samstag:6,sonntag:0}; for(const k in wd){ if(new RegExp('\\b(am |letzten )?'+k+'\\b').test(t)){ let d=today; for(let i=0;i<7;i++){ if(new Date(d+'T12:00:00').getDay()===wd[k]&&!(i===0&&!/heute/.test(t)&&false))return d; d=addDays(d,-1); } } }
    return today;
  }
  function weeks(t){ const m=t.match(/(\d+|ein|eine|einen|zwei|drei|vier|fuenf|sechs|sieben|acht|neun|zehn|zwoelf)\s*(woche|wochen|tag|tage|tagen|monat|monate|monaten)/); if(!m)return null; const n=+m[1]||NUM[m[1]]||1; return /tag/.test(m[2])?n:/monat/.test(m[2])?n*30:n*7; }
  function injuryInfo(raw){
    const t=N(raw); let art='sonstiges';
    if(/zerrung|muskelfaser|faserriss|muskel|wade|oberschenkel|adduktor|leiste/.test(t))art='muskel';
    if(/band|baender|sehne|achilles|kreuzband|umgeknickt/.test(t))art='band';
    if(/bruch|gebrochen|fraktur|knochen/.test(t))art='knochen';
    if(/meniskus|knie|sprunggelenk|gelenk|schulter/.test(t)&&art==='sonstiges')art='gelenk';
    if(/prellung|pferdekuss|stauchung/.test(t))art='prellung';
    if(/krank|grippe|erkaelt|fieber|corona|infekt|magen/.test(t))art='krankheit';
    const bp=(t.match(/(oberschenkel|wade|knie|sprunggelenk|knoechel|leiste|adduktor|ruecken|schulter|fuss|zeh|hand|kopf|hueft|achilles|kreuzband|meniskus)/)||[])[1]||null;
    return {art,koerperteil:bp};
  }
  const INJ=/verletz|zerrung|faserriss|muskel|baender|bandriss|kreuzband|meniskus|umgeknickt|prellung|bruch|gebrochen|knie|sprunggelenk|leiste|adduktor|wade|oberschenkel|ruecken|schulter|achilles|pferdekuss/;
  function parse(text,squad,today,st){
    const t0=N(text), datum=parseDate(t0,today), idx=nameIndex(squad);
    const clauses=t0.split(/[.;!\n]+|,\s*(?=[a-z])/).map(s=>s.trim()).filter(Boolean);
    const sp={}, inj=[], close=[], session={}, found=new Set(); let restDa=/alle (anderen|weiteren|uebrigen)? ?(waren )?(da|dabei|anwesend)|sonst (waren )?alle da/.test(t0);
    let last=[];
    const set=(p,o)=>{ sp[p.id]=Object.assign(sp[p.id]||{player_id:p.id},o); found.add(p.id); };
    for(const c of clauses){
      let ps=findPlayers(c,idx); if(!ps.length&&/\b(er|der|ihn|sein)\b/.test(c))ps=last; if(ps.length)last=ps;
      const absent=/nicht da|nicht im training|nicht dabei|gefehlt|fehlt|fehlte|fehlen|abwesend|abgesagt|kam nicht|nicht gekommen|war nicht|waren nicht|nicht erschienen/.test(c);
      const late=/zu spaet|verspaetet|spaeter gekommen|kam spaet/.test(c);
      const back=/wieder fit|wieder dabei|wieder im training|zurueck im training|wieder mit trainiert|wieder voll/.test(c);
      let grund=null;
      if(INJ.test(c))grund='verletzt'; else if(/krank|grippe|erkaelt|fieber|infekt|magen/.test(c))grund='krank';
      else if(/arbeit|schicht|arbeiten|dienst|job/.test(c))grund='arbeit'; else if(/urlaub|verreist|ferien/.test(c))grund='urlaub';
      else if(/uni|schule|klausur|pruefung|studium/.test(c))grund='uni'; else if(/familie|hochzeit|geburtstag|beerdigung|taufe/.test(c))grund='familie';
      else if(/zweite|2\. mannschaft|reserve/.test(c))grund='zweite'; else if(/ohne grund|unentschuldigt|ohne absage|nicht abgemeldet|ohne abmeldung|keine absage|einfach nicht/.test(c))grund='ohne';
      else if(/privat|termin/.test(c))grund='privat';
      if(!ps.length&&grund&&last.length&&last.every(p=>sp[p.id]&&sp[p.id].status==='weg'))ps=last;   // „X war nicht da, hatte Schicht“
      let mot=null, fit=null;
      if(/lustlos|unmotiviert|kein bock|keinen bock|null bock|faul|desinteressiert|schlecht drauf|genervt/.test(c))mot=/sehr|total|komplett|null bock/.test(c)?1:2;
      else if(/super motiviert|sehr motiviert|voll dabei|brennt|ueberragend|herausragend|top einstellung/.test(c))mot=5;
      else if(/motiviert|engagiert|gut drauf|stark|gut trainiert|fleissig|guten eindruck/.test(c))mot=4;
      if(/muede|platt|kaputt|erschoepft|schwere beine|ausgelaugt|angeschlagen/.test(c))fit=/sehr|total|komplett/.test(c)?1:2;
      else if(/fit\b|frisch|spritzig|topfit/.test(c)&&!back)fit=4;
      if(ps.length){
        for(const p of ps){
          if(back){ set(p,{status:'da'}); const i=(st&&st.injuries||[]).find(x=>x.p===p.id&&!x.z); if(i)close.push({injury_id:i.id,player_id:p.id,zurueck:datum,diagnose:i.dg}); continue; }
          if(absent||(grund&&grund!=='verletzt')||(grund==='verletzt'&&!/trotzdem|trainiert|dabei/.test(c))){ if(absent||grund)set(p,{status:'weg',grund:grund||'ohne'}); }
          else if(late)set(p,{status:'spaet'});
          if(mot)set(p,Object.assign({motivation:mot},sp[p.id]&&sp[p.id].status?{}:{status:'da'}));
          if(fit)set(p,Object.assign({fitness:fit},sp[p.id]&&sp[p.id].status?{}:{status:'da'}));
          if(grund==='verletzt'&&INJ.test(c)&&!(st&&st.injuries||[]).some(x=>x.p===p.id&&!x.z)){
            const raw=text.split(/[.;!\n]+/).find(x=>N(x).includes(N(p.name).split(' ').pop())||N(x).includes(N(p.name).split(' ')[0]))||c;
            let dg=(raw.match(/:\s*([^,.;()]{3,60})/)||raw.match(/\(\s*([^,.;()]{3,60})/)||raw.match(/(?:wegen|mit|hat sich|hat)\s+(?:einer|einem|einen|eine|ein|der|dem|den|die)?\s*([^,.;()]{3,60})/i)||[])[1]||'';
            dg=dg.replace(/^(sich\s+)?(verletzt|verletzung)\s*/i,'').replace(/\s*(zugezogen|eingefangen|verletzt)$/i,'').trim();
            if(!dg||!INJ.test(N(dg))&&dg.length<4)dg='Verletzung';
            const I=injuryInfo(raw), w=weeks(N(raw));
            inj.push({player_id:p.id,diagnose:dg.trim().replace(/^\w/,x=>x.toUpperCase()),art:I.art,koerperteil:I.koerperteil,beginn:datum,prognose:w?addDays(datum,w):null});
          }
        }
      } else {
        if(/laufintensiv|viel gelaufen|laeufe|ausdauer/.test(c))(session.fokus=session.fokus||[]).push('lauf');
        if(/taktik/.test(c))(session.fokus=session.fokus||[]).push('taktik');
        if(/torschuss|abschluss/.test(c))(session.fokus=session.fokus||[]).push('abschluss');
        if(/standard/.test(c))(session.fokus=session.fokus||[]).push('standards');
        if(/spielform|abschlussspiel|kleinfeld/.test(c))(session.fokus=session.fokus||[]).push('spielform');
        if(/athletik|kraft|stabi/.test(c))(session.fokus=session.fokus||[]).push('athletik');
        if(/regeneration|auslaufen|locker/.test(c)){ (session.fokus=session.fokus||[]).push('regeneration'); session.intensitaet=2; }
        if(/sehr intensiv|hart|knackig|brutal/.test(c))session.intensitaet=5; else if(/intensiv|laufintensiv/.test(c)&&!session.intensitaet)session.intensitaet=4;
        if(/sehr positiv|super training|top training|richtig gut|klasse|starke einheit/.test(c))session.stimmung=5;
        else if(/positiv|gut|ordentlich|zufrieden/.test(c)&&!/nicht gut/.test(c))session.stimmung=session.stimmung||4;
        else if(/zaeh|schlecht|mies|lustlos|unkonzentriert|enttaeuschend/.test(c))session.stimmung=2;
      }
    }
    if(session.fokus)session.fokus=[...new Set(session.fokus)];
    const actions=[];
    const spieler=Object.values(sp);
    if(spieler.length||Object.keys(session).length||restDa)actions.push({type:'training',input:Object.assign({datum,typ:'training',spieler,rest_da:restDa||spieler.some(x=>x.status==='weg')},session)});
    inj.forEach(i=>actions.push({type:'verletzung',input:i}));
    close.forEach(c=>actions.push({type:'verletzung_ende',input:c}));
    return {datum,actions,found:[...found],ambig:ambiguous(text,idx,[...found])};
  }
  /* einfache Fragen ohne KI */
  function answer(text,squad,st,today){
    const t=N(text), idx=nameIndex(squad), ps=findPlayers(t,idx);
    if(ps.length&&/fit|verletz|dabei|wieder|zurueck|training/.test(t)){
      return ps.map(p=>{ const s=playerStats(st,p.id,today); const i=s.injury;
        if(i)return `${p.name}: verletzt seit ${fmt(i.b)} (${i.dg})${i.pr?', Prognose '+fmt(i.pr)+(i.pr<today?' – überschritten':''):''}. ${s.lastSeen&&s.lastSeen>i.b?'War am '+fmt(s.lastSeen)+' wieder im Training.':'Seitdem nicht im Training.'}`;
        const last=s.injuries.find(x=>x.z); return `${p.name}: aktuell keine offene Verletzung${last?' (zuletzt '+last.dg+', zurück am '+fmt(last.z)+')':''}. Zuletzt im Training: ${s.lastSeen?fmt(s.lastSeen):'–'}. Beteiligung 4 Wochen: ${pct(s.rate28)}.`; }).join('\n');
    }
    if(/wer .*verletzt|verletzte|lazarett/.test(t)){ const L=squad.map(p=>({p,i:activeInjury(st,p.id,today)})).filter(x=>x.i); return L.length?'Aktuell verletzt:\n'+L.map(x=>`• ${x.p.name}: ${x.i.dg}${x.i.pr?' (Prognose '+fmt(x.i.pr)+')':''}`).join('\n'):'Aktuell ist niemand als verletzt eingetragen.'; }
    if(/beteiligung|wie viele|anwesenheit/.test(t)){ const T=teamStats(st,today,squad.map(p=>p.id)); return `Trainingsbeteiligung: letzte 3 Wochen ${pct(T.r21.rate)} (${T.r21.sessions} Einheiten), davor ${pct(T.prev.rate)}. Saison: ${pct(T.season.rate)}.`; }
    return null;
  }
  return {REASONS,FOKUS,ART,EXCUSE_NEUTRAL,iso,addDays,diffDays,fmt,rows,playerStats,teamStats,alerts,parse,answer,activeInjury,pct,N,nameIndex,findPlayers,parseDate,ambiguous};
})();

/* ---------- Scores, Veranstaltungen, Spiele, Allzeit & Meilensteine (rein rechnerisch, ohne DOM) ---------- */
const TRS=(function(){
  const T=TRC;
  const ROLES={aufbau:'Aufbau',abbau:'Abbau',theke:'Theke/Bedienen',kasse:'Kasse',grill:'Grill',kuechen:'Küche/Kuchen',orga:'Organisation',fahrdienst:'Fahrdienst',teilnahme:'Teilnahme',sonstiges:'Sonstiges'};
  const EART={kerwe:'Kerwe',heimspiel:'Heimspiel-Dienst',weihnachten:'Weihnachtsmarkt/-feier',arbeitseinsatz:'Arbeitseinsatz',turnier:'Turnier/Hallencup',saisonfeier:'Saisonauftakt/-abschluss',mannschaft:'Mannschaftsabend/-fahrt',jugend:'Jugend-Event',sonstiges:'Sonstiges'};
  const HSTAT={geholfen:'geholfen',zugesagt:'zugesagt',abgesagt:'abgesagt',nicht_erschienen:'nicht erschienen'};
  const CREDIT={arbeit:0.7,uni:0.7,urlaub:0.7,familie:0.7,privat:0.4,ohne:0};
  const NUMW={ein:1,eine:1,einen:1,einmal:1,zwei:2,zweimal:2,doppelt:2,doppelpack:2,drei:3,dreimal:3,hattrick:3,dreierpack:3,vier:4,viermal:4,fuenf:5,sechs:6,sieben:7,acht:8,neun:9,zehn:10,zwoelf:12};
  const wHalf=(today,d,hl)=>Math.pow(0.5,Math.max(0,T.diffDays(today,d))/hl);
  const avg=a=>a.length?a.reduce((x,y)=>x+y,0)/a.length:null;
  const key=s=>T.N(s).replace(/[^a-z0-9]/g,'');

  /* ===== Trainings-Score (0–100) =====
     da = 1 · zu spät = 0,75 · entschuldigt (Arbeit, Uni, Urlaub, Familie) = 0,7 · privat = 0,4 · ohne Grund = 0
     verletzt, „in der Zweiten“ und längere Krankheit (≥ 2 Einheiten am Stück oder als Verletzung/Krankheit erfasst) zählen NICHT
     kurzfristig krank (einzelne Einheit) = 0,5 – gehäuft (≥ 3 in 90 Tagen) nur noch 0,2
     jüngere Einheiten zählen mehr (Halbwertszeit 45 Tage), Fenster 180 Tage; Motivation fließt zu 25 % ein */
  function trainingScore(st,pid,today){
    const R=T.rows(st,pid).filter(r=>{ const dd=T.diffDays(today,r.d); return dd>=0&&dd<=180; });
    const inj=(st&&st.injuries||[]).filter(i=>i.p===pid);
    const epi=new Map(); let cur=[];
    const flush=()=>{ if(cur.length){ const long=cur.length>=2||cur.some(r=>inj.some(i=>i.b<=r.d&&(!i.z||i.z>=r.d))); cur.forEach(r=>epi.set(r.d,long)); cur=[]; } };
    for(const r of [...R].reverse()){ if(r.st==='weg'&&r.g==='krank')cur.push(r); else if(r.st==='weg'&&r.g==='verletzt')continue; else flush(); }
    flush();
    const short90=R.filter(r=>r.st==='weg'&&r.g==='krank'&&!epi.get(r.d)&&T.diffDays(today,r.d)<=90).length;
    let sw=0, sa=0, n=0; const ex={verletzt:0,krank:0,zweite:0}, cnt={da:0,spaet:0,ohne:0,kurz:0,entsch:0};
    for(const r of R){
      let c;
      if(r.st==='da'){ c=1; cnt.da++; }
      else if(r.st==='spaet'){ c=0.75; cnt.spaet++; }
      else if(r.g==='verletzt'){ ex.verletzt++; continue; }
      else if(r.g==='zweite'){ ex.zweite++; continue; }
      else if(r.g==='krank'){ if(epi.get(r.d)){ ex.krank++; continue; } c=short90>=3?0.2:0.5; cnt.kurz++; }
      else { c=CREDIT[r.g]!=null?CREDIT[r.g]:0.5; if(r.g==='ohne')cnt.ohne++; else cnt.entsch++; }
      const w=wHalf(today,r.d,45); sw+=w; sa+=w*c; n++;
    }
    const mots=R.filter(r=>r.mot); let mw=0, ms=0; mots.forEach(r=>{ const w=wHalf(today,r.d,45); mw+=w; ms+=w*(r.mot-1)/4; });
    const att=sw?sa/sw:null, mot=mots.length>=2&&mw?ms/mw:null;
    const score=n>=4?Math.round(100*(mot==null?att:0.75*att+0.25*mot)):null;
    const why=[];
    if(n)why.push(`${cnt.da}× da${cnt.spaet?`, ${cnt.spaet}× zu spät`:''} – ${n} gewertete Einheiten (180 Tage)`);
    if(cnt.ohne)why.push(`${cnt.ohne}× ohne Grund gefehlt – zählt voll`);
    if(cnt.kurz)why.push(`${cnt.kurz}× kurzfristig krank${short90>=3?' – gehäuft, zählt deshalb stärker':' – zählt halb'}`);
    if(cnt.entsch)why.push(`${cnt.entsch}× entschuldigt (Arbeit, Uni, Urlaub, Familie) – zählt leicht`);
    if(ex.verletzt||ex.krank)why.push(`${ex.verletzt+ex.krank}× verletzt oder länger krank – zählt nicht`);
    if(ex.zweite)why.push(`${ex.zweite}× in der Zweiten – zählt nicht`);
    if(mot!=null)why.push(`Motivation Ø ${(1+mot*4).toFixed(1)} von 5 (25 % Gewicht)`);
    if(n<4)why.push('Noch zu wenig Einheiten für einen Score (mind. 4)');
    return {score,att,mot,n,cnt,ex,shortSick:short90,why};
  }

  /* ===== Spiele (aus den Einheiten vom Typ „Spiel“) ===== */
  const games=st=>(st&&st.sessions||[]).filter(s=>s.t==='spiel');
  function matchStats(st,pid,since){
    const o={sp:0,start:0,joker:0,tore:0,vor:0,s:0,u:0,n:0,zuNull:0,kader:0,zuschauer:0};
    for(const g of games(st)){ if(since&&g.d<=since)continue; const a=(g.a||[]).find(x=>x[0]===pid); if(!a||a[1]==='weg')continue;
      if(a[1]==='bank'){ o.kader++; continue; } if(a[1]==='zuschauer'){ o.zuschauer++; continue; }   // im Kader ohne Einsatz / zugeschaut – kein Einsatz
      o.sp++; if(a[1]==='da')o.start++; else o.joker++; o.tore+=a[6]||0; o.vor+=a[7]||0;
      if(g.tw!=null&&g.tg!=null){ if(g.tw>g.tg)o.s++; else if(g.tw===g.tg)o.u++; else o.n++; if(g.tg===0)o.zuNull++; } }
    return o;
  }
  function teamForm(st){
    const G=games(st).filter(g=>g.tw!=null&&g.tg!=null).sort((a,b)=>a.d<b.d?1:-1);
    const res=G.map(g=>g.tw>g.tg?'S':g.tw===g.tg?'U':'N');
    let unbeaten=0; for(const r of res){ if(r==='N')break; unbeaten++; }
    let wins=0; for(const r of res){ if(r!=='S')break; wins++; }
    let clean=0; for(const g of G){ if(g.tg!==0)break; clean++; }
    let winless=0; for(const r of res){ if(r==='S')break; winless++; }
    const pts=res.reduce((a,r)=>a+(r==='S'?3:r==='U'?1:0),0);
    return {n:G.length,res,unbeaten,wins,clean,winless,ppg:G.length?pts/G.length:null,tf:G.reduce((a,g)=>a+g.tw,0),ta:G.reduce((a,g)=>a+g.tg,0),last:G[0]||null};
  }
  /* Moneyball „Mit/Ohne“: Punkte pro Spiel und Gegentore mit dem Spieler in der Startelf vs. ohne ihn */
  function withWithout(st,pid){
    const W={n:0,p:0,ga:0}, O={n:0,p:0,ga:0};
    for(const g of games(st)){ if(g.tw==null||g.tg==null)continue; const a=(g.a||[]).find(x=>x[0]===pid); const B=a&&a[1]==='da'?W:O;
      B.n++; B.p+=g.tw>g.tg?3:g.tw===g.tg?1:0; B.ga+=g.tg; }
    const f=x=>x.n?{n:x.n,ppg:x.p/x.n,ga:x.ga/x.n}:{n:0,ppg:null,ga:null};
    const w=f(W), o=f(O);
    return {with:w,without:o,delta:w.n>=3&&o.n>=3?w.ppg-o.ppg:null};
  }

  /* ===== Loyalität (0–100) =====
     55 % Helfereinsätze (Aufbau, Theke, Kasse … – Stunden zählen mit, jüngere mehr; „nicht erschienen“ zieht ab)
     30 % Vereinstreue (Pflichtspiele seit 2013/14 laut Vereinsstatistik + diese Saison; 200 Spiele = voll)
     15 % Teamgeist (Mannschaftsabende, -fahrten, Feiern) */
  function loyaltyScore(pid,events,allTime,gamesSince,today){
    let pts=0, soc=0, n=0, hours=0, noShow=0, last=null; const arts={};
    for(const e of events||[]){
      const dd=T.diffDays(today,e.d); if(dd<0||dd>730)continue;
      const h=(e.h||[]).find(x=>x[0]===pid); if(!h)continue;
      const w=Math.pow(0.5,dd/365), st=h[3]||'geholfen', hrs=h[2]!=null&&h[2]!==''?+h[2]:null, rollen=h[1]||[];
      if(e.a==='mannschaft'||(rollen.length===1&&rollen[0]==='teilnahme')){ if(st==='geholfen')soc+=w; if(st==='nicht_erschienen')noShow++; continue; }
      if(st==='geholfen'){ pts+=w*(2+Math.min(hrs==null?3:hrs,10)*0.5); n++; hours+=hrs||0; arts[e.a]=(arts[e.a]||0)+1; if(!last||e.d>last)last=e.d; }
      else if(st==='nicht_erschienen'){ pts-=w*2; noShow++; }
    }
    const help=pts<=0?0:1-Math.exp(-pts/10), social=1-Math.exp(-soc/3);
    const spiele=(allTime?allTime.spiele||0:0)+(gamesSince||0), ten=Math.min(1,spiele/200);
    const score=Math.round(100*(0.55*help+0.30*ten+0.15*social));
    const why=[];
    why.push(n?`${n} Helfereinsätze in 24 Monaten${hours?` · ${hours} Std.`:''}`:'Noch keine Helfereinsätze erfasst');
    if(Object.keys(arts).length)why.push('Bei: '+Object.entries(arts).map(([k,c])=>`${EART[k]||k}${c>1?' ('+c+'×)':''}`).join(', '));
    if(noShow)why.push(`${noShow}× trotz Zusage nicht erschienen – zieht ab`);
    why.push(spiele?`${spiele} Pflichtspiele für den Verein${allTime&&allTime.stand?' (Statistik seit 2013/14 + diese Saison)':''}`:'Keine Pflichtspiele in der Vereinsstatistik');
    if(soc)why.push('Dabei bei Mannschaftsabenden/-fahrten');
    return {score,help,ten,social,n,hours,noShow,spiele,arts,last,why};
  }

  /* ===== Bindungsrisiko: Frühwarnung, wenn mehrere Signale zusammenkommen ===== */
  function retention(ts,ls,ps,eventsKnown){
    let r=0; const why=[];
    if(ps.rate28!=null&&ps.ratePrev!=null&&ps.ratePrev-ps.rate28>=0.25){ r+=2; why.push('Trainingsbeteiligung stark gesunken'); }
    if(ts&&ts.score!=null&&ts.score<55){ r++; why.push('niedriger Trainings-Score'); }
    if(ps.ohne28>=2){ r++; why.push('fehlt ohne Grund'); }
    const m3=ps.mot.slice(0,3).map(x=>x.v); if(m3.length>=2&&avg(m3)<=2.5){ r++; why.push('wirkt lustlos'); }
    if(eventsKnown&&ls&&ls.n===0&&ls.spiele<60){ r++; why.push('kaum im Vereinsleben verankert'); }
    return {risk:r,lvl:r>=4?'hoch':r>=3?'mittel':null,why};
  }

  /* ===== Allzeit-Statistik, Meilensteine, Abzeichen ===== */
  const MS_SP=[50,100,150,200,250,300,350,400,500], MS_T=[25,50,75,100,150,200], MS_A=[25,50,75,100];
  function allTimeIndex(rows,players,crm){
    const byKey=new Map(rows.map(r=>[r.key,r])), byPlayer=new Map(), used=new Map();
    for(const p of players){ const o=crm&&crm[p.id]&&crm[p.id].at, r=o&&byKey.get(o); if(r&&!used.has(r.key)){ byPlayer.set(p.id,r); used.set(r.key,p.id); } }
    for(const p of players){ if(byPlayer.has(p.id))continue; const r=byKey.get(key(p.name)); if(r&&!used.has(r.key)){ byPlayer.set(p.id,r); used.set(r.key,p.id); } }
    // Unschärfe: Umlaute auf der Vereinsseite teils als Leerzeichen („Pfl ger“), zweite Vornamen („Florian Kai Seltenreich“)
    const loose=s=>T.N(s).replace(/ss|ae|oe|ue/g,'').replace(/[^a-z]/g,'');
    const fl=s=>{ const w=T.N(s).replace(/[^a-z ]/g,' ').split(/\s+/).filter(Boolean); return w.length>1?loose(w[0])+'|'+loose(w[w.length-1]):null; };
    const uniq=f=>{ const m=new Map(); rows.forEach(r=>{ const k=f(r.name); if(!k)return; m.set(k,m.has(k)?null:r); }); return m; };
    const L1=uniq(loose), L2=uniq(fl);
    for(const [f,M] of [[loose,L1],[fl,L2]])for(const p of players){ if(byPlayer.has(p.id)||!p.own)continue; const k=f(p.name), r=k&&M.get(k); if(r&&!used.has(r.key)){ byPlayer.set(p.id,r); used.set(r.key,p.id); } }
    return {byKey,byPlayer,used};
  }
  function totals(row,ms){ // row: Vereinsstatistik; ms: matchStats seit Stand
    const sp=(row?row.spiele:0)+(ms?ms.sp:0), tore=(row?row.tore:0)+(ms?ms.tore:0), vor=(row?row.assists:0)+(ms?ms.vor:0), siege=(row?row.siege:0)+(ms?ms.s:0);
    const spq=(row?row.spiele:0)+(ms?(ms.spQ!=null?ms.spQ:ms.sp):0); // Quote nur über Spiele mit bekanntem Ergebnis
    return {sp,tore,vor,siege,quote:spq?Math.round(siege/spq*100):null};
  }
  function nextMilestones(tot){
    const out=[]; const nx=(L,v,lab)=>{ const m=L.find(x=>x>v); if(m!=null)out.push({lab,ziel:m,rest:m-v}); };
    nx(MS_SP,tot.sp,'Spiele'); nx(MS_T,tot.tore,'Tore'); nx(MS_A,tot.vor,'Vorlagen');
    return out.sort((a,b)=>a.rest-b.rest);
  }
  function badges(tot,rk){
    const b=[];
    if(tot.sp>=200||tot.tore>=75)b.push({k:'legende',t:'Vereinslegende',d:tot.sp>=200?`${tot.sp} Spiele`:`${tot.tore} Tore`});
    const cl=[500,400,300,250,200,150,100,50].find(x=>tot.sp>=x); if(cl)b.push({k:'club',t:cl+'er-Club',d:`${tot.sp} Pflichtspiele`});
    const tc=[200,150,100,75,50,25].find(x=>tot.tore>=x); if(tc)b.push({k:'tore',t:tc+' Tore',d:`${tot.tore} Tore insgesamt`});
    if(tot.vor>=25)b.push({k:'vorlagen',t:'Vorlagengeber',d:`${tot.vor} Vorlagen`});
    if(tot.sp>=50&&tot.quote>=55)b.push({k:'sieger',t:'Siegertyp',d:`${tot.quote} % Siege`});
    if(rk&&rk.sp&&rk.sp<=10)b.push({k:'top',t:`Top ${rk.sp<=3?3:10} Einsätze`,d:`Platz ${rk.sp} ewige Einsatzliste`});
    if(rk&&rk.tore&&rk.tore<=10)b.push({k:'top',t:`Top ${rk.tore<=3?3:10} Torschützen`,d:`Platz ${rk.tore} ewige Torjägerliste`});
    return b;
  }

  /* ===== Freitext: Veranstaltungen & Helfer ===== */
  const EV_RX=[['kerwe',/kerwe|kirchweih/],['weihnachten',/weihnachtsmarkt|weihnachtsfeier(?! der mannschaft)|weihnacht/],['turnier',/turnier|hallencup|papurex|\bcup\b/],
    ['heimspiel',/heimspiel|spieltagsdienst|bewirtung|kiosk|sportheimdienst|heimspieltag/],['arbeitseinsatz',/arbeitseinsatz|arbeitsdienst|platzpflege|renovier|aufraeum|streichaktion/],
    ['saisonfeier',/saisonabschluss|saisonauftakt|sommerfest|jubilaeum|jahrfeier|vereinsfest/],['mannschaft',/mannschaftsabend|teamabend|grillabend|mannschaftsfahrt|abschlussfahrt|teamevent|ausflug/],
    ['jugend',/jugendturnier|fussballcamp|feriencamp|jugendtag/]];
  const ROLE_RX=[['aufbau',/aufbau|aufgebaut|aufbauen/],['abbau',/abbau|abgebaut|abbauen/],['theke',/theke|ausschank|bedien|getraenk|\bbar\b|zapf/],['kasse',/kasse|eintritt|kassiert/],
    ['grill',/grill/],['kuechen',/kueche|kuchen|essen|salat|pommes|kochen|waffel/],['orga',/orga|organis|planung|geplant/],['fahrdienst',/fahrdienst|gefahren|transport/]];
  const HELP=/geholfen|mitgeholfen|helfer|dienst|aufbau|abbau|aufgebaut|abgebaut|theke|bedien|kasse|grill|kueche|kuchen|orga|dabei|mitgemacht|einsatz|ausschank|stunden|teilgenommen|zugesagt|abgesagt|nicht erschienen|gearbeitet/;
  const hoursOf=c=>{ const m=c.match(/(\d+(?:[.,]\d)?)\s*(stunden|std|h)\b/); if(m)return +m[1].replace(',','.');
    const m2=c.match(/\b(ein|eine|zwei|drei|vier|fuenf|sechs|sieben|acht|neun|zehn|zwoelf)\s*(stunden|std)\b/); if(m2)return NUMW[m2[1]];
    if(/ganzen tag|ganztags/.test(c))return 8; if(/halben tag/.test(c))return 4; return null; };
  function parseEvent(text,people,today){
    const t0=T.N(text); let art=null; for(const [k,rx] of EV_RX){ if(rx.test(t0)){ art=k; break; } }
    if(!art||!HELP.test(t0))return null;
    const idx=T.nameIndex(people), datum=T.parseDate(t0,today);
    const segs=t0.split(/[.;!\n]+|,|\bund dann\b/).map(s=>s.trim()).filter(Boolean);
    const H={}; let pend=[], pendRoles=[];
    const je=(t0.match(/\bje(?:weils)?\s+(\d+(?:[.,]\d)?)\s*(?:stunden|std|h)\b/)||[])[1];
    const put=(ps,roles,hrs,status)=>ps.forEach(p=>{ const o=H[p.id]=H[p.id]||{person:p.id,rollen:[],stunden:null,status:'geholfen'}; roles.forEach(r=>{ if(!o.rollen.includes(r))o.rollen.push(r); }); if(hrs!=null)o.stunden=hrs; if(status)o.status=status; });
    for(const c of segs){
      const ps=T.findPlayers(c,idx), roles=ROLE_RX.filter(([,rx])=>rx.test(c)).map(([k])=>k), hrs=/\bje/.test(c)?null:hoursOf(c);
      const status=/nicht erschienen|nicht gekommen|trotz zusage|nicht aufgetaucht|ist nicht aufgetaucht/.test(c)?'nicht_erschienen':/abgesagt/.test(c)?'abgesagt':(/zugesagt|eingeteilt|wird helfen|kommt zum/.test(c)&&!/geholfen/.test(c))?'zugesagt':null;
      if(ps.length&&!roles.length&&!status&&hrs==null&&!pendRoles.length){ pend.push(...ps); continue; }
      if(!ps.length&&roles.length){ pendRoles=roles; if(pend.length){ put(pend,roles,null,null); pend=[]; pendRoles=[]; } continue; }
      if(ps.length){ put([...pend,...ps],roles.length?roles:pendRoles,hrs,status); pend=[]; pendRoles=[]; }
      else if(hrs!=null&&Object.keys(H).length){ Object.values(H).forEach(o=>{ if(o.stunden==null)o.stunden=hrs; }); }
    }
    if(pend.length)put(pend,[],null,null);
    if(je!=null)Object.values(H).forEach(o=>{ if(o.stunden==null)o.stunden=+String(je).replace(',','.'); });
    if(art==='mannschaft')Object.values(H).forEach(o=>{ if(!o.rollen.length)o.rollen=['teilnahme']; });
    const helfer=Object.values(H);
    const nm=(text.match(/(?:beim|bei der|beim|auf der|am)\s+([A-ZÄÖÜ][\wäöüß-]+(?:\s[A-ZÄÖÜ0-9][\wäöüß-]+)?)/)||[])[1];
    const titel=nm&&EV_RX.some(([k,rx])=>k===art&&rx.test(T.N(nm)))?nm:EART[art];
    return {action:{type:'veranstaltung',input:{datum,titel,art,helfer}},ambig:T.ambiguous(text,idx,helfer.map(h=>h.person))};
  }

  function eventArt(t){ const n=T.N(t); for(const [k,rx] of EV_RX){ if(rx.test(n))return k; } return 'sonstiges'; }
  function roleOf(t){ const n=T.N(t); return ROLE_RX.filter(([,rx])=>rx.test(n)).map(([k])=>k); }

  /* ===== Freitext: Spiel mit Ergebnis, Toren und Vorlagen ===== */
  function parseMatch(text,squad,today){
    const t0=T.N(text); const m=t0.match(/\b(\d{1,2})\s*[:\-]\s*(\d{1,2})\b/);
    if(!m||!/gegen|spiel|gewonnen|verloren|unentschieden|remis|\bsieg|niederlage|auswaerts|heimspiel/.test(t0))return null;
    let a=+m[1], b=+m[2];
    if(/verloren|niederlage/.test(t0)&&a>b)[a,b]=[b,a];
    if(/gewonnen|\bsieg\b|gesiegt/.test(t0)&&a<b)[a,b]=[b,a];
    const gm=text.match(/gegen\s+(?:den |die |das |die zweite von |)([A-Za-zÄÖÜäöüß0-9./ -]{2,40}?)(?=\s*(?:\d|,|\.|!|;|\(|$|\s(?:mit|zu|und|gewonnen|verloren|unentschieden|gespielt|remis)\b))/i);
    const heim=/zuhause|zu hause|daheim|heimspiel|\bheim\b/.test(t0)?true:/auswaerts/.test(t0)?false:null;
    const idx=T.nameIndex(squad), sp={};
    const add=(p,k,v)=>{ const o=sp[p.id]=sp[p.id]||{player_id:p.id,status:'da'}; o[k]=(o[k]||0)+v; };
    const cnt=s=>{ const d=s.match(/\b(\d{1,2})\s*(?:x|mal|tore|treffer|buden)?\b/); if(d)return +d[1]; for(const k in NUMW){ if(new RegExp('\\b'+k+'\\b').test(s))return NUMW[k]; } return 1; };
    const clauses=t0.replace(m[0],' ').split(/[.;!\n]+/).map(s=>s.trim()).filter(Boolean);
    for(const c of clauses){
      let mode=/vorlage|assist|aufgelegt|vorbereitet/.test(c)&&!/tor|treffer|getroffen|traf/.test(c)?'vorlagen':/\btor|tore|treffer|getroffen|\btraf|trifft|doppelpack|hattrick|genetzt|buden/.test(c)?'tore':null;
      if(!mode)continue;
      for(const it of c.split(/,|\bund\b|\bsowie\b/)){
        if(/vorlage|assist|aufgelegt|vorbereitet/.test(it))mode='vorlagen'; else if(/\btor|tore|treffer|getroffen|\btraf|doppelpack|hattrick/.test(it))mode=mode==='vorlagen'&&!/tor|treffer|getroffen|traf|doppelpack|hattrick/.test(it)?'vorlagen':'tore';
        const ps=T.findPlayers(it,idx); if(!ps.length)continue;
        const n=ps.length===1?cnt(it.replace(/\b(19|20)\d\d\b/g,'')):1;
        ps.forEach(p=>add(p,mode,n));
      }
    }
    const spieler=Object.values(sp);
    const tt=spieler.reduce((x,s)=>x+(s.tore||0),0);
    return {action:{type:'spiel',input:{datum:T.parseDate(t0,today),gegner:gm?gm[1].trim():null,heim,tore_wir:a,tore_gegner:b,spieler}},warn:tt>a?`Mehr Torschützen (${tt}) als eigene Tore (${a}) – bitte prüfen.`:null,ambig:T.ambiguous(text,idx,spieler.map(s=>s.player_id))};
  }

  /* ===== WhatsApp-Export (Mannschaftsgruppe) → Zu-/Absagen fürs Training =====
     Zeilen wie „[23.09.26, 18:02:11] Tim Fries: Bin heute raus, Arbeit“ oder „23.09.26, 18:02 - Tim Fries: bin dabei 👍“ */
  const WA=/^‎?\[?(\d{1,2})[./](\d{1,2})[./](\d{2,4}),?\s+(\d{1,2}):(\d{2})(?::\d{2})?\s*(?:[AP]M)?\]?\s*(?:-\s*)?([^:]{2,60}?):\s?(.*)$/;
  function isWhatsApp(text){ const L=String(text||'').split(/\r?\n/).slice(0,60); return L.filter(l=>WA.test(l)).length>=3; }
  function parseWhatsApp(text,people,today,days){
    const idx=T.nameIndex(people), msgs=[]; let cur=null;
    for(const line of String(text||'').split(/\r?\n/)){
      const m=line.match(WA);
      if(m){ const y=m[3].length===2?'20'+m[3]:m[3]; cur={d:`${y}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`,h:+m[4],who:m[6].replace(/^~\s*/,'').trim(),t:m[7]}; msgs.push(cur); }
      else if(cur&&line.trim())cur.t+='\n'+line;
    }
    const since=T.addDays(today,-(days||21)), byDay={};
    let used=0;
    for(const m of msgs){
      if(m.d<since||m.d>today)continue;
      const t=T.N(m.t); if(/weggelassen|omitted|geloescht|deleted|ausgeschlossen/.test(t))continue;
      if(/\bwer (ist|kommt|kann|fehlt)|\?\s*$/.test(t.trim()))continue;              // Fragen („wer ist dabei?“) sind keine Zusagen
      const who=T.findPlayers(T.N(m.who).replace(/[^a-z0-9 ]/g,' '),idx), sender=who.length===1?who[0]:null;
      const named=T.findPlayers(t.replace(/[^a-z0-9 ]/g,' '),idx).filter(p=>!sender||p.id!==sender.id);
      const absent=/(bin|komme|kann|schaff|pack)\w*\s+(es\s+)?(heute\s+|morgen\s+|leider\s+)*(nicht|net|nich)\b|absage|sage ab|nicht dabei|bin raus|fall(e)? aus|raus heute|heute raus|klappt nicht|wird nix|❌|👎/.test(t)||/❌|👎/.test(m.t);
      const present=!absent&&(/bin dabei|bin da\b|komme\b|dabei\b|bin am start|👍|✅|💪/.test(t)||/👍|✅|💪/.test(m.t));
      const late=/spaeter|verspaet|komme spaet|min spaeter|etwas spaet/.test(t);
      if(!absent&&!present&&!late)continue;
      let d=m.d; if(/\bmorgen\b/.test(t))d=T.addDays(m.d,1);
      if(d>today)continue;
      let grund='privat';
      if(/verletz|zerrung|knie|bruch|umgeknickt/.test(t))grund='verletzt'; else if(/krank|grippe|erkaelt|fieber|magen|infekt/.test(t))grund='krank';
      else if(/arbeit|schicht|arbeiten|dienst|job|meeting|termin auf der arbeit/.test(t))grund='arbeit'; else if(/urlaub|verreist|ferien/.test(t))grund='urlaub';
      else if(/uni|schule|klausur|pruefung|vorlesung/.test(t))grund='uni'; else if(/familie|hochzeit|geburtstag|beerdigung|kind/.test(t))grund='familie';
      else if(/zweite|2\. mannschaft/.test(t))grund='zweite';
      const who2=named.length&&/(\bund\b|auch|kommt nicht|kommen nicht|kann nicht|ist raus|sind raus)/.test(t)?named:[];
      const targets=[...(sender?[sender]:[]),...who2];
      if(!targets.length)continue;
      const D=byDay[d]=byDay[d]||{};
      for(const p of targets){ D[p.id]=absent?{player_id:p.id,status:'weg',grund,notiz:m.t.slice(0,160)}:late?{player_id:p.id,status:'spaet'}:(D[p.id]&&D[p.id].status==='weg'?D[p.id]:{player_id:p.id,status:'da'}); }
      used++;
    }
    const actions=Object.keys(byDay).sort().map(d=>({type:'training',input:{datum:d,typ:'training',spieler:Object.values(byDay[d]),rest_da:false}}));
    return {actions,messages:msgs.length,used};
  }

  return {ROLES,EART,HSTAT,key,isWhatsApp,parseWhatsApp,trainingScore,matchStats,teamForm,withWithout,loyaltyScore,retention,allTimeIndex,totals,nextMilestones,badges,parseEvent,parseMatch,eventArt,roleOf,hoursOf,MS_SP,MS_T};
})();

/* =====================================================================
   SV/BSC Scout · Runde 7: Training (App in der App) + Co-Trainer
   - Einheiten & Anwesenheit mit Gründen, Motivation & Fitness je Spieler
   - Verletzungen mit Verlauf, Prognose und „wieder fit“
   - Tendenz-Warnungen, Rückfragen vor dem Spieltag, Aufstellungs-Hinweise
   - Co-Trainer-Chat mit Spracheingabe; mit KI-Schlüssel versteht er freie Sätze & Fragen
   Rechte: Trainer = Kaderplaner. Training & Verletzungen sehen nur Admin, Vorstand, Kaderplaner, Trainer.
   ===================================================================== */
function canEdit(){ const r=svRole(); return r==='admin'||r==='vorstand'||r==='planer'||r==='trainer'; }
function canWriteField(k){ return canEdit(); }
function canContacts(){ return canEdit(); }
function canTraining(){ return canEdit(); }
SV_PAGES.training=['Training','Anwesenheit, Fitness, Verletzungen – und dein Co-Trainer'];
{ const _ta=svTabAllowed; svTabAllowed=function(t){ if(t==='training')return canTraining(); return _ta.apply(this,arguments); }; }
Object.assign(SV_ROLE_INFO.trainer,{t:'Trainer',d:'Wie die Kaderplaner – mit Fokus Training',yes:['Alles sehen & bearbeiten','Training, Fitness & Verletzungen','Kandidaten & Aufstellung','Co-Trainer'],no:['Nutzerverwaltung']});
Object.assign(SV_ROLE_INFO.planer,{yes:['Kandidaten & Kontakte pflegen','Kaderplan & Aufstellung','Training & Verletzungen','Co-Trainer']});

const TR={st:{sessions:[],injuries:[]},loaded:false,loading:null,view:'home',ai:null,chat:[],chatBusy:false,greeted:false};
const TR_POS=['TW','IV','AV','ZM','OM','Flügel','ST'];
function trToday(){ return todayISO(); }
function trSquad(){
  const inAtt=new Set(); TR.st.sessions.forEach(s=>(s.a||[]).forEach(a=>inAtt.add(a[0])));
  return players.filter(p=>p.own&&!p.isJugend&&!p.verzicht&&(p.kader===1||inAtt.has(p.id)))
    .sort((a,b)=>(TR_POS.indexOf(a.pos)-TR_POS.indexOf(b.pos))||(a.kader||1)-(b.kader||1)||a.name.localeCompare(b.name,'de'));
}
function trP(id){ return players.find(p=>p.id===id); }
function trName(id){ const p=trP(id); return p?p.name:id; }
function trShort(id){ const p=trP(id); if(!p)return id; const w=p.name.split(' '); return w.length>1?w[0][0]+'. '+w.slice(1).join(' '):p.name; }
async function trLoad(force){
  if(!canTraining())return; if(TR.loading&&!force)return TR.loading;
  TR.loading=(async()=>{
    try{ const {data,error}=await SVB.sb.rpc('training_state',{p_since:TRC.addDays(trToday(),-560)}); if(error)throw error;
      if(data){ TR.st={sessions:data.sessions||[],injuries:(data.injuries||[]).map(i=>Object.assign(i,{id:String(i.id)}))}; TR.loaded=true; } }
    catch(e){ console.warn('Training laden',e); }
    try{ const {data}=await SVB.sb.rpc('ai_status'); TR.ai=data||{ready:false}; }catch(e){ TR.ai={ready:false}; }
    TR.loading=null; trAfter();
  })();
  return TR.loading;
}
function trAfter(){ try{ if(document.querySelector('#panel-training.active'))trRender(); }catch(e){} try{trHomeCard();}catch(e){} try{ if(document.querySelector('#panel-elf.active'))renderLineup(); }catch(e){} trBadge(); }
function trAlerts(){ return TR.loaded?TRC.alerts(TR.st,trSquad().map(p=>({id:p.id,name:p.name})),trToday()):[]; }
function trBadge(){ const n=trAlerts().filter(a=>a.lvl!=='info').length; document.querySelectorAll('[data-cnt="training"]').forEach(el=>{ el.textContent=n; el.style.display=n?'':'none'; }); }
function trInjury(pid){ return TR.loaded?TRC.activeInjury(TR.st,pid,trToday()):null; }
function trSessionOn(d,typ){ return TR.st.sessions.find(s=>s.d===d&&s.t===(typ||'training')); }

/* ---------- Speichern ---------- */
async function trSaveSession(p){ const {data,error}=await SVB.sb.rpc('training_save',{p}); if(error)throw new Error(error.message); await trLoad(true); return data; }
async function trSaveInjury(i){
  const row={player_id:i.player_id,diagnose:String(i.diagnose||'Verletzung').slice(0,200),art:i.art||null,koerperteil:i.koerperteil||null,beginn:i.beginn,prognose:i.prognose||null,zurueck:i.zurueck||null,notiz:i.notiz||null};
  const q=i.id?SVB.sb.from('injuries').update(row).eq('id',i.id):SVB.sb.from('injuries').insert(row);
  const {error}=await q; if(error)throw new Error(/check/.test(error.message)?'Datum passt nicht (Rückkehr/Prognose vor Beginn?)':error.message); await trLoad(true);
}
async function trCloseInjury(id,date){ const {error}=await SVB.sb.from('injuries').update({zurueck:date}).eq('id',id); if(error)throw new Error(error.message); await trLoad(true); }
async function trDeleteSession(id){ const {error}=await SVB.sb.from('training_sessions').delete().eq('id',id); if(error)throw new Error(error.message); await trLoad(true); }
async function trDeleteInjury(id){ const {error}=await SVB.sb.from('injuries').delete().eq('id',id); if(error)throw new Error(error.message); await trLoad(true); }

/* ---------- kleine Bausteine ---------- */
const trPct=v=>v==null?'–':Math.round(v*100)+'%';
function trRateCls(v){ return v==null?'':v>=0.8?'ok':v>=0.6?'mid':'bad'; }
function trDots(vals,max){ return `<span class="trdots">${vals.slice(0,8).reverse().map(v=>`<i class="v${v}" title="${v}/5"></i>`).join('')}</span>`; }
function trSpark(weeks){
  const W=weeks, w=260, h=56, bw=w/W.length;
  return `<svg class="trspark" viewBox="0 0 ${w} ${h+14}" preserveAspectRatio="none" role="img" aria-label="Trainingsbeteiligung je Woche">${W.map((x,i)=>{ const v=x.rate==null?0:x.rate, bh=Math.max(2,v*h);
    return `<g><rect x="${i*bw+3}" y="${h-bh}" width="${bw-6}" height="${bh}" rx="3" class="${x.rate==null?'na':trRateCls(x.rate)}"><title>KW ab ${TRC.fmt(x.from)}: ${x.rate==null?'kein Training':trPct(x.rate)}</title></rect>${i%3===0?`<text x="${i*bw+bw/2}" y="${h+12}" text-anchor="middle">${TRC.fmt(x.from).slice(0,5)}</text>`:''}</g>`; }).join('')}</svg>`;
}
function trAlertHtml(a,compact){
  const ask=a.ask?(a.ask.type==='fit'?`<div class="tra-q"><button class="btn sm" data-q-fit="${a.ask.injury}">Ja, wieder fit</button><button class="btn ghost sm" data-q-prog="${a.ask.injury}">Noch nicht · +1 Woche</button></div>`
    :a.ask.type==='close'?`<div class="tra-q"><button class="btn sm" data-q-close="${a.ask.injury}" data-date="${a.ask.date}">Verletzung abschließen</button></div>`:''):'';
  return `<div class="tra l-${a.lvl}">${a.pid?`<span class="tra-av" data-svp="${svEsc(a.pid)}">${avaHtml(trP(a.pid)||{name:'?',id:''})}</span>`:`<span class="tra-av team">${SVI('kand')}</span>`}
    <div class="tra-b"><b ${a.pid?`data-svp="${svEsc(a.pid)}"`:''}>${svEsc(a.t)}</b><span>${svEsc(a.d)}</span>${compact?'':ask}</div></div>`;
}
function trWireAlerts(root){
  root.querySelectorAll('[data-svp]').forEach(x=>x.onclick=()=>openModal(x.dataset.svp));
  root.querySelectorAll('[data-q-fit]').forEach(b=>b.onclick=async()=>{ b.disabled=true; try{ await trCloseInjury(b.dataset.qFit,trToday()); kToast('✓ Als wieder fit eingetragen'); }catch(e){ kToast('⚠️ '+e.message); } });
  root.querySelectorAll('[data-q-close]').forEach(b=>b.onclick=async()=>{ b.disabled=true; try{ await trCloseInjury(b.dataset.qClose,b.dataset.date); kToast('✓ Verletzung abgeschlossen'); }catch(e){ kToast('⚠️ '+e.message); } });
  root.querySelectorAll('[data-q-prog]').forEach(b=>b.onclick=async()=>{ const i=TR.st.injuries.find(x=>x.id===b.dataset.qProg); if(!i)return; b.disabled=true;
    try{ await trSaveInjury({id:i.id,player_id:i.p,diagnose:i.dg,art:i.art,koerperteil:i.kt,beginn:i.b,prognose:TRC.addDays(i.pr&&i.pr>trToday()?i.pr:trToday(),7),notiz:i.n}); kToast('✓ Prognose um eine Woche verlängert'); }catch(e){ kToast('⚠️ '+e.message); } });
}

/* ---------- Training-Panel ---------- */
function trRender(){
  const P=document.getElementById('panel-training'); if(!P)return;
  if(!canTraining()){ P.innerHTML='<div class="card"><div class="empty">Training sehen nur Trainer, Kaderplaner und Vorstand.</div></div>'; return; }
  if(!TR.loaded){ P.innerHTML='<div class="card"><div class="empty">Lade Trainingsdaten …</div></div>'; trLoad(); return; }
  const V=TR.view, tabs=[['home','Übersicht'],['sessions','Einheiten'],['players','Spieler'],['games','Spiele'],['injuries','Verletzungen']];
  P.innerHTML=`<div class="trtop">
      <div class="trtabs">${tabs.map(([k,t])=>`<button class="${V===k?'on':''}" data-trv="${k}">${t}</button>`).join('')}</div>
      <div class="tract"><button class="btn" data-tr-new>${SVI('plus')} Training erfassen</button><button class="btn ghost" data-tr-game>${SVI('plus')} Spiel</button><button class="btn ghost" data-tr-inj>${SVI('plus')} Verletzung</button><button class="btn ghost" data-tr-chat>${SVI('chat')} Co-Trainer</button></div></div>
    <div id="trBody"></div>`;
  P.querySelectorAll('[data-trv]').forEach(b=>b.onclick=()=>{ TR.view=b.dataset.trv; trRender(); });
  P.querySelector('[data-tr-new]').onclick=()=>trSessionEditor(trToday());
  P.querySelector('[data-tr-inj]').onclick=()=>trInjuryEditor(null);
  P.querySelector('[data-tr-game]').onclick=()=>trSessionEditor(trToday(),null,'spiel');
  P.querySelector('[data-tr-chat]').onclick=()=>trChatOpen();
  const B=document.getElementById('trBody');
  ({home:trViewHome,sessions:trViewSessions,players:trViewPlayers,games:(b)=>trViewGames(b),injuries:trViewInjuries})[V](B);
}
function trViewHome(B){
  const sq=trSquad(), today=trToday(), T=TRC.teamStats(TR.st,today,sq.map(p=>p.id)), al=trAlerts();
  const inj=sq.map(p=>({p,i:trInjury(p.id)})).filter(x=>x.i);
  const trend=T.r21.rate!=null&&T.prev.rate!=null?T.r21.rate-T.prev.rate:null;
  const last=TR.st.sessions.find(s=>s.t==='training');
  const todayS=trSessionOn(today);
  const empty=!TR.st.sessions.length;
  B.innerHTML=`
    ${empty?`<div class="card trhero"><div><h3>Los geht's mit dem Training</h3><p>Nach jeder Einheit kurz eintragen, wer da war – oder dem Co-Trainer einfach sagen: <em>„Max und Tim waren heute nicht da, Tom hat eine Zerrung.“</em> Ab 3–4 Einheiten erkennt die App Tendenzen und warnt früh.</p></div>
      <div class="btnrow"><button class="btn" data-tr-new2>${SVI('plus')} Heutiges Training erfassen</button><button class="btn ghost" data-tr-chat2>${SVI('chat')} Co-Trainer ausprobieren</button></div></div>`:''}
    <div class="tiles trtiles">
      <div class="tile"><div class="v ${trRateCls(T.r21.rate)}">${trPct(T.r21.rate)}</div><div class="l">Beteiligung · 3 Wochen</div><div class="s">${trend==null?(T.r21.sessions+' Einheiten'):`<b class="${trend>=0?'ok':'bad'}">${trend>=0?'▲':'▼'} ${Math.abs(Math.round(trend*100))} Pkt.</b> ggü. davor`}</div></div>
      <div class="tile"><div class="v">${T.season.sessions}</div><div class="l">Einheiten · 12 Monate</div><div class="s">Saison-Beteiligung ${trPct(T.season.rate)}</div></div>
      <div class="tile"><div class="v ${inj.length?'bad':''}">${inj.length}</div><div class="l">Aktuell verletzt</div><div class="s">${inj.length?svEsc(inj.slice(0,2).map(x=>x.p.name.split(' ').pop()).join(', '))+(inj.length>2?' …':''):'alle an Bord'}</div></div>
      <div class="tile"><div class="v ${al.some(a=>a.lvl==='hoch')?'bad':''}">${al.filter(a=>a.lvl!=='info').length}</div><div class="l">Hinweise</div><div class="s">${last?'letzte Einheit '+TRC.fmt(last.d):'noch keine Einheit'}</div></div>
    </div>
    <div class="trgrid">
      <div class="card"><h3 class="trh">${SVI('bell')} Co-Trainer-Hinweise</h3>${al.length?al.slice(0,8).map(a=>trAlertHtml(a)).join(''):'<div class="note">Keine Auffälligkeiten. Die App schaut auf Beteiligung, Fehlen ohne Grund, Motivation, Fitness und Verletzungs-Prognosen.</div>'}</div>
      <div class="card"><h3 class="trh">${SVI('chart')} Trainingsbeteiligung je Woche</h3>${trSpark(T.weeks)}
        <div class="note">Verletzt, krank und „in der Zweiten“ zählen nicht gegen die Beteiligung.</div>
        ${todayS?`<div class="trtoday">${SVI('check')} Heute erfasst: ${(todayS.a||[]).filter(a=>a[1]!=='weg').length} da · ${(todayS.a||[]).filter(a=>a[1]==='weg').length} fehlen <button class="btn ghost sm" data-edit-s="${todayS.id}">Bearbeiten</button></div>`:''}</div>
    </div>
    ${trMatchdayHtml()}
    <div class="card"><h3 class="trh">${SVI('shield')} Lazarett</h3>${inj.length?`<div class="trinjl">${inj.map(({p,i})=>trInjRow(p,i)).join('')}</div>`:'<div class="note">Niemand verletzt eingetragen.</div>'}</div>`;
  const q=s=>B.querySelector(s);
  if(q('[data-tr-new2]'))q('[data-tr-new2]').onclick=()=>trSessionEditor(today);
  if(q('[data-tr-chat2]'))q('[data-tr-chat2]').onclick=()=>trChatOpen();
  B.querySelectorAll('[data-edit-s]').forEach(b=>b.onclick=()=>trSessionEditor(null,b.dataset.editS));
  trWireAlerts(B); trWireInj(B); trWireMatchday(B);
}
function trInjRow(p,i){
  const today=trToday(), days=TRC.diffDays(today,i.b), over=i.pr&&i.pr<today, left=i.pr?TRC.diffDays(i.pr,today):null;
  return `<div class="trinj${over?' over':''}">${avaHtml(p)}<div class="trinj-b"><b data-svp="${svEsc(p.id)}">${svEsc(p.name)}</b><span>${svEsc(i.dg)}${i.kt?' · '+svEsc(i.kt):''} · seit ${TRC.fmt(i.b)} (${days} T)</span>
    ${i.pr?`<div class="trprog"><i style="width:${Math.max(4,Math.min(100,days/Math.max(1,TRC.diffDays(i.pr,i.b))*100))}%"></i></div><small>${over?'Prognose '+TRC.fmt(i.pr)+' überschritten':'voraussichtlich zurück '+TRC.fmt(i.pr)+' · noch '+left+' T'}</small>`:'<small>keine Prognose</small>'}</div>
    <div class="trinj-a"><button class="btn sm" data-inj-fit="${i.id}">Wieder fit</button><button class="iconbtn" data-inj-ed="${i.id}" title="Bearbeiten">${SVI('sliders')}</button></div></div>`;
}
function trWireInj(B){
  B.querySelectorAll('[data-inj-fit]').forEach(b=>b.onclick=async()=>{ b.disabled=true; try{ await trCloseInjury(b.dataset.injFit,trToday()); kToast('✓ Wieder fit – Verletzung abgeschlossen'); }catch(e){ kToast('⚠️ '+e.message); b.disabled=false; } });
  B.querySelectorAll('[data-inj-ed]').forEach(b=>b.onclick=()=>trInjuryEditor(b.dataset.injEd));
  B.querySelectorAll('[data-svp]').forEach(x=>x.onclick=()=>openModal(x.dataset.svp));
}
/* Rückfragen vor dem Spieltag: Spieler der aktuellen Elf mit offenen Punkten */
function trMatchdayHtml(){
  let F=null; try{ F=FORMATIONS[LINEUP.formation]; }catch(e){}
  if(!F)return '';
  const today=trToday(), items=[];
  F.forEach((slot,i)=>{ const p=trP(LINEUP.slots[i]); if(!p)return; const s=TRC.playerStats(TR.st,p.id,today);
    const recent=s.rows.filter(r=>TRC.diffDays(today,r.d)<=10);
    if(s.injury)items.push({p,slot:slot[0],lvl:'hoch',t:`verletzt – ${s.injury.dg}${s.injury.pr?', Prognose '+TRC.fmt(s.injury.pr):''}`,q:'fit',inj:s.injury.id});
    else if(recent.length>=2&&recent.filter(r=>r.st==='weg').length>=2)items.push({p,slot:slot[0],lvl:'mittel',t:`fehlte ${recent.filter(r=>r.st==='weg').length}× in den letzten 10 Tagen (${[...new Set(recent.filter(r=>r.st==='weg').map(r=>TRC.REASONS[r.g]||r.g))].join(', ')})`});
    else if(s.mot[0]&&TRC.diffDays(today,s.mot[0].d)<=10&&s.mot[0].v<=2)items.push({p,slot:slot[0],lvl:'mittel',t:`zuletzt lustlos im Training (Motivation ${s.mot[0].v}/5)`});
    else if(s.fit[0]&&TRC.diffDays(today,s.fit[0].d)<=10&&s.fit[0].v<=2)items.push({p,slot:slot[0],lvl:'info',t:`wirkte zuletzt platt (Fitness ${s.fit[0].v}/5)`});
    else if(!s.mot.some(m=>TRC.diffDays(today,m.d)<=7))items.push({p,slot:slot[0],lvl:'info',t:'Wie war sein Eindruck im Training diese Woche?',q:'rate'}); });
  if(!items.length)return `<div class="card"><h3 class="trh">${SVI('pitch')} Rückfragen zur Startelf</h3><div class="note">Alle Spieler der aktuellen Elf sind fit, im Training und bewertet. 👍</div></div>`;
  const issues=items.filter(x=>x.q!=='rate'), rate=items.filter(x=>x.q==='rate');
  return `<div class="card"><h3 class="trh">${SVI('pitch')} Rückfragen zur Startelf <small>(${svEsc(LINEUP.formation)})</small></h3>
    ${issues.map(x=>`<div class="trmd l-${x.lvl}"><span class="trmd-slot">${svEsc(x.slot)}</span><div class="trmd-b"><b data-svp="${svEsc(x.p.id)}">${svEsc(x.p.name)}</b><span>${svEsc(x.t)}</span>
      ${x.q==='fit'?`<div class="tra-q"><button class="btn sm" data-q-fit="${x.inj}">Ist wieder fit</button></div>`:''}</div></div>`).join('')}
    ${rate.length?`<div class="trmd-rh">Wie war der Eindruck diese Woche? <small>Motivation 1–5 antippen</small></div><div class="trrgrid">${rate.map(x=>`<div class="trrg" data-rate="${svEsc(x.p.id)}"><span data-svp="${svEsc(x.p.id)}"><em>${svEsc(x.slot)}</em> ${svEsc(x.p.name.split(' ').pop())}</span><div>${[1,2,3,4,5].map(n=>`<button data-m="${n}">${n}</button>`).join('')}</div></div>`).join('')}</div>`:''}
    ${issues.length?'<div class="note" style="margin-top:8px">Tipp: Verletzte und Unsichere in der Aufstellung tauschen – der Positions-Check zeigt, wer passt.</div>':''}</div>`;
}
function trWireMatchday(B){
  B.querySelectorAll('[data-rate] [data-m]').forEach(b=>b.onclick=async()=>{ const pid=b.closest('[data-rate]').dataset.rate, v=+b.dataset.m;
    const s=TR.st.sessions.find(x=>x.t==='training'&&(x.a||[]).some(a=>a[0]===pid&&a[1]!=='weg'))||null;
    try{ await trSaveSession({datum:s?s.d:trToday(),typ:'training',spieler:[{player_id:pid,status:'da',motivation:v}]}); kToast('✓ Motivation '+v+'/5 für '+trShort(pid)); }catch(e){ kToast('⚠️ '+e.message); } });
  trWireAlerts(B);
}
function trViewSessions(B){
  const S=TR.st.sessions;
  B.innerHTML=`<div class="card">${S.length?`<div class="trsl">${S.slice(0,120).map(s=>{ const da=(s.a||[]).filter(a=>a[1]!=='weg').length, weg=(s.a||[]).filter(a=>a[1]==='weg');
    return `<button class="trs" data-edit-s="${s.id}"><div class="trs-d"><b>${new Date(s.d+'T12:00:00').toLocaleDateString('de-DE',{weekday:'short'})}</b><span>${TRC.fmt(s.d)}${s.d.slice(0,4)!==trToday().slice(0,4)?s.d.slice(2,4):''}</span></div>
      <div class="trs-b"><div class="trs-f">${s.t!=='training'?`<i class="typ">${svEsc(s.t)}</i>`:''}${s.t==='spiel'&&s.tw!=null?`<i class="res ${s.tw>s.tg?'w':s.tw===s.tg?'d':'l'}">${s.tw}:${s.tg}${s.g?' '+svEsc(s.g):''}</i>`:s.g?`<i>${svEsc(s.g)}</i>`:''}${(s.f||[]).map(f=>`<i>${svEsc(TRC.FOKUS[f]||f)}</i>`).join('')}${s.i?`<i class="int">Intensität ${s.i}/5</i>`:''}${s.s?`<i class="st s${s.s}">Eindruck ${s.s}/5</i>`:''}</div>
      <span>${weg.length?'Fehlend: '+svEsc(weg.slice(0,6).map(a=>trShort(a[0])+(a[2]==='ohne'?' (!)':'')).join(', '))+(weg.length>6?' …':''):'Alle da'}${s.n?' · '+svEsc(s.n.slice(0,80)):''}</span></div>
      <div class="trs-n"><b>${da}</b><span>da</span></div></button>`; }).join('')}</div>`:'<div class="empty">Noch keine Einheiten erfasst.</div>'}</div>`;
  B.querySelectorAll('[data-edit-s]').forEach(b=>b.onclick=()=>trSessionEditor(null,b.dataset.editS));
}
let trSort='rate';
function trViewPlayers(B){
  const today=trToday(), rows=trSquad().map(p=>({p,s:TRC.playerStats(TR.st,p.id,today)}));
  const key={rate:x=>x.s.rate28==null?2:x.s.rate28,season:x=>x.s.rateSeason==null?2:x.s.rateSeason,ohne:x=>-x.s.ohne28,name:x=>x.p.name,mot:x=>x.s.mot[0]?x.s.mot[0].v:9};
  rows.sort((a,b)=>{ const ka=key[trSort](a), kb=key[trSort](b); return ka<kb?-1:ka>kb?1:0; });
  const th=(k,t)=>`<th><button data-sort="${k}" class="${trSort===k?'on':''}">${t}</button></th>`;
  B.innerHTML=`<div class="card"><div class="trtw"><table class="trtab"><thead><tr>${th('name','Spieler')}<th>Pos</th>${th('rate','4 Wochen')}${th('season','12 Monate')}<th>Trend</th>${th('ohne','Ohne Grund')}${th('mot','Motivation')}<th>Fitness</th><th>Status</th></tr></thead><tbody>
    ${rows.map(({p,s})=>{ const tr=s.rate28!=null&&s.ratePrev!=null?s.rate28-s.ratePrev:null;
      return `<tr data-svp="${svEsc(p.id)}"><td><b>${svEsc(p.name)}</b>${p.kader===2?' <small>II</small>':''}</td><td>${svEsc(p.pos||'–')}</td>
      <td><span class="trpill ${trRateCls(s.rate28)}">${trPct(s.rate28)}</span> <small>${s.n28}×</small></td><td>${trPct(s.rateSeason)}</td>
      <td>${tr==null?'–':`<b class="${tr>=0?'ok':'bad'}">${tr>=0.05?'▲':tr<=-0.05?'▼':'▶'}</b>`}</td><td>${s.ohne28?`<b class="bad">${s.ohne28}</b>`:'0'}</td>
      <td>${s.mot.length?trDots(s.mot.map(m=>m.v)):'–'}</td><td>${s.fit.length?trDots(s.fit.map(m=>m.v)):'–'}</td>
      <td>${s.injury?`<span class="trpill bad">🩹 ${svEsc(s.injury.dg)}</span>`:s.lastSeen?`<small>zuletzt ${TRC.fmt(s.lastSeen)}</small>`:'–'}</td></tr>`; }).join('')}</tbody></table></div>
    <div class="note">Beteiligung = anwesend ÷ Einheiten, bei denen der Spieler erfasst ist (verletzt/krank/„in der Zweiten“ zählen nicht dagegen).</div></div>`;
  B.querySelectorAll('[data-sort]').forEach(b=>b.onclick=e=>{ e.stopPropagation(); trSort=b.dataset.sort; trViewPlayers(B); });
  B.querySelectorAll('tr[data-svp]').forEach(r=>r.onclick=()=>openModal(r.dataset.svp));
}
function trViewInjuries(B){
  const today=trToday(), act=TR.st.injuries.filter(i=>!i.z), hist=TR.st.injuries.filter(i=>i.z);
  const byArt={}; TR.st.injuries.filter(i=>TRC.diffDays(today,i.b)<=365).forEach(i=>byArt[i.art||'sonstiges']=(byArt[i.art||'sonstiges']||0)+1);
  const daysOut=hist.filter(i=>TRC.diffDays(today,i.b)<=365).reduce((a,i)=>a+TRC.diffDays(i.z,i.b),0);
  B.innerHTML=`<div class="card"><h3 class="trh">${SVI('shield')} Aktuell verletzt (${act.length})</h3>${act.length?`<div class="trinjl">${act.map(i=>trInjRow(trP(i.p)||{id:i.p,name:i.p},i)).join('')}</div>`:'<div class="note">Niemand verletzt.</div>'}</div>
    <div class="card"><h3 class="trh">${SVI('chart')} Letzte 12 Monate</h3><div class="trart">${Object.entries(byArt).map(([k,n])=>`<span><b>${n}</b> ${svEsc(TRC.ART[k]||k)}</span>`).join('')||'<span class="note">keine</span>'}<span><b>${daysOut}</b> Ausfalltage (abgeschlossen)</span></div></div>
    <div class="card"><h3 class="trh">Verlauf</h3>${hist.length?`<div class="trhist">${hist.slice(0,80).map(i=>`<div class="trh-r" data-inj-ed="${i.id}"><b>${svEsc(trName(i.p))}</b><span>${svEsc(i.dg)}${i.kt?' · '+svEsc(i.kt):''}</span><em>${TRC.fmt(i.b)}${i.b.slice(2,4)} – ${TRC.fmt(i.z)}${i.z.slice(2,4)} · ${TRC.diffDays(i.z,i.b)} T</em></div>`).join('')}</div>`:'<div class="note">Noch keine abgeschlossenen Verletzungen.</div>'}</div>`;
  trWireInj(B);
  B.querySelectorAll('.trh-r[data-inj-ed]').forEach(r=>r.onclick=()=>trInjuryEditor(r.dataset.injEd));
}

/* ---------- Einheit bearbeiten ---------- */
function trSessionEditor(datum,sid,typ0){
  const s0=sid?TR.st.sessions.find(s=>s.id===sid):trSessionOn(datum||trToday(),typ0||'training');
  const st={id:s0&&s0.id,datum:s0?s0.d:(datum||trToday()),typ:s0?s0.t:(typ0||'training'),fokus:new Set(s0?s0.f||[]:[]),i:s0?s0.i:null,s:s0?s0.s:null,n:s0?s0.n||'':'',
    g:s0?s0.g||'':'',h:s0?s0.h:null,tw:s0&&s0.tw!=null?s0.tw:'',tg:s0&&s0.tg!=null?s0.tg:'',
    rows:{}, orig:new Set(), open:null, extra:[]};
  (s0&&s0.a||[]).forEach(a=>{ st.rows[a[0]]={status:a[1],grund:a[2],motivation:a[3],fitness:a[4],notiz:a[5]||'',tore:a[6]||0,vorlagen:a[7]||0}; st.orig.add(a[0]); if(!trSquad().some(p=>p.id===a[0]))st.extra.push(a[0]); });
  if(TR.prefill&&TR.prefill.datum===st.datum){ Object.entries(TR.prefill.rows||{}).forEach(([id,r])=>{ if(!trP(id))return; const cur=st.rows[id]; if(cur&&cur.status)return; st.rows[id]=Object.assign({},cur||{},r); if(!trSquad().some(p=>p.id===id)&&!st.extra.includes(id))st.extra.push(id); }); TR.prefill=null; }
  const M=svModal(`<div class="mhead"><div class="rm-ic" style="width:46px;height:46px">${SVI('activity')}</div><div><h2 style="margin:0">${s0?(s0.t==='spiel'?'Spiel bearbeiten':'Einheit bearbeiten'):(typ0==='spiel'?'Spiel erfassen':'Training erfassen')}</h2><div class="msub">${typ0==='spiel'||(s0&&s0.t==='spiel')?'Ergebnis, Aufstellung, Tore & Vorlagen – zählt für Allzeit-Statistik und Moneyball-Auswertung':'Anwesenheit, Gründe, Eindruck – für alle gespeichert'}</div></div></div><div id="trEd"></div>`);
  const draw=()=>{
    const E=document.getElementById('trEd'); if(!E)return;
    const list=[...trSquad(),...st.extra.map(trP).filter(Boolean).filter(p=>!trSquad().includes(p))];
    const cnt={da:0,spaet:0,weg:0,bank:0,zuschauer:0,offen:0}; list.forEach(p=>{ const r=st.rows[p.id]; if(r&&r.status)cnt[r.status]++; else cnt.offen++; });
    const G=st.typ==='spiel', OPTS=G?[['da','Startelf'],['spaet','Eingewechselt'],['bank','Kader'],['zuschauer','Zugeschaut'],['weg','Nicht da']]:[['da','Da'],['spaet','Spät'],['weg','Fehlt']], spielt=r=>r&&(r.status==='da'||r.status==='spaet');
    const step=(id,k,v)=>`<span class="trstep"><em>${k==='tore'?'⚽ Tore':'🅰️ Vorl.'}</em><button type="button" data-step="${svEsc(id)}:${k}:-1">−</button><b>${v||0}</b><button type="button" data-step="${svEsc(id)}:${k}:1">+</button></span>`;
    const sumT=Object.values(st.rows).reduce((a,r)=>a+(spielt(r)?(r.tore||0):0),0);
    E.innerHTML=`<div class="tred-top">
        <div class="field"><label>Datum</label><input type="date" id="trD" value="${svEsc(st.datum)}" max="${TRC.addDays(trToday(),14)}"></div>
        <div class="field"><label>Art</label><select id="trT">${[['training','Training'],['spiel','Spiel'],['test','Testspiel'],['sonstiges','Sonstiges']].map(([k,t])=>`<option value="${k}"${st.typ===k?' selected':''}>${t}</option>`).join('')}</select></div></div>
      ${G?`<div class="sbsec trmatch"><h4>Spiel</h4><div class="trm-row"><div class="field"><label>Gegner</label><input id="trG" maxlength="80" value="${svEsc(st.g)}" placeholder="z.B. VfR Fehlheim II"></div>
          <div class="trseg trha"><button type="button" data-ha="1" class="${st.h===true?'on':''}">Heim</button><button type="button" data-ha="0" class="${st.h===false?'on':''}">Auswärts</button></div></div>
        <div class="trres"><input id="trTW" type="number" min="0" max="40" inputmode="numeric" value="${svEsc(String(st.tw))}" aria-label="Tore wir"><span>:</span><input id="trTG" type="number" min="0" max="40" inputmode="numeric" value="${svEsc(String(st.tg))}" aria-label="Tore Gegner"><small>${st.tw!==''&&st.tg!==''?(+st.tw>+st.tg?'Sieg':+st.tw===+st.tg?'Unentschieden':'Niederlage'):'Ergebnis (wir : Gegner)'}${sumT&&st.tw!==''&&sumT>+st.tw?` · <b class="bad">${sumT} Torschützen > ${st.tw} Tore</b>`:''}</small></div></div>`:''}
      <div class="sbsec"${G?' style="display:none"':''}><h4>Inhalt</h4><div class="chips">${Object.entries(TRC.FOKUS).map(([k,t])=>`<button type="button" class="pchip${st.fokus.has(k)?' on':''}" data-fk="${k}">${t}</button>`).join('')}</div>
        <div class="trscale"><span>Intensität</span>${[1,2,3,4,5].map(n=>`<button type="button" data-int="${n}" class="${st.i===n?'on':''}">${n}</button>`).join('')}<small>${['','sehr locker','locker','mittel','intensiv','sehr intensiv'][st.i||0]||''}</small></div>
        <div class="trscale"><span>Eindruck</span>${[1,2,3,4,5].map(n=>`<button type="button" data-st="${n}" class="${st.s===n?'on s'+n:''}">${n}</button>`).join('')}<small>${['','schwach','zäh','ok','gut','top'][st.s||0]||''}</small></div>
        <div class="field" style="margin-top:8px"><label>Notiz zur Einheit</label><input id="trN" maxlength="2000" value="${svEsc(st.n)}" placeholder="z.B. sehr laufintensiv, gute Stimmung, Standards geübt"></div></div>
      <div class="sbsec"><h4>${G?'Kader':'Anwesenheit'} <small>${G?`${cnt.da} Startelf · ${cnt.spaet} eingewechselt · ${cnt.bank} Kader · ${cnt.zuschauer} zugeschaut · ${cnt.weg} nicht da`:`${cnt.da} da · ${cnt.spaet} spät · ${cnt.weg} fehlen`}${cnt.offen?' · '+cnt.offen+' offen':''}</small></h4>
        <div class="btnrow" style="margin-bottom:8px">${G?((typeof fbSpielAm==='function'&&fbSpielAm(st.datum)?'<button type="button" class="btn sm" id="trFB">Aus Spielbericht übernehmen</button>':'')+(typeof LINEUP!=='undefined'&&LINEUP.slots&&Object.values(LINEUP.slots).some(Boolean)?'<button type="button" class="btn ghost sm" id="trXI">Aktuelle Aufstellung übernehmen</button>':'')):'<button type="button" class="btn ghost sm" id="trAll">Alle offenen = da</button>'}<button type="button" class="btn ghost sm" id="trAdd">${SVI('plus')} Spieler aus der Zweiten</button></div>
        <div class="tratt">${list.map(p=>{ const r=st.rows[p.id]||{}, o=st.open===p.id;
          return `<div class="trr${r.status?' s-'+r.status:''}"><div class="trr-h"><span class="trr-n" data-open-r="${svEsc(p.id)}"><b>${svEsc(p.name)}</b><em>${svEsc(p.pos||'')}${p.kader===2?' · II':''}${trInjury(p.id)?' · 🩹':''}${r.motivation?' · M'+r.motivation:''}${r.fitness?' · F'+r.fitness:''}</em></span>
            <div class="trseg${G?' trseg5':''}">${OPTS.map(([k,t])=>`<button type="button" data-set="${svEsc(p.id)}:${k}" class="${r.status===k?'on':''}">${t}</button>`).join('')}</div></div>
            ${G&&spielt(r)?`<div class="trsteps">${step(p.id,'tore',r.tore)}${step(p.id,'vorlagen',r.vorlagen)}</div>`:''}
            ${r.status==='weg'?`<div class="trg">${Object.entries(TRC.REASONS).map(([k,t])=>`<button type="button" data-gr="${svEsc(p.id)}:${k}" class="${r.grund===k?'on'+(k==='ohne'?' warn':''):''}">${t}</button>`).join('')}</div>`:''}
            ${o?`<div class="trx"><div class="trscale"><span>Motivation</span>${[1,2,3,4,5].map(n=>`<button type="button" data-mo="${svEsc(p.id)}:${n}" class="${r.motivation===n?'on s'+n:''}">${n}</button>`).join('')}</div>
              <div class="trscale"><span>Fitness/Frische</span>${[1,2,3,4,5].map(n=>`<button type="button" data-fi="${svEsc(p.id)}:${n}" class="${r.fitness===n?'on s'+n:''}">${n}</button>`).join('')}</div>
              <input data-no="${svEsc(p.id)}" maxlength="500" value="${svEsc(r.notiz||'')}" placeholder="Notiz, z.B. „sehr lustlos“, „stark im Abschlussspiel“"></div>`:`<button type="button" class="trr-more" data-open-r="${svEsc(p.id)}">+ Motivation, Fitness, Notiz</button>`}</div>`; }).join('')}</div></div>
      <div class="btnrow sbact"><button class="btn" type="button" id="trSave">Für alle speichern</button><button class="btn ghost" type="button" id="trCancel">Abbrechen</button>${st.id?`<button class="btn ghost" type="button" id="trDel" style="margin-left:auto;color:#fca5a5">Einheit löschen</button>`:''}</div>`;
    const keep=()=>{ const d=document.getElementById('trD'), t=document.getElementById('trT'), n=document.getElementById('trN'); if(d)st.datum=d.value||st.datum; if(t)st.typ=t.value; if(n)st.n=n.value;
      const g=document.getElementById('trG'), tw=document.getElementById('trTW'), tg=document.getElementById('trTG'); if(g)st.g=g.value; if(tw)st.tw=tw.value; if(tg)st.tg=tg.value;
      E.querySelectorAll('[data-no]').forEach(i=>{ const r=st.rows[i.dataset.no]=st.rows[i.dataset.no]||{}; r.notiz=i.value; }); };
    document.getElementById('trT').onchange=()=>{ keep(); draw(); };
    ['trTW','trTG'].forEach(i=>{ const x=document.getElementById(i); if(x)x.oninput=()=>{ keep(); const sm=E.querySelector('.trres small'); if(sm)sm.textContent=st.tw!==''&&st.tg!==''?(+st.tw>+st.tg?'Sieg':+st.tw===+st.tg?'Unentschieden':'Niederlage'):'Ergebnis (wir : Gegner)'; }; });
    E.querySelectorAll('[data-ha]').forEach(b=>b.onclick=()=>{ keep(); const v=b.dataset.ha==='1'; st.h=st.h===v?null:v; draw(); });
    E.querySelectorAll('[data-step]').forEach(b=>b.onclick=()=>{ keep(); const [id,k,dv]=b.dataset.step.split(':'); const r=st.rows[id]=st.rows[id]||{}; r[k]=Math.max(0,Math.min(20,(r[k]||0)+(+dv))); draw(); });
    if(document.getElementById('trFB'))document.getElementById('trFB').onclick=()=>{ keep(); const R=fbSpielAm(st.datum); let n=0; Object.entries(R.rows).forEach(([id,x])=>{ const r=st.rows[id]=st.rows[id]||{}; if(r.status==='weg'||r.status==='zuschauer')return; r.status=x.status; r.grund=null; if(x.tore)r.tore=x.tore; if(!list.some(p=>p.id===id)&&!st.extra.includes(id))st.extra.push(id); n++; });
      if(!st.g&&R.gegner)st.g=R.gegner; if(st.h==null&&R.heim!=null)st.h=R.heim; draw(); kToast(`✓ ${n} Spieler aus dem Spielbericht übernommen${R.fehlt?` · ${R.fehlt} nicht zugeordnet`:''}`); };
    if(document.getElementById('trXI'))document.getElementById('trXI').onclick=()=>{ keep(); const xi=new Set(Object.values(LINEUP.slots||{}).filter(Boolean)); list.forEach(p=>{ if(xi.has(p.id)){ const r=st.rows[p.id]=st.rows[p.id]||{}; r.status='da'; r.grund=null; } }); draw(); };
    E.querySelectorAll('[data-fk]').forEach(b=>b.onclick=()=>{ keep(); const k=b.dataset.fk; if(st.fokus.has(k))st.fokus.delete(k); else st.fokus.add(k); draw(); });
    E.querySelectorAll('[data-int]').forEach(b=>b.onclick=()=>{ keep(); const n=+b.dataset.int; st.i=st.i===n?null:n; draw(); });
    E.querySelectorAll('[data-st]').forEach(b=>b.onclick=()=>{ keep(); const n=+b.dataset.st; st.s=st.s===n?null:n; draw(); });
    E.querySelectorAll('[data-set]').forEach(b=>b.onclick=()=>{ keep(); const [id,v]=b.dataset.set.split(':'); const r=st.rows[id]=st.rows[id]||{}; r.status=r.status===v?null:v; if(v==='weg'&&r.status&&!r.grund)r.grund=trInjury(id)?'verletzt':null; if(r.status!=='weg')r.grund=null; draw(); });
    E.querySelectorAll('[data-gr]').forEach(b=>b.onclick=()=>{ keep(); const [id,g]=b.dataset.gr.split(':'); st.rows[id].grund=g; draw(); });
    E.querySelectorAll('[data-mo]').forEach(b=>b.onclick=()=>{ keep(); const [id,n]=b.dataset.mo.split(':'); const r=st.rows[id]=st.rows[id]||{}; r.motivation=r.motivation===+n?null:+n; if(!r.status)r.status='da'; draw(); });
    E.querySelectorAll('[data-fi]').forEach(b=>b.onclick=()=>{ keep(); const [id,n]=b.dataset.fi.split(':'); const r=st.rows[id]=st.rows[id]||{}; r.fitness=r.fitness===+n?null:+n; if(!r.status)r.status='da'; draw(); });
    E.querySelectorAll('[data-open-r]').forEach(b=>b.onclick=()=>{ keep(); st.open=st.open===b.dataset.openR?null:b.dataset.openR; draw(); });
    if(document.getElementById('trAll'))document.getElementById('trAll').onclick=()=>{ keep(); list.forEach(p=>{ const r=st.rows[p.id]=st.rows[p.id]||{}; if(!r.status)r.status=trInjury(p.id)?'weg':'da'; if(r.status==='weg'&&!r.grund)r.grund='verletzt'; }); draw(); };
    document.getElementById('trAdd').onclick=()=>{ keep(); const cand=players.filter(p=>p.own&&!p.isJugend&&p.kader===2&&!list.includes(p)).sort((a,b)=>a.name.localeCompare(b.name,'de'));
      const nm=prompt('Name des Spielers (2. Mannschaft/Gast):\n'+cand.slice(0,30).map(p=>p.name).join(', ')); if(!nm)return;
      const k=TRC.N(nm), hit=cand.find(p=>TRC.N(p.name)===k)||cand.find(p=>TRC.N(p.name).includes(k)); if(!hit)return kToast('Kein Spieler der Zweiten mit diesem Namen'); st.extra.push(hit.id); st.rows[hit.id]={status:'da'}; draw(); };
    document.getElementById('trCancel').onclick=()=>closeOverlay();
    if(document.getElementById('trDel'))document.getElementById('trDel').onclick=async()=>{ if(!confirm('Diese Einheit samt Anwesenheit löschen?'))return; try{ await trDeleteSession(st.id); closeOverlay(); kToast('Einheit gelöscht'); }catch(e){ kToast('⚠️ '+e.message); } };
    document.getElementById('trSave').onclick=async()=>{ keep();
      const miss=Object.entries(st.rows).filter(([,r])=>r.status==='weg'&&!r.grund); if(miss.length){ kToast('Bitte Grund angeben: '+miss.map(([id])=>trShort(id)).join(', ')); return; }
      const sp=[]; Object.entries(st.rows).forEach(([id,r])=>{ if(r.status)sp.push(Object.assign({player_id:id,status:r.status,grund:r.status==='weg'?r.grund:null,motivation:r.motivation||null,fitness:r.fitness||null,notiz:(r.notiz||'').trim()||null},st.typ==='spiel'?{tore:(r.status==='da'||r.status==='spaet')&&r.tore||null,vorlagen:(r.status==='da'||r.status==='spaet')&&r.vorlagen||null}:{})); else if(st.orig.has(id))sp.push({player_id:id,status:''}); });
      if(st.typ==='spiel'&&((st.tw==='')!==(st.tg===''))){ kToast('Bitte beide Ergebnis-Felder ausfüllen (oder beide leer lassen)'); return; }
      if(s0&&(s0.d!==st.datum||s0.t!==st.typ)){ try{ await trDeleteSession(s0.id); }catch(e){} }
      const b=document.getElementById('trSave'); b.disabled=true; b.textContent='Speichert …';
      try{ await trSaveSession(Object.assign({datum:st.datum,typ:st.typ,fokus:[...st.fokus],intensitaet:st.i,stimmung:st.s,notiz:st.n.trim()||null,spieler:sp},
          st.typ==='spiel'?{gegner:st.g.trim()||null,heim:st.h,tore_wir:st.tw===''?null:+st.tw,tore_gegner:st.tg===''?null:+st.tg}:{}));
        closeOverlay(); kToast(st.typ==='spiel'?'✓ Spiel vom '+TRC.fmt(st.datum)+' gespeichert':'✓ Einheit vom '+TRC.fmt(st.datum)+' gespeichert – '+sp.filter(x=>x.status==='weg').length+' fehlten'); }
      catch(e){ b.disabled=false; b.textContent='Für alle speichern'; kToast('⚠️ '+e.message); } };
  };
  draw();
}

/* ---------- Verletzung bearbeiten ---------- */
function trInjuryEditor(id,pid){
  const i0=id?TR.st.injuries.find(x=>x.id===id):null;
  const st=i0?{id:i0.id,player_id:i0.p,diagnose:i0.dg,art:i0.art||'',koerperteil:i0.kt||'',beginn:i0.b,prognose:i0.pr||'',zurueck:i0.z||'',notiz:i0.n||''}
    :{player_id:pid||'',diagnose:'',art:'',koerperteil:'',beginn:trToday(),prognose:'',zurueck:'',notiz:''};
  const sq=trSquad();
  svModal(`<div class="mhead"><div class="rm-ic" style="width:46px;height:46px">${SVI('shield')}</div><div><h2 style="margin:0">${i0?'Verletzung bearbeiten':'Verletzung eintragen'}</h2><div class="msub">Gesundheitsdaten – sichtbar nur fürs Trainerteam und den Vorstand</div></div></div>
    <div class="editgrid" style="margin-top:14px">
      <div class="field" style="grid-column:1/-1"><label>Spieler</label><select id="ijP"><option value="">– wählen –</option>${sq.map(p=>`<option value="${svEsc(p.id)}"${st.player_id===p.id?' selected':''}>${svEsc(p.name)}</option>`).join('')}</select></div>
      <div class="field" style="grid-column:1/-1"><label>Diagnose / Beschwerden</label><input id="ijD" maxlength="200" value="${svEsc(st.diagnose)}" placeholder="z.B. Zerrung hinterer Oberschenkel links"></div>
      <div class="field"><label>Art</label><select id="ijA"><option value="">–</option>${Object.entries(TRC.ART).map(([k,t])=>`<option value="${k}"${st.art===k?' selected':''}>${t}</option>`).join('')}</select></div>
      <div class="field"><label>Körperteil</label><input id="ijK" maxlength="60" value="${svEsc(st.koerperteil)}" placeholder="z.B. Knie rechts"></div>
      <div class="field"><label>Seit</label><input type="date" id="ijB" value="${svEsc(st.beginn)}"></div>
      <div class="field"><label>Voraussichtlich zurück</label><input type="date" id="ijPr" value="${svEsc(st.prognose)}"><div class="trquick">${[1,2,3,4,6,8].map(w=>`<button type="button" data-w="${w}">+${w} W</button>`).join('')}</div></div>
      <div class="field"><label>Wieder im Training am</label><input type="date" id="ijZ" value="${svEsc(st.zurueck)}"></div>
      <div class="field" style="grid-column:1/-1"><label>Notiz</label><input id="ijN" maxlength="1000" value="${svEsc(st.notiz)}" placeholder="z.B. Arzttermin Do, Physio 2× pro Woche"></div>
    </div>
    <div class="note" style="margin-top:8px">Der Co-Trainer gibt auf Wunsch eine grobe Einschätzung zu typischen Ausfallzeiten – ersetzt aber nie Arzt oder Physio.</div>
    <div class="btnrow sbact"><button class="btn" id="ijSave">Speichern</button><button class="btn ghost" id="ijCancel">Abbrechen</button>${i0?'<button class="btn ghost" id="ijDel" style="margin-left:auto;color:#fca5a5">Löschen</button>':''}</div>`);
  const $i=x=>document.getElementById(x);
  document.querySelectorAll('.trquick [data-w]').forEach(b=>b.onclick=()=>{ $i('ijPr').value=TRC.addDays($i('ijB').value||trToday(),+b.dataset.w*7); });
  $i('ijCancel').onclick=()=>closeOverlay();
  if($i('ijDel'))$i('ijDel').onclick=async()=>{ if(!confirm('Eintrag löschen?'))return; try{ await trDeleteInjury(i0.id); closeOverlay(); kToast('Gelöscht'); }catch(e){ kToast('⚠️ '+e.message); } };
  $i('ijSave').onclick=async()=>{
    const v={id:st.id,player_id:$i('ijP').value,diagnose:$i('ijD').value.trim(),art:$i('ijA').value||null,koerperteil:$i('ijK').value.trim()||null,beginn:$i('ijB').value,prognose:$i('ijPr').value||null,zurueck:$i('ijZ').value||null,notiz:$i('ijN').value.trim()||null};
    if(!v.player_id||!v.diagnose||!v.beginn)return kToast('Bitte Spieler, Diagnose und Beginn angeben');
    try{ await trSaveInjury(v); closeOverlay(); kToast('✓ Verletzung von '+trShort(v.player_id)+' gespeichert'); }catch(e){ kToast('⚠️ '+e.message); } };
}

/* ---------- Spielerprofil: Training & Fitness ---------- */
function trProfile(pid){
  if(!canTraining()||!TR.loaded)return;
  const M=document.getElementById('modal'), p=trP(pid); if(!M||!p||M.querySelector('.trprof'))return;
  const s=TRC.playerStats(TR.st,pid,trToday()); if(!p.own&&!s.rows.length&&!s.injuries.length)return;
  const anchor=M.querySelector('.sbwrap')||M.querySelector('.svpos-box')||M.querySelector('.mhead'); if(!anchor)return;
  const abs=s.rows.filter(r=>r.st==='weg').slice(0,6);
  const el=document.createElement('div'); el.className='card trprof';
  el.innerHTML=`<div class="trprof-h"><h3 class="trh">${SVI('activity')} Training &amp; Fitness</h3><div class="btnrow"><button class="btn ghost sm" data-pr-rate>Bewerten</button><button class="btn ghost sm" data-pr-inj>${SVI('plus')} Verletzung</button></div></div>
    ${s.injury?`<div class="trinj over" style="margin-bottom:10px"><div class="trinj-b"><b>🩹 ${svEsc(s.injury.dg)}</b><span>seit ${TRC.fmt(s.injury.b)}${s.injury.pr?' · Prognose '+TRC.fmt(s.injury.pr):''}</span></div><div class="trinj-a"><button class="btn sm" data-inj-fit="${s.injury.id}">Wieder fit</button></div></div>`:''}
    <div class="trkpi"><div><b class="${trRateCls(s.rate28)}">${trPct(s.rate28)}</b><span>Beteiligung 4 W. (${s.n28})</span></div><div><b>${trPct(s.rateSeason)}</b><span>12 Monate</span></div>
      <div><b class="${s.ohne28?'bad':''}">${s.ohne28}</b><span>ohne Grund (4 W.)</span></div><div><b>${s.lastSeen?TRC.fmt(s.lastSeen):'–'}</b><span>zuletzt da</span></div></div>
    ${s.mot.length||s.fit.length?`<div class="trmf">${s.mot.length?`<div><span>Motivation</span>${trDots(s.mot.map(m=>m.v))}</div>`:''}${s.fit.length?`<div><span>Fitness</span>${trDots(s.fit.map(m=>m.v))}</div>`:''}</div>`:''}
    ${abs.length?`<div class="trabs"><span>Zuletzt gefehlt:</span> ${abs.map(r=>`<i class="${r.g==='ohne'?'bad':''}">${TRC.fmt(r.d)} ${svEsc(TRC.REASONS[r.g]||r.g)}</i>`).join('')}</div>`:''}
    ${s.rows.filter(r=>r.n).slice(0,3).map(r=>`<div class="trnote">„${svEsc(r.n)}“ <small>${TRC.fmt(r.d)}</small></div>`).join('')}
    ${s.injuries.filter(i=>i.z).length?`<div class="trabs"><span>Verletzungshistorie:</span> ${s.injuries.filter(i=>i.z).slice(0,6).map(i=>`<i>${svEsc(i.dg)} (${TRC.fmt(i.b)}${i.b.slice(2,4)}, ${TRC.diffDays(i.z,i.b)} T)</i>`).join('')}</div>`:''}
    ${!s.rows.length&&!s.injuries.length?'<div class="note">Noch keine Trainingsdaten für diesen Spieler.</div>':''}`;
  anchor.after(el);
  el.querySelector('[data-pr-inj]').onclick=()=>trInjuryEditor(null,pid);
  el.querySelector('[data-pr-rate]').onclick=()=>trQuickRate(pid);
  el.querySelectorAll('[data-inj-fit]').forEach(b=>b.onclick=async()=>{ try{ await trCloseInjury(b.dataset.injFit,trToday()); openModal(pid); kToast('✓ Wieder fit'); }catch(e){ kToast('⚠️ '+e.message); } });
}
function trQuickRate(pid){
  const p=trP(pid); let mo=null, fi=null;
  svModal(`<div class="mhead">${avaHtml(p)}<div><h2 style="margin:0">${svEsc(p.name)}</h2><div class="msub">Eindruck aus dem Training</div></div></div>
    <div class="field" style="margin-top:12px"><label>Datum</label><input type="date" id="qrD" value="${trToday()}"></div>
    <div class="trscale" id="qrM"><span>Motivation</span>${[1,2,3,4,5].map(n=>`<button type="button" data-v="${n}">${n}</button>`).join('')}</div>
    <div class="trscale" id="qrF"><span>Fitness/Frische</span>${[1,2,3,4,5].map(n=>`<button type="button" data-v="${n}">${n}</button>`).join('')}</div>
    <div class="field"><label>Notiz</label><input id="qrN" maxlength="500" placeholder="z.B. sehr lustlos, stark im Abschlussspiel"></div>
    <div class="btnrow sbact"><button class="btn" id="qrS">Speichern</button><button class="btn ghost" id="qrC">Zurück</button></div>`);
  const sel=(box,cb)=>document.querySelectorAll('#'+box+' [data-v]').forEach(b=>b.onclick=()=>{ document.querySelectorAll('#'+box+' [data-v]').forEach(x=>x.className=''); b.className='on s'+b.dataset.v; cb(+b.dataset.v); });
  sel('qrM',v=>mo=v); sel('qrF',v=>fi=v);
  document.getElementById('qrC').onclick=()=>openModal(pid);
  document.getElementById('qrS').onclick=async()=>{ const d=document.getElementById('qrD').value||trToday(), n=document.getElementById('qrN').value.trim();
    if(!mo&&!fi&&!n)return kToast('Bitte etwas bewerten');
    try{ await trSaveSession({datum:d,typ:'training',spieler:[Object.assign({player_id:pid,status:'da'},mo?{motivation:mo}:{},fi?{fitness:fi}:{},n?{notiz:n}:{})]}); openModal(pid); kToast('✓ Bewertung gespeichert'); }catch(e){ kToast('⚠️ '+e.message); } };
}
{ const _om4=openModal; openModal=function(){ const r=_om4.apply(this,arguments); try{ trProfile(arguments[0]); }catch(e){ console.warn('Training-Profil',e); } return r; }; }

/* ---------- Aufstellung: Verletzte markieren ---------- */
{ const _lc2=lineupCardHtml; lineupCardHtml=function(p){ let h=_lc2.apply(this,arguments); try{ const i=trInjury(p.id); if(i)h=h.replace('<div class="fcardm"','<div class="fcardm trhurt" title="Verletzt: '+svEsc(i.dg)+'"').replace(/<\/div>$/,'<span class="trhurt-b">🩹</span></div>'); }catch(e){} return h; }; }
{ const _fr=sbFitRow; sbFitRow=function(){ const r=_fr.apply(this,arguments); try{
    const el=document.getElementById('sbFitRow'); if(!el||!TR.loaded)return r; const F=FORMATIONS[LINEUP.formation];
    const hurt=F.map((s,i)=>trP(LINEUP.slots[i])).filter(p=>p&&trInjury(p.id));
    if(hurt.length){ const box=el.querySelector('.sbfitbox'); if(box){ box.classList.remove('good'); box.classList.add('warn');
      box.querySelector('.sbfit-t').insertAdjacentHTML('beforeend',`<span>🩹 Verletzt: ${hurt.map(p=>`<b>${svEsc(p.name.split(' ').pop())}</b> (${svEsc(trInjury(p.id).dg)})`).join(' · ')}</span>`); } }
  }catch(e){} return r; }; }

/* ---------- Übersicht: Co-Trainer-Karte ---------- */
function trHomeCard(){
  const host=document.getElementById('svRemind')||document.getElementById('svHello'); if(!host||!canTraining())return;
  let el=document.getElementById('trHome'); if(!el){ el=document.createElement('div'); el.id='trHome'; host.after(el); }
  if(!TR.loaded){ el.innerHTML=''; return; }
  const al=trAlerts().filter(a=>a.lvl!=='info').slice(0,3), T=TRC.teamStats(TR.st,trToday(),trSquad().map(p=>p.id));
  el.innerHTML=`<div class="card trhome"><div class="rm-h"><div class="rm-ic co">${SVI('chat')}</div><div class="rm-t"><h3>Co-Trainer</h3><p>${TR.st.sessions.length?`Trainingsbeteiligung 3 Wochen: <b>${trPct(T.r21.rate)}</b>`+(al.length?` · ${al.length} Hinweis${al.length>1?'e':''}`:' · alles im grünen Bereich'):'Noch keine Einheiten – einfach nach dem Training reinsprechen.'}</p></div>
    <button class="btn sm" data-home-chat>${SVI('chat')} Fragen / eintragen</button></div>${al.map(a=>trAlertHtml(a,true)).join('')}
    <div class="rm-f"><button class="btn ghost" data-home-tr>Training öffnen →</button></div></div>`;
  el.querySelector('[data-home-chat]').onclick=()=>trChatOpen();
  el.querySelector('[data-home-tr]').onclick=()=>goTab('training');
  el.querySelectorAll('[data-svp]').forEach(x=>x.onclick=()=>openModal(x.dataset.svp));
}

/* ---------- Co-Trainer-Chat ---------- */
function trSquadLite(){ return trSquad().map(p=>({id:p.id,name:p.name})); }
function trGreeting(){
  const al=trAlerts(), fn=svFirst(SVU.name)||'Coach', h=new Date().getHours(), g=h<11?'Guten Morgen':h<17?'Hi':'Guten Abend';
  const todayS=trSessionOn(trToday());
  let t=`${g} ${fn}! `;
  if(al.length)t+=`Mir fällt gerade auf:\n${al.slice(0,3).map(a=>'• '+a.t+' – '+a.d).join('\n')}\n\n`;
  else t+='Aktuell keine Auffälligkeiten im Training. ';
  t+=todayS?'Das heutige Training ist schon eingetragen – willst du noch Eindrücke zu einzelnen Spielern ergänzen?':'Wie war das Training? Sag mir einfach, wer gefehlt hat und warum – oder wer besonders auffiel.';
  return t;
}
function trChatOpen(){
  if(!canTraining())return;
  if(!TR.chat.length)TR.chat.push({role:'assistant',content:TR.loaded?trGreeting():'Hallo! Einen Moment, ich lade die Trainingsdaten …',local:true});
  const M=svModal(`<div class="trchat"><div class="trc-h"><div class="rm-ic co">${SVI('chat')}</div><div><h2 style="margin:0">Co-Trainer</h2><div class="msub" id="trcMode"></div></div></div>
    <div class="trc-log" id="trcLog"></div>
    <div class="trc-sug" id="trcSug"></div>
    <div class="trc-att" id="trcAtt"></div>
    <form class="trc-in" id="trcForm"><textarea id="trcTxt" rows="1" placeholder="z.B. „Seltenreich und Garotti waren heute nicht da, Simon hat eine Zerrung“"></textarea>
      <input type="file" id="trcFile" accept="image/*,.txt,.csv,.xlsx,.xlsm" multiple hidden>
      <button type="button" class="iconbtn trc-clip" id="trcClip" title="Screenshot oder Datei (z.B. WhatsApp-Export)">📎</button>
      <button type="button" class="iconbtn trc-mic" id="trcMic" title="Sprechen">🎙️</button><button type="submit" class="btn" id="trcGo">Senden</button></form></div>`);
  M.classList.add('trchatmodal');
  trChatDraw(); trChatMode();
  const ta=document.getElementById('trcTxt');
  ta.addEventListener('input',()=>{ ta.style.height='auto'; ta.style.height=Math.min(140,ta.scrollHeight)+'px'; });
  ta.addEventListener('keydown',e=>{ if(e.key==='Enter'&&!e.shiftKey){ e.preventDefault(); document.getElementById('trcForm').requestSubmit(); } });
  document.getElementById('trcForm').onsubmit=e=>{ e.preventDefault(); const v=ta.value.trim(); if((!v&&!trAttHas())||TR.chatBusy)return; ta.value=''; ta.style.height='auto'; trChatSend(v); };
  trMicSetup(); trAttSetup();
  if(!TR.loaded)trLoad().then(()=>{ if(TR.chat.length===1&&TR.chat[0].local){ TR.chat[0].content=trGreeting(); trChatDraw(); } trChatMode(); });
  setTimeout(()=>ta.focus(),200);
}
function trChatMode(){ const el=document.getElementById('trcMode'); if(!el)return; const ai=TR.ai&&TR.ai.ready;
  el.innerHTML=ai?'KI-Modus · versteht freie Sätze und Fragen':'Einfacher Modus · Anwesenheit, Gründe, Verletzungen'+(isAdmin()?' · <a href="#" id="trcKey">KI einschalten</a>':'');
  const k=document.getElementById('trcKey'); if(k)k.onclick=e=>{ e.preventDefault(); closeOverlay(); goTab('admin'); setTimeout(()=>{ const c=document.getElementById('trAi'); if(c)c.scrollIntoView({behavior:'smooth'}); },500); };
  const sug=document.getElementById('trcSug'); if(sug){ const S=['Heute fehlten …','📎 WhatsApp auswerten','Spiel: 3:1 gegen …','Kerwe-Aufbau: …','Wer ist aktuell verletzt?','Wie ist die Trainingsbeteiligung?'].concat(ai?['Wie siehst du die Elf fürs Wochenende?','Wer ist in den letzten Wochen auffällig?']:[]);
    sug.innerHTML=S.map(s=>`<button type="button">${svEsc(s)}</button>`).join(''); sug.querySelectorAll('button').forEach(b=>b.onclick=()=>{ if(/^📎/.test(b.textContent)){ const c=document.getElementById('trcClip'); if(c)c.click(); return; } const ta=document.getElementById('trcTxt'); if(/…$/.test(b.textContent)){ ta.value=b.textContent.replace('…',''); ta.focus(); } else trChatSend(b.textContent); }); } }
function trActSummary(a){
  const i=a.input||{};
  if(a.type==='training'){
    const sp=(i.spieler||[]), weg=sp.filter(x=>x.status==='weg'), sp2=sp.filter(x=>x.status==='spaet'), rated=sp.filter(x=>x.motivation||x.fitness||x.notiz);
    return `<b>Training ${TRC.fmt(i.datum)}${i.datum&&i.datum.slice(0,4)!==trToday().slice(0,4)?i.datum.slice(0,4):''}</b>
      ${weg.length?`<div>Fehlend: ${weg.map(x=>`${svEsc(trShort(x.player_id))} <em class="${x.grund==='ohne'?'bad':''}">(${svEsc(TRC.REASONS[x.grund]||'Grund?')})</em>`).join(', ')}</div>`:''}
      ${sp2.length?`<div>Zu spät: ${sp2.map(x=>svEsc(trShort(x.player_id))).join(', ')}</div>`:''}
      ${rated.length?`<div>Eindrücke: ${rated.map(x=>`${svEsc(trShort(x.player_id))}${x.motivation?' M'+x.motivation:''}${x.fitness?' F'+x.fitness:''}${x.notiz?' „'+svEsc(x.notiz)+'“':''}`).join(', ')}</div>`:''}
      ${(i.fokus||[]).length||i.intensitaet||i.stimmung?`<div>Einheit: ${(i.fokus||[]).map(f=>svEsc(TRC.FOKUS[f]||f)).join(', ')}${i.intensitaet?' · Intensität '+i.intensitaet+'/5':''}${i.stimmung?' · Eindruck '+i.stimmung+'/5':''}</div>`:''}
      ${i.notiz?`<div>Notiz: ${svEsc(i.notiz)}</div>`:''}
      <label class="trc-rest"><input type="checkbox" data-rest ${i.rest_da?'checked':''}> Alle anderen Kaderspieler als anwesend eintragen</label>`;
  }
  if(a.type==='spiel'){ const sp=i.spieler||[]; return `<b>⚽ Spiel ${TRC.fmt(i.datum)}${i.gegner?' gegen '+svEsc(i.gegner):''}${i.heim===true?' (Heim)':i.heim===false?' (Auswärts)':''}</b>
      <div>Ergebnis: <b>${i.tore_wir!=null?i.tore_wir:'?'}:${i.tore_gegner!=null?i.tore_gegner:'?'}</b></div>
      ${sp.some(x=>x.tore)?`<div>Tore: ${sp.filter(x=>x.tore).map(x=>svEsc(trShort(x.player_id))+(x.tore>1?' ('+x.tore+')':'')).join(', ')}</div>`:''}
      ${sp.some(x=>x.vorlagen)?`<div>Vorlagen: ${sp.filter(x=>x.vorlagen).map(x=>svEsc(trShort(x.player_id))+(x.vorlagen>1?' ('+x.vorlagen+')':'')).join(', ')}</div>`:''}`; }
  if(a.type==='veranstaltung'){ const h=i.helfer||[]; return `<b>🎪 ${svEsc(i.titel||TRS.EART[i.art]||'Veranstaltung')} · ${TRC.fmt(i.datum)}</b>
      ${h.length?`<div>${h.map(x=>`${svEsc(vrPersonName(x.person))}${(x.rollen||[]).length?' <em>('+x.rollen.map(r=>svEsc(TRS.ROLES[r]||r)).join(', ')+')</em>':''}${x.stunden?' '+x.stunden+' Std.':''}${x.status&&x.status!=='geholfen'?` <em class="${x.status==='nicht_erschienen'?'bad':''}">${svEsc(TRS.HSTAT[x.status]||x.status)}</em>`:''}`).join(' · ')}</div>`:'<div>Noch keine Helfer erkannt</div>'}`; }
  if(a.type==='verletzung')return `<b>🩹 Verletzung: ${svEsc(trName(i.player_id))}</b><div>${svEsc(i.diagnose||'')}${i.koerperteil?' · '+svEsc(i.koerperteil):''} · seit ${TRC.fmt(i.beginn)}${i.prognose?' · voraussichtlich zurück '+TRC.fmt(i.prognose):''}</div>`;
  if(a.type==='verletzung_ende'){ const inj=TR.st.injuries.find(x=>x.id===i.injury_id); return `<b>✅ Wieder fit: ${svEsc(trName(inj?inj.p:i.player_id))}</b><div>${svEsc(inj?inj.dg:i.diagnose||'')} – zurück am ${TRC.fmt(i.zurueck)}</div>`; }
  return '';
}
async function trExec(a,rest){
  const i=a.input||{};
  if(a.type==='training'){
    const sp=(i.spieler||[]).filter(x=>x.player_id).map(x=>Object.assign({player_id:x.player_id,status:x.status||'da'},x.status==='weg'?{grund:x.grund||'ohne'}:{},x.motivation?{motivation:x.motivation}:{},x.fitness?{fitness:x.fitness}:{},x.notiz?{notiz:x.notiz}:{}));
    if(rest){ const ex=trSessionOn(i.datum), have=new Set([...sp.map(x=>x.player_id),...(ex&&ex.a||[]).map(x=>x[0])]);
      trSquad().filter(p=>p.kader===1&&!have.has(p.id)).forEach(p=>{ const inj=trInjury(p.id); sp.push(inj?{player_id:p.id,status:'weg',grund:'verletzt'}:{player_id:p.id,status:'da'}); }); }
    const p={datum:i.datum||trToday(),typ:'training',spieler:sp}; ['fokus','intensitaet','stimmung','notiz'].forEach(k=>{ if(i[k]!=null&&!(Array.isArray(i[k])&&!i[k].length))p[k]=i[k]; });
    await trSaveSession(p); return 'Training '+TRC.fmt(p.datum)+' eingetragen';
  }
  if(a.type==='spiel'){ const sp=(i.spieler||[]).filter(x=>x.player_id).map(x=>Object.assign({player_id:x.player_id,status:x.status||'da'},x.tore?{tore:x.tore}:{},x.vorlagen?{vorlagen:x.vorlagen}:{}));
    const p={datum:i.datum||trToday(),typ:'spiel',spieler:sp}; ['gegner','heim','tore_wir','tore_gegner'].forEach(k=>{ if(i[k]!=null&&i[k]!=='')p[k]=i[k]; });
    await trSaveSession(p); return 'Spiel '+TRC.fmt(p.datum)+' eingetragen'; }
  if(a.type==='veranstaltung'){ await vrSaveEvent(i); return (i.titel||'Veranstaltung')+' eingetragen'; }
  if(a.type==='verletzung'){ await trSaveInjury(i); return 'Verletzung von '+trShort(i.player_id)+' eingetragen'; }
  if(a.type==='verletzung_ende'){ await trCloseInjury(i.injury_id,i.zurueck||trToday()); return 'Verletzung abgeschlossen'; }
}
function trChatDraw(){
  const L=document.getElementById('trcLog'); if(!L)return;
  L.innerHTML=TR.chat.map((m,mi)=>`<div class="trm ${m.role==='user'?'me':'co'}"><div class="trm-t">${svEsc(m.content).replace(/\n/g,'<br>')}${(m.imgs||[]).length?`<div class="trm-img">${m.imgs.map(u=>`<img src="${svEsc(u)}" alt="">`).join('')}</div>`:''}${m.file?`<div class="trm-img">📎 ${svEsc(m.file)}</div>`:''}</div>
    ${(m.actions||[]).map((a,ai)=>`<div class="trc-act${a.done?' done':''}${a.skip?' skip':''}" data-ai="${mi}:${ai}">${trActSummary(a)}
      <div class="btnrow">${a.done?`<span class="ok">✓ ${svEsc(a.done)}</span>`:a.skip?'<span class="note">verworfen</span>':`<button class="btn sm" data-do>Eintragen</button><button class="btn ghost sm" data-skip>Verwerfen</button>`}</div></div>`).join('')}</div>`).join('')
    +(TR.chatBusy?'<div class="trm co"><div class="trm-t trtyping"><i></i><i></i><i></i></div></div>':'');
  L.querySelectorAll('[data-ai]').forEach(box=>{ const [mi,ai]=box.dataset.ai.split(':').map(Number), a=TR.chat[mi].actions[ai];
    const d=box.querySelector('[data-do]'); if(d)d.onclick=async()=>{ d.disabled=true; const rest=box.querySelector('[data-rest]'); try{ a.done=await trExec(a,rest&&rest.checked); trChatDraw(); kToast('✓ '+a.done); }catch(e){ d.disabled=false; kToast('⚠️ '+e.message); } };
    const s=box.querySelector('[data-skip]'); if(s)s.onclick=()=>{ a.skip=true; trChatDraw(); }; });
  L.scrollTop=L.scrollHeight;
}
async function trChatSend(text){
  const att=TR.att||{imgs:[],file:null}; TR.att={imgs:[],file:null}; trAttDraw();
  if(!text)text=att.imgs.length?'Werte den Screenshot aus: Wer war beim Training dabei, wer hat abgesagt (mit Grund)? Bereite die Einträge vor.':att.file?'Werte diesen Verlauf aus: Wer hat fürs Training zu- oder abgesagt (mit Grund)? Bereite die Einträge vor.':'';
  TR.chat.push({role:'user',content:text,imgs:att.imgs.map(i=>i.thumb),file:att.file&&att.file.name}); TR.chatBusy=true; trChatDraw();
  if(!TR.loaded)await trLoad();
  let reply=null;
  if(att.imgs.length&&!(TR.ai&&TR.ai.ready)){
    TR.chatBusy=false; TR.chat.push({role:'assistant',local:true,content:'Screenshots kann nur der KI-Co-Trainer lesen – der Admin schaltet ihn unter „Nutzer & Rollen“ ein.\nTipp: In WhatsApp den Gruppenchat exportieren (⋮ → Mehr → Chat exportieren → ohne Medien) und die Textdatei hier anhängen – die verstehe ich auch ohne KI.'}); trChatDraw(); return;
  }
  if(TR.ai&&TR.ai.ready){
    try{ const hist=TR.chat.filter(m=>!m.local||m.role==='user').slice(-12).map(m=>({role:m.role,content:m.content+(m.actions&&m.actions.length?'\n[Vorschläge: '+m.actions.map(a=>a.type+(a.done?' – eingetragen':a.skip?' – verworfen':' – offen')).join(', ')+']':'')}));
      const body={messages:hist}; if(att.imgs.length)body.bilder=att.imgs.map(i=>({mt:i.mt,data:i.data})); if(att.file)body.datei={name:att.file.name,text:att.file.text};
      const {data,error}=await SVB.sb.functions.invoke('coach',{body});
      if(error)throw error;
      if(data&&data.ok)reply={role:'assistant',content:data.text||(data.actions&&data.actions.length?'Hab ich so verstanden – passt das?':'…'),actions:data.actions||[]};
      else if(data&&data.error&&data.error!=='kein-schluessel')reply={role:'assistant',content:'⚠️ '+data.error+'\n\nIch versuche es im einfachen Modus:',local:true};
    }catch(e){ reply=null; }
  }
  if((!reply||reply.local)&&att.file&&TRS.isWhatsApp(att.file.text)){
    const W=TRS.parseWhatsApp(att.file.text,vrPeople(),trToday(),21);
    reply={role:'assistant',local:true,actions:W.actions,content:W.actions.length?`Aus ${W.used} Nachrichten der letzten 3 Wochen habe ich Zu- und Absagen erkannt – bitte kurz prüfen:`:`Ich habe ${W.messages} Nachrichten gelesen, aber keine eindeutigen Zu- oder Absagen der letzten 3 Wochen gefunden.`};
    TR.chatBusy=false; TR.chat.push(reply); trChatDraw(); return;
  }
  if((!reply||reply.local)&&att.file&&!text.trim())text=att.file.text.slice(0,2000);
  if(!reply||reply.local){
    const sq=trSquadLite(), PM=TRS.parseMatch(text,sq,trToday()), PE=PM?null:TRS.parseEvent(text,vrPeople(),trToday());
    const P=PM?{actions:[PM.action],ambig:PM.ambig,warn:PM.warn}:PE?{actions:[PE.action],ambig:PE.ambig}:TRC.parse(text,sq,trToday(),TR.st);
    let content, actions=P.actions;
    if(P.ambig&&P.ambig.length){ content=(reply?reply.content+'\n':'')+P.ambig.map(a=>`Welchen meinst du mit „${a.k.replace(/^\w/,c=>c.toUpperCase())}“: ${a.names.join(', ')}?`).join('\n')+(actions.length?'\n\nDen Rest habe ich schon vorbereitet:':' Schreib bitte den vollen Namen.'); }
    else if(actions.length){ content=(reply?reply.content+'\n':'')+'Verstanden – so würde ich es eintragen:'+(P.warn?'\n⚠️ '+P.warn:''); }
    else { const ans=TRC.answer(text,sq,TR.st,trToday()); content=(reply?reply.content+'\n':'')+(ans||'Das habe ich nicht verstanden. Im einfachen Modus verstehe ich Sätze wie „Max und Tim waren heute nicht da (Arbeit), Tom hat eine Zerrung, drei Wochen“ oder Fragen wie „Ist Tom wieder fit?“.'+(TR.ai&&TR.ai.ready?'':' Für freie Fragen und Aufstellungs-Tipps kann der Admin die KI einschalten.')); }
    reply={role:'assistant',content,actions,local:true};
  }
  TR.chatBusy=false; TR.chat.push(reply); trChatDraw();
}
/* Anhänge: Screenshots (KI), WhatsApp-Export (.txt), Listen (.xlsx/.csv → Import) */
function trAttHas(){ return !!(TR.att&&(TR.att.imgs.length||TR.att.file)); }
function trAttDraw(){ const el=document.getElementById('trcAtt'); if(!el)return; const A=TR.att||{imgs:[],file:null};
  el.innerHTML=A.imgs.map((i,k)=>`<span><img src="${svEsc(i.thumb)}" alt=""><button type="button" data-rmi="${k}" aria-label="Entfernen">✕</button></span>`).join('')+(A.file?`<span>📎 ${svEsc(A.file.name)} <button type="button" data-rmf aria-label="Entfernen">✕</button></span>`:'');
  el.querySelectorAll('[data-rmi]').forEach(b=>b.onclick=()=>{ A.imgs.splice(+b.dataset.rmi,1); trAttDraw(); });
  const f=el.querySelector('[data-rmf]'); if(f)f.onclick=()=>{ A.file=null; trAttDraw(); }; }
function trImg(file){ return new Promise((res,rej)=>{ const u=URL.createObjectURL(file), im=new Image();
  im.onload=()=>{ const mx=1568, k=Math.min(1,mx/Math.max(im.width,im.height)), c=document.createElement('canvas'); c.width=Math.round(im.width*k); c.height=Math.round(im.height*k);
    c.getContext('2d').drawImage(im,0,0,c.width,c.height); URL.revokeObjectURL(u); let q=0.85, d=c.toDataURL('image/jpeg',q); while(d.length>1500000&&q>0.4){ q-=0.15; d=c.toDataURL('image/jpeg',q); }
    const t=document.createElement('canvas'), tk=96/Math.max(c.width,c.height); t.width=Math.round(c.width*tk); t.height=Math.round(c.height*tk); t.getContext('2d').drawImage(c,0,0,t.width,t.height);
    res({mt:'image/jpeg',data:d.split(',')[1],thumb:t.toDataURL('image/jpeg',0.7),name:file.name}); };
  im.onerror=()=>{ URL.revokeObjectURL(u); rej(new Error('Bild konnte nicht gelesen werden')); }; im.src=u; }); }
function trAttSetup(){
  TR.att=TR.att||{imgs:[],file:null}; trAttDraw();
  const inp=document.getElementById('trcFile'), b=document.getElementById('trcClip'); if(!inp||!b)return;
  b.onclick=()=>inp.click();
  inp.onchange=async()=>{ const files=[...inp.files]; inp.value='';
    for(const f of files){
      try{
        if(/\.(xlsx|xlsm|csv)$/i.test(f.name)){ closeOverlay(); vrImport('training',f); return; }
        if(/^image\//.test(f.type)||/\.(jpe?g|png|webp|gif|heic)$/i.test(f.name)){ if(TR.att.imgs.length>=4){ kToast('Höchstens 4 Bilder auf einmal'); continue; } TR.att.imgs.push(await trImg(f)); }
        else if(/\.txt$/i.test(f.name)||f.type==='text/plain'){ if(f.size>5e6){ kToast('Datei zu groß'); continue; } const t=await f.text(); TR.att.file={name:f.name.slice(0,80),text:t.slice(-60000)}; }
        else kToast('Dieser Dateityp geht nicht: '+f.name);
      }catch(e){ kToast('⚠️ '+(e.message||e)); }
    }
    trAttDraw(); document.getElementById('trcTxt').focus(); };
}
/* Spracheingabe (Web Speech API – iPhone/Safari & Chrome) */
function trMicSetup(){
  const b=document.getElementById('trcMic'), SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!b)return; if(!SR){ b.title='Diktieren: Mikrofon-Taste der Handy-Tastatur nutzen'; b.onclick=()=>{ kToast('Tipp: Mikrofon-Taste auf der Tastatur antippen und losreden'); document.getElementById('trcTxt').focus(); }; return; }
  let rec=null;
  b.onclick=()=>{
    if(rec){ rec.stop(); return; }
    rec=new SR(); rec.lang='de-DE'; rec.interimResults=true; rec.continuous=true;
    const ta=document.getElementById('trcTxt'), base=ta.value?ta.value+' ':'';
    rec.onresult=e=>{ let t=''; for(let i=0;i<e.results.length;i++)t+=e.results[i][0].transcript; ta.value=base+t; ta.dispatchEvent(new Event('input')); };
    rec.onend=()=>{ b.classList.remove('rec'); rec=null; };
    rec.onerror=e=>{ b.classList.remove('rec'); rec=null; if(e.error==='not-allowed')kToast('Mikrofon nicht erlaubt – in den Einstellungen freigeben'); };
    try{ rec.start(); b.classList.add('rec'); kToast('🎙️ Ich höre zu … nochmal tippen zum Beenden'); }catch(e){ rec=null; }
  };
}
/* schwebender Knopf */
function trFab(){
  if(!canTraining()||document.getElementById('trFab'))return;
  const b=document.createElement('button'); b.id='trFab'; b.className='trfab'; b.setAttribute('aria-label','Co-Trainer'); b.innerHTML=SVI('chat')+'<span>Co-Trainer</span>';
  b.onclick=()=>trChatOpen(); document.body.appendChild(b);
}

/* ---------- Admin: KI-Schlüssel ---------- */
async function trAiCard(P){
  if(!P||!isAdmin())return;
  let s=null; try{ const {data}=await SVB.sb.rpc('ai_status'); s=data; }catch(e){}
  const el=document.createElement('div'); el.className='card'; el.id='trAi';
  el.innerHTML=`<div class="adm-head"><div><h3 style="margin:0;display:flex;gap:8px;align-items:center">${SVI('chat')} KI-Co-Trainer</h3>
    <p style="margin:6px 0 0;font-size:13.5px">Ohne KI versteht der Co-Trainer einfache Sätze zu Anwesenheit, Gründen und Verletzungen. Mit einem Anthropic-API-Schlüssel versteht er freie Sätze, beantwortet Fragen zu Fitness, Verletzungen und Aufstellung und denkt aktiv mit. Kosten: je nach Nutzung wenige Euro im Monat, abgerechnet direkt über euer Anthropic-Konto.</p></div>
    <span class="pill ${s&&s.ready?'on':'wait'}">${s&&s.ready?'aktiv · '+svEsc(s.model||''):'nicht eingerichtet'}</span></div>
    <div class="invite" style="grid-template-columns:2fr 1fr auto"><div><label for="trAiKey">API-Schlüssel (beginnt mit sk-ant-)</label><input id="trAiKey" class="search" type="password" autocomplete="off" placeholder="${s&&s.ready?'•••••••• (hinterlegt – nur zum Ersetzen ausfüllen)':'sk-ant-…'}"></div>
      <div><label for="trAiModel">Modell</label><select id="trAiModel">${[['claude-sonnet-5','Claude Sonnet 5 (empfohlen)'],['claude-haiku-4-5-20251001','Claude Haiku 4.5 (günstig)'],['claude-opus-5-5','Claude Opus 5.5 (stärkstes)']].map(([k,t])=>`<option value="${k}"${s&&s.model===k?' selected':''}>${t}</option>`).join('')}</select></div>
      <button class="btn" id="trAiSave" style="height:46px">Speichern</button></div>
    <p class="note">Den Schlüssel legst du selbst unter console.anthropic.com an (API Keys). Er liegt in einem geschützten Bereich der Datenbank, ist für niemanden in der App lesbar und wird nur vom Co-Trainer-Dienst verwendet. ${s&&s.ready?'<a href="#" id="trAiOff">KI wieder ausschalten</a>':''}</p>`;
  P.appendChild(el);
  document.getElementById('trAiSave').onclick=async()=>{ const k=document.getElementById('trAiKey').value.trim(), m=document.getElementById('trAiModel').value;
    try{ const {error}=await SVB.sb.rpc('ai_set',{p_key:k||null,p_model:m,p_clear:false}); if(error)throw error; document.getElementById('trAiKey').value=''; kToast('✓ KI-Co-Trainer gespeichert'); TR.ai=null; trLoad(true); svAdminRender(); }
    catch(e){ kToast('⚠️ '+(e.message||e)); } };
  const off=document.getElementById('trAiOff'); if(off)off.onclick=async e=>{ e.preventDefault(); try{ await SVB.sb.rpc('ai_set',{p_key:null,p_model:null,p_clear:true}); kToast('KI ausgeschaltet'); trLoad(true); svAdminRender(); }catch(x){ kToast('⚠️ '+x.message); } };
}
{ const _ar1=svAdminRender; svAdminRender=async function(){ const r=await _ar1.apply(this,arguments); try{ const P=document.getElementById('panel-admin'); if(P&&!P.querySelector('#trAi'))await trAiCard(P); }catch(e){} return r; }; }

/* ---------- Start ---------- */
{ const _gt2=goTab; goTab=function(tab){ const r=_gt2.apply(this,arguments); if(tab==='training')trRender(); return r; }; }
{ const _si2=svInit; svInit=function(){
    const r=_si2.apply(this,arguments);
    const show=canTraining();
    document.querySelectorAll('[data-tab="training"],[data-sheet="training"]').forEach(b=>{ b.style.display=show?'':'none'; });
    document.querySelectorAll('.tabbar .ti[data-tab="scout"]').forEach(b=>{ b.style.display=show?'none':''; });
    if(show){ trFab(); trLoad();
      try{ const ch=SVB.sb.channel('training-live'); let t=null; const pull=()=>{ clearTimeout(t); t=setTimeout(()=>trLoad(true),500); };
        ['training_sessions','training_attendance','injuries'].forEach(tb=>ch.on('postgres_changes',{event:'*',schema:'public',table:tb},pull)); ch.subscribe(); }catch(e){}
      document.addEventListener('visibilitychange',()=>{ if(document.visibilityState==='visible')trLoad(true); });
      { const _rh3=renderHome; renderHome=function(){ const x=_rh3.apply(this,arguments); try{trHomeCard();}catch(e){} return x; }; }
      if((location.hash||'').slice(1)==='training')setTimeout(()=>goTab('training'),50);
    }
    return r; }; }

/* =====================================================================
   SV/BSC Scout · Runde 8: Verein – Rankings (Training & Loyalität), Veranstaltungen & Helfer,
   Allzeit-Statistik & Legenden, Import von Listen (Excel/CSV/Einfügen), Scouting-Radar
   Rechte: Rankings, Helfer, Radar nur fürs Team (Admin, Vorstand, Kaderplaner, Trainer);
           Allzeit-Statistik (öffentliche Vereinsseite) sehen alle Mitglieder.
   ===================================================================== */
SV_PAGES.verein=['Verein','Rankings, Helfer & Veranstaltungen, Allzeit-Statistik und Legenden'];
SV_PAGES.radar=['Radar','Formkurven, Torserien und Moneyball-Chancen – bevor es andere merken'];
function canScout(){ return canEdit(); }
{ const _ta2=svTabAllowed; svTabAllowed=function(t){ if(t==='radar')return canScout(); if(t==='verein')return true; return _ta2.apply(this,arguments); }; }

const VR={ev:[],evLoaded:false,at:[],atLoaded:false,radar:[],radarLoaded:false,view:null,atSort:'sp',atQ:'',rf:'alle',kader:'1',atShow:40};
const VR_SEASON_START='2026-07-01';
function vrPeople(){ return players.filter(p=>p.own&&!p.verzicht).map(p=>({id:p.id,name:p.name})); }
function vrPersonName(person){ return String(person||'').startsWith('x:')?String(person).slice(2):trName(person); }
function vrKader(all){ return players.filter(p=>p.own&&!p.isJugend&&!p.verzicht&&(p.kader===1||(all&&p.kader===2))).sort((a,b)=>a.name.localeCompare(b.name,'de')); }

/* ---------- Laden ---------- */
async function vrLoadEvents(){ if(!canTraining())return; try{ const {data,error}=await SVB.sb.rpc('events_state',{p_since:TRC.addDays(trToday(),-1100)}); if(error)throw error; VR.ev=(data||[]).map(e=>Object.assign(e,{id:String(e.id)})); VR.evLoaded=true; }catch(e){ console.warn('Veranstaltungen',e); } vrAfter(); }
async function vrLoadAllTime(){ try{ const {data,error}=await SVB.sb.from('club_stats').select('key,name,tore,assists,spiele,siege,quote,stand').order('spiele',{ascending:false}).limit(2000); if(error)throw error; VR.at=data||[]; VR.atLoaded=true; VR._idx=null; }catch(e){ console.warn('Allzeit',e); VR.atLoaded=true; } vrAfter(); }
async function vrLoadRadar(){ if(!canScout())return; try{ const {data,error}=await SVB.sb.from('radar').select('id,key,stand,typ,lvl,player_id,club_key,titel,detail,data,ai,created_at').order('created_at',{ascending:false}).limit(400); if(error)throw error; VR.radar=data||[]; VR.radarLoaded=true; }catch(e){ console.warn('Radar',e); VR.radarLoaded=true; } vrAfter(); }
function vrAfter(){ try{ if(document.querySelector('#panel-verein.active'))vrRender(); }catch(e){ console.warn(e); } try{ if(document.querySelector('#panel-radar.active'))rdRender(); }catch(e){ console.warn(e); } try{ vrHomeCard(); }catch(e){} vrBadge(); }
async function vrSaveEvent(i){ const {data,error}=await SVB.sb.rpc('event_save',{p:i}); if(error)throw new Error(/check/.test(error.message)?'Ungültige Angabe (Art, Stunden oder Status)':error.message); await vrLoadEvents(); return data; }

/* ---------- Allzeit: Zuordnung Spieler ↔ Vereinsstatistik ---------- */
function vrIdx(){
  const k=VR.at.length+':'+Object.keys(CRM||{}).length+':'+players.length;
  if(VR._idx&&VR._idxK===k)return VR._idx;
  const ordered=[...players.filter(p=>p.own),...players.filter(p=>!p.own)];
  VR._idx=TRS.allTimeIndex(VR.at,ordered,CRM||{}); VR._idxK=k; return VR._idx;
}
function vrTotals(pid){ const row=vrIdx().byPlayer.get(pid)||null; const p=trP(pid); const ms=p&&p.own&&TR.loaded?TRS.matchStats(TR.st,pid,row&&row.stand?row.stand:VR_SEASON_START):null; return {row,ms,tot:TRS.totals(row,ms)}; }
function vrRanks(){ // ewige Listen: Platz nach Spielen und Toren
  if(VR._rk&&VR._rkK===VR._idxK)return VR._rk;
  const idx=vrIdx(), L=VR.at.map(r=>{ const pid=idx.used.get(r.key); return {r,pid,tot:pid?vrTotals(pid).tot:TRS.totals(r,null)}; });
  const bySp=[...L].sort((a,b)=>b.tot.sp-a.tot.sp), byT=[...L].sort((a,b)=>b.tot.tore-a.tot.tore);
  const rk=new Map(); bySp.forEach((x,i)=>rk.set(x.r.key,{sp:i+1})); byT.forEach((x,i)=>{ rk.get(x.r.key).tore=i+1; });
  VR._rk={L,rk}; VR._rkK=VR._idxK; return VR._rk;
}
function vrScores(p){
  const today=trToday(), {row,ms}=vrTotals(p.id);
  const ts=TR.loaded?TRS.trainingScore(TR.st,p.id,today):{score:null,why:['Trainingsdaten werden geladen …']};
  const ls=TRS.loyaltyScore(p.id,VR.ev,row,ms?ms.sp:0,today);
  const ps=TR.loaded?TRC.playerStats(TR.st,p.id,today):null;
  const rt=ps?TRS.retention(ts,ls,ps,VR.ev.length>0):{risk:0,lvl:null,why:[]};
  return {ts,ls,rt};
}
const vrCls=v=>v==null?'':v>=75?'ok':v>=55?'mid':'bad';

/* ---------- Seite „Verein“ ---------- */
function vrRender(){
  const P=document.getElementById('panel-verein'); if(!P)return;
  const team=canTraining();
  if(!VR.view)VR.view=team?'rank':'allzeit';
  if(!team&&VR.view!=='allzeit')VR.view='allzeit';
  const tabs=(team?[['rank','Rankings'],['events','Helfer & Events']]:[]).concat([['allzeit','Allzeit & Legenden']]);
  P.innerHTML=`<div class="trtop"><div class="trtabs">${tabs.map(([k,t])=>`<button class="${VR.view===k?'on':''}" data-vrv="${k}">${t}</button>`).join('')}</div>
    ${team?`<div class="tract"><button class="btn" data-vr-ev>${SVI('plus')} Veranstaltung</button><button class="btn ghost" data-vr-imp>${SVI('upload')} Listen importieren</button></div>`:''}</div><div id="vrBody"></div>`;
  P.querySelectorAll('[data-vrv]').forEach(b=>b.onclick=()=>{ VR.view=b.dataset.vrv; vrRender(); });
  if(team){ P.querySelector('[data-vr-ev]').onclick=()=>vrEventEditor(null); P.querySelector('[data-vr-imp]').onclick=()=>vrImport(VR.view==='events'?'helfer':'training'); }
  const B=document.getElementById('vrBody');
  if(team&&(!TR.loaded||!VR.evLoaded)&&VR.view!=='allzeit'){ B.innerHTML='<div class="card"><div class="empty">Lade Daten …</div></div>'; if(!TR.loaded)trLoad(); if(!VR.evLoaded)vrLoadEvents(); return; }
  ({rank:vrViewRank,events:vrViewEvents,allzeit:vrViewAllTime})[VR.view](B);
}

/* ----- Rankings ----- */
function vrViewRank(B){
  const list=vrKader(VR.kader==='2').map(p=>Object.assign({p},vrScores(p)));
  const tr=list.filter(x=>x.ts.score!=null).sort((a,b)=>b.ts.score-a.ts.score);
  const lo=[...list].sort((a,b)=>b.ls.score-a.ls.score);
  const risk=list.filter(x=>x.rt.lvl).sort((a,b)=>b.rt.risk-a.rt.risk);
  const podium=(L,k,unit)=>L.length?`<div class="vrpod">${[1,0,2].map(i=>L[i]?`<div class="vrpod-i p${i+1}" data-why="${svEsc(L[i].p.id)}">${avaHtml(L[i].p)}<b>${svEsc(trShort(L[i].p.id))}</b><span class="${vrCls(L[i][k].score)}">${L[i][k].score}</span><i>${i+1}</i></div>`:'<div></div>').join('')}</div>`:'';
  const rows=(L,k)=>(VR.rkAll?L:L.slice(0,12)).map((x,i)=>`<div class="vrrow" data-why="${svEsc(x.p.id)}"><em>${i+1}</em>${avaHtml(x.p)}<div class="vrrow-b"><b>${svEsc(x.p.name)}${x.p.kader===2?' <small>II</small>':''}</b><div class="vrbar"><i class="${vrCls(x[k].score)}" style="width:${Math.max(3,x[k].score||0)}%"></i></div></div><span class="vrsc ${vrCls(x[k].score)}">${x[k].score==null?'–':x[k].score}</span></div>`).join('');
  const noTr=list.filter(x=>x.ts.score==null).length;
  B.innerHTML=`<div class="vrfilter"><div class="trtabs sm"><button class="${VR.kader==='1'?'on':''}" data-k="1">1. Mannschaft</button><button class="${VR.kader==='2'?'on':''}" data-k="2">+ Zweite</button></div>
      <small>Antippen zeigt, wie der Score zustande kommt.</small></div>
    <div class="vrgrid">
      <div class="card"><h3 class="trh">${SVI('activity')} Trainings-Score</h3>${tr.length?podium(tr,'ts')+`<div class="vrlist">${rows(tr,'ts')}</div>`:'<div class="note">Ab 4 erfassten Einheiten je Spieler erscheint hier das Ranking. Tipp: Julians Trainingslisten über „Listen importieren“ einlesen.</div>'}
        ${tr.length>12&&!VR.rkAll?'<button class="btn ghost sm" data-rkall>Alle '+tr.length+' zeigen</button>':''}${noTr&&tr.length?`<div class="note">${noTr} Spieler noch ohne Score (weniger als 4 Einheiten).</div>`:''}
        <div class="note">Verletzt, länger krank und „in der Zweiten“ zählen <b>nicht</b> – kurzfristige Krankmeldungen zählen halb, gehäuft stärker; ohne Grund zählt voll.</div></div>
      <div class="card"><h3 class="trh">${SVI('heart')} Loyalität &amp; Vereinsherz</h3>${podium(lo,'ls')}<div class="vrlist">${rows(lo,'ls')}</div>${lo.length>12&&!VR.rkAll?'<button class="btn ghost sm" data-rkall>Alle '+lo.length+' zeigen</button>':''}
        <div class="note">Helfereinsätze (Aufbau, Theke, Kasse … inkl. Stunden) · Vereinstreue (Pflichtspiele seit 2013/14) · Teamgeist. ${VR.ev.length?'':'<b>Noch keine Veranstaltungen erfasst</b> – aktuell zählt nur die Vereinstreue.'}</div></div>
    </div>
    ${risk.length?`<div class="card"><h3 class="trh">${SVI('bell')} Bindungsrisiko – früh das Gespräch suchen</h3>${risk.map(x=>`<div class="tra l-${x.rt.lvl}"><span class="tra-av" data-svp="${svEsc(x.p.id)}">${avaHtml(x.p)}</span><div class="tra-b"><b data-svp="${svEsc(x.p.id)}">${svEsc(x.p.name)}</b><span>${svEsc(x.rt.why.join(' · '))}</span></div></div>`).join('')}</div>`:''}`;
  B.querySelectorAll('[data-k]').forEach(b=>b.onclick=()=>{ VR.kader=b.dataset.k; vrViewRank(B); });
  B.querySelectorAll('[data-rkall]').forEach(b=>b.onclick=()=>{ VR.rkAll=true; vrViewRank(B); });
  B.querySelectorAll('[data-why]').forEach(x=>x.onclick=()=>vrWhy(x.dataset.why));
  B.querySelectorAll('[data-svp]').forEach(x=>x.onclick=e=>{ e.stopPropagation(); openModal(x.dataset.svp); });
}
function vrWhy(pid){
  const p=trP(pid); if(!p)return; const {ts,ls,rt}=vrScores(p);
  svModal(`<div class="mhead">${avaHtml(p)}<div><h2 style="margin:0">${svEsc(p.name)}</h2><div class="msub">So entstehen die Scores</div></div></div>
    <div class="vrwhy"><div class="vrwhy-s"><span>Trainings-Score</span><b class="${vrCls(ts.score)}">${ts.score==null?'–':ts.score}</b></div><ul>${ts.why.map(w=>`<li>${svEsc(w)}</li>`).join('')}</ul></div>
    <div class="vrwhy"><div class="vrwhy-s"><span>Loyalität</span><b class="${vrCls(ls.score)}">${ls.score}</b></div><ul>${ls.why.map(w=>`<li>${svEsc(w)}</li>`).join('')}</ul></div>
    ${rt.lvl?`<div class="vrwhy warn"><div class="vrwhy-s"><span>Bindungsrisiko</span><b class="bad">${rt.lvl}</b></div><ul>${rt.why.map(w=>`<li>${svEsc(w)}</li>`).join('')}</ul></div>`:''}
    <div class="btnrow sbact"><button class="btn" id="vrOpen">Spielerprofil öffnen</button><button class="btn ghost" id="vrClose">Schließen</button></div>`);
  document.getElementById('vrOpen').onclick=()=>openModal(pid);
  document.getElementById('vrClose').onclick=()=>closeOverlay();
}

/* ----- Helfer & Veranstaltungen ----- */
function vrHelpStats(since){
  const m=new Map();
  for(const e of VR.ev){ if(since&&e.d<since)continue; for(const h of e.h||[]){ if(h[3]!=='geholfen'||e.a==='mannschaft')continue; const o=m.get(h[0])||{n:0,std:0,last:null}; o.n++; o.std+=+(h[2]||0); if(!o.last||e.d>o.last)o.last=e.d; m.set(h[0],o); } }
  return m;
}
function vrSuggest(n,exclude){
  const hs=vrHelpStats(TRC.addDays(trToday(),-365)), ex=new Set(exclude||[]);
  return vrKader(true).filter(p=>!ex.has(p.id)&&!(TR.loaded&&trInjury(p.id))).map(p=>({p,s:hs.get(p.id)||{n:0,std:0,last:null}}))
    .sort((a,b)=>a.s.n-b.s.n||a.s.std-b.s.std||(a.s.last||'').localeCompare(b.s.last||'')||(a.p.kader||1)-(b.p.kader||1)).slice(0,n);
}
function vrViewEvents(B){
  const hs=vrHelpStats(VR_SEASON_START), top=[...hs.entries()].sort((a,b)=>b[1].std-a[1].std||b[1].n-a[1].n).slice(0,8);
  const season=VR.ev.filter(e=>e.d>=VR_SEASON_START), hours=season.reduce((a,e)=>a+(e.h||[]).filter(h=>h[3]==='geholfen').reduce((x,h)=>x+ +(h[2]||0),0),0);
  const never=vrKader(false).filter(p=>!hs.has(p.id));
  const sug=vrSuggest(6);
  B.innerHTML=`<div class="tiles trtiles">
      <div class="tile"><div class="v">${season.length}</div><div class="l">Veranstaltungen · Saison</div><div class="s">${VR.ev.length} insgesamt erfasst</div></div>
      <div class="tile"><div class="v">${Math.round(hours)}</div><div class="l">Helferstunden · Saison</div><div class="s">${hs.size} verschiedene Helfer</div></div>
      <div class="tile"><div class="v ${never.length?'mid':''}">${never.length}</div><div class="l">aus der Ersten noch nie geholfen</div><div class="s">diese Saison</div></div></div>
    <div class="vrgrid">
      <div class="card"><h3 class="trh">${SVI('plan')} Veranstaltungen</h3>${VR.ev.length?`<div class="trsl">${VR.ev.slice(0,80).map(e=>{ const hh=(e.h||[]).filter(h=>h[3]==='geholfen'), std=hh.reduce((a,h)=>a+ +(h[2]||0),0), ns=(e.h||[]).filter(h=>h[3]==='nicht_erschienen').length, zu=(e.h||[]).filter(h=>h[3]==='zugesagt').length;
        return `<button class="trs" data-ev="${e.id}"><div class="trs-d"><b>${new Date(e.d+'T12:00:00').toLocaleDateString('de-DE',{weekday:'short'})}</b><span>${TRC.fmt(e.d)}${e.d.slice(2,4)}</span></div>
          <div class="trs-b"><div class="trs-f"><i class="typ">${svEsc(TRS.EART[e.a]||e.a)}</i>${std?`<i>${std} Std.</i>`:''}${zu?`<i class="int">${zu} zugesagt</i>`:''}${ns?`<i class="st s1">${ns} nicht erschienen</i>`:''}</div><span><b>${svEsc(e.t)}</b> · ${hh.length?svEsc(hh.slice(0,6).map(h=>vrPersonName(h[0]).split(' ').pop()).join(', '))+(hh.length>6?' …':''):'noch keine Helfer'}</span></div>
          <div class="trs-n"><b>${hh.length}</b><span>Helfer</span></div></button>`; }).join('')}</div>`:`<div class="empty">Noch keine Veranstaltung erfasst.<br><small>Kerwe, Heimspiel-Dienste, Weihnachtsmarkt, Arbeitseinsätze … – oder dem Co-Trainer sagen: „Kerwe-Aufbau: Fries, Seiler und Walter, je 4 Stunden“.</small></div>`}</div>
      <div class="card"><h3 class="trh">${SVI('heart')} Fleißigste Helfer · Saison</h3>${top.length?`<div class="vrlist">${top.map(([pid,s],i)=>{ const p=trP(pid); return `<div class="vrrow" ${p?`data-svp="${svEsc(pid)}"`:''}><em>${i+1}</em>${avaHtml(p||{id:pid,name:vrPersonName(pid)})}<div class="vrrow-b"><b>${svEsc(vrPersonName(pid))}</b><small>${s.n}× geholfen</small></div><span class="vrsc ok">${s.std} h</span></div>`; }).join('')}</div>`:'<div class="note">Noch keine Helfereinsätze diese Saison.</div>'}
        <h3 class="trh" style="margin-top:16px">${SVI('kand')} Wer ist als Nächstes dran?</h3>
        <div class="note" style="margin-top:0">Fair verteilt: wer in den letzten 12 Monaten am wenigsten geholfen hat (ohne Verletzte).</div>
        <div class="vrchips">${sug.map(x=>`<span data-svp="${svEsc(x.p.id)}">${svEsc(x.p.name)} <small>${x.s.n?x.s.n+'×':'noch nie'}</small></span>`).join('')}</div>
        <button class="btn ghost sm" data-vr-plan style="margin-top:8px">${SVI('plus')} Nächsten Dienst mit diesen Helfern planen</button></div>
    </div>`;
  B.querySelectorAll('[data-ev]').forEach(b=>b.onclick=()=>vrEventEditor(b.dataset.ev));
  B.querySelectorAll('[data-svp]').forEach(x=>x.onclick=()=>openModal(x.dataset.svp));
  const pl=B.querySelector('[data-vr-plan]'); if(pl)pl.onclick=()=>vrEventEditor(null,{art:'heimspiel',titel:'Heimspiel-Dienst',datum:trToday(),helfer:sug.map(x=>({person:x.p.id,rollen:[],stunden:null,status:'zugesagt'}))});
}
function vrEventEditor(id,preset){
  const e0=id?VR.ev.find(e=>e.id===id):null;
  const st=e0?{id:e0.id,datum:e0.d,titel:e0.t,art:e0.a,notiz:e0.n||'',h:(e0.h||[]).map(h=>({person:h[0],rollen:[...(h[1]||[])],stunden:h[2]!=null?+h[2]:null,status:h[3]||'geholfen',notiz:h[4]||''}))}
    :Object.assign({id:null,datum:trToday(),titel:'',art:'kerwe',notiz:'',h:[]},preset?{datum:preset.datum,titel:preset.titel,art:preset.art,h:preset.helfer.map(x=>Object.assign({notiz:''},x))}:{});
  const people=vrPeople();
  svModal(`<div class="mhead"><div class="rm-ic" style="width:46px;height:46px">${SVI('heart')}</div><div><h2 style="margin:0">${e0?'Veranstaltung bearbeiten':'Veranstaltung erfassen'}</h2><div class="msub">Helfereinsätze fließen in den Loyalitäts-Score</div></div></div><div id="vrEd"></div>`);
  const draw=()=>{
    const E=document.getElementById('vrEd'); if(!E)return;
    const roleKeys=Object.keys(TRS.ROLES).filter(k=>k!=='sonstiges'&&(st.art==='mannschaft'?k==='teilnahme':k!=='teilnahme'));
    E.innerHTML=`<div class="tred-top"><div class="field"><label>Datum</label><input type="date" id="veD" value="${svEsc(st.datum)}"></div>
        <div class="field"><label>Art</label><select id="veA">${Object.entries(TRS.EART).map(([k,t])=>`<option value="${k}"${st.art===k?' selected':''}>${t}</option>`).join('')}</select></div></div>
      <div class="field" style="margin-top:8px"><label>Titel</label><input id="veT" maxlength="120" value="${svEsc(st.titel)}" placeholder="${svEsc(TRS.EART[st.art]||'')}"></div>
      <div class="sbsec"><h4>Helfer <small>${st.h.filter(h=>h.status==='geholfen').length} geholfen · ${st.h.reduce((a,h)=>a+(h.status==='geholfen'?+(h.stunden||0):0),0)} Std.</small></h4>
        <div class="vradd"><input id="veAdd" list="veList" placeholder="Name eingeben – Spieler oder freier Helfer" autocomplete="off"><datalist id="veList">${people.map(p=>`<option value="${svEsc(p.name)}">`).join('')}</datalist><button type="button" class="btn sm" id="veAddB">${SVI('plus')}</button><button type="button" class="btn ghost sm" id="veSug">Vorschlag</button></div>
        <div class="tratt">${st.h.map((h,i)=>`<div class="trr s-${h.status==='geholfen'?'da':h.status==='zugesagt'?'spaet':'weg'}"><div class="trr-h"><span class="trr-n"><b>${svEsc(vrPersonName(h.person))}</b><em>${h.person.startsWith('x:')?'Helfer ohne Spielerprofil':''}</em></span>
            <select data-hs="${i}" class="vrsel">${Object.entries(TRS.HSTAT).map(([k,t])=>`<option value="${k}"${h.status===k?' selected':''}>${t}</option>`).join('')}</select>
            <input data-hh="${i}" class="vrhrs" type="number" min="0" max="24" step="0.5" inputmode="decimal" value="${h.stunden==null?'':h.stunden}" placeholder="Std." aria-label="Stunden">
            <button type="button" class="iconbtn" data-hx="${i}" title="Entfernen">${SVI('x')}</button></div>
          <div class="trg">${roleKeys.map(k=>`<button type="button" data-hr="${i}:${k}" class="${h.rollen.includes(k)?'on':''}">${TRS.ROLES[k]}</button>`).join('')}</div></div>`).join('')||'<div class="note">Noch niemand eingetragen.</div>'}</div></div>
      <div class="field"><label>Notiz</label><input id="veN" maxlength="2000" value="${svEsc(st.notiz)}" placeholder="z.B. Wetter, Umsatz, was gut lief"></div>
      <div class="btnrow sbact"><button class="btn" id="veSave">Speichern</button><button class="btn ghost" id="veCancel">Abbrechen</button>${st.id?'<button class="btn ghost" id="veDel" style="margin-left:auto;color:#fca5a5">Löschen</button>':''}</div>`;
    const $=x=>document.getElementById(x);
    const keep=()=>{ st.datum=$('veD').value||st.datum; st.art=$('veA').value; st.titel=$('veT').value; st.notiz=$('veN').value;
      E.querySelectorAll('[data-hh]').forEach(x=>{ const v=x.value.replace(',','.'); st.h[+x.dataset.hh].stunden=v===''?null:Math.max(0,Math.min(24,+v)); });
      E.querySelectorAll('[data-hs]').forEach(x=>{ st.h[+x.dataset.hs].status=x.value; }); };
    $('veA').onchange=()=>{ keep(); draw(); };
    E.querySelectorAll('[data-hs]').forEach(x=>x.onchange=()=>{ keep(); draw(); });
    E.querySelectorAll('[data-hr]').forEach(b=>b.onclick=()=>{ keep(); const [i,k]=b.dataset.hr.split(':'); const r=st.h[+i].rollen; const j=r.indexOf(k); if(j>=0)r.splice(j,1); else r.push(k); draw(); });
    E.querySelectorAll('[data-hx]').forEach(b=>b.onclick=()=>{ keep(); st.h.splice(+b.dataset.hx,1); draw(); });
    const add=()=>{ keep(); const v=$('veAdd').value.trim(); if(!v)return; const k=TRC.N(v), hit=people.find(p=>TRC.N(p.name)===k)||(people.filter(p=>TRC.N(p.name).includes(k)).length===1?people.find(p=>TRC.N(p.name).includes(k)):null);
      const person=hit?hit.id:'x:'+v.slice(0,100); if(st.h.some(h=>h.person===person))return kToast('Schon eingetragen');
      st.h.push({person,rollen:[],stunden:null,status:st.datum>trToday()?'zugesagt':'geholfen',notiz:''}); draw(); setTimeout(()=>{ const a=document.getElementById('veAdd'); if(a)a.focus(); },50); };
    $('veAddB').onclick=add; $('veAdd').onkeydown=e=>{ if(e.key==='Enter'){ e.preventDefault(); add(); } };
    $('veSug').onclick=()=>{ keep(); const s=vrSuggest(4,st.h.map(h=>h.person)); s.forEach(x=>st.h.push({person:x.p.id,rollen:[],stunden:null,status:'zugesagt',notiz:''})); draw(); kToast(s.length?'✓ '+s.length+' Helfer vorgeschlagen – wer am wenigsten dran war':'Keine weiteren Vorschläge'); };
    $('veCancel').onclick=()=>closeOverlay();
    if($('veDel'))$('veDel').onclick=async()=>{ if(!confirm('Veranstaltung samt Helfern löschen?'))return; const {error}=await SVB.sb.from('events').delete().eq('id',st.id); if(error)return kToast('⚠️ '+error.message); await vrLoadEvents(); closeOverlay(); kToast('Gelöscht'); };
    $('veSave').onclick=async()=>{ keep(); const titel=st.titel.trim()||TRS.EART[st.art]; const b=$('veSave'); b.disabled=true;
      try{ await vrSaveEvent({id:st.id,datum:st.datum,titel,art:st.art,notiz:st.notiz.trim()||null,ersetzen:true,helfer:st.h.map(h=>({person:h.person,rollen:h.rollen,stunden:h.stunden,status:h.status,notiz:h.notiz||null}))});
        closeOverlay(); kToast('✓ '+titel+' gespeichert'); }catch(e){ b.disabled=false; kToast('⚠️ '+e.message); } };
  };
  draw();
}

/* ----- Allzeit & Legenden ----- */
function vrAtName(x){ const p=x.pid&&trP(x.pid); return p?p.name:x.r.name; }
function vrViewAllTime(B){
  if(!VR.atLoaded){ B.innerHTML='<div class="card"><div class="empty">Lade Vereinsstatistik …</div></div>'; vrLoadAllTime(); return; }
  if(!VR.at.length){ B.innerHTML=`<div class="card"><div class="empty">Die Vereinsstatistik ist noch nicht eingelesen.<br><small>Sie kommt automatisch mit dem nächsten Daten-Update von der Vereinsseite (Spielerstatistiken seit 2013/14).</small></div></div>`; return; }
  const {L,rk}=vrRanks(), today=trToday();
  const stand=VR.at.reduce((a,r)=>r.stand&&r.stand>a?r.stand:a,'');
  const active=L.filter(x=>{ const p=x.pid&&trP(x.pid); return p&&p.own&&!p.verzicht&&!p.isJugend; });
  const ms=active.map(x=>({x,p:trP(x.pid),m:TRS.nextMilestones(x.tot).filter(m=>(m.lab==='Spiele'&&m.rest<=10)||(m.lab==='Tore'&&m.rest<=5)||(m.lab==='Vorlagen'&&m.rest<=3))})).filter(o=>o.m.length).sort((a,b)=>a.m[0].rest-b.m[0].rest);
  const back=L.filter(x=>{ const p=x.pid&&trP(x.pid); return p&&!p.own&&x.tot.sp>=25; }).sort((a,b)=>b.tot.sp-a.tot.sp).slice(0,12);
  const legends=L.filter(x=>x.tot.sp>=200||x.tot.tore>=75).sort((a,b)=>b.tot.sp-a.tot.sp);
  const q=TRC.N(VR.atQ||''), key={sp:x=>x.tot.sp,tore:x=>x.tot.tore,vor:x=>x.tot.vor,siege:x=>x.tot.siege,quote:x=>x.tot.sp>=30?x.tot.quote:-1}[VR.atSort];
  const rows=L.filter(x=>!q||TRC.N(vrAtName(x)).includes(q)||TRC.N(x.r.name).includes(q)).sort((a,b)=>key(b)-key(a)||b.tot.sp-a.tot.sp);
  const status=x=>{ const p=x.pid&&trP(x.pid); if(p&&p.own)return `<span class="trpill ok">aktiv${p.kader===2?' · II':''}</span>`; if(p)return `<span class="trpill mid" title="laut Datenbestand">jetzt ${svEsc(p.club||'')}</span>`; return ''; };
  const th=(k,t)=>`<th><button data-as="${k}" class="${VR.atSort===k?'on':''}">${t}</button></th>`;
  B.innerHTML=`<div class="vrgrid">
      <div class="card"><h3 class="trh">${SVI('trophy')} Meilensteine in Sicht</h3>${ms.length?ms.slice(0,8).map(o=>`<div class="tra l-mittel"><span class="tra-av" data-svp="${svEsc(o.p.id)}">${avaHtml(o.p)}</span><div class="tra-b"><b data-svp="${svEsc(o.p.id)}">${svEsc(o.p.name)}</b><span>${o.m.map(m=>`noch ${m.rest} bis ${m.ziel} ${m.lab}`).join(' · ')}</span></div></div>`).join('')+'<div class="note">Rechtzeitig Ehrung vorbereiten: Stadionsprecher, Social-Media-Post, Erinnerungstrikot – so etwas bindet.</div>':'<div class="note">Gerade niemand kurz vor einem runden Jubiläum.</div>'}</div>
      <div class="card"><h3 class="trh">${SVI('star')} Vereinslegenden <small>(200+ Spiele oder 75+ Tore)</small></h3><div class="vrchips">${legends.map(x=>`<span ${x.pid?`data-svp="${svEsc(x.pid)}"`:''}>${svEsc(vrAtName(x))} <small>${x.tot.sp} Sp. · ${x.tot.tore} T.</small></span>`).join('')||'<span class="note">–</span>'}</div>
        ${back.length?`<h3 class="trh" style="margin-top:14px">${SVI('refresh')} Rückkehrer-Radar</h3><div class="note" style="margin-top:0">Ehemalige mit vielen Spielen für uns, die laut Datenbestand jetzt woanders spielen.</div><div class="vrchips">${back.map(x=>{ const p=trP(x.pid); return `<span data-svp="${svEsc(x.pid)}">${svEsc(vrAtName(x))} <small>${x.tot.sp} Sp. · jetzt ${svEsc(p.club||'?')}${p.cur&&p.cur.tore?' · '+p.cur.tore+' Tore 26/27':''}</small></span>`; }).join('')}</div>`:''}</div>
    </div>
    <div class="card"><div class="vrat-h"><h3 class="trh" style="margin:0">${SVI('chart')} Ewige Liste seit 2013/14</h3><input class="search" id="vrAtQ" type="search" placeholder="Name suchen …" value="${svEsc(VR.atQ)}"></div>
      <div class="trtw"><table class="trtab vrat"><thead><tr><th>#</th><th>Spieler</th>${th('sp','Spiele')}${th('tore','Tore')}${th('vor','Vorl.')}${th('siege','Siege')}${th('quote','Quote')}<th>Abzeichen</th></tr></thead><tbody>
      ${rows.slice(0,VR.atShow).map((x,i)=>{ const b=TRS.badges(x.tot,rk.get(x.r.key)); return `<tr ${x.pid?`data-svp="${svEsc(x.pid)}"`:''}><td>${i+1}</td><td><b>${svEsc(vrAtName(x))}</b> ${status(x)}</td><td>${x.tot.sp}${x.tot.sp>x.r.spiele?` <small>+${x.tot.sp-x.r.spiele}</small>`:''}</td><td>${x.tot.tore}</td><td>${x.tot.vor}</td><td>${x.tot.siege}</td><td>${x.tot.quote==null?'–':x.tot.quote+' %'}</td>
        <td>${b.map(y=>`<i class="vrbadge b-${y.k}" title="${svEsc(y.d)}">${svEsc(y.t)}</i>`).join('')}</td></tr>`; }).join('')}</tbody></table></div>
      ${rows.length>VR.atShow?`<button class="btn ghost sm" id="vrAtMore" style="margin-top:8px">Alle ${rows.length} zeigen</button>`:''}
      <div class="note">Quelle: Spielerstatistiken der Vereinsseite (Stand ${stand?TRC.fmt(stand)+stand.slice(0,4):'–'}). „+“ = Pflichtspiele seitdem – kommen automatisch aus den Spielberichten auf FUSSBALL.DE (inkl. Pokal) oder aus „Spiel erfassen“.</div></div>`;
  B.querySelectorAll('[data-as]').forEach(b=>b.onclick=()=>{ VR.atSort=b.dataset.as; vrViewAllTime(B); });
  B.querySelectorAll('[data-svp]').forEach(x=>x.onclick=()=>openModal(x.dataset.svp));
  const qi=document.getElementById('vrAtQ'); let t=null; qi.oninput=()=>{ clearTimeout(t); t=setTimeout(()=>{ VR.atQ=qi.value; const pos=qi.selectionStart; vrViewAllTime(B); const n=document.getElementById('vrAtQ'); n.focus(); try{n.setSelectionRange(pos,pos);}catch(e){} },250); };
  const mo=document.getElementById('vrAtMore'); if(mo)mo.onclick=()=>{ VR.atShow=5000; vrViewAllTime(B); };
}

/* ---------- Spielerprofil: Scores, Allzeit, Moneyball, Formkurve ---------- */
function vrProfile(pid){
  const M=document.getElementById('modal'), p=trP(pid); if(!M||!p||M.querySelector('.vrprof'))return;
  const anchor=M.querySelector('.trprof')||M.querySelector('.sbwrap')||M.querySelector('.svpos-box')||M.querySelector('.mhead'); if(!anchor)return;
  const team=canTraining(), {row,ms,tot}=vrTotals(pid);
  const el=document.createElement('div'); el.className='card vrprof';
  let h='';
  if(p.own&&team){ const {ts,ls,rt}=vrScores(p);
    h+=`<div class="vrsc3"><button data-pwhy><span>Trainings-Score</span><b class="${vrCls(ts.score)}">${ts.score==null?'–':ts.score}</b></button><button data-pwhy><span>Loyalität</span><b class="${vrCls(ls.score)}">${ls.score}</b></button>${rt.lvl?`<button data-pwhy class="warn"><span>Bindungsrisiko</span><b class="bad">${rt.lvl}</b></button>`:''}</div>`;
    const hs=VR.ev.filter(e=>(e.h||[]).some(x=>x[0]===pid&&x[3]==='geholfen')).slice(0,5);
    if(hs.length)h+=`<div class="trabs"><span>Zuletzt geholfen:</span> ${hs.map(e=>`<i>${svEsc(e.t)} ${TRC.fmt(e.d)}${e.d.slice(2,4)}</i>`).join('')}</div>`; }
  if(row||(ms&&ms.sp)){ const b=TRS.badges(tot,row?vrRanks().rk.get(row.key):null), nx=TRS.nextMilestones(tot)[0];
    h+=`<div class="trkpi vrkpi"><div><b>${tot.sp}</b><span>Pflichtspiele${row?' seit 13/14':''}</span></div><div><b>${tot.tore}</b><span>Tore</span></div><div><b>${tot.vor}</b><span>Vorlagen</span></div><div><b>${tot.quote==null?'–':tot.quote+' %'}</b><span>Siegquote</span></div></div>
      ${b.length?`<div class="vrbadges">${b.map(y=>`<i class="vrbadge b-${y.k}" title="${svEsc(y.d)}">${svEsc(y.t)}</i>`).join('')}</div>`:''}
      ${nx&&p.own?`<div class="note">Nächster Meilenstein: ${nx.ziel} ${nx.lab} – noch ${nx.rest}.</div>`:''}`; }
  if(p.own&&team&&TR.loaded){ const ww=TRS.withWithout(TR.st,pid);
    if(ms&&ms.sp)h+=`<div class="trabs"><span>Saison 26/27 (App):</span><i>${ms.sp} Spiele (${ms.start}× Startelf)</i><i>${ms.tore} Tore</i><i>${ms.vor} Vorlagen</i></div>`;
    if(ww.delta!=null)h+=`<div class="vrmb ${ww.delta>=0.5?'ok':ww.delta<=-0.5?'bad':''}"><b>Moneyball · Mit/Ohne</b><span>Mit ihm in der Startelf ${ww.with.ppg.toFixed(2)} Punkte/Spiel (${ww.with.n} Sp., ${ww.with.ga.toFixed(1)} Gegentore) · ohne ihn ${ww.without.ppg.toFixed(2)} (${ww.without.n} Sp., ${ww.without.ga.toFixed(1)} Gegentore)</span></div>`; }
  if(p.own&&team&&!row&&VR.at.length){ const free=VR.at.filter(r=>!vrIdx().used.has(r.key)).sort((a,b)=>a.name.localeCompare(b.name,'de'));
    h+=`<div class="vrmap"><label>In der Vereinsstatistik unter anderem Namen?</label><select id="vrMap"><option value="">– zuordnen –</option>${free.map(r=>`<option value="${svEsc(r.key)}">${svEsc(r.name)} (${r.spiele} Sp.)</option>`).join('')}</select></div>`; }
  if(!p.own&&canScout()){ const rd=VR.radar.filter(r=>r.player_id===pid).slice(0,4);
    h+=`<div class="vrform" id="vrForm"><span class="note">Formkurve wird geladen …</span></div>${rd.map(r=>`<div class="tra l-${r.lvl}"><span class="tra-av team">${SVI('radar')}</span><div class="tra-b"><b>${svEsc(r.titel)}</b><span>${svEsc(r.detail||'')} · ${TRC.fmt(r.stand)}</span></div></div>`).join('')}`; }
  if(!h)return;
  el.innerHTML=`<h3 class="trh">${SVI('trophy')} ${p.own?'Vereinswerte':'Radar & Form'}</h3>${h}`;
  anchor.after(el);
  el.querySelectorAll('[data-pwhy]').forEach(b=>b.onclick=()=>vrWhy(pid));
  const mp=el.querySelector('#vrMap'); if(mp)mp.onchange=()=>{ if(!mp.value)return; crmSet(pid,{at:mp.value}); try{crmApply();}catch(e){} VR._idx=null; kToast('✓ Zugeordnet – gilt fürs ganze Team'); openModal(pid); };
  const fm=el.querySelector('#vrForm'); if(fm)vrFormCurve(pid,fm);
}
async function vrFormCurve(pid,box){
  try{ const {data,error}=await SVB.sb.rpc('scorer_history',{p_player:pid}); if(error)throw error; const H=data||[];
    if(H.length<2){ box.innerHTML='<span class="note">Formkurve: sammelt sich ab jetzt mit jedem Daten-Update (montags & donnerstags).</span>'; return; }
    const pts=[]; for(let i=1;i<H.length;i++){ const dg=H[i][1]-H[i-1][1], dsp=(H[i][2]||0)-(H[i-1][2]||0); if(dsp>0||dg>0)pts.push({d:H[i][0],g:Math.max(0,dg)}); }
    const mx=Math.max(1,...pts.map(x=>x.g)), w=260, hgt=44, bw=w/Math.max(1,pts.length);
    box.innerHTML=`<div class="note" style="margin:0 0 4px">Tore je Update-Zeitraum (${pts.length} Zeiträume · aktuell ${H[H.length-1][1]} Tore)</div><svg class="trspark" viewBox="0 0 ${w} ${hgt+12}" preserveAspectRatio="none">${pts.map((x,i)=>`<rect x="${i*bw+2}" y="${hgt-(x.g/mx)*hgt}" width="${bw-4}" height="${Math.max(2,(x.g/mx)*hgt)}" rx="3" class="${x.g?'ok':'na'}"><title>bis ${TRC.fmt(x.d)}: ${x.g} Tore</title></rect>`).join('')}</svg>`;
  }catch(e){ box.innerHTML=''; }
}
{ const _om5=openModal; openModal=function(){ const r=_om5.apply(this,arguments); try{ vrProfile(arguments[0]); }catch(e){ console.warn('Vereinswerte',e); } return r; }; }
Object.assign(SV_FIELD,{at:'Allzeit-Zuordnung'});

/* ---------- Radar-Seite ---------- */
const RD_TYP={serie:'Torserie',lauf:'Heißer Lauf',quote:'Überflieger',jung:'Junges Talent',merk:'Merkliste trifft',team:'Unser Team',neu:'Neu im Radar'};
function rdSeen(){ try{ return localStorage.getItem('svbc-radar-seen')||''; }catch(e){ return ''; } }
function rdMarkSeen(){ try{ localStorage.setItem('svbc-radar-seen',new Date().toISOString()); }catch(e){} vrBadge(); }
function vrBadge(){ const s=rdSeen(), n=canScout()?VR.radar.filter(r=>r.created_at>s&&r.lvl!=='info').length:0; document.querySelectorAll('[data-cnt="radar"]').forEach(el=>{ el.textContent=n; el.style.display=n?'':'none'; }); }
function rdChances(){
  const own=p=>p.own, L=players.filter(p=>!own(p)&&p.cur&&p.cur.spiele>=3);
  const age=p=>p.alter!=null&&!p.alterCa?p.alter:null;
  const young=L.filter(p=>age(p)!=null&&age(p)<=21&&p.cur.tore>=3).sort((a,b)=>b.cur.tore/b.cur.spiele-a.cur.tore/a.cur.spiele).slice(0,10)
    .map(p=>({p,t:`${p.name} (${age(p)}) – ${p.cur.tore} Tore in ${p.cur.spiele} Spielen`,d:`${p.cur.club} · ${p.cur.sub||p.cur.liga}`}));
  const carry=L.filter(p=>p.cur.tT>0&&p.cur.tore>=4&&p.cur.tore/p.cur.tT>=0.35&&p.cur.rank&&p.cur.teamCount&&p.cur.rank>p.cur.teamCount/2).sort((a,b)=>b.cur.tore/b.cur.tT-a.cur.tore/a.cur.tT).slice(0,10)
    .map(p=>({p,t:`${p.name} – ${Math.round(p.cur.tore/p.cur.tT*100)} % der Tore seines Teams`,d:`${p.cur.tore} von ${p.cur.tT} Toren · ${p.cur.club} (Platz ${p.cur.rank}/${p.cur.teamCount}, ${p.cur.sub||p.cur.liga})`}));
  const low=L.filter(p=>['C','D1','D2','D'].includes(p.cur.sub||p.cur.liga)&&p.cur.spiele>=4&&p.cur.tore/p.cur.spiele>=1).sort((a,b)=>b.cur.tore/b.cur.spiele-a.cur.tore/a.cur.spiele).slice(0,10)
    .map(p=>({p,t:`${p.name} – ${(p.cur.tore/p.cur.spiele).toFixed(1)} Tore pro Spiel`,d:`${p.cur.tore} Tore · ${p.cur.club} (${p.cur.sub||p.cur.liga})${age(p)!=null?' · '+age(p)+' J.':''}`}));
  return {young,carry,low};
}
function rdItem(r){
  const p=r.player_id&&trP(r.player_id), star=p&&p.star;
  return `<div class="tra l-${r.lvl} rdit"><span class="tra-av ${p?'':'team'}" ${p?`data-svp="${svEsc(p.id)}"`:''}>${p?avaHtml(p):SVI(r.typ==='team'?'shield':'radar')}</span>
    <div class="tra-b"><b ${p?`data-svp="${svEsc(p.id)}"`:''}>${svEsc(r.titel)}</b><span>${svEsc(r.detail||'')}</span><small class="rdmeta">${svEsc(RD_TYP[r.typ]||r.typ)} · ${TRC.fmt(r.stand)}${r.stand.slice(2,4)}${r.created_at>rdSeen()?' · <i class="rdnew">neu</i>':''}</small></div>
    ${p&&!p.own?`<button class="iconbtn rdstar${star?' on':''}" data-star="${svEsc(p.id)}" title="${star?'Auf der Merkliste':'Auf die Merkliste'}">${SVI('star')}</button>`:''}</div>`;
}
function rdRender(){
  const P=document.getElementById('panel-radar'); if(!P)return;
  if(!canScout()){ P.innerHTML='<div class="card"><div class="empty">Das Radar sehen nur Trainer, Kaderplaner und Vorstand.</div></div>'; return; }
  if(!VR.radarLoaded){ P.innerHTML='<div class="card"><div class="empty">Lade Radar …</div></div>'; vrLoadRadar(); return; }
  const F=VR.rf, R=VR.radar.filter(r=>F==='alle'||r.typ===F||(F==='chancen'&&false));
  const ch=rdChances(), tf=TR.loaded?TRS.teamForm(TR.st):null;
  const types=[['alle','Alle'],['serie','Torserien'],['lauf','Heiße Läufe'],['quote','Überflieger'],['jung','Junge'],['merk','Merkliste'],['team','Unser Team'],['chancen','Moneyball-Chancen']];
  const newN=VR.radar.filter(r=>r.created_at>rdSeen()).length;
  const sec=(t,L,why)=>L.length?`<div class="card"><h3 class="trh">${t}</h3>${why?`<div class="note" style="margin-top:0">${why}</div>`:''}${L.map(x=>`<div class="tra l-info rdit"><span class="tra-av" data-svp="${svEsc(x.p.id)}">${avaHtml(x.p)}</span><div class="tra-b"><b data-svp="${svEsc(x.p.id)}">${svEsc(x.t)}</b><span>${svEsc(x.d)}</span></div><button class="iconbtn rdstar${x.p.star?' on':''}" data-star="${svEsc(x.p.id)}" title="Merkliste">${SVI('star')}</button></div>`).join('')}</div>`:'';
  P.innerHTML=`<div class="tiles trtiles">
      <div class="tile"><div class="v ${newN?'ok':''}">${newN}</div><div class="l">neue Meldungen</div><div class="s">seit deinem letzten Blick</div></div>
      <div class="tile"><div class="v">${VR.radar.filter(r=>r.typ==='serie').length}</div><div class="l">Torserien erkannt</div><div class="s">3+ Spieltage in Folge getroffen</div></div>
      ${tf&&tf.n?`<div class="tile"><div class="v">${tf.res.slice(0,5).join(' ')}</div><div class="l">Unsere Form</div><div class="s">${tf.ppg.toFixed(2)} Punkte/Spiel · ${tf.tf}:${tf.ta} Tore</div></div>`:''}</div>
    <div class="trtabs rdf">${types.map(([k,t])=>`<button class="${F===k?'on':''}" data-rf="${k}">${t}</button>`).join('')}</div>
    ${F==='chancen'?sec(`${SVI('sprout')} Junge Torjäger (≤ 21)`,ch.young,'Aus den aktuellen Torjägerlisten – Alter, soweit bekannt.')+sec(`${SVI('gem')} Trägt sein Team`,ch.carry,'Schießt einen Großteil der Tore einer Mannschaft aus der unteren Tabellenhälfte – oft wechselbereit.')+sec(`${SVI('chart')} Knipser in C- und D-Liga`,ch.low,'Mindestens ein Tor pro Spiel – wer schafft den Sprung eine oder zwei Ligen höher?')
      :`<div class="card">${R.length?R.slice(0,150).map(rdItem).join(''):`<div class="empty">Noch keine Meldungen${F!=='alle'?' in dieser Kategorie':''}.<br><small>Das Radar vergleicht bei jedem Daten-Update (montags & donnerstags früh) die Torjägerlisten aller 7 Ligen mit dem letzten Stand. Torserien werden erkannt, sobald drei Spieltage vorliegen. Sofort nutzbar: „Moneyball-Chancen“.</small></div>`}</div>`}
    <div class="note">Meldungen gehen auch als Push-Nachricht an alle mit aktivierten Mitteilungen. Quelle: Torjägerlisten &amp; Tabellen von FUSSBALL.DE.</div>`;
  P.querySelectorAll('[data-rf]').forEach(b=>b.onclick=()=>{ VR.rf=b.dataset.rf; rdRender(); });
  P.querySelectorAll('[data-svp]').forEach(x=>x.onclick=()=>openModal(x.dataset.svp));
  P.querySelectorAll('[data-star]').forEach(b=>b.onclick=e=>{ e.stopPropagation(); const p=trP(b.dataset.star); if(!p)return; const on=!p.star; crmSet(p.id,{f:on?1:undefined}); try{crmApply();}catch(x){} try{renderAll();}catch(x){} kToast(on?'⭐ '+p.name+' auf der Merkliste – das Radar meldet jedes Tor':'Von der Merkliste genommen'); rdRender(); });
  setTimeout(rdMarkSeen,1500);
}

/* ---------- Übersicht: Radar & Verein ---------- */
function vrHomeCard(){
  const host=document.getElementById('trHome')||document.getElementById('svRemind')||document.getElementById('svHello'); if(!host||!canScout())return;
  let el=document.getElementById('vrHome'); if(!el){ el=document.createElement('div'); el.id='vrHome'; host.after(el); }
  const week=TRC.addDays(trToday(),-8), R=VR.radar.filter(r=>r.stand>=week&&r.lvl!=='info').slice(0,3);
  let ms=[]; if(VR.at.length){ try{ ms=vrRanks().L.filter(x=>{ const p=x.pid&&trP(x.pid); return p&&p.own&&!p.verzicht; }).map(x=>({p:trP(x.pid),m:TRS.nextMilestones(x.tot).find(m=>(m.lab==='Spiele'&&m.rest<=5)||(m.lab==='Tore'&&m.rest<=3))})).filter(o=>o.m).slice(0,2); }catch(e){} }
  const tf=TR.loaded?TRS.teamForm(TR.st):null;
  if(!R.length&&!ms.length&&!(tf&&tf.n)){ el.innerHTML=''; return; }
  el.innerHTML=`<div class="card trhome"><div class="rm-h"><div class="rm-ic co">${SVI('radar')}</div><div class="rm-t"><h3>Radar &amp; Verein</h3><p>${tf&&tf.n?`Form: <b>${tf.res.slice(0,5).join(' ')}</b>${tf.clean>=2?` · ${tf.clean} Spiele zu Null`:''}${tf.wins>=3?` · ${tf.wins} Siege in Folge`:''}`:'Was sich in der Region tut'}</p></div>
    <button class="btn sm" data-home-radar>${SVI('radar')} Radar</button></div>
    ${R.map(rdItem).join('')}${ms.map(o=>`<div class="tra l-mittel"><span class="tra-av" data-svp="${svEsc(o.p.id)}">${avaHtml(o.p)}</span><div class="tra-b"><b data-svp="${svEsc(o.p.id)}">${svEsc(o.p.name)}: noch ${o.m.rest} bis ${o.m.ziel} ${o.m.lab}</b><span>Ehrung vorbereiten?</span></div></div>`).join('')}
    <div class="rm-f"><button class="btn ghost" data-home-verein>Rankings &amp; Verein →</button></div></div>`;
  el.querySelector('[data-home-radar]').onclick=()=>goTab('radar');
  el.querySelector('[data-home-verein]').onclick=()=>goTab('verein');
  el.querySelectorAll('[data-svp]').forEach(x=>x.onclick=()=>openModal(x.dataset.svp));
  el.querySelectorAll('[data-star]').forEach(b=>b.style.display='none');
}

/* ---------- Import: Excel/CSV oder Einfügen (Trainingslisten, Helferlisten, Verletzungen) ---------- */
function vrXlsx(){ if(window.XLSX)return Promise.resolve(window.XLSX); return new Promise((res,rej)=>{ const s=document.createElement('script'); s.src='vendor/xlsx.mini.min.js?v='+encodeURIComponent((window.SVBC_CFG&&SVBC_CFG.build)||''); s.onload=()=>res(window.XLSX); s.onerror=()=>rej(new Error('Excel-Modul konnte nicht geladen werden')); document.head.appendChild(s); }); }
function vrCSV(text){
  const first=(text.split(/\r?\n/).find(l=>l.trim())||'');
  const d=['\t',';',','].map(c=>[c,first.split(c).length]).sort((a,b)=>b[1]-a[1])[0][0];
  const rows=[]; let row=[], cell='', q=false;
  for(let i=0;i<text.length;i++){ const c=text[i];
    if(q){ if(c==='"'){ if(text[i+1]==='"'){ cell+='"'; i++; } else q=false; } else cell+=c; continue; }
    if(c==='"'&&cell==='')q=true; else if(c===d){ row.push(cell); cell=''; } else if(c==='\n'){ row.push(cell.replace(/\r$/,'')); rows.push(row); row=[]; cell=''; } else cell+=c; }
  if(cell!==''||row.length){ row.push(cell.replace(/\r$/,'')); rows.push(row); }
  return rows.filter(r=>r.some(x=>String(x).trim()));
}
function vrDateCell(v){
  if(v instanceof Date&&!isNaN(v)){ const t=v.getTime()-v.getTimezoneOffset()*60000; return new Date(t+43200000).toISOString().slice(0,10); }
  if(typeof v==='number'&&v>20000&&v<80000)return new Date(Date.UTC(1899,11,30)+Math.round(v)*864e5).toISOString().slice(0,10);
  const s=String(v==null?'':v).trim(); let m;
  if((m=s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)))return `${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`;
  if((m=s.match(/^(?:[A-Za-zÄÖÜäöü]{2,3}\.?,?\s*)?(\d{1,2})\.(\d{1,2})\.(\d{2,4})\b/))){ const y=m[3].length===2?'20'+m[3]:m[3]; return `${y}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`; }
  if((m=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/))){ const y=m[3].length===2?'20'+m[3]:m[3]; return `${y}-${m[1].padStart(2,'0')}-${m[2].padStart(2,'0')}`; }
  if((m=s.match(/^(?:[A-Za-zÄÖÜäöü]{2,3}\.?,?\s*)?(\d{1,2})\.(\d{1,2})\.?$/)))return '????-'+m[2].padStart(2,'0')+'-'+m[1].padStart(2,'0');
  return null;
}
function vrFixYears(ds){ // „12.09.“ ohne Jahr: rückwärts ab heute, Spalten chronologisch angenommen
  if(!ds.some(d=>d&&d.startsWith('????')))return ds;
  let y=+trToday().slice(0,4); const out=ds.slice(); let next=null;
  for(let i=ds.length-1;i>=0;i--){ const d=ds[i]; if(!d||!d.startsWith('????'))continue; const md=d.slice(5);
    if(next==null){ if(`${y}-${md}`>TRC.addDays(trToday(),7))y--; } else if(md>next)y--;
    out[i]=`${y}-${md}`; next=md; }
  return out;
}
const VR_CODES=[['da',/^(x|✓|✔|✅|1|ja|j|da|anw|anwesend|\+|dabei|tr)$/],['spaet',/^(sp|spaet|spät|zs|zu spät|zu spaet|verspätet|verspaetet)$/],['verletzt',/^(v|verl|verletzt|vl)$|verletz/],
  ['krank',/^(k|kr|krank)$|krank|grippe/],['urlaub',/^(ur|url|urlaub)$|urlaub/],['arbeit',/^(ar|arb|arbeit|schicht|a)$|arbeit|schicht/],['uni',/^(s|sch|schule|uni|studium|klausur)$|schule|uni|klausur/],
  ['zweite',/^(z|2|ii|zweite|res|reserve)$|zweite/],['familie',/^(fam|familie)$|famil|hochzeit|geburtstag/],['privat',/^(e|ent|entsch|entschuldigt|p|priv|privat)$|entschuld|privat/],
  ['ohne',/^(u|ue|unent|unentschuldigt|0|-|f|fehlt|n|nein|o|ohne|nicht da)$|unentsch|ohne grund/]];
function vrGuessCode(v){ const s=TRC.N(String(v).trim()); if(!s)return ''; for(const [k,rx] of VR_CODES){ if(rx.test(s))return k; } return '?'; }
const VR_CODE_OPTS=[['','nicht erfasst (überspringen)'],['da','Da'],['spaet','Zu spät'],...Object.entries(TRC.REASONS).map(([k,t])=>[k,'Fehlt · '+t])];
function vrMatchName(raw,people){
  const s=String(raw||'').trim(); if(!s||s.length<2)return null;
  const n=TRC.N(s).replace(/\s+/g,' '), sw=n.includes(',')?n.split(',').map(x=>x.trim()).reverse().join(' '):n;
  const full=people.find(p=>TRC.N(p.name)===sw||TRC.N(p.name)===n); if(full)return full.id;
  const idx=TRC.nameIndex(people), hits=TRC.findPlayers(sw.replace(/[^a-z0-9 ]/g,' '),idx); if(hits.length===1)return hits[0].id;
  const w=sw.split(' '); if(w.length===2&&w[1].length<=2){ const c=people.filter(p=>{ const q=TRC.N(p.name).split(' '); return q[0]===w[0]&&q[q.length-1].startsWith(w[1].replace('.','')); }); if(c.length===1)return c[0].id; }
  return null;
}
function vrImport(kind0,file0){
  const people=vrPeople().concat((DATA&&DATA.jugend||[]).filter(j=>j.id&&j.name).map(j=>({id:j.id,name:j.name}))).filter((p,i,a)=>a.findIndex(q=>q.id===p.id)===i);
  const S={kind:kind0||'training',rows:null,sheets:null,sheet:null,wb:null,hdr:0,nameCol:null,layout:null,map:{},codes:{},cols:{},busy:false,fileName:''};
  svModal(`<div class="mhead"><div class="rm-ic" style="width:46px;height:46px">${SVI('upload')}</div><div><h2 style="margin:0">Listen importieren</h2><div class="msub">Excel, CSV oder einfach Zellen aus Excel/Google Sheets einfügen</div></div></div><div id="vrIm"></div>`);
  const $=x=>document.getElementById(x);
  const load=async(file,text)=>{
    try{ if(file&&/\.(xlsx|xlsm|xlsb)$/i.test(file.name)){ const X=await vrXlsx(); const wb=X.read(await file.arrayBuffer(),{type:'array',cellDates:true}); S.wb=wb; S.sheets=wb.SheetNames; S.sheet=wb.SheetNames[0]; S.rows=X.utils.sheet_to_json(wb.Sheets[S.sheet],{header:1,raw:true,defval:''}); }
      else if(file){ S.rows=vrCSV(await file.text()); }
      else S.rows=vrCSV(text);
      S.fileName=file?file.name:'eingefügt'; analyse(); draw(); }catch(e){ kToast('⚠️ '+(e.message||e)); } };
  const analyse=(forceHdr)=>{
    const R=S.rows||[]; S.map={}; S.codes={}; S.cols={};
    // Kopfzeile = erste Zeile mit ≥ 2 Datumszellen oder mit bekannten Spaltennamen
    let hdr=0; for(let i=0;i<Math.min(15,R.length);i++){ const r=R[i]; const nd=r.filter(v=>vrDateCell(v)).length; const kw=r.filter(v=>/name|spieler|datum|helfer|veranstaltung|diagnose/i.test(String(v))).length; if(nd>=2||kw>=1){ hdr=i; break; } }
    if(forceHdr!=null)hdr=forceHdr; S.hdr=hdr; const H=R[hdr]||[];
    const dcols=H.map((v,i)=>vrDateCell(v)?i:-1).filter(i=>i>=0);
    const body=R.slice(hdr+1);
    // Namensspalte: meiste Treffer im Kader
    let best=-1, bs=-1; const ncol=Math.max(...R.slice(0,60).map(r=>r.length),0);
    for(let c=0;c<ncol;c++){ if(dcols.includes(c))continue; const sc=body.slice(0,80).filter(r=>vrMatchName(r[c],people)).length; if(sc>bs){ bs=sc; best=c; } }
    S.nameCol=best;
    const find=rx=>H.findIndex(v=>rx.test(TRC.N(String(v))));
    if(S.kind==='training'&&dcols.length>=2){ S.layout='matrix'; const ds=vrFixYears(dcols.map(c=>vrDateCell(H[c]))); S.cols.dates=dcols.map((c,i)=>({c,d:ds[i]})).filter(x=>x.d&&!x.d.startsWith('?'));
      const vals={}; body.forEach(r=>S.cols.dates.forEach(x=>{ const v=String(r[x.c]==null?'':r[x.c]).trim(); if(v)vals[v]=(vals[v]||0)+1; })); S.codes=Object.fromEntries(Object.keys(vals).sort((a,b)=>vals[b]-vals[a]).map(v=>[v,{n:vals[v],to:vrGuessCode(v)}])); }
    else if(S.kind==='training'){ S.layout='lang'; S.cols={datum:find(/datum|date|tag/),status:find(/status|anwesen|grund|da\b|bemerk/),motivation:find(/motiv|einsatz|lust/),notiz:find(/notiz|bemerkung|kommentar/)};
      const vals={}; if(S.cols.status>=0)body.forEach(r=>{ const v=String(r[S.cols.status]||'').trim(); if(v)vals[v]=(vals[v]||0)+1; }); S.codes=Object.fromEntries(Object.keys(vals).map(v=>[v,{n:vals[v],to:vrGuessCode(v)}])); }
    else if(S.kind==='helfer'&&dcols.length>=1&&find(/veranstaltung|event|anlass/)<0){ S.layout='matrix'; S.cols.events=dcols.map(c=>({c,d:vrFixYears([vrDateCell(H[c])])[0],t:String(H[c]).replace(/\d{1,2}\.\d{1,2}\.(\d{2,4})?/,'').replace(/[()]/g,'').trim()})); }
    else if(S.kind==='helfer'){ S.layout='lang'; S.cols={datum:find(/datum|date|tag/),titel:find(/veranstaltung|event|anlass|fest|titel/),aufgabe:find(/aufgabe|rolle|taetig|dienst|einsatz/),stunden:find(/stunden|std|dauer|zeit/),status:find(/status|erschienen/)}; }
    else { S.layout='lang'; S.cols={diagnose:find(/diagnose|verletzung|beschwerde/),von:find(/von|beginn|seit|start|datum/),bis:find(/bis|zurueck|ende|wieder/),prognose:find(/prognose|voraus/)}; }
    // Namen zuordnen
    const names=new Set(); body.forEach(r=>{ const v=String(r[S.nameCol]==null?'':r[S.nameCol]).trim(); if(!v)return; (S.kind==='helfer'?v.split(/,|;|\/|\bund\b|&/):[v]).map(x=>x.trim()).filter(x=>x.length>1).forEach(x=>names.add(x)); });
    names.forEach(n=>{ S.map[n]=vrMatchName(n,people)||(S.kind==='helfer'?'x:'+n:''); });
  };
  const plan=()=>{ // was würde importiert?
    const R=(S.rows||[]).slice(S.hdr+1), out=[]; const pid=v=>{ const k=String(v==null?'':v).trim(); return k?S.map[k]:null; };
    if(S.kind==='training'&&S.layout==='matrix'){ const by={}; R.forEach(r=>{ const p=pid(r[S.nameCol]); if(!p||p.startsWith('x:'))return; S.cols.dates.forEach(x=>{ const v=String(r[x.c]==null?'':r[x.c]).trim(); const to=v&&S.codes[v]?S.codes[v].to:''; if(!to||to==='?')return;
        (by[x.d]=by[x.d]||[]).push(to==='da'||to==='spaet'?{player_id:p,status:to}:{player_id:p,status:'weg',grund:to}); }); }); Object.keys(by).sort().forEach(d=>out.push({datum:d,spieler:by[d]})); }
    else if(S.kind==='training'){ const by={}; R.forEach(r=>{ const p=pid(r[S.nameCol]), d=vrDateCell(r[S.cols.datum]); if(!p||p.startsWith('x:')||!d||d.startsWith('?'))return; const v=S.cols.status>=0?String(r[S.cols.status]||'').trim():'x'; const to=S.cols.status>=0?(S.codes[v]&&S.codes[v].to):'da'; if(!to||to==='?')return;
        const o=to==='da'||to==='spaet'?{player_id:p,status:to}:{player_id:p,status:'weg',grund:to}; const mo=S.cols.motivation>=0?+r[S.cols.motivation]:0; if(mo>=1&&mo<=5)o.motivation=Math.round(mo); if(S.cols.notiz>=0&&String(r[S.cols.notiz]).trim())o.notiz=String(r[S.cols.notiz]).trim().slice(0,500);
        (by[d]=by[d]||[]).push(o); }); Object.keys(by).sort().forEach(d=>out.push({datum:d,spieler:by[d]})); }
    else if(S.kind==='helfer'&&S.layout==='matrix'){ S.cols.events.forEach(ev=>{ if(!ev.d||ev.d.startsWith('?'))return; const helfer=[]; R.forEach(r=>{ const p=pid(r[S.nameCol]); const v=String(r[ev.c]==null?'':r[ev.c]).trim(); if(!p||!v)return; const h=parseFloat(v.replace(',','.'));
        helfer.push({person:p,rollen:TRS.roleOf(v),stunden:isNaN(h)?null:Math.min(24,h),status:/nicht|nein|^n$|fehlt/i.test(v)?'nicht_erschienen':'geholfen'}); });
        const titel=ev.t||'Veranstaltung'; if(helfer.length)out.push({datum:ev.d,titel,art:TRS.eventArt(titel),helfer}); }); }
    else if(S.kind==='helfer'){ const by={}; R.forEach(r=>{ const d=vrDateCell(r[S.cols.datum]); const titel=String(S.cols.titel>=0?r[S.cols.titel]:'').trim()||'Veranstaltung'; if(!d||d.startsWith('?'))return;
        const raw=String(r[S.nameCol]==null?'':r[S.nameCol]); const aufg=S.cols.aufgabe>=0?String(r[S.cols.aufgabe]||''):''; const h=S.cols.stunden>=0?parseFloat(String(r[S.cols.stunden]).replace(',','.')):NaN; const stv=S.cols.status>=0?String(r[S.cols.status]||''):'';
        raw.split(/,|;|\/|\bund\b|&/).map(x=>x.trim()).filter(x=>x.length>1).forEach(n=>{ const p=S.map[n]; if(!p)return; const k=d+'|'+titel; const e=by[k]=by[k]||{datum:d,titel,art:TRS.eventArt(titel+' '+aufg),helfer:[]};
          e.helfer.push({person:p,rollen:TRS.roleOf(aufg),stunden:isNaN(h)?null:Math.min(24,h),status:/nicht erschienen|nicht gekommen|^nein$/i.test(stv)?'nicht_erschienen':/abgesagt/i.test(stv)?'abgesagt':/zugesagt/i.test(stv)?'zugesagt':'geholfen'}); }); });
      Object.values(by).forEach(e=>out.push(e)); }
    else { R.forEach(r=>{ const p=pid(r[S.nameCol]), b=vrDateCell(r[S.cols.von]); if(!p||p.startsWith('x:')||!b||b.startsWith('?'))return; const dg=String(S.cols.diagnose>=0?r[S.cols.diagnose]:'').trim()||'Verletzung';
        const z=S.cols.bis>=0?vrDateCell(r[S.cols.bis]):null, pr=S.cols.prognose>=0?vrDateCell(r[S.cols.prognose]):null;
        out.push({player_id:p,diagnose:dg.slice(0,200),beginn:b,zurueck:z&&z>=b&&!z.startsWith('?')?z:null,prognose:pr&&pr>=b&&!pr.startsWith('?')?pr:null}); }); }
    return out;
  };
  const draw=()=>{
    const E=$('vrIm'); if(!E)return;
    const kinds=[['training','Trainings-Anwesenheit'],['helfer','Helfer & Veranstaltungen'],['verletzung','Verletzungen']];
    let h=`<div class="trtabs sm" style="margin:12px 0">${kinds.map(([k,t])=>`<button class="${S.kind===k?'on':''}" data-ik="${k}">${t}</button>`).join('')}</div>`;
    if(!S.rows){
      h+=`<div class="vrdrop"><label class="btn" for="vrFile">${SVI('upload')} Datei wählen (.xlsx oder .csv)</label><input type="file" id="vrFile" accept=".xlsx,.xlsm,.csv,.txt,.tsv" hidden>
          <div class="note">oder Zellen aus Excel/Google Sheets kopieren und hier einfügen:</div><textarea id="vrPaste" rows="6" placeholder="Name	01.09.	03.09.	05.09.&#10;Tim Fries	x	k	x&#10;…"></textarea><button class="btn ghost sm" id="vrPasteGo">Eingefügtes einlesen</button></div>
        <div class="note">${S.kind==='training'?'Typisch: eine Zeile je Spieler, eine Spalte je Trainingstag (x = da, k = krank, v = verletzt, u = unentschuldigt, e = entschuldigt, ur = Urlaub …). Auch eine lange Liste „Datum | Name | Status“ geht.':S.kind==='helfer'?'Z. B. „Datum | Veranstaltung | Name(n) | Aufgabe | Stunden“ – mehrere Namen in einer Zelle mit Komma trennen. Oder: Zeilen = Helfer, Spalten = Veranstaltungen (Zelle = Stunden oder x).':'Z. B. „Name | Diagnose | von | bis“.'} Die Zuordnung prüfst du im nächsten Schritt.</div>`;
    } else {
      const P=plan(), un=Object.entries(S.map).filter(([,v])=>!v);
      const cnt=S.kind==='training'?`${P.length} Einheiten · ${P.reduce((a,s)=>a+s.spieler.length,0)} Einträge${P.length?` · ${TRC.fmt(P[0].datum)}${P[0].datum.slice(2,4)} – ${TRC.fmt(P[P.length-1].datum)}${P[P.length-1].datum.slice(2,4)}`:''}`
        :S.kind==='helfer'?`${P.length} Veranstaltungen · ${P.reduce((a,e)=>a+e.helfer.length,0)} Helfereinsätze`:`${P.length} Verletzungen`;
      const H=(S.rows[S.hdr]||[]), colOpt=(sel)=>`<option value="-1">–</option>`+H.map((v,i)=>`<option value="${i}"${sel===i?' selected':''}>${svEsc(String(v||'Spalte '+(i+1)).slice(0,30))}</option>`).join('');
      h+=`<div class="vrim-src"><b>${svEsc(S.fileName)}</b> · ${S.rows.length} Zeilen${S.sheets&&S.sheets.length>1?` · Blatt <select id="vrSheet">${S.sheets.map(n=>`<option${n===S.sheet?' selected':''}>${svEsc(n)}</option>`).join('')}</select>`:''} <button class="btn ghost sm" id="vrReset">Andere Datei</button></div>
        <div class="editgrid"><div class="field"><label>Kopfzeile</label><select id="vrHdr">${S.rows.slice(0,15).map((r,i)=>`<option value="${i}"${S.hdr===i?' selected':''}>Zeile ${i+1}: ${svEsc(r.slice(0,4).join(' | ').slice(0,40))}</option>`).join('')}</select></div>
          <div class="field"><label>Spalte mit Namen</label><select id="vrNameCol">${colOpt(S.nameCol)}</select></div>
          ${S.layout==='lang'?Object.entries(S.cols).map(([k,v])=>`<div class="field"><label>Spalte ${svEsc({datum:'Datum',status:'Status/Grund',motivation:'Motivation (1–5)',notiz:'Notiz',titel:'Veranstaltung',aufgabe:'Aufgabe',stunden:'Stunden',diagnose:'Diagnose',von:'Von/Beginn',bis:'Bis/zurück',prognose:'Prognose'}[k]||k)}</label><select data-col="${k}">${colOpt(v)}</select></div>`).join(''):''}</div>
        ${S.layout==='matrix'&&S.kind==='training'?`<div class="note">Erkannt: Tabelle mit ${S.cols.dates.length} Trainingstagen als Spalten.</div>`:''}
        ${Object.keys(S.codes).length?`<div class="sbsec"><h4>Was bedeuten die Einträge?</h4><div class="vrcodes">${Object.entries(S.codes).slice(0,30).map(([v,o])=>`<div class="${o.to==='?'?'warn':''}"><code>${svEsc(v.slice(0,20))}</code><small>${o.n}×</small><select data-code="${svEsc(v)}">${(o.to==='?'?'<option value="?" selected>– bitte wählen –</option>':'')+VR_CODE_OPTS.map(([k,t])=>`<option value="${k}"${o.to===k?' selected':''}>${t}</option>`).join('')}</select></div>`).join('')}</div></div>`:''}
        <div class="sbsec"><h4>Namen <small>${Object.keys(S.map).length-un.length} von ${Object.keys(S.map).length} zugeordnet</small></h4>
          ${un.length?`<div class="vrcodes">${un.map(([n])=>`<div class="warn"><code>${svEsc(n.slice(0,30))}</code><select data-nm="${svEsc(n)}"><option value="">ignorieren</option>${people.map(p=>`<option value="${svEsc(p.id)}">${svEsc(p.name)}</option>`).join('')}${S.kind==='helfer'?`<option value="x:${svEsc(n)}">als Helfer ohne Profil</option>`:''}</select></div>`).join('')}</div>`:'<div class="note">Alle Namen erkannt. 👍</div>'}
          <details class="vrdet"><summary>Zuordnung prüfen (${Object.keys(S.map).length-un.length})</summary>${Object.entries(S.map).filter(([,v])=>v).map(([n,v])=>`<div><code>${svEsc(n)}</code> → ${svEsc(vrPersonName(v))}</div>`).join('')}</details></div>
        <div class="vrim-sum">${SVI('check')} ${cnt}</div>
        <div class="btnrow sbact"><button class="btn" id="vrGo"${P.length&&!S.busy?'':' disabled'}>${S.busy?'Importiere …':'Importieren'}</button><button class="btn ghost" id="vrCancel">Abbrechen</button></div>
        <div class="note">Bereits vorhandene Einträge am selben Tag werden ergänzt bzw. für diese Spieler überschrieben – nichts wird doppelt angelegt.</div>`;
    }
    E.innerHTML=h;
    E.querySelectorAll('[data-ik]').forEach(b=>b.onclick=()=>{ S.kind=b.dataset.ik; if(S.rows)analyse(); draw(); });
    if($('vrFile'))$('vrFile').onchange=e=>{ const f=e.target.files[0]; if(f)load(f); };
    if($('vrPasteGo'))$('vrPasteGo').onclick=()=>{ const t=$('vrPaste').value; if(t.trim())load(null,t); };
    if($('vrReset'))$('vrReset').onclick=()=>{ S.rows=null; S.wb=null; S.sheets=null; draw(); };
    if($('vrCancel'))$('vrCancel').onclick=()=>closeOverlay();
    if($('vrSheet'))$('vrSheet').onchange=()=>{ S.sheet=$('vrSheet').value; S.rows=window.XLSX.utils.sheet_to_json(S.wb.Sheets[S.sheet],{header:1,raw:true,defval:''}); analyse(); draw(); };
    if($('vrHdr'))$('vrHdr').onchange=()=>{ analyse(+$('vrHdr').value); draw(); };
    if($('vrNameCol'))$('vrNameCol').onchange=()=>{ S.nameCol=+$('vrNameCol').value; const body=S.rows.slice(S.hdr+1); S.map={}; body.forEach(r=>{ const v=String(r[S.nameCol]==null?'':r[S.nameCol]).trim(); if(!v)return; (S.kind==='helfer'?v.split(/,|;|\/|\bund\b|&/):[v]).map(x=>x.trim()).filter(x=>x.length>1).forEach(x=>{ S.map[x]=vrMatchName(x,people)||(S.kind==='helfer'?'x:'+x:''); }); }); draw(); };
    E.querySelectorAll('[data-col]').forEach(s=>s.onchange=()=>{ S.cols[s.dataset.col]=+s.value; if(s.dataset.col==='status'){ const vals={}; S.rows.slice(S.hdr+1).forEach(r=>{ const v=String(r[+s.value]||'').trim(); if(v)vals[v]=(vals[v]||0)+1; }); S.codes=Object.fromEntries(Object.keys(vals).map(v=>[v,{n:vals[v],to:vrGuessCode(v)}])); } draw(); });
    E.querySelectorAll('[data-code]').forEach(s=>s.onchange=()=>{ S.codes[s.dataset.code].to=s.value; draw(); });
    E.querySelectorAll('[data-nm]').forEach(s=>s.onchange=()=>{ S.map[s.dataset.nm]=s.value||null; if(!s.value)S.map[s.dataset.nm]=null; draw(); });
    if($('vrGo'))$('vrGo').onclick=async()=>{ const P=plan(); if(!P.length)return; S.busy=true; draw(); const b=$('vrGo'); let ok=0, fail=0;
      try{
        if(S.kind==='training'){ for(const s of P){ for(let i=0;i<s.spieler.length;i+=80){ try{ const {error}=await SVB.sb.rpc('training_save',{p:{datum:s.datum,typ:'training',spieler:s.spieler.slice(i,i+80)}}); if(error)throw error; ok++; }catch(e){ fail++; console.warn(s.datum,e); } } if(b)b.textContent=`Importiere … ${ok}/${P.length}`; } await trLoad(true); }
        else if(S.kind==='helfer'){ for(const e of P){ try{ const {error}=await SVB.sb.rpc('event_save',{p:e}); if(error)throw error; ok++; }catch(x){ fail++; console.warn(e,x); } if(b)b.textContent=`Importiere … ${ok}/${P.length}`; } await vrLoadEvents(); }
        else { const have=new Set(TR.st.injuries.map(i=>i.p+'|'+i.b)); const rows=P.filter(i=>!have.has(i.player_id+'|'+i.beginn)).map(i=>({player_id:i.player_id,diagnose:i.diagnose,beginn:i.beginn,zurueck:i.zurueck,prognose:i.prognose}));
          if(rows.length){ const {error}=await SVB.sb.from('injuries').insert(rows); if(error)throw error; } ok=rows.length; fail=0; await trLoad(true); }
        closeOverlay(); kToast(`✓ Import fertig: ${ok} ${S.kind==='training'?'Einheiten':S.kind==='helfer'?'Veranstaltungen':'Verletzungen'}${fail?' · '+fail+' fehlgeschlagen':''}`);
      }catch(e){ S.busy=false; draw(); kToast('⚠️ '+(e.message||e)); } };
  };
  draw();
  if(file0)load(file0);
}

/* ---------- Start ---------- */
{ const _gt3=goTab; goTab=function(tab){ const r=_gt3.apply(this,arguments); if(tab==='verein')vrRender(); if(tab==='radar')rdRender(); return r; }; }
{ const _si3=svInit; svInit=function(){
    const r=_si3.apply(this,arguments);
    const scout=canScout();
    document.querySelectorAll('[data-tab="radar"],[data-sheet="radar"]').forEach(b=>{ b.style.display=scout?'':'none'; });
    vrLoadAllTime();
    if(canTraining())vrLoadEvents();
    if(scout){ vrLoadRadar();
      try{ const ch=SVB.sb.channel('verein-live'); let t=null, t2=null;
        ['events','event_helpers'].forEach(tb=>ch.on('postgres_changes',{event:'*',schema:'public',table:tb},()=>{ clearTimeout(t); t=setTimeout(vrLoadEvents,600); }));
        ch.on('postgres_changes',{event:'INSERT',schema:'public',table:'radar'},()=>{ clearTimeout(t2); t2=setTimeout(vrLoadRadar,800); });
        ch.subscribe(); }catch(e){}
      { const _rh4=renderHome; renderHome=function(){ const x=_rh4.apply(this,arguments); try{vrHomeCard();}catch(e){} return x; }; }
    }
    { const _ta=trAfter; trAfter=function(){ const x=_ta.apply(this,arguments); try{ if(document.querySelector('#panel-verein.active'))vrRender(); vrHomeCard(); }catch(e){} return x; }; }
    const h=(location.hash||'').slice(1); if(h==='verein'||h==='radar')setTimeout(()=>goTab(h),60);
    return r; }; }

/* =====================================================================
   SV/BSC Scout · Runde 9: Zurück-Taste wie in einer richtigen App
   - Seitenwechsel landen im Verlauf → „Zurück“ führt zur vorherigen Seite
   - Offene Fenster (Spielerprofil, Co-Trainer, Editoren) und das Mehr-Menü schließen sich mit „Zurück“
   - Auf der Übersicht beendet erst ein doppeltes „Zurück“ die App
   ===================================================================== */
const SVH={ready:false,pop:false,ignore:0,layer:null,exitAt:0};
const svUrl=t=>location.pathname+(t==='home'?'':'#'+t);
function svCurTab(){ const p=document.querySelector('main .panel.active'); return p?p.id.replace('panel-',''):'home'; }
function svHist(tab){
  const st={sv:'tab',tab};
  if(!SVH.ready||SVH.pop){ try{ history.replaceState(SVH.ready?st:history.state,'',svUrl(tab)); }catch(e){} return; }
  const cur=history.state;
  if(cur&&cur.sv==='layer'){                                        // Seitenwechsel aus Fenster/Menü heraus: dessen Eintrag wird zur neuen Seite
    SVH.layer=null; try{ history.replaceState(st,'',svUrl(tab)); }catch(e){}
    const ov=document.getElementById('overlay'); if(ov&&ov.classList.contains('open'))closeOverlay();
    return; }
  if(cur&&cur.sv==='tab'&&cur.tab===tab)return;
  try{ history.pushState(st,'',svUrl(tab)); }catch(e){}
}
function svLayerOpened(kind){ if(!SVH.ready||SVH.layer)return; SVH.layer=kind; try{ history.pushState({sv:'layer',kind},'',location.href); }catch(e){} }
function svLayerClosed(kind){ if(!SVH.ready||SVH.layer!==kind)return; SVH.layer=null; if(history.state&&history.state.sv==='layer'){ SVH.ignore++; try{ history.back(); }catch(e){ SVH.ignore--; } } }
function svOnPop(e){
  if(SVH.ignore>0){ SVH.ignore--; return; }
  const st=e.state||{};
  if(SVH.layer){
    const k=SVH.layer; SVH.layer=null;
    if(k==='modal'){
      if(typeof NAV!=='undefined'&&Array.isArray(NAV)&&NAV.length&&typeof navBack==='function'&&document.getElementById('mback')){ navBack(); SVH.layer='modal'; try{ history.pushState({sv:'layer',kind:'modal'},'',location.href); }catch(x){} }
      else closeOverlay();
    } else svSheet(false);
    return;
  }
  if(st.sv==='tab'){ SVH.pop=true; try{ goTab(st.tab); }finally{ SVH.pop=false; } return; }
  // ganz unten im Verlauf
  if(svCurTab()!=='home'){ SVH.pop=true; try{ goTab('home'); }finally{ SVH.pop=false; } try{ history.pushState({sv:'tab',tab:'home'},'',svUrl('home')); }catch(x){} return; }
  if(Date.now()-SVH.exitAt<2200){ SVH.ignore=0; try{ history.back(); }catch(x){} return; }
  SVH.exitAt=Date.now(); kToast('Zum Beenden nochmal zurück');
  try{ history.pushState({sv:'tab',tab:'home'},'',svUrl('home')); }catch(x){}
}
function svHistInit(){
  if(SVH.ready)return;
  const t=svCurTab();
  try{ history.replaceState({sv:'base'},'',location.pathname+location.hash); history.pushState({sv:'tab',tab:t},'',svUrl(t)); }catch(e){ return; }
  SVH.ready=true;
  window.addEventListener('popstate',svOnPop);
  const watch=(id,kind)=>{ const el=document.getElementById(id); if(!el)return; let was=el.classList.contains('open');
    new MutationObserver(()=>{ const now=el.classList.contains('open'); if(now===was)return; was=now; if(now)svLayerOpened(kind); else svLayerClosed(kind); }).observe(el,{attributes:true,attributeFilter:['class']}); };
  watch('overlay','modal'); watch('moreSheet','sheet');
}
{ const _si4=svInit; svInit=function(){ const r=_si4.apply(this,arguments); setTimeout(svHistInit,120); return r; }; }

/* =====================================================================
   SV/BSC Scout · Runde 9: Jede Rolle bekommt ihr eigenes Cockpit
   - Tab-Leiste und Seitenleiste je Rolle (Scouting immer vorne)
   - Übersicht: Rollen-Cockpit mit Schnellaktionen, wichtigsten Meldungen und KI-Lagebild
   - Scouting-Seite: Radar-Streifen ganz oben
   - Nutzungsprotokoll (Zeit, Bereiche) – Auswertung ausschließlich für den Admin
   ===================================================================== */
const SV_TABBAR={trainer:['home','training','elf','scout'],planer:['home','scout','kandidaten','kaderplan'],vorstand:['home','scout','verein','kandidaten'],
  admin:['home','scout','training','kandidaten'],viewer:['home','scout','kaderplan','verein']};
const SV_TBL={home:['home','Home'],scout:['search','Scouting'],training:['activity','Training'],elf:['pitch','Aufstellung'],kandidaten:['kand','Kandidaten'],
  kaderplan:['plan','Kaderplan'],verein:['trophy','Verein'],radar:['radar','Radar'],sxi:['layers','Schattenelf'],db:['db','Datenbank'],gems:['gem','Rohdiamanten'],
  jugend:['sprout','Jugend'],cmp:['chart','Vergleich'],play:['book','Playbook'],model:['sliders','Modell'],admin:['shield','Nutzer & Rollen']};
const SV_SIDE={trainer:['Übersicht','Spieltag','Kaderplanung','Scouting','Verein','Wissen','Verwaltung']};
const SV_TAB_ORDER={trainer:['training','elf','kaderplan','kandidaten','sxi']};

function svBuildTabbar(){
  const bar=document.getElementById('tabbar'), more=document.getElementById('tMore'); if(!bar||!more)return;
  bar.querySelectorAll('.ti').forEach(b=>b.remove());
  (SV_TABBAR[svRole()]||SV_TABBAR.viewer).filter(t=>svTabAllowed(t)).forEach(t=>{
    const [ic,l]=SV_TBL[t], b=document.createElement('button'); b.className='ti'; b.dataset.tab=t;
    b.innerHTML=SVI(ic)+svEsc(l)+(['training','kandidaten','radar'].includes(t)?`<span class="cnt" data-cnt="${t}" style="display:none"></span>`:'');
    b.onclick=()=>goTab(t); bar.insertBefore(b,more); });
  const cur=svCurTab(); bar.querySelectorAll('.ti').forEach(b=>b.classList.toggle('active',b.dataset.tab===cur));
  more.classList.toggle('on',!bar.querySelector('.ti.active'));
}
function svOrderSide(){
  const nav=document.querySelector('.snav'); if(!nav)return;
  const order=SV_SIDE[svRole()]; const groups=[]; let g=null;
  [...nav.children].forEach(el=>{ if(el.classList.contains('sgrp')){ g={name:el.textContent.trim(),els:[el]}; groups.push(g); } else if(g)g.els.push(el); });
  if(order)groups.sort((a,b)=>(order.indexOf(a.name)+100*(order.indexOf(a.name)<0))-(order.indexOf(b.name)+100*(order.indexOf(b.name)<0)));
  const to=SV_TAB_ORDER[svRole()];
  groups.forEach(gr=>{ if(to&&gr.name==='Kaderplanung'){ const [h,...btns]=gr.els; btns.sort((a,b)=>{ const ia=to.indexOf(a.dataset.tab), ib=to.indexOf(b.dataset.tab); return (ia<0?99:ia)-(ib<0?99:ib); }); gr.els=[h,...btns]; } gr.els.forEach(el=>nav.appendChild(el)); });
}

/* ---------- Nutzung: Zeit & Bereiche (nur für den Admin sichtbar) ---------- */
const SVUS={secs:0,last:Date.now(),views:{},started:false};
function svUseTick(force){ const now=Date.now(); if(force||document.visibilityState==='visible')SVUS.secs+=Math.min(90,Math.max(0,(now-SVUS.last)/1000)); SVUS.last=now; }
async function svUseFlush(){
  svUseTick(); const s=Math.round(SVUS.secs), v=SVUS.views; if(s<5&&!Object.keys(v).length)return;
  SVUS.secs=0; SVUS.views={};
  try{ const {error}=await SVB.sb.rpc('usage_ping',{p_secs:Math.min(300,s),p_views:v}); if(error)throw error; }
  catch(e){ SVUS.secs+=s; Object.entries(v).forEach(([k,n])=>SVUS.views[k]=(SVUS.views[k]||0)+n); }
}
function svUseView(tab){
  if(!/^[a-z]{2,20}$/.test(tab))return; SVUS.views[tab]=(SVUS.views[tab]||0)+1;
  try{ const c=JSON.parse(localStorage.getItem('svbc-views')||'{}'); c[tab]=(c[tab]||0)+1; localStorage.setItem('svbc-views',JSON.stringify(c)); }catch(e){}
}
function svUseStart(){
  if(SVUS.started)return; SVUS.started=true; SVUS.last=Date.now();
  setInterval(()=>svUseTick(),30000); setInterval(svUseFlush,120000);
  document.addEventListener('visibilitychange',()=>{ if(document.visibilityState==='hidden'){ svUseTick(true); svUseFlush(); } else SVUS.last=Date.now(); });
  window.addEventListener('pagehide',()=>{ svUseTick(true); svUseFlush(); });
}
function svTopTabs(n,skip){
  let c={}; try{ c=JSON.parse(localStorage.getItem('svbc-views')||'{}'); }catch(e){}
  const tot=Object.values(c).reduce((a,b)=>a+b,0); if(tot<12)return [];
  return Object.entries(c).filter(([t])=>t!=='home'&&SV_TBL[t]&&svTabAllowed(t)&&!(skip||[]).includes(t)).sort((a,b)=>b[1]-a[1]).slice(0,n).map(([t])=>t);
}

/* ---------- Rollen-Cockpit auf der Übersicht ---------- */
function svInsights(){
  const r=svRole(), out=[], team=canTraining();
  const add=(prio,lvl,t,d,go)=>out.push({prio,lvl,t,d,go});
  const W={trainer:{tr:1,inj:1,md:2,radar:4,kand:6,ms:3,risk:2,form:3,help:7,use:9},planer:{tr:5,inj:6,md:7,radar:1,kand:1,ms:6,risk:4,form:5,help:8,use:9},
    vorstand:{tr:3,inj:5,md:6,radar:2,kand:3,ms:2,risk:1,form:1,help:2,use:9},admin:{tr:3,inj:5,md:6,radar:2,kand:3,ms:3,risk:2,form:2,help:4,use:1},viewer:{ms:1,form:2}}[r]||{};
  try{ if(team&&TR.loaded){ trAlerts().filter(a=>a.lvl!=='info').slice(0,3).forEach(a=>add(W.tr,a.lvl,a.t,a.d,()=>goTab('training')));
    const inj=trSquad().filter(p=>trInjury(p.id)); if(inj.length)add(W.inj,'info',`${inj.length} verletzt`,inj.slice(0,4).map(p=>p.name.split(' ').pop()).join(', '),()=>{ TR.view='injuries'; goTab('training'); }); } }catch(e){}
  try{ if(canScout()){ const s=rdSeen(); VR.radar.filter(x=>x.lvl==='hoch'&&(x.created_at>s||x.stand>=TRC.addDays(trToday(),-4))).slice(0,2).forEach(x=>add(W.radar,'mittel','📡 '+x.titel,x.detail||'',()=>goTab('radar')));
    const n=VR.radar.filter(x=>x.created_at>s).length; if(n>2)add(W.radar+0.5,'info',`${n} neue Radar-Meldungen`,'Torserien, Überflieger, junge Talente',()=>goTab('radar')); } }catch(e){}
  try{ if(r!=='viewer'){ const due=kandList().filter(kandIsDue).length; if(due)add(W.kand,due>3?'mittel':'info',`${due} Kandidaten-Kontakt${due>1?'e':''} fällig`,'Zeit für einen Anruf',()=>goTab('kandidaten')); } }catch(e){}
  try{ if(VR.at.length){ const ms=vrRanks().L.filter(x=>{ const p=x.pid&&trP(x.pid); return p&&p.own&&!p.verzicht; }).map(x=>({p:trP(x.pid),m:TRS.nextMilestones(x.tot).find(m=>(m.lab==='Spiele'&&m.rest<=3)||(m.lab==='Tore'&&m.rest<=2))})).filter(o=>o.m);
    ms.slice(0,2).forEach(o=>add(W.ms,'info',`🎉 ${o.p.name}: noch ${o.m.rest} bis ${o.m.ziel} ${o.m.lab}`,'Ehrung vorbereiten?',()=>openModal(o.p.id))); } }catch(e){}
  try{ if(team&&TR.loaded&&VR.evLoaded){ const risk=vrKader(false).map(p=>({p,rt:vrScores(p).rt})).filter(x=>x.rt.lvl).sort((a,b)=>b.rt.risk-a.rt.risk);
    risk.slice(0,2).forEach(x=>add(W.risk,x.rt.lvl,`Bindungsrisiko: ${x.p.name}`,x.rt.why.join(' · '),()=>vrWhy(x.p.id))); } }catch(e){}
  try{ if(TR.loaded){ const f=TRS.teamForm(TR.st); if(f.n>=3)add(W.form,f.winless>=3?'mittel':'info',`Form: ${f.res.slice(0,5).join(' ')}`,`${f.ppg.toFixed(2)} Punkte/Spiel · ${f.tf}:${f.ta} Tore${f.clean>=2?` · ${f.clean}× zu Null in Folge`:''}`,()=>goTab('training')); } }catch(e){}
  try{ if(team&&VR.evLoaded&&VR.ev.length){ const hs=vrHelpStats(VR_SEASON_START), never=vrKader(false).filter(p=>!hs.has(p.id)).length; if(never>=5)add(W.help,'info',`${never} Spieler der Ersten haben diese Saison noch nie geholfen`,'„Wer ist dran?“ verteilt die nächsten Dienste fair',()=>{ VR.view='events'; goTab('verein'); }); } }catch(e){}
  try{ if(isAdmin()&&SVA.use){ const U=SVA.use, flag=U.filter(u=>u.flagN>0), heavy=U.filter(u=>u.ai24>=40), idle=U.filter(u=>u.active&&u.role!=='viewer'&&u.role!=='admin'&&(!u.last_seen||Date.now()-new Date(u.last_seen)>14*864e5));
    if(flag.length||heavy.length)add(W.use,'hoch',`⚠️ Co-Trainer: auffällige Nutzung`,[...heavy.map(u=>u.name+' ('+u.ai24+' Fragen/24 h)'),...flag.map(u=>u.name+' ('+u.flagN+'× abseits)')].join(' · '),()=>svUseOpen());
    if(idle.length)add(W.use+0.5,'mittel',`${idle.length} Teammitglied${idle.length>1?'er':''} seit 14+ Tagen nicht in der App`,idle.map(u=>u.name||u.email).join(', '),()=>svUseOpen()); } }catch(e){}
  return out.filter(x=>x.prio!=null).sort((a,b)=>a.prio-b.prio||({hoch:0,mittel:1,info:2}[a.lvl]-{hoch:0,mittel:1,info:2}[b.lvl])).slice(0,6);
}
const SV_ACTIONS={
  trainer:[['activity','Training erfassen',()=>trSessionEditor(trToday())],['plus','Spiel erfassen',()=>trSessionEditor(trToday(),null,'spiel')],['chat','Co-Trainer',()=>trChatOpen()],['pitch','Aufstellung',()=>goTab('elf')]],
  planer:[['radar','Radar',()=>goTab('radar')],['search','Scouting',()=>goTab('scout')],['kand','Kandidaten',()=>goTab('kandidaten')],['layers','Schattenelf',()=>goTab('sxi')]],
  vorstand:[['trophy','Rankings & Verein',()=>goTab('verein')],['radar','Radar',()=>goTab('radar')],['plan','Kaderplan',()=>goTab('kaderplan')],['kand','Kandidaten',()=>goTab('kandidaten')]],
  admin:[['user','Nutzung',()=>svUseOpen()],['radar','Radar',()=>goTab('radar')],['activity','Training',()=>goTab('training')],['kand','Kandidaten',()=>goTab('kandidaten')]],
  viewer:[['search','Scouting',()=>goTab('scout')],['plan','Kaderplan',()=>goTab('kaderplan')],['trophy','Allzeit & Legenden',()=>{ VR.view='allzeit'; goTab('verein'); }]]};
const SV_ROLE_HEAD={trainer:'Dein Trainer-Cockpit',planer:'Dein Kaderplanungs-Cockpit',vorstand:'Dein Vorstands-Cockpit',admin:'Admin-Cockpit',viewer:'Überblick'};
const SVA={use:null,brief:null,briefBusy:false};
function svCockpit(){
  const host=document.getElementById('svHello'); if(!host)return;
  let el=document.getElementById('svCockpit'); if(!el){ el=document.createElement('div'); el.id='svCockpit'; host.after(el); }
  const r=svRole(), acts=SV_ACTIONS[r]||SV_ACTIONS.viewer, ins=svInsights(), top=svTopTabs(4,[...acts.map(a=>''),'home']);
  const ai=canTraining()&&TR.ai&&TR.ai.ready;
  el.innerHTML=`<div class="card svcock"><div class="svc-h"><h3>${svEsc(SV_ROLE_HEAD[r]||'Cockpit')}</h3>${ai?`<button class="btn ghost sm" id="svBriefBtn">${SVI('chat')} KI-Lagebild</button>`:''}</div>
    <div class="svc-acts">${acts.map((a,i)=>`<button class="svc-a" data-act="${i}">${SVI(a[0])}<span>${svEsc(a[1])}</span></button>`).join('')}</div>
    ${SVA.brief?`<div class="svc-brief"><b>${SVI('chat')} Lagebild des Co-Trainers</b><div>${svEsc(SVA.brief.text).replace(/\n/g,'<br>')}</div><small>${svEsc(SVA.brief.when||'')}</small></div>`:''}
    <div class="svc-ins">${ins.length?ins.map((x,i)=>`<button class="svc-i l-${x.lvl}" data-ins="${i}"><b>${svEsc(x.t)}</b><span>${svEsc(x.d)}</span></button>`).join(''):'<div class="note">Alles ruhig – keine dringenden Punkte.</div>'}</div>
    ${top.length?`<div class="svc-top"><span>Oft genutzt:</span>${top.map(t=>`<button data-top="${t}">${SVI(SV_TBL[t][0])}${svEsc(SV_TBL[t][1])}</button>`).join('')}</div>`:''}</div>`;
  el.querySelectorAll('[data-act]').forEach(b=>b.onclick=()=>acts[+b.dataset.act][2]());
  el.querySelectorAll('[data-ins]').forEach(b=>b.onclick=()=>{ const x=ins[+b.dataset.ins]; if(x&&x.go)x.go(); });
  el.querySelectorAll('[data-top]').forEach(b=>b.onclick=()=>goTab(b.dataset.top));
  const bb=document.getElementById('svBriefBtn'); if(bb)bb.onclick=svBrief;
  svHomeOrder();
}
async function svBrief(){
  if(SVA.briefBusy)return; SVA.briefBusy=true; const b=document.getElementById('svBriefBtn'); if(b){ b.disabled=true; b.textContent='Denkt nach …'; }
  try{ const {data,error}=await SVB.sb.functions.invoke('coach',{body:{mode:'lagebild'}}); if(error)throw error;
    if(!data||!data.ok)throw new Error(data&&data.error==='kein-schluessel'?'KI ist nicht eingerichtet':(data&&data.error)||'keine Antwort');
    SVA.brief={text:data.text,when:(data.cached?'von heute ':'')+new Date().toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'})+' Uhr'}; }
  catch(e){ kToast('⚠️ '+(e.message||e)); }
  SVA.briefBusy=false; svCockpit();
}
function svHomeOrder(){
  const host=document.getElementById('svHello'); if(!host)return;
  const ord={trainer:['svCockpit','trHome','vrHome','svRemind'],planer:['svCockpit','vrHome','svRemind','trHome'],vorstand:['svCockpit','vrHome','trHome','svRemind'],
    admin:['svCockpit','vrHome','trHome','svRemind'],viewer:['svCockpit']}[svRole()]||['svCockpit'];
  let after=host; ord.forEach(id=>{ const el=document.getElementById(id); if(el&&el.parentNode===host.parentNode){ if(after.nextSibling!==el)after.after(el); after=el; } });
}

/* ---------- Scouting-Seite: Radar ganz oben ---------- */
function svScoutStrip(){
  const P=document.getElementById('panel-scout'); if(!P||!canScout())return;
  let el=document.getElementById('rdStrip'); if(!el){ el=document.createElement('div'); el.id='rdStrip'; P.prepend(el); }
  const R=VR.radar.filter(r=>r.lvl!=='info').slice(0,3), n=VR.radar.filter(r=>r.created_at>rdSeen()).length;
  el.innerHTML=`<div class="card rdstrip"><div class="svc-h"><h3>${SVI('radar')} Radar${n?` <span class="pill on">${n} neu</span>`:''}</h3><div class="btnrow"><button class="btn sm" data-rs="radar">Alle Meldungen</button><button class="btn ghost sm" data-rs="chancen">Moneyball-Chancen</button></div></div>
    ${R.length?R.map(rdItem).join(''):'<div class="note">Noch keine Meldungen – das Radar wertet jedes Daten-Update aus.</div>'}</div>`;
  el.querySelectorAll('[data-rs]').forEach(b=>b.onclick=()=>{ VR.rf=b.dataset.rs==='chancen'?'chancen':'alle'; goTab('radar'); });
  el.querySelectorAll('[data-svp]').forEach(x=>x.onclick=()=>openModal(x.dataset.svp));
  el.querySelectorAll('[data-star]').forEach(b=>b.style.display='none');
}

/* ---------- Admin: Nutzung & Aktivität (nur Admin) ---------- */
async function svUseLoad(){ if(!isAdmin())return null; try{ const {data,error}=await SVB.sb.rpc('admin_usage',{p_days:30}); if(error)throw error; SVA.use=data||[]; }catch(e){ console.warn('Nutzung',e); } return SVA.use; }
const svMin=s=>{ s=+s||0; if(s<60)return s?'<1 Min.':'–'; const m=Math.round(s/60); return m<60?m+' Min.':(Math.floor(m/60)+' h '+(m%60?m%60+' Min.':'')); };
const svAgo2=d=>{ if(!d)return 'nie'; const x=(Date.now()-new Date(d))/1000; if(x<3600)return 'vor '+Math.max(1,Math.round(x/60))+' Min.'; if(x<86400)return 'vor '+Math.round(x/3600)+' Std.'; const t=Math.round(x/86400); return t===1?'gestern':'vor '+t+' Tagen'; };
function svUseTop(v,n){ return Object.entries(v||{}).sort((a,b)=>b[1]-a[1]).slice(0,n).map(([k,c])=>(SV_TBL[k]?SV_TBL[k][1]:k)+' '+c+'×').join(', '); }
async function svUseCard(P){
  if(!P||!isAdmin()||P.querySelector('#svUse'))return;
  const el=document.createElement('div'); el.className='card'; el.id='svUse'; el.innerHTML='<div class="empty">Lade Nutzung …</div>'; P.appendChild(el);
  const U=await svUseLoad()||[];
  const warn=U.filter(u=>u.ai24>=40||u.flagN>0), idle=U.filter(u=>u.active&&u.role!=='viewer'&&u.role!=='admin'&&(!u.last_seen||Date.now()-new Date(u.last_seen)>14*864e5));
  el.innerHTML=`<div class="adm-head"><div><h3 style="margin:0;display:flex;gap:8px;align-items:center">${SVI('user')} Nutzung &amp; Aktivität <span class="pill wait">nur für dich</span></h3>
      <p style="margin:6px 0 0;font-size:13.5px">Zeit in der App, aktive Tage, meistgenutzte Bereiche und Fragen an den Co-Trainer (30 Tage). Sieht außer dir niemand – auch nicht der Vorstand.</p></div></div>
    ${warn.length?`<div class="tra l-hoch"><span class="tra-av team">${SVI('bell')}</span><div class="tra-b"><b>Auffällige KI-Nutzung</b><span>${warn.map(u=>`${svEsc(u.name||u.email)}: ${u.ai24} Fragen in 24 h${u.flagN?`, ${u.flagN}× Themen außerhalb des Vereins`:''}`).join(' · ')}</span></div></div>`:''}
    ${idle.length?`<div class="tra l-mittel"><span class="tra-av team">${SVI('clock')}</span><div class="tra-b"><b>Länger nicht in der App</b><span>${idle.map(u=>`${svEsc(u.name||u.email)} (${svEsc(SVB.ROLE_T[u.role]||u.role)}, ${svAgo2(u.last_seen)})`).join(' · ')}</span></div></div>`:''}
    <div class="trtw"><table class="trtab svuse"><thead><tr><th>Mitglied</th><th>Zuletzt</th><th>Zeit 7 T</th><th>Zeit 30 T</th><th>Aktive Tage</th><th>Meistgenutzt</th><th>Co-Trainer</th></tr></thead><tbody>
    ${U.map(u=>`<tr data-use="${svEsc(u.id)}" class="${u.active?'':'off'}"><td><b>${svEsc(u.name||u.email)}</b><br><small>${svEsc(SVB.ROLE_T[u.role]||u.role)}${u.active?'':' · gesperrt'}</small></td><td>${svAgo2(u.last_seen)}</td><td>${svMin(u.secs7)}</td><td>${svMin(u.secsN)}</td><td>${u.daysN}</td>
      <td><small>${svEsc(svUseTop(u.views,3)||'–')}</small></td><td>${u.aiN}${u.flagN?` <b class="bad">⚠ ${u.flagN}</b>`:''}${u.ai24>=40?' <b class="bad">viel</b>':''}</td></tr>`).join('')}</tbody></table></div>
    <div class="note">Tipp: Antippen zeigt Details inkl. der letzten Fragen an den Co-Trainer. Die Mitglieder werden in „Mein Konto“ darauf hingewiesen, dass die Nutzung protokolliert wird.</div>`;
  el.querySelectorAll('[data-use]').forEach(r=>r.onclick=()=>svUseDetail(r.dataset.use));
}
function svUseDetail(id){
  const u=(SVA.use||[]).find(x=>x.id===id); if(!u)return;
  svModal(`<div class="mhead"><div class="uav r-${svEsc(u.role)}" style="width:46px;height:46px;border-radius:14px">${svEsc(svIni(u.name||u.email))}</div><div><h2 style="margin:0">${svEsc(u.name||u.email)}</h2><div class="msub">${svEsc(SVB.ROLE_T[u.role]||u.role)} · zuletzt ${svAgo2(u.last_seen)}</div></div></div>
    <div class="trkpi" style="margin-top:14px"><div><b>${svMin(u.secs7)}</b><span>Zeit 7 Tage</span></div><div><b>${svMin(u.secsN)}</b><span>Zeit 30 Tage</span></div><div><b>${u.daysN}</b><span>aktive Tage</span></div><div><b>${u.aiN}</b><span>Co-Trainer-Fragen</span></div></div>
    <div class="sbsec"><h4>Bereiche (30 Tage)</h4><div class="vrchips">${Object.entries(u.views||{}).sort((a,b)=>b[1]-a[1]).map(([k,c])=>`<span>${svEsc(SV_TBL[k]?SV_TBL[k][1]:k)} <small>${c}×</small></span>`).join('')||'<span class="note">keine Daten</span>'}</div></div>
    <div class="sbsec"><h4>Letzte Fragen an den Co-Trainer</h4>${(u.fragen||[]).length?`<div class="svq">${u.fragen.map(f=>`<div class="${f.flagged?'flag':''}"><em>${new Date(f.at).toLocaleString('de-DE',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}${f.modus!=='chat'?' · '+svEsc(f.modus):''}${f.bilder?' · 🖼 '+f.bilder:''}${f.datei?' · 📎 '+svEsc(f.datei):''}</em>${svEsc(f.frage||'–')}${f.flagged?`<b>⚠ abseits: ${svEsc(f.grund||'')}</b>`:''}</div>`).join('')}</div>`:'<div class="note">Noch keine.</div>'}</div>`);
}
function svUseOpen(){ goTab('admin'); setTimeout(()=>{ const c=document.getElementById('svUse'); if(c)c.scrollIntoView({behavior:'smooth'}); },600); }
{ const _ar2=svAdminRender; svAdminRender=async function(){ const r=await _ar2.apply(this,arguments); try{ await svUseCard(document.getElementById('panel-admin')); }catch(e){ console.warn(e); } return r; }; }

/* ---------- Mein Konto: Transparenz ---------- */
{ const _acc2=svAccount; svAccount=function(){
    const r=_acc2.apply(this,arguments);
    const M=document.getElementById('modal'), app=M&&[...M.querySelectorAll('.editsec')].pop(); if(!app)return r;
    const sec=document.createElement('div'); sec.className='editsec';
    sec.innerHTML=`<h4>Datenschutz &amp; Nutzung</h4><p class="note" style="margin:0">Damit die App fair und sicher bleibt, werden Nutzungszeit, aufgerufene Bereiche und Fragen an den Co-Trainer protokolliert. Einsehen kann das ausschließlich der Admin. <span id="svMyUse"></span></p>`;
    app.after(sec);
    SVB.sb.rpc('my_usage').then(({data})=>{ const s=document.getElementById('svMyUse'); if(s&&data)s.textContent=`Deine letzten 30 Tage: ${svMin(data.secs30)} in der App, ${data.ai30} Co-Trainer-Fragen.`; }).catch(()=>{});
    return r; }; }

/* ---------- Start ---------- */
{ const _gt4=goTab; goTab=function(tab){ const r=_gt4.apply(this,arguments); try{ svUseView(svCurTab()); if(tab==='scout')svScoutStrip(); if(tab==='home')svCockpit(); }catch(e){} return r; }; }
{ const _va=vrAfter; vrAfter=function(){ const r=_va.apply(this,arguments); try{ if(document.querySelector('#panel-home.active'))svCockpit(); if(document.querySelector('#panel-scout.active'))svScoutStrip(); }catch(e){} return r; }; }
{ const _ta3=trAfter; trAfter=function(){ const r=_ta3.apply(this,arguments); try{ if(document.querySelector('#panel-home.active'))svCockpit(); }catch(e){} return r; }; }
{ const _si5=svInit; svInit=function(){
    const r=_si5.apply(this,arguments);
    try{ svBuildTabbar(); svOrderSide(); }catch(e){ console.warn('Navigation',e); }
    { const _rh5=renderHome; renderHome=function(){ const x=_rh5.apply(this,arguments); try{ svCockpit(); }catch(e){} return x; }; }
    try{ svCockpit(); }catch(e){}
    svUseStart(); svUseView(svCurTab());
    if(isAdmin())svUseLoad().then(()=>{ try{ if(document.querySelector('#panel-home.active'))svCockpit(); }catch(e){} });
    try{ trBadge(); svBadges(); vrBadge(); }catch(e){}
    return r; }; }

/* =====================================================================
   SV/BSC Scout · Runde 10: Spielerkarten im Stil der Fußball-Sammelkarten, Vereinswappen, Spielerfotos
   - Karte: Gesamtwert (OVR) + 6 Werte aus den echten Daten (Abschluss, Anteil an Teamtoren, Form, Potenzial,
     bei eigenen Spielern Training & Loyalität, sonst Wechselchance & Nähe). Antippen dreht die Karte um.
   - Wappen: öffentliche Vereinslogos von FUSSBALL.DE (nur angezeigt, nicht kopiert)
   - Fotos: nur vereinsintern, selbst aufgenommen oder mit Einverständnis – gespeichert in der eigenen Datenbank
   ===================================================================== */
const SVC={crest:new Map(),crestLoaded:false,photos:new Map(),photosLoaded:false};
const scNorm=s=>TRC.N(String(s||'')).replace(/[^a-z0-9]/g,'');
function scCrestId(club){ if(!club)return null; const k=scNorm(club); return SVC.crest.get(k)||SVC.crest.get(k.replace(/(iii|ii|2|3)$/,''))||null; }
function scCrest(club,cls){ const id=scCrestId(club), ini=`<span class="crest cx">${svEsc(initials(club||'?'))}</span>`;
  return `<span class="crestw ${cls||''}">${ini}${id?`<img class="crest" src="https://www.fussball.de/export.media/-/action/getLogo/format/3/id/${encodeURIComponent(id)}" alt="" referrerpolicy="no-referrer" loading="lazy" onerror="this.remove()">`:''}</span>`; }
async function scLoadCrests(){
  if(SVC.crestLoaded||!canScout())return; SVC.crestLoaded=true;
  try{ const {data,error}=await SVB.sb.from('table_snaps').select('club_key,logo,stand').not('logo','is',null).order('stand',{ascending:false}).limit(600); if(error)throw error;
    (data||[]).forEach(r=>{ if(!SVC.crest.has(r.club_key))SVC.crest.set(r.club_key,r.logo); }); }catch(e){ console.warn('Wappen',e); }
}
async function scLoadPhotos(){
  if(SVC.photosLoaded||!canScout())return; SVC.photosLoaded=true;
  try{ const {data,error}=await SVB.sb.from('player_photos').select('player_id,data').limit(600); if(error)throw error;
    (data||[]).forEach(r=>{ SVC.photos.set(r.player_id,r.data); const p=players.find(x=>x.id===r.player_id); if(p)p.photo=r.data; });
    if((data||[]).length){ try{ renderAll(); }catch(e){} }
  }catch(e){ console.warn('Fotos',e); }
}
function scSquare(file,size){ return new Promise((res,rej)=>{ const fr=new FileReader(); fr.onerror=()=>rej(new Error('Datei nicht lesbar'));
  fr.onload=()=>{ const img=new Image(); img.onerror=()=>rej(new Error('Kein gültiges Bild')); img.onload=()=>{
    const s=Math.min(img.width,img.height), c=document.createElement('canvas'); c.width=c.height=size;
    // Ausschnitt: Mitte, etwas nach oben (Gesicht)
    const sx=(img.width-s)/2, sy=Math.max(0,(img.height-s)*0.3);
    c.getContext('2d').drawImage(img,sx,sy,s,s,0,0,size,size); let q=0.82, u=c.toDataURL('image/jpeg',q);
    while(u.length>150000&&q>0.4){ q-=0.12; u=c.toDataURL('image/jpeg',q); } res(u); }; img.src=fr.result; }; fr.readAsDataURL(file); }); }
async function scSavePhoto(p,file){
  try{ const data=await scSquare(file,320);
    const {error}=await SVB.sb.from('player_photos').upsert({player_id:p.id,data},{onConflict:'player_id'}); if(error)throw error;
    p.photo=data; SVC.photos.set(p.id,data); try{renderAll();}catch(e){} openModal(p.id); kToast('📷 Foto gespeichert – nur im Team sichtbar'); }
  catch(e){ kToast('⚠️ '+(e.message||e)); }
}
async function scDelPhoto(p){
  try{ const {error}=await SVB.sb.from('player_photos').delete().eq('player_id',p.id); if(error)throw error; p.photo=null; SVC.photos.delete(p.id); try{renderAll();}catch(e){} openModal(p.id); kToast('Foto entfernt'); }
  catch(e){ kToast('⚠️ '+(e.message||e)); }
}

/* ---------- Werte der Karte ---------- */
function scRate(p){
  let s; try{ s=scores(p); }catch(e){ return {ovr:'–',st:[],tier:'bronze'}; }
  const T=v=>v==null?null:Math.max(25,Math.min(99,Math.round(30+v*0.69)));
  const ovr=Math.max(30,Math.min(99,Math.round(s.total)));   // gleiche Gesamtwertung wie Aufstellung & Spielerbogen
  let st=[['ABS',T(s.prod)],['ANT',T(s.share)],['FRM',T(s.trend)],['POT',T(s.pot)]];
  const eye=typeof sbEye==='function'?sbEye(p):null;   // Eye-Test aus dem Spielerbogen hat Vorrang
  if(eye)st=[['TEM',eye[0]*10],['TEC',eye[1]*10],['ZWK',eye[2]*10],['SPI',eye[3]*10]].map(([k,v])=>[k,Math.min(99,v)]);
  if(p.own&&!p.isJugend&&typeof vrScores==='function'&&canTraining()){ let v=null; try{ v=vrScores(p); }catch(e){} st.push(['TRN',v&&v.ts.score!=null?T(v.ts.score):null],['LOY',v?T(v.ls.score):null]); }
  else { const W=typeof wscoreSafe==='function'?wscoreSafe(p):null; st.push(['WEC',W?T(W.w):null],['NÄH',p.km!=null?Math.max(25,Math.min(99,Math.round(99-p.km*2.2))):null]); }
  const tier=p.own&&!p.isJugend?'club':ovr>=75?'icon':ovr>=62?'gold':ovr>=50?'silver':'bronze';
  return {ovr,st,tier,s};
}
function scSil(p){ return `<svg class="fut-sil" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="36" r="19"/><path d="M12 102c3-26 19-38 38-38s35 12 38 38z"/></svg><em>${svEsc(initials(p.name||'?'))}</em>`; }
function scSeason(p){ const c=p.cur||{}; const t=p.isJugend?p.tore:c.tore, sp=p.isJugend?p.teamSp:c.spiele; return t!=null?`${t} Tore${sp?' in '+sp+' Sp.':''}`:'–'; }
/* opts: size ('lg'|'sm'|'xs'), tier (Sonderkarte, z. B. 'totw'), badge (Text oben), sub (Zeile unter Namen), flip:false */
function fcCard(p,o){
  o=o||{}; const R=scRate(p), src=p.photo||p.photoUrl, pos=p.isJugend?'U19':(p.pos||'–'), club=(p.cur&&p.cur.club)||p.club||'';
  const nm=String(p.name||'').split(' '), last=nm.slice(-1)[0]||'', first=nm.slice(0,-1).join(' ');
  const ai=o.ai||null, W=!p.own&&typeof wscoreSafe==='function'?wscoreSafe(p):null;
  let sb=null; try{ sb=typeof sbOf==='function'&&!p.isJugend?sbOf(p):null; }catch(e){}
  const role=sb&&sb.rol&&typeof SB_ROLE!=='undefined'&&SB_ROLE[sb.rol]?SB_ROLE[sb.rol].t:'';
  if(!o.sub&&role)o=Object.assign({},o,{sub:svEsc(role)});
  return `<div class="fut ${o.tier||R.tier} ${o.size||''}${o.anim?' fut-anim':''}" data-fut="${svEsc(p.id)}" style="${o.delay!=null?'--d:'+o.delay+'ms':''}" tabindex="0" role="button" aria-label="${svEsc(p.name)}, ${R.ovr}">
    <div class="fut-in"><div class="fut-f"><div class="fut-sh"></div>
      <div class="fut-ov"><b>${R.ovr}</b><span>${svEsc(pos)}</span>${sb&&sb.foot&&typeof SB_FOOT!=='undefined'&&SB_FOOT[sb.foot]?`<span class="fut-foot" title="Starker Fuß: ${svEsc(sb.foot)}">${svEsc(SB_FOOT[sb.foot])}</span>`:''}${scCrest(club)}</div>
      ${o.badge?`<div class="fut-badge">${o.badge}</div>`:''}
      <div class="fut-pic">${scSil(p)}${src?`<img src="${src}" alt="" referrerpolicy="no-referrer" loading="lazy" onerror="this.remove()">`:''}</div>
      <div class="fut-nm">${first?`<small>${svEsc(first)}</small>`:''}<b>${svEsc(last)}</b>${o.sub?`<i>${o.sub}</i>`:''}</div>
      <div class="fut-st">${R.st.map(([k,v])=>`<span><b>${v==null?'–':v}</b>${k}</span>`).join('')}</div></div>
    <div class="fut-b"><b>${svEsc(p.name)}</b><small>${svEsc(club)}${p.isJugend?' · '+svEsc(p.sub||p.staffel||''):''}</small>
      <dl><dt>Saison</dt><dd>${svEsc(scSeason(p))}</dd>
      ${p.km!=null?`<dt>Entfernung</dt><dd>${p.km} km</dd>`:''}
      ${p.alter!=null?`<dt>Alter</dt><dd>${p.alterCa?'≈':''}${p.alter}</dd>`:''}
      ${W?`<dt>Wechselchance</dt><dd>${W.w} %</dd>`:''}
      ${ai?`<dt>KI-Scout</dt><dd>${svEsc(ai.urteil||'')}${ai.score!=null?' · '+ai.score:''}</dd>`:''}</dl>
      ${W&&W.f&&W.f[0]?`<p>${svEsc(W.f[0][1])}</p>`:''}
      ${sb&&sb.sk&&sb.sk.length&&typeof sbHex==='function'?`<div class="fut-sk">${sb.sk.slice(0,4).map(x=>sbHex(x.k,x.plus,'sm')).join('')}</div>`:''}
      <button class="btn sm" data-fut-open="${svEsc(p.id)}">Profil öffnen</button></div></div></div>`;
}
/* Karten-Interaktion: antippen = umdrehen, Profil-Knopf = Profil, Neigen beim Bewegen */
document.addEventListener('click',e=>{
  const ob=e.target.closest('[data-fut-open]'); if(ob){ e.stopPropagation(); openModal(ob.dataset.futOpen); return; }
  const c=e.target.closest('.fut'); if(!c||c.closest('.fut-noflip'))return;
  if(c.dataset.go){ openModal(c.dataset.fut); return; }
  c.classList.toggle('flip');
});
document.addEventListener('pointermove',e=>{ const c=e.target.closest&&e.target.closest('.fut'); if(!c||e.pointerType==='touch')return; const r=c.getBoundingClientRect();
  c.style.setProperty('--rx',((e.clientY-r.top)/r.height-0.5)*-10+'deg'); c.style.setProperty('--ry',((e.clientX-r.left)/r.width-0.5)*12+'deg'); c.style.setProperty('--gx',((e.clientX-r.left)/r.width*100)+'%'); },{passive:true});
document.addEventListener('pointerout',e=>{ const c=e.target.closest&&e.target.closest('.fut'); if(c&&!c.contains(e.relatedTarget)){ c.style.removeProperty('--rx'); c.style.removeProperty('--ry'); } },{passive:true});

/* ---------- Spielerprofil: Karte oben + Fotos dauerhaft speichern ---------- */
{ const _om5=openModal; openModal=function(id){ const r=_om5.apply(this,arguments); try{ scProfile(id); }catch(e){ console.warn('Karte',e); } return r; }; }
function scProfile(id){
  const p=players.find(x=>x.id===id), M=document.getElementById('modal'); if(!p||!M)return;
  const head=M.querySelector('.mhead'); if(head&&!M.querySelector('.fut-hero')){
    const ai=(typeof VR!=='undefined'&&VR.radar||[]).find(r=>r.player_id===p.id&&r.ai);
    const d=document.createElement('div'); d.className='fut-hero'; d.innerHTML=fcCard(p,{size:'lg',ai:ai&&ai.ai})+(ai&&ai.ai?scAiBox(ai.ai):'');
    const old=M.querySelector('.sbwrap .sbcard'); if(old){ old.replaceWith(d); d.classList.add('in-sb'); } else head.after(d); }
  const inp=document.getElementById('e_photo');
  if(inp&&canScout()){
    inp.onchange=e=>{ const f=e.target.files&&e.target.files[0]; if(f)scSavePhoto(p,f); };
    const lab=inp.closest('label'); if(lab&&!lab.nextElementSibling?.classList?.contains('phnote')){ const n=document.createElement('div'); n.className='note phnote'; n.textContent='Nur eigene Fotos oder mit Einverständnis des Spielers – sichtbar nur fürs Team.'; lab.after(n); }
    const del=document.getElementById('delPhoto'); if(del)del.onclick=()=>scDelPhoto(p);
    const av=document.getElementById('mAva'); if(av)av.onclick=()=>inp.click();
  }
  // Jugendspieler: als eigenes Talent markieren (Radar meldet dann jedes Tor)
  if(p.isJugend&&canScout()&&!M.querySelector('#scEg')){
    const on=!!(crmOf(p).eg), b=document.createElement('button'); b.id='scEg'; b.className='crmb'+(on?' on-att':''); b.textContent=on?'🌱 Eigener Jugendspieler ✓':'🌱 Ist einer von uns (Eigengewächs)';
    b.onclick=()=>{ crmSet(p.id,{eg:on?undefined:1}); kToast(on?'Markierung entfernt':'🌱 '+p.name+' als eigenes Talent markiert'); openModal(p.id); };
    (M.querySelector('.fut-hero')||head).after(b);
  }
}
function scAiBox(ai){
  const u={realistisch:'ok',beobachten:'mid',unrealistisch:'bad'}[ai.urteil]||'';
  return `<div class="aibox ${u}"><div class="aibox-h">${SVI('chat')} <b>KI-Scout: ${svEsc(ai.urteil||'')}</b>${ai.score!=null?`<span class="pill">${ai.score}/100</span>`:''}<small>${ai.stufe==='fein'?'Dossier':'Grobcheck'}</small></div>
    <p>${svEsc(ai.text||'')}</p>
    ${(ai.staerken||[]).length?`<div class="aib-l"><b>Stärken</b>${ai.staerken.map(x=>`<span>＋ ${svEsc(x)}</span>`).join('')}</div>`:''}
    ${(ai.risiken||[]).length?`<div class="aib-l"><b>Risiken</b>${ai.risiken.map(x=>`<span>－ ${svEsc(x)}</span>`).join('')}</div>`:''}
    ${ai.ansprache?`<div class="aib-l"><b>Ansprache</b><span>${svEsc(ai.ansprache)}</span></div>`:''}
    ${(ai.quellen||[]).length?`<div class="aib-q">${ai.quellen.map(q=>{ let h=''; try{ h=new URL(q).hostname.replace(/^www\./,''); }catch(e){} return h?`<a href="${svEsc(q)}" target="_blank" rel="noopener noreferrer">${svEsc(h)}</a>`:''; }).join('')}</div>`:''}</div>`;
}

/* =====================================================================
   SV/BSC Scout · Runde 10: Spieltag
   - Gegnercheck: nächster Gegner mit Tabelle, Heim/Auswärts, Fieberkurve, gefährlichste Spieler, Stärken & Schwächen,
     direkter Vergleich – und auf Knopfdruck ein KI-Matchplan
   - Elf der Woche: aus den Torjägerlisten (Spieltag oder Saison), jede Liga und A-Jugend
   - A-Jugend-Radar: Talente im Umkreis + eigene Jugend, als Karten
   - Ergebnisse kommen automatisch (aus der Veränderung der FUSSBALL.DE-Tabelle) – niemand muss sie eintragen
   ===================================================================== */
SV_PAGES.gegner=['Gegnercheck','Der nächste Gegner – Stärken, Schwächen, gefährliche Spieler'];
SV_PAGES.totw=['Elf der Woche','Die besten Torschützen des Spieltags als Team'];
SV_PAGES.jugend=['A-Jugend','Talente im Umkreis und aus den eigenen Reihen'];
SV_TBL.gegner=['target','Gegner']; SV_TBL.totw=['star','Elf d. Woche'];
{ const _ta3=svTabAllowed; svTabAllowed=function(t){ if(t==='gegner'||t==='totw')return canScout(); return _ta3.apply(this,arguments); }; }

const SP={loaded:false,loading:false,fx:[],res:[],tabs:[],stands:[],snaps:{},team:'A',sel:null,tw:{sub:'A',mode:'tag'},jf:{liga:'alle',region:true},ai:{},aiBusy:false};
const SP_OWN={A:'svbscmoerlenbach',D2:'svbscmoerlenbachii'};
const SP_TEAMS=[['A','1. Mannschaft'],['D2','Zweite']];
const SP_LIGA={GL:'Gruppenliga',KOL:'Kreisoberliga',A:'Kreisliga A',B:'Kreisliga B',C:'Kreisliga C',D1:'Kreisliga D1',D2:'Kreisliga D2','AJ-BS':'U19 Kreis','AJ-GL':'U19 Gruppenliga','AJ-VL':'U19 Verbandsliga'};
const spWd=d=>{ try{ return new Date(d+'T12:00:00').toLocaleDateString('de-DE',{weekday:'short',day:'2-digit',month:'2-digit'}); }catch(e){ return d; } };
const spDays=d=>TRC.diffDays(d,trToday());
const spPct=(a,b)=>b?Math.round(a/b*100):0;
const spNum=(v,d=1)=>v==null||!isFinite(v)?'–':(+v).toLocaleString('de-DE',{minimumFractionDigits:d,maximumFractionDigits:d});

/* ---------- Laden ---------- */
async function spLoad(force){
  if(SP.loading||(SP.loaded&&!force)||!canScout())return; SP.loading=true;
  try{
    const [fx,res,st]=await Promise.all([
      SVB.sb.from('fixtures').select('id,sub,datum,zeit,wettbewerb,heim,gast,heim_key,gast_key').limit(2000),
      SVB.sb.from('match_results').select('id,sub,datum,heim,gast,heim_key,gast_key,tore_heim,tore_gast,von,bis,sicher,scorers').order('bis',{ascending:false}).limit(2000),
      SVB.sb.from('table_snaps').select('stand').eq('club_key','svbscmoerlenbach').eq('sub','A').gte('stand',VR_SEASON_START).order('stand',{ascending:true}).limit(400)]);
    SP.fx=fx.data||[]; SP.res=res.data||[]; SP.stands=(st.data||[]).map(r=>r.stand);
    const last=SP.stands.slice(-10);
    if(last.length){ const t=await SVB.sb.from('table_snaps').select('stand,club_key,sub,club,platz,spiele,tore,gegentore,punkte,logo,heim,ausw,fieber').in('stand',last).limit(3000);
      SP.tabs=t.data||[]; SP.tabs.forEach(r=>{ if(r.logo)SVC.crest.set(r.club_key,r.logo); }); }
    SP.loaded=true;
  }catch(e){ console.warn('Spieltag',e); SP.loaded=true; }
  SP.loading=false; spAfter();
}
async function spSnaps(sub){
  if(SP.snaps[sub])return SP.snaps[sub];
  const st=SP.stands.slice(-6); if(!st.length)return (SP.snaps[sub]=[]);
  try{ const {data,error}=await SVB.sb.from('scorer_snaps').select('stand,pkey,name,club,sub,tore,team_sp,player_id').eq('sub',sub).in('stand',st).limit(5000); if(error)throw error; SP.snaps[sub]=data||[]; }
  catch(e){ console.warn('Torjäger',e); SP.snaps[sub]=[]; }
  return SP.snaps[sub];
}
function spAfter(){ try{ if(document.querySelector('#panel-gegner.active'))spRender(); }catch(e){ console.warn(e); } try{ if(document.querySelector('#panel-totw.active'))twRender(); }catch(e){ console.warn(e); }
  try{ spHome(); }catch(e){} try{ if(document.querySelector('#panel-home.active'))svCockpit(); }catch(e){} }

/* ---------- Hilfen ---------- */
function spTab(sub,stand){ const s=stand||SP.stands[SP.stands.length-1]; const m=new Map(); SP.tabs.filter(r=>r.sub===sub&&r.stand===s).forEach(r=>m.set(r.club_key,r)); return m; }
function spRowsOf(key,sub){ return SP.tabs.filter(r=>r.club_key===key&&r.sub===sub).sort((a,b)=>a.stand<b.stand?-1:1); }
function spOwnFx(team){ const k=SP_OWN[team]; return SP.fx.filter(f=>(f.heim_key===k||f.gast_key===k)&&f.datum).sort((a,b)=>(a.datum+(a.zeit||'')).localeCompare(b.datum+(b.zeit||''))); }
function spNext(team){ const t=trToday(); return spOwnFx(team).filter(f=>f.datum>=t); }
function spResultsOf(key){ return SP.res.filter(r=>r.heim_key===key||r.gast_key===key).sort((a,b)=>((b.datum||b.bis)||'').localeCompare((a.datum||a.bis)||'')); }
function spRes(r,key){ const h=r.heim_key===key, f=h?r.tore_heim:r.tore_gast, a=h?r.tore_gast:r.tore_heim; return {f,a,e:f>a?'S':f===a?'U':'N',opp:h?r.gast:r.heim,h}; }
function spForm(key,sub){ // Ergebnisse, sonst Tabellen-Veränderung (Punkte je Zeitraum)
  const R=spResultsOf(key).map(r=>spRes(r,key)); if(R.length)return R.slice(0,6).map(x=>x.e);
  const rows=spRowsOf(key,sub), out=[]; for(let i=rows.length-1;i>0&&out.length<6;i--){ const a=rows[i-1], b=rows[i]; if(b.spiele-a.spiele===1){ const p=b.punkte-a.punkte; out.push(p===3?'S':p===1?'U':'N'); } }
  return out;
}
function spPlayersOf(key){ return players.filter(p=>!p.isJugend&&p.cur&&scNorm(p.cur.club||p.club)===key).sort((a,b)=>(b.cur.tore||0)-(a.cur.tore||0)); }
function spHot(sub,key){ // Tore in den letzten zwei Zeiträumen je Spieler
  const S=SP.snaps[sub]; if(!S||!S.length)return new Map(); const st=[...new Set(S.map(r=>r.stand))].sort(); if(st.length<2)return new Map();
  const from=st[Math.max(0,st.length-3)], to=st[st.length-1], A=new Map(), m=new Map();
  S.filter(r=>r.stand===from).forEach(r=>A.set(r.pkey,r.tore));
  S.filter(r=>r.stand===to&&(!key||scNorm(r.club)===key)).forEach(r=>{ const g=r.tore-(A.has(r.pkey)?A.get(r.pkey):0); if(g>0&&(A.has(r.pkey)||r.tore<=3))m.set(r.player_id||r.pkey,g); });
  return m;
}
function spPerGame(r,f){ if(!r)return null; const x=r[f], sp=r.sp!=null?r.sp:r.spiele; return sp?x/sp:null; }
function spFeverSvg(A,B){
  const n=Math.max(A.v.length,B.v.length); if(n<2)return '';
  const mx=Math.max(16,...A.v,...B.v), W=320, H=120, px=i=>14+i*(W-28)/(n-1), py=v=>10+(v-1)*(H-24)/(mx-1);
  const line=(v,c)=>`<polyline fill="none" stroke="${c}" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round" points="${v.map((x,i)=>px(i)+','+py(x)).join(' ')}"/>`+v.map((x,i)=>i===v.length-1?`<circle cx="${px(i)}" cy="${py(x)}" r="4" fill="${c}"/><text x="${px(i)+6}" y="${py(x)+4}" fill="${c}" font-size="11" font-weight="800">${x}.</text>`:'').join('');
  return `<svg class="spfever" viewBox="0 0 ${W+20} ${H}" role="img" aria-label="Tabellenplatz je Spieltag"><line x1="14" x2="${W-14}" y1="${py(1)}" y2="${py(1)}" class="g"/><line x1="14" x2="${W-14}" y1="${py(Math.ceil(mx/2))}" y2="${py(Math.ceil(mx/2))}" class="g"/>${line(B.v,'#ff8a5b')}${line(A.v,'#5b9bff')}</svg>
    <div class="splegend"><span style="--c:#5b9bff">${svEsc(A.n)}</span><span style="--c:#ff8a5b">${svEsc(B.n)}</span></div>`;
}
const spFormHtml=f=>f.length?`<span class="spform">${f.slice(0,5).map(x=>`<i class="f${x}">${x}</i>`).join('')}</span>`:'<span class="note">noch offen</span>';

/* ---------- Stärken & Schwächen (regelbasiert, erklärbar) ---------- */
function spTraits(row,key,sub,venue){
  const S=[], W=[]; if(!row)return {S,W};
  const sp=row.spiele||0, tpg=sp?row.tore/sp:null, gpg=sp?row.gegentore/sp:null;
  const lg=[...spTab(sub).values()], avgT=lg.length?lg.reduce((a,r)=>a+(r.spiele?r.tore/r.spiele:0),0)/lg.length:null;
  if(tpg!=null&&avgT&&tpg>=avgT*1.25)S.push(`Offensivstark: ${spNum(tpg)} Tore pro Spiel (Liga-Schnitt ${spNum(avgT)})`);
  if(tpg!=null&&avgT&&tpg<=avgT*0.75)W.push(`Wenig Torgefahr: ${spNum(tpg)} Tore pro Spiel`);
  if(gpg!=null&&avgT&&gpg<=avgT*0.75)S.push(`Stabile Abwehr: nur ${spNum(gpg)} Gegentore pro Spiel`);
  if(gpg!=null&&avgT&&gpg>=avgT*1.25)W.push(`Anfällige Abwehr: ${spNum(gpg)} Gegentore pro Spiel`);
  const V=venue==='heim'?row.heim:row.ausw, vn=venue==='heim'?'zu Hause':'auswärts';
  if(V&&V.sp>=2){ const ppg=V.pkt/V.sp;
    if(ppg>=2.2)S.push(`${venue==='heim'?'Heimstark':'Auswärtsstark'}: ${V.s} Siege aus ${V.sp} Spielen ${vn}`);
    if(ppg<=0.8)W.push(`${vn[0].toUpperCase()+vn.slice(1)} schwach: ${V.pkt} Punkte aus ${V.sp} Spielen`);
    if(V.gt/V.sp>=2.2)W.push(`Kassiert ${vn} ${spNum(V.gt/V.sp)} Tore pro Spiel`); }
  const top=spPlayersOf(key)[0]; if(top&&row.tore>=6&&top.cur.tore/row.tore>=0.33)S.push(`Tore hängen an ${top.name} (${spPct(top.cur.tore,row.tore)} % der Treffer) – ausschalten!`);
  const f=spForm(key,sub); const lastN=f.slice(0,3);
  if(lastN.length>=3&&lastN.every(x=>x==='S'))S.push('Drei Siege in Folge – mit Selbstvertrauen');
  if(lastN.length>=3&&!lastN.includes('S'))W.push(`Seit ${lastN.length} Spielen ohne Sieg`);
  const fv=row.fieber||[]; if(fv.length>=4){ const d=fv[fv.length-4]-fv[fv.length-1]; if(d>=3)S.push(`Im Aufwind: in drei Spieltagen von Platz ${fv[fv.length-4]} auf ${fv[fv.length-1]}`); if(d<=-3)W.push(`Im Abwärtstrend: von Platz ${fv[fv.length-4]} auf ${fv[fv.length-1]} gefallen`); }
  return {S,W};
}

/* ---------- Gegnercheck ---------- */
async function spRender(){
  const P=document.getElementById('panel-gegner'); if(!P)return;
  if(!canScout()){ P.innerHTML='<div class="card"><div class="empty">Den Gegnercheck sieht das Trainerteam.</div></div>'; return; }
  if(!SP.loaded){ P.innerHTML='<div class="card"><div class="empty">Lade Spielplan …</div></div>'; spLoad(); return; }
  const team=SP.team, own=SP_OWN[team], next=spNext(team), f=(SP.sel&&next.find(x=>x.id===SP.sel))||next[0];
  const head=`<div class="trtop"><div class="trtabs">${SP_TEAMS.map(([k,t])=>`<button class="${team===k?'on':''}" data-spteam="${k}">${t}</button>`).join('')}</div></div>`;
  if(!f){ P.innerHTML=head+`<div class="card"><div class="empty">Noch kein Spielplan geladen.<br><small>Der Spielplan kommt mit dem nächsten Daten-Update (sonntags spät, montags & donnerstags früh).</small></div></div>`; spBind(P); return; }
  const home=f.heim_key===own, oppKey=home?f.gast_key:f.heim_key, oppName=home?f.gast:f.heim, sub=f.sub==='POKAL'?team:f.sub;
  await spSnaps(sub);
  const T=spTab(sub), U=T.get(own), G=T.get(oppKey), dd=spDays(f.datum);
  const uF=spForm(own,sub), gF=spForm(oppKey,sub), hot=spHot(sub,oppKey), hotU=spHot(sub,own);
  const gT=spTraits(G,oppKey,sub,home?'ausw':'heim'), uT=spTraits(U,own,sub,home?'heim':'ausw');
  const oppPl=spPlayersOf(oppKey).filter(p=>p.cur.tore>0).slice(0,6);
  const exs=players.filter(p=>!p.isJugend&&scNorm((p.cur&&p.cur.club)||p.club)===oppKey&&(p.exSvbc||(crmOf(p)||{}).x));
  const h2h=spResultsOf(own).filter(r=>r.heim_key===oppKey||r.gast_key===oppKey);
  const prev=[['2526','25/26'],['2425','24/25'],['2324','23/24']].map(([k,l])=>{ const cu=Object.values(DATA.clubs||{}).find(c=>scNorm(c.name)===own.replace(/ii$/,'')&&c['s'+k]), co=Object.values(DATA.clubs||{}).find(c=>scNorm(c.name)===oppKey&&c['s'+k]);
    return cu&&co&&cu['s'+k].liga===co['s'+k].liga?`<span>${l}: wir Platz ${cu['s'+k].platz}, ${svEsc(oppName)} Platz ${co['s'+k].platz}</span>`:''; }).filter(Boolean);
  const inj=team==='A'&&TR.loaded?trSquad().filter(p=>trInjury(p.id)):[];
  const ourTop=spPlayersOf(own).filter(p=>p.cur.tore>0).slice(0,4);
  const cmp=(l,a,b,better)=>{ const av=a==null?null:+a, bv=b==null?null:+b; const w=av!=null&&bv!=null&&av!==bv?((better==='hi'?av>bv:av<bv)?'a':'b'):'';
    const tot=Math.abs(av||0)+Math.abs(bv||0)||1; return `<div class="spcmp ${w}"><b>${a==null?'–':typeof a==='number'&&!Number.isInteger(a)?spNum(a):a}</b><span><i style="width:${Math.round(Math.abs(av||0)/tot*100)}%"></i><em>${l}</em><i style="width:${Math.round(Math.abs(bv||0)/tot*100)}%"></i></span><b>${b==null?'–':typeof b==='number'&&!Number.isInteger(b)?spNum(b):b}</b></div>`; };
  const V=r=>r?(home?r.heim:r.ausw):null, Vo=r=>r?(home?r.ausw:r.heim):null;
  const others=next.slice(0,4);
  P.innerHTML=head+`
    <div class="card sphero">
      <div class="sph-meta">${svEsc(f.wettbewerb||SP_LIGA[sub]||'')} · ${spWd(f.datum)}${f.zeit?' · '+svEsc(f.zeit)+' Uhr':''} · ${home?'Heimspiel':'Auswärts'}</div>
      <div class="sph-vs"><div class="sph-t">${scCrest(f.heim,'xl')}</div><div class="sph-c"><b>${dd===0?'Heute':dd===1?'Morgen':'in '+dd+' Tagen'}</b><span>vs</span></div><div class="sph-t">${scCrest(f.gast,'xl')}</div></div>
      <div class="sph-names"><b>${svEsc(f.heim)}</b><b>${svEsc(f.gast)}</b></div>
      ${others.length>1?`<div class="sph-next">${others.map(x=>`<button class="${x.id===f.id?'on':''}" data-spsel="${svEsc(x.id)}">${spWd(x.datum)} · ${svEsc(x.heim_key===own?x.gast:x.heim)}</button>`).join('')}</div>`:''}
    </div>
    <div class="card"><h3 class="trh">${SVI('chart')} Direktvergleich</h3>
      <div class="spcmp-h"><b>${svEsc(team==='A'?'Wir':'Wir (II)')}</b><span></span><b>${svEsc(oppName)}</b></div>
      ${cmp('Tabellenplatz',U&&U.platz,G&&G.platz,'lo')}${cmp('Punkte',U&&U.punkte,G&&G.punkte,'hi')}
      ${cmp('Tore / Spiel',U&&U.spiele?U.tore/U.spiele:null,G&&G.spiele?G.tore/G.spiele:null,'hi')}${cmp('Gegentore / Spiel',U&&U.spiele?U.gegentore/U.spiele:null,G&&G.spiele?G.gegentore/G.spiele:null,'lo')}
      ${cmp(home?'Punkte/Spiel (wir heim · sie auswärts)':'Punkte/Spiel (wir ausw. · sie heim)',V(U)&&V(U).sp?V(U).pkt/V(U).sp:null,Vo(G)&&Vo(G).sp?Vo(G).pkt/Vo(G).sp:null,'hi')}
      <div class="spforms"><div>${spFormHtml(uF)}</div><small>Form (neueste links)</small><div>${spFormHtml(gF)}</div></div>
      ${U&&G&&(U.fieber||[]).length>1?`<h4 class="sph4">Fieberkurve – Tabellenplatz je Spieltag</h4>${spFeverSvg({n:team==='A'?'SV/BSC':'SV/BSC II',v:U.fieber||[]},{n:oppName,v:G.fieber||[]})}`:''}
    </div>
    <div class="card"><h3 class="trh">${SVI('target')} Auf diese Spieler achten</h3>
      ${oppPl.length?`<div class="futrow">${oppPl.map((p,i)=>fcCard(p,{size:'sm',badge:hot.get(p.id)?`🔥 ${hot.get(p.id)} Tor${hot.get(p.id)>1?'e':''} zuletzt`:(G&&G.tore?spPct(p.cur.tore,G.tore)+' % der Tore':''),anim:true,delay:i*70})).join('')}</div>`:'<div class="note">Noch keine Torschützen des Gegners in den Listen.</div>'}
      ${exs.length?`<div class="note">↩️ Ex-Mörlenbacher im Team: ${exs.map(p=>`<a data-svp="${svEsc(p.id)}">${svEsc(p.name)}</a>`).join(', ')}</div>`:''}
    </div>
    <div class="spgrid">
      <div class="card"><h3 class="trh">${svEsc(oppName)}</h3>
        ${gT.S.length?`<div class="spl ok"><b>Stärken</b>${gT.S.map(x=>`<span>＋ ${svEsc(x)}</span>`).join('')}</div>`:''}
        ${gT.W.length?`<div class="spl bad"><b>Hier packen wir sie</b>${gT.W.map(x=>`<span>－ ${svEsc(x)}</span>`).join('')}</div>`:''}
        ${!gT.S.length&&!gT.W.length?'<div class="note">Noch zu wenig Daten für ein klares Bild.</div>':''}</div>
      <div class="card"><h3 class="trh">Wir</h3>
        ${uT.S.length?`<div class="spl ok"><b>Unsere Waffen</b>${uT.S.map(x=>`<span>＋ ${svEsc(x)}</span>`).join('')}</div>`:''}
        ${uT.W.length?`<div class="spl bad"><b>Unsere Baustellen</b>${uT.W.map(x=>`<span>－ ${svEsc(x)}</span>`).join('')}</div>`:''}
        ${inj.length?`<div class="spl"><b>Fehlen verletzt</b><span>${inj.map(p=>svEsc(p.name)).join(', ')}</span></div>`:''}
        ${ourTop.length?`<div class="spl"><b>Unsere Torschützen</b><span>${ourTop.map(p=>`<a data-svp="${svEsc(p.id)}">${svEsc(p.name)}</a> ${p.cur.tore}${hotU.get(p.id)?' 🔥':''}`).join(' · ')}</span></div>`:''}</div>
    </div>
    ${h2h.length||prev.length?`<div class="card"><h3 class="trh">Bisherige Duelle</h3>${h2h.map(r=>{ const x=spRes(r,own); return `<div class="spres f${x.e}"><i>${x.e}</i><span>${r.datum?spWd(r.datum):'Spieltag bis '+TRC.fmt(r.bis)}</span><b>${svEsc(r.heim)} ${r.tore_heim}:${r.tore_gast} ${svEsc(r.gast)}</b></div>`; }).join('')}${prev.length?`<div class="note">${prev.join(' · ')}</div>`:''}</div>`:''}
    <div class="card spai"><div class="svc-h"><h3>${SVI('chat')} KI-Matchplan</h3>${TR.ai&&TR.ai.ready?`<button class="btn sm" id="spAiBtn">${SP.ai[f.id]?'Neu erstellen':'Matchplan erstellen'}</button>`:''}</div>
      ${SP.ai[f.id]?`<div class="spai-t">${spMd(SP.ai[f.id])}</div>`:TR.ai&&TR.ai.ready?'<div class="note">Der Co-Trainer fasst alles zusammen: worauf achten, wo wir sie packen, Vorschlag für Elf & Taktik.</div>':'<div class="note">Mit KI-Schlüssel (Admin → Nutzer & Rollen) erstellt der Co-Trainer hier einen Matchplan.</div>'}</div>
    <div class="note">Tabellen, Spielplan und Torjäger: FUSSBALL.DE (öffentlich). Ergebnisse berechnet die App aus der Veränderung der Tabelle – ohne Eintippen.</div>`;
  spBind(P);
  const ab=document.getElementById('spAiBtn'); if(ab)ab.onclick=()=>spAi(f,{home,oppName,oppKey,sub,U,G,uF,gF,gT,uT,oppPl,hot,inj,ourTop,h2h,own});
}
function spBind(P){
  P.querySelectorAll('[data-spteam]').forEach(b=>b.onclick=()=>{ SP.team=b.dataset.spteam; SP.sel=null; spRender(); });
  P.querySelectorAll('[data-spsel]').forEach(b=>b.onclick=()=>{ SP.sel=b.dataset.spsel; spRender(); });
  P.querySelectorAll('[data-svp]').forEach(a=>a.onclick=()=>openModal(a.dataset.svp));
}
function spMd(t){ return svEsc(t).replace(/\*\*(.+?)\*\*/g,'<b>$1</b>').replace(/^[-•]\s?/gm,'• ').replace(/\n/g,'<br>'); }
async function spAi(f,X){
  if(SP.aiBusy)return; SP.aiBusy=true; const b=document.getElementById('spAiBtn'); if(b){ b.disabled=true; b.textContent='Co-Trainer denkt nach …'; }
  const r=x=>x?`Platz ${x.platz}, ${x.punkte} Punkte, ${x.tore}:${x.gegentore} Tore nach ${x.spiele} Spielen; heim ${x.heim?x.heim.pkt+' Pkt/'+x.heim.sp+' Sp':'?'}, auswärts ${x.ausw?x.ausw.pkt+' Pkt/'+x.ausw.sp+' Sp':'?'}; Fieberkurve ${(x.fieber||[]).join('-')}`:'unbekannt';
  const fakten=[`Spiel: ${f.heim} – ${f.gast}, ${f.datum} ${f.zeit||''}, ${X.home?'wir haben Heimspiel':'wir spielen auswärts'} (${f.wettbewerb||X.sub}).`,
    `Wir: ${r(X.U)}. Form: ${X.uF.join('')||'?'}.`, `${X.oppName}: ${r(X.G)}. Form: ${X.gF.join('')||'?'}.`,
    `Gefährliche Spieler ${X.oppName}: ${X.oppPl.map(p=>`${p.name} (${p.pos||'?'}, ${p.cur.tore} Tore${X.hot.get(p.id)?', zuletzt '+X.hot.get(p.id)+' Tore':''})`).join('; ')||'keine bekannt'}.`,
    `Stärken Gegner: ${X.gT.S.join('; ')||'–'}. Schwächen Gegner: ${X.gT.W.join('; ')||'–'}.`,
    `Unsere Stärken: ${X.uT.S.join('; ')||'–'}. Unsere Baustellen: ${X.uT.W.join('; ')||'–'}.`,
    `Verletzt bei uns: ${X.inj.map(p=>p.name).join(', ')||'niemand'}. Unsere Torschützen: ${X.ourTop.map(p=>p.name+' '+p.cur.tore).join(', ')||'–'}.`,
    `Bisherige Duelle: ${X.h2h.map(h=>`${h.heim} ${h.tore_heim}:${h.tore_gast} ${h.gast}`).join('; ')||'keine erfasst'}.`].join('\n');
  try{ const {data,error}=await SVB.sb.functions.invoke('coach',{body:{mode:'gegner',gegner:{fixture:f.id,fakten,neu:!!SP.ai[f.id]}}}); if(error)throw error;
    if(!data||!data.ok)throw new Error(data&&data.error==='kein-schluessel'?'KI ist nicht eingerichtet':(data&&data.error)||'keine Antwort'); SP.ai[f.id]=data.text; }
  catch(e){ kToast('⚠️ '+(e.message||e)); }
  SP.aiBusy=false; spRender();
}

/* ---------- Übersicht: nächstes Spiel ---------- */
function spHome(){
  const host=document.getElementById('svCockpit')||document.getElementById('svHello'); if(!host||!canScout()||!SP.loaded)return;
  let el=document.getElementById('spHome'); if(!el){ el=document.createElement('div'); el.id='spHome'; host.after(el); }
  const own=SP_OWN.A, f=spNext('A')[0], last=spResultsOf(own)[0];
  if(!f&&!last){ el.innerHTML=''; return; }
  const lr=last?spRes(last,own):null, dd=f?spDays(f.datum):null;
  el.innerHTML=`<div class="card sphome">${f?`<div class="sphm"><div class="sphm-t">${scCrest(f.heim)}<b>${svEsc(f.heim)}</b></div><div class="sphm-c"><small>${spWd(f.datum)}${f.zeit?' · '+svEsc(f.zeit):''}</small><b>${dd===0?'HEUTE':dd===1?'Morgen':'in '+dd+' T.'}</b></div><div class="sphm-t">${scCrest(f.gast)}<b>${svEsc(f.gast)}</b></div></div>`:''}
    ${lr?`<div class="sphm-last f${lr.e}"><i>${lr.e}</i>Zuletzt: ${svEsc(last.heim)} <b>${last.tore_heim}:${last.tore_gast}</b> ${svEsc(last.gast)}${(last.scorers||[]).filter(s=>s.club_key===own).length?` · Tore: ${(last.scorers||[]).filter(s=>s.club_key===own).map(s=>svEsc(s.name.split(' ').pop())+(s.tore>1?' '+s.tore:'')).join(', ')}`:''}</div>`:''}
    <div class="btnrow">${f?`<button class="btn sm" data-sph="gegner">${SVI('target')} Gegnercheck</button>`:''}<button class="btn ghost sm" data-sph="totw">${SVI('star')} Elf der Woche</button></div></div>`;
  el.querySelectorAll('[data-sph]').forEach(b=>b.onclick=()=>goTab(b.dataset.sph));
  try{ svHomeOrder(); }catch(e){}
}

/* ---------- Elf der Woche ---------- */
const TW_SLOTS=[['TW',50,88],['LV',13,66],['IV',37,69],['IV',63,69],['RV',87,66],['ZM',22,42],['ZM',50,45],['ZM',78,42],['LA',17,15],['ST',50,11],['RA',83,15]];
const TW_GRP={TW:'TW',LV:'DEF',IV:'DEF',RV:'DEF',ZM:'MID',LA:'ATT',ST:'ATT',RA:'ATT'};
const twGroup=p=>{ const x=p&&p.pos; return x==='TW'?'TW':x==='IV'||x==='AV'?'DEF':x==='ZM'||x==='OM'?'MID':'ATT'; };
async function twRender(){
  const P=document.getElementById('panel-totw'); if(!P)return;
  if(!canScout()){ P.innerHTML='<div class="card"><div class="empty">Die Elf der Woche sieht das Trainerteam.</div></div>'; return; }
  if(!SP.loaded){ P.innerHTML='<div class="card"><div class="empty">Lade Torjägerlisten …</div></div>'; spLoad(); return; }
  const sub=SP.tw.sub; const S=await spSnaps(sub); const st=[...new Set(S.map(r=>r.stand))].sort();
  let mode=SP.tw.mode, win=null, cand=[];
  const byPid=r=>trP(r.player_id||r.pkey);
  if(mode==='tag'&&st.length>=2){
    for(let i=st.length-1;i>0&&!cand.length;i--){ const A=new Map(S.filter(r=>r.stand===st[i-1]).map(r=>[r.pkey,r.tore]));
      cand=S.filter(r=>r.stand===st[i]).map(r=>({r,g:r.tore-(A.get(r.pkey)??0),known:A.has(r.pkey)})).filter(x=>x.g>0&&(x.known||x.r.tore<=3)); if(cand.length)win=[st[i-1],st[i]]; }
  }
  if(!cand.length){ mode='saison'; const L=st[st.length-1]; cand=S.filter(r=>r.stand===L&&r.tore>0).map(r=>({r,g:r.tore})); }
  cand=cand.map(x=>({...x,p:byPid(x.r)})).filter(x=>x.p).map(x=>({...x,sc:mode==='tag'?x.g*10+(x.r.team_sp?x.r.tore/x.r.team_sp:0):x.r.tore/Math.max(1,x.r.team_sp||1)*4+x.r.tore*0.3})).sort((a,b)=>b.sc-a.sc);
  // Aufstellung nach Positionen, fehlende Positionen mit den nächstbesten füllen
  const used=new Set(), slots=TW_SLOTS.map(()=>null);
  TW_SLOTS.forEach((s,i)=>{ const g=TW_GRP[s[0]]; if(g==='TW')return; const x=cand.find(c=>!used.has(c.p.id)&&twGroup(c.p)===g); if(x){ slots[i]=x; used.add(x.p.id); } });
  TW_SLOTS.forEach((s,i)=>{ if(slots[i]||s[0]==='TW')return; const x=cand.find(c=>!used.has(c.p.id)); if(x){ slots[i]=x; used.add(x.p.id); } });
  // Torwart-Platz: Mannschaft mit weißer Weste (oder beste Abwehr)
  let keeper=null;
  if(SP_LIGA[sub]&&!sub.startsWith('AJ')){ const tabs=SP.tabs.filter(r=>r.sub===sub); const L=[...new Set(tabs.map(r=>r.stand))].sort();
    if(mode==='tag'&&win){ const a=new Map(tabs.filter(r=>r.stand===win[0]).map(r=>[r.club_key,r])); const z=tabs.filter(r=>r.stand===win[1]).filter(r=>{ const o=a.get(r.club_key); return o&&r.spiele>o.spiele&&r.gegentore===o.gegentore; }); if(z.length)keeper={club:z[0].club,t:'Zu Null gespielt'+(z.length>1?` (+${z.length-1} weitere)`:'')}; }
    if(!keeper&&L.length){ const z=tabs.filter(r=>r.stand===L[L.length-1]&&r.spiele>=3).sort((x,y)=>x.gegentore/x.spiele-y.gegentore/y.spiele)[0]; if(z)keeper={club:z.club,t:`Beste Abwehr: ${spNum(z.gegentore/z.spiele)} Gegentore/Spiel`}; } }
  const motm=cand[0];
  const seenKey='svbc-totw-'+sub+'-'+(win?win[1]:'s'); let fresh=false; try{ fresh=!localStorage.getItem(seenKey); localStorage.setItem(seenKey,'1'); }catch(e){}
  const subs=['A','KOL','B','C','D1','D2','GL','AJ-BS','AJ-GL','AJ-VL'];
  const card=(x,i,role)=>x?fcCard(x.p,{size:'xs',tier:x===motm?'motm':'totw',badge:mode==='tag'?`⚽ ${x.g}`:`${x.r.tore} T`,sub:role,anim:fresh,delay:i*110}):`<div class="fut xs empty"><div class="fut-in"><div class="fut-f"><em>${role}</em></div></div></div>`;
  const rest=cand.filter(c=>!used.has(c.p.id)).slice(0,24);
  const ownIn=cand.filter(c=>c.p.own);
  P.innerHTML=`<div class="trtop"><div class="trtabs twsubs">${subs.map(s=>`<button class="${sub===s?'on':''}" data-twsub="${s}">${svEsc(SP_LIGA[s]||s)}</button>`).join('')}</div>
      <div class="trtabs"><button class="${SP.tw.mode==='tag'?'on':''}" data-twm="tag">Spieltag</button><button class="${SP.tw.mode==='saison'?'on':''}" data-twm="saison">Saison</button></div></div>
    <div class="card twcard"><div class="svc-h"><h3>${SVI('star')} ${mode==='tag'?'Elf der Woche':'Elf der Saison'} · ${svEsc(SP_LIGA[sub]||sub)}</h3><small class="note">${mode==='tag'&&win?`Tore zwischen ${TRC.fmt(win[0])} und ${TRC.fmt(win[1])}`:SP.tw.mode==='tag'?'Für den Spieltag braucht es zwei Daten-Stände – bis dahin die Saison-Elf':'Nach Toren pro Spiel'}</small></div>
      ${cand.length?`<div class="twpitch"><div class="twlines"></div>${TW_SLOTS.map((s,i)=>`<div class="twslot" style="left:${s[1]}%;top:${s[2]}%">${s[0]==='TW'?(keeper?`<div class="fut xs totw keeper fut-noflip"><div class="fut-in"><div class="fut-f"><div class="fut-sh"></div><div class="fut-ov"><b>🧤</b><span>TW</span></div><div class="fut-pic kp">${scCrest(keeper.club,'xl')}</div><div class="fut-nm"><b>${svEsc(keeper.club)}</b><i>${svEsc(keeper.t)}</i></div></div></div></div>`:card(null,i,'TW')):card(slots[i],i,s[0])}</div>`).join('')}</div>`
        :'<div class="empty">Noch keine Torschützen in dieser Liga.</div>'}
      ${motm?`<div class="twmotm">${SVI('star')} <b>Spieler des ${mode==='tag'?'Spieltags':'Saison'}:</b> <a data-svp="${svEsc(motm.p.id)}">${svEsc(motm.p.name)}</a> (${svEsc(motm.r.club||'')}) – ${mode==='tag'?motm.g+' Tor'+(motm.g>1?'e':''):motm.r.tore+' Tore in '+(motm.r.team_sp||'?')+' Spielen'}</div>`:''}
      ${ownIn.length?`<div class="note">🟢 Von uns dabei: ${ownIn.map(c=>`<a data-svp="${svEsc(c.p.id)}">${svEsc(c.p.name)}</a> (${mode==='tag'?c.g:c.r.tore})`).join(', ')}</div>`:''}
    </div>
    ${rest.length?`<div class="card"><h3 class="trh">Weitere Torschützen</h3><div class="twrest">${rest.map(c=>`<button class="twr" data-svp="${svEsc(c.p.id)}">${avaHtml(c.p)}<b>${svEsc(c.p.name)}</b><span>${svEsc(c.r.club||'')}</span><em>${mode==='tag'?'⚽ '+c.g:c.r.tore+' T'}</em></button>`).join('')}</div></div>`:''}
    <div class="note">Aus den Torjägerlisten von FUSSBALL.DE. Positionen laut Scouting-Datenbank – wo keine bekannt ist, stellt die App nach Toren auf. Karten antippen zum Umdrehen.</div>`;
  P.querySelectorAll('[data-twsub]').forEach(b=>b.onclick=()=>{ SP.tw.sub=b.dataset.twsub; twRender(); });
  P.querySelectorAll('[data-twm]').forEach(b=>b.onclick=()=>{ SP.tw.mode=b.dataset.twm; twRender(); });
  P.querySelectorAll('[data-svp]').forEach(a=>a.onclick=()=>openModal(a.dataset.svp));
}

/* ---------- A-Jugend-Radar (ersetzt die alte Jugendliste) ---------- */
const JU_LIGEN=[['alle','Alle'],['AJ-BS','U19 Kreis BS'],['AJ-GL','U19 Gruppenliga'],['AJ-VL','U19 Verbandsliga'],['AJ-HL','U19 Hessenliga'],['AJ-ODW','U19 Odenwald'],['AJ-MA','U19 Mannheim'],['AJ-HD','U19 Heidelberg'],['BJ-BS2','Eigene U17']];
function juMeta(p){ return (DATA.jugend||[]).find(j=>j.id===p.id)||{}; }
function juEigen(p){ const m=juMeta(p); return !!(m.own||(crmOf(p)||{}).eg); }
function juScore(p){ const m=juMeta(p), sp=m.teamSp||p.teamSp||0, q=sp?(m.tore||p.tore||0)/sp:0; const W=typeof wscoreSafe==='function'?wscoreSafe(p):null; return q*(m.w||p.jw||0.42)*100*(W?0.5+W.w/100:1)+(m.tore||0)*0.4; }
renderJugend=function(){
  const box=document.getElementById('jugendlist'); if(!box)return;
  const J=players.filter(p=>p.isJugend&&!juMeta(p).alt), F=SP.jf;
  const inL=p=>F.liga==='alle'||juMeta(p).liga===F.liga, inR=p=>!F.region||juEigen(p)||(p.km!=null&&p.km<=25);
  const eig=J.filter(juEigen).sort((a,b)=>(b.tore||0)-(a.tore||0));
  const L=J.filter(p=>!juEigen(p)&&inL(p)&&inR(p)&&juMeta(p).liga!=='BJ-BS2').sort((a,b)=>juScore(b)-juScore(a));
  const alt=players.filter(p=>p.isJugend&&juMeta(p).alt).length;
  box.innerHTML=`<div class="card jucard"><div class="trtabs jul">${JU_LIGEN.map(([k,t])=>`<button class="${F.liga===k?'on':''}" data-jul="${k}">${t}</button>`).join('')}</div>
      <label class="jutog"><input type="checkbox" id="juReg" ${F.region?'checked':''}> Nur Region (bis 25 km)</label>
      <div class="note">${J.length} Jugendspieler aus ${new Set(J.map(p=>juMeta(p).liga)).size} Ligen · A-Jugend (U19) im Umkreis bis Mannheim/Heidelberg/Darmstadt · eigene B-Jugend. Jahrgang 2008 wird zur neuen Saison Senior – jetzt ist die Zeit, Kontakt zu halten.</div></div>
    ${eig.length?`<div class="card"><h3 class="trh">🌱 Eigene Talente</h3><div class="note" style="margin-top:0">Früh ins Seniorentraining einbinden – Spieler per Profil als „Eigengewächs“ markieren, dann meldet das Radar jedes Tor.</div><div class="futgrid">${eig.map((p,i)=>fcCard(p,{size:'sm',badge:`${p.tore} Tore`,anim:true,delay:i*60})).join('')}</div></div>`:''}
    <div class="card"><h3 class="trh">${SVI('sprout')} Top-Talente der Region</h3>${L.length?`<div class="futgrid">${L.slice(0,24).map((p,i)=>fcCard(p,{size:'sm',badge:`${p.tore} T · ${juMeta(p).teamSp?spNum(p.tore/juMeta(p).teamSp):'–'}/Sp.`,sub:svEsc(juMeta(p).kurz||''),anim:true,delay:i*40})).join('')}</div>`:'<div class="empty">Keine Treffer mit diesem Filter.</div>'}
      ${L.length>24?`<div class="jurest">${L.slice(24,80).map(p=>`<button class="twr" data-svp="${svEsc(p.id)}">${avaHtml(p)}<b>${svEsc(p.name)}</b><span>${svEsc(p.club)} · ${svEsc(juMeta(p).kurz||'')}${p.km!=null?' · '+p.km+' km':''}</span><em>${p.tore} T</em></button>`).join('')}</div>`:''}</div>
    ${alt?`<div class="note">${alt} Einträge aus der Vorsaison sind ausgeblendet (Notizen bleiben erhalten).</div>`:''}`;
  box.querySelectorAll('[data-jul]').forEach(b=>b.onclick=()=>{ SP.jf.liga=b.dataset.jul; renderJugend(); });
  const rg=document.getElementById('juReg'); if(rg)rg.onchange=()=>{ SP.jf.region=rg.checked; renderJugend(); };
  box.querySelectorAll('[data-svp]').forEach(a=>a.onclick=()=>openModal(a.dataset.svp));
};

/* ---------- Radar: KI-Urteil sichtbar, Unrealistisches ausgeblendet ---------- */
RD_TYP.ajung='A-Jugend'; RD_TYP.eigen='Eigene Jugend';
{ const _ri=rdItem; rdItem=function(r){ let h=_ri.apply(this,arguments); const a=r.ai, w=r.data&&r.data.w;
    const tag=a?`<span class="aitag ${({realistisch:'ok',beobachten:'mid',unrealistisch:'bad'})[a.urteil]||''}" title="${svEsc(a.text||'')}">KI: ${svEsc(a.urteil||'')}${a.score!=null?' '+a.score:''}</span>`:(w!=null?`<span class="aitag ${w>=60?'ok':w>=40?'mid':'bad'}" title="${svEsc((r.data.wf||[]).join(' · '))}">Realismus ${w}</span>`:'');
    const txt=a&&a.text?`<small class="aitxt">${svEsc(a.text)}</small>`:'';
    return tag||txt?h.replace('<small class="rdmeta">',txt+'<small class="rdmeta">'+tag+' '):h; }; }
{ const _rr=rdRender; rdRender=function(){ const keep=VR.radar; if(!VR.showUnreal)VR.radar=keep.filter(r=>!(r.ai&&r.ai.urteil==='unrealistisch'));
    try{ _rr.apply(this,arguments); }finally{ VR.radar=keep; }
    const P=document.getElementById('panel-radar'); if(!P||!VR.radarLoaded||!canScout())return;
    const hid=keep.filter(r=>r.ai&&r.ai.urteil==='unrealistisch').length, types=P.querySelector('.rdf');
    if(types&&!P.querySelector('#rdAiBar')){ const d=document.createElement('div'); d.id='rdAiBar'; d.className='rdaibar';
      d.innerHTML=`${hid?`<button class="btn ghost sm" id="rdUnreal">${VR.showUnreal?'Unrealistische ausblenden':hid+' unrealistische eingeblendet? Anzeigen'}</button>`:''}${(svRole()==='admin'||svRole()==='vorstand'||svRole()==='planer')&&TR.ai&&TR.ai.ready?`<button class="btn sm" id="rdAiRun">${SVI('chat')} KI-Scouts jetzt prüfen lassen</button>`:''}<small class="note">Jede Meldung ist gegen Liga-Abstand, Entfernung, Rolle im Team und Alter geprüft; mit KI-Schlüssel sichtet zusätzlich ein günstiges Modell alle Kandidaten und ein starkes Modell schreibt für die besten ein Dossier.</small>`;
      types.after(d);
      const u=d.querySelector('#rdUnreal'); if(u)u.onclick=()=>{ VR.showUnreal=!VR.showUnreal; rdRender(); };
      const g=d.querySelector('#rdAiRun'); if(g)g.onclick=async()=>{ g.disabled=true; g.textContent='KI-Scouts arbeiten …';
        try{ const {data,error}=await SVB.sb.functions.invoke('scout-ai',{body:{}}); if(error)throw error; if(data&&data.ok===false)throw new Error(data.error==='kein-schluessel'?'KI ist nicht eingerichtet':data.error);
          kToast(data&&data.gestartet?'🤖 KI-Scouts laufen – Ergebnisse erscheinen in 1–2 Minuten':'✓ '+(data.grob||0)+' geprüft, '+(data.fein||0)+' Dossiers'); setTimeout(()=>vrLoadRadar(),data&&data.gestartet?60000:500); }
        catch(e){ kToast('⚠️ '+(e.message||e)); } g.disabled=false; g.innerHTML=SVI('chat')+' KI-Scouts jetzt prüfen lassen'; };
    } }; }

/* ---------- Cockpit: Schnellaktionen & Hinweise ---------- */
SV_ACTIONS.trainer[1]=['target','Gegnercheck',()=>goTab('gegner')];
SV_ACTIONS.planer[3]=['sprout','A-Jugend',()=>goTab('jugend')];
SV_ACTIONS.vorstand.splice(1,3,['target','Gegnercheck',()=>goTab('gegner')],['radar','Radar',()=>goTab('radar')],['star','Elf der Woche',()=>goTab('totw')]);
SV_ACTIONS.admin.splice(2,2,['target','Gegnercheck',()=>goTab('gegner')],['star','Elf der Woche',()=>goTab('totw')]);
{ const _si=svInsights; svInsights=function(){ const base=_si.apply(this,arguments); const add=[];
    try{ if(SP.loaded&&canScout()){ const r=svRole(), own=SP_OWN.A, f=spNext('A')[0], last=spResultsOf(own)[0];
      if(f){ const d=spDays(f.datum); if(d<=4)add.push({prio:r==='trainer'?0.2:r==='vorstand'?1.5:2.5,lvl:d<=1?'hoch':'mittel',t:`${d===0?'Heute':d===1?'Morgen':spWd(f.datum)}: ${f.heim_key===own?'gegen '+f.gast:'bei '+f.heim}${f.zeit?' · '+f.zeit:''}`,d:'Gegnercheck: Stärken, Schwächen, gefährliche Spieler',go:()=>goTab('gegner')}); }
      if(last&&last.bis&&TRC.diffDays(trToday(),last.bis)<=3){ const x=spRes(last,own); add.push({prio:0.8,lvl:x.e==='N'?'mittel':'info',t:`${x.e==='S'?'Sieg':x.e==='U'?'Remis':'Niederlage'}: ${last.heim} ${last.tore_heim}:${last.tore_gast} ${last.gast}`,d:'Automatisch aus der FUSSBALL.DE-Tabelle – nichts einzutragen',go:()=>goTab('gegner')}); } } }catch(e){}
    return add.concat(base).sort((a,b)=>a.prio-b.prio).slice(0,6); }; }
{ const _ho=svHomeOrder; svHomeOrder=function(){ _ho.apply(this,arguments); const host=document.getElementById('svCockpit'), el=document.getElementById('spHome'); if(host&&el&&host.nextSibling!==el&&['trainer','vorstand','admin'].includes(svRole()))host.after(el); }; }
{ const _gt5=goTab; goTab=function(tab){ const r=_gt5.apply(this,arguments); try{ if(tab==='gegner')spRender(); if(tab==='totw')twRender(); if(tab==='jugend')renderJugend(); }catch(e){ console.warn(e); } return r; }; }
{ const _si2=svInit; svInit=function(){ const r=_si2.apply(this,arguments); setTimeout(()=>{ scLoadCrests().then(()=>{ try{ renderJugend(); }catch(e){} }); scLoadPhotos(); spLoad(); },700); return r; }; }

/* ---------- Admin: KI-Kosten im Griff (Monatsbudget mit hartem Stopp) ---------- */
async function spCostCard(P){
  if(!P||!isAdmin()||P.querySelector('#spCost'))return;
  let s=null; try{ const {data}=await SVB.sb.rpc('ai_status'); s=data; }catch(e){}
  if(!s)return;
  const sp=+s.spent||0, bu=+s.budget||5, pct=Math.min(100,Math.round(sp/Math.max(0.01,bu)*100));
  const NM={'co-trainer':'Co-Trainer (Chat, Lagebild, Gegnercheck)',sichter:'KI-Sichter (Radar grob)',chefscout:'KI-Chefscout (Dossiers)',lauf:'Läufe'};
  const el=document.createElement('div'); el.className='card'; el.id='spCost';
  el.innerHTML=`<div class="adm-head"><div><h3 style="margin:0;display:flex;gap:8px;align-items:center">${SVI('shield')} KI-Kosten & Agenten</h3>
      <p style="margin:6px 0 0;font-size:13.5px">Alles ohne KI läuft kostenlos (Daten, Radar-Filter, Gegnercheck, Elf der Woche, Rankings). KI kostet nur, wenn sie genutzt wird – mit hartem Monatsdeckel: Ist das Budget erreicht, pausieren die KI-Scouts bis zum Monatsersten.</p></div>
      <span class="pill ${pct>=90?'off':pct>=60?'wait':'on'}">${sp.toFixed(2)} $ von ${bu.toFixed(0)} $</span></div>
    <div class="costbar"><i style="width:${pct}%"></i></div>
    ${(s.runs||[]).filter(r=>r.agent!=='lauf').length?`<div class="costrows">${s.runs.filter(r=>r.agent!=='lauf').map(r=>`<div><span>${svEsc(NM[r.agent]||r.agent)}</span><b>${(+r.usd).toFixed(2)} $</b><small>${r.n}×</small></div>`).join('')}</div>`:'<div class="note">Diesen Monat noch keine KI-Kosten.</div>'}
    <div class="invite" style="grid-template-columns:1fr 1fr auto"><div><label for="spBudget">Monatsbudget (USD)</label><input id="spBudget" class="search" type="number" min="0" max="500" step="1" value="${bu}"></div>
      <div><label for="spAgents">KI-Scouts im Hintergrund</label><select id="spAgents"><option value="1"${s.agents!==false?' selected':''}>an (nach jedem Daten-Update)</option><option value="0"${s.agents===false?' selected':''}>aus</option></select></div>
      <button class="btn" id="spCostSave" style="height:46px">Speichern</button></div>
    <p class="note">Richtwerte: Radar-Grobcheck ≈ 1 Cent pro Lauf (günstiges Modell), Dossier ≈ 3–4 Cent (max. 2 pro Lauf), Co-Trainer-Frage ≈ 1–2 Cent (wiederholter Kontext wird zwischengespeichert und kostet nur ein Zehntel). Realistisch 2–5 $ im Monat.</p>`;
  (P.querySelector('#trAi')||P.lastElementChild).after(el);
  el.querySelector('#spCostSave').onclick=async()=>{ try{ const {error}=await SVB.sb.rpc('ai_agents_set',{p_budget:+el.querySelector('#spBudget').value,p_agents:el.querySelector('#spAgents').value==='1'}); if(error)throw error; kToast('✓ KI-Budget gespeichert'); el.remove(); spCostCard(P); }catch(e){ kToast('⚠️ '+(e.message||e)); } };
}
{ const _ar2=svAdminRender; svAdminRender=async function(){ const r=await _ar2.apply(this,arguments); try{ await spCostCard(document.getElementById('panel-admin')); }catch(e){} return r; }; }
/* ---------- Admin: Sicherung herunterladen ---------- */
async function spBackupCard(P){
  if(!P||!isAdmin()||P.querySelector('#spBackup'))return;
  let last=''; try{ last=localStorage.getItem('svbc-backup-at')||''; }catch(e){}
  const el=document.createElement('div'); el.className='card'; el.id='spBackup';
  const old=!last||Date.now()-new Date(last)>14*864e5;
  el.innerHTML=`<div class="adm-head"><div><h3 style="margin:0;display:flex;gap:8px;align-items:center">${SVI('lock')} Sicherung</h3>
    <p style="margin:6px 0 0;font-size:13.5px">Alles, was ihr von Hand pflegt (Notizen, Kontakte, Training, Verletzungen, Helfer, Aufstellung, Fotos), als eine Datei. Der Gratis-Tarif der Datenbank macht keine Sicherungen für euch – einmal im Monat herunterladen und auf dem Mac ablegen.</p></div>
    <span class="pill ${old?'wait':'on'}">${last?'zuletzt '+new Date(last).toLocaleDateString('de-DE'):'noch nie'}</span></div>
    <button class="btn" id="spBackupGo">${SVI('upload')} Sicherung herunterladen</button>`;
  (P.querySelector('#spCost')||P.lastElementChild).after(el);
  el.querySelector('#spBackupGo').onclick=async()=>{ try{ const {data,error}=await SVB.sb.rpc('admin_export'); if(error)throw error;
    const blob=new Blob([JSON.stringify(data)],{type:'application/json'}), a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='svbc-sicherung-'+trToday()+'.json'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(a.href),4000);
    try{ localStorage.setItem('svbc-backup-at',new Date().toISOString()); }catch(e){} kToast('✓ Sicherung heruntergeladen'); el.remove(); spBackupCard(P); }catch(e){ kToast('⚠️ '+(e.message||e)); } };
}
{ const _ar3=svAdminRender; svAdminRender=async function(){ const r=await _ar3.apply(this,arguments); try{ await spBackupCard(document.getElementById('panel-admin')); }catch(e){} return r; }; }

/* =====================================================================
   SV/BSC Scout · Runde 11: Saison-Statistik automatisch aus den Spielberichten (FUSSBALL.DE)
   - Einsätze, Startelf, Minuten und Tore aller Pflichtspiele der Ersten (Meisterschaft + Pokal)
   - fließt in die ewige Liste, Meilensteine, Abzeichen und Vereinstreue ein – niemand muss etwas eintragen
   ===================================================================== */
const FB={m:[],pl:new Map(),loaded:false,loading:false,map:null,mapK:'',busy:false};
async function fbLoad(force){
  if(FB.loading||(FB.loaded&&!force))return; FB.loading=true;
  try{
    const [m,p]=await Promise.all([SVB.sb.from('fde_matches').select('id,team,saison,datum,zeit,wettbewerb,code,heim,gast,wir_heim,apps,bank,bericht').order('datum',{ascending:false}).limit(400),
      SVB.sb.from('fde_players').select('key,name').limit(3000)]);
    FB.m=(m.data||[]).map(x=>Object.assign(x,{apps:Array.isArray(x.apps)?x.apps:[],bank:Array.isArray(x.bank)?x.bank:[]})); FB.pl=new Map((p.data||[]).map(r=>[r.key,r.name])); FB.loaded=true; FB.map=null;
  }catch(e){ console.warn('Spielberichte',e); FB.loaded=true; }
  FB.loading=false; fbAfter();
}
function fbAfter(){ try{ fbSyncRows(); }catch(e){} VR._idx=null; VR._rk=null; try{ if(document.querySelector('#panel-verein.active'))vrRender(); }catch(e){} try{ vrHomeCard(); }catch(e){} }

/* Zuordnung Spielbericht-Spieler → Spieler im Datenbestand: zuerst über den FUSSBALL.DE-Link, dann über den Namen */
function fbMap(){
  const k=FB.pl.size+':'+players.length+':'+FB.m.length; if(FB.map&&FB.mapK===k)return FB.map;
  const M=new Map(), byUrl=new Map(), N=s=>TRC.N(s||'').replace(/[^a-z]/g,''), loose=s=>N(s).replace(/ss|ae|oe|ue/g,'');
  players.forEach(p=>{ const m=String(p.fdeUrl||'').match(/(player-id|userid)\/([0-9A-Z]{20,40})/); if(m)byUrl.set((m[1]==='userid'?'u:':'p:')+m[2],p.id); });
  const own=players.filter(p=>p.own), byN=new Map(), byL=new Map();
  const put=(mp,k,id)=>{ if(!k)return; mp.set(k,mp.has(k)&&mp.get(k)!==id?null:id); };
  own.forEach(p=>{ put(byN,N(p.name),p.id); put(byL,loose(p.name),p.id); });
  const keys=new Set(); FB.m.forEach(g=>{ g.apps.forEach(a=>keys.add(a.p)); g.bank.forEach(k=>keys.add(k)); });
  const usedP=new Set(); keys.forEach(k=>{ const id=byUrl.get(k); if(id){ M.set(k,id); usedP.add(id); } });
  keys.forEach(k=>{ if(M.has(k))return; const nm=FB.pl.get(k), id=nm&&(byN.get(N(nm))||byL.get(loose(nm))); if(id&&!usedP.has(id)){ M.set(k,id); usedP.add(id); } });
  FB.map=M; FB.mapK=k; return M;
}
function fbSeasonStart(){ return VR_SEASON_START; }
/* Pflichtspiele der Ersten seit einem Stichtag für einen Spieler */
function fbStats(pid,since,team){
  const M=fbMap(), o={sp:0,start:0,joker:0,tore:0,min:0,pokal:0,spiele:[]};
  for(const g of FB.m){ if(g.team!==(team||'A')||!g.bericht||(since&&g.datum<=since))continue;
    const a=g.apps.find(x=>M.get(x.p)===pid); if(!a)continue;
    o.sp++; if(a.s)o.start++; else o.joker++; o.tore+=a.t||0; o.min+=a.m||0; if(g.code==='PO')o.pokal++; o.spiele.push({g,a}); }
  return o;
}
/* Spieler ohne Eintrag auf der Vereinsseite (Neuzugänge) bekommen eine eigene Zeile in der ewigen Liste */
function fbSyncRows(){
  if(!FB.loaded||!VR.atLoaded)return;
  VR.at=VR.at.filter(r=>!r._fb);
  const M=fbMap(), have=new Set(), pids=new Set();
  const idx=TRS.allTimeIndex(VR.at,[...players.filter(p=>p.own),...players.filter(p=>!p.own)],CRM||{}); idx.byPlayer.forEach((r,pid)=>have.add(pid));
  FB.m.forEach(g=>{ if(g.team==='A'&&g.bericht&&g.datum>fbSeasonStart())g.apps.forEach(a=>{ const pid=M.get(a.p); if(pid)pids.add(pid); }); });
  pids.forEach(pid=>{ if(have.has(pid))return; const p=trP(pid); if(!p)return; VR.at.push({key:'fb:'+pid,name:p.name,tore:0,assists:0,spiele:0,siege:0,quote:null,stand:null,_fb:pid}); });
  VR._idx=null; VR._rk=null;
}
{ const _vi=vrIdx; vrIdx=function(){ const I=_vi.apply(this,arguments); try{ VR.at.forEach(r=>{ if(r._fb&&!I.byPlayer.has(r._fb)){ I.byPlayer.set(r._fb,r); I.used.set(r.key,r._fb); } }); }catch(e){} return I; }; }
{ const _vt=vrTotals; vrTotals=function(pid){ const r=_vt.apply(this,arguments);
  try{ if(FB.loaded){ const since=r.row&&r.row.stand?r.row.stand:fbSeasonStart(), f=fbStats(pid,since);
    if(f.sp){ const ms=Object.assign({sp:0,start:0,joker:0,tore:0,vor:0,s:0,u:0,n:0,zuNull:0},r.ms||{}); ms.spQ=ms.sp;
      if(f.sp>ms.sp){ ms.sp=f.sp; ms.start=f.start; ms.joker=f.joker; } ms.tore=Math.max(ms.tore,f.tore);
      r.ms=ms; r.tot=TRS.totals(r.row,ms); r.fb=f; } } }catch(e){ console.warn(e); }
  return r; }; }
{ const _la=vrLoadAllTime; vrLoadAllTime=async function(){ const r=await _la.apply(this,arguments); try{ fbSyncRows(); if(document.querySelector('#panel-verein.active'))vrRender(); }catch(e){} return r; }; }

/* ---------- Karte „Saison 26/27“ über der ewigen Liste ---------- */
function fbSeasonLabel(){ const y=+VR_SEASON_START.slice(2,4); return y+'/'+(y+1); }
function fbSeasonCard(){
  const G=FB.m.filter(g=>g.team==='A'&&g.datum>fbSeasonStart()), done=G.filter(g=>g.bericht), M=fbMap();
  const agg=new Map(); done.forEach(g=>{ const seen=new Set(); g.apps.forEach(a=>{ const pid=M.get(a.p)||null, k=pid||a.p; if(seen.has(k))return; seen.add(k); const o=agg.get(k)||{pid,k,name:pid?trP(pid).name:(FB.pl.get(a.p)||'Unbekannt'),sp:0,start:0,tore:0,min:0}; o.sp++; if(a.s)o.start++; o.tore+=a.t||0; o.min+=a.m||0; agg.set(k,o); }); });
  const L=[...agg.values()].sort((a,b)=>b.sp-a.sp||b.start-a.start||b.tore-a.tore), T=[...agg.values()].filter(x=>x.tore).sort((a,b)=>b.tore-a.tore||a.sp-b.sp);
  const po=done.filter(g=>g.code==='PO').length, open=G.length-done.length, unmapped=L.filter(x=>!x.pid).length;
  const btn=canTraining()?`<button class="btn ghost sm" id="fbRun">${SVI('refresh')} Jetzt abrufen</button>`:'';
  if(!G.length)return `<div class="card fbcard"><div class="vrat-h"><h3 class="trh" style="margin:0">${SVI('ball')} Saison ${fbSeasonLabel()} – automatisch</h3>${btn}</div><div class="note">Die Spielberichte der Pflichtspiele werden nach jedem Daten-Update von FUSSBALL.DE geholt (Mo, Do und So-Abend). Noch keine Daten.</div></div>`;
  return `<div class="card fbcard"><div class="vrat-h"><h3 class="trh" style="margin:0">${SVI('ball')} Saison ${fbSeasonLabel()} – 1. Mannschaft</h3>${btn}</div>
    <div class="fbstats"><span><b>${done.length}</b> Pflichtspiele${po?` <small>davon ${po} Pokal</small>`:''}</span><span><b>${L.length}</b> eingesetzte Spieler</span><span><b>${T.reduce((a,x)=>a+x.tore,0)}</b> Tore</span></div>
    <div class="fbgrid"><div><h4>Einsätze</h4>${L.slice(0,10).map((x,i)=>`<div class="fbrow" ${x.pid?`data-svp="${svEsc(x.pid)}"`:''}><em>${i+1}</em><b>${svEsc(x.name)}</b><span>${x.sp}<small> · ${x.start}× Startelf</small></span></div>`).join('')}</div>
      <div><h4>Torschützen</h4>${T.slice(0,10).map((x,i)=>`<div class="fbrow" ${x.pid?`data-svp="${svEsc(x.pid)}"`:''}><em>${i+1}</em><b>${svEsc(x.name)}</b><span>${x.tore}<small> in ${x.sp} Sp.</small></span></div>`).join('')||'<div class="note">Noch keine Tore.</div>'}</div></div>
    <div class="note">Automatisch aus den öffentlichen Spielberichten auf FUSSBALL.DE (Meisterschaft <b>und Pokal</b>) – zählt direkt in die ewige Liste unten. ${open?open+' Spiel'+(open>1?'e':'')+' noch ohne Bericht (wird nachgeholt). ':''}${unmapped?unmapped+' Spieler noch nicht im Datenbestand zugeordnet.':''}</div></div>`;
}
async function fbRun(btn){
  if(FB.busy)return; FB.busy=true; if(btn){ btn.disabled=true; btn.textContent='Holt Spielberichte …'; }
  try{ const {data:j,error}=await SVB.sb.functions.invoke('spielberichte',{body:{}});
    if(error){ let t=error.message; try{ const x=await error.context.json(); if(x&&x.error)t=x.error; }catch(_){} throw new Error(t); } if(!j||!j.ok)throw new Error((j&&j.error)||'Fehler');
    await fbLoad(true); kToast(`✓ Spielberichte aktualisiert – ${j.spiele_abgerufen||0} Spiele geprüft`);
  }catch(e){ kToast('⚠️ '+e.message); }
  FB.busy=false; if(btn){ btn.disabled=false; btn.innerHTML=SVI('refresh')+' Jetzt abrufen'; }
}
{ const _va=vrViewAllTime; vrViewAllTime=function(B){ const r=_va.apply(this,arguments);
  try{ if(!FB.loaded){ fbLoad(); } else if(VR.at.length){ const h=document.createElement('div'); h.innerHTML=fbSeasonCard(); const c=h.firstElementChild; const tgt=B.querySelector('.vrgrid'); if(tgt)tgt.before(c); else B.prepend(c);
    c.querySelectorAll('[data-svp]').forEach(x=>x.onclick=()=>openModal(x.dataset.svp)); const b=c.querySelector('#fbRun'); if(b)b.onclick=()=>fbRun(b); } }catch(e){ console.warn('Saisonkarte',e); }
  return r; }; }
{ const _si5=svInit; svInit=function(){ const r=_si5.apply(this,arguments); setTimeout(()=>fbLoad(),900); return r; }; }

/* ---------- Runde 12: Spiel-Status je Spieler (Startelf · eingewechselt · Kader · zugeschaut · nicht da) ---------- */
const FG_ST=[['da','Startelf','c1'],['spaet','Eingewechselt','c2'],['bank','Kader','c3'],['zuschauer','Zugeschaut','c4'],['weg','Nicht da','c5']];
/* Spielbericht eines Tages als Vorschlag für „Spiel erfassen“ */
function fbSpielAm(datum){
  if(!FB.loaded)return null; const g=FB.m.find(x=>x.team==='A'&&x.datum===datum&&x.bericht); if(!g)return null;
  const M=fbMap(), rows={}; let fehlt=0;
  g.apps.forEach(a=>{ const pid=M.get(a.p); if(!pid){ fehlt++; return; } rows[pid]={status:a.s?'da':'spaet',tore:a.t||0}; });
  g.bank.forEach(k=>{ const pid=M.get(k); if(!pid){ fehlt++; return; } if(!rows[pid])rows[pid]={status:'bank'}; });
  return {rows,fehlt,gegner:g.wir_heim?g.gast:g.heim,heim:g.wir_heim,code:g.code};
}
/* Alle Pflichtspiele der Ersten seit Saisonstart: erfasste Spiele (App) haben Vorrang, sonst der Spielbericht */
function fbSpielStatus(){
  const since=fbSeasonStart(), M=fbMap(), byDate=new Map();
  (TR.st.sessions||[]).filter(s=>s.t==='spiel'&&s.d>since).forEach(s=>byDate.set(s.d,{d:s.d,app:s}));
  FB.m.filter(g=>g.team==='A'&&g.bericht&&g.datum>since).forEach(g=>{ const o=byDate.get(g.datum)||{d:g.datum}; o.fb=g; byDate.set(g.datum,o); });
  const P=new Map(), get=pid=>{ if(!P.has(pid))P.set(pid,{pid,da:0,spaet:0,bank:0,zuschauer:0,weg:0,gr:{}}); return P.get(pid); };
  const G=[...byDate.values()].sort((a,b)=>a.d<b.d?-1:1);
  G.forEach(x=>{ const seen=new Set();
    if(x.app)(x.app.a||[]).forEach(a=>{ const o=get(a[0]); o[a[1]]=(o[a[1]]||0)+1; if(a[1]==='weg'){ o.gr[a[2]||'ohne']=(o.gr[a[2]||'ohne']||0)+1; } seen.add(a[0]); });
    if(x.fb){ x.fb.apps.forEach(a=>{ const pid=M.get(a.p); if(!pid||seen.has(pid))return; get(pid)[a.s?'da':'spaet']++; seen.add(pid); });
      x.fb.bank.forEach(k=>{ const pid=M.get(k); if(!pid||seen.has(pid))return; get(pid).bank++; seen.add(pid); }); } });
  return {spiele:G.length,erfasst:G.filter(x=>x.app).length,P};
}
function trViewGames(B){
  if(!FB.loaded){ B.innerHTML='<div class="card"><div class="empty">Lade Spielberichte …</div></div>'; fbLoad().then(()=>{ if(TR.view==='games')trViewGames(B); }); return; }
  const S=fbSpielStatus(), squad=trSquad(), rows=squad.map(p=>Object.assign({p},S.P.get(p.id)||{pid:p.id,da:0,spaet:0,bank:0,zuschauer:0,weg:0,gr:{}}));
  S.P.forEach((v,pid)=>{ if(!squad.some(p=>p.id===pid)&&trP(pid))rows.push(Object.assign({p:trP(pid)},v)); });
  rows.sort((a,b)=>(b.da+b.spaet)-(a.da+a.spaet)||b.da-a.da||b.bank-a.bank||a.p.name.localeCompare(b.p.name,'de'));
  const n=Math.max(1,S.spiele), bar=r=>`<div class="fgbar">${FG_ST.map(([k],i)=>r[k]?`<i class="b${i+1}" style="width:${r[k]/n*100}%"></i>`:'').join('')}</div>`;
  B.innerHTML=`<div class="card"><div class="vrat-h"><h3 class="trh" style="margin:0">${SVI('ball')} Spiele ${fbSeasonLabel()} – 1. Mannschaft</h3>${canTraining()?`<button class="btn ghost sm" id="fgRun">${SVI('refresh')} Spielberichte abrufen</button>`:''}</div>
    <div class="note" style="margin-top:6px">${S.spiele} Pflichtspiele (inkl. Pokal) · ${S.erfasst} davon in der App erfasst. Startelf, Einwechslungen und Kader kommen automatisch aus den Spielberichten. „Zugeschaut/unterstützt“ und „nicht da mit Grund“ tragt ihr unter <b>Spiel erfassen</b> ein – oder sie kommen aus der Abstimmung.</div>
    <div class="trtw"><table class="trtab fgtab"><thead><tr><th>Spieler</th>${FG_ST.map(([k,t,c])=>`<th class="${c}">${t}</th>`).join('')}<th></th></tr></thead><tbody>
    ${rows.filter(r=>r.da+r.spaet+r.bank+r.zuschauer+r.weg>0||r.p.kader===1).map(r=>`<tr data-svp="${svEsc(r.p.id)}"><td><b>${svEsc(r.p.name)}</b>${r.p.kader===2?' <small>II</small>':''}</td>
      ${FG_ST.map(([k,,c])=>`<td class="${r[k]?c:''}">${r[k]||'–'}${k==='weg'&&r.weg?`<span class="fggr">${Object.entries(r.gr).map(([g,x])=>svEsc(TRC.REASONS[g]||g)+(x>1?' '+x+'×':'')).join(', ')}</span>`:''}</td>`).join('')}<td>${bar(r)}</td></tr>`).join('')}</tbody></table></div></div>`;
  B.querySelectorAll('tr[data-svp]').forEach(r=>r.onclick=()=>openModal(r.dataset.svp));
  const b=document.getElementById('fgRun'); if(b)b.onclick=async()=>{ await fbRun(b); trViewGames(B); };
}
/* Im Spielerprofil: die fünf Zahlen der Saison */
{ const _om9=openModal; openModal=function(){ const r=_om9.apply(this,arguments); try{ const pid=arguments[0], p=trP(pid), M=document.getElementById('modal');
    if(p&&p.own&&canTraining()&&FB.loaded&&TR.loaded&&M&&!M.querySelector('.fgprofwrap')){ const o=fbSpielStatus().P.get(pid); if(o&&o.da+o.spaet+o.bank+o.zuschauer+o.weg){ const host=M.querySelector('.trprof'); if(host){
      const el=document.createElement('div'); el.className='fgprofwrap'; el.innerHTML=`<h4 class="trh" style="margin-top:12px">${SVI('ball')} Spiele ${fbSeasonLabel()}</h4><div class="fgprof">${FG_ST.map(([k,t,c])=>`<div><b class="${o[k]?c:''}">${o[k]}</b><span>${t}</span></div>`).join('')}</div>${o.weg?`<div class="trabs"><span>Nicht da:</span> ${Object.entries(o.gr).map(([g,x])=>`<i>${svEsc(TRC.REASONS[g]||g)}${x>1?' '+x+'×':''}</i>`).join('')}</div>`:''}`;
      host.appendChild(el); } } } }catch(e){ console.warn('Spielstatus',e); } return r; }; }

/* =====================================================================
   SV/BSC Scout · Runde 11: „Kabine“
   - Abstimmungen: Trainer legt an → Link in die WhatsApp-Gruppe → Spieler tippen ihren Namen und sagen zu/ab (ohne Anmeldung)
     Die App weiß, wer im Kader ist, und zeigt, wer noch fehlt – mit fertigem Erinnerungstext zum Nachhaken
   - Mannschaftskasse: Strafenkatalog, Strafen, Beiträge, Ein-/Ausgaben, Kassenstand – für alle Spieler transparent über denselben Link,
     bezahlen per PayPal.me (kostenlos), Kassenwart bestätigt
   ===================================================================== */
SV_PAGES.kabine=['Kabine','Abstimmungen per WhatsApp-Link und Mannschaftskasse'];
SV_TBL.kabine=['users','Kabine'];
{ const _ta6=svTabAllowed; svTabAllowed=function(t){ if(t==='kabine')return canTraining(); return _ta6.apply(this,arguments); }; }

const KB={loaded:false,loading:false,view:'abst',polls:[],votes:[],cfg:{},kat:[],buch:[],link:null,showOld:false,kf:'offen'};
const KB_ART={training:'Training',spiel:'Spiel',event:'Event',sonstiges:'Sonstiges'};
const KB_ANS={zu:['Dabei','ok'],vllt:['Vielleicht','mid'],ab:['Nicht dabei','bad']};
const kbEur=v=>(Math.round((+v||0)*100)/100).toLocaleString('de-DE',{style:'currency',currency:'EUR'});
const kbWd=d=>{ try{ return new Date(d+'T12:00:00').toLocaleDateString('de-DE',{weekday:'short',day:'2-digit',month:'2-digit'}); }catch(e){ return d; } };
const kbIgnKey='svbc_kb_ign';
function kbIgnored(){ try{ return new Set(JSON.parse(localStorage.getItem(kbIgnKey)||'[]')); }catch(e){ return new Set(); } }
function kbIgnore(ref){ try{ const s=kbIgnored(); s.add(ref); localStorage.setItem(kbIgnKey,JSON.stringify([...s].slice(-800))); }catch(e){} }

/* ---------- Laden ---------- */
async function kbLoad(force){
  if(KB.loading||(KB.loaded&&!force)||!canTraining())return; KB.loading=true;
  try{
    const since=TRC.addDays(trToday(),-120);
    const [p,c,k,b]=await Promise.all([SVB.sb.from('polls').select('*').gte('datum',since).order('datum',{ascending:false}).limit(120),
      SVB.sb.from('kasse_cfg').select('*').eq('id',1).maybeSingle(), SVB.sb.from('kasse_katalog').select('*').order('sort').order('titel').limit(200),
      SVB.sb.from('kasse_buchungen').select('*').order('datum',{ascending:false}).order('created_at',{ascending:false}).limit(3000)]);
    KB.polls=p.data||[]; KB.cfg=c.data||{}; KB.kat=k.data||[]; KB.buch=b.data||[];
    try{ const r=await SVB.sb.rpc('kabine_bot_get'); KB.bot=r.data||null; }catch(e){ KB.bot=null; }
    try{ const r=await SVB.sb.rpc('kabine_popup_get'); KB.popup=!r.error&&!!r.data; }catch(e){ KB.popup=false; }
    try{ if(!KB.link)await kbLink(); }catch(e){}
    const ids=KB.polls.map(x=>x.id); KB.votes=[];
    if(ids.length){ const v=await SVB.sb.from('poll_votes').select('*').in('poll_id',ids).limit(5000); KB.votes=v.data||[]; }
    KB.loaded=true;
  }catch(e){ console.warn('Kabine',e); KB.loaded=true; }
  KB.loading=false; kbAfter();
}
function kbAfter(){ try{ if(document.querySelector('#panel-kabine.active'))kbRender(); }catch(e){ console.warn(e); } try{ kbHomeCard(); }catch(e){} try{ if(!document.querySelector('#panel-kabine.active'))kbPopup(); }catch(e){ console.warn(e); } }
async function kbLink(renew){ const {data,error}=await SVB.sb.rpc('team_link',{p_new:!!renew}); if(error)throw new Error(error.message); KB.link=data; return data; }
function kbBase(){ return location.origin+location.pathname.replace(/[^/]*$/,''); }
function kbUrl(poll){ const L=KB.bot&&KB.bot.link_url; if(L&&L!==kbBase()&&KB.link)return L+encodeURIComponent(KB.link)+(poll?'#a='+poll:'');
  return kbBase()+'team.html#k='+encodeURIComponent(KB.link||'')+(poll?'&a='+poll:''); }
function kbWa(text){ window.open('https://wa.me/?text='+encodeURIComponent(text),'_blank','noopener'); }
async function kbCopy(t){ try{ await navigator.clipboard.writeText(t); kToast('✓ Kopiert'); }catch(e){ prompt('Zum Kopieren:',t); } }

/* ---------- Abstimmungen: Auswertung ---------- */
function kbVotes(poll){ return KB.votes.filter(v=>v.poll_id===poll.id); }
function kbStat(poll){
  const V=new Map(kbVotes(poll).map(v=>[v.player_id,v])), T=(poll.teilnehmer||[]);
  const o={zu:[],ab:[],vllt:[],offen:[]}; T.forEach(t=>{ const v=V.get(t.id); (v?o[v.antwort]:o.offen).push(Object.assign({},t,{v})); });
  return o;
}
function kbPollTitle(p){ return `${p.titel} · ${kbWd(p.datum)}${p.zeit?' '+p.zeit:''}`; }
function kbInviteText(p){ return `⚽ *${p.titel}* – ${kbWd(p.datum)}${p.zeit?' um '+p.zeit:''}${p.ort?' ('+p.ort+')':''}\nBist du dabei? Link öffnen, deinen Vor- und Nachnamen antippen und zu- oder absagen – ohne Anmeldung, jederzeit änderbar:\n${kbUrl(p.id)}${p.frist?'\nBis '+new Date(p.frist).toLocaleString('de-DE',{weekday:'short',hour:'2-digit',minute:'2-digit'})+' Uhr':''}`; }
function kbNudgeText(p){ const s=kbStat(p); return `⏰ *${p.titel}* (${kbWd(p.datum)}): Von euch fehlt noch die Antwort – ${s.offen.map(x=>x.name.split(' ')[0]+' '+x.name.split(' ').slice(1).join(' ').slice(0,1)+'.').join(', ')}.\nBitte kurz abstimmen, dauert 5 Sekunden:\n${kbUrl(p.id)}`; }
/* Wer im Kader ist, aber nicht auf der Liste steht (vergessen?) */
function kbForgotten(p){ const ids=new Set((p.teilnehmer||[]).map(t=>t.id)); return vrKader(false).filter(x=>!ids.has(x.id)&&!trInjury(x.id)); }

/* ---------- Seite ---------- */
function kbRender(){
  const P=document.getElementById('panel-kabine'); if(!P)return;
  if(!canTraining()){ P.innerHTML='<div class="card"><div class="empty">Die Kabine sehen Trainer, Kaderplanung und Vorstand.</div></div>'; return; }
  if(!KB.loaded){ P.innerHTML='<div class="card"><div class="empty">Lade Kabine …</div></div>'; kbLoad(); return; }
  const tabs=[['abst','Abstimmungen'],['kasse','Mannschaftskasse'],['link','Automatik']];
  const act=KB.view==='abst'?`<button class="btn" data-kb-new>${SVI('plus')} Abstimmung</button>`:KB.view==='kasse'?`<button class="btn" data-kb-strafe>${SVI('plus')} Strafe</button><button class="btn ghost" data-kb-buch>${SVI('plus')} Ein-/Ausgabe</button>`:'';
  P.innerHTML=`<div class="trtop"><div class="trtabs">${tabs.map(([k,t])=>`<button class="${KB.view===k?'on':''}" data-kbv="${k}">${t}</button>`).join('')}</div><div class="tract">${act}</div></div><div id="kbBody"></div>`;
  P.querySelectorAll('[data-kbv]').forEach(b=>b.onclick=()=>{ KB.view=b.dataset.kbv; kbRender(); });
  const nb=P.querySelector('[data-kb-new]'); if(nb)nb.onclick=()=>kbPollEditor(null);
  const sb=P.querySelector('[data-kb-strafe]'); if(sb)sb.onclick=()=>kbStrafeEditor();
  const bb=P.querySelector('[data-kb-buch]'); if(bb)bb.onclick=()=>kbBuchEditor();
  const B=document.getElementById('kbBody');
  ({abst:kbViewPolls,kasse:kbViewKasse,link:kbViewLink})[KB.view](B);
}

/* ----- Abstimmungen ----- */
function kbSuggest(){
  const out=[], today=trToday();
  try{ if(typeof spNext==='function'&&SP.loaded){ const f=spNext('A')[0]; if(f&&TRC.diffDays(f.datum,today)<=10&&!KB.polls.some(p=>p.datum===f.datum&&p.art==='spiel'))
    out.push({titel:`Spiel ${f.heim_key===SP_OWN.A?'gegen '+f.gast:'bei '+f.heim}`,art:'spiel',datum:f.datum,zeit:f.zeit||'',ort:f.heim_key===SP_OWN.A?'Heim':'Auswärts'}); } }catch(e){}
  // nächste zwei Trainingstage aus den letzten Einheiten ableiten (häufigste Wochentage)
  try{ const wd={}; TR.st.sessions.filter(s=>s.t==='training').slice(0,24).forEach(s=>{ const d=new Date(s.d+'T12:00:00').getDay(); wd[d]=(wd[d]||0)+1; });
    let days=Object.entries(wd).sort((a,b)=>b[1]-a[1]).slice(0,2).map(x=>+x[0]); if(!days.length)days=[2,4];
    for(let i=1;i<=9&&out.filter(x=>x.art==='training').length<2;i++){ const d=TRC.addDays(today,i); if(days.includes(new Date(d+'T12:00:00').getDay())&&!KB.polls.some(p=>p.datum===d&&p.art==='training'))out.push({titel:'Training',art:'training',datum:d,zeit:'19:00',ort:''}); } }catch(e){}
  return out.sort((a,b)=>a.datum<b.datum?-1:1).slice(0,3);
}
function kbViewPolls(B){
  const today=trToday(), open=KB.polls.filter(p=>p.datum>=today&&!p.geschlossen).sort((a,b)=>a.datum<b.datum?-1:1), old=KB.polls.filter(p=>!open.includes(p));
  const sug=kbSuggest();
  const card=p=>{ const s=kbStat(p), n=(p.teilnehmer||[]).length, pc=x=>n?Math.round(x/n*100):0, fg=kbForgotten(p).length;
    return `<div class="card kbpoll" data-poll="${p.id}"><div class="kbp-h"><div><span class="trpill">${svEsc(KB_ART[p.art]||p.art)}</span> <b>${svEsc(p.titel)}</b><small>${kbWd(p.datum)}${p.zeit?' · '+svEsc(p.zeit):''}${p.ort?' · '+svEsc(p.ort):''}${p.auto?' · 🤖 automatisch':''}${p.geteilt_at?` · ✓ in der Gruppe${p.geteilt_von?' ('+svEsc(p.geteilt_von.split(' ')[0])+')':''}`:p.gesendet_at?' · ✓ Link verschickt':''}${p.erinnert_at?' · ✓ nachgehakt':''}</small></div>
        <div class="kbnum"><b class="ok">${s.zu.length}</b><b class="mid">${s.vllt.length}</b><b class="bad">${s.ab.length}</b><b>${s.offen.length}</b></div></div>
      <div class="kbbar"><i class="ok" style="width:${pc(s.zu.length)}%"></i><i class="mid" style="width:${pc(s.vllt.length)}%"></i><i class="bad" style="width:${pc(s.ab.length)}%"></i></div>
      <div class="kblegend"><span class="ok">${s.zu.length} dabei</span><span class="mid">${s.vllt.length} vielleicht</span><span class="bad">${s.ab.length} können nicht</span><span>${s.offen.length} ohne Antwort</span></div>
      ${s.offen.length&&s.offen.length<n?`<div class="kbmiss"><b>Noch offen:</b> ${s.offen.map(x=>svEsc(x.name)).join(', ')}</div>`:''}
      ${fg?`<div class="kbmiss warn">⚠️ ${fg} ${fg>1?'Spieler aus dem Kader stehen':'Spieler aus dem Kader steht'} nicht auf der Liste – vergessen? <button class="lnk" data-kb-fg="${p.id}">Ansehen</button></div>`:''}
      <div class="btnrow"><button class="btn sm${p.geteilt_at?' ghost':''}" data-kb-share="${p.id}">${SVI('share')} ${p.geteilt_at?'Nochmal teilen':'In die Gruppe teilen'}</button>${s.offen.length?`<button class="btn ghost sm" data-kb-nudge="${p.id}">${SVI('bell')} Nachhaken (${s.offen.length})</button>`:''}<button class="btn ghost sm" data-kb-det="${p.id}">Details</button></div></div>`; };
  B.innerHTML=`${!open.length?`<div class="card kbempty"><h3 class="trh">${SVI('users')} Wer ist dabei?</h3><p>Leg eine Abstimmung an, teile den Link in der WhatsApp-Gruppe – die Spieler tippen ihren Namen und sagen mit einem Klick zu oder ab. Kein Login, keine App nötig. Du siehst sofort, wer fehlt, und kannst gezielt nachhaken.</p></div>`:''}
    ${sug.length?`<div class="kbsug"><span>Schnell anlegen:</span>${sug.map((x,i)=>`<button class="pchip" data-kb-sug="${i}">${svEsc(x.titel)} · ${kbWd(x.datum)}</button>`).join('')}</div>`:''}
    ${open.map(card).join('')}
    ${old.length?`<button class="btn ghost sm" id="kbOld">${KB.showOld?'Vergangene ausblenden':`Vergangene Abstimmungen (${old.length})`}</button>${KB.showOld?`<div class="kbold">${old.map(p=>{ const s=kbStat(p); return `<div class="kbo" data-kb-det="${p.id}"><b>${svEsc(p.titel)}</b><small>${kbWd(p.datum)}</small><span class="ok">${s.zu.length}</span><span class="bad">${s.ab.length}</span><span>${s.offen.length} offen</span></div>`; }).join('')}</div>`:''}`:''}`;
  B.querySelectorAll('[data-kb-sug]').forEach(b=>b.onclick=()=>kbPollEditor(null,sug[+b.dataset.kbSug]));
  B.querySelectorAll('[data-kb-share]').forEach(b=>b.onclick=()=>kbShare(KB.polls.find(x=>x.id===b.dataset.kbShare)));
  B.querySelectorAll('[data-kb-nudge]').forEach(b=>b.onclick=async()=>{ const p=KB.polls.find(x=>x.id===b.dataset.kbNudge); try{ await kbLink(); kbWa(kbNudgeText(p)); }catch(e){ kToast('⚠️ '+e.message); } });
  B.querySelectorAll('[data-kb-det]').forEach(b=>b.onclick=()=>kbPollDetail(b.dataset.kbDet));
  B.querySelectorAll('[data-kb-fg]').forEach(b=>b.onclick=()=>kbPollDetail(b.dataset.kbFg));
  const ob=document.getElementById('kbOld'); if(ob)ob.onclick=()=>{ KB.showOld=!KB.showOld; kbViewPolls(B); };
  B.insertAdjacentHTML('beforeend',`<div class="kbpop-set"><span>${SVI('bell')} Einladen-Pop-up für mich</span><button class="btn ghost sm" id="kbPopT">${KB.popup?'An':'Aus'}</button></div>`);
  document.getElementById('kbPopT').onclick=async()=>{ const {data,error}=await SVB.sb.rpc('kabine_popup_set',{p_an:!KB.popup}); if(error)return kToast('⚠️ '+error.message); KB.popup=!!data; kToast(KB.popup?'✓ Pop-up an – du wirst vor jedem Training ans Einladen erinnert':'✓ Pop-up aus'); kbViewPolls(B); };
}
function kbSquadAll(){ return players.filter(p=>p.own&&!p.isJugend&&!p.verzicht&&(p.kader===1||p.kader===2)).sort((a,b)=>(a.kader||1)-(b.kader||1)||a.name.localeCompare(b.name,'de')); }
function kbPollEditor(id,pre){
  const p0=id?KB.polls.find(x=>x.id===id):null, pr=pre||{};
  const st={titel:p0?p0.titel:(pr.titel||'Training'),art:p0?p0.art:(pr.art||'training'),datum:p0?p0.datum:(pr.datum||TRC.addDays(trToday(),1)),zeit:p0?p0.zeit||'':(pr.zeit||'19:00'),ort:p0?p0.ort||'':(pr.ort||''),notiz:p0?p0.notiz||'':'',
    frist:p0&&p0.frist?p0.frist.slice(0,16):'', sel:new Set(p0?(p0.teilnehmer||[]).map(t=>t.id):vrKader(false).map(x=>x.id))};
  svModal(`<div class="mhead"><div class="rm-ic" style="width:46px;height:46px">${SVI('users')}</div><div><h2 style="margin:0">${p0?'Abstimmung bearbeiten':'Neue Abstimmung'}</h2><div class="msub">Danach „In WhatsApp teilen“ – die Spieler stimmen über den Link ab</div></div></div><div id="kbEd"></div>`);
  const draw=()=>{ const E=document.getElementById('kbEd'); if(!E)return; const all=kbSquadAll();
    E.innerHTML=`<div class="kbform"><div class="field"><label>Titel</label><input id="kbT" maxlength="120" value="${svEsc(st.titel)}"></div>
      <div class="field"><label>Art</label><select id="kbA">${Object.entries(KB_ART).map(([k,t])=>`<option value="${k}"${st.art===k?' selected':''}>${t}</option>`).join('')}</select></div>
      <div class="field"><label>Datum</label><input id="kbD" type="date" value="${svEsc(st.datum)}"></div><div class="field"><label>Uhrzeit</label><input id="kbZ" maxlength="10" value="${svEsc(st.zeit)}" placeholder="19:00"></div>
      <div class="field"><label>Ort / Treffpunkt</label><input id="kbO" maxlength="120" value="${svEsc(st.ort)}" placeholder="z.B. Sportplatz, 45 Min. vorher"></div>
      <div class="field"><label>Antworten bis (optional)</label><input id="kbF" type="datetime-local" value="${svEsc(st.frist)}"></div>
      <div class="field kbwide"><label>Hinweis (optional)</label><input id="kbN" maxlength="500" value="${svEsc(st.notiz)}" placeholder="z.B. Bitte Laufschuhe mitbringen"></div></div>
      <div class="sbsec"><h4>Wer soll abstimmen? <small>${st.sel.size} ausgewählt</small></h4>
        <div class="btnrow" style="margin-bottom:8px"><button type="button" class="btn ghost sm" data-g="1">1. Mannschaft</button><button type="button" class="btn ghost sm" data-g="12">Erste + Zweite</button><button type="button" class="btn ghost sm" data-g="0">Keiner</button></div>
        <div class="chips kbchips">${all.map(x=>`<button type="button" class="pchip${st.sel.has(x.id)?' on':''}" data-pl="${svEsc(x.id)}">${svEsc(x.name)}${x.kader===2?' <small>II</small>':''}${trInjury(x.id)?' 🩹':''}</button>`).join('')}</div></div>
      <div class="btnrow sbact"><button class="btn" id="kbSave">${p0?'Speichern':'Anlegen'}</button><button class="btn ghost" id="kbCancel">Abbrechen</button>${p0?`<button class="btn ghost" id="kbDel" style="margin-left:auto;color:#fca5a5">Löschen</button>`:''}</div>`;
    const keep=()=>{ st.titel=document.getElementById('kbT').value; st.art=document.getElementById('kbA').value; st.datum=document.getElementById('kbD').value; st.zeit=document.getElementById('kbZ').value; st.ort=document.getElementById('kbO').value; st.frist=document.getElementById('kbF').value; st.notiz=document.getElementById('kbN').value; };
    document.getElementById('kbA').onchange=()=>{ keep(); if(!p0&&/^(Training|Spiel|Event|Sonstiges)$/.test(st.titel))st.titel=KB_ART[st.art]; draw(); };
    E.querySelectorAll('[data-pl]').forEach(b=>b.onclick=()=>{ keep(); const k=b.dataset.pl; if(st.sel.has(k))st.sel.delete(k); else st.sel.add(k); draw(); });
    E.querySelectorAll('[data-g]').forEach(b=>b.onclick=()=>{ keep(); const g=b.dataset.g; st.sel=new Set(g==='0'?[]:all.filter(x=>g==='12'||x.kader===1).map(x=>x.id)); draw(); });
    document.getElementById('kbCancel').onclick=()=>closeOverlay();
    const del=document.getElementById('kbDel'); if(del)del.onclick=async()=>{ if(!confirm('Abstimmung samt Antworten löschen?'))return; const {error}=await SVB.sb.from('polls').delete().eq('id',p0.id); if(error)return kToast('⚠️ '+error.message); closeOverlay(); await kbLoad(true); kToast('Abstimmung gelöscht'); };
    document.getElementById('kbSave').onclick=async()=>{ keep();
      if(!st.titel.trim())return kToast('Bitte einen Titel angeben'); if(!st.datum)return kToast('Bitte ein Datum angeben'); if(!st.sel.size)return kToast('Bitte mindestens einen Spieler auswählen');
      if(st.sel.size>80)return kToast('Höchstens 80 Spieler');
      const tn=[...st.sel].map(id=>({id,name:(trP(id)||{}).name||id}));
      const row={titel:st.titel.trim().slice(0,120),art:st.art,datum:st.datum,zeit:st.zeit.trim()||null,ort:st.ort.trim()||null,notiz:st.notiz.trim()||null,frist:st.frist?new Date(st.frist).toISOString():null,teilnehmer:tn};
      const b=document.getElementById('kbSave'); b.disabled=true;
      const q=p0?SVB.sb.from('polls').update(row).eq('id',p0.id).select().single():SVB.sb.from('polls').insert(row).select().single();
      const {data,error}=await q; if(error){ b.disabled=false; return kToast('⚠️ '+error.message); }
      closeOverlay(); await kbLoad(true); kToast(p0?'✓ Gespeichert':'✓ Abstimmung angelegt – jetzt in WhatsApp teilen');
      if(!p0&&data){ try{ await kbLink(); if(confirm('Direkt in WhatsApp teilen?'))kbWa(kbInviteText(data)); }catch(e){} } };
  };
  draw();
}
function kbPollDetail(id){
  const p=KB.polls.find(x=>x.id===id); if(!p)return;
  svModal(`<div class="mhead"><div class="rm-ic" style="width:46px;height:46px">${SVI('users')}</div><div><h2 style="margin:0">${svEsc(p.titel)}</h2><div class="msub">${kbWd(p.datum)}${p.zeit?' · '+svEsc(p.zeit):''}${p.ort?' · '+svEsc(p.ort):''}</div></div></div><div id="kbDet"></div>`);
  const draw=()=>{ const E=document.getElementById('kbDet'); if(!E)return; const s=kbStat(p), fg=kbForgotten(p);
    const row=x=>{ const v=x.v; return `<div class="kbr"><b>${svEsc(x.name)}${x.gast?' <span class="trpill mid" title="Hat sich selbst über den Gruppenlink eingetragen">neu</span>':''}</b>${v&&v.grund?`<small>${svEsc(TRC.REASONS[v.grund]||v.grund)}</small>`:''}${v&&v.notiz?`<small>„${svEsc(v.notiz)}“</small>`:''}${v?`<em>${v.via==='link'?'über Link':'vom Trainer'} · ${new Date(v.at).toLocaleString('de-DE',{weekday:'short',hour:'2-digit',minute:'2-digit'})}</em>`:''}
      <div class="trseg">${(v&&v.antwort==='vllt'?['zu','vllt','ab']:['zu','ab']).map(a=>`<button type="button" data-set="${svEsc(x.id)}:${a}" class="${v&&v.antwort===a?'on':''}">${KB_ANS[a][0]}</button>`).join('')}</div></div>`; };
    E.innerHTML=`${p.geteilt_at?`<div class="note">✓ In die Gruppe geteilt${p.geteilt_von?' von '+svEsc(p.geteilt_von):''} · ${new Date(p.geteilt_at).toLocaleString('de-DE',{weekday:'short',hour:'2-digit',minute:'2-digit'})} Uhr</div>`:''}${[['zu','Dabei'],['vllt','Vielleicht'],['ab','Nicht dabei'],['offen','Ohne Antwort']].map(([k,t])=>s[k].length?`<div class="sbsec"><h4>${t} <small>${s[k].length}</small></h4>${s[k].map(row).join('')}</div>`:'').join('')}
      ${fg.length?`<div class="sbsec"><h4>Im Kader, aber nicht auf der Liste <small>${fg.length}</small></h4><div class="chips">${fg.map(x=>`<button type="button" class="pchip" data-add="${svEsc(x.id)}">+ ${svEsc(x.name)}</button>`).join('')}</div></div>`:''}
      <div class="btnrow sbact"><button class="btn" id="kbTr">${SVI('activity')} ${p.art==='spiel'?'Spiel':'Anwesenheit'} vorbereiten</button><button class="btn ghost" id="kbSh">${SVI('share')} ${p.geteilt_at?'Nochmal teilen':'In die Gruppe teilen'}</button><button class="btn ghost" id="kbCp">${SVI('copy')} Link kopieren</button><button class="btn ghost" id="kbEdit">Bearbeiten</button>
        <button class="btn ghost" id="kbClose">${p.geschlossen?'Wieder öffnen':'Abstimmung schließen'}</button></div>
      <div class="note">„Vorbereiten“ übernimmt die Antworten ins Training bzw. Spiel: Zusagen als da (beim Spiel: im Kader), Absagen mit Grund. Beim Spiel danach „Aus Spielbericht übernehmen“ – Startelf und Einwechslungen kommen automatisch.</div>`;
    E.querySelectorAll('[data-set]').forEach(b=>b.onclick=async()=>{ const [pid,a]=b.dataset.set.split(':'); const cur=kbVotes(p).find(v=>v.player_id===pid);
      const q=cur&&cur.antwort===a?SVB.sb.from('poll_votes').delete().eq('poll_id',p.id).eq('player_id',pid):SVB.sb.from('poll_votes').upsert({poll_id:p.id,player_id:pid,antwort:a,grund:a==='ab'?(cur&&cur.grund)||null:null,via:'app',at:new Date().toISOString()});
      const {error}=await q; if(error)return kToast('⚠️ '+error.message); await kbLoad(true); draw(); });
    E.querySelectorAll('[data-add]').forEach(b=>b.onclick=async()=>{ const x=trP(b.dataset.add); const tn=[...(p.teilnehmer||[]),{id:x.id,name:x.name}];
      const {error}=await SVB.sb.from('polls').update({teilnehmer:tn}).eq('id',p.id); if(error)return kToast('⚠️ '+error.message); p.teilnehmer=tn; await kbLoad(true); draw(); kToast('✓ '+x.name+' hinzugefügt'); });
    document.getElementById('kbTr').onclick=()=>{ const rows={}; kbVotes(p).forEach(v=>{ if(v.antwort==='zu')rows[v.player_id]={status:p.art==='spiel'?'bank':'da'}; else if(v.antwort==='ab')rows[v.player_id]={status:'weg',grund:v.grund||'privat',notiz:v.notiz||''}; });
      TR.prefill={datum:p.datum,rows}; closeOverlay(); goTab('training'); setTimeout(()=>trSessionEditor(p.datum,null,p.art==='spiel'?'spiel':'training'),60); };
    document.getElementById('kbCp').onclick=async()=>{ try{ await kbLink(); kbCopy(kbUrl(p.id)); }catch(e){ kToast('⚠️ '+e.message); } };
    document.getElementById('kbSh').onclick=()=>kbShare(p);
    document.getElementById('kbEdit').onclick=()=>{ closeOverlay(); kbPollEditor(p.id); };
    document.getElementById('kbClose').onclick=async()=>{ const {error}=await SVB.sb.from('polls').update({geschlossen:!p.geschlossen}).eq('id',p.id); if(error)return kToast('⚠️ '+error.message); p.geschlossen=!p.geschlossen; await kbLoad(true); draw(); };
  };
  draw();
}

/* ----- Mannschaftskasse ----- */
const KB_DEFAULT_KAT=[['Zu spät zum Training',5,'Training'],['Zu spät zum Spiel / Treffpunkt',10,'Spiel'],['Training unentschuldigt gefehlt',10,'Training'],['Spiel unentschuldigt gefehlt',25,'Spiel'],
  ['Keine Rückmeldung bei Abstimmung',2,'Abstimmung'],['Gelbe Karte wegen Meckern',10,'Karten'],['Gelb-Rote Karte',15,'Karten'],['Rote Karte',25,'Karten'],['Handy in der Kabine',5,'Kabine'],['Ausrüstung vergessen',5,'Kabine'],['Monatsbeitrag Mannschaftskasse',5,'Beitrag']];
function kbSaldo(){
  const bez=KB.buch.filter(b=>b.status==='bezahlt'), plus=bez.filter(b=>b.art!=='ausgabe').reduce((a,b)=>a+ +b.betrag,0), minus=bez.filter(b=>b.art==='ausgabe').reduce((a,b)=>a+ +b.betrag,0);
  const offen=KB.buch.filter(b=>b.status==='offen'||b.status==='gemeldet').reduce((a,b)=>a+ +b.betrag,0);
  return {stand:(+KB.cfg.anfang||0)+plus-minus,offen,plus,minus,gemeldet:KB.buch.filter(b=>b.status==='gemeldet')};
}
function kbByPlayer(){
  const M=new Map(); KB.buch.filter(b=>b.player_id&&(b.art==='strafe'||b.art==='beitrag')).forEach(b=>{ const o=M.get(b.player_id)||{pid:b.player_id,name:(trP(b.player_id)||{}).name||b.name||b.player_id,offen:0,bez:0,n:0}; o.n++;
    if(b.status==='offen'||b.status==='gemeldet')o.offen+= +b.betrag; else if(b.status==='bezahlt')o.bez+= +b.betrag; M.set(b.player_id,o); });
  return [...M.values()].sort((a,b)=>b.offen-a.offen||b.bez-a.bez);
}
function kbKatFind(rx,fb){ return KB.kat.find(k=>k.aktiv&&rx.test(TRC.N(k.titel)))||{titel:fb[0],betrag:fb[1]}; }
/* Vorschläge: aus Anwesenheit (zu spät / unentschuldigt) und Abstimmungen ohne Antwort nach Fristende */
function kbVorschlaege(){
  const out=[], refs=new Set(KB.buch.map(b=>b.ref).filter(Boolean)), ign=kbIgnored(), since=TRC.addDays(trToday(),-45);
  try{ TR.st.sessions.filter(s=>s.d>=since).forEach(s=>(s.a||[]).forEach(a=>{ const pid=a[0];
    if(a[1]==='spaet'){ const k=kbKatFind(s.t==='spiel'?/spaet.*spiel|spiel.*spaet|treffpunkt/:/spaet.*training|training.*spaet|^zu spaet/,[s.t==='spiel'?'Zu spät zum Spiel':'Zu spät zum Training',s.t==='spiel'?10:5]);
      out.push({ref:`att:${s.id}:${pid}`,pid,titel:k.titel,betrag:+k.betrag,datum:s.d,why:`${s.t==='spiel'?'Spiel':'Training'} ${TRC.fmt(s.d)}: zu spät`}); }
    if(a[1]==='weg'&&a[2]==='ohne'){ const k=kbKatFind(s.t==='spiel'?/spiel.*(unentschuldigt|gefehlt)/:/training.*(unentschuldigt|gefehlt)|unentschuldigt/,[s.t==='spiel'?'Spiel unentschuldigt gefehlt':'Training unentschuldigt gefehlt',s.t==='spiel'?25:10]);
      out.push({ref:`att:${s.id}:${pid}`,pid,titel:k.titel,betrag:+k.betrag,datum:s.d,why:`${s.t==='spiel'?'Spiel':'Training'} ${TRC.fmt(s.d)}: ohne Grund gefehlt`}); } })); }catch(e){}
  try{ const now=new Date().toISOString(); KB.polls.filter(p=>p.frist&&p.frist<now&&p.datum>=since).forEach(p=>{ const s=kbStat(p); const k=kbKatFind(/rueckmeldung|abstimmung|abgestimmt/,['Keine Rückmeldung bei Abstimmung',2]);
    s.offen.forEach(x=>out.push({ref:`poll:${p.id}:${x.id}`,pid:x.id,titel:k.titel,betrag:+k.betrag,datum:p.datum,why:`Keine Antwort bei „${p.titel}“ (${kbWd(p.datum)})`})); }); }catch(e){}
  return out.filter(v=>!refs.has(v.ref)&&!ign.has(v.ref)&&v.betrag>0&&trP(v.pid));
}
function kbViewKasse(B){
  const S=kbSaldo(), BP=kbByPlayer(), V=kbVorschlaege(), cfg=KB.cfg||{};
  const stat=b=>({offen:['offen','mid'],gemeldet:['gemeldet','mid'],bezahlt:['bezahlt','ok'],erlassen:['erlassen','']}[b.status]);
  const list=KB.buch.filter(b=>KB.kf==='alle'||(KB.kf==='offen'?(b.status==='offen'||b.status==='gemeldet'):KB.kf==='bewegung'?(b.art==='einzahlung'||b.art==='ausgabe'):true)).slice(0,120);
  B.innerHTML=`<div class="kbstats"><div class="kbst"><span>Kassenstand</span><b class="${S.stand<0?'bad':''}">${kbEur(S.stand)}</b></div><div class="kbst"><span>Noch offen</span><b class="mid">${kbEur(S.offen)}</b></div>
      <div class="kbst"><span>Eingenommen</span><b>${kbEur(S.plus)}</b></div><div class="kbst"><span>Ausgegeben</span><b>${kbEur(S.minus)}</b></div></div>
    ${!cfg.paypal?`<div class="card kbhint">${SVI('info')} <div><b>PayPal.me hinterlegen</b><span>Dann können die Spieler ihre Strafen direkt über den Team-Link bezahlen – mit „Freunde &amp; Familie“ kostenlos.</span></div><button class="btn sm" id="kbCfg1">Einrichten</button></div>`:''}
    ${S.gemeldet.length?`<div class="card"><h3 class="trh">${SVI('check')} Als bezahlt gemeldet – bitte prüfen <small>${S.gemeldet.length}</small></h3>${S.gemeldet.map(b=>`<div class="kbb"><b>${svEsc((trP(b.player_id)||{}).name||b.name||'')}</b><span>${svEsc(b.titel)}</span><em>${kbEur(b.betrag)}</em><div class="btnrow"><button class="btn sm" data-ok="${b.id}">Eingang bestätigt</button><button class="btn ghost sm" data-back="${b.id}">Noch nicht da</button></div></div>`).join('')}</div>`:''}
    ${V.length?`<div class="card"><h3 class="trh">${SVI('bell')} Vorschläge <small>${V.length}</small></h3><div class="note" style="margin-top:0">Aus Anwesenheit und Abstimmungen – nichts wird automatisch gebucht.</div>${V.slice(0,15).map((v,i)=>`<div class="kbb"><b>${svEsc(trP(v.pid).name)}</b><span>${svEsc(v.titel)} <small>${svEsc(v.why)}</small></span><em>${kbEur(v.betrag)}</em><div class="btnrow"><button class="btn sm" data-vb="${i}">Buchen</button><button class="btn ghost sm" data-vi="${i}">Ignorieren</button></div></div>`).join('')}
      ${V.length>1?`<button class="btn ghost sm" id="kbAllV">Alle ${Math.min(V.length,15)} buchen</button>`:''}</div>`:''}
    <div class="vrgrid"><div class="card"><h3 class="trh">${SVI('users')} Spieler</h3>${BP.length?BP.map(x=>`<div class="kbpl" data-kbp="${svEsc(x.pid)}"><b>${svEsc(x.name)}</b><span>${x.offen?`<i class="mid">${kbEur(x.offen)} offen</i>`:'<i class="ok">alles bezahlt</i>'}</span><small>${kbEur(x.bez)} bezahlt</small></div>`).join(''):'<div class="note">Noch keine Strafen oder Beiträge gebucht.</div>'}</div>
      <div class="card"><div class="vrat-h"><h3 class="trh" style="margin:0">${SVI('book')} Strafenkatalog</h3><button class="btn ghost sm" id="kbKat">Bearbeiten</button></div>${KB.kat.filter(k=>k.aktiv).length?`<div class="kbkat">${KB.kat.filter(k=>k.aktiv).map(k=>`<div><span>${svEsc(k.titel)}</span><b>${kbEur(k.betrag)}</b></div>`).join('')}</div>`:`<div class="note">Noch kein Katalog. <button class="lnk" id="kbKatDef">Standard-Katalog laden</button> (11 übliche Strafen, alles änderbar)</div>`}
        <div class="btnrow" style="margin-top:10px"><button class="btn ghost sm" id="kbCfg">${SVI('sliders')} Kasse einstellen</button></div></div></div>
    <div class="card"><div class="vrat-h"><h3 class="trh" style="margin:0">${SVI('clock')} Buchungen</h3><div class="trtabs sm">${[['offen','Offen'],['bewegung','Ein-/Ausgaben'],['alle','Alle']].map(([k,t])=>`<button class="${KB.kf===k?'on':''}" data-kf="${k}">${t}</button>`).join('')}</div></div>
      ${list.length?list.map(b=>{ const s=stat(b); return `<div class="kbb" data-bu="${b.id}"><b>${b.art==='einzahlung'?'➕ ':b.art==='ausgabe'?'➖ ':''}${svEsc(b.player_id?((trP(b.player_id)||{}).name||b.name||''):(b.art==='ausgabe'?'Ausgabe':'Einzahlung'))}</b><span>${svEsc(b.titel)} <small>${TRC.fmt(b.datum)}</small></span><em class="${b.art==='ausgabe'?'bad':''}">${b.art==='ausgabe'?'−':''}${kbEur(b.betrag)}</em><span class="trpill ${s[1]}">${s[0]}</span></div>`; }).join(''):'<div class="note">Keine Buchungen in dieser Ansicht.</div>'}
      <div class="note">Alle Spieler sehen Kassenstand, Katalog und alle Strafen über den Team-Link – volle Transparenz. Antippen ändert eine Buchung.</div></div>`;
  const upd=async(id,patch)=>{ const {error}=await SVB.sb.from('kasse_buchungen').update(patch).eq('id',id); if(error)return kToast('⚠️ '+error.message); await kbLoad(true); };
  B.querySelectorAll('[data-ok]').forEach(b=>b.onclick=()=>upd(b.dataset.ok,{status:'bezahlt',bezahlt_am:trToday()}));
  B.querySelectorAll('[data-back]').forEach(b=>b.onclick=()=>upd(b.dataset.back,{status:'offen',gemeldet_at:null}));
  const book=async L=>{ const rows=L.map(v=>({art:'strafe',player_id:v.pid,name:trP(v.pid).name,titel:v.titel,betrag:v.betrag,datum:v.datum,quelle:v.ref.split(':')[0]==='poll'?'abstimmung':'anwesenheit',ref:v.ref,notiz:v.why}));
    const {error}=await SVB.sb.from('kasse_buchungen').insert(rows); if(error)return kToast('⚠️ '+error.message); await kbLoad(true); kToast(`✓ ${rows.length} Strafe${rows.length>1?'n':''} gebucht`); };
  B.querySelectorAll('[data-vb]').forEach(b=>b.onclick=()=>book([V[+b.dataset.vb]]));
  B.querySelectorAll('[data-vi]').forEach(b=>b.onclick=()=>{ kbIgnore(V[+b.dataset.vi].ref); kbViewKasse(B); });
  const av=document.getElementById('kbAllV'); if(av)av.onclick=()=>{ if(confirm(`${Math.min(V.length,15)} Strafen buchen?`))book(V.slice(0,15)); };
  B.querySelectorAll('[data-kbp]').forEach(b=>b.onclick=()=>kbPlayerDetail(b.dataset.kbp));
  B.querySelectorAll('[data-kf]').forEach(b=>b.onclick=()=>{ KB.kf=b.dataset.kf; kbViewKasse(B); });
  B.querySelectorAll('[data-bu]').forEach(b=>b.onclick=()=>kbBuchEdit(b.dataset.bu));
  const kc=document.getElementById('kbCfg'), kc1=document.getElementById('kbCfg1'); if(kc)kc.onclick=kbCfgEditor; if(kc1)kc1.onclick=kbCfgEditor;
  const kk=document.getElementById('kbKat'); if(kk)kk.onclick=kbKatEditor;
  const kd=document.getElementById('kbKatDef'); if(kd)kd.onclick=async()=>{ const {error}=await SVB.sb.from('kasse_katalog').insert(KB_DEFAULT_KAT.map(([t,b,k],i)=>({titel:t,betrag:b,kategorie:k,sort:i}))); if(error)return kToast('⚠️ '+error.message); await kbLoad(true); kToast('✓ Standard-Katalog geladen – alles änderbar'); };
}
function kbPlayerDetail(pid){
  const p=trP(pid), L=KB.buch.filter(b=>b.player_id===pid);
  svModal(`<div class="mhead"><div class="rm-ic" style="width:46px;height:46px">${SVI('user')}</div><div><h2 style="margin:0">${svEsc(p?p.name:pid)}</h2><div class="msub">Mannschaftskasse</div></div></div><div id="kbPd"></div>`);
  const draw=()=>{ const E=document.getElementById('kbPd'); if(!E)return; const L=KB.buch.filter(b=>b.player_id===pid), off=L.filter(b=>b.status==='offen'||b.status==='gemeldet');
    E.innerHTML=`${L.map(b=>`<div class="kbb" data-bu="${b.id}"><b>${svEsc(b.titel)}</b><span>${TRC.fmt(b.datum)}${b.notiz?' · '+svEsc(b.notiz):''}</span><em>${kbEur(b.betrag)}</em><span class="trpill ${b.status==='bezahlt'?'ok':b.status==='erlassen'?'':'mid'}">${b.status}</span></div>`).join('')||'<div class="note">Keine Buchungen.</div>'}
      <div class="btnrow sbact">${off.length?`<button class="btn" id="kbPaid">Alles bezahlt (${kbEur(off.reduce((a,b)=>a+ +b.betrag,0))})</button>`:''}<button class="btn ghost" id="kbNew">${SVI('plus')} Strafe</button></div>`;
    E.querySelectorAll('[data-bu]').forEach(b=>b.onclick=()=>kbBuchEdit(b.dataset.bu,()=>kbPlayerDetail(pid)));
    const pd=document.getElementById('kbPaid'); if(pd)pd.onclick=async()=>{ const {error}=await SVB.sb.from('kasse_buchungen').update({status:'bezahlt',bezahlt_am:trToday()}).in('id',off.map(b=>b.id)); if(error)return kToast('⚠️ '+error.message); await kbLoad(true); draw(); kToast('✓ Als bezahlt verbucht'); };
    document.getElementById('kbNew').onclick=()=>{ closeOverlay(); kbStrafeEditor([pid]); };
  };
  draw();
}
function kbStrafeEditor(pre){
  const st={sel:new Set(pre||[]),kat:null,titel:'',betrag:'',datum:trToday(),notiz:'',art:'strafe'};
  svModal(`<div class="mhead"><div class="rm-ic" style="width:46px;height:46px">${SVI('plus')}</div><div><h2 style="margin:0">Strafe / Beitrag buchen</h2><div class="msub">Mehrere Spieler auf einmal möglich</div></div></div><div id="kbSe"></div>`);
  const draw=()=>{ const E=document.getElementById('kbSe'); if(!E)return; const all=kbSquadAll(), kat=KB.kat.filter(k=>k.aktiv);
    E.innerHTML=`${kat.length?`<div class="sbsec"><h4>Aus dem Katalog</h4><div class="chips">${kat.map(k=>`<button type="button" class="pchip${st.kat===k.id?' on':''}" data-k="${k.id}">${svEsc(k.titel)} · ${kbEur(k.betrag)}</button>`).join('')}</div></div>`:''}
      <div class="kbform"><div class="field"><label>Art</label><select id="kbArt"><option value="strafe"${st.art==='strafe'?' selected':''}>Strafe</option><option value="beitrag"${st.art==='beitrag'?' selected':''}>Beitrag</option></select></div>
        <div class="field"><label>Bezeichnung</label><input id="kbTi" maxlength="120" value="${svEsc(st.titel)}"></div><div class="field"><label>Betrag (€)</label><input id="kbBe" type="number" min="0.5" max="500" step="0.5" inputmode="decimal" value="${svEsc(String(st.betrag))}"></div>
        <div class="field"><label>Datum</label><input id="kbDa" type="date" value="${svEsc(st.datum)}"></div><div class="field kbwide"><label>Notiz</label><input id="kbNo" maxlength="300" value="${svEsc(st.notiz)}"></div></div>
      <div class="sbsec"><h4>Spieler <small>${st.sel.size} ausgewählt</small></h4><div class="chips kbchips">${all.map(x=>`<button type="button" class="pchip${st.sel.has(x.id)?' on':''}" data-pl="${svEsc(x.id)}">${svEsc(x.name)}</button>`).join('')}</div></div>
      <div class="btnrow sbact"><button class="btn" id="kbSv">Buchen</button><button class="btn ghost" id="kbCa">Abbrechen</button></div>`;
    const keep=()=>{ st.art=document.getElementById('kbArt').value; st.titel=document.getElementById('kbTi').value; st.betrag=document.getElementById('kbBe').value; st.datum=document.getElementById('kbDa').value; st.notiz=document.getElementById('kbNo').value; };
    E.querySelectorAll('[data-k]').forEach(b=>b.onclick=()=>{ keep(); const k=KB.kat.find(x=>x.id===b.dataset.k); st.kat=k.id; st.titel=k.titel; st.betrag=+k.betrag; if(/beitrag/i.test(k.kategorie||''))st.art='beitrag'; draw(); });
    E.querySelectorAll('[data-pl]').forEach(b=>b.onclick=()=>{ keep(); const k=b.dataset.pl; if(st.sel.has(k))st.sel.delete(k); else st.sel.add(k); draw(); });
    document.getElementById('kbCa').onclick=()=>closeOverlay();
    document.getElementById('kbSv').onclick=async()=>{ keep(); const be=Math.round(parseFloat(String(st.betrag).replace(',','.'))*100)/100;
      if(!st.titel.trim())return kToast('Bitte eine Bezeichnung angeben'); if(!(be>0&&be<=500))return kToast('Betrag zwischen 0,50 und 500 €'); if(!st.sel.size)return kToast('Bitte Spieler auswählen');
      const rows=[...st.sel].map(pid=>({art:st.art,player_id:pid,name:(trP(pid)||{}).name||null,titel:st.titel.trim(),betrag:be,datum:st.datum||trToday(),notiz:st.notiz.trim()||null,quelle:'hand'}));
      const {error}=await SVB.sb.from('kasse_buchungen').insert(rows); if(error)return kToast('⚠️ '+error.message); closeOverlay(); await kbLoad(true); kToast(`✓ ${rows.length}× gebucht`); };
  };
  draw();
}
function kbBuchEditor(){
  svModal(`<div class="mhead"><div class="rm-ic" style="width:46px;height:46px">${SVI('plus')}</div><div><h2 style="margin:0">Einnahme oder Ausgabe</h2><div class="msub">z.B. Spende, Kasten für die Kabine, Mannschaftsabend</div></div></div>
    <div class="kbform"><div class="field"><label>Art</label><select id="kbA2"><option value="ausgabe">Ausgabe</option><option value="einzahlung">Einnahme</option></select></div>
      <div class="field"><label>Wofür</label><input id="kbT2" maxlength="120" placeholder="z.B. Kasten Wasser"></div><div class="field"><label>Betrag (€)</label><input id="kbB2" type="number" min="0.5" max="5000" step="0.5" inputmode="decimal"></div>
      <div class="field"><label>Datum</label><input id="kbD2" type="date" value="${trToday()}"></div></div>
    <div class="btnrow sbact"><button class="btn" id="kbS2">Buchen</button><button class="btn ghost" id="kbC2">Abbrechen</button></div>`);
  document.getElementById('kbC2').onclick=()=>closeOverlay();
  document.getElementById('kbS2').onclick=async()=>{ const t=document.getElementById('kbT2').value.trim(), be=Math.round(parseFloat(String(document.getElementById('kbB2').value).replace(',','.'))*100)/100;
    if(!t)return kToast('Bitte angeben, wofür'); if(!(be>0&&be<=5000))return kToast('Betrag zwischen 0,50 und 5.000 €');
    const {error}=await SVB.sb.from('kasse_buchungen').insert({art:document.getElementById('kbA2').value,titel:t,betrag:be,datum:document.getElementById('kbD2').value||trToday(),status:'bezahlt',bezahlt_am:trToday(),quelle:'hand'});
    if(error)return kToast('⚠️ '+error.message); closeOverlay(); await kbLoad(true); kToast('✓ Gebucht'); };
}
function kbBuchEdit(id,back){
  const b=KB.buch.find(x=>x.id===id); if(!b)return;
  const who=b.player_id?((trP(b.player_id)||{}).name||b.name):(b.art==='ausgabe'?'Ausgabe':'Einnahme');
  svModal(`<div class="mhead"><div><h2 style="margin:0">${svEsc(b.titel)}</h2><div class="msub">${svEsc(who||'')} · ${TRC.fmt(b.datum)} · ${kbEur(b.betrag)}</div></div></div>
    <div class="btnrow sbact">${b.player_id?['offen','bezahlt','erlassen'].map(s=>`<button class="btn ${b.status===s?'':'ghost'}" data-st="${s}">${s==='offen'?'Offen':s==='bezahlt'?'Bezahlt':'Erlassen'}</button>`).join(''):''}
      <button class="btn ghost" id="kbDelB" style="margin-left:auto;color:#fca5a5">Löschen</button></div>`);
  const fin=async()=>{ await kbLoad(true); if(back)back(); else closeOverlay(); };
  document.querySelectorAll('#modal [data-st]').forEach(x=>x.onclick=async()=>{ const s=x.dataset.st; const {error}=await SVB.sb.from('kasse_buchungen').update({status:s,bezahlt_am:s==='bezahlt'?trToday():null,gemeldet_at:null}).eq('id',id); if(error)return kToast('⚠️ '+error.message); fin(); });
  document.getElementById('kbDelB').onclick=async()=>{ if(!confirm('Buchung löschen?'))return; const {error}=await SVB.sb.from('kasse_buchungen').delete().eq('id',id); if(error)return kToast('⚠️ '+error.message); fin(); };
}
function kbKatEditor(){
  svModal(`<div class="mhead"><div class="rm-ic" style="width:46px;height:46px">${SVI('book')}</div><div><h2 style="margin:0">Strafenkatalog</h2><div class="msub">Für alle Spieler sichtbar – am besten gemeinsam in der Mannschaft beschließen</div></div></div><div id="kbKe"></div>`);
  const draw=()=>{ const E=document.getElementById('kbKe'); if(!E)return;
    E.innerHTML=`${KB.kat.map(k=>`<div class="kbkrow" data-id="${k.id}"><input value="${svEsc(k.titel)}" maxlength="80" data-f="titel"><input type="number" min="0" max="500" step="0.5" value="${+k.betrag}" data-f="betrag"><label class="kbchk"><input type="checkbox" data-f="aktiv"${k.aktiv?' checked':''}> aktiv</label><button class="lnk" data-del="${k.id}">✕</button></div>`).join('')}
      <div class="kbkrow"><input id="kbNt" maxlength="80" placeholder="Neue Strafe, z.B. „Torwarthandschuhe vergessen“"><input id="kbNb" type="number" min="0" max="500" step="0.5" placeholder="€"><button class="btn sm" id="kbAdd">${SVI('plus')}</button></div>
      <div class="btnrow sbact"><button class="btn" id="kbKs">Speichern</button><button class="btn ghost" id="kbKc">Schließen</button></div>`;
    E.querySelectorAll('[data-del]').forEach(b=>b.onclick=async()=>{ const {error}=await SVB.sb.from('kasse_katalog').delete().eq('id',b.dataset.del); if(error)return kToast('⚠️ '+error.message); await kbLoad(true); draw(); });
    document.getElementById('kbAdd').onclick=async()=>{ const t=document.getElementById('kbNt').value.trim(), be=parseFloat(document.getElementById('kbNb').value); if(!t||!(be>=0))return kToast('Bitte Bezeichnung und Betrag');
      const {error}=await SVB.sb.from('kasse_katalog').insert({titel:t,betrag:Math.min(500,be),sort:KB.kat.length}); if(error)return kToast('⚠️ '+error.message); await kbLoad(true); draw(); };
    document.getElementById('kbKc').onclick=()=>closeOverlay();
    document.getElementById('kbKs').onclick=async()=>{ for(const r of E.querySelectorAll('.kbkrow[data-id]')){ const id=r.dataset.id, k=KB.kat.find(x=>x.id===id);
        const t=r.querySelector('[data-f=titel]').value.trim(), be=parseFloat(r.querySelector('[data-f=betrag]').value), ak=r.querySelector('[data-f=aktiv]').checked;
        if(t&&be>=0&&(t!==k.titel||be!==+k.betrag||ak!==k.aktiv)){ const {error}=await SVB.sb.from('kasse_katalog').update({titel:t,betrag:Math.min(500,be),aktiv:ak}).eq('id',id); if(error)return kToast('⚠️ '+error.message); } }
      await kbLoad(true); closeOverlay(); kToast('✓ Katalog gespeichert'); };
  };
  draw();
}
function kbCfgEditor(){
  const c=KB.cfg||{};
  svModal(`<div class="mhead"><div class="rm-ic" style="width:46px;height:46px">${SVI('sliders')}</div><div><h2 style="margin:0">Kasse einstellen</h2><div class="msub">Bezahlen per PayPal.me oder Überweisung – kostenlos</div></div></div>
    <div class="kbform"><div class="field"><label>PayPal.me-Name des Kassenwarts</label><input id="kcP" maxlength="40" value="${svEsc(c.paypal||'')}" placeholder="z.B. MaxMustermann (aus paypal.me/MaxMustermann)"></div>
      <div class="field"><label>Kassenwart</label><input id="kcK" maxlength="60" value="${svEsc(c.kassenwart||'')}" placeholder="Name"></div>
      <div class="field"><label>Anfangsbestand (€)</label><input id="kcA" type="number" step="0.5" value="${+c.anfang||0}"></div>
      <div class="field"><label>IBAN für Überweisung (optional)</label><input id="kcI" maxlength="42" value="${svEsc(c.iban||'')}" placeholder="DE.." autocomplete="off"></div>
      <div class="field"><label>Kontoinhaber</label><input id="kcO" maxlength="70" value="${svEsc(c.kontoinhaber||'')}" placeholder="Name"></div>
      <div class="field kbwide"><label>Hinweis für die Spieler (optional)</label><input id="kcH" maxlength="300" value="${svEsc(c.hinweis||'')}" placeholder="z.B. Bar geht auch – beim Kassenwart nach dem Training"></div></div>
    <div class="note">Die Spieler sehen einen „Mit PayPal bezahlen“-Knopf mit dem offenen Betrag und melden danach „Habe bezahlt“. Du bestätigst den Eingang – so bleibt alles nachvollziehbar. Stripe bräuchte ein Händlerkonto mit Gebühren je Zahlung und lohnt sich für eine Mannschaftskasse nicht.</div>
    <div class="btnrow sbact"><button class="btn" id="kcS">Speichern</button><button class="btn ghost" id="kcC">Abbrechen</button></div>`);
  document.getElementById('kcC').onclick=()=>closeOverlay();
  document.getElementById('kcS').onclick=async()=>{ let pp=document.getElementById('kcP').value.trim().replace(/^https?:\/\/(www\.)?paypal\.me\//i,'').replace(/\/.*$/,'');
    if(pp&&!/^[A-Za-z0-9._-]{2,40}$/.test(pp))return kToast('PayPal.me-Name: nur Buchstaben, Ziffern, Punkt, Minus');
    const iban=document.getElementById('kcI').value.replace(/\s+/g,'').toUpperCase();
    if(iban&&!kbIbanOk(iban))return kToast('Die IBAN scheint nicht zu stimmen – bitte prüfen');
    const {error}=await SVB.sb.from('kasse_cfg').update({paypal:pp||null,kassenwart:document.getElementById('kcK').value.trim()||null,anfang:+document.getElementById('kcA').value||0,hinweis:document.getElementById('kcH').value.trim()||null,iban:iban||null,kontoinhaber:document.getElementById('kcO').value.trim()||null}).eq('id',1);
    if(error)return kToast('⚠️ '+error.message); closeOverlay(); await kbLoad(true); kToast('✓ Gespeichert'); };
}

/* ----- Team-Link ----- */
async function kbViewLink(B){
  B.innerHTML='<div class="card"><div class="empty">Lade Link …</div></div>';
  try{ await kbLink(); }catch(e){ B.innerHTML=`<div class="card"><div class="empty">${svEsc(e.message)}</div></div>`; return; }
  const u=kbUrl();
  B.innerHTML=`<div class="card kblink"><h3 class="trh">${SVI('link')} Kabinen-Link für die Mannschaft</h3>
      <p>Ein Link für alles: Abstimmungen und Mannschaftskasse. Einmal in die WhatsApp-Gruppe posten – jeder Spieler tippt einmal seinen Namen an, danach reicht ein Klick. Kein Login, keine App-Installation.</p>
      <div class="kburl"><code>${svEsc(u)}</code></div>
      <div class="btnrow"><button class="btn" id="klWa">${SVI('share')} In WhatsApp teilen</button><button class="btn ghost" id="klCp">${SVI('copy')} Kopieren</button><button class="btn ghost" id="klOpen">${SVI('eye')} Ansehen wie ein Spieler</button></div></div>
    <div class="card"><h3 class="trh">${SVI('shield')} Sicherheit</h3><div class="note" style="margin-top:0">Wer den Link hat, sieht die Abstimmungen und die Kasse der Mannschaft (Namen, Strafen, Kassenstand) – aber nichts vom Scouting, keine Notizen, keine Kontakte. Nur in der Mannschaftsgruppe teilen.
      Wenn der Link in falsche Hände gerät: erneuern – der alte funktioniert dann sofort nicht mehr.</div>
      <button class="btn ghost sm" id="klNew" style="margin-top:10px;color:#fca5a5">${SVI('refresh')} Link erneuern</button></div>`;
  const bc=document.createElement('div'); bc.innerHTML=kbBotCard(); B.prepend(bc.firstElementChild); kbBotWire(B);
  document.getElementById('klWa').onclick=()=>kbWa(`⚽ Unsere Kabine: Abstimmungen fürs Training & Spiel und die Mannschaftskasse – ein Klick, kein Login.\nEinmal Namen antippen, fertig:\n${u}`);
  document.getElementById('klCp').onclick=()=>kbCopy(u);
  document.getElementById('klOpen').onclick=()=>window.open(u,'_blank','noopener');
  document.getElementById('klNew').onclick=async()=>{ if(!confirm('Neuen Link erzeugen? Der alte Link funktioniert danach nicht mehr – ihr müsst den neuen in die Gruppe posten.'))return; try{ await kbLink(true); kToast('✓ Neuer Link erzeugt'); kbViewLink(B); }catch(e){ kToast('⚠️ '+e.message); } };
}

/* ---------- Home: nächste Abstimmung ---------- */
function kbHomeCard(){
  const host=document.getElementById('svAct'); if(!host)return; let el=document.getElementById('kbHome');
  if(!canTraining()||!KB.loaded){ if(el)el.remove(); return; }
  const today=trToday(), p=KB.polls.filter(x=>x.datum>=today&&!x.geschlossen).sort((a,b)=>a.datum<b.datum?-1:1)[0];
  if(!p){ if(el)el.remove(); return; }
  if(!el){ el=document.createElement('div'); el.id='kbHome'; host.before(el); }
  const s=kbStat(p);
  const inv=!p.geteilt_at;
  el.innerHTML=`<div class="card kbhome${inv?' kbinv':''}" data-kbh><div><span class="trpill">${SVI('users')} ${inv?'Noch nicht in der Gruppe':'Abstimmung'}</span><b>${svEsc(kbPollTitle(p))}</b>${inv?'':`<small>${s.zu.length} dabei · ${s.ab.length} nicht · ${s.offen.length} offen${p.geteilt_von?' · geteilt von '+svEsc(p.geteilt_von.split(' ')[0]):''}</small>`}</div>
    ${inv?`<button class="btn sm" data-kbh-inv>${SVI('share')} Spieler einladen</button>`:`<div class="kbnum"><b class="ok">${s.zu.length}</b><b class="bad">${s.ab.length}</b><b>${s.offen.length}</b></div>`}</div>`;
  el.querySelector('[data-kbh]').onclick=e=>{ if(e.target.closest('[data-kbh-inv]'))return kbShare(p); KB.view='abst'; goTab('kabine'); };
}
{ const _si6=svInsights; svInsights=function(){ const base=_si6.apply(this,arguments), add=[];
  try{ if(KB.loaded&&canTraining()){ const today=trToday(); KB.polls.filter(p=>p.datum>=today&&!p.geschlossen&&TRC.diffDays(p.datum,today)<=3).forEach(p=>{ const s=kbStat(p);
      if(s.offen.length)add.push({prio:svRole()==='trainer'?0.3:3,lvl:TRC.diffDays(p.datum,today)<=1?'hoch':'mittel',t:`${s.offen.length} ohne Antwort: ${p.titel} (${kbWd(p.datum)})`,d:s.offen.slice(0,5).map(x=>x.name.split(' ')[0]).join(', ')+(s.offen.length>5?' …':'')+' – jetzt nachhaken',go:()=>{ KB.view='abst'; goTab('kabine'); }}); });
    const g=KB.buch.filter(b=>b.status==='gemeldet').length; if(g)add.push({prio:4,lvl:'info',t:`Kasse: ${g} Zahlung${g>1?'en':''} gemeldet`,d:'Eingang prüfen und bestätigen',go:()=>{ KB.view='kasse'; goTab('kabine'); }}); } }catch(e){}
  return add.concat(base).sort((a,b)=>a.prio-b.prio).slice(0,6); }; }
SV_ACTIONS.trainer.splice(2,0,['users','Abstimmung',()=>{ KB.view='abst'; goTab('kabine'); setTimeout(()=>kbPollEditor(null,kbSuggest()[0]),80); }]); SV_ACTIONS.trainer.length=4;
{ const _gt6=goTab; goTab=function(tab){ const r=_gt6.apply(this,arguments); try{ if(tab==='kabine')kbRender(); }catch(e){ console.warn(e); } return r; }; }
{ const _si7=svInit; svInit=function(){ const r=_si7.apply(this,arguments); setTimeout(()=>kbLoad(),1100); return r; }; }
SV_TABBAR.trainer=['home','training','kabine','elf'];

/* ---------- Einladen: Link in die Mannschaftsgruppe (einer teilt, alle sehen es) ---------- */
function kbShare(p){
  if(!p)return; const go=()=>{ kbWa(kbInviteText(p));
    if(!p.gesendet_at){ p.gesendet_at=new Date().toISOString(); SVB.sb.from('polls').update({gesendet_at:p.gesendet_at}).eq('id',p.id).then(()=>{}); }
    SVB.sb.rpc('kabine_geteilt',{p_poll:p.id}).then(r=>{ if(!r.error&&r.data){ p.geteilt_at=r.data.geteilt_at; p.geteilt_von=r.data.geteilt_von; } kbAfter(); }); };
  if(KB.link)return go();                                   // direkt aus dem Klick heraus – sonst blockt das Handy das WhatsApp-Fenster
  kbLink().then(go).catch(e=>kToast('⚠️ '+e.message));
}
// nächstes Training, das noch nicht in der Gruppe ist (heute bis übermorgen)
function kbInviteDue(){ const today=trToday();
  return KB.polls.filter(p=>p.art==='training'&&!p.geschlossen&&!p.geteilt_at&&p.datum>=today&&TRC.diffDays(p.datum,today)<=2).sort((a,b)=>a.datum<b.datum?-1:1)[0]||null; }
function kbPopup(){
  if(!KB.loaded||!KB.popup||!canTraining())return; const p=kbInviteDue(); if(!p)return;
  const k='kb_pop_'+p.id; let t=0; try{ t=+localStorage.getItem(k)||0; }catch(e){}
  if(Date.now()-t<3*3600e3||window.__kbPopShown===p.id)return;
  const g=document.getElementById('gate'); if(g&&!g.classList.contains('done'))return;
  if(document.querySelector('#overlay.open, .overlay.open, #modal.open'))return;
  window.__kbPopShown=p.id; const s=kbStat(p);
  svModal(`<div class="kbpop"><div class="kbpop-ic">${SVI('users')}</div><span class="trpill">Einladen</span><h2>Spieler zum Training einladen</h2>
    <div class="kbpop-when">${svEsc(kbWd(p.datum))}${p.zeit?' · '+svEsc(p.zeit)+' Uhr':''}${p.ort?' · '+svEsc(p.ort):''}</div>
    <p class="note">Der Abstimmungslink ist fertig. Einmal in die Mannschaftsgruppe stellen – jeder tippt seinen Vor- und Nachnamen an und sagt zu oder ab.${s.zu.length+s.ab.length?` Schon ${s.zu.length+s.ab.length} Antworten.`:''}</p>
    <button class="btn kbpop-go" id="kbPopGo">${SVI('share')} In die WhatsApp-Gruppe teilen</button>
    <div class="btnrow"><button class="btn ghost sm" id="kbPopCp">${SVI('copy')} Link kopieren</button><button class="btn ghost sm" id="kbPopDone">Hat schon jemand geteilt</button><button class="btn ghost sm" id="kbPopLater">Später</button></div>
    <p class="note small">Sobald einer von euch geteilt hat, verschwindet das Pop-up bei allen Trainern.</p></div>`);
  const later=()=>{ try{ localStorage.setItem(k,String(Date.now())); }catch(e){} closeOverlay(); };
  document.getElementById('kbPopGo').onclick=()=>{ kbShare(p); closeOverlay(); };
  document.getElementById('kbPopCp').onclick=async()=>{ try{ if(!KB.link)await kbLink(); await kbCopy(kbInviteText(p)); const r=await SVB.sb.rpc('kabine_geteilt',{p_poll:p.id}); if(!r.error&&r.data){ p.geteilt_at=r.data.geteilt_at; p.geteilt_von=r.data.geteilt_von; } closeOverlay(); kbAfter(); }catch(e){ kToast('⚠️ '+e.message); } };
  document.getElementById('kbPopDone').onclick=async()=>{ const r=await SVB.sb.rpc('kabine_geteilt',{p_poll:p.id}); if(r.error)return kToast('⚠️ '+r.error.message); p.geteilt_at=r.data.geteilt_at; p.geteilt_von=r.data.geteilt_von; closeOverlay(); kbAfter(); };
  document.getElementById('kbPopLater').onclick=later;
}
{ const _vc=document.addEventListener.bind(document); _vc('visibilitychange',()=>{ if(document.visibilityState==='visible'&&KB.loaded&&canTraining())kbLoad(true); }); }

/* ---------- Automatik: Trainings-Abstimmungen selbst anlegen + Link per WhatsApp an die Trainer ---------- */
const KB_WD=[[1,'Mo'],[2,'Di'],[3,'Mi'],[4,'Do'],[5,'Fr'],[6,'Sa'],[0,'So']];
function kbBotCard(){
  const c=KB.bot; if(!c)return '<div class="card"><div class="note">Automatik nicht verfügbar.</div></div>';
  const emp=(c.empfaenger||[]).concat([{name:'',tel:''},{name:'',tel:''}]).slice(0,Math.max(2,(c.empfaenger||[]).length+1)).slice(0,5);
  const ready=c.versand&&c.sc_channel&&c.sc_template&&(c.empfaenger||[]).length;
  return `<div class="card kbbot"><div class="vrat-h"><h3 class="trh" style="margin:0">${SVI('clock')} Automatik fürs Training</h3><label class="kbsw"><input type="checkbox" id="kbA_on"${c.aktiv?' checked':''}><span></span>${c.aktiv?'an':'aus'}</label></div>
    <p class="note" style="margin-top:6px">Die App legt die Abstimmung für jedes Training selbst an${ready?' und schickt den Link per WhatsApp an die Trainer – die leiten ihn nur noch in die Gruppe weiter':''}. Am Trainingstag kommt eine Liste, wer noch nicht geantwortet hat. Spieler können ihre Antwort bis zum Training jederzeit ändern.</p>
    <div class="kbform"><div class="field kbwide"><label>Trainingstage</label><div class="chips">${KB_WD.map(([n,t])=>`<button type="button" class="pchip${(c.tage||[]).includes(n)?' on':''}" data-wd="${n}">${t}</button>`).join('')}</div></div>
      <div class="field"><label>Uhrzeit Training</label><input id="kbA_z" value="${svEsc(c.zeit||'19:00')}" maxlength="5"></div><div class="field"><label>Ort (optional)</label><input id="kbA_o" value="${svEsc(c.ort||'')}" maxlength="120"></div>
      <div class="field"><label>Abstimmung verschicken</label><select id="kbA_v">${[0,1,2,3].map(n=>`<option value="${n}"${+c.vorlauf===n?' selected':''}>${n===0?'am Trainingstag':n===1?'1 Tag vorher':n+' Tage vorher'}</option>`).join('')}</select></div>
      <div class="field"><label>um</label><select id="kbA_s">${[7,8,9,10,11,12,14,16,18,20].map(n=>`<option value="${n}"${+c.stunde===n?' selected':''}>${n}:00 Uhr</option>`).join('')}</select></div>
      <div class="field"><label>Am Trainingstag nachhaken</label><select id="kbA_e"><option value="">nein</option>${[10,12,14,15,16,17].map(n=>`<option value="${n}"${c.erinnerung&&+c.erinnerung_stunde===n?' selected':''}>ja, um ${n}:00 Uhr</option>`).join('')}</select></div></div>
    <div class="sbsec"><h4>WhatsApp an die Trainer <small>über Superchat${ready?' · eingerichtet ✓':''}</small></h4>
      ${emp.map((e,i)=>`<div class="kbemp"><input data-en="${i}" placeholder="Name, z.B. Nico" value="${svEsc(e.name||'')}" maxlength="40"><input data-et="${i}" placeholder="Handy, z.B. 0171 1234567" value="${svEsc(e.tel||'')}" inputmode="tel" maxlength="20"></div>`).join('')}
      <div class="kbform"><div class="field"><label>Superchat Kanal-ID</label><input id="kbA_ch" value="${svEsc(c.sc_channel||'')}" placeholder="mc_…" maxlength="60"></div><div class="field"><label>Vorlagen-ID (WhatsApp-Vorlage mit 1 Text-Variable)</label><input id="kbA_tp" value="${svEsc(c.sc_template||'')}" placeholder="tn_…" maxlength="60"></div>
        <div class="field kbwide"><div class="note" style="margin:0">${c.versand==='n8n'?'✓ Versand läuft über euren n8n-Server – der Superchat-Zugang liegt dort, nicht in der App.':c.versand==='direkt'?'Versand direkt über Superchat.':'Versand noch nicht verbunden – wird über euren n8n-Server eingerichtet (wie die Geburtstagsgrüße).'}</div></div></div>
      <div class="note">Nachrichten außerhalb eines offenen Chats brauchen bei WhatsApp eine genehmigte Vorlage, z.B. „SV/BSC Kabine: {{1}}“ (Kategorie „Utility“). Die App setzt den Text mit Link in die Variable ein.</div></div>
    <div class="sbsec"><h4>Spieler einzeln per WhatsApp <small>${c.nummern||0} Nummern hinterlegt · diesen Monat ${c.monat||0} von max. ${c.max_monat||400} Nachrichten</small></h4>
      <label class="kbchk"><input type="checkbox" id="kbA_ee"${c.einzeln_erinnern?' checked':''}> Am Trainingstag nur die, die noch nicht geantwortet haben, persönlich erinnern <small>(günstig: meist 3–8 Nachrichten)</small></label>
      <label class="kbchk"><input type="checkbox" id="kbA_ei"${c.einzeln_einladen?' checked':''}> Jedem Spieler seinen persönlichen Link schicken <small>(ca. 30 Nachrichten je Training)</small></label>
      <div class="note">Jeder Spieler hat einen persönlichen Link: kein Namen-Suchen, ein Klick, nur für sich selbst. Meta berechnet je Vorlagen-Nachricht rund 4–5 Cent. Spieler können sich auf ihrer Seite selbst abmelden. Vorher kurz in der Mannschaft ankündigen.</div>
      <div class="field" style="margin-top:8px"><label>Vorlagen-ID für Spieler <small>– „Hallo {{1}}, kommst du {{2}} ins Training? Hier abstimmen: {{3}} Danke dir!“ (Vorname, wann, Link)</small></label><input id="kbA_tps" value="${svEsc(c.sc_template_spieler||'')}" placeholder="tn_… (leer = Trainer-Vorlage mit Freitext)" maxlength="60"></div>
      <button class="btn ghost sm" id="kbA_pl" style="margin-top:8px">${SVI('users')} Handynummern & persönliche Links</button></div>
    <div class="btnrow sbact"><button class="btn" id="kbA_save">Speichern</button>${ready?`<button class="btn ghost" id="kbA_test">${SVI('chat')} Testnachricht</button>`:''}<button class="btn ghost" id="kbA_run">${SVI('refresh')} Jetzt prüfen</button></div></div>`;
}
function kbBotWire(B){
  const c=KB.bot; if(!c)return; const tage=new Set(c.tage||[]);
  B.querySelectorAll('[data-wd]').forEach(b=>b.onclick=()=>{ const n=+b.dataset.wd; if(tage.has(n))tage.delete(n); else tage.add(n); b.classList.toggle('on',tage.has(n)); });
  const sw=document.getElementById('kbA_on'); if(sw)sw.onchange=()=>{ sw.parentElement.lastChild.textContent=sw.checked?'an':'aus'; };
  const save=async(quiet)=>{ const emp=[]; B.querySelectorAll('[data-et]').forEach(i=>{ const t=i.value.trim(), n=B.querySelector(`[data-en="${i.dataset.et}"]`).value.trim(); if(t)emp.push({name:n||'Trainer',tel:t}); });
    const e=document.getElementById('kbA_e').value;
    const p={aktiv:document.getElementById('kbA_on').checked,tage:[...tage],zeit:document.getElementById('kbA_z').value.trim(),ort:document.getElementById('kbA_o').value,vorlauf:+document.getElementById('kbA_v').value,stunde:+document.getElementById('kbA_s').value,
      erinnerung:!!e,erinnerung_stunde:e?+e:(+c.erinnerung_stunde||12),empfaenger:emp,sc_channel:document.getElementById('kbA_ch').value.trim(),sc_template:document.getElementById('kbA_tp').value.trim(),app_url:kbBase()};
    if(p.aktiv&&!p.tage.length){ kToast('Bitte mindestens einen Trainingstag wählen'); return false; }
    const {error}=await SVB.sb.rpc('kabine_bot_set',{p}); if(error){ kToast('⚠️ '+error.message); return false; }
    const ee=document.getElementById('kbA_ee'), ei=document.getElementById('kbA_ei'); if(ee&&ei){ const r2=await SVB.sb.rpc('kabine_bot_einzeln',{p_einladen:ei.checked,p_erinnern:ee.checked,p_template:(document.getElementById('kbA_tps')||{value:''}).value.trim()}); if(r2.error){ kToast('⚠️ '+r2.error.message); return false; } }
    const r=await SVB.sb.rpc('kabine_bot_get'); KB.bot=r.data; if(!quiet)kToast('✓ Automatik gespeichert'); kbViewLink(B); return true; };
  document.getElementById('kbA_save').onclick=()=>save();
  const pl=document.getElementById('kbA_pl'); if(pl)pl.onclick=()=>kbSpielerLinks();
  const call=async(body,btn)=>{ btn.disabled=true; try{ const {data,error}=await SVB.sb.functions.invoke('kabine-bot',{body}); if(error){ let t=error.message; try{ const x=await error.context.json(); if(x&&x.error)t=x.error; }catch(_){} throw new Error(t); } return data; }finally{ btn.disabled=false; } };
  const tb=document.getElementById('kbA_test'); if(tb)tb.onclick=async()=>{ try{ const d=await call({mode:'test'},tb); if(!d.ok&&d.error)throw new Error(d.error); kToast((d.ergebnis||[]).map(x=>x.name+(x.ok?' ✓':' ✗ '+(x.fehler||''))).join(' · ')||'Gesendet'); }catch(e){ kToast('⚠️ '+e.message); } };
  document.getElementById('kbA_run').onclick=async e=>{ const bt=e.currentTarget; if(!(await save(true)))return; try{ const d=await call({},document.getElementById('kbA_run')||bt); await kbLoad(true); kToast(d.aktiv===false?'Automatik ist aus':(d.log&&d.log.length?d.log.join(' · '):'Alles aktuell – nichts zu tun')); }catch(err){ kToast('⚠️ '+err.message); } };
}

/* ---------- Handynummern & persönliche Links ---------- */
async function kbSpielerLinks(){
  const all=kbSquadAll();
  svModal(`<div class="mhead"><div class="rm-ic" style="width:46px;height:46px">${SVI('users')}</div><div><h2 style="margin:0">Handynummern & persönliche Links</h2><div class="msub">Nur fürs Team sichtbar · Nummern werden nur für die Abstimmungs-Nachrichten genutzt</div></div></div><div id="kbPl"><div class="empty">Lade …</div></div>`);
  const {data,error}=await SVB.sb.rpc('kabine_spieler_get',{p_ids:all.map(p=>({id:p.id,name:p.name}))});
  const E=document.getElementById('kbPl'); if(!E)return; if(error){ E.innerHTML=`<div class="note">${svEsc(error.message)}</div>`; return; }
  const M=new Map((data||[]).map(x=>[x.id,x])), url=t=>((KB.bot&&KB.bot.link_url)||kbBase())+t;
  E.innerHTML=`<div class="kbpls">${all.map(p=>{ const x=M.get(p.id)||{}; return `<div class="kbplr"><b>${svEsc(p.name)}${p.kader===2?' <small>II</small>':''}${x.optout?' <span class="trpill mid">abgemeldet</span>':''}</b>
      <input data-tel="${svEsc(p.id)}" value="${svEsc(x.tel||'')}" placeholder="Handy" inputmode="tel" maxlength="20">
      <button class="btn ghost sm" data-cp="${svEsc(p.id)}" title="Persönlichen Link kopieren">${SVI('copy')}</button><button class="btn ghost sm" data-wa="${svEsc(p.id)}" title="Selbst per WhatsApp schicken">${SVI('share')}</button></div>`; }).join('')}</div>
    <div class="note">Tipp ohne Kosten: Mit ${SVI('share')} schickst du einem Spieler seinen persönlichen Link einmal selbst per WhatsApp – er speichert ihn und stimmt künftig mit einem Klick ab.</div>
    <div class="btnrow sbact"><button class="btn" id="kbPlS">Nummern speichern</button><button class="btn ghost" id="kbPlC">Schließen</button></div>`;
  E.querySelectorAll('[data-cp]').forEach(b=>b.onclick=()=>{ const x=M.get(b.dataset.cp); if(x)kbCopy(url(x.token)); });
  E.querySelectorAll('[data-wa]').forEach(b=>b.onclick=()=>{ const x=M.get(b.dataset.wa), p=trP(b.dataset.wa); if(!x)return; const tel=(E.querySelector(`[data-tel="${b.dataset.wa}"]`).value||'').replace(/[^0-9+]/g,'').replace(/^00/,'+').replace(/^0/,'+49').replace(/^\+/,'');
    const t=`Hi ${p.name.split(' ')[0]}, das ist dein persönlicher Kabinen-Link vom SV/BSC: Abstimmungen fürs Training mit einem Klick (und die Mannschaftskasse). Bitte speichern und nicht weitergeben: ${url(x.token)}`;
    window.open((tel?'https://wa.me/'+tel:'https://wa.me/')+'?text='+encodeURIComponent(t),'_blank','noopener'); });
  document.getElementById('kbPlC').onclick=()=>closeOverlay();
  document.getElementById('kbPlS').onclick=async()=>{ const rows=[]; E.querySelectorAll('[data-tel]').forEach(i=>{ const id=i.dataset.tel, x=M.get(id)||{}; if((i.value||'').trim()!==(x.tel||''))rows.push({id,name:(trP(id)||{}).name||id,tel:i.value.trim()}); });
    if(!rows.length){ closeOverlay(); return; }
    const {error}=await SVB.sb.rpc('kabine_spieler_set',{p:rows}); if(error)return kToast('⚠️ '+error.message);
    closeOverlay(); kToast(`✓ ${rows.length} Nummer${rows.length>1?'n':''} gespeichert`); const r=await SVB.sb.rpc('kabine_bot_get'); KB.bot=r.data; if(KB.view==='link')kbRender(); };
}

/* IBAN-Prüfsumme (Modulo 97) – fängt Tippfehler ab */
function kbIbanOk(i){ if(!/^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$/.test(i))return false; const r=(i.slice(4)+i.slice(0,4)).replace(/[A-Z]/g,c=>String(c.charCodeAt(0)-55)); let m=0; for(const ch of r)m=(m*10+(+ch))%97; return m===1; }

/* ================= INIT ================= */
renderWeights();
initLineupSeed();
renderAll();
try{tkInit();}catch(e){}
try{appInit();}catch(e){}
try{svInit();}catch(e){console.error('svInit',e);}