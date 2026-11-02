"use strict";
/* 作り方（コース）ごとの工程。最後の工程は必ず「完成」。
   以前のプラモ（作り方なし）は、当時の工程と同じ「全塗装」として扱う。 */
const COURSES={
  gk:     {label:"ガレキ",           steps:["未開封","検品済","洗浄","仮組","サフ","塗装","完成"]},
  suguri: {label:"素組み",           steps:["未開封","パーツ確認","組立","完成"]},
  bubun:  {label:"部分塗装・スミ入れ", steps:["未開封","パーツ確認","組立","スミ入れ・部分塗装","トップコート","完成"]},
  zentoso:{label:"全塗装",           steps:["未開封","パーツ確認","仮組","表面処理","サフ","塗装","完成"]},
  kaizo:  {label:"改造",             steps:["未開封","パーツ確認","仮組","改造","表面処理","サフ","塗装","完成"]},
};
const PM_COURSES=["suguri","bubun","zentoso","kaizo"];
const STEPS=COURSES.gk.steps;
const isPM=k=>k?.kind==="plamo";
const courseOf=k=>isPM(k)?(PM_COURSES.includes(k.course)?k.course:"zentoso"):"gk";
const stepsOf=k=>COURSES[courseOf(k)].steps;
const lastStep=k=>stepsOf(k).length-1;
const isDone=k=>k.status>=lastStep(k);
const STEP_ALIAS={"検品済":"パーツ確認","パーツ確認":"検品済","組立":"仮組","仮組":"組立"};
/* 種類や作り方を変えたとき、今の工程と記録を名前で新しい工程に合わせる。
   同じ名前がなければ、それより前の工程で新しい工程にもあるものに合わせる（未開封は全コース共通） */
function mapStep(oldSteps,i,newSteps){
  for(let j=Math.min(i,oldSteps.length-1);j>=0;j--){
    const n=oldSteps[j];let x=newSteps.indexOf(n);if(x<0&&STEP_ALIAS[n])x=newSteps.indexOf(STEP_ALIAS[n]);
    if(j===oldSteps.length-1)return newSteps.length-1;
    if(x>=0)return Math.min(x,newSteps.length-2);
  }
  return 0;
}
function changeCourse(k,kind,course){
  const from=stepsOf(k);const nk={...k,kind,course:kind==="plamo"?course:undefined};const to=stepsOf(nk);
  if(from===to)return nk;
  const cur=Number(k.status)||0;
  nk.history=(k.history||[]).map(e=>{const n=e.n||from[e.s];let x=to.indexOf(n);if(x<0&&STEP_ALIAS[n])x=to.indexOf(STEP_ALIAS[n]);return {...e,n,s:x}});
  /* 今の工程は、記録の中で新しい工程にもある一番新しいものに合わせる（行って戻したときに元の工程に戻るように）。
     記録がなければ名前で合わせる。完成していたものは完成のまま、完成していなければ完成にはしない */
  const last=Math.max(0,from.length-1), nlast=to.length-1;
  /* 記録の最後が今の工程と一致しているとき（ふつうの状態）だけ記録を使う。
     編集画面で工程を変えた直後など一致しないときは、今の工程の名前で合わせる */
  let st=-1;
  if(cur>=last)st=nlast;
  else{
    const ol=(k.history||[]).slice().reverse().find(e=>e.s>=0);
    const consistent=ol&&ol.s===cur;
    if(consistent){for(let i=nk.history.length-1;i>=0;i--){if(nk.history[i].s>=0){st=Math.min(nk.history[i].s,nlast-1);break}}}
  }
  nk.status=st>=0?st:mapStep(from,cur,to);
  return nk;
}
const KINDS=[["gk","ガレキ"],["plamo","プラモ"]];
const MATERIALS=["レジン（キャスト）","レジン（3Dプリント）","ソフビ","メタル","その他"];
const $=s=>document.querySelector(s);
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const uid=()=>(crypto.randomUUID?crypto.randomUUID():Date.now().toString(36)+Math.random().toString(36).slice(2,10));
const ymd=d=>d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
const today=()=>ymd(new Date());
const ls={get(k){try{return localStorage.getItem(k)}catch(_){return null}},set(k,v){try{localStorage.setItem(k,v)}catch(_){}}};
function daysSince(s){if(!s)return null;const t=Date.parse(s+"T00:00:00");if(isNaN(t))return null;return Math.max(0,Math.floor((Date.now()-t)/864e5))}
function ageLabel(k){if(isDone(k))return "完成";if(!k.bought)return "購入日不明";const d=daysSince(k.bought);if(d==null)return "";if(d>=365)return "積み "+Math.floor(d/365)+"年"+Math.floor(d%365/30)+"ヶ月";if(d>=30)return "積み "+Math.floor(d/30)+"ヶ月";return "積み "+d+"日"}
function stepsBar(n,len=7){const done=n>=len-1;return `<div class="steps${done?" done":""}" style="grid-template-columns:repeat(${len},1fr)" aria-hidden="true">${Array.from({length:len},(_,i)=>`<i class="${i<=n?"on":""}"></i>`).join("")}</div>`}
function pill(k){const n=k.status;return `<span class="pill ${isDone(k)?"s6":n>=2?"wip":""}">${stepsOf(k)[n]??""}</span>`}
const DAY=864e5;
const fmtDate=t=>ymd(new Date(t));
/* 工程の記録：進めたら追加、「1つ戻す」は直前の記録を取り消す */
function withStatus(k,s){
  const h=Array.isArray(k.history)?k.history.slice():[];
  if(s===k.status)return {...k,history:h};
  if(s<k.status){
    /* 戻すときは、今の工程の記録と、戻した先の工程より後に付いた記録（作り方を変える前の工程など）を取り消す */
    let idx=-1;for(let i=h.length-1;i>=0;i--){if(h[i].s===k.status){idx=i;break}}
    if(idx>=0)h.splice(idx);
    let j=-1;for(let i=h.length-1;i>=0;i--){if(h[i].s===s){j=i;break}}
    if(j>=0)h.splice(j+1);
    let lm=null;for(let i=h.length-1;i>=0;i--){if(h[i].s>=0){lm=h[i];break}}
    if(!lm||lm.s!==s)h.push({s,at:Date.now(),n:stepsOf(k)[s]});
  }
  else h.push({s,at:Date.now(),n:stepsOf(k)[s]});
  return {...k,status:s,history:h};
}
function daysLabel(ms){const d=Math.floor(ms/DAY);return d<1?"1日未満":d+"日"}
function logBox(k){
  const h=(k.history||[]).map((e,i)=>({...e,i}));
  if(!h.length)return `<div class="box"><h3>工程の記録</h3><p style="margin:0">工程を進めると、その日付がここに自動で記録されます。</p></div>`;
  const rows=h.slice().reverse().map(e=>{
    const next=h[e.i+1];const span=(next?next.at:Date.now())-e.at;
    const name=stepsOf(k)[e.s]??e.n??"";const fin=name==="完成";
    const off=!(e.s>=0);
    const dur=off?"今の作り方にない工程":fin&&!next?"":(next?`${daysLabel(span)}`:(e.s===k.status?`継続中・${daysLabel(span)}`:""));
    return `<li class="${fin?"s6":""}${off?" off":""}"><span class="dot" aria-hidden="true"></span><span class="st">${esc(name)}<span class="dur">${dur}</span></span><input type="date" data-log="${e.i}" value="${fmtDate(e.at)}" aria-label="${esc(name)}になった日"></li>`}).join("");
  const first=h[0], end=isDone(k)?h[h.length-1].at:Date.now();
  const total=h.length>1||k.status!==first.s?`<span class="sub">記録開始から${daysLabel(end-first.at)}</span>`:"";
  return `<div class="box"><h3>工程の記録${total}</h3><ul class="log">${rows}</ul><p style="margin:6px 0 0;font-size:12px">日付をタップすると修正できます。</p></div>`;
}
function toast(m,ms=2200){const t=$("#toast");t.textContent=m;t.hidden=false;clearTimeout(toast._t);toast._t=setTimeout(()=>t.hidden=true,ms)}

