#!/usr/bin/env node
/**
 * OrderzHouse UI/UX audit — offline before/after comparison gallery.
 *
 * Usage:
 *   node scripts/uiux-audit/build-report.mjs --phase "<auditRoot>/Phase-01-Public"   # one phase → <phase>/report/index.html
 *   node scripts/uiux-audit/build-report.mjs --master "<auditRoot>"                 # every phase with phase.json → <root>/index.html
 *
 * Phase directory layout (outside Git):
 *   phase.json                 manifest: pages (key, name, route, classification, before/changed/result), state labels
 *   before/  after/  production/   <page>-<ar|en>-<width>[-<state>]-<before|after|production>.png
 *
 * Output is a single self-contained HTML file (inline CSS/JS, no CDN/fonts/analytics) that references the
 * screenshots in place via relative paths. Comparison orientation is fixed: BEFORE on the right, AFTER on the left.
 */
import fs from "node:fs";
import path from "node:path";

const FILE_RE = /^(.+)-(ar|en)-(\d{3,4})(?:-([a-z0-9]+))?-(before|after|production)\.png$/;
const CLASSES = ["KEEP", "POLISH", "MODERNIZE", "FIX"];

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : null;
}

function scan(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).map((f) => ({ f, m: FILE_RE.exec(f) })).filter((x) => x.m);
}

