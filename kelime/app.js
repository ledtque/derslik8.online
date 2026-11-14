/* Word Hoard on derslik8.online/kelime
   Words: kelimeler.json next to this page (add new words there; they join the end of the roadmap).
   Login: Google via the site's Firebase project; only OWNER may use it.
   Sync: Firestore document kelime/{uid}; localStorage keeps a copy for fast start. */
const OWNER = "yigitsakal@gmail.com";
const TRACKS = {power:"Power words",rare:"Rare gems",idiom:"Idioms",slang:"Slang"};
const STAGE_NAMES = {1:"Sharp Everyday",2:"Advanced",3:"Proficient",4:"Connoisseur"};
const MAX_REVIEW=20, CHUNK=5, INTERVALS=[1,2,4,9,20,45];
const LEVELS=[[0,"Word Curious"],[300,"Phrase Hunter"],[1000,"Idiom Wrangler"],[2500,"Silver Tongue"],[5000,"Wordsmith"],[10000,"Lexicon Royalty"],[20000,"Sesquipedalian"]];

const $=s=>document.querySelector(s); const app=$("#app");
const esc=s=>String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const shuffle=a=>{a=a.slice();for(let i=a.length-1;i>0;i--){const j=Math.random()*(i+1)|0;[a[i],a[j]]=[a[j],a[i]]}return a};
const exHTML=e=>esc(e).replace(/\*(.+?)\*/g,"<em>$1</em>");
const exBlank=e=>esc(e).replace(/\*(.+?)\*/g,'<span class="blank">&nbsp;</span>');
const dk=d=>{const z=n=>String(n).padStart(2,"0");return d.getFullYear()+"-"+z(d.getMonth()+1)+"-"+z(d.getDate())};
const today=()=>dk(new Date());
const dn=k=>Math.round(Date.parse(k+"T12:00:00Z")/864e5);
const tnum=()=>dn(today());
const addDays=(k,n)=>{const d=new Date(k+"T12:00:00");d.setDate(d.getDate()+n);return dk(d)};
const flame='<svg viewBox="0 0 24 24" fill="var(--gold)" aria-hidden="true"><path d="M12 2c1 4-3 6-3 10a3 3 0 0 0 6 0c0-1-.5-2-1-3 3 1 5 4 5 7a7 7 0 0 1-14 0c0-6 7-8 7-14z"/></svg>';
const star='<svg viewBox="0 0 24 24" fill="var(--accent)" aria-hidden="true"><path d="M12 2l3 7 7 .6-5.3 4.6 1.7 7.3L12 17.8 5.6 21.5l1.7-7.3L2 9.6 9 9z"/></svg>';
function speak(text){try{const u=new SpeechSynthesisUtterance(text);u.lang="en-US";u.rate=.9;speechSynthesis.cancel();speechSynthesis.speak(u)}catch(e){}}

/* ---------------- WORDS ---------------- */
let ITEMS=[],BYID={},POOL={},STAGES=[];
async function loadWords(){
  const r=await fetch("kelimeler.json",{cache:"no-cache"}); if(!r.ok) throw new Error("words "+r.status);
  const j=await r.json();
  ITEMS=j.words.map(w=>({id:w[1].toLowerCase(),t:w[0],w:w[1],d:w[2],e:w[3],s:w[4]}));
  BYID=Object.fromEntries(ITEMS.map(x=>[x.id,x])); POOL={}; ITEMS.forEach(x=>(POOL[x.t]=POOL[x.t]||[]).push(x));
  STAGES=[]; ITEMS.forEach(x=>{let s=STAGES.find(z=>z.n===x.s); if(!s){s={n:x.s,name:STAGE_NAMES[x.s]||("Stage "+x.s),ids:[]};STAGES.push(s)} s.ids.push(x.id)});
  STAGES.sort((a,b)=>a.n-b.n);
}