/* ---------- 端末内の保存先（IndexedDB） ---------- */
const store=(()=>{
  let dbp=null;
  function open(){
    if(dbp)return dbp;
    dbp=new Promise((res,rej)=>{
      const r=indexedDB.open("garekichou",1);
      r.onupgradeneeded=()=>{const d=r.result;if(!d.objectStoreNames.contains("kits"))d.createObjectStore("kits",{keyPath:"id"});if(!d.objectStoreNames.contains("photos"))d.createObjectStore("photos")};
      r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);
    });
    return dbp;
  }
  async function tx(name,mode,fn){
    const d=await open();
    return new Promise((res,rej)=>{
      const t=d.transaction(name,mode);const s=t.objectStore(name);let out;
      const r=fn(s);if(r)r.onsuccess=()=>{out=r.result};
      t.oncomplete=()=>res(out);t.onerror=()=>rej(t.error);t.onabort=()=>rej(t.error);
    });
  }
  return{
    allKits:()=>tx("kits","readonly",s=>s.getAll()),
    putKit:k=>tx("kits","readwrite",s=>s.put(k)).then(r=>{scheduleSync();return r}),
    putKitRaw:k=>tx("kits","readwrite",s=>s.put(k)),
    delKit:id=>tx("kits","readwrite",s=>s.delete(id)),
    clearAll:async()=>{await tx("kits","readwrite",s=>s.clear());await tx("photos","readwrite",s=>s.clear())},
    getPhoto:id=>tx("photos","readonly",s=>s.get(id)),
    putPhoto:(id,b)=>tx("photos","readwrite",s=>s.put(b,id)),
    delPhoto:id=>tx("photos","readwrite",s=>s.delete(id)),
  };
})();
const urls={};
async function ensureUrls(ids){
  for(const id of ids){
    if(urls[id])continue;
    try{const b=await store.getPhoto(id);if(b)urls[id]=URL.createObjectURL(b)}catch(_){}
  }
}
const src=id=>urls[id]||"";
async function removePhoto(id){try{await store.delPhoto(id)}catch(_){}if(urls[id]){URL.revokeObjectURL(urls[id]);delete urls[id]}}
async function askPersist(){try{if(navigator.storage?.persist&&!(await navigator.storage.persisted()))await navigator.storage.persist()}catch(_){}}

let kits=[], loaded=false, filter=ls.get("f")||"all", failed=false;
async function refresh(){
  try{
    kits=(await store.allKits()).filter(k=>!k.deleted).map(k=>{const x={...k,status:Number(k.status)||0};x.status=Math.min(Math.max(0,x.status),lastStep(x));return x});
    await ensureUrls(kits.flatMap(k=>k.photos||[]));
  }catch(e){failed=true}
  loaded=true;render();
  if(wide||(curId&&!$("#detail").hidden))renderDetail();
}

/* ---------- 一覧 ---------- */
function group(k){return isDone(k)?"done":k.status<=1?"todo":"wip"}
let kindFilter=ls.get("kf")||"all";
const kindOf=k=>isPM(k)?"plamo":"gk";
function render(){
  const total=kits.length, done=kits.filter(isDone).length;
  $("#stock").innerHTML=loaded?`積み <b>${total-done}</b>・完成 <b>${done}</b>`:"読み込み中…";
  const hasPM=kits.some(isPM);
  if(!hasPM&&kindFilter!=="all")kindFilter="all";
  const inKind=kits.filter(k=>kindFilter==="all"||kindOf(k)===kindFilter);
  const counts={all:inKind.length,todo:0,wip:0,done:0};inKind.forEach(k=>counts[group(k)]++);
  const defs=[["all","すべて"],["todo","未着手"],["wip","作業中"],["done","完成"]];
  const kinds=hasPM?`<span class="kindseg" role="group" aria-label="種類">${[["all","全部"],...KINDS].map(([v,l])=>`<button class="chip kchip" data-kf="${v}" aria-pressed="${kindFilter===v}">${l}</button>`).join("")}</span>`:"";
  $("#chips").innerHTML=kinds+defs.map(([v,l])=>`<button class="chip" data-f="${v}" aria-pressed="${filter===v}">${l}<span class="num">${counts[v]}</span></button>`).join("");
  const q=$("#q").value.trim().toLowerCase(), sort=$("#sort").value;
  let rows=inKind.filter(k=>filter==="all"||group(k)===filter)
    .filter(k=>!q||[k.name,k.dealer,k.sculptor,k.grade,k.event,k.place,k.material].join(" ").toLowerCase().includes(q));
  rows.sort((a,b)=>sort==="name"?(a.name||"").localeCompare(b.name||"","ja"):
    sort==="new"?(b.bought||"").localeCompare(a.bought||""):(a.bought||"0000").localeCompare(b.bought||"0000"));
  const list=$("#list");
  if(!loaded){list.innerHTML="";return}
  if(failed){list.innerHTML=`<div class="notice">このブラウザでは端末内にデータを保存できませんでした。プライベートブラウズを使っている場合は、通常のタブで開いてください。</div>`;return}
  let html="";
  const last=Number(ls.get("lastBackup")||0);
  if(total&&Date.now()-last>30*864e5)html+=`<div class="remind"><span>${last?"最後のバックアップから30日以上たっています。":"まだバックアップがありません。"}</span><button class="btn" data-open-backup>保存する</button></div>`;
  if(!total){list.innerHTML=html+`<div class="empty">まだキットがありません。<br>「＋ キットを登録」から、箱の写真と一緒に1つ目を追加しましょう。<br><br>前の機種のバックアップがある場合は、右上の「バックアップ」から読み込めます。</div>`;return}
  if(!rows.length){list.innerHTML=html+`<div class="empty">条件に合うキットはありません。</div>`;return}
  list.innerHTML=html+rows.map(k=>{
    const d=daysSince(k.bought), old=!isDone(k)&&d!=null&&d>=365;
    const sub=(isPM(k)?[k.dealer,k.grade,k.scale]:[k.dealer,k.sculptor&&("原型 "+k.sculptor),k.scale]).filter(Boolean).join(" ／ ");
    const p=k.photos?.[0];
    return `<button class="card" data-id="${esc(k.id)}" ${wide&&k.id===curId?'aria-current="true"':""}>
      <div class="thumb">${p&&src(p)?`<img src="${src(p)}" alt="">`:"写真なし"}</div>
      <div class="meta">
        <div class="name">${esc(k.name||"名称未入力")}</div>
        ${sub?`<div class="sub">${esc(sub)}</div>`:""}
        <div class="row">${isPM(k)?`<span class="kindtag">プラモ</span>`:""}${pill(k)}<span class="age ${old?"old":""}">${ageLabel(k)}</span></div>
        ${stepsBar(k.status,stepsOf(k).length)}
      </div></button>`}).join("");
}
$("#chips").addEventListener("click",e=>{
  const kb=e.target.closest("[data-kf]");if(kb){kindFilter=kb.dataset.kf;ls.set("kf",kindFilter);render();return}
  const b=e.target.closest("[data-f]");if(!b)return;filter=b.dataset.f;ls.set("f",filter);render()});
$("#q").addEventListener("input",render);
$("#sort").addEventListener("change",()=>{ls.set("s",$("#sort").value);render()});
$("#list").addEventListener("click",e=>{if(e.target.closest("[data-open-backup]"))return openBackup();const c=e.target.closest(".card");if(c)openDetail(c.dataset.id)});
$("#fab").addEventListener("click",()=>openEditor(null));
$("#openBackup").addEventListener("click",()=>{if(sync.linked&&sync.state==="needtap")connect();else openBackup()});
{const s=ls.get("s");if(s)$("#sort").value=s}