/** Build the data model for one phase (pairs by page+lang+width+state). */
export function collectPhase(phaseDir) {
  const manifest = JSON.parse(fs.readFileSync(path.join(phaseDir, "phase.json"), "utf8"));
  const files = { before: scan(path.join(phaseDir, "before")), after: scan(path.join(phaseDir, "after")), production: scan(path.join(phaseDir, "production")) };
  const idx = {};
  for (const kind of Object.keys(files)) {
    for (const { f, m } of files[kind]) {
      const [, page, lang, width, state = "default"] = m;
      const id = `${page}|${lang}|${width}|${state}`;
      idx[id] = idx[id] || { page, lang, width: Number(width), state };
      idx[id][kind] = `../${kind}/${f}`;
    }
  }
  const known = new Set(manifest.pages.map((p) => p.key));
  const orphans = [...new Set(Object.values(idx).map((s) => s.page))].filter((k) => !known.has(k));
  if (orphans.length) console.warn(`[uiux-report] screenshots without manifest entry: ${orphans.join(", ")}`);
  const pages = manifest.pages.map((p) => {
    const shots = Object.values(idx)
      .filter((s) => s.page === p.key)
      .sort((a, b) => (a.lang === b.lang ? 0 : a.lang === "ar" ? -1 : 1) || b.width - a.width || a.state.localeCompare(b.state));
    return { ...p, shots, pairs: shots.filter((s) => s.before && s.after).length };
  });
  return {
    manifest,
    pages,
    counts: {
      before: files.before.length,
      after: files.after.length,
      production: files.production.length,
      pairs: pages.reduce((n, p) => n + p.pairs, 0),
    },
  };
}

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const CSS = `
:root{--navy:#2f3b65;--cyan:#76cfdf;--bg:#f3f4f6;--card:#fff;--line:#dde3ec;--muted:#64748b;--ink:#1f2937;
--keep:#15803d;--keep-bg:#dcfce7;--polish:#1d4ed8;--polish-bg:#dbeafe;--mod:#6d28d9;--mod-bg:#ede9fe;--fix:#b42318;--fix-bg:#fee2e2}
*{box-sizing:border-box}html,body{margin:0}body{background:var(--bg);color:var(--ink);font-family:"Segoe UI",Tahoma,"Noto Sans Arabic",Arial,sans-serif;line-height:1.6}
a{color:var(--navy)}button{font:inherit;cursor:pointer}
.wrap{max-width:1680px;margin:0 auto;padding:20px 20px 64px}
.top{display:flex;flex-wrap:wrap;align-items:center;gap:12px;justify-content:space-between;margin-bottom:16px}
h1{margin:0;font-size:1.45rem;color:var(--navy)}.sub{margin:2px 0 0;color:var(--muted);font-size:.9rem}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;margin:14px 0 18px}
.stat{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:10px 14px}.stat b{display:block;font-size:1.5rem;color:var(--navy)}.stat span{color:var(--muted);font-size:.82rem}
.chips{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px}.chip{border:1px solid var(--line);background:var(--card);border-radius:999px;padding:5px 14px;font-weight:600;color:#334155}
.chip[aria-pressed=true]{background:var(--navy);border-color:var(--navy);color:#fff}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:14px}
.card{display:flex;flex-direction:column;background:var(--card);border:1px solid var(--line);border-radius:14px;overflow:hidden;text-decoration:none;color:inherit;transition:box-shadow .15s,transform .15s}
.card:hover,.card:focus-visible{box-shadow:0 10px 26px -14px rgba(15,26,58,.35);transform:translateY(-2px);outline:none}
.thumb{height:170px;background:#e9edf3;overflow:hidden}.thumb img{width:100%;height:100%;object-fit:cover;object-position:top;display:block}
.card-body{padding:10px 14px 14px;display:grid;gap:4px}.card-title{font-weight:800;color:var(--navy)}.route{direction:ltr;unicode-bidi:plaintext;font-family:Consolas,monospace;font-size:.8rem;color:var(--muted)}
.meta-row{display:flex;justify-content:space-between;align-items:center;gap:8px;font-size:.8rem;color:var(--muted)}
.badge{display:inline-block;padding:1px 10px;border-radius:999px;font-weight:800;font-size:.72rem;letter-spacing:.02em}
.b-KEEP{background:var(--keep-bg);color:var(--keep)}.b-POLISH{background:var(--polish-bg);color:var(--polish)}.b-MODERNIZE{background:var(--mod-bg);color:var(--mod)}.b-FIX{background:var(--fix-bg);color:var(--fix)}
.nav{display:flex;flex-wrap:wrap;gap:8px;align-items:center}.btn{border:1px solid var(--line);background:var(--card);border-radius:10px;padding:6px 12px;font-weight:600;color:#334155;text-decoration:none;display:inline-flex;gap:6px;align-items:center}
.btn:hover{border-color:var(--navy)}.btn-primary{background:var(--navy);border-color:var(--navy);color:#fff}
.detail-head{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:14px 16px;margin-bottom:12px}
.detail-title{display:flex;flex-wrap:wrap;gap:10px;align-items:center}.detail-title h2{margin:0;color:var(--navy);font-size:1.3rem}
.desc{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-top:10px}.desc div{background:#f8fafc;border:1px solid #e8edf4;border-radius:10px;padding:8px 12px}
.desc h4{margin:0 0 2px;font-size:.82rem;color:var(--navy)}.desc p{margin:0;font-size:.9rem}
.keep-note{margin-top:10px;padding:8px 12px;border-radius:10px;background:var(--keep-bg);color:var(--keep);font-weight:700}
.controls{display:flex;flex-wrap:wrap;gap:14px;align-items:center;background:var(--card);border:1px solid var(--line);border-radius:14px;padding:10px 14px;margin-bottom:12px}
.ctl{display:flex;gap:6px;align-items:center;flex-wrap:wrap}.ctl>span{font-size:.8rem;color:var(--muted);font-weight:700}
.seg{display:inline-flex;border:1px solid var(--line);border-radius:10px;overflow:hidden}.seg button{border:0;background:#fff;padding:5px 12px;font-weight:600;color:#334155;border-inline-start:1px solid var(--line)}
.seg button:first-child{border-inline-start:0}.seg button[aria-pressed=true]{background:var(--navy);color:#fff}.seg button:disabled{color:#c0c7d2;cursor:not-allowed}
.pair{display:grid;grid-template-columns:1fr 1fr;gap:12px;direction:rtl}
.pane{background:var(--card);border:1px solid var(--line);border-radius:14px;overflow:hidden;display:flex;flex-direction:column;min-width:0}
.pane-h{display:flex;justify-content:space-between;align-items:center;padding:6px 12px;border-bottom:1px solid var(--line);font-weight:800}
.pane-h .lbl-before{color:var(--fix)}.pane-h .lbl-after{color:var(--keep)}.pane-h small{color:var(--muted);font-weight:600;direction:ltr}
.scroll{overflow:auto;max-height:calc(100vh - 230px);background:#eef1f5}.scroll img{display:block;width:100%;height:auto;cursor:zoom-in}
.missing{padding:40px;text-align:center;color:var(--muted)}
.slider-pane{position:relative}.stack{display:grid;position:relative;user-select:none;touch-action:none;cursor:ew-resize}.stack img{grid-area:1/1;width:100%;height:auto;display:block;pointer-events:none}
.stack .after-layer{clip-path:inset(0 calc(100% - var(--x,50%)) 0 0)}.divider{position:absolute;top:0;bottom:0;width:3px;background:#fff;box-shadow:0 0 0 1px rgba(15,26,58,.35);left:calc(var(--x,50%) - 1px);pointer-events:none}
.slider-tags{position:sticky;top:0;z-index:2;display:flex;direction:ltr;justify-content:space-between;padding:6px 10px;pointer-events:none}.slider-tags b{background:rgba(15,26,58,.75);color:#fff;border-radius:8px;padding:2px 10px;font-size:.8rem}
.range{width:100%;margin:8px 0 0;direction:ltr}
.prod{margin-top:14px;background:var(--card);border:1px solid var(--line);border-radius:14px;padding:12px 14px}.prod h3{margin:0 0 8px;font-size:1rem;color:var(--navy)}
.prod-grid{display:flex;flex-wrap:wrap;gap:10px}.prod-grid figure{margin:0;width:170px}.prod-grid img{width:100%;height:130px;object-fit:cover;object-position:top;border:1px solid var(--line);border-radius:8px;cursor:zoom-in;display:block}
.prod-grid figcaption{font-size:.75rem;color:var(--muted);direction:ltr;text-align:center}.prod-grid figure.cur img{outline:3px solid var(--cyan)}
.lb{position:fixed;inset:0;background:rgba(10,14,28,.9);z-index:50;display:none;flex-direction:column}.lb.open{display:flex}
.lb-bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:space-between;padding:10px 14px;color:#fff}
.lb-bar .btn{background:rgba(255,255,255,.08);color:#fff;border-color:rgba(255,255,255,.25)}.lb-bar .btn[aria-pressed=true]{background:#fff;color:var(--navy)}
.lb-body{flex:1;overflow:auto;display:flex;justify-content:center;align-items:flex-start;padding:0 14px 20px}
.lb-body img{display:block;background:#fff}.lb-body.fit img{max-width:100%;height:auto}.lb-body.full img{max-width:none}
.phase-card .thumb{height:200px}
@media (max-width:900px){.pair{grid-template-columns:1fr}.desc{grid-template-columns:1fr}.scroll{max-height:none}}
:focus-visible{outline:3px solid var(--cyan);outline-offset:2px}
`;