/* ---------------- STATE ---------------- */
const KEY="kelime.state.v1";
const fresh=()=>({cards:{},xp:0,streak:0,best:0,last:null,days:0,pace:15,updated:0});
let S=fresh(), uid=null, cloud=null;
function readLocal(u){try{const j=JSON.parse(localStorage.getItem(KEY+":"+u)); if(j&&j.cards) return Object.assign(fresh(),j)}catch(e){} return null}
function writeLocal(){try{localStorage.setItem(KEY+":"+uid,JSON.stringify(S))}catch(e){}}
let saving=false,pending=false;
async function flush(){ if(!cloud) return; if(saving){pending=true;return} saving=true;
  try{await cloud.save(S); setSync("ok")}catch(e){console.warn("[kelime] save failed",e); setSync("err")}
  saving=false; if(pending){pending=false;flush()} }
function save(){S.updated=Date.now(); writeLocal(); flush();}
let syncState="";
function setSync(s){syncState=s; const el=$("#sync"); if(el) el.dataset.s=s;}
function applyRemote(remote){
  if(remote&&(remote.updated||0)>(S.updated||0)){S=Object.assign(fresh(),remote); writeLocal(); return true}
  if(remote==null||(remote.updated||0)<(S.updated||0)) { if(S.updated) flush(); }
  return false;
}

/* ---------------- DERIVED ---------------- */
const learned=()=>Object.keys(S.cards).filter(id=>BYID[id]);
const nextNew=n=>{const out=[];for(const x of ITEMS){if(!S.cards[x.id]){out.push(x.id);if(out.length>=n)break}}return out};
const dueIds=()=>{const t=tnum();return learned().filter(id=>S.cards[id][1]<=t).sort((a,b)=>S.cards[a][1]-S.cards[b][1])};
function liveStreak(){ if(!S.last) return 0; const t=today(); return (S.last===t||S.last===addDays(t,-1))?S.streak:0; }
function level(xp){let i=0;LEVELS.forEach((l,k)=>{if(xp>=l[0])i=k});const cur=LEVELS[i],nx=LEVELS[i+1];return{name:cur[1],n:i+1,from:cur[0],to:nx?nx[0]:null}}
function curStage(){for(const s of STAGES){if(s.ids.some(id=>!S.cards[id])) return s} return STAGES[STAGES.length-1]}

/* ---------------- SCREENS ---------------- */
let view="home", filter="all", search="", session=null, keyHandler=null;
document.addEventListener("keydown",e=>keyHandler&&keyHandler(e));
function render(){ if(!uid) return; if(view==="home") home(); else if(view==="words") words(); }
function header(){return `<div class="top"><div class="brand"><i></i>Word Hoard</div>
 <div class="stats"><span class="pill" title="Total XP">${star}${S.xp} XP</span><button class="pill acct" id="acct" title="Sign out"><span id="sync" data-s="${syncState}"></span>Sign out</button></div></div>`}
function bindHeader(){ $("#acct").onclick=()=>cloud&&cloud.signOut(); }

function gate(kind,msg){
  keyHandler=null;
  const body = kind==="loading"?`<div class="spin" aria-hidden="true"></div><p>Loading…</p>`
   : kind==="denied"?`<h2>This page is private</h2><p>You're signed in as <b>${esc(msg)}</b>, which doesn't have access.</p><button class="btn" id="out">Sign out</button>`
   : kind==="error"?`<h2>Something went wrong</h2><p>${esc(msg)}</p><button class="btn" id="retry">Try again</button>`
   : `<h2>Word Hoard</h2><p>Your daily English vocabulary. Sign in to continue.</p><button class="btn" id="in">Sign in with Google</button>${msg?`<p class="err">${esc(msg)}</p>`:""}`;
  app.innerHTML=`<section class="gate"><div class="brand"><i></i>Word Hoard</div>${body}</section>`;
  $("#in")&&($("#in").onclick=()=>cloud.signIn());
  $("#out")&&($("#out").onclick=()=>cloud.signOut());
  $("#retry")&&($("#retry").onclick=()=>location.reload());
}

