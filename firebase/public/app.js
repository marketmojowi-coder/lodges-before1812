// Lodges Before 1812: index, profiles, census tables. startApp(DATA) is called by auth.js after a paid member signs in.
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
opts($("fs"),R.map(r=>r.s));const RPS=DATA.repos;Object.entries(RPS).forEach(([k,v])=>{if(!v.n)return;const o=document.createElement("option");o.value=k;o.textContent=`${v.name} (${v.n})`;$("fo").appendChild(o)});opts($("ft"),R.flatMap(r=>r.tr));opts($("fb"),R.flatMap(r=>r.b));
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
  const ROTP=Object.values(DATA.repos),ND=DATA.docs.length,NC=DATA.repos.BOOK?DATA.repos.BOOK.n:0,ys=R.flatMap(r=>r.y).filter(y=>y>=1750&&y<=1830);
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
  let h=`${$("ft").value?`<p><button class="copy" type="button" id="totrade">Open the ${esc($("ft").value)} table: men by first appearance, linked to their profiles</button></p>`:""}<p class="stats">${last.length.toLocaleString()} records${man!==null?` naming <b>${esc(M[man].n)}</b> <button class="linkbtn" id="unman" type="button">(show all men)</button>`:""}</p>`;
  for(const r of last.slice(0,shown)){
    const rest=r.f.slice(1).filter(([k])=>k!=="Source").map(([k,v])=>`<b>${esc(k)}:</b> ${hi(v,T)}`).join(" · ");
    h+=`<article class="res"><div class="crumb"><span class="pill">${esc(r.k)}</span><span>${esc(r.s)}</span><span>›</span><span>${esc(r.t)}</span>${r.y.length?`<span>· ${r.y[0]}${r.y.length>1&&r.y.at(-1)!==r.y[0]?"–"+r.y.at(-1):""}</span>`:""}</div>
    <h3>${hi(r.f[0][1],T)}</h3><p class="snip">${rest}</p>
    ${r.l.length?`<div class="lodgetag">${r.lv?"Lodges of the men named: ":"Lodge: "}${esc(r.l.join("; "))}</div>`:""}
    ${r.m.length?`<div class="chipline">${r.m.slice(0,8).map(i=>`<button class="chip${i===man?" on":""}" type="button" data-m="${i}">${esc(M[i].n)}</button>`).join("")}</div>`:""}
    <div class="cite">${esc(bookRefs([r.c])||r.c)}</div>${orig(r)}
    <button class="copy" type="button" data-c="${R.indexOf(r)}">Copy citation</button>
    <details><summary>All fields</summary><dl>${r.f.map(([k,v])=>`<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl></details></article>`;
  }
  if(last.length>shown)h+=`<button class="more" id="more" type="button">More records (${(last.length-shown).toLocaleString()} left)</button>`;
  o.innerHTML=h;
  o.querySelectorAll("[data-d]").forEach(b=>b.onclick=()=>{docSel=+b.dataset.d;man=null;$("q").value="";run();window.scrollTo({top:0})});
  o.querySelectorAll("[data-c]").forEach(b=>b.onclick=()=>{const t=citeText(R[+b.dataset.c]);(navigator.clipboard?navigator.clipboard.writeText(t):Promise.reject()).then(()=>{b.textContent="Copied"},()=>{prompt("Copy this citation:",t)})});
  const tt=$("totrade");if(tt)tt.onclick=()=>{const t=$("ft").value;show("index");ix("trades",t)};
  const mb=$("more");if(mb)mb.onclick=()=>{shown+=25;render(T)};
  const u=$("unman");if(u)u.onclick=()=>{man=null;run()};
  o.querySelectorAll("[data-m]").forEach(b=>b.onclick=()=>pick(+b.dataset.m));
}
function orig(r){const p=DATA.repos[r.o];if(!p)return"";
  if(r.d!=null){const d=DATA.docs[r.d];return `<div class="orig"><b>Original:</b> ${esc(d.x.replace(/\.$/,""))}${r.dl?", "+esc(r.dl):""}. <span class="acc">${esc(p.access)}</span> <button class="linkbtn" type="button" data-d="${r.d}">All ${d.n} records from this document</button></div>`}
  if(r.o==="BOOK")return `<div class="orig"><b>Original:</b> <span class="acc">${esc(p.access)}</span></div>`;
  return `<div class="orig"><b>Original:</b> ${esc(r.od&&r.od!==r.c?r.od:p.cite||r.od)}${r.oh?`. <b>Held at:</b> ${esc(r.oh)}`:""}. <span class="acc">${esc(p.access)}</span></div>`}
function citeText(r){const p=DATA.repos[r.o];let t=r.c.replace(/\.$/,"");if(r.d!=null)return t+". Original: "+DATA.docs[r.d].x.replace(/\.$/,"")+(r.dl?", "+r.dl:"")+".";if(r.o!=="BOOK"&&r.od&&!r.c.includes(r.od))t+=`. Original: ${r.od}${r.oh?", "+r.oh:""}`;return t+"."}
function pick(i){profile(i)}
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
$("f").onsubmit=e=>{e.preventDefault();man=null;show("search");run()};
["fo","fl","fs","ft","fb"].forEach(id=>$(id).onchange=run);["y1","y2"].forEach(id=>$(id).oninput=run);
$("clr").onclick=()=>{docSel=null;["q","fo","fl","fs","ft","fb","y1","y2"].forEach(id=>$(id).value="");man=null;run()};
let qi;$("q").oninput=()=>{clearTimeout(qi);qi=setTimeout(()=>{man=null;if($("q").value.trim())show("search");run()},250)};
run();

/* ---------- Views ---------- */
document.querySelectorAll(".tab").forEach(b=>b.onclick=()=>show(b.dataset.v));
function show(v){document.querySelectorAll(".tab").forEach(t=>t.classList.toggle("on",t.dataset.v===v));
  ["index","man","search","build","compare","atlas"].forEach(k=>$("v-"+k).hidden=v!==k);$("filt").hidden=v!=="search";
  if(v==="build")tb();if(v==="compare")cp();if(v==="atlas")atlas();window.scrollTo({top:0});}
/* ---------- Table builder (men named in the returns and rolls) ---------- */
const C=DATA.census, LN=C.lodges, OC=C.occn, OFF=new Set(C.officer), MUL=new Set(C.multi_men);
const occOf=i=>C.mocc[i]||[];
const DIMS={year:{n:"Year",v:o=>[o[2]]},period:{n:"Period (5 years)",v:o=>{const a=o[2]-(o[2]-1785)%5;return[`${a}–${a+4}`]}},
  lodge:{n:"Lodge",v:o=>[LN[o[1]]]},place:{n:"Place",v:o=>[C.place_of[o[1]]]},
  calling:{n:"Calling",v:o=>{const c=occOf(o[0]);return c.length?c.map(k=>OC[k]):["No calling recorded"]}},
  officer:{n:"Held a lodge office",v:o=>[OFF.has(o[0])?"Officer":"Not recorded as officer"]},
  multi:{n:"Lodges joined",v:o=>[MUL.has(o[0])?"More than one lodge":"One lodge"]}};
["tb-r","tb-c"].forEach((id,k)=>{const sel=$(id);if(k)sel.add(new Option("None",""));Object.entries(DIMS).forEach(([key,d])=>sel.add(new Option(d.n,key)))});
$("tb-r").value="year";$("tb-c").value="lodge";
LN.forEach((l,i)=>$("tb-l").add(new Option(l,i)));OC.forEach((o,i)=>$("tb-o").add(new Option(o,i)));
try{const h=new URLSearchParams(location.hash.slice(1));if(h.get("t")){[["m","tb-m"],["r","tb-r"],["c","tb-c"],["l","tb-l"],["o","tb-o"],["y1","tb-y1"],["y2","tb-y2"]].forEach(([k,id])=>{if(h.has(k))$(id).value=h.get(k)});setTimeout(()=>show("build"))}}catch(_){}
["tb-m","tb-r","tb-c","tb-l","tb-o"].forEach(id=>$(id).onchange=tb);["tb-y1","tb-y2"].forEach(id=>$(id).oninput=tb);
let TB=null;
function tb(){
  const m=$("tb-m").value,r=$("tb-r").value,c=$("tb-c").value,l=$("tb-l").value,oc=$("tb-o").value,y1=+$("tb-y1").value||0,y2=+$("tb-y2").value||9999;
  const cells=new Map(),rowT=new Map(),colT=new Map(),all=new Set();let allMY=0;
  const add=(map,k,i,key)=>{if(!map.has(k))map.set(k,m==="men"?new Set():{n:0});const x=map.get(k);if(m==="men")x.add(i);else x.n++};
  for(const o of C.obs){
    if(o[2]<y1||o[2]>y2)continue;if(l!==""&&o[1]!==+l)continue;
    if(oc!==""){const cs=occOf(o[0]);if(oc==="-1"?cs.length:!cs.includes(+oc))continue}
    const rv=DIMS[r].v(o),cv=c?DIMS[c].v(o):["Total"];
    for(const a of rv){add(rowT,a,o[0]);for(const b of cv){add(cells,a+"\u0001"+b,o[0])}}
    for(const b of cv)add(colT,b,o[0]);all.add(o[0]);allMY++;
  }
  const val=x=>x?(m==="men"?x.size:x.n):0;
  const sortK=(a,b)=>(typeof a==="number"||/^\d/.test(a))&&(typeof b==="number"||/^\d/.test(b))?String(a).localeCompare(String(b),undefined,{numeric:true}):(LN.indexOf(a)>=0&&LN.indexOf(b)>=0?LN.indexOf(a)-LN.indexOf(b):String(a).localeCompare(String(b)));
  const rows=[...rowT.keys()].sort(sortK),cols=[...colT.keys()].sort(sortK);
  TB={rows,cols,cells,val,rowT,colT,r,c,m,total:m==="men"?all.size:allMY};
  let h=`<table class="stt"><thead><tr><th>${esc(DIMS[r].n)}</th>${c?cols.map(k=>`<th>${esc(k)}</th>`).join(""):""}<th>${c?"All":m==="men"?"Men":"Man-years"}</th></tr></thead><tbody>`;
  for(const a of rows)h+=`<tr><td>${esc(a)}</td>${c?cols.map(b=>`<td>${val(cells.get(a+"\u0001"+b))||""}</td>`).join(""):""}<td><b>${val(rowT.get(a))}</b></td></tr>`;
  h+=`</tbody><tfoot><tr><td>All</td>${c?cols.map(b=>`<td>${val(colT.get(b))}</td>`).join(""):""}<td>${TB.total}</td></tr></tfoot></table>`;
  $("tb-table").innerHTML=rows.length?h:`<p class="empty">Nothing matches these filters.</p>`;
  $("tb-note").textContent=m==="men"?"Each man is counted once in a row or column even if he appears in several years or lodges, so rows can add up to more than the total.":"A man counts once for each year and lodge in which a return or roll names him.";
  chart(rows.map(a=>[a,val(rowT.get(a))]),DIMS[r].n,m==="men"?"men":"man-years");
}
function chart(pts,dim,unit){
  const el=$("tb-chart");el.innerHTML="";if(!pts.length)return;
  const W=Math.max(320,el.clientWidth||600),H=200,P={l:34,r:6,t:8,b:pts.length>12?44:28},iw=W-P.l-P.r,ih=H-P.t-P.b;
  const mx=Math.max(...pts.map(p=>p[1]))||1,step=Math.pow(10,Math.floor(Math.log10(mx))),nice=Math.ceil(mx/step)*step;
  const bw=iw/pts.length,gap=Math.min(2,bw*.2);
  const NS="http://www.w3.org/2000/svg",svg=document.createElementNS(NS,"svg");svg.setAttribute("viewBox",`0 0 ${W} ${H}`);svg.setAttribute("role","img");svg.setAttribute("aria-label",`${unit} by ${dim}`);
  const mk=(t,a)=>{const e=document.createElementNS(NS,t);for(const k in a)e.setAttribute(k,a[k]);svg.appendChild(e);return e};
  for(let k=0;k<=4;k++){const v=nice*k/4,y=P.t+ih-ih*v/nice;mk("line",{x1:P.l,x2:W-P.r,y1:y,y2:y,class:"gl"});const t=mk("text",{x:P.l-4,y:y+3,"text-anchor":"end"});t.textContent=Math.round(v)}
  const tip=document.createElement("div");tip.className="tip";tip.hidden=true;
  pts.forEach(([k,v],i)=>{const x=P.l+i*bw+gap/2,h=ih*v/nice,y=P.t+ih-h,w=Math.max(1,bw-gap),r=Math.min(4,w/2,h);
    const path=h>0?`M${x},${P.t+ih}V${y+r}Q${x},${y} ${x+r},${y}H${x+w-r}Q${x+w},${y} ${x+w},${y+r}V${P.t+ih}Z`:"";
    const b=mk("path",{d:path,class:"bar",tabindex:0});
    const hit=mk("rect",{class:"hit",x:P.l+i*bw,y:P.t,width:bw,height:ih,fill:"transparent"});
    const showTip=()=>{tip.hidden=false;tip.innerHTML="";const s=document.createElement("b");s.textContent=v+" "+unit;tip.append(s,document.createTextNode(String(k)));
      const bx=el.getBoundingClientRect(),sx=bx.width/W;tip.style.left=Math.min(bx.width-120,Math.max(0,(x+w/2)*sx-40))+"px";tip.style.top=Math.max(0,y*sx-46)+"px"};
    [b,hit].forEach(e=>{e.addEventListener("pointermove",showTip);e.addEventListener("focus",showTip);e.addEventListener("pointerleave",()=>tip.hidden=true);e.addEventListener("blur",()=>tip.hidden=true)});
    const every=Math.ceil(pts.length/(W/38));
    if(i%every===0){const t=mk("text",{x:x+w/2,y:H-P.b+14,"text-anchor":pts.length>12?"end":"middle",transform:pts.length>12?`rotate(-40 ${x+w/2} ${H-P.b+14})`:""});t.textContent=String(k).length>14?String(k).slice(0,13)+"…":k}
  });
  el.appendChild(svg);el.appendChild(tip);
}
$("tb-csv").onclick=()=>{if(!TB)return;const q=v=>`"${String(v).replace(/"/g,'""')}"`;
  const lines=[[DIMS[TB.r].n,...(TB.c?TB.cols:[]),"All"].map(q).join(",")];
  for(const a of TB.rows)lines.push([a,...(TB.c?TB.cols.map(b=>TB.val(TB.cells.get(a+"\u0001"+b))):[]),TB.val(TB.rowT.get(a))].map(q).join(","));
  lines.push(["All",...(TB.c?TB.cols.map(b=>TB.val(TB.colT.get(b))):[]),TB.total].map(q).join(","));
  lines.push("");lines.push(q("Lodges Before 1812. "+(TB.m==="men"?"Men":"Man-years")+" named in the surviving returns and rolls. Sources: Grand Lodge of Maryland returns (Stephen J. Ponzillo Jr. Memorial Library and Museum) and the series lodge rolls (Thomas M. Saharsky, 2026)."));
  const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([lines.join("\n")],{type:"text/csv"}));a.download="lodges_before_1812_table.csv";a.click();};