/* ---------- 詳細 ---------- */
let curId=null;
const wideMQ=matchMedia("(min-width:960px)");let wide=wideMQ.matches;
function openDetail(id){curId=id;renderDetail();$("#detail").hidden=false;$("#detail").scrollTop=0;if(wide)render()}
function closeDetail(){curId=null;if(wide){renderDetail();render()}else $("#detail").hidden=true}
function onWideChange(){wide=wideMQ.matches;if(wide){$("#detail").hidden=false;renderDetail()}else if(!curId)$("#detail").hidden=true;render()}
wideMQ.addEventListener?wideMQ.addEventListener("change",onWideChange):wideMQ.addListener(onWideChange);
function renderOverview(){
  const el=$("#detail");
  if(!loaded){el.innerHTML="";return}
  if(!kits.length){el.innerHTML=`<div class="wrap"><div class="overview"><h2>ようこそ</h2><p class="lead">「＋ キットを登録」から、箱の写真と一緒に1つ目を追加しましょう。前の機種やスマホのバックアップがある場合は、左上の「バックアップ」から読み込めます。</p></div></div>`;return}
  const kindsHere=KINDS.filter(([v])=>kits.some(k=>kindOf(k)===v));
  /* ガレキは工程ごと、プラモは作り方で工程が違うので「未着手・作業中・完成」でまとめる */
  const countRow=([v,l])=>{const ks=kits.filter(k=>kindOf(k)===v);
    const cells=v==="plamo"?[["未着手",ks.filter(k=>group(k)==="todo").length],["作業中",ks.filter(k=>group(k)==="wip").length],["完成",ks.filter(isDone).length]]
      :COURSES.gk.steps.map((s,i)=>[s,ks.filter(k=>k.status===i).length]);
    return `${kindsHere.length>1?`<h3 class="ovk">${l}</h3>`:""}<div class="stepcount" style="grid-template-columns:repeat(${cells.length},minmax(0,1fr))">${cells.map(([s,c])=>`<div class="${c?"":"zero"}"><b>${c}</b><span>${s}</span></div>`).join("")}</div>`};
  const old=kits.filter(k=>!isDone(k)&&daysSince(k.bought)!=null).sort((a,b)=>(a.bought||"").localeCompare(b.bought||"")).slice(0,6);
  el.innerHTML=`<div class="wrap"><div class="overview">
    <div><h2>積みの状況</h2><p class="lead">左の一覧からキットを選ぶと、ここに詳細が表示されます。<span class="kbd">↑</span> <span class="kbd">↓</span> でも移動できます。</p></div>
    <div style="display:grid;gap:8px">${kindsHere.map(countRow).join("")}</div>
    ${old.length?`<div class="box"><h3>長く積んでいるキット</h3><ul class="oldlist">${old.map(k=>{const p=k.photos?.[0];return `<li><button type="button" data-open="${esc(k.id)}"><span class="t">${p&&src(p)?`<img src="${src(p)}" alt="">`:""}</span><span class="n">${esc(k.name)}</span><span class="d ${daysSince(k.bought)>=365?"":"fresh"}">${ageLabel(k)}</span></button></li>`}).join("")}</ul></div>`:""}
  </div></div>`;
}
function renderDetail(){
  const k=kits.find(x=>x.id===curId);if(!k){if(wide){curId=null;renderOverview()}else closeDetail();return}
  const price=k.price!=null&&k.price!==""?"¥"+Number(k.price).toLocaleString("ja-JP"):"";
  const fields=(isPM(k)
    ?[["種類","プラモ"],["作り方",COURSES[courseOf(k)].label],["メーカー",k.dealer],["シリーズ・グレード",k.grade],["スケール",k.scale],["購入店",k.event],["購入日",k.bought],["価格",price],["保管場所",k.place]]
    :[["ディーラー",k.dealer],["原型師",k.sculptor],["スケール",k.scale],["素材",k.material],["入手",k.event],["購入日",k.bought],["価格",price],["保管場所",k.place]]).filter(f=>f[1]);
  const ps=(k.photos||[]).filter(src);
  $("#detail").innerHTML=`<div class="wrap">
    <div class="bar"><button class="btn ghost" data-a="close">← 一覧</button><h2>${esc(k.name)}</h2><button class="btn" data-a="edit">編集</button></div>
    <div class="detail-cols">
    <div class="gallery">${ps.length?`<img class="main" id="mainph" src="${src(ps[0])}" alt="${esc(k.name)}の写真">${ps.length>1?`<div class="thumbs">${ps.map((p,i)=>`<button type="button" data-ph="${esc(p)}" aria-pressed="${i===0}" aria-label="写真${i+1}を表示"><img src="${src(p)}" alt=""></button>`).join("")}</div>`:""}`:`<div class="none">写真はまだありません</div>`}</div>
    <div style="display:grid;gap:16px;min-width:0">
    <div><p class="dname">${esc(k.name||"名称未入力")}</p><div class="row" style="margin-top:6px">${pill(k)}<span class="age">${ageLabel(k)}</span></div></div>
    <div class="advance">${stepsBar(k.status,stepsOf(k).length)}
      <div class="stepnames" style="grid-template-columns:repeat(${stepsOf(k).length},minmax(0,1fr))">${stepsOf(k).map((s,i)=>`<span class="${i===k.status?"cur":""}">${s}</span>`).join("")}</div>
      <div class="row" style="justify-content:space-between">
        <button class="btn" data-a="back" ${k.status===0?"disabled":""}>1つ戻す</button>
        <button class="btn primary" data-a="next" ${isDone(k)?"disabled":""}>${isDone(k)?"完成済み":"「"+stepsOf(k)[k.status+1]+"」に進める"}</button></div>
    </div>
    ${logBox(k)}
    ${fields.length?`<div class="box"><dl>${fields.map(([a,b])=>`<dt>${a}</dt><dd class="${/価格|購入日/.test(a)?"num":""}">${esc(b)}</dd>`).join("")}</dl></div>`:""}
    ${k.check?`<div class="box"><dl><dt>${isPM(k)?"パーツ確認メモ":"検品メモ"}</dt><dd>${esc(k.check)}</dd></dl></div>`:""}
    ${k.memo?`<div class="box"><dl><dt>メモ</dt><dd>${esc(k.memo)}</dd></dl></div>`:""}
    <button class="btn wide" data-a="copy">コピーして新しく登録</button>
    <div id="del"><button class="btn danger" data-a="askdel">このキットを削除</button></div>
    </div></div>
  </div>`;
}
$("#detail").addEventListener("change",async e=>{
  const inp=e.target.closest("[data-log]");if(!inp||!inp.value)return;
  const k=kits.find(x=>x.id===curId);if(!k)return;
  const h=(k.history||[]).slice();const i=+inp.dataset.log;if(!h[i])return;
  const t=Date.parse(inp.value+"T12:00:00");if(isNaN(t))return;
  h[i]={...h[i],at:t};
  try{await store.putKit({...k,history:h,updatedAt:Date.now()});await refresh();toast("日付を直しました")}catch(_){toast("保存できませんでした")}
});
$("#detail").addEventListener("click",async e=>{
  const op=e.target.closest("[data-open]");if(op){openDetail(op.dataset.open);return}
  const ph=e.target.closest("[data-ph]");if(ph){$("#mainph").src=src(ph.dataset.ph);ph.parentElement.querySelectorAll("button").forEach(b=>b.setAttribute("aria-pressed",b===ph));return}
  const a=e.target.closest("[data-a]")?.dataset.a;if(!a)return;
  const k=kits.find(x=>x.id===curId);
  if(a==="close")closeDetail();
  else if(a==="edit")openEditor(k);
  else if(a==="copy")openCopy(k);
  else if(a==="next"||a==="back"){const s=Math.min(lastStep(k),Math.max(0,k.status+(a==="next"?1:-1)));
    try{await store.putKit({...withStatus(k,s),updatedAt:Date.now()});await refresh();if(a==="next")toast(s>=lastStep(k)?"完成おめでとうございます":"「"+stepsOf(k)[s]+"」に進めました")}catch(_){toast("更新できませんでした")}}
  else if(a==="askdel"){$("#del").innerHTML=`<div class="confirm">写真も含めて削除します。元に戻せません。<button class="btn danger" data-a="del">削除する</button><button class="btn ghost" data-a="nodel">やめる</button></div>`}
  else if(a==="nodel")renderDetail();
  else if(a==="del"){try{await store.putKit({id:k.id,deleted:true,updatedAt:Date.now()});for(const p of k.photos||[])await removePhoto(p);closeDetail();await refresh();toast("削除しました")}catch(_){toast("削除できませんでした")}}
});

/* ---------- 登録・編集 ---------- */
let draft=null, newPhotos=[], removed=[], busy=0;
function openEditor(k){
  const kind=kindFilter!=="all"?kindFilter:(ls.get("lastKind")||"gk");
  draft=k?JSON.parse(JSON.stringify(k)):{kind,name:"",dealer:"",sculptor:"",grade:"",scale:"",material:"レジン（キャスト）",event:"",bought:today(),price:"",status:0,check:"",place:"",memo:"",photos:[]};
  if(!draft.kind)draft.kind="gk";
  if(isPM(draft)&&!PM_COURSES.includes(draft.course))draft.course=k?"zentoso":(ls.get("lastCourse")||"suguri");
  copying=false;newPhotos=[];removed=[];renderEditor();$("#editor").hidden=false;$("#editor").scrollTop=0;
}
/* 同じキットを複数買ったときなどに、内容を引き継いで新しく登録する。
   工程・工程の記録・検品メモは引き継がず、写真は別々に消せるよう複製する */