function home(){
  const t=today(), doneToday=S.last===t, due=dueIds(), nNew=S.pace, fresh=nextNew(nNew);
  const lv=level(S.xp), pct=lv.to?((S.xp-lv.from)/(lv.to-lv.from)*100):100;
  const st=curStage(), si=STAGES.indexOf(st), total=ITEMS.length, have=learned().length;
  const reviewN=Math.min(due.length,MAX_REVIEW), mins=Math.max(3,Math.round(fresh.length*.5+reviewN*.2));
  const peekItem=BYID[fresh[0]];
  let eyebrow, heroTitle, heroSub, btns;
  if(!fresh.length){
    eyebrow="All words unlocked"; heroTitle=reviewN?`${reviewN} words to review`:"You've learned every word";
    heroSub=`That's all ${total.toLocaleString()} words in the list. Ask Claude to add a new batch and it will show up here.`;
    btns=reviewN&&!doneToday?`<button class="btn inv" id="go">Start review</button>`:`<button class="btn inv" id="bonus" ${have<4?"disabled":""}>Practise</button>`;
  } else if(!doneToday){
    eyebrow=`Day ${S.days+1} · Stage ${si+1}`; heroTitle=`${fresh.length} new words are waiting`;
    heroSub=`${reviewN?`Plus ${reviewN} review${reviewN===1?"":"s"}. `:""}About ${mins} minutes.`;
    btns=`<button class="btn inv" id="go">Start session</button>`;
  } else {
    eyebrow="Today's done"; heroTitle="Streak secured";
    heroSub=`Still hungry? Unlock ${fresh.length} more words now, or practise the ones you know.`;
    btns=`<button class="btn inv" id="more">Learn ${fresh.length} more</button><button class="btn line" id="bonus" ${have<4?"disabled":""}>Practise</button>`;
  }
  const peek=peekItem?`<div class="peek"><span class="label">${doneToday?"Next up":"First word"}</span><b>${esc(peekItem.w)}</b><span>${TRACKS[peekItem.t]}</span></div>`:"";
  const segs=STAGES.map((s,i)=>{const got=s.ids.filter(id=>S.cards[id]).length;
    return `<div class="seg ${i===si?"cur":""}"><div class="segbar"><i style="width:${got/s.ids.length*100}%"></i></div><b>${s.name}</b><span>${got}/${s.ids.length}</span></div>`}).join("");
  const counts=Object.keys(TRACKS).map(t=>{const n=learned().filter(id=>BYID[id].t===t).length;return `<div class="trk"><i class="sw t-${t}"></i><span>${TRACKS[t]}</span><b>${n}</b></div>`}).join("");
  const left=total-have;
  app.innerHTML=header()+`
  <section class="hero"><span class="label">${eyebrow}</span><h2>${heroTitle}</h2><p>${heroSub}</p>
   <div class="row">${btns}</div>${peek}</section>
  <section class="tiles">
   <div class="tile"><b class="fl">${flame}${liveStreak()}</b><span>day streak</span></div>
   <div class="tile"><b>${have.toLocaleString()}</b><span>words learned</span></div>
   <div class="tile wide"><span class="label">Level ${lv.n}</span><b class="lvname">${lv.name}</b><div class="bar gold"><i style="width:${pct}%"></i></div><span>${lv.to?`${S.xp} / ${lv.to} XP`:`${S.xp} XP`}</span></div>
  </section>
  <section class="panel"><div class="lvl"><h3>Roadmap</h3><small>${have.toLocaleString()} of ${total.toLocaleString()} words</small></div>
   <div class="segs">${segs}</div><div class="trks">${counts}</div>
   <button class="link" id="words">Browse your word collection →</button></section>
  <section class="settings"><span>New words a day</span><div class="tabs">${[10,15,20,30].map(p=>`<button class="tab" data-p="${p}" aria-pressed="${S.pace===p}">${p}</button>`).join("")}</div>
   <small>${left?`The rest of the list in about ${Math.ceil(left/S.pace)} days at this pace`:"Every word in the list is unlocked"}</small></section>
  <p class="foot">Best streak ${S.best} days · <button id="reset">Reset progress</button></p>`;
  bindHeader();
  $("#go")?.addEventListener("click",()=>startSession("daily"));
  $("#more")?.addEventListener("click",()=>startSession("extra"));
  $("#bonus")?.addEventListener("click",()=>startSession("bonus"));
  $("#words").addEventListener("click",()=>{view="words";render()});
  $("#reset").addEventListener("click",confirmReset);
  app.querySelectorAll("[data-p]").forEach(b=>b.onclick=()=>{S.pace=+b.dataset.p;save();render()});
}
function confirmReset(){
  const f=$(".foot"); f.innerHTML=`Erase all progress on every device? <button id="yes">Yes, erase</button> · <button id="no">Keep it</button>`;
  $("#yes").onclick=()=>{const p=S.pace;S=fresh();S.pace=p;save();render()}; $("#no").onclick=render;
}