const JS = `
const D=JSON.parse(document.getElementById('data').textContent);
const L={default:'الوضع الافتراضي'};Object.assign(L,D.states||{});
const CLS={KEEP:'KEEP',POLISH:'POLISH',MODERNIZE:'MODERNIZE',FIX:'FIX'};
const W={1440:'1440 سطح المكتب',1280:'1280',1024:'1024',768:'768',390:'390 جوال'};
const $=(s,r=document)=>r.querySelector(s);const h=(s)=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const app=$('#app');let filter='ALL';let view={mode:'side',sync:true};
function parseHash(){const m=location.hash.match(/^#\\/page\\/([^?]+)(?:\\?(.*))?$/);if(!m)return null;return{key:decodeURIComponent(m[1]),q:Object.fromEntries(new URLSearchParams(m[2]||''))};}
function thumbOf(p){const s=p.shots.find(s=>s.after&&s.lang==='ar'&&s.width===1440&&s.state==='default')||p.shots.find(s=>s.after)||p.shots.find(s=>s.before);return s?(s.after||s.before):null;}
function renderIndex(){
  const c=D.pages.reduce((a,p)=>(a[p.classification]=(a[p.classification]||0)+1,a),{});
  const changed=D.pages.filter(p=>p.classification!=='KEEP').length;
  const stats=[[D.pages.length,'المسارات المدققة'],[changed,'تم تعديلها'],[c.KEEP||0,'لم تحتج إلى تعديل'],[c.FIX||0,'إصلاحات (FIX)'],[c.MODERNIZE||0,'تحديث (MODERNIZE)'],[c.POLISH||0,'تحسين (POLISH)'],[D.counts.before,'لقطات قبل'],[D.counts.after,'لقطات بعد'],[D.counts.pairs,'أزواج مقارنة'],[D.counts.production,'لقطات الإنتاج']];
  const chips=['ALL','KEEP','POLISH','MODERNIZE','FIX'].map(k=>'<button class="chip" aria-pressed="'+(filter===k)+'" data-f="'+k+'">'+(k==='ALL'?'الكل':k)+'</button>').join('');
  const cards=D.pages.filter(p=>filter==='ALL'||p.classification===filter).map(p=>{const t=thumbOf(p);return '<a class="card" href="#/page/'+encodeURIComponent(p.key)+'"><div class="thumb">'+(t?'<img loading="lazy" src="'+h(t)+'" alt="">':'')+'</div><div class="card-body"><div class="card-title">'+h(p.name)+'</div><div class="route">'+h(p.route)+'</div><div class="meta-row"><span class="badge b-'+p.classification+'">'+p.classification+'</span><span>'+p.pairs+' مقارنة</span></div></div></a>';}).join('');
  app.innerHTML='<div class="top"><div><h1>'+h(D.title)+'</h1><p class="sub">تقرير محلي للمقارنة قبل/بعد — اضغط أي صفحة. في المقارنة: <b>قبل</b> على اليمين و<b>بعد</b> على اليسار.</p></div>'+(D.masterHref?'<a class="btn" href="'+h(D.masterHref)+'">كل المراحل</a>':'')+'</div><div class="stats">'+stats.map(s=>'<div class="stat"><b>'+s[0]+'</b><span>'+s[1]+'</span></div>').join('')+'</div><div class="chips" role="group" aria-label="تصفية حسب التصنيف">'+chips+'</div><div class="grid">'+cards+'</div>';
  app.querySelectorAll('.chip').forEach(b=>b.onclick=()=>{filter=b.dataset.f;renderIndex();});
  document.title=D.title;
}
function opts(p){const langs=[...new Set(p.shots.map(s=>s.lang))];return{langs};}
function pick(p,q){
  const lang=q.lang&&p.shots.some(s=>s.lang===q.lang)?q.lang:(p.shots.some(s=>s.lang==='ar')?'ar':(p.shots[0]||{}).lang);
  const inLang=p.shots.filter(s=>s.lang===lang);
  const states=[...new Set(inLang.map(s=>s.state))];const state=q.state&&states.includes(q.state)?q.state:(states.includes('default')?'default':states[0]);
  const inState=inLang.filter(s=>s.state===state);const widths=[...new Set(inState.map(s=>s.width))].sort((a,b)=>b-a);
  const width=q.w&&widths.includes(Number(q.w))?Number(q.w):(widths.includes(1440)?1440:widths[0]);
  return{lang,state,width,states,widths,shot:inState.find(s=>s.width===width)};
}
function go(key,q){location.hash='#/page/'+encodeURIComponent(key)+'?'+new URLSearchParams(q).toString();}
function seg(name,label,items,cur,disp){return '<div class="ctl"><span>'+label+'</span><div class="seg" role="group" aria-label="'+label+'">'+items.map(v=>'<button data-'+name+'="'+v+'" aria-pressed="'+(String(v)===String(cur))+'">'+h(disp(v))+'</button>').join('')+'</div></div>';}
let current=null;
function renderDetail(key,q){
  const i=D.pages.findIndex(p=>p.key===key);if(i<0){location.hash='';return;}
  const p=D.pages[i];const s=pick(p,q);current={p,s,i};
  const prev=D.pages[(i-1+D.pages.length)%D.pages.length],next=D.pages[(i+1)%D.pages.length];
  const prodUrl=D.productionBase+p.route;
  const desc=p.classification==='KEEP'?'<div class="keep-note">لم يحتج إلى تعديل'+(p.note?' — '+h(p.note):'')+(p.changed?' · '+h(p.changed):'')+'</div>':'<div class="desc"><div><h4>قبل</h4><p>'+h(p.before)+'</p></div><div><h4>ماذا تغير</h4><p>'+h(p.changed)+'</p></div><div><h4>النتيجة</h4><p>'+h(p.result)+'</p></div></div>';
  const langs=[...new Set(p.shots.map(x=>x.lang))];
  let controls=seg('lang','اللغة',langs,s.lang,v=>v==='ar'?'العربية':'English');
  controls+=seg('w','المقاس',s.widths,s.width,v=>W[v]||v);
  if(s.states.length>1)controls+=seg('state','الحالة',s.states,s.state,v=>L[v]||v);
  controls+='<div class="ctl"><span>العرض</span><div class="seg"><button data-mode="side" aria-pressed="'+(view.mode==='side')+'">مقارنة متجاورة</button><button data-mode="slider" aria-pressed="'+(view.mode==='slider')+'">سحب للمقارنة</button></div></div>';
  if(view.mode==='side')controls+='<label class="ctl"><input type="checkbox" id="sync" '+(view.sync?'checked':'')+'> <span>مزامنة التمرير</span></label>';
  const sh=s.shot||{};const tag=s.lang.toUpperCase()+' · '+s.width+(s.state!=='default'?' · '+(L[s.state]||s.state):'');
  let body;
  if(view.mode==='slider'&&sh.before&&sh.after){
    body='<div class="pane slider-pane"><div class="pane-h"><span dir="ltr"><span class="lbl-after">بعد</span> ⟵ اسحب ⟶ <span class="lbl-before">قبل</span></span><small>'+h(tag)+'</small></div><div class="scroll" id="sl-scroll"><div class="slider-tags"><b>بعد</b><b>قبل</b></div><div class="stack" id="stack" style="--x:50%"><img src="'+h(sh.before)+'" alt="قبل"><img class="after-layer" src="'+h(sh.after)+'" alt="بعد"><div class="divider"></div></div></div><input class="range" id="range" type="range" min="0" max="100" value="50" aria-label="موضع المقارنة"></div>';
  }else{
    const pane=(kind,lbl)=>'<div class="pane"><div class="pane-h"><span class="lbl-'+kind+'">'+lbl+'</span><small>'+h(tag)+'</small></div><div class="scroll" data-kind="'+kind+'">'+(sh[kind]?'<img loading="lazy" src="'+h(sh[kind])+'" alt="'+lbl+'" data-open="'+kind+'">':'<div class="missing">لا توجد لقطة</div>')+'</div></div>';
    body='<div class="pair">'+pane('before','قبل')+pane('after','بعد')+'</div>';
  }
  const prods=p.shots.filter(x=>x.production);
  const prod=prods.length?'<section class="prod"><h3>النسخة على الإنتاج</h3><p class="sub" style="margin:0 0 8px">لقطات بعد النشر للتحقق من مطابقة «بعد» — ليست جزءًا من مقارنة قبل/بعد.</p><div class="prod-grid">'+prods.map(x=>'<figure class="'+(x===sh?'cur':'')+'"><img loading="lazy" src="'+h(x.production)+'" alt="production" data-prod="'+h(x.production)+'"><figcaption>'+x.lang.toUpperCase()+' · '+x.width+(x.state!=='default'?' · '+h(L[x.state]||x.state):'')+'</figcaption></figure>').join('')+'</div></section>':'';
  app.innerHTML='<div class="top"><div class="nav"><a class="btn" href="#/">العودة لجميع الصفحات</a><a class="btn" href="#/page/'+encodeURIComponent(prev.key)+'" title="'+h(prev.name)+'">→ الصفحة السابقة</a><a class="btn" href="#/page/'+encodeURIComponent(next.key)+'" title="'+h(next.name)+'">الصفحة التالية ←</a></div><div class="nav"><span class="sub" dir="ltr">'+(i+1)+' / '+D.pages.length+'</span><a class="btn btn-primary" href="'+h(prodUrl)+'" target="_blank" rel="noopener noreferrer">فتح الصفحة على الإنتاج ↗</a></div></div><div class="detail-head"><div class="detail-title"><h2>'+h(p.name)+'</h2><span class="badge b-'+p.classification+'">'+p.classification+'</span><span class="route">'+h(p.route)+'</span><span class="sub">'+p.pairs+' مقارنة</span></div>'+desc+'</div><div class="controls">'+controls+'</div>'+body+prod;
  document.title=p.name+' — '+D.title;
  const base={lang:s.lang,w:s.width,state:s.state};
  app.querySelectorAll('[data-lang]').forEach(b=>b.onclick=()=>go(p.key,{...base,lang:b.dataset.lang}));
  app.querySelectorAll('[data-w]').forEach(b=>b.onclick=()=>go(p.key,{...base,w:b.dataset.w}));
  app.querySelectorAll('[data-state]').forEach(b=>b.onclick=()=>go(p.key,{...base,state:b.dataset.state}));
  app.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{view.mode=b.dataset.mode;renderDetail(p.key,base);});
  const sync=$('#sync');if(sync)sync.onchange=()=>{view.sync=sync.checked;};
  const panes=[...app.querySelectorAll('.scroll[data-kind]')];let lock=false;
  panes.forEach(a=>a.addEventListener('scroll',()=>{if(!view.sync||lock)return;lock=true;const r=a.scrollTop/Math.max(1,a.scrollHeight-a.clientHeight);panes.forEach(b=>{if(b!==a)b.scrollTop=r*(b.scrollHeight-b.clientHeight);});requestAnimationFrame(()=>lock=false);}));
  app.querySelectorAll('img[data-open]').forEach(img=>img.onclick=()=>openLb(img.dataset.open));
  app.querySelectorAll('img[data-prod]').forEach(img=>img.onclick=()=>openLb('production',img.dataset.prod));
  const stack=$('#stack'),range=$('#range');
  if(stack){const set=x=>{x=Math.max(0,Math.min(100,x));stack.style.setProperty('--x',x+'%');range.value=x;};
    let drag=false;const at=e=>{const r=stack.getBoundingClientRect();set((e.clientX-r.left)/r.width*100);};
    stack.addEventListener('pointerdown',e=>{drag=true;stack.setPointerCapture(e.pointerId);at(e);});stack.addEventListener('pointermove',e=>{if(drag)at(e);});stack.addEventListener('pointerup',()=>drag=false);
    range.oninput=()=>set(Number(range.value));}
}
// Lightbox: every pair of the current page/lang in display order; ← → move between comparisons.
const lb=$('#lb'),lbImg=$('#lb-img'),lbBody=$('#lb-body'),lbCap=$('#lb-cap');let lbState=null;
function lbList(){return current.p.shots.filter(x=>x.lang===current.s.lang&&(x.before||x.after));}
function openLb(kind,src){const list=lbList();let idx=Math.max(0,list.indexOf(current.s.shot));if(src){const j=current.p.shots.findIndex(x=>x.production===src);if(j>=0){lbState={list:[current.p.shots[j]],idx:0,kind:'production',fit:true};showLb();return;}}lbState={list,idx,kind,fit:true};showLb();}
function showLb(){const sh=lbState.list[lbState.idx];let kind=lbState.kind;if(!sh[kind])kind=sh.after?'after':'before';lbState.kind=kind;lbImg.src=sh[kind];
  lbBody.className='lb-body '+(lbState.fit?'fit':'full');const name={before:'قبل',after:'بعد',production:'الإنتاج'}[kind];
  lbCap.textContent=current.p.name+' — '+name+' — '+sh.lang.toUpperCase()+' · '+sh.width+(sh.state!=='default'?' · '+(L[sh.state]||sh.state):'')+'  ('+(lbState.idx+1)+'/'+lbState.list.length+')';
  lb.querySelectorAll('[data-lbk]').forEach(b=>{b.setAttribute('aria-pressed',String(b.dataset.lbk===kind));b.disabled=!sh[b.dataset.lbk];});
  $('#lb-fit').textContent=lbState.fit?'الحجم الكامل':'ملاءمة العرض';lb.classList.add('open');lbBody.scrollTop=0;$('#lb-close').focus();}
function closeLb(){lb.classList.remove('open');lbImg.removeAttribute('src');lbState=null;}
function stepLb(d){if(!lbState||lbState.kind==='production')return;lbState.idx=(lbState.idx+d+lbState.list.length)%lbState.list.length;showLb();}
$('#lb-close').onclick=closeLb;$('#lb-next').onclick=()=>stepLb(1);$('#lb-prev').onclick=()=>stepLb(-1);$('#lb-fit').onclick=()=>{lbState.fit=!lbState.fit;showLb();};
lb.querySelectorAll('[data-lbk]').forEach(b=>b.onclick=()=>{lbState.kind=b.dataset.lbk;showLb();});
lb.addEventListener('click',e=>{if(e.target===lbBody)closeLb();});
document.addEventListener('keydown',e=>{if(lb.classList.contains('open')){if(e.key==='Escape')closeLb();else if(e.key==='ArrowLeft')stepLb(1);else if(e.key==='ArrowRight')stepLb(-1);return;}
  if(current&&parseHash()&&!/INPUT|TEXTAREA/.test(document.activeElement.tagName)){const n=D.pages.length;if(e.key==='ArrowLeft')location.hash='#/page/'+encodeURIComponent(D.pages[(current.i+1)%n].key);else if(e.key==='ArrowRight')location.hash='#/page/'+encodeURIComponent(D.pages[(current.i-1+n)%n].key);}});
function route(){const r=parseHash();if(r)renderDetail(r.key,r.q);else{current=null;renderIndex();}window.scrollTo(0,0);}
window.addEventListener('hashchange',route);route();
`;