let copying=false;
const COPY_DROP=["id","createdAt","updatedAt","history","deleted"];
function copyDraft(k){
  const d=JSON.parse(JSON.stringify(k));for(const f of COPY_DROP)delete d[f];
  d.status=0;d.check="";d.photos=[];return d;
}
async function openCopy(k){
  draft=copyDraft(k);copying=true;newPhotos=[];removed=[];
  for(const id of k.photos||[]){
    try{const b=await store.getPhoto(id);if(!b)continue;const nid=uid();await store.putPhoto(nid,b);urls[nid]=URL.createObjectURL(b);draft.photos.push(nid);newPhotos.push(nid)}catch(_){}
  }
  renderEditor();$("#editor").hidden=false;$("#editor").scrollTop=0;
  toast("コピーしました。違うところを直して保存してください",3000);
}
const SUGGEST=["dealer","sculptor","grade","scale","place"];
function field(id,label,type="text",ph=""){return `<div class="f"><label for="e-${id}">${label}</label><input id="e-${id}" name="${id}" type="${type}" ${type==="number"?'inputmode="numeric" min="0"':""} ${SUGGEST.includes(id)?`list="dl-${id}" autocomplete="off"`:""} placeholder="${ph}" value="${esc(draft[id])}"></div>`}
/* 一度入力したディーラー・原型師・スケール・保管場所を、入力候補として出す（よく使うものから） */
function suggestLists(){
  return SUGGEST.map(id=>{
    const n=new Map();
    for(const k of kits){if(id!=="place"&&kindOf(k)!==draft.kind)continue;const v=String(k[id]||"").trim();if(v)n.set(v,(n.get(v)||0)+1)}
    const vals=[...n.entries()].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0],"ja")).map(e=>e[0]);
    return `<datalist id="dl-${id}">${vals.map(v=>`<option value="${esc(v)}"></option>`).join("")}</datalist>`;
  }).join("");
}
function renderEditor(){
  $("#editor").innerHTML=`<div class="wrap">
    <div class="bar"><button class="btn ghost" data-a="cancel">キャンセル</button><h2>${draft.id?"キットを編集":copying?"コピーして登録":"キットを登録"}</h2><button class="btn primary" data-a="save">保存</button></div>
    <form id="kitform" novalidate>
      <div class="kindtoggle" role="radiogroup" aria-label="種類">${KINDS.map(([v,l])=>`<button type="button" role="radio" data-kind="${v}" aria-checked="${draft.kind===v}">${l}</button>`).join("")}</div>
      <div class="f"><span class="flabel">写真</span><div class="photos" id="phs"></div></div>
      <div class="f"><label for="e-name">キット名（必須）</label><input id="e-name" name="name" required value="${esc(draft.name)}" placeholder="${isPM(draft)?"例：HG 〇〇〇":"例：〇〇 1/7 レジンキャストキット"}"></div>
      ${isPM(draft)?`<div class="two">${field("dealer","メーカー","text","バンダイ、コトブキヤ など")}${field("grade","シリーズ・グレード","text","HG、MG、30MS など")}</div>
      ${field("scale","スケール","text","1/144、ノンスケール等")}`:`<div class="two">${field("dealer","ディーラー/メーカー")}${field("sculptor","原型師")}</div>
      <div class="two">${field("scale","スケール","text","1/7、ノンスケール等")}
        <div class="f"><label for="e-material">素材</label><select id="e-material" name="material">${(draft.material&&!MATERIALS.includes(draft.material)?[draft.material,...MATERIALS]:MATERIALS).map(m=>`<option value="${esc(m)}" ${draft.material===m?"selected":""}>${esc(m==="レジン"?"レジン（種類を選んでください）":m)}</option>`).join("")}</select></div></div>`}
      ${isPM(draft)?`<div class="f"><label for="e-event">購入店</label><input id="e-event" name="event" type="text" placeholder="家電量販店、通販 など" value="${esc(draft.event)}"></div>`:`<div class="f"><label for="e-event">入手イベント・店</label><input id="e-event" name="event" type="text" placeholder="WF2026夏、通販 など" value="${esc(draft.event)}">
        <div class="evpick"><select id="e-evseries" aria-label="イベントを選ぶ"><option value="">主要イベントから選ぶ（購入日も入ります）</option>${eventGroups().map((g,i)=>`<option value="${i}">${esc(g.label)}</option>`).join("")}</select>
        <select id="e-evround" aria-label="開催回を選ぶ" hidden></select></div></div>`}
      <div class="two"><div class="f"><label for="e-bought">購入日</label><input id="e-bought" name="bought" type="date" value="${esc(draft.bought)}" ${draft.bought?"":"disabled"}>
          <label class="check"><input type="checkbox" id="e-bunk" ${draft.bought?"":"checked"}>分からない</label></div>
        ${field("price","価格（円）","number")}</div>
      ${isPM(draft)?`<div class="f"><span class="flabel">作り方</span><div class="seg" id="courseseg">${PM_COURSES.map(c=>`<button type="button" data-course="${c}" aria-pressed="${draft.course===c}">${COURSES[c].label}</button>`).join("")}</div>
        <span class="hint">作り方に合わせて工程が変わります。あとから変えても、記録した日付は残ります。</span></div>`:""}
      <div class="f"><span class="flabel">工程</span><div class="seg" id="seg">${stepsOf(draft).map((s,i)=>`<button type="button" data-s="${i}" aria-pressed="${draft.status===i}">${s}</button>`).join("")}</div></div>
      ${field("place","保管場所","text","押し入れ上段・箱3 など")}
      ${isPM(draft)?(draft.check?`<div class="f"><label for="e-check">パーツ確認メモ</label><textarea id="e-check" name="check">${esc(draft.check)}</textarea></div>`:""):`<div class="f"><label for="e-check">検品メモ</label><textarea id="e-check" name="check" placeholder="欠品・気泡・歪み、交換依頼の期限など">${esc(draft.check)}</textarea></div>`}
      <div class="f"><label for="e-memo">メモ</label><textarea id="e-memo" name="memo" placeholder="塗装プラン、改造アイデアなど">${esc(draft.memo)}</textarea></div>
      <p class="err" id="ferr" hidden></p>
      ${suggestLists()}
    </form></div>`;
  renderPhotos();
}
function renderPhotos(){
  const el=$("#phs");if(!el)return;
  el.innerHTML=draft.photos.map((p,i)=>`<div class="ph"><img src="${src(p)}" alt=""><button type="button" data-rm="${i}" aria-label="写真を外す">×</button></div>`).join("")
    +Array.from({length:busy},()=>`<div class="ph up">取り込み中…</div>`).join("")
    +`<div class="addph"><span aria-hidden="true">＋ 写真を追加<br>（複数可）</span><input id="e-file" type="file" accept="image/*" multiple aria-label="写真を追加"></div>`;
}
function readForm(){const f=$("#kitform");for(const n of ["name","dealer","sculptor","grade","scale","material","event","bought","price","place","check","memo"]){const el=f.elements[n];if(el)draft[n]=el.value.trim()}if(typeof draft.price==="string")draft.price=draft.price===""?"":Number(draft.price);if($("#e-bunk")?.checked)draft.bought=""}
/* 主要イベント＋自分が入力したことのあるイベントを、購入日つきで選べるようにする */
/* まずイベント名を選び、次に開催回を選ぶ2段階のリスト */
const SERIES=["ワンダーフェスティバル","となりのモケイフェスティバル","トレジャーフェスタ"];
let evGroupsCache=[];
function eventGroups(){
  const ev=typeof EVENTS!=="undefined"?EVENTS:[];
  const known=new Set(ev.map(e=>e[0]));
  const mine=new Map();
  for(const k of kits)if(k.event&&k.bought&&!known.has(k.event))mine.set(k.event+"|"+k.bought,[k.event,k.bought]);
  const groups=SERIES.map(s=>({label:s,prefix:s,list:ev.filter(e=>e[0].startsWith(s))}));
  if(mine.size)groups.push({label:"これまでに入力したイベント",prefix:"",list:[...mine.values()].sort((a,b)=>b[1].localeCompare(a[1])).slice(0,30)});
  evGroupsCache=groups.filter(g=>g.list.length);
  return evGroupsCache;
}
function roundLabel(g,[name,date]){
  let short=g.prefix?name.slice(g.prefix.length).replace(/^in/,""):name;
  if(g.prefix==="となりのモケイフェスティバル")short="第"+short.replace(/^(\d+)/,"$1回");
  const d=new Date(date+"T12:00:00");
  return `${short}　${d.getFullYear()}/${d.getMonth()+1}/${d.getDate()}（${"日月火水木金土"[d.getDay()]}）`;
}
async function shrink(file){
  try{
    const url=URL.createObjectURL(file);const img=new Image();img.src=url;await img.decode();
    const max=1600, s=Math.min(1,max/Math.max(img.naturalWidth,img.naturalHeight));
    const c=document.createElement("canvas");c.width=Math.round(img.naturalWidth*s);c.height=Math.round(img.naturalHeight*s);
    c.getContext("2d").drawImage(img,0,0,c.width,c.height);URL.revokeObjectURL(url);
    const b=await new Promise(r=>c.toBlob(r,"image/jpeg",.85));return b||file;
  }catch(_){return file}
}
$("#editor").addEventListener("change",async e=>{
  if(e.target.id==="e-bunk"){const b=$("#e-bought");b.disabled=e.target.checked;if(!e.target.checked&&!b.value)b.value=today();return}
  if(e.target.id==="e-evseries"){
    const r=$("#e-evround"),g=evGroupsCache[+e.target.value];
    if(!g){r.hidden=true;r.innerHTML="";return}
    r.innerHTML=`<option value="">${esc(g.label)}：開催回を選ぶ</option>`+g.list.map((x,i)=>`<option value="${i}">${esc(roundLabel(g,x))}</option>`).join("");
    r.hidden=false;try{r.showPicker?.()}catch(_){r.focus()}
    return;
  }
  if(e.target.id==="e-evround"){
    const g=evGroupsCache[+$("#e-evseries").value],x=g?.list[+e.target.value];if(!x)return;
    const [name,date]=x;
    const ev=$("#e-event"),b=$("#e-bought");ev.value=name;b.value=date;b.disabled=false;$("#e-bunk").checked=false;
    for(const el of [ev,b]){el.classList.remove("filled");void el.offsetWidth;el.classList.add("filled")}
    $("#e-evseries").value="";e.target.hidden=true;e.target.innerHTML="";
    toast(`${name}（${date.replace(/-/g,"/")}）を入れました`);return;
  }
  if(e.target.id!=="e-file")return;readForm();
  const files=[...e.target.files];busy+=files.length;renderPhotos();
  for(const f of files){
    try{const b=await shrink(f);const id=uid();await store.putPhoto(id,b);urls[id]=URL.createObjectURL(b);draft.photos.push(id);newPhotos.push(id)}
    catch(_){toast("写真を取り込めませんでした。端末の空き容量を確認してください")}
    busy--;renderPhotos();
  }
});
$("#editor").addEventListener("click",async e=>{
  const kd=e.target.closest("[data-kind]");if(kd){if(draft.kind===kd.dataset.kind)return;readForm();const nk=kd.dataset.kind;
    draft=changeCourse(draft,nk,nk==="plamo"?(ls.get("lastCourse")||"suguri"):undefined);ls.set("lastKind",nk);const st=$("#editor").scrollTop;renderEditor();$("#editor").scrollTop=st;return}
  const cs=e.target.closest("[data-course]");if(cs){if(draft.course===cs.dataset.course)return;readForm();
    draft=changeCourse(draft,"plamo",cs.dataset.course);ls.set("lastCourse",draft.course);const st=$("#editor").scrollTop;renderEditor();$("#editor").scrollTop=st;return}
  const s=e.target.closest("[data-s]");if(s){draft.status=+s.dataset.s;$("#seg").querySelectorAll("button").forEach(b=>b.setAttribute("aria-pressed",b===s));return}
  const rm=e.target.closest("[data-rm]");if(rm){readForm();removed.push(draft.photos.splice(+rm.dataset.rm,1)[0]);renderPhotos();return}
  const a=e.target.closest("[data-a]")?.dataset.a;
  if(a==="cancel"){for(const p of newPhotos)await removePhoto(p);$("#editor").hidden=true}
  if(a==="save")save();
});
$("#editor").addEventListener("submit",e=>{e.preventDefault();save()});
/* 編集内容を保存する形にする（工程の記録をつけ直す）。テストしやすいよう画面から切り離してある */
function applyEdit(prev,k){
  k={...k};
  if(!prev)k.history=[{s:k.status,at:Date.now(),n:stepsOf(k)[k.status]}];
  else{
    /* 種類・作り方を変えた場合は、元の記録を新しい工程に合わせてから比べる */
    const base=courseOf(prev)!==courseOf(k)?changeCourse(prev,k.kind,k.course):prev;
    k.history=base.history||[];
    if(base.status!==k.status)k.history=withStatus({...k,status:base.status},k.status).history;
  }
  if(!isPM(k))delete k.course;
  return k;
}
async function save(){
  readForm();const err=$("#ferr");
  if(!draft.name){err.textContent="キット名を入力してください。";err.hidden=false;$("#e-name").focus();return}
  if(busy){err.textContent="写真の取り込みが終わるまでお待ちください。";err.hidden=false;return}
  const isNew=!draft.id;
  const k=applyEdit(isNew?null:kits.find(x=>x.id===draft.id),{...draft,id:draft.id||uid(),updatedAt:Date.now(),createdAt:draft.createdAt||Date.now()});
  try{
    await store.putKit(k);
    for(const p of removed)await removePhoto(p);
    $("#editor").hidden=true;await refresh();toast(isNew?"登録しました":"保存しました");
    if(isNew)askPersist();
  }catch(_){err.textContent="保存できませんでした。端末の空き容量を確認してもう一度お試しください。";err.hidden=false}
}