$("tb-link").onclick=()=>{const p=new URLSearchParams({t:1,m:$("tb-m").value,r:$("tb-r").value,c:$("tb-c").value,l:$("tb-l").value,o:$("tb-o").value,y1:$("tb-y1").value,y2:$("tb-y2").value});
  const u=location.href.split("#")[0]+"#"+p;try{history.replaceState(null,"","#"+p)}catch(_){}
  (navigator.clipboard?navigator.clipboard.writeText(u):Promise.reject()).then(()=>$("tb-link").textContent="Link copied",()=>prompt("Copy this link:",u))};
/* ---------- Compare lodges (QuickFacts style) ---------- */
let CP=[3,4,5];
function cp(){
  $("cp-pick").innerHTML=LN.map((l,i)=>`<button type="button" class="chip${CP.includes(i)?" on":""}" data-i="${i}">${esc(l)}</button>`).join("");
  $("cp-pick").querySelectorAll("[data-i]").forEach(b=>b.onclick=()=>{const i=+b.dataset.i;CP=CP.includes(i)?CP.filter(x=>x!==i):(CP.length<4?[...CP,i]:CP);cp()});
  const facts=CP.map(i=>{const ob=C.obs.filter(o=>o[1]===i),men=new Set(ob.map(o=>o[0])),ys={};ob.forEach(o=>{(ys[o[2]]=ys[o[2]]||new Set()).add(o[0])});
    const yk=Object.keys(ys).map(Number).sort((a,b)=>a-b),peak=yk.reduce((a,y)=>ys[y].size>(ys[a]?.size||0)?y:a,yk[0]);
    const cc={};men.forEach(m=>occOf(m).forEach(k=>cc[k]=(cc[k]||0)+1));const top=Object.entries(cc).sort((a,b)=>b[1]-a[1])[0];
    const known=[...men].filter(m=>occOf(m).length).length,L=DATA.lodges.find(x=>x.n===LN[i])||{};
    return {"Place":C.place_of[i],"Men named in returns and rolls":men.size,"Years with a surviving return or roll":yk.length,"First and last such year":yk.length?yk[0]+"–"+yk.at(-1):"–",
      "Largest year":yk.length?`${peak} (${ys[peak].size} men)`:"–","Average men per return year":yk.length?(ob.length/yk.length).toFixed(1):"–",
      "Men with a recorded calling":men.size?`${known} (${Math.round(100*known/men.size)}%)`:"–","Most common calling":top?`${OC[top[0]]} (${top[1]})`:"–",
      "Men who held an office":[...men].filter(m=>OFF.has(m)).length,"Men also in another lodge":[...men].filter(m=>MUL.has(m)).length,
      "Original documents cited":L.d||"–","Records in the data set":(L.r||0).toLocaleString()}});
  const keys=facts.length?Object.keys(facts[0]):[];
  $("cp-table").innerHTML=facts.length?`<table class="stt"><thead><tr><th></th>${CP.map(i=>`<th>${esc(LN[i])}</th>`).join("")}</tr></thead><tbody>${keys.map(k=>`<tr><td>${esc(k)}</td>${facts.map(f=>`<td>${esc(f[k])}</td>`).join("")}</tr>`).join("")}</tbody></table>`:`<p class="empty">Tick a lodge.</p>`;
}

