// Lodges Before 1812: search and browse. startApp(DATA) is called by auth.js after a paid member signs in.
window.startApp=function(DATA){
const $=id=>document.getElementById(id);
const norm=s=>(s||"").normalize("NFD").replace(/[̀-ͯ]/g,"").toLowerCase();
const esc=s=>String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const R=DATA.recs, M=DATA.men;
R.forEach(r=>{r.n=norm(r.f.map(x=>x[1]).join(" | ")+" | "+r.t+" | "+r.c+" | "+r.m.map(i=>M[i].n).join(" "))});
M.forEach(m=>{m.keys=[m.n,...m.sp].map(norm)});
let man=null, shown=25, last=[], docSel=null;
function opts(sel,vals){[...new Set(vals)].filter(Boolean).sort().forEach(v=>{const o=document.createElement("option");o.value=o.textContent=v;sel.appendChild(o)})}
DATA.lodges.forEach(l=>{const o=document.createElement("option");o.value=o.textContent=l.n;$("fl").appendChild(o)});
opts($("fs"),R.map(r=>r.s));const RP=DATA.repos;Object.entries(RP).forEach(([k,v])=>{if(!v.n)return;const o=document.createElement("option");o.value=k;o.textContent=`${v.name} (${v.n})`;$("fo").appendChild(o)});opts($("ft"),R.flatMap(r=>r.tr));opts($("fb"),R.flatMap(r=>r.b));
$("foot").innerHTML=`${DATA.meta.count.toLocaleString()} records, ${DATA.meta.linked.toLocaleString()} of them linked to a named man; ${M.length} men from the series cross-reference. Built ${esc(DATA.meta.built)}. The Commissioners' records are a separate program. Not included: ${esc(DATA.meta.excluded)}.`;

function terms(q){const t=[];q.replace(/"([^"]+)"|(\S+)/g,(m,a,b)=>{const x=norm(a||b).replace(/^[^\w']+|[^\w']+$/g,"");if(x)t.push(x)});return t}
function run(){
  const fo=$("fo").value,q=$("q").value.trim(),T=terms(q),fl=$("fl").value,fs=$("fs").value,ft=$("ft").value,fb=$("fb").value;
  const y1=parseInt($("y1").value)||0,y2=parseInt($("y2").value)||9999,yf=y1>0||y2<9999;
  const any=docSel!==null||T.length||fo||fl||fs||ft||fb||yf||man!==null;
  if(!any){last=[];home();side(T,q);return}
  const res=[];
  for(const r of R){
    if(docSel!==null&&r.d!==docSel||fo&&r.o!==fo||fl&&!r.l.includes(fl)||fs&&r.s!==fs||ft&&!r.tr.includes(ft)||fb&&!r.b.includes(fb))continue;
    if(yf&&!r.y.some(y=>y>=y1&&y<=y2))continue;
    if(man!==null&&!r.m.includes(man))continue;
    let sc=0,ok=true;
    for(const t of T){if(/^1[78]\d\d$/.test(t)&&r.y.includes(+t)){sc+=3;continue}
      if(r.n.indexOf(t)<0){ok=false;break} sc+=1+(norm(r.f[0][1]).includes(t)?3:0)}
    if(!ok)continue;
    if(r.m.length)sc+=.5;
    res.push([sc,r]);
  }
  res.sort((a,b)=>b[0]-a[0]||((a[1].y[0]||9999)-(b[1].y[0]||9999)));
  last=res.map(x=>x[1]);shown=25;render(T);side(T,q);
}
function hi(s,T){let h=esc(s);for(const t of T){if(t.length<2)continue;const src=norm(h);let out="",i=0,j;while((j=src.indexOf(t,i))>=0){out+=h.slice(i,j)+"<mark>"+h.slice(j,j+t.length)+"</mark>";i=j+t.length}h=out+h.slice(i)}return h}
function census(){const C=DATA.census;if(!C)return"";const short=l=>l.replace("Potomac ","Pot. ").replace("Columbia ","Col. ").replace("Federal ","Fed. ").replace("Alexandria ","Alex. ");
  const pct=n=>Math.round(100*n/C.occ_known)+"%";
  return `<h2 class="sec" style="margin-top:14px">Census of the lodges</h2>
  <p class="stats">Men named in the surviving returns and rolls, by year. A man is counted once a year in each lodge; a blank means no return survives for that year, not an empty lodge.</p>
  <div class="tscroll"><table class="stt"><thead><tr><th>Year</th>${C.lodges.map(l=>`<th>${esc(short(l))}</th>`).join("")}<th>All</th></tr></thead><tbody>
  ${C.years.map(y=>`<tr><td>${y.y}</td>${y.c.map(n=>`<td>${n||""}</td>`).join("")}<td><b>${y.t}</b></td></tr>`).join("")}</tbody></table></div>
  <div class="cols2"><div><h3 class="h3s">Callings</h3><table class="stt"><thead><tr><th>Trade or calling</th><th>Men</th><th>Share</th></tr></thead><tbody>
  ${C.occ.map(([n,v])=>`<tr><td>${esc(n)}</td><td>${v}</td><td>${pct(v)}</td></tr>`).join("")}</tbody></table>
  <p class="stats">Of ${C.men} men, ${C.occ_known} have a recorded trade or calling; a man with two callings counts in both.</p></div>
  <div><h3 class="h3s">Where the lodges met</h3><table class="stt"><thead><tr><th>Place</th><th>Men</th></tr></thead><tbody>
  ${C.place.map(([n,v])=>`<tr><td>${esc(n)}</td><td>${v}</td></tr>`).join("")}</tbody></table>
  <p class="stats">${C.multi} men belonged to more than one lodge. ${C.offices} men held a lodge office.</p></div></div>`}
function home(){
  const RP=Object.values(DATA.repos),ND=DATA.docs.length,NC=DATA.repos.BOOK?DATA.repos.BOOK.n:0,ys=R.flatMap(r=>r.y).filter(y=>y>=1750&&y<=1830);
  let h=`<h2 class="sec">Statistics</h2><div class="statgrid">
    <div><b>${R.length.toLocaleString()}</b><span>records</span></div>
    <div><b>${M.length.toLocaleString()}</b><span>men on the series rolls</span></div>
    <div><b>${DATA.meta.linked.toLocaleString()}</b><span>records naming a man</span></div>
    <div><b>${ND}</b><span>original documents cited</span></div>
    <div><b>${(R.length-NC).toLocaleString()}</b><span>records traced to a document</span></div>
    <div><b>${Math.min(...ys)}–${Math.max(...ys)}</b><span>years</span></div></div>
  <table class="stt"><thead><tr><th>Lodge</th><th>Men</th><th>Records</th><th>Documents</th><th>Years</th></tr></thead><tbody>
  ${DATA.lodges.map(l=>`<tr><td>${esc(l.n)}</td><td>${l.men}</td><td>${l.r.toLocaleString()}</td><td>${l.d||"–"}</td><td>${l.y0?l.y0+"–"+l.y1:"–"}</td></tr>`).join("")}</tbody></table>
  ${census()}
  <p class="stats">A record is one row of a book's table or roll. A document is one original: a return, a communication of the Grand Lodge, a payroll, a newspaper issue or a manuscript. Records compiled in the books from several documents (registers, timelines, year lists) are counted as records only.</p>
  <h2 class="sec">The lodges</h2><div class="lodges">`;
  for(const l of DATA.lodges)h+=`<button class="lodge" type="button" data-l="${esc(l.n)}"><b>${esc(l.n)}</b><span>${l.men} men · ${l.r.toLocaleString()} records${l.y0?` · ${l.y0}–${l.y1}`:""}</span></button>`;
  h+=`</div><h2 class="sec">Where the originals are</h2><div class="rows" style="margin-bottom:18px">${Object.entries(DATA.repos).filter(([k,v])=>v.n).map(([k,v])=>`<button type="button" data-o="${k}"><span><b>${esc(v.name)}</b>${v.holder?`<br><small>${esc(v.holder)}</small>`:""}</span><span>${v.nd?`${v.nd} documents<br>`:""}${v.n.toLocaleString()} records</span></button>`).join("")}</div>
  <h2 class="sec">Trades</h2><div class="chipline">${[...new Set(R.flatMap(r=>r.tr))].sort().map(t=>`<button class="chip" type="button" data-t="${esc(t)}">${esc(t)}</button>`).join("")}</div>
  <h2 class="sec" style="margin-top:18px">Buildings</h2><div class="chipline">${[...new Set(R.flatMap(r=>r.b))].sort().map(t=>`<button class="chip" type="button" data-b="${esc(t)}">${esc(t)}</button>`).join("")}</div>`;
  $("out").innerHTML=h;
  $("out").querySelectorAll("[data-l]").forEach(b=>b.onclick=()=>{$("fl").value=b.dataset.l;run()});
  $("out").querySelectorAll("[data-o]").forEach(b=>b.onclick=()=>{$("fo").value=b.dataset.o;run()});
  $("out").querySelectorAll("[data-t]").forEach(b=>b.onclick=()=>{$("ft").value=b.dataset.t;run()});
  $("out").querySelectorAll("[data-b]").forEach(b=>b.onclick=()=>{$("fb").value=b.dataset.b;run()});
}
function render(T){
  const o=$("out");
  if(!last.length){o.innerHTML=`<p class="empty">No records match. Try another spelling, fewer words, or "Start over".</p>`;return}
  let h=`<p class="stats">${last.length.toLocaleString()} records${man!==null?` naming <b>${esc(M[man].n)}</b> <button class="linkbtn" id="unman" type="button">(show all men)</button>`:""}</p>`;
  for(const r of last.slice(0,shown)){
    const rest=r.f.slice(1).filter(([k])=>k!=="Source").map(([k,v])=>`<b>${esc(k)}:</b> ${hi(v,T)}`).join(" · ");
    h+=`<article class="res"><div class="crumb"><span class="pill">${esc(r.k)}</span><span>${esc(r.s)}</span><span>›</span><span>${esc(r.t)}</span>${r.y.length?`<span>· ${r.y[0]}${r.y.length>1&&r.y.at(-1)!==r.y[0]?"–"+r.y.at(-1):""}</span>`:""}</div>
    <h3>${hi(r.f[0][1],T)}</h3><p class="snip">${rest}</p>
    ${r.l.length?`<div class="lodgetag">${r.lv?"Lodges of the men named: ":"Lodge: "}${esc(r.l.join("; "))}</div>`:""}
    ${r.m.length?`<div class="chipline">${r.m.slice(0,8).map(i=>`<button class="chip${i===man?" on":""}" type="button" data-m="${i}">${esc(M[i].n)}</button>`).join("")}</div>`:""}
    <div class="cite">${esc(r.c)}</div>${orig(r)}
    <button class="copy" type="button" data-c="${R.indexOf(r)}">Copy citation</button>
    <details><summary>All fields</summary><dl>${r.f.map(([k,v])=>`<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl></details></article>`;
  }
  if(last.length>shown)h+=`<button class="more" id="more" type="button">More records (${(last.length-shown).toLocaleString()} left)</button>`;
  o.innerHTML=h;
  o.querySelectorAll("[data-d]").forEach(b=>b.onclick=()=>{docSel=+b.dataset.d;man=null;$("q").value="";run();window.scrollTo({top:0})});
  o.querySelectorAll("[data-c]").forEach(b=>b.onclick=()=>{const t=citeText(R[+b.dataset.c]);(navigator.clipboard?navigator.clipboard.writeText(t):Promise.reject()).then(()=>{b.textContent="Copied"},()=>{prompt("Copy this citation:",t)})});
  const mb=$("more");if(mb)mb.onclick=()=>{shown+=25;render(T)};
  const u=$("unman");if(u)u.onclick=()=>{man=null;run()};
  o.querySelectorAll("[data-m]").forEach(b=>b.onclick=()=>pick(+b.dataset.m));
}
function orig(r){const p=DATA.repos[r.o];if(!p)return"";
  if(r.d!=null){const d=DATA.docs[r.d];return `<div class="orig"><b>Original:</b> ${esc(d.x.replace(/\.$/,""))}${r.dl?", "+esc(r.dl):""}. <span class="acc">${esc(p.access)}</span> <button class="linkbtn" type="button" data-d="${r.d}">All ${d.n} records from this document</button></div>`}
  if(r.o==="BOOK")return `<div class="orig"><b>Original:</b> <span class="acc">${esc(p.access)}</span></div>`;
  return `<div class="orig"><b>Original:</b> ${esc(r.od&&r.od!==r.c?r.od:p.cite||r.od)}${r.oh?`. <b>Held at:</b> ${esc(r.oh)}`:""}. <span class="acc">${esc(p.access)}</span></div>`}
function citeText(r){const p=DATA.repos[r.o];let t=r.c.replace(/\.$/,"");if(r.d!=null)return t+". Original: "+DATA.docs[r.d].x.replace(/\.$/,"")+(r.dl?", "+r.dl:"")+".";if(r.o!=="BOOK"&&r.od&&!r.c.includes(r.od))t+=`. Original: ${r.od}${r.oh?", "+r.oh:""}`;return t+"."}
function pick(i){man=i;$("q").value="";run();window.scrollTo({top:0})}
function count(a){const c={};a.forEach(v=>c[v]=(c[v]||0)+1);return Object.entries(c).sort((x,y)=>y[1]-x[1])}
function years(list){const c={};list.forEach(r=>r.y.forEach(y=>{if(y>=1785&&y<=1815)c[y]=(c[y]||0)+1}));const ks=Object.keys(c).map(Number);if(!ks.length)return"";
  const a=Math.min(...ks),b=Math.max(...ks),mx=Math.max(...Object.values(c));let h=`<div class="years" aria-label="Records by year">`;
  for(let y=a;y<=b;y++)h+=`<i style="height:${Math.round(100*(c[y]||0)/mx)}%" title="${y}: ${c[y]||0}"></i>`;return h+`</div><div class="yl"><span>${a}</span><span>${b}</span></div>`}
function side(T,q){
  const s=$("side");let h="";const nq=norm(q).trim();
  let i=man; if(i===null&&nq.length>2){const k=M.findIndex(m=>m.keys.some(x=>x===nq||(nq.includes(" ")&&x.includes(nq))||x.split(/[\s,]+/).includes(nq)));if(k>=0)i=k}
  if(i!==null){const m=M[i];
    h+=`<div class="card"><h2>${esc(m.n)}</h2><div>${esc(m.l.join("; "))}</div>
    ${m.tg?`<div class="k">Trade</div><div>${esc(m.tg)}${m.tr?" ("+esc(m.tr)+")":""}</div>`:""}
    ${m.yr?`<div class="k">Years on the rolls</div><div>${esc(m.yr)}</div>`:""}
    ${m.o?`<div class="k">Offices</div><div>${esc(m.o)}</div>`:""}
    ${m.fx?`<div class="k">Settled facts</div><ul>${m.fx.map(f=>`<li>${esc(f)}</li>`).join("")}</ul>`:""}
    ${m.sp.length?`<div class="k">Also written</div><div>${esc(m.sp.join("; "))}</div>`:""}
    <div class="k">In the records</div><div>${m.c} records${man===i?"":` · <button class="linkbtn" type="button" data-m="${i}">show them all</button>`}</div>
    ${years(R.filter(r=>r.m.includes(i)))}
    <div class="k">Source</div><div>Lodge rolls (series cross-reference)</div></div>`}
  const fl=$("fl").value;
  if(fl&&i===null){const list=M.map((m,k)=>[m,k]).filter(([m])=>m.l.includes(fl)).sort((a,b)=>b[0].c-a[0].c);
    h+=`<div class="card rows"><div class="k" style="margin-top:0">Men of ${esc(fl)} (${list.length})</div>${list.slice(0,60).map(([m,k])=>`<button type="button" data-m="${k}"><span>${esc(m.n)}</span><span>${m.c}</span></button>`).join("")}${list.length>60?`<div class="k">and ${list.length-60} more; search a name</div>`:""}</div>`}
  const fo=$("fo").value;
  if(fo&&fo!=="BOOK"){const ds=DATA.docs.map((d,k)=>[d,k]).filter(([d])=>d.o===fo);
    h+=`<div class="card rows"><div class="k" style="margin-top:0">${esc(DATA.repos[fo].name)}: ${ds.length} documents</div>${ds.map(([d,k])=>`<button type="button" data-d="${k}"><span>${esc(d.x.replace(/^.*?: /,""))}</span><span>${d.n}</span></button>`).join("")}</div>`}
  if(docSel!==null){const d=DATA.docs[docSel];h=`<div class="card"><div class="k" style="margin-top:0">Document</div><div>${esc(d.x)}</div><div class="k">Records from it</div><div>${d.n} · <button class="linkbtn" type="button" id="undoc">show all records</button></div></div>`+h}
  if(last.length){h+=`<div class="card rows"><div class="k" style="margin-top:0">Narrow by source</div>${count(last.map(r=>r.s)).map(([k,n])=>`<button type="button" data-f="fs" data-v="${esc(k)}"><span>${esc(k)}</span><span>${n}</span></button>`).join("")}
    <div class="k">Records by year</div>${years(last)}</div>`}
  s.innerHTML=h;
  s.querySelectorAll("[data-m]").forEach(b=>b.onclick=()=>pick(+b.dataset.m));
  s.querySelectorAll("[data-d]").forEach(b=>b.onclick=()=>{docSel=+b.dataset.d;run()});
  const ud=$("undoc");if(ud)ud.onclick=()=>{docSel=null;run()};
  s.querySelectorAll("[data-f]").forEach(b=>b.onclick=()=>{$(b.dataset.f).value=b.dataset.v;run()});
}
$("f").onsubmit=e=>{e.preventDefault();man=null;run()};
["fo","fl","fs","ft","fb"].forEach(id=>$(id).onchange=run);["y1","y2"].forEach(id=>$(id).oninput=run);
$("clr").onclick=()=>{docSel=null;["q","fo","fl","fs","ft","fb","y1","y2"].forEach(id=>$(id).value="");man=null;run()};
let qi;$("q").oninput=()=>{clearTimeout(qi);qi=setTimeout(()=>{man=null;run()},200)};
run();
};