/* ---------- バックアップ（機種変更用） ---------- */
function blobToDataURL(b){return new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result);r.onerror=()=>rej(r.error);r.readAsDataURL(b)})}
async function dataURLToBlob(u){const r=await fetch(u);return r.blob()}
function fmtBytes(n){return n>1048576?(n/1048576).toFixed(1)+" MB":Math.ceil(n/1024)+" KB"}
async function openBackup(){
  const last=Number(ls.get("lastBackup")||0);
  let usage="";
  try{const e=await navigator.storage?.estimate?.();if(e?.usage)usage=`このアプリが使っている容量：約${fmtBytes(e.usage)}`}catch(_){}
  $("#backup").innerHTML=`<div class="wrap">
    <div class="bar"><button class="btn ghost" data-b="close">← 一覧</button><h2>${CLIENT_ID?"同期とバックアップ":"バックアップ・機種変更"}</h2><span style="width:60px"></span></div>
    ${CLIENT_ID?`<div class="box" id="syncbox"></div>`:""}
    <div class="box"><h3>バックアップを保存</h3>
      <p>キット${kits.length}件と写真をまとめて1つのファイルにします。iCloud Drive、Googleドライブ、パソコンなど、スマホ以外の場所にも保存しておくと安心です。<br>${last?"前回の保存："+ymd(new Date(last)):"まだ保存していません"}</p>
      <button class="btn primary wide" data-b="export" ${kits.length?"":"disabled"}>バックアップファイルを作る</button>
      <p id="exmsg" style="margin:8px 0 0"></p></div>
    <div class="box"><h3>バックアップから読み込む</h3>
      <p>新しいスマホでこのアプリを開き、前の機種で作ったファイルを選びます。同じキットは上書きされ、今あるほかのキットはそのまま残ります。</p>
      <label class="filepick btn wide" style="text-align:center">ファイルを選んで読み込む<input id="b-file" type="file" accept=".json,application/json" aria-label="バックアップファイルを選ぶ"></label>
      <p id="immsg" style="margin:8px 0 0"></p></div>
    <div class="box"><h3>機種変更の手順</h3>
      <p style="margin:0">1. 前のスマホで「バックアップファイルを作る」<br>2. ファイルをクラウドかAirDrop・メールなどで新しいスマホへ送る<br>3. 新しいスマホでこのアプリを開き、ホーム画面に追加<br>4. 「ファイルを選んで読み込む」で取り込む<br><br>iPhoneとAndroidの間でも同じファイルで移せます。${CLIENT_ID?"Googleドライブで同期している場合は、新しい端末で同じアカウントにログインするだけで移せます。":""}${usage?"<br><br>"+usage:""}</p></div>
    <p class="legal"><a href="#" data-b="intro">使い方を見る</a><a href="privacy.html">プライバシーポリシー</a><a href="terms.html">利用規約</a></p>
  </div>`;
  renderSyncBox();
  $("#backup").hidden=false;$("#backup").scrollTop=0;
}
$("#backup").addEventListener("click",async e=>{
  const a=e.target.closest("[data-b]")?.dataset.b;
  if(a==="close"){$("#backup").hidden=true;render()}
  if(a==="export")exportBackup(e.target.closest("button"));
  if(a==="login")connect();
  if(a==="intro"){e.preventDefault();$("#backup").hidden=true;openIntro(0)}
  if(a==="syncnow"){if(sync.token&&Date.now()<sync.exp)runSync();else connect()}
  if(a==="logout"){logout(false)}
  if(a==="askwipe"){sync.confirmWipe=true;renderSyncBox()}
  if(a==="nowipe"){sync.confirmWipe=false;renderSyncBox()}
  if(a==="wipe"){logout(true)}
  if(a==="sw-merge"){finishLink(sync.pendingEmail,false)}
  if(a==="sw-replace"){finishLink(sync.pendingEmail,true)}
  if(a==="sw-cancel"){sync.pendingEmail="";sync.token=null;sync.state="idle";updateSyncUI()}
});
$("#backup").addEventListener("change",e=>{if(e.target.id==="b-file"&&e.target.files[0])importBackup(e.target.files[0],e.target)});
async function exportBackup(btn){
  const msg=$("#exmsg");btn.disabled=true;msg.textContent="ファイルを作成中…";
  try{
    const photos={};
    for(const k of kits)for(const id of k.photos||[]){if(photos[id])continue;const b=await store.getPhoto(id);if(b)photos[id]=await blobToDataURL(b)}
    const data={app:"garekichou",version:1,exportedAt:new Date().toISOString(),kits,photos};
    const name=`garekichou-backup-${today().replace(/-/g,"")}.json`;
    const file=new File([JSON.stringify(data)],name,{type:"application/json"});
    let done=false;
    const ios=/iPhone|iPad|iPod/.test(navigator.userAgent)||(navigator.platform==="MacIntel"&&navigator.maxTouchPoints>1);
    if(ios&&navigator.canShare?.({files:[file]})){
      try{await navigator.share({files:[file],title:"ガレキ積み帳のバックアップ"});done=true}
      catch(err){if(err?.name==="AbortError"){msg.textContent="保存をやめました。";btn.disabled=false;return}}
    }
    if(!done){
      const u=URL.createObjectURL(file);const a=document.createElement("a");a.href=u;a.download=name;document.body.appendChild(a);a.click();a.remove();
      setTimeout(()=>URL.revokeObjectURL(u),60000);
    }
    ls.set("lastBackup",String(Date.now()));
    msg.textContent=`${name}（${fmtBytes(file.size)}）を作成しました。${ios?"「ファイルに保存」でiCloud Driveなどに保存してください。":"ダウンロードフォルダを確認してください。"}`;
  }catch(err){msg.textContent="ファイルを作れませんでした。写真が多い場合は端末の空き容量を確認してください。"}
  btn.disabled=false;
}
async function importBackup(file,input){
  const msg=$("#immsg");msg.textContent="読み込み中…";
  try{
    const data=JSON.parse(await file.text());
    if(data?.app!=="garekichou"||!Array.isArray(data.kits))throw new Error("format");
    let n=0,p=0;
    for(const [id,u] of Object.entries(data.photos||{})){if(typeof u!=="string"||!u.startsWith("data:image/"))continue;await store.putPhoto(id,await dataURLToBlob(u));if(urls[id]){URL.revokeObjectURL(urls[id]);delete urls[id]}p++}
    const cur=new Map((await store.allKits()).map(k=>[k.id,k]));
    for(const k of data.kits){if(!k||typeof k.id!=="string"||k.deleted)continue;const c=cur.get(k.id);
      const updatedAt=!c||c.deleted?Date.now():Math.max(Number(k.updatedAt)||0,0);
      if(c&&!c.deleted&&(Number(c.updatedAt)||0)>updatedAt){n++;continue}
      await store.putKit({...k,photos:Array.isArray(k.photos)?k.photos:[],updatedAt});n++}
    await refresh();askPersist();
    msg.textContent=`キット${n}件、写真${p}枚を読み込みました。`;
    toast("バックアップを読み込みました");
  }catch(err){msg.textContent=err?.message==="format"?"ガレキ積み帳のバックアップファイルではないようです。ファイルを確認してください。":"読み込めませんでした。ファイルが壊れていないか、端末の空き容量が足りているか確認してください。"}
  input.value="";
}