/* ---------- Index: buttons into the main categories ---------- */
const PRIM=r=>r.o!=="BOOK"&&r.o!=="AUTHOR_WB";
const MP=M.map(()=>({p:[],x:[]}));R.forEach((r,k)=>r.m.forEach(i=>(PRIM(r)?MP[i].p:MP[i].x).push(k)));
const ND=M.map((m,i)=>new Set(MP[i].p.map(k=>R[k].d??("o"+R[k].o))).size);
const callings=i=>occOf(i).map(k=>OC[k]);
const tradeLine=i=>{const m=M[i],c=callings(i);return m.tr||m.tg||c.join("; ")};
function nameBtns(list){return `<div class="names">${list.map(i=>{const m=M[i];const t=tradeLine(i);return `<button type="button" data-m="${i}">${esc(m.n)}<small>${esc([t,m.l.join(", ")].filter(Boolean).join(" · "))}${ND[i]?` · ${ND[i]} original document${ND[i]>1?"s":""}`:""}</small></button>`}).join("")}</div>`}
function wire(el){el.querySelectorAll("[data-m]").forEach(b=>b.onclick=()=>profile(+b.dataset.m));
  el.querySelectorAll("[data-yr]").forEach(b=>b.onclick=()=>{goSearch({y1:b.dataset.yr,y2:b.dataset.yr})});
  el.querySelectorAll("[data-bd]").forEach(b=>b.onclick=()=>goSearch({fb:b.dataset.bd}));
  el.querySelectorAll("[data-dc]").forEach(b=>b.onclick=()=>{goSearch({});docSel=+b.dataset.dc;run()});
  el.querySelectorAll("[data-ix]").forEach(b=>b.onclick=()=>ix(b.dataset.ix,b.dataset.arg));}
function goSearch(f){docSel=null;man=null;["q","fo","fl","fs","ft","fb","y1","y2"].forEach(id=>$(id).value=f[id]||"");show("search");run()}
const CU=(C.culture||[]);
const CSHORT={"Irish":"Irish by birth or descent","Scottish":"Scottish by birth or descent","German":"Of German descent","French":"French by birth or descent","English":"English by birth",
  "Christ Church":"In Christ Church pews and vestries","Presbyterian":"Presbyterian trustees and ministers","Catholic":"Tied to a Catholic church","Clergy":"Clergymen among the brethren",
  "Public office":"In public office or law","Newspapers":"Named in the newspapers","Enslaved labour":"Hired out enslaved labourers"};
let POOL=[],RI=0,RT=null,ROTP=false;
const tile=(n,label,detail,tag)=>`<div class="tile">${tag?`<span class="tg">${esc(tag)}</span>`:""}<b>${n}</b><span class="lb">${esc(label)}</span><span class="dt">${detail}</span></div>`;
const few=(ids,k)=>ids.slice(0,k).map(i=>`<button type="button" data-m="${i}">${esc(M[i].n)}</button>`).join(", ")+(ids.length>k?` and ${ids.length-k} more`:"");
function highlights(){
  const top=M.map((m,i)=>i).sort((a,b)=>ND[b]-ND[a]||MP[b].p.length-MP[a].p.length)[0];
  const big=C.years.reduce((a,y)=>y.t>a.t?y:a,C.years[0]),three=M.map((m,i)=>i).filter(i=>M[i].l.length>=3);
  POOL=[...CU.map((c,j)=>[c.men.length,CSHORT[c.k]||c.k,`${few(c.men,2)} · <button type="button" data-ix="culture" data-arg="${j}">sources</button>`,c.g]),
    [C.occ[0][1],C.occ[0][0]+": the most common calling",`then ${esc(C.occ[1][0].toLowerCase())} (${C.occ[1][1]}) and ${esc(C.occ[2][0].toLowerCase())} (${C.occ[2][1]})`,"Work"],
    [C.multi,"Men in two or more lodges",three.length?`${three.length} in three: ${few(three,2)}`:"","Lodges"],
    [ND[top],"Originals naming one man",`the best documented: ${few([top],1)}`,"Records"]];
  $("ix-hi").innerHTML=`<h2 class="sec">At a glance</h2><div class="tiles">
  ${tile(M.length,"Men on the lodge rolls",`${C.occ_known} with a recorded calling`)}
  ${tile(DATA.docs.length,"Original documents",`held in ${Object.values(DATA.repos).filter(v=>v.nd).length} archives`)}
  ${tile(big.t,`Men on the returns in ${big.y}`,`the fullest year, ${C.years[0].y}–${C.years.at(-1).y}`)}
  <div class="tile rot" id="rot1"></div><div class="tile rot" id="rot2"></div><div class="tile rot" id="rot3"></div></div>
  <div class="rotctl"><button type="button" class="c" id="rprev" aria-label="Previous figures">‹</button><button type="button" class="c" id="rpause"></button><button type="button" class="c" id="rnext" aria-label="Next figures">›</button><span>Culture and community figures, ${RI/3+1|0} of ${Math.ceil(POOL.length/3)}</span></div>`;
  wire($("ix-hi"));
  $("rprev").onclick=()=>{RI=(RI-3+POOL.length*3)%POOL.length;stopRot();rotDraw()};$("rnext").onclick=()=>{RI=(RI+3)%POOL.length;stopRot();rotDraw()};
  $("rpause").onclick=()=>{ROTP?startRot():stopRot();rotDraw()};
  const box=$("ix-hi");box.onmouseenter=()=>clearInterval(RT);box.onmouseleave=()=>{if(!ROTP)startRot()};box.addEventListener("focusin",()=>clearInterval(RT));
  if(matchMedia("(prefers-reduced-motion: reduce)").matches)ROTP=true;else startRot();rotDraw()}
function rotDraw(){if(!POOL.length||!$("rot1"))return;[0,1,2].forEach(j=>{const x=POOL[(RI+j)%POOL.length],el=$("rot"+(j+1));el.innerHTML=tile(x[0],x[1],x[2],x[3]).replace(/^<div class="tile">|<\/div>$/g,"");wire(el)});
  $("rpause").textContent=ROTP?"▶":"❚❚";$("rpause").setAttribute("aria-label",ROTP?"Play":"Pause");
  $("ix-hi").querySelector(".rotctl span").textContent=`Culture and community figures, ${Math.floor(RI/3)+1} of ${Math.ceil(POOL.length/3)}`}
function startRot(){ROTP=false;clearInterval(RT);RT=setInterval(()=>{if(document.hidden||$("v-index").hidden)return;RI=(RI+3)%POOL.length;rotDraw()},7000)}
function stopRot(){ROTP=true;clearInterval(RT)}
let IX="men";
function ix(k,arg){if(k==="atlas"){show("atlas");return}IX=k;document.querySelectorAll("#ix-btns [data-ix]").forEach(b=>b.classList.toggle("on",b.dataset.ix===k));
  const P=$("ix-panel");let h="";
  if(k==="men"){const sn=m=>(m.n.replace(/\(.*?\)+/g," ").replace(/\s+of\s+\S+$/i,"").replace(/,?\s*\b(Jr|Junr|Sr|Senr|Scnr|Junior|Senior)\b\.?/ig,"").replace(/^(Dr|Rev|Capt|Wm)\.?\s+/i,"").trim().split(/\s+/).at(-1)||m.n).replace(/^[^A-Za-z]+/,"");
    const L=arg||"A",ls=[...new Set(M.map(m=>sn(m)[0]?.toUpperCase()).filter(Boolean))].sort();
    const list=M.map((m,i)=>i).filter(i=>sn(M[i])[0]?.toUpperCase()===L).sort((a,b)=>sn(M[a]).localeCompare(sn(M[b]))||M[a].n.localeCompare(M[b].n));
    h=`<div class="letters">${ls.map(l=>`<button type="button" data-ix="men" data-arg="${l}" class="${l===L?"on":""}">${l}</button>`).join("")}</div><p class="stats">${list.length} men, by surname</p>${nameBtns(list)}`}
  if(k==="trades"){if(arg!==undefined){P.innerHTML="";tradeTable(arg);return}
    const rc={};R.forEach(r=>r.tr.forEach(t=>rc[t]=(rc[t]||0)+1));
    h=`<p class="stats">Trades and callings as the records give them, grouped. Each opens a table of the men, in order of first appearance, with every record behind it.</p><div class="ixbtns">${OC.map(n=>[n,(C.occ.find(x=>x[0]===n)||[0,0])[1],rc[n]||0]).sort((a,b)=>b[2]-a[2]).map(([n,v,r])=>`<button type="button" data-ix="trades" data-arg="${esc(n)}">${esc(n)}<br><small>${v} men by calling · ${r} records</small></button>`).join("")}</div>`}
  if(k==="lodges"){if(arg!==undefined){const l=DATA.lodges.find(x=>x.n===arg)||{},ci=LN.indexOf(arg);
      const list=M.map((m,i)=>i).filter(i=>M[i].l.includes(arg)).sort((a,b)=>M[a].n.localeCompare(M[b].n));
      const ys=ci>=0?C.years.filter(y=>y.c[ci]).map(y=>`${y.y}: ${y.c[ci]}`).join(" · "):"";
      h=`<button class="linkbtn back" type="button" data-ix="lodges">‹ All lodges</button><h3 class="h3s">${esc(arg)}</h3>
      <div class="facts"><div><div class="k">Men</div>${list.length}</div><div><div class="k">Original documents</div>${l.d||"–"}</div><div><div class="k">Years</div>${l.y0?l.y0+"–"+l.y1:"–"}</div><div><div class="k">Met at</div>${esc(C.place_of[ci]||"–")}</div></div>
      ${ys?`<p class="stats">Men on the returns by year: ${ys}</p>`:""}${nameBtns(list)}`}
    else h=`<div class="ixbtns">${DATA.lodges.map(l=>`<button type="button" data-ix="lodges" data-arg="${esc(l.n)}">${esc(l.n)}<br><small>${l.men} men${l.y0?` · ${l.y0}–${l.y1}`:""}</small></button>`).join("")}</div>`}
  if(k==="culture"){const c=CU[+arg||0];
    h=`<button class="linkbtn back" type="button" data-ix="trades">‹ Trades and callings</button><div class="ixbtns">${CU.map((x,j)=>`<button type="button" data-ix="culture" data-arg="${j}" class="${x===c?"on":""}">${esc(x.k)}<br><small>${x.men.length} men · ${esc(x.g)}</small></button>`).join("")}</div>
    <h3 class="h3s">${esc(c.k)}: ${c.men.length} ${esc(c.t)}</h3><p class="stats">Only explicit statements count. Each line gives the words of the record and where they come from. Heritage from the 2019 research workbook is the author's research notes, not a primary source.</p>
    <div class="tscroll"><table class="stt"><thead><tr><th>Man</th><th>Lodges</th><th>Evidence</th><th>Source</th></tr></thead><tbody>${c.men.map(i=>`<tr><td><button type="button" class="linkbtn" data-m="${i}">${esc(M[i].n)}</button></td><td>${esc(M[i].l.join("; "))}</td><td style="text-align:left">${esc(c.ev[i][0])}</td><td style="text-align:left">${esc(bookRefs([c.ev[i][1]])||c.ev[i][1])}</td></tr>`).join("")}</tbody></table></div>`;
    document.querySelectorAll("#ix-btns [data-ix]").forEach(b=>b.classList.remove("on"))}
  if(k==="years")h=`<p class="stats">Men named on the surviving returns and rolls each year. Tap a year for its records.</p><div class="ixbtns">${C.years.map(y=>`<button type="button" data-yr="${y.y}">${y.y}<br><small>${y.t} men</small></button>`).join("")}</div>`;
  if(k==="buildings"){const c={};R.forEach(r=>r.b.forEach(b=>c[b]=(c[b]||0)+1));h=`<div class="ixbtns">${Object.entries(c).sort((a,b)=>b[1]-a[1]).map(([b,n])=>`<button type="button" data-bd="${esc(b)}">${esc(b)}<br><small>${n} records</small></button>`).join("")}</div>`}
  if(k==="docs"){h=Object.entries(DATA.repos).filter(([o,v])=>v.nd).map(([o,v])=>`<h3 class="h3s">${esc(v.name)}</h3><p class="stats">${esc(v.holder||"")} ${esc(v.access||"")}</p><div class="rows">${DATA.docs.map((d,i)=>[d,i]).filter(([d])=>d.o===o).map(([d,i])=>`<button type="button" data-dc="${i}"><span>${esc(d.x.replace(/^.*?, (?=[A-Z][a-z]+ of|Proceedings|Return|Roster)/,""))}</span><span>${d.n}</span></button>`).join("")}</div>`).join("")}
  P.innerHTML=h;wire(P)}