function page(title, data, extraHead = "") {
  return `<!doctype html>
<html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="referrer" content="no-referrer"><title>${esc(title)}</title><style>${CSS}</style>${extraHead}</head>
<body><main class="wrap" id="app"></main>
<div class="lb" id="lb" role="dialog" aria-modal="true" aria-label="عرض مكبّر"><div class="lb-bar"><div class="nav">
<button class="btn" id="lb-close">إغلاق ✕</button><button class="btn" id="lb-prev">→ السابق</button><button class="btn" id="lb-next">التالي ←</button>
<span class="seg"><button data-lbk="before">قبل</button><button data-lbk="after">بعد</button></span><button class="btn" id="lb-fit">الحجم الكامل</button></div>
<span id="lb-cap"></span></div><div class="lb-body fit" id="lb-body"><img id="lb-img" alt=""></div></div>
<script type="application/json" id="data">${JSON.stringify(data).replace(/</g, "\\u003c")}</script><script>${JS}</script></body></html>`;
}

export function buildPhaseReport(phaseDir, { masterHref = "../../index.html" } = {}) {
  const { manifest, pages, counts } = collectPhase(phaseDir);
  const data = {
    title: manifest.title,
    productionBase: manifest.productionBase || "https://orderzhouse.com",
    states: manifest.states || {},
    masterHref: fs.existsSync(path.join(phaseDir, "..", "index.html")) ? masterHref : null,
    counts,
    pages,
  };
  const out = path.join(phaseDir, "report", "index.html");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, page(manifest.title, data));
  return { out, pages: pages.length, counts };
}