/* ---------- Googleドライブ同期 ---------- */
/* 各利用者が自分のGoogleアカウントでログインし、その人のドライブの「ガレキ積み帳」フォルダに保存する。
   権限は drive.file（このアプリが作ったファイルだけ）に限定。アクセストークンはメモリにだけ置く。 */
const CLIENT_ID="883909674324-4objgqvu77bi3v9a0kv87n7h410f6ko7.apps.googleusercontent.com";  // Google CloudのOAuthクライアントID（〜.apps.googleusercontent.com）
const DRIVE_SCOPE="https://www.googleapis.com/auth/drive.file";
const SCOPES=DRIVE_SCOPE+" openid https://www.googleapis.com/auth/userinfo.email";
const FOLDER_NAME="ガレキ積み帳", KITS_FILE="kits.json", PHOTO_PREFIX="photo-";
const API="https://www.googleapis.com/drive/v3/", UPLOAD="https://www.googleapis.com/upload/drive/v3/";
const sync={token:null,exp:0,email:ls.get("g_email")||"",linked:ls.get("g_linked")==="1",state:"idle",last:Number(ls.get("g_last")||0),err:"",running:false,again:false,pendingEmail:"",confirmWipe:false,timer:0};
if(sync.linked)sync.state="needtap";
const lsDel=k=>{try{localStorage.removeItem(k)}catch(_){}};
const hm=t=>{const d=new Date(t);return (ymd(d)===today()?"":`${d.getMonth()+1}/${d.getDate()} `)+String(d.getHours()).padStart(2,"0")+":"+String(d.getMinutes()).padStart(2,"0")};

function updateSyncUI(){
  const b=$("#openBackup");
  if(!CLIENT_ID||!sync.linked){b.textContent="バックアップ";b.dataset.state=""}
  else{
    const t={needtap:"タップして同期",syncing:"同期中…",ok:"同期済み",error:"同期エラー",idle:"同期"}[sync.state]||"同期";
    b.textContent=t;b.dataset.state=sync.state;
  }
  if(!$("#backup").hidden)renderSyncBox();
}
function renderSyncBox(){
  const el=$("#syncbox");if(!el)return;
  const legal=`<p class="small">データはあなたのGoogleドライブの「${FOLDER_NAME}」フォルダにだけ保存され、作者を含むほかの人からは見えません。このアプリが作ったファイル以外にはアクセスしません。</p>`;
  if(sync.pendingEmail){
    el.innerHTML=`<h3>アカウントが変わりました</h3>
      <p>この端末には、前に <b>${esc(sync.email)}</b> で使っていたキットが${kits.length}件あります。<b>${esc(sync.pendingEmail)}</b> でどうしますか？</p>
      <div class="stack"><button class="btn primary wide" data-b="sw-replace">この端末のキットを消して、${esc(sync.pendingEmail)} の内容を読み込む</button>
      <button class="btn wide" data-b="sw-merge">この端末のキットも ${esc(sync.pendingEmail)} のドライブに入れる</button>
      <button class="btn ghost wide" data-b="sw-cancel">やめる</button></div>`;
    return;
  }
  if(!sync.linked){
    el.innerHTML=`<h3>Googleドライブで同期</h3>
      <p>Googleアカウントでログインすると、スマホやPCなど同じアカウントの端末どうしで、キットと写真が同じ内容になります。</p>
      <button class="btn primary wide" data-b="login">Googleでログインして同期</button>
      <p class="small" id="syncmsg">${esc(sync.err)}</p>${legal}`;
    return;
  }
  const status={needtap:"同期するには下のボタンを押してください（1時間ごとにログインの確認が必要です）",syncing:"同期しています…",ok:`同期済み（${sync.last?hm(sync.last):""}）`,error:"同期できませんでした",idle:""}[sync.state]||"";
  el.innerHTML=`<h3>Googleドライブで同期</h3>
    <p><b>${esc(sync.email)}</b> で同期しています。<br>${esc(status)}</p>
    ${sync.err?`<p class="err">${esc(sync.err)}</p>`:""}
    <button class="btn primary wide" data-b="syncnow" ${sync.state==="syncing"?"disabled":""}>今すぐ同期</button>
    <div class="row" style="margin-top:10px">
      <button class="btn" data-b="logout">ログアウト</button>
      ${sync.confirmWipe?`<span class="confirm">この端末のキットと写真を消します（ドライブには残ります）。<button class="btn danger" data-b="wipe">消してログアウト</button><button class="btn ghost" data-b="nowipe">やめる</button></span>`:`<button class="btn danger" data-b="askwipe">ログアウトしてこの端末のデータを消す</button>`}
    </div>${legal}`;
}