/* ---------- Trade table: men in order of first appearance, then every record by date ---------- */
function sortable(id,cols,rows,sortIx,asc){const el=$(id);let k=sortIx,up=asc;
  const draw=()=>{const rs=[...rows].sort((a,b)=>{const x=a[k].s??a[k].v,y=b[k].s??b[k].v;return (typeof x==="number"&&typeof y==="number"?x-y:String(x).localeCompare(String(y),undefined,{numeric:true}))*(up?1:-1)});
    el.innerHTML=`<table class="stt"><thead><tr>${cols.map((c,i)=>`<th><button type="button" class="linkbtn sorth" data-k="${i}" aria-sort="${i===k?(up?"ascending":"descending"):"none"}">${esc(c)}${i===k?(up?" ▲":" ▼"):""}</button></th>`).join("")}</tr></thead><tbody>${rs.map(r=>`<tr>${r.map(c=>`<td>${c.h??esc(c.v)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
    el.querySelectorAll(".sorth").forEach(b=>b.onclick=()=>{const i=+b.dataset.k;up=i===k?!up:true;k=i;draw()});wire(el)};draw()}
function tradeTable(t){
  const recs=R.map((r,k)=>[r,k]).filter(([r])=>r.tr.includes(t));
  const ci=OC.indexOf(t),men=new Map();
  const get=i=>{if(!men.has(i))men.set(i,{cal:false,rec:[],y:[],pd:new Set()});return men.get(i)};
  if(ci>=0)M.forEach((m,i)=>{if(occOf(i).includes(ci))get(i).cal=true});
  recs.forEach(([r,k])=>r.m.forEach(i=>{const x=get(i);x.rec.push(k);r.y.forEach(y=>{if(y>=1750&&y<=1830)x.y.push(y)});if(PRIM(r))x.pd.add(r.d??("o"+r.o))}));
  men.forEach((x,i)=>{C.obs.forEach(o=>{if(o[0]===i)x.y.push(o[2])})});
  const docs=new Set(recs.filter(([r])=>PRIM(r)).map(([r])=>r.d??("o"+r.o)));
  const mrows=[...men].map(([i,x])=>{const y0=x.y.length?Math.min(...x.y):9999,y1=x.y.length?Math.max(...x.y):0,m=M[i];
    return [{v:y0<9999?y0:"–",s:y0},{v:m.n,h:`<button type="button" class="linkbtn" data-m="${i}">${esc(m.n)}</button>`},{v:y1?y1:"–",s:y1},
      {v:m.tr||m.tg||"–"},{v:m.l.join("; ")},{v:x.rec.length,s:x.rec.length},{v:x.pd.size,s:x.pd.size},{v:x.cal&&x.rec.length?"Calling and records":x.cal?"Calling on the rolls":"Named in the records"}]});
  const yof=r=>r.y.find(y=>y>=1750&&y<=1830)||+((r.t.match(/\b1[78]\d\d\b/)||(r.d!=null&&DATA.docs[r.d].x.match(/\b1[78]\d\d\b/))||(r.od||"").match(/\b1[78]\d\d\b/)||r.c.match(/\b1[789]\d\d\b(?!-)/)||[0])[0])||0;
  const rrows=recs.map(([r,k])=>{const y=yof(r);const src=r.d!=null?DATA.docs[r.d].x:(PRIM(r)?(r.od||r.c):r.c);
    return [{v:y||"–",s:y||9999},{v:r.f[0][1]},{v:r.t},{v:"",h:r.m.map(i=>`<button type="button" class="linkbtn" data-m="${i}">${esc(M[i].n)}</button>`).join(", ")||"–",s:r.m.map(i=>M[i].n).join()},
      {v:PRIM(r)?"Original":"Cross-reference"},{v:src.replace(/\.$/,"")}]});
  $("ix-panel").innerHTML=`<button class="linkbtn back" type="button" data-ix="trades">‹ All trades</button>
  <h3 class="h3s">${esc(t)}</h3>
  <div class="statgrid"><div><b>${men.size}</b><span>men</span></div><div><b>${recs.length}</b><span>records</span></div><div><b>${docs.size}</b><span>original documents</span></div><div><b>${recs.length-recs.filter(([r])=>PRIM(r)).length}</b><span>cross-references</span></div></div>
  <p class="stats">Men in this trade, by first appearance. A man is here if the rolls give him this calling or a record of this trade names him. Tap a column to sort; tap a name for his profile.</p>
  <div class="tscroll" id="tt-men"></div>
  <h3 class="h3s">Every record, by date</h3>
  <p class="stats">"Original" rows come from a surviving document (cited in full); "Cross-reference" rows are entries compiled in the series books.</p>
  <div class="tscroll" id="tt-recs"></div>
  <button class="copy" type="button" id="tt-csv">Download CSV</button>`;
  wire($("ix-panel"));
  sortable("tt-men",["First year","Man","Last year","Trade as written","Lodges","Records","Originals","Basis"],mrows,0,true);
  sortable("tt-recs",["Year","Record","Table","Men named","Kind","Source"],rrows,0,true);
  $("tt-csv").onclick=()=>{const q=v=>`"${String(v).replace(/"/g,'""')}"`;const L=[["First year","Man","Last year","Trade as written","Lodges","Records","Originals","Basis"].map(q).join(",")];
    mrows.sort((a,b)=>a[0].s-b[0].s).forEach(r=>L.push(r.map(c=>q(c.v)).join(",")));L.push("");L.push(["Year","Record","Table","Men named","Kind","Source"].map(q).join(","));
    recs.forEach(([r],j)=>{const x=rrows[j];L.push([x[0].v,x[1].v,x[2].v,r.m.map(i=>M[i].n).join("; "),x[4].v,x[5].v].map(q).join(","))});
    const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([L.join("\n")],{type:"text/csv"}));a.download=`lodges_before_1812_${t.replace(/\W+/g,"_")}.csv`;a.click()};
}