function words(){
  const q=search.toLowerCase();
  const ids=learned().filter(id=>(filter==="all"||BYID[id].t===filter)&&(!q||BYID[id].w.toLowerCase().includes(q)||BYID[id].d.toLowerCase().includes(q))).sort((a,b)=>BYID[a].w.localeCompare(BYID[b].w));
  const shown=ids.slice(0,300);
  app.innerHTML=header()+`<div class="row"><button class="btn ghost" id="back">← Home</button></div>
  <section class="panel"><h2 style="font-size:1.6rem;margin-bottom:12px">Word collection</h2>
  <input id="srch" class="srch" type="search" placeholder="Search your words" value="${esc(search)}" aria-label="Search your words">
  <div class="tabs" style="margin-top:10px">${["all",...Object.keys(TRACKS)].map(t=>`<button class="tab" aria-pressed="${filter===t}" data-f="${t}">${t==="all"?"All":TRACKS[t]}</button>`).join("")}</div>
  <div class="list" style="margin-top:8px">${shown.length?shown.map(id=>{const x=BYID[id],b=S.cards[id][0];
   return `<div class="item"><div><b class="t-${x.t}">${esc(x.w)}</b><p>${esc(x.d)}</p><p><i>${exHTML(x.e)}</i></p></div><div class="mast" title="Mastery">${[1,2,3,4,5].map(k=>`<i class="${b>=k?"on":""}"></i>`).join("")}</div></div>`}).join("")
   :`<p class="note">${learned().length?"No words match.":"Words you learn show up here. Finish today's session to add your first ones."}</p>`}</div>
   ${ids.length>300?`<p class="note">Showing 300 of ${ids.length}. Search to find the rest.</p>`:""}</section>`;
  bindHeader();
  $("#back").onclick=()=>{view="home";render()};
  const s=$("#srch"); s.oninput=()=>{search=s.value;words();const n=$("#srch");n.focus();n.setSelectionRange(n.value.length,n.value.length)};
  app.querySelectorAll(".tab").forEach(b=>b.onclick=()=>{filter=b.dataset.f;words()});
}