function gisReady(){return !!(window.google&&google.accounts&&google.accounts.oauth2)}
function requestToken(prompt,hint){
  return new Promise((res,rej)=>{
    if(!gisReady())return rej({type:"gis"});
    const tc=google.accounts.oauth2.initTokenClient({client_id:CLIENT_ID,scope:SCOPES,login_hint:hint||undefined,
      callback:r=>{
        if(r.error)return rej({type:r.error});
        if(!google.accounts.oauth2.hasGrantedAllScopes(r,DRIVE_SCOPE))return rej({type:"scope"});
        sync.token=r.access_token;sync.exp=Date.now()+(Number(r.expires_in)||3600)*1000-60000;res(r);
      },
      error_callback:e=>rej({type:e?.type||"popup"})});
    tc.requestAccessToken({prompt});
  });
}
function authMsg(e){
  const t=e?.type;
  if(t==="gis")return "Googleのログイン機能を読み込めませんでした。通信状況を確認して、ページを開き直してください。";
  if(t==="popup_closed"||t==="access_denied")return "ログインをやめました。";
  if(t==="popup_failed_to_open")return "ログイン画面を開けませんでした。ホーム画面から開いている場合は、SafariやChromeでこのページを開いてログインしてください。";
  if(t==="scope")return "「Googleドライブのファイル」へのアクセスにチェックを入れて、もう一度ログインしてください。";
  return "ログインできませんでした。もう一度お試しください。";
}
async function api(url,opt={}){
  if(!sync.token||Date.now()>sync.exp)throw {type:"auth"};
  const r=await fetch(url,{...opt,headers:{...(opt.headers||{}),Authorization:"Bearer "+sync.token}});
  if(r.status===401){sync.token=null;throw {type:"auth"}}
  if(!r.ok)throw {type:"http",status:r.status};
  return r;
}
const q=s=>encodeURIComponent(s);
async function connect(){
  if(!CLIENT_ID)return;
  sync.err="";
  try{await requestToken(sync.linked?"":"consent",sync.email)}
  catch(e){sync.err=authMsg(e);if(sync.linked)sync.state="needtap";updateSyncUI();if(!$("#backup").hidden){}else toast(sync.err,4000);return}
  let email="";
  try{const r=await api("https://www.googleapis.com/oauth2/v3/userinfo");email=(await r.json()).email||""}
  catch(e){sync.err="アカウント情報を取得できませんでした。";sync.state="error";updateSyncUI();return}
  const prev=ls.get("g_email");
  if(prev&&email&&prev!==email&&kits.length){sync.pendingEmail=email;if($("#backup").hidden)openBackup();else updateSyncUI();return}
  finishLink(email,false);
}
async function finishLink(email,wipe){
  if(wipe){await store.clearAll();for(const id of Object.keys(urls)){URL.revokeObjectURL(urls[id]);delete urls[id]}await refresh()}
  if(sync.email!==email)lsDel("g_folder");
  sync.pendingEmail="";sync.email=email;sync.linked=true;
  ls.set("g_email",email);ls.set("g_linked","1");
  await runSync();
}
async function logout(wipe){
  try{if(sync.token&&gisReady())google.accounts.oauth2.revoke(sync.token,()=>{})}catch(_){}
  sync.token=null;sync.linked=false;sync.state="idle";sync.err="";sync.confirmWipe=false;
  lsDel("g_linked");
  if(wipe){await store.clearAll();for(const id of Object.keys(urls)){URL.revokeObjectURL(urls[id]);delete urls[id]}lsDel("g_email");lsDel("g_folder");lsDel("g_last");sync.email="";await refresh();toast("ログアウトして、この端末のデータを消しました")}
  else toast("ログアウトしました。この端末のデータは残っています");
  updateSyncUI();
}
function scheduleSync(){
  if(!CLIENT_ID||!sync.linked||sync.pendingEmail)return;
  clearTimeout(sync.timer);
  if(!sync.token||Date.now()>sync.exp){sync.state="needtap";updateSyncUI();return}
  sync.timer=setTimeout(runSync,1500);
}
async function folderId(){
  const c=ls.get("g_folder");if(c)return c;
  const r=await api(API+"files?spaces=drive&orderBy=createdTime&fields=files(id)&q="+q(`name='${FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`));
  let id=(await r.json()).files?.[0]?.id;
  if(!id){const c2=await api(API+"files?fields=id",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:FOLDER_NAME,mimeType:"application/vnd.google-apps.folder"})});id=(await c2.json()).id}
  ls.set("g_folder",id);return id;
}
async function listFolder(fid){
  const out={};let tok="";
  do{
    const r=await api(API+`files?pageSize=1000&fields=nextPageToken,files(id,name,createdTime)&q=${q(`'${fid}' in parents and trashed=false`)}`+(tok?"&pageToken="+q(tok):""));
    const j=await r.json();for(const f of j.files||[])if(!out[f.name])out[f.name]=f;tok=j.nextPageToken||"";
  }while(tok);
  return out;
}
function multipart(meta,blob){
  const b="garekichou"+uid().replace(/-/g,"");
  return {headers:{"Content-Type":"multipart/related; boundary="+b},
    body:new Blob([`--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${b}\r\nContent-Type: ${blob.type||"application/octet-stream"}\r\n\r\n`,blob,`\r\n--${b}--`])};
}
async function runSync(){
  if(!CLIENT_ID||!sync.linked)return;
  if(sync.running){sync.again=true;return}
  if(!sync.token||Date.now()>sync.exp){sync.state="needtap";updateSyncUI();return}
  sync.running=true;sync.state="syncing";sync.err="";updateSyncUI();
  let localChanged=false;
  try{
    let fid;
    try{fid=await folderId();var files=await listFolder(fid)}
    catch(e){if(e.type==="http"&&e.status===404){lsDel("g_folder");fid=await folderId();files=await listFolder(fid)}else throw e}
    let remote=[];const kf=files[KITS_FILE];
    if(kf){const r=await api(API+`files/${kf.id}?alt=media`);const j=await r.json();if(Array.isArray(j.kits))remote=j.kits.filter(k=>k&&typeof k.id==="string")}
    const local=await store.allKits();
    const L=new Map(local.map(k=>[k.id,k])),R=new Map(remote.map(k=>[k.id,k]));
    const merged=[];
    for(const id of new Set([...L.keys(),...R.keys()])){
      const l=L.get(id),r=R.get(id);
      const pick=!r?l:!l?r:((Number(r.updatedAt)||0)>(Number(l.updatedAt)||0)?r:l);
      merged.push(pick);
      if(pick!==l){
        await store.putKitRaw(pick);localChanged=true;
        if(pick.deleted&&l)for(const p of l.photos||[])await removePhoto(p);
      }
    }
    const need=new Set(merged.filter(k=>!k.deleted).flatMap(k=>k.photos||[]));
    for(const id of need){
      const name=PHOTO_PREFIX+id, rf=files[name];
      const lb=await store.getPhoto(id);
      if(!lb&&rf){const r=await api(API+`files/${rf.id}?alt=media`);await store.putPhoto(id,await r.blob());localChanged=true}
      else if(lb&&!rf){const m=multipart({name,parents:[fid]},lb);await api(UPLOAD+"files?uploadType=multipart&fields=id",{method:"POST",...m})}
    }
    for(const [name,f] of Object.entries(files)){
      if(!name.startsWith(PHOTO_PREFIX))continue;
      const id=name.slice(PHOTO_PREFIX.length);
      if(!need.has(id)&&Date.now()-Date.parse(f.createdTime||0)>DAY){try{await api(API+`files/${f.id}`,{method:"DELETE"})}catch(_){}}
    }
    const sortK=a=>a.slice().sort((x,y)=>x.id<y.id?-1:1);
    const same=JSON.stringify(sortK(remote))===JSON.stringify(sortK(merged));
    if(!same||!kf){
      const blob=new Blob([JSON.stringify({app:"garekichou",version:1,updatedAt:Date.now(),kits:merged})],{type:"application/json"});
      if(kf)await api(UPLOAD+`files/${kf.id}?uploadType=media`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:blob});
      else{const m=multipart({name:KITS_FILE,parents:[fid],mimeType:"application/json"},blob);await api(UPLOAD+"files?uploadType=multipart&fields=id",{method:"POST",...m})}
    }
    sync.last=Date.now();ls.set("g_last",String(sync.last));sync.state="ok";
  }catch(e){
    if(e?.type==="auth"){sync.state="needtap"}
    else{sync.state="error";sync.err=e?.type==="http"?`Googleドライブとの通信でエラーが起きました（${e.status}）。時間を置いて「今すぐ同期」を押してください。`:"通信できませんでした。電波のある場所で「今すぐ同期」を押してください。"}
  }finally{
    sync.running=false;updateSyncUI();
    if(localChanged)await refresh();
    if(sync.again){sync.again=false;runSync()}
  }
}
document.addEventListener("visibilitychange",()=>{
  if(document.visibilityState!=="visible"||!sync.linked)return;
  if(sync.token&&Date.now()<sync.exp){if(Date.now()-sync.last>60000)runSync()}
  else{sync.state="needtap";updateSyncUI()}
});