/* Book references, reconciled: one entry per book, its tables listed once. */
function bookRefs(cs){const by=new Map();
  for(const c of cs)for(const seg of String(c).split(/;\s*/)){const m=seg.match(/^(Thomas M\. Saharsky, .*?\((?:Lulu, )?\d{4}\))(.*)$/);if(!m)continue;
    const loc=m[2].replace(/\(A\.L\. \d+\)/g,"").replace(/^[,\s]+|[,\s.]+$/g,"").replace(/\s+,/g,",").replace(/\s{2,}/g," ");
    if(!by.has(m[1]))by.set(m[1],new Set());if(loc)by.get(m[1]).add(loc)}
  return [...by].map(([b,ls])=>b.replace(/(\d{4})-(\d{4})/g,"$1–$2")+(ls.size?", "+[...ls].join("; "):"")+".").join(" ")}
function heldAt(r){const p=DATA.repos[r.o]||{};const h=r.oh||p.holder||"";const a=(p.access||"").split(/(?<=\.)\s+/).filter(x=>!/library\.?$/i.test(x)).join(" ");return (h?`Held at ${h.replace(/\.$/,"")}. `:"")+a}


/* ---------- Icons and the reader ---------- */
const ICP={"Fraternal":'<path d="M8 2L3 14M8 2l5 12M2.5 9.5L8 13l5.5-3.5"/>',"Military":'<circle cx="8" cy="3.5" r="1.5"/><path d="M8 5v9M5 7.5h6M3 10.5a5 4 0 0 0 10 0"/>',
 "Civic":'<path d="M2 6l6-4 6 4M3 6v7M6.3 6v7M9.7 6v7M13 6v7M2 14h12"/>',"Life and death":'<path d="M4 2h8M4 14h8M5 2c0 4 6 4 6 6s-6 2-6 6M11 2c0 4-6 4-6 6s6 2 6 6"/>',
 "Work":'<path d="M3 13l6-6M7 3l3-1 4 4-1 3-2-2-2 2-2-2 2-2z"/>',"Church":'<path d="M8 1v4M6.5 2.5h3M4 14V8l4-3 4 3v6zM7 14v-3h2v3"/>'};
const ICK={doc:'<path d="M4 1.5h5.5L12.5 4.5V14.5h-8.5zM9.5 1.5v3h3M6 8h5M6 10.5h5"/>',news:'<path d="M2 3h10v10H3.5A1.5 1.5 0 0 1 2 11.5zM12 6h2v5.5a1.5 1.5 0 0 1-3 0M4 5.5h6M4 8h6M4 10.5h4"/>',
 map:'<path d="M1.5 3.5l4-1.5 5 1.5 4-1.5v10.5l-4 1.5-5-1.5-4 1.5zM5.5 2v10.5M10.5 3.5V14"/>',pic:'<rect x="1.5" y="3" width="13" height="10" rx="1"/><circle cx="5.5" cy="6.5" r="1.3"/><path d="M2 12l4-4 3 3 2-2 3.5 3.5"/>',
 note:'<path d="M3 13l1-3 7-7 2 2-7 7zM9.5 4.5l2 2M2 14.5h12"/>',book:'<path d="M2 3c2-1 4-1 6 .5 2-1.5 4-1.5 6-.5v10c-2-1-4-1-6 .5-2-1.5-4-1.5-6-.5zM8 3.5v10"/>'};
const svgI=(p,t)=>`<svg class="ic" viewBox="0 0 16 16" role="img" aria-label="${t}"><title>${t}</title>${p}</svg>`;
const KNAME={note:"Research note",doc:"Original document",news:"Newspaper",map:"Map or plat",pic:"Picture",book:"Series book"};
function kindOf(r){if(r.o==="AUTHOR_WB")return "note";const T=r.t+" "+r.f.map(x=>x[1]).join(" ");if(r.o==="NEWS")return "news";
  if(/\b(plat|survey of|ground plan|map of|plan of the)\b/i.test(T))return "map";if(/\b(drawing|engraving|elevation|photograph|habs|sketch)\b/i.test(T))return "pic";return PRIM(r)?"doc":"book"}
function caLink(r){const m=(r.od||"").match(/^(.*?),\s*([A-Z][a-z]+ \d{1,2}, \d{4})/);if(!m)return "";const d=new Date(m[2]+" 12:00");if(isNaN(d))return "";
  const f=`${String(d.getMonth()+1).padStart(2,"0")}/${String(d.getDate()).padStart(2,"0")}/${d.getFullYear()}`;
  return `https://chroniclingamerica.loc.gov/search/pages/results/?dateFilterType=range&date1=${f}&date2=${f}&searchType=advanced&proxtext=${encodeURIComponent(m[1].split(" and ")[0])}`}
function reader(k){const r=R[k],kd=kindOf(r),y=yof2(r);let dlg=$("reader");if(!dlg){dlg=document.createElement("dialog");dlg.id="reader";dlg.className="reader";document.body.appendChild(dlg);
    dlg.addEventListener("click",e=>{if(e.target===dlg)dlg.close()})}
  const said=r.f.find(([f])=>/^the book says$/i.test(f)),date=(r.f.find(([f])=>/^(issue date|date)$/i.test(f))||[])[1];
  const ox=r.d!=null?DATA.docs[r.d].x.replace(/\.$/,"")+(r.dl?", "+r.dl:""):(PRIM(r)?(r.od||r.c):"");
  const bld=r.b.filter(b=>BLD[b]);const ca=r.o==="NEWS"&&/chronicling/i.test(r.oh||"")?caLink(r):"";
  dlg.innerHTML=`<div class="paper" role="document"><div class="kind">${svgI(ICK[kd],KNAME[kd])} ${KNAME[kd]} · ${svgI(ICP[phaseOf(r,r.f.map(x=>x[1]).join(" "))],"phase")} ${phaseOf(r,r.f.map(x=>x[1]).join(" "))}</div>
  <h3>${esc(r.o==="NEWS"?r.f[0][1]:r.t)}</h3><div class="date">${esc(date||y||"Undated")}${r.m.length?" · "+r.m.map(i=>esc(M[i].n)).join(", "):""}</div>
  ${said?`<blockquote>${esc(said[1])}</blockquote>`:""}
  <dl>${r.f.filter(([f])=>!/^(source|the book says|book note)$/i.test(f)).map(([f,v])=>`<dt>${esc(f)}</dt><dd>${esc(v)}</dd>`).join("")}</dl>
  ${ox?`<div class="cit"><b>Original</b>${esc(ox)}.</div><div class="cit"><b>Held at</b>${esc(heldAt(r).replace(/^Held at /,""))}</div>`:(r.o==="AUTHOR_WB"?`<div class="cit"><b>Research note</b>${esc(r.c)}. ${esc(DATA.repos.AUTHOR_WB.access)}</div>`:`<div class="cit"><b>Original</b>Compiled in the series from several documents; see the book for its sources.</div>`)}
  ${r.o==="AUTHOR_WB"?"":`<div class="cit"><b>In the books</b>${esc(bookRefs([r.c])||r.c)}</div>`}
  <div class="acts"><button type="button" class="pri" id="rd-copy">Copy citation</button><button type="button" id="rd-print">Print or save as PDF</button>
  ${ca?`<a href="${ca}" target="_blank" rel="noopener">${svgI(ICK.news,"newspaper")} Find the issue at Chronicling America ↗</a>`:""}
  ${bld.map(b=>`<button type="button" data-atb="${esc(b)}">${svgI(ICK.map,"map")} ${esc(b)} on the Atlas</button><a href="https://www.loc.gov/photos/?q=${encodeURIComponent(BLD[b].q)}" target="_blank" rel="noopener">${svgI(ICK.pic,"pictures")} Pictures ↗</a>`).join("")}
  <button type="button" id="rd-close">Close</button></div></div>`;
  $("rd-close").onclick=()=>dlg.close();$("rd-print").onclick=()=>window.print();
  $("rd-copy").onclick=()=>{const t=citeText(r);(navigator.clipboard?navigator.clipboard.writeText(t):Promise.reject()).then(()=>$("rd-copy").textContent="Copied",()=>prompt("Copy this citation:",t))};
  dlg.querySelectorAll("[data-atb]").forEach(b=>b.onclick=()=>{dlg.close();ATB=b.dataset.atb;show("atlas")});
  dlg.showModal()}