/** Master index: one card per phase that has a manifest (no placeholder phases). */
export function buildMaster(root) {
  const phases = fs
    .readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(path.join(root, d.name, "phase.json")))
    .map((d) => {
      const { manifest, pages, counts } = collectPhase(path.join(root, d.name));
      const thumbPage = pages.find((p) => p.classification !== "KEEP") || pages[0];
      const s = thumbPage && thumbPage.shots.find((x) => x.after && x.lang === "ar" && x.width === 1440);
      return { dir: d.name, order: manifest.order || 0, title: manifest.title, pages: pages.length, changed: pages.filter((p) => p.classification !== "KEEP").length, counts, thumb: s ? `${d.name}/${s.after.replace(/^\.\.\//, "")}` : null };
    })
    .sort((a, b) => a.order - b.order);
  const cards = phases
    .map((p) => `<a class="card phase-card" href="${esc(p.dir)}/report/index.html"><div class="thumb">${p.thumb ? `<img loading="lazy" src="${esc(p.thumb)}" alt="">` : ""}</div><div class="card-body"><div class="card-title">${esc(p.title)}</div><div class="meta-row"><span>${p.pages} صفحة · ${p.changed} معدّلة</span><span>${p.counts.pairs} مقارنة</span></div></div></a>`)
    .join("");
  const html = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>OrderzHouse — تدقيق واجهة المستخدم</title><style>${CSS}</style></head><body><main class="wrap"><div class="top"><div><h1>OrderzHouse — تدقيق واجهة المستخدم</h1><p class="sub">اختر مرحلة ← صفحة ← مقارنة (قبل يمين / بعد يسار).</p></div></div><div class="grid">${cards}</div></main></body></html>`;
  const out = path.join(root, "index.html");
  fs.writeFileSync(out, html);
  return { out, phases: phases.length };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
if (isMain) {
  const phase = arg("phase");
  const master = arg("master");
  if (!phase && !master) {
    console.error("usage: build-report.mjs --phase <phaseDir> | --master <auditRoot>");
    process.exit(2);
  }
  if (master) {
    // Master first, so each phase report can link back to it.
    console.log(JSON.stringify(buildMaster(master)));
    for (const d of fs.readdirSync(master, { withFileTypes: true })) {
      if (d.isDirectory() && fs.existsSync(path.join(master, d.name, "phase.json"))) console.log(JSON.stringify(buildPhaseReport(path.join(master, d.name))));
    }
  } else {
    console.log(JSON.stringify(buildPhaseReport(path.resolve(phase))));
  }
}