/* ---------- 初回の案内 ---------- */
let introStep=0, installEvt=null;
const isIOS=/iPhone|iPad|iPod/.test(navigator.userAgent)||(navigator.platform==="MacIntel"&&navigator.maxTouchPoints>1);
const isAndroid=/Android/.test(navigator.userAgent);
const isStandalone=()=>matchMedia("(display-mode: standalone)").matches||navigator.standalone===true;
window.addEventListener("beforeinstallprompt",e=>{e.preventDefault();installEvt=e;if(!$("#intro").hidden)renderIntro()});
window.addEventListener("appinstalled",()=>{installEvt=null;if(!$("#intro").hidden)renderIntro()});
function introPages(){
  const pages=[];
  pages.push(()=>`<h2 id="intro-title"><span>ガレキ</span>積み帳へようこそ</h2>
    <p>積んでいるガレージキットを、写真と一緒に記録しておくアプリです。</p>
    <ul class="feat">
      <li><span class="ic" aria-hidden="true">1</span><div><b>写真付きで登録</b>箱やパーツの写真、ディーラー、原型師、購入日、保管場所をまとめて残せます。</div></li>
      <li><span class="ic" aria-hidden="true">2</span><div><b>工程を進めるだけで日付が残る</b>未開封から完成まで、いつどこまで進んだかを自動で記録します。</div></li>
      <li><span class="ic" aria-hidden="true">3</span><div><b>積み期間がひと目で分かる</b>1年以上積んでいるキットは赤く表示されます。</div></li>
      <li><span class="ic" aria-hidden="true">4</span><div><b>プラモも一緒に管理</b>登録画面の「ガレキ／プラモ」を切り替えると、プラモ用の項目と工程で記録できます。</div></li>
    </ul>`);
  pages.push(()=>`<h2 id="intro-title">工程はボタンひとつで進められます</h2>
    <p>キットを開いて「次の工程に進める」を押すと、その日の日付で記録されます。押し間違えたら「1つ戻す」で取り消せます。</p>
    <div class="intro-demo">${stepsBar(3)}<div class="stepnames">${STEPS.map((s,i)=>`<span class="${i===3?"cur":""}">${s}</span>`).join("")}</div></div>
    <p class="note">記録した日付は、あとからタップして直せます。</p>`);
  if(!isStandalone())pages.push(()=>{
    let how;
    if(installEvt)how=`<p>ボタンを押すと、ホーム画面やデスクトップにアプリとして追加できます。</p><div class="intro-actions"><button class="btn primary wide" data-i="install">アプリとして追加する</button></div>`;
    else if(isIOS)how=`<ol class="howto"><li>Safariの下（または上）にある <kbd>共有</kbd> ボタンを押す</li><li><kbd>ホーム画面に追加</kbd> を選ぶ</li><li>右上の <kbd>追加</kbd> を押す</li></ol>
      <p class="note">iPhoneでは、ホーム画面に追加しないまましばらく開かないと、保存したデータが消されることがあります。必ず追加してから使ってください。</p>`;
    else if(isAndroid)how=`<ol class="howto"><li>Chromeの右上の <kbd>︙</kbd> を押す</li><li><kbd>ホーム画面に追加</kbd> または <kbd>アプリをインストール</kbd> を選ぶ</li></ol>`;
    else how=`<p>ChromeやEdgeでは、アドレスバーの右端にあるインストールのアイコンから、アプリとして追加できます。ブラウザのまま使っても問題ありません。</p>`;
    return `<h2 id="intro-title">ホーム画面に追加しましょう</h2>
      <p>追加すると、普通のアプリのように全画面で開けて、電波がない場所でも使えます。</p>${how}`;
  });
  if(CLIENT_ID)pages.push(()=>`<h2 id="intro-title">データの保存場所</h2>
    <p>登録したキットと写真は、この端末の中に保存されます。作者を含め、ほかの人には見えません。</p>
    <p>Googleアカウントでログインすると、あなたのGoogleドライブを通して、スマホとPCなど複数の端末で同じ内容を使えます。機種変更のときも、ログインするだけで引き継げます。</p>
    <div class="intro-actions">${sync.linked?`<p class="ok">${esc(sync.email)} で同期しています</p>`:`<button class="btn primary wide" data-i="login">Googleでログインして同期する</button>${sync.err?`<p class="err">${esc(sync.err)}</p>`:""}<p class="note">あとで右上の「バックアップ」からも設定できます。同期しない場合は、ときどきバックアップファイルを保存しておくと安心です。</p>`}</div>`);
  pages.push(()=>`<h2 id="intro-title">さっそく始めましょう</h2>
    <p>まずは手元のキットを1つ登録してみましょう。箱の写真を撮っておくと、一覧で見分けやすくなります。</p>
    <div class="intro-actions">
      <button class="btn primary wide" data-i="first">最初のキットを登録する</button>
      <button class="btn wide" data-i="restore">前の端末のバックアップを読み込む</button>
    </div>
    <p class="note">使い始めると、<a href="terms.html">利用規約</a>と<a href="privacy.html">プライバシーポリシー</a>に同意したものとみなします。</p>`);
  return pages;
}
function renderIntro(){
  const pages=introPages();introStep=Math.max(0,Math.min(introStep,pages.length-1));
  const last=introStep===pages.length-1;
  $("#intro").innerHTML=`<div class="wrap">
    <div class="intro-top"><div class="dots" aria-label="${introStep+1} / ${pages.length}">${pages.map((_,i)=>`<i class="${i<=introStep?"on":""}"></i>`).join("")}</div>
      ${last?"":`<button class="btn ghost" data-i="skip">スキップ</button>`}</div>
    <div class="intro-body">${pages[introStep]()}</div>
    <div class="intro-nav">
      ${introStep>0?`<button class="btn ghost" data-i="prev">戻る</button>`:`<span></span>`}
      ${last?`<button class="btn" data-i="done">一覧を見る</button>`:`<button class="btn primary" data-i="next">次へ</button>`}
    </div></div>`;
  $("#intro").scrollTop=0;
}
function introGo(d){introStep+=d;renderIntro()}
function openIntro(step){introStep=step||0;renderIntro();$("#intro").hidden=false;$("#intro [data-i=next]")?.focus()}
function closeIntro(){$("#intro").hidden=true;ls.set("introDone","1")}
$("#intro").addEventListener("click",async e=>{
  const a=e.target.closest("[data-i]")?.dataset.i;if(!a)return;
  if(a==="next")introGo(1);
  else if(a==="prev")introGo(-1);
  else if(a==="skip"||a==="done")closeIntro();
  else if(a==="first"){closeIntro();openEditor(null)}
  else if(a==="restore"){closeIntro();openBackup()}
  else if(a==="install"&&installEvt){installEvt.prompt();try{await installEvt.userChoice}catch(_){}installEvt=null;renderIntro()}
  else if(a==="login"){await connect();if(sync.pendingEmail){closeIntro();return}renderIntro()}
});
$("#openIntro").addEventListener("click",e=>{e.preventDefault();openIntro(0)});
/* 案内や同期画面から規約・ポリシーを開いたら、戻ったときに同じ画面を開き直す */
function rememberReturn(e,to){
  const link=e.target.closest('a[href$=".html"]');if(!link)return;
  try{sessionStorage.setItem("garekichou-return",JSON.stringify({to,step:introStep}))}catch(_){}
}
$("#intro").addEventListener("click",e=>rememberReturn(e,"intro"),true);
window.addEventListener("pageshow",e=>{if(e.persisted){try{sessionStorage.removeItem("garekichou-return")}catch(_){}}});
$("#backup").addEventListener("click",e=>rememberReturn(e,"backup"),true);
function takeReturn(){
  let r=null;try{r=JSON.parse(sessionStorage.getItem("garekichou-return")||"null");sessionStorage.removeItem("garekichou-return")}catch(_){}
  if(r?.to==="intro"){openIntro(Number(r.step)||0);return true}
  if(r?.to==="backup"){openBackup();return true}
  return false;
}

/* ---------- 起動 ---------- */
document.addEventListener("keydown",e=>{
  if(e.target.closest("input,textarea,select"))return;
  if(e.key==="Escape"){
    if(!$("#editor").hidden){$("#editor [data-a=cancel]")?.click();return}
    if(!$("#intro").hidden){closeIntro();return}
    if(!$("#backup").hidden){$("#backup").hidden=true;render();return}
    if(curId)closeDetail();return;
  }
  if(!$("#intro").hidden){if(e.key==="ArrowRight")introGo(1);if(e.key==="ArrowLeft")introGo(-1);return}
  if(!wide||!$("#editor").hidden||!$("#backup").hidden)return;
  if(e.key==="ArrowDown"||e.key==="ArrowUp"){
    const ids=[...document.querySelectorAll("#list .card")].map(c=>c.dataset.id);if(!ids.length)return;
    e.preventDefault();let i=ids.indexOf(curId);i=i<0?0:Math.max(0,Math.min(ids.length-1,i+(e.key==="ArrowDown"?1:-1)));
    openDetail(ids[i]);document.querySelector(`#list .card[data-id="${CSS.escape(ids[i])}"]`)?.scrollIntoView({block:"nearest"});
  }
});
if(wide)$("#detail").hidden=false;
updateSyncUI();
render();
if(!("indexedDB" in window)){failed=true;loaded=true;render()}
else refresh().then(()=>{if(takeReturn())return;if(ls.get("introDone")!=="1"&&!kits.length&&!sync.linked)openIntro(0)});
if("serviceWorker" in navigator&&location.protocol==="https:")navigator.serviceWorker.register("sw.js").catch(()=>{});