/* ---------- Life at a glance: one dated line per event, sorted into phases ---------- */
const PHASES=["Life and death","Fraternal","Military","Civic","Work","Church"];
const LODGE_SRC=/lodge|roster|return|chapter|royal arch|members|officers|grand lodge|delegate|communication/i;
function phaseOf(r,txt,mi){const T=r.t+" "+txt,T2=T.replace(/naval lodge[^;,.]*|naval no\.? ?\d+|naval\s+\(?no/ig,"");
  const LD=/\b(born|birth|died|death|deceased|funeral|buried|burial|grave|obituar|married|marriage|widow|the late)\b/ig;
  if(mi==null){if(LD.test(T))return "Life and death"}
  else{const sn=norm(M[mi].n).replace(/\b(jr|sr)\b\.?/g,"").trim().split(/\s+/).at(-1),nt=norm(T);let m;LD.lastIndex=0;
    while((m=LD.exec(nt))){const w=nt.slice(Math.max(0,m.index-70),m.index+70);if(sn&&w.includes(sn))return "Life and death"}}
  if(/\b(pews?|pewholders?|vestry|vestryman|vestries|rector|chaplain|presbyterian|catholic|episcopal)\b/i.test(T))return "Church";
  if(r.o==="GLMD_RET"||r.o==="GLMD_PROC"||r.s.startsWith("Lodge rolls"))return "Fraternal";
  if(r.o==="AUTHOR_WB"){const F=Object.fromEntries(r.f);if(F["Public building work"]||F["Private building work"])return "Work";
    if(/\b(mayor|alderman|council|commission|justice|magistrate|lieut|captain|militia|war)\b/i.test(txt)){}else if(F["Office"])return "Fraternal";else if(F["Occupation"])return "Work"}
  if(r.o==="NARA_RG45"||/\b(navy|naval|militia|army|regiment|marines?|captain|lieutenant|commodore|sailing master|purser|gunner|frigate|tripoli|rifle volunteers|sergeant)\b/i.test(T2)&&!/worshipful master|warden|lodge no\./i.test(T2))return "Military";
  if(/\b(alderman|aldermen|council|councilman|mayor|justice of the peace|magistrate|levy court|corporation of|elected to|commissioner of|senate|house of representatives|postmaster|marshal|clerk of)\b/i.test(T))return "Civic";
  if(r.o==="NARA_RG42"||/payroll|pay roll|voucher|carvers at|cutters at|wages/i.test(r.t))return "Work";
  if(/worshipful master|warden|lodge|roster|chapter|royal arch|members|officers|delegate|past master/i.test(T)&&!/payroll|voucher|pay roll/i.test(r.t))return "Fraternal";
  return "Work"}
function yof2(r){if(r.o==="NEWS"){const said=(r.f.find(([k])=>/the book says/i.test(k))||[])[1]||"";const yy=(said.match(/\b1[78]\d\d\b/g)||[]).map(Number).filter(y=>y<=1830);const ry=r.y.find(y=>y<=1830);if(!ry&&yy.length)return Math.min(...yy)}const ry=r.y.find(y=>y>=1750&&y<=1830);const xx=r.d!=null?DATA.docs[r.d].x:"";if(!xx.includes(": ")&&ry)return ry;const dy=r.d!=null&&xx.match(/\b1[78]\d\d\b(?!\s*[–-])/g);if(dy)return +dy.at(-1);return r.y.find(y=>y>=1750&&y<=1830)||+((r.t.match(/\b1[78]\d\d\b/)||(r.d!=null&&DATA.docs[r.d].x.match(/\b1[78]\d\d\b/))||[0])[0])||0}
function eventText(r,i){if(r.d!=null&&DATA.docs[r.d].x.includes(": ")){const x=DATA.docs[r.d].x.replace(/\.$/,""),tail=x.includes(": ")?x.slice(x.lastIndexOf(": ")+2):x;
    const off=(r.f.find(([k])=>/^office$/i.test(k))||[])[1],gr=(r.f.find(([k])=>/^grade$/i.test(k))||[])[1];
    const lodge=(x.match(/[A-Z][a-z]+ Lodge No\. \d+/)||[""])[0];
    return [tail.replace(lodge+", ",""),lodge&&!tail.includes(lodge)?lodge:"",off&&off!=="–"?off:"",gr&&gr!=="–"?gr:""].filter(Boolean).join("; ")}const nm=norm(M[i].n),keys=[nm,...M[i].sp.map(norm)];
  const vals=r.f.filter(([k,v])=>k!=="Source"&&!/^(name|spellings|lodges|years on rolls)$/i.test(k)&&v&&v!=="–"&&!keys.includes(norm(v)))
    .map(([k,v])=>/^(office|grade|date|document|year|no\.?)$/i.test(k)?`${k} ${v}`:v).slice(0,3).join("; ");
  const t=r.t.replace(/\s+\d{4}(\s+\d{4})?$/,"").replace(/^the /i,"");
  return (t+(vals?": "+vals:"")).slice(0,220)}
function shortSrc(r){if(r.d!=null){const p=DATA.repos[r.o]||{};const x=DATA.docs[r.d].x.replace(/\.$/,"");const tail=x.includes(": ")?x.slice(x.lastIndexOf(": ")+2):x;return `Original: ${p.name||""}${tail?", "+tail:""}`}
  if(PRIM(r))return "Original: "+(r.od||r.c).replace(/\.$/,"");if(r.o==="AUTHOR_WB")return "Research note: "+r.c;return "Book: "+(bookRefs([r.c])||r.c)}
function lifeEvents(i){const seen=new Set(),ev=[],primYP=new Set();
  for(const k of [...MP[i].p,...MP[i].x]){const r=R[k],y=yof2(r),txt=r.f.map(x=>x[1]).join(" "),ph=phaseOf(r,txt,i),pr=PRIM(r);
    if(!pr&&primYP.has(y+"|"+ph))continue;            // the original already covers this year and phase
    const key=y+"|"+ph+"|"+(r.d??(pr?r.t.slice(0,30):"x"));if(seen.has(key))continue;seen.add(key);if(pr)primYP.add(y+"|"+ph);
    ev.push({y,ph,t:eventText(r,i),src:shortSrc(r),prim:pr,k,kd:kindOf(r)})}
  return ev.sort((a,b)=>(a.y||9999)-(b.y||9999)||(b.prim-a.prim))}
let LPH="";
function lifeHTML(i){const ev=lifeEvents(i);const by={};ev.forEach(e=>(by[e.ph]=by[e.ph]||[]).push(e));
  const span=a=>{const ys=a.map(e=>e.y).filter(Boolean);return ys.length?(Math.min(...ys)===Math.max(...ys)?Math.min(...ys):Math.min(...ys)+"–"+Math.max(...ys)):"undated"};
  const shown=ev.filter(e=>!LPH||e.ph===LPH);
  return `<h2 class="sec" style="font-size:1.35rem">Life at a glance</h2>
  <div class="phases"><button type="button" data-lph="" class="${LPH?"":"on"}">All<small>${ev.length} events</small></button>${PHASES.filter(p=>by[p]).map(p=>`<button type="button" data-lph="${p}" class="${LPH===p?"on":""}">${svgI(ICP[p],p)}${p}<small>${by[p].length} · ${span(by[p])}</small></button>`).join("")}</div>
  <ol class="tl">${shown.map(e=>`<li tabindex="0" role="button" data-rk="${e.k}" aria-label="Open: ${esc(e.t)}"><span class="yr">${e.y||"n.d."}</span><span class="icons">${svgI(ICP[e.ph],e.ph)}${svgI(ICK[e.kd],KNAME[e.kd])}</span><span class="ph">${e.ph}</span>${esc(e.t)}<span class="src">${esc(e.src)}</span></li>`).join("")}</ol>
  <p class="stats">Tap a line to read the record. Icons: ${PHASES.map(p=>svgI(ICP[p],p)+" "+p).join(" · ")} · ${Object.keys(ICK).map(k=>svgI(ICK[k],KNAME[k])+" "+KNAME[k]).join(" · ")}</p>`}


/* ---------- Job site: who stood where on each building, from the records ---------- */
const OWNER={"Capitol":"Commissioners for the District of Columbia","President's House":"Commissioners for the District of Columbia","Treasury":"Commissioners for the District of Columbia",
 "Executive offices":"Commissioners for the District of Columbia","Navy Yard":"Navy Department","Commandant's House":"Navy Department","Tripoli Monument":"Navy Department (officers' subscription)",
 "Marine Barracks":"Marine Corps, under the Navy Department","Christ Church / parish":"Vestry of Washington Parish","Blodgett's Hotel":"Samuel Blodget, proprietor (lottery)","Union Tavern":"Private proprietors, George-Town",
 "City lots":"Commissioners and the original proprietors","Bridges":"Commissioners; bridge companies","Wharves":"Private owners","Quarries":"Commissioners (leases and purchases)"};
const OWNER_SRC={"Commissioners for the District of Columbia":"Records of the Commissioners for the District of Columbia, RG 42, National Archives","Navy Department":"Naval Records Collection, RG 45, National Archives"};
const TIERS=[["svc","Physicians, chaplains and services",/physician|doctor|surgeon|hospital|chaplain/i],["off","Officers and clerks",/secretary of the navy|sec\.? of (the )?navy|commandant|captain command|purser|naval storekeeper|clerk(?! of the works)|bookkeeper|paymaster/i],["arch","Architects and superintendents",/architect|superintend|plans of|clerk of the works|run the works|centre of the work|surveyor|wins the president/i],
 ["contract","Contractors and suppliers",/contract|supplie|surety|bricks? for|money advance|sells?\b|buys?\b|timber|lime\b|bar iron|purveyor|undertak/i],
 ["fore","Foremen, masters and measurers",/foreman|overseer|measur|master (carpenter|mason|builder|stone|plumber|smith)|signatory|sets the cornerstone|lays the/i],
 ["hire","Hired labour paid through",/received by|enslaved|slaves?\b|hired out|negro/i]];
const CREWRX=[["Carpenters and joiners",/carpent|joiner|framer/i],["Stone cutters, carvers and masons",/stone|carver|cutter|mason/i],["Bricklayers and brickmakers",/brick/i],
 ["Smiths and plumbers",/smith|plumb|iron/i],["Painters, glaziers and plasterers",/paint|glaz|plaster/i],["Shipwrights and yard hands",/ship|caulk|rigg|sawyer|yard/i]];
const snOf=i=>norm(M[i].n.replace(/\(.*?\)+/g," ")).replace(/\b(jr|sr)\b/g,"").trim().split(/\s+/).filter(w=>w!=="of").slice(-1)[0]||"";
function clauseOf(txt,i){const sn=snOf(i);if(!sn)return "";const fn=norm(M[i].n).split(/\s+/)[0];const parts=String(txt).split(/;\s+|\.\s+(?=[A-Z])|\s+\|\s+/);
  const rx=new RegExp("\\b"+sn+"\\b(?!\\s+[a-z]+\\s*['\u2019]s\\b)","i");
  return parts.find(p=>{const np=norm(p);if(!rx.test(np))return false;const m=p.match(new RegExp("\\b"+sn.charAt(0).toUpperCase()+sn.slice(1)+"\\s+([A-Z][a-z]+)"));return !m||norm(m[1])===fn||!SURN.has(norm(m[1]))&&!/^[A-Z][a-z]+['\u2019]s$/.test(m[1])})||""}
const ownTrade=i=>(M[i].tr||"")+" "+(M[i].tg||"")+" "+occOf(i).map(k=>OC[k]).join(" ");
const SURN=new Set(M.map((m,i)=>snOf(i)).filter(w=>w.length>2));
function jobsite(b){const recs=R.filter(r=>r.b.includes(b)&&r.m.length);const place=new Map();
  const rank=["arch","off","contract","fore","svc","hire","crew","other"];
  const put=(i,tier,r,cl)=>{const cur=place.get(i);if(!cur||rank.indexOf(tier)<rank.indexOf(cur.tier))place.set(i,{tier,r,cl})};
  for(const r of recs){const txt=r.f.filter(([k])=>!/^(source|book note|name|spellings|lodges|years on rolls)$/i.test(k)).map(x=>x[1]).join("; ");
    for(const i of r.m){const cl=r.m.length===1?txt:clauseOf(txt,i);let t=null;if(cl)for(const [k,,rx] of TIERS)if(rx.test(cl)){t=k;break}
      if(!t)t=CREWRX.some(([,rx])=>rx.test(ownTrade(i)))?"crew":"other";
      if(/ledger/i.test(cl)&&t==="crew"&&place.has(i))continue;put(i,t,r,/ledger/i.test(cl)?"":cl)}}
  const firms=new Set();recs.forEach(r=>{const txt=r.f.map(x=>x[1]).join(" ");
    (txt.match(/\b[A-Z][a-z]+\s&\s(?:Co\.?|[A-Z][a-z]+)|\b[A-Z][a-z]+\sand\s(?:Company|Co\.)|\b[A-Z][a-z]+\sand\s[A-Z][a-z]+/g)||[]).forEach(f=>{
      const w=f.split(/\s(?:&|and)\s/).map(x=>norm(x).trim());
      if(/&|Company|Co\./.test(f)||(SURN.has(w[0])&&SURN.has(w[1])))firms.add(f)})});
  return {place,firms:[...firms].slice(0,12),recs}}
function evid(r,cl){const y=yof2(r);const t=(cl&&cl.length>8?cl:(r.f.filter(([k])=>!/^(name|spellings|lodges?|years on rolls|source|book note|year|date)$/i.test(k)).map(x=>x[1]).sort((a,b)=>b.length-a.length)[0]||r.t)).replace(/^\d{4}\s+/,"");return `${y?y+": ":""}${t}`.slice(0,96)}
function jobsiteHTML(b){const J=jobsite(b);const by={};J.place.forEach((v,i)=>(by[v.tier]=by[v.tier]||[]).push([i,v.r,v.cl]));
  const person=([i,r,cl])=>`<span class="p"><button type="button" data-m="${i}">${esc(M[i].n)}</button><small data-rk="${R.indexOf(r)}" title="Open the record">${esc(evid(r,cl))}</small></span>`;
  const own=OWNER[b];let h=`<div class="site"><h3 class="h3s">The job site</h3><p class="stats">Each man is placed by what the records say he did here; tap the small line to read the record. Owners are the public bodies the works answered to.</p>`;
  if(own)h+=`<div class="tier"><h4>${svgI(ICP.Civic,"owner")} Owner and authority</h4><div class="firm"><b>${esc(own)}</b>${OWNER_SRC[own]?`<br><small class="stats">${esc(OWNER_SRC[own])}</small>`:""}</div></div>`;
  for(const [k,name] of [...TIERS.filter(t=>!["hire","svc"].includes(t[0])),...TIERS.filter(t=>t[0]==="svc")]){if(!by[k])continue;h+=`<div class="tier"><h4>${name}<span class="n">${by[k].length}</span></h4><div class="who">${by[k].map(person).join("")}</div></div>`}
  if(J.firms.length)h+=`<div class="tier"><h4>Firms and partnerships named<span class="n">${J.firms.length}</span></h4>${J.firms.map(f=>`<div class="firm">${esc(f)}</div>`).join("")}</div>`;
  if(by.crew){const g={};by.crew.forEach(x=>{const c=(CREWRX.find(([,rx])=>rx.test(ownTrade(x[0])))||["Other trades"])[0];(g[c]=g[c]||[]).push(x)});
    h+=`<div class="tier"><h4>Crews by trade<span class="n">${by.crew.length}</span></h4>${Object.entries(g).map(([c,list])=>`<div class="crew"><b>${esc(c)} (${list.length})</b><div class="who" style="margin-top:4px">${list.map(person).join("")}</div></div>`).join("")}</div>`}
  if(by.hire)h+=`<div class="tier"><h4>Hired labour paid through<span class="n">${by.hire.length}</span></h4><p class="stats" style="margin:0 0 6px">Men paid for the labour of others, often enslaved workers hired out to the works.</p><div class="who">${by.hire.map(person).join("")}</div></div>`;
  if(by.other)h+=`<div class="tier"><h4>Also named at this site<span class="n">${by.other.length}</span></h4><div class="who">${by.other.map(person).join("")}</div></div>`;
  return h+`</div>`}
/* ---------- Atlas: the buildings, mapped (schematic; 1800 shoreline approximate) ---------- */
const BLD={
 "Capitol":{ll:[38.8899,-77.0091],w:"Begun 1793; north wing in use 1800",q:"United States Capitol 1800"},
 "President's House":{ll:[38.8977,-77.0365],w:"Cornerstone 13 October 1792",q:"President's House White House Hoban"},
 "Treasury":{ll:[38.8983,-77.0342],w:"Built 1798–1800",q:"Treasury Building Washington early"},
 "Executive offices":{ll:[38.8975,-77.0400],w:"War and Navy offices, 1798–1800",q:"War Office Washington 1800"},
 "Navy Yard":{ll:[38.8738,-76.9952],w:"Established 1799",q:"Washington Navy Yard"},
 "Commandant's House":{ll:[38.8760,-76.9940],w:"Latrobe's design, about 1807",q:"Commandant's House Washington Navy Yard"},
 "Marine Barracks":{ll:[38.8797,-76.9946],w:"Begun 1801",q:"Marine Barracks Washington Eighth and I"},
 "Tripoli Monument":{ll:[38.8746,-76.9975],w:"Set up at the Navy Yard, 1808",q:"Tripoli Monument"},
 "Christ Church / parish":{ll:[38.8826,-76.9963],w:"Christ Church, Washington Parish, built 1806–1807",q:"Christ Church Washington Parish"},
 "Blodgett's Hotel":{ll:[38.8968,-77.0228],w:"Begun 1793",q:"Blodgett's Hotel Washington"},
 "Union Tavern":{ll:[38.9058,-77.0626],w:"George-Town, 1796",q:"Union Tavern Georgetown"},
 "Bridges":{w:"Rock Creek and Eastern Branch crossings",q:"bridge Washington D.C. early nineteenth century"},
 "Quarries":{w:"Aquia Creek, Virginia, and other quarries (off the map)",q:"Aquia Creek quarry sandstone"},
 "Wharves":{w:"George-Town and the Eastern Branch",q:"Georgetown wharf"},
 "City lots":{w:"Squares and lots across the city",q:"Plan of the City of Washington 1792"}};
const SHORE=[[38.9030,-77.0640],[38.8990,-77.0545],[38.8945,-77.0450],[38.8893,-77.0385],[38.8825,-77.0350],[38.8745,-77.0255],[38.8665,-77.0172],[38.8700,-77.0100],[38.8728,-77.0010],[38.8738,-76.9935],[38.8768,-76.9850],[38.8800,-76.9785]];
const CREEK=[[38.9160,-77.0525],[38.9100,-77.0555],[38.9030,-77.0585]];
const TIBER=[[38.8893,-77.0385],[38.8905,-77.0250],[38.8920,-77.0130]];
const PX=([la,lo])=>[(lo+77.078)*6400,(38.920-la)*6400*1.28];
let ATB=null;
function bstats(b){const recs=R.filter(r=>r.b.includes(b)),men=new Map();recs.forEach(r=>r.m.forEach(i=>men.set(i,(men.get(i)||0)+1)));
  const docs=new Set(recs.filter(PRIM).map(r=>r.d??("o"+r.o)));const ys=recs.map(yof2).filter(Boolean);return {recs,men,docs,y0:ys.length?Math.min(...ys):0,y1:ys.length?Math.max(...ys):0}}
function atlas(){const names=Object.keys(BLD).filter(b=>R.some(r=>r.b.includes(b)));if(!ATB)ATB=names[0];
  const W=640,H=465,NS="http://www.w3.org/2000/svg";
  const line=(pts,cls)=>`<polyline class="${cls}" points="${pts.map(p=>PX(p).join(",")).join(" ")}"/>`;
  const pins=names.filter(b=>BLD[b].ll).map((b,j)=>{const [x,y]=PX(BLD[b].ll);const n=names.indexOf(b)+1;return `<g class="pin${b===ATB?" on":""}" data-bd2="${esc(b)}" tabindex="0" role="button" aria-label="${esc(b)}"><circle cx="${x}" cy="${y}" r="11"/><text x="${x}" y="${y+3.5}" text-anchor="middle">${n}</text></g>`}).join("");
  $("at-map").innerHTML=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Schematic map of the City of Washington and George-Town with the buildings numbered">
   ${line(SHORE,"water")}${line(CREEK,"creek")}${line(TIBER,"creek")}
   <text class="lbl" x="${PX([38.8790,-77.0420])[0]}" y="${PX([38.8790,-77.0420])[1]}">Potomac River</text>
   <text class="lbl" x="${PX([38.8695,-76.9990])[0]}" y="${PX([38.8695,-76.9990])[1]}">Eastern Branch</text>
   <text class="lbl" x="${PX([38.9125,-77.0510])[0]}" y="${PX([38.9125,-77.0510])[1]}">Rock Creek</text>
   <text class="lbl" x="${PX([38.9095,-77.0700])[0]}" y="${PX([38.9095,-77.0700])[1]}">George-Town</text>
   <text class="lbl" x="${PX([38.8935,-77.0200])[0]}" y="${PX([38.8935,-77.0200])[1]}">Tiber Creek</text>${pins}</svg>
   <figcaption class="stats" style="margin:4px 6px 0">Schematic. Positions from modern coordinates; the 1800 shoreline is approximate.</figcaption>`;
  $("at-map").querySelectorAll("[data-bd2]").forEach(g=>{const go=()=>{ATB=g.dataset.bd2;atlas()};g.onclick=go;g.onkeydown=e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();go()}}});
  const st=bstats(ATB),B=BLD[ATB],men=[...st.men].sort((a,b)=>b[1]-a[1]);const tc={};men.forEach(([i])=>occOf(i).forEach(k=>tc[OC[k]]=(tc[OC[k]]||0)+1));
  $("at-info").innerHTML=`<div class="bcard"><div class="k" style="margin-top:0">No. ${names.indexOf(ATB)+1}</div><h3>${esc(ATB)}</h3><div>${esc(B.w)}</div>
   <div class="statgrid" style="margin:10px 0 0"><div><b>${men.length}</b><span>lodge men named</span></div><div><b>${st.recs.length}</b><span>records${st.y0?` · ${st.y0}–${st.y1}`:""}</span></div><div><b>${st.docs.size}</b><span>original documents</span></div></div>
   ${Object.keys(tc).length?`<div class="k">Their callings</div><div>${Object.entries(tc).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`${esc(k)} (${v})`).join(", ")}</div>`:""}
   <div class="k">The men</div><div>${men.length?men.slice(0,40).map(([i,n])=>`<button type="button" class="linkbtn" data-m="${i}">${esc(M[i].n)}</button>`).join(", "):"No lodge man is named in these records."}</div>
   <div><button type="button" class="copy" data-bd="${esc(ATB)}">All ${st.recs.length} records</button></div>
   <a class="loc" href="https://www.loc.gov/photos/?q=${encodeURIComponent(B.q)}" target="_blank" rel="noopener">Pictures at the Library of Congress ↗</a></div>${jobsiteHTML(ATB)}`;
  wire($("at-info"));$("at-info").querySelectorAll("[data-rk]").forEach(e=>e.onclick=()=>reader(+e.dataset.rk));
  $("at-list").innerHTML=`<h3 class="h3s">All buildings and places</h3><div class="tscroll"><table class="stt"><thead><tr><th>No.</th><th>Building or place</th><th>Built or in use</th><th>Lodge men</th><th>Records</th><th>Originals</th><th>Pictures</th></tr></thead><tbody>${names.map((b,j)=>{const t=bstats(b);return `<tr><td>${j+1}</td><td style="text-align:left"><button type="button" class="linkbtn" data-at="${esc(b)}">${esc(b)}</button>${BLD[b].ll?"":" <small>(not mapped)</small>"}</td><td style="text-align:left">${esc(BLD[b].w)}</td><td>${t.men.size}</td><td>${t.recs.length}</td><td>${t.docs.size}</td><td><a href="https://www.loc.gov/photos/?q=${encodeURIComponent(BLD[b].q)}" target="_blank" rel="noopener">LOC ↗</a></td></tr>`}).join("")}</tbody></table></div>`;
  $("at-list").querySelectorAll("[data-at]").forEach(b=>b.onclick=()=>{ATB=b.dataset.at;atlas();window.scrollTo({top:0})})}
/* ---------- A man's profile: primary sources first, cross-references apart ---------- */
function brief(r){return r.f.filter(([k])=>k!=="Source").slice(0,4).map(([k,v])=>`<b>${esc(k)}:</b> ${esc(v)}`).join(" · ")}
function profile(i,keep){if(!keep)LPH="";const m=M[i],P=MP[i];
  const groups=new Map();P.p.forEach(k=>{const r=R[k],key=r.d??("o"+r.o+"|"+(r.od||r.c));if(!groups.has(key))groups.set(key,[]);groups.get(key).push(r)});
  const gs=[...groups.values()].sort((a,b)=>(a[0].y[0]||9999)-(b[0].y[0]||9999));
  const cal=callings(i);
  let h=`<button class="linkbtn back" type="button" id="pback">‹ Back to the index</button><div class="prof">
  <h2>${esc(m.n)}</h2><div class="trade">${esc(m.tr||m.tg||cal.join("; ")||"Trade not recorded")}</div>
  <div class="facts"><div><div class="k">Lodges</div>${esc(m.l.join("; "))}</div>
  ${m.yr?`<div><div class="k">Years on the rolls</div>${esc(m.yr)}</div>`:""}
  ${cal.length?`<div><div class="k">Calling (grouped)</div>${esc(cal.join("; "))}</div>`:""}
  ${m.o?`<div><div class="k">Offices</div>${esc(m.o)}</div>`:""}
  ${m.sp.length?`<div><div class="k">Also written</div>${esc(m.sp.join("; "))}</div>`:""}</div>
  ${m.fx?`<div class="k" style="font-family:var(--sans);font-size:.7rem;text-transform:uppercase;color:var(--muted)">Settled facts</div><ul>${m.fx.map(f=>`<li>${esc(f)}</li>`).join("")}</ul>`:""}
  <div id="life">${lifeHTML(i)}</div>
  <h2 class="sec" style="font-size:1.35rem">Primary sources (${gs.length} document${gs.length===1?"":"s"})</h2>`;
  if(!gs.length)h+=`<p class="stats">No original document in the data set names him directly. He is known from the lodge rolls compiled in the series (below).</p>`;
  for(const g of gs){const r=g[0],p=DATA.repos[r.o]||{};const ox=r.d!=null?DATA.docs[r.d].x:(r.od||p.cite||r.c);
    const locs=[...new Set(g.map(x=>x.dl).filter(Boolean))];
    h+=`<div class="doc"><div class="ox">${esc(ox.replace(/\.$/,""))}${locs.length?", "+esc(locs.join("; ")):""}.</div>
    <div class="acc"><b>Held at:</b> ${esc(heldAt(r).replace(/^Held at /,""))}</div>
    ${bookRefs(g.map(x=>x.c))?`<div class="acc"><b>In the books:</b> ${esc(bookRefs(g.map(x=>x.c)))}</div>`:""}
    <ul>${g.map(x=>`<li>${esc(x.t)}: ${brief(x)}</li>`).join("")}</ul>
    <button class="copy" type="button" data-cc="${R.indexOf(r)}">Copy citation</button></div>`}
  const X=P.x.map(k=>R[k]);
  h+=`<details ${gs.length?"":"open"}><summary><b>Cross-references in the series books and rolls (${X.length})</b>: compiled from the documents above and from the lodge rolls; not separate originals.</summary>
  <ul class="xref">${X.map(r=>`<li>${esc(r.s.replace(/ \(book data set\)/,""))} › ${esc(r.t)}${r.y.length?" ("+r.y[0]+(r.y.at(-1)!==r.y[0]?"–"+r.y.at(-1):"")+")":""}: ${brief(r)}<br><span class="acc">${esc(bookRefs([r.c])||r.c)}</span></li>`).join("")}</ul></details></div>`;
  $("man-out").innerHTML=h;show("man");$("pback").onclick=()=>show("index");
  const wl=()=>{$("life").querySelectorAll("[data-lph]").forEach(b=>b.onclick=()=>{LPH=b.dataset.lph;$("life").innerHTML=lifeHTML(i);wl()});
    $("life").querySelectorAll("[data-rk]").forEach(li=>{li.onclick=()=>reader(+li.dataset.rk);li.onkeydown=e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();reader(+li.dataset.rk)}}})};wl();
  $("man-out").querySelectorAll("[data-cc]").forEach(b=>b.onclick=()=>{const t=citeText(R[+b.dataset.cc]);(navigator.clipboard?navigator.clipboard.writeText(t):Promise.reject()).then(()=>{b.textContent="Copied"},()=>{prompt("Copy this citation:",t)})});
}
document.querySelectorAll("#ix-btns [data-ix]").forEach(b=>b.onclick=()=>ix(b.dataset.ix));
highlights();ix("men");
};