/* ---------------- SESSION ---------------- */
function pickType(){const r=Math.random();return r<.4?"meaning":r<.75?"blank":"reverse"}
function startSession(kind){
  let newIds=[], rev=[];
  if(kind==="bonus") rev=shuffle(learned()).slice(0,12);
  else { newIds=nextNew(S.pace); if(kind==="daily") rev=dueIds().slice(0,MAX_REVIEW); if(!newIds.length&&!rev.length) return; }
  const steps=[], revQ=shuffle(rev), chunks=[];
  for(let i=0;i<newIds.length;i+=CHUNK) chunks.push(newIds.slice(i,i+CHUNK));
  if(!chunks.length) chunks.push([]);
  const per=Math.ceil(revQ.length/chunks.length);
  chunks.forEach((c,ci)=>{ c.forEach(id=>steps.push({k:"learn",id})); shuffle([...c,...revQ.slice(ci*per,(ci+1)*per)]).forEach(id=>steps.push({k:"quiz",id,type:pickType()})); });
  session={kind,newIds,rev,steps,i:0,firstWrong:new Set(),correct:0,attempts:0,combo:0,bestCombo:0,xp:0};
  view="session"; next();
}
function next(){ const s=session; if(s.i>=s.steps.length) return finish(); const st=s.steps[s.i]; st.k==="learn"?learnCard(st):askQ(st); }
function progressBar(){const s=session;return `<div class="sesshead"><button class="x" id="quit" aria-label="Quit session">×</button><div class="bar"><i style="width:${s.i/s.steps.length*100}%"></i></div></div>`}
function bindQuit(){$("#quit").onclick=()=>{keyHandler=null;session=null;view="home";render()}}
function learnCard(st){
  const s=session,x=BYID[st.id], n=s.newIds.indexOf(st.id)+1;
  app.innerHTML=`<div class="sess">`+progressBar()+`<section class="card learn"><div class="row" style="justify-content:space-between"><span class="chip t-${x.t}">${TRACKS[x.t]}</span><span class="label">New word ${n}/${s.newIds.length}</span></div>
   <div class="term t-${x.t}">${esc(x.w)}</div><div class="row"><button class="speak" id="sp">▶ Hear it</button></div>
   <div class="def">${esc(x.d)}</div><div class="ex">${exHTML(x.e)}</div></section>
   <div class="dock"><button class="btn" id="nx">${s.steps[s.i+1]?.k==="learn"?"Got it, next":"Got it, quiz me"}</button></div></div>`;
  bindQuit(); $("#sp").onclick=()=>speak(x.w);
  keyHandler=e=>{if(e.key==="Enter"){e.preventDefault();$("#nx")?.click()}};
  $("#nx").onclick=()=>{s.i++;next()};
}
function distractors(x,key){
  const out=[], seen=new Set([x[key].toLowerCase()]), pool=POOL[x.t]||[];
  for(let tries=0;tries<80&&out.length<3;tries++){const o=pool[Math.random()*pool.length|0]; if(o&&o.id!==x.id&&!seen.has(o[key].toLowerCase())){seen.add(o[key].toLowerCase());out.push(o)}}
  return out;
}
function askQ(st){
  const s=session, x=BYID[st.id]; let prompt, key;
  if(st.type==="meaning"){prompt=`What does this mean?<span class="big t-${x.t}">${esc(x.w)}</span>`;key="d"}
  else if(st.type==="blank"){prompt=`Fill the gap:<span class="sub">${exBlank(x.e)}</span>`;key="w"}
  else {prompt=`Which ${x.t==="idiom"?"idiom":x.t==="slang"?"slang term":"word"} means…<span class="sub">“${esc(x.d)}”</span>`;key="w"}
  const opts=shuffle([x,...distractors(x,key)]);
  app.innerHTML=`<div class="sess">`+progressBar()+`<section class="card"><div class="row" style="justify-content:space-between"><span class="chip t-${x.t}">${TRACKS[x.t]}</span>${s.combo>=2?`<span class="combo">${s.combo} in a row</span>`:""}</div>
   <div class="q">${prompt}</div>
   <div class="opts">${opts.map((o,i)=>`<button class="opt" data-id="${esc(o.id)}"><kbd>${i+1}</kbd><span>${esc(o[key])}</span></button>`).join("")}</div></section><div class="dock" id="fb"><p class="hint">Choose an answer</p></div></div>`;
  bindQuit();
  const btns=[...app.querySelectorAll(".opt")];
  btns.forEach(b=>b.onclick=()=>answer(b,btns,x));
  keyHandler=e=>{const n=+e.key; if(n>=1&&n<=btns.length&&!btns[0].disabled) btns[n-1].click()};
}
function answer(btn,btns,x){
  const s=session, ok=btn.dataset.id===x.id; btns.forEach(b=>{b.disabled=true; if(b.dataset.id===x.id) b.classList.add("right")});
  s.attempts++;
  if(ok){ s.combo++; s.bestCombo=Math.max(s.bestCombo,s.combo); s.xp+=10+Math.min(s.combo-1,5)*2; s.correct++; }
  else { btn.classList.add("wrong"); s.combo=0; s.firstWrong.add(x.id); s.steps.push({k:"quiz",id:x.id,type:pickType()}); }
  const cheers=["Nailed it!","Spot on!","Brilliant!","Yes!","Sharp!","Smooth.","Exactly."];
  const fb=$("#fb"); fb.classList.add(ok?"ok":"no"); fb.innerHTML=`<div class="feedback"><h3>${ok?cheers[Math.random()*cheers.length|0]+(s.combo>=3?` <span class="combo">· ×${s.combo} combo</span>`:""):"Not quite. You'll see it again soon."}</h3>
   <div><b class="t-${x.t}">${esc(x.w)}</b>: ${esc(x.d)}</div><div class="note"><i>${exHTML(x.e)}</i></div>
   <button class="btn" id="cont">Continue</button></div>`;
  keyHandler=e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();$("#cont")?.click()}};
  $("#cont").onclick=()=>{s.i++;next()};
  $("#cont").focus({preventScroll:true});
}
function finish(){
  keyHandler=null; const s=session, t=today(), tn=tnum();
  new Set([...s.newIds,...s.rev]).forEach(id=>{const had=S.cards[id], c=had?had.slice():[0,tn]; const wrong=s.firstWrong.has(id);
    if(s.kind==="bonus"){ if(wrong) c[0]=Math.max(0,c[0]-1); }
    else { c[0]=wrong?0:(had?Math.min(c[0]+1,5):1); c[1]=tn+INTERVALS[c[0]]; }
    S.cards[id]=c});
  if(s.kind==="daily"&&S.last!==t){ S.streak=(S.last===addDays(t,-1))?S.streak+1:1; S.days++; S.last=t; }
  S.best=Math.max(S.best,S.streak);
  const quizN=s.steps.filter(x=>x.k==="quiz").length;
  const bonusXP=s.firstWrong.size===0&&quizN>0?25:0; S.xp+=s.xp+bonusXP; save();
  const acc=s.attempts?Math.round(s.correct/s.attempts*100):100;
  const mastered=learned().filter(id=>S.cards[id][0]>=4).length;
  app.innerHTML=`<div class="sess"><section class="card result"><span class="label">${s.kind==="bonus"?"Bonus round":s.kind==="extra"?"Extra words":"Session complete"}</span>
   <h2 style="font-size:2rem">${acc===100?"Flawless!":acc>=80?"Great session!":"Well fought!"}</h2>
   <div class="big">+${s.xp+bonusXP} XP</div>${bonusXP?`<div class="note">Includes a +25 perfect-round bonus</div>`:""}
   <div class="grid3"><div><b>${acc}%</b><span>accuracy</span></div><div><b>${liveStreak()}</b><span>day streak</span></div><div><b>${s.bestCombo}</b><span>best combo</span></div></div>
   ${s.newIds.length?`<div class="plan" style="justify-content:center">${s.newIds.map(id=>`<span class="chip t-${BYID[id].t}">${esc(BYID[id].w)}</span>`).join("")}</div>`:""}
   <div class="note">${learned().length.toLocaleString()} words learned · ${mastered} mastered. Missed words come back sooner.</div>
   <button class="btn" id="home">Back home</button></section></div>`;
  $("#home").onclick=()=>{session=null;view="home";render()}; $("#home").focus();
  if(acc>=80) confetti();
}
function confetti(){
  if(matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const c=$("#confetti"); c.hidden=false; const x=c.getContext("2d"); const W=c.width=innerWidth, H=c.height=innerHeight;
  const cs=getComputedStyle(document.documentElement); const cols=["--power","--rare","--idiom","--slang","--gold"].map(v=>cs.getPropertyValue(v).trim());
  const P=Array.from({length:120},()=>({x:W/2,y:H*.35,vx:(Math.random()-.5)*12,vy:Math.random()*-12-3,r:Math.random()*6+4,c:cols[Math.random()*5|0],a:Math.random()*6}));
  let f=0; (function tick(){x.clearRect(0,0,W,H); P.forEach(p=>{p.vy+=.35;p.x+=p.vx;p.y+=p.vy;p.a+=.2;x.save();x.translate(p.x,p.y);x.rotate(p.a);x.fillStyle=p.c;x.fillRect(-p.r/2,-p.r/4,p.r,p.r/2);x.restore()});
    if(++f<110) requestAnimationFrame(tick); else {x.clearRect(0,0,W,H); c.hidden=true}})();
}

/* ---------------- FIREBASE ---------------- */
gate("loading");
const wordsReady=loadWords();
const FB="https://www.gstatic.com/firebasejs/12.16.0/";
let mods;
try{
  mods=await Promise.all([import(FB+"firebase-app.js"),import(FB+"firebase-auth.js"),import(FB+"firebase-firestore.js")]);
}catch(e){ gate("error","Couldn't load the sign-in system. Check your connection or ad blocker, then try again."); throw e; }
const [{initializeApp},{getAuth,GoogleAuthProvider,signInWithPopup,signInWithRedirect,getRedirectResult,signOut,onAuthStateChanged},{getFirestore,doc,getDoc,setDoc,onSnapshot}]=mods;
const fbApp=initializeApp({
  apiKey:"AIzaSyC1X6QrbqUaHevdPbeE_GiN34i3PBOXVq0",
  authDomain:"derslik8-online.firebaseapp.com",
  projectId:"derslik8-online",
  storageBucket:"derslik8-online.firebasestorage.app",
  messagingSenderId:"691814192695",
  appId:"1:691814192695:web:070dc72b80a191634dd1b2"
});
const auth=getAuth(fbApp), db=getFirestore(fbApp), provider=new GoogleAuthProvider();
provider.setCustomParameters({login_hint:OWNER});
getRedirectResult(auth).catch(e=>console.warn("[kelime] redirect",e&&e.code));
let unsub=null;
cloud={
  async signIn(){ try{await signInWithPopup(auth,provider)}catch(e){ if(e&&e.code==="auth/popup-closed-by-user") return; try{await signInWithRedirect(auth,provider)}catch(e2){gate("signin","Sign-in didn't start: "+(e2&&e2.code||e2))} } },
  async signOut(){ try{await signOut(auth)}catch(e){} },
  async save(state){ await setDoc(doc(db,"kelime",uid),JSON.parse(JSON.stringify(state))); }
};
onAuthStateChanged(auth, async user=>{
  if(unsub){unsub();unsub=null}
  if(!user){ uid=null; gate("signin"); return; }
  if((user.email||"").toLowerCase()!==OWNER){ uid=null; gate("denied",user.email||"this account"); return; }
  uid=user.uid; S=readLocal(uid)||fresh();
  try{ await wordsReady; }catch(e){ gate("error","Couldn't load the word list. Try again in a moment."); return; }
  view="home"; render();
  unsub=onSnapshot(doc(db,"kelime",uid), snap=>{
    setSync("ok");
    const changed=applyRemote(snap.exists()?snap.data():null);
    if(changed&&!session) render();
  }, err=>{ console.warn("[kelime] sync",err&&err.code); setSync("err"); });
});
