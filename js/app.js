// ============================================================
// app.js — public portfolio site logic
// ============================================================

import {
  getPublishedArticles,
  getArticleBySlug,
  fetchGitHubRepos,
  getReposConfig,
  formatDate,
  timeAgo
} from './firebase.js';

// ── STATE ────────────────────────────────────────────────────
let allArticles  = [];
let allRepos     = [];
let currentPage  = 'home';

// ── BOOT ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  setupNav();
  setupSearch();
  initHeroCanvas();
  loadAndRenderAll();

  // hash-based routing
  const hash = location.hash.replace('#/', '');
  if (hash.startsWith('article/')) {
    showPage('article');
    openArticleBySlug(hash.replace('article/', ''));
  } else if (['articles','projects','about','contact'].includes(hash)) {
    showPage(hash);
  } else {
    showPage('home');
  }
});

async function loadAndRenderAll() {
  try {
    // Fetch GitHub repos directly — no AppCheck needed, public API
    let repos = [];
    try {
      repos = await fetchGitHubRepos();
      console.log('[portfolio] GitHub repos fetched:', repos.length);
    } catch (e) {
      console.error('[portfolio] GitHub fetch failed:', e);
    }

    // Fetch Firestore data — may fail if AppCheck is blocking
    let arts = [];
    let reposCfg = { hidden: new Set(), pinned: new Set() };
    try {
      arts = await getPublishedArticles();
      console.log('[portfolio] Articles fetched:', arts.length);
    } catch (e) {
      console.error('[portfolio] Articles fetch failed:', e.code, e.message);
    }
    try {
      reposCfg = await getReposConfig();
    } catch (e) {
      console.warn('[portfolio] ReposConfig fetch failed (using defaults):', e.code, e.message);
    }

    allArticles = arts;
    allRepos = repos
      .filter(r => !reposCfg.hidden.has(r.name))
      .map(r => ({ ...r, pinned: reposCfg.pinned.has(r.name) }))
      .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));

    console.log('[portfolio] allRepos after filter:', allRepos.length);
    renderHomeFeatured();
    renderArticlesPage();
  } catch (e) {
    console.error('[portfolio] Load error:', e);
  }
}

// ── NAVIGATION ──────────────────────────────────────────────
function setupNav() {
  document.querySelectorAll('[data-page]').forEach(el => {
    el.addEventListener('click', e => {
      e.preventDefault();
      showPage(el.dataset.page);
    });
  });
}

export function showPage(id) {
  // 'projects' is now inlined on the home page — scroll to it
  if (id === 'projects') {
    showPage('home');
    setTimeout(() => {
      const anchor = document.getElementById('home-projects-anchor');
      if (anchor) anchor.scrollIntoView({ behavior: 'smooth' });
    }, 60);
    return;
  }
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nbtn').forEach(b => b.classList.remove('active'));
  const page = document.getElementById(`page-${id}`);
  if (page) page.classList.add('active');
  const nbtn = document.getElementById(`nb-${id === 'article' ? 'articles' : id}`);
  if (nbtn) nbtn.classList.add('active');
  window.scrollTo(0, 0);
  currentPage = id;
  location.hash = id === 'home' ? '' : `/${id}`;
  if (id === 'home') setTimeout(initHeroCanvas, 60);
}
window.showPage = showPage;

// ── HOME FEATURED ────────────────────────────────────────────
function renderHomeFeatured() {
  // Full Projects section with language filters
  const rel = document.getElementById('projects-grid');
  if (!rel) return;
  if (!allRepos.length) {
    rel.innerHTML = emptyState('No repositories found', 'Public repositories will appear here automatically.');
    return;
  }
  rel.innerHTML = allRepos.map(r => repoCardHTML(r)).join('');
  const count = document.getElementById('projects-count');
  if (count) count.textContent = allRepos.length;

  const langs = [...new Set(allRepos.map(r => r.language).filter(Boolean))];
  const lf = document.getElementById('lang-filters');
  if (lf) {
    lf.innerHTML = `<button class="btn btn-sm btn-ghost active" onclick="filterByLang(null)" id="lf-all">All</button>` +
      langs.map(l => `<button class="btn btn-sm btn-ghost" onclick="filterByLang('${l}')" id="lf-${l}">${l}</button>`).join('');
  }
}

window.filterByLang = function(lang) {
  document.querySelectorAll('[id^="lf-"]').forEach(b => b.classList.remove('active'));
  document.getElementById(lang ? `lf-${lang}` : 'lf-all')?.classList.add('active');
  const grid = document.getElementById('projects-grid');
  if (!grid) return;
  const filtered = lang ? allRepos.filter(r => r.language === lang) : allRepos;
  grid.innerHTML = filtered.map(r => repoCardHTML(r)).join('');
};

// ── ARTICLES PAGE ────────────────────────────────────────────
function renderArticlesPage() {
  const el   = document.getElementById('articles-grid');
  const count = document.getElementById('articles-count');
  if (!el) return;
  if (!allArticles.length) {
    el.innerHTML = emptyState('No articles yet', 'Articles will appear here once published from the admin panel.');
    return;
  }
  el.innerHTML = allArticles.map(a => articleCardHTML(a)).join('');
  el.querySelectorAll('.art-card').forEach((c, i) => {
    c.addEventListener('click', () => openArticle(allArticles[i]));
  });
  if (count) count.textContent = allArticles.length;

  // Tag filter
  const tags = [...new Set(allArticles.flatMap(a => a.tags || []))];
  renderTagFilters(tags);
}

function renderTagFilters(tags) {
  const el = document.getElementById('tag-filters');
  if (!el) return;
  el.innerHTML = `<button class="btn btn-sm btn-ghost active" onclick="filterByTag(null)" id="filter-all">All</button>` +
    tags.map(t => `<button class="btn btn-sm btn-ghost" onclick="filterByTag('${t}')" id="filter-${t}">${t}</button>`).join('');
}

window.filterByTag = function(tag) {
  document.querySelectorAll('[id^="filter-"]').forEach(b => b.classList.remove('active'));
  document.getElementById(tag ? `filter-${tag}` : 'filter-all')?.classList.add('active');
  const grid = document.getElementById('articles-grid');
  if (!grid) return;
  const filtered = tag ? allArticles.filter(a => (a.tags || []).includes(tag)) : allArticles;
  grid.innerHTML = filtered.map(a => articleCardHTML(a)).join('');
  grid.querySelectorAll('.art-card').forEach((c, i) => {
    c.addEventListener('click', () => openArticle(filtered[i]));
  });
};

// ── ARTICLE READER ───────────────────────────────────────────
function openArticle(art) {
  showPage('article');
  document.getElementById('art-title').textContent  = art.title;
  document.getElementById('art-date').textContent   = formatDate(art.date);
  document.getElementById('art-tags').innerHTML     = (art.tags || []).map(t => `<span class="tag ${tagClass(t)}">${t}</span>`).join('');
  document.getElementById('art-body').innerHTML     = art.content || '';

  const backBtn = document.getElementById('art-back');
  if (backBtn) {
    backBtn.style.display = allArticles.length ? '' : 'none';
    backBtn.onclick = () => showPage('articles');
  }

  // Reading time
  const words = (art.content || '').replace(/<[^>]+>/g, '').split(/\s+/).length;
  const mins  = Math.max(1, Math.round(words / 200));
  const rt    = document.getElementById('art-readtime');
  if (rt) rt.textContent = `${mins} min read`;

  // Scroll to top of article
  const scroller = document.getElementById('art-scroll');
  if (scroller) scroller.scrollTop = 0;
  window.scrollTo(0, 0);

  // Reading progress bar
  const bar = document.getElementById('art-progress');
  if (bar && scroller) {
    bar.style.width = '0%';
    const updateProgress = () => {
      const scrollable = scroller.scrollHeight - scroller.clientHeight;
      const pct = scrollable > 0 ? Math.min(100, (scroller.scrollTop / scrollable) * 100) : 100;
      bar.style.width = pct + '%';
    };
    scroller.removeEventListener('scroll', scroller._progressFn);
    scroller._progressFn = updateProgress;
    scroller.addEventListener('scroll', updateProgress);
  }

  location.hash = `/article/${art.slug || art.id}`;
}

async function openArticleBySlug(slug) {
  try {
    const art = await getArticleBySlug(slug);
    if (art) openArticle(art);
    else showPage('articles');
  } catch { showPage('articles'); }
}

// ── SEARCH ───────────────────────────────────────────────────
function setupSearch() {
  const input = document.getElementById('search-input');
  const dd    = document.getElementById('search-dropdown');
  if (!input || !dd) return;

  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase();
    if (!q) { dd.style.display = 'none'; return; }
    const results = [
      ...allArticles.filter(a => (a.title + ' ' + (a.tags||[]).join(' ')).toLowerCase().includes(q))
        .slice(0, 5).map(a => ({ type: 'article', title: a.title, sub: formatDate(a.date), action: () => openArticle(a) })),
      ...allRepos.filter(r => (r.name + ' ' + (r.description||'')).toLowerCase().includes(q))
        .slice(0, 5).map(r => ({ type: 'repo', title: r.name, sub: r.language || '', action: () => window.open(r.html_url, '_blank') }))
    ].slice(0, 8);

    if (!results.length) {
      dd.innerHTML = '<div style="padding:1rem;text-align:center;color:var(--text3);font-family:var(--mono);font-size:.78rem">No results</div>';
    } else {
      dd.innerHTML = results.map((r, i) =>
        `<div class="search-result" data-i="${i}" style="padding:.75rem 1rem;cursor:pointer;border-bottom:1px solid var(--border);display:flex;gap:.75rem;align-items:center;transition:background .1s">
          <span style="font-size:.9rem">${r.type === 'article' ? '📄' : '💻'}</span>
          <div>
            <div style="font-size:.84rem;font-weight:600">${r.title}</div>
            <div style="font-family:var(--mono);font-size:.62rem;color:var(--text3)">${r.type.toUpperCase()} · ${r.sub}</div>
          </div>
        </div>`
      ).join('');
      dd.querySelectorAll('.search-result').forEach((el, i) => {
        el.addEventListener('mouseover', () => el.style.background = 'var(--surface2)');
        el.addEventListener('mouseout',  () => el.style.background = 'transparent');
        el.addEventListener('click', () => { results[i].action(); dd.style.display = 'none'; input.value = ''; });
      });
    }
    dd.style.display = 'block';
  });

  document.addEventListener('click', e => {
    if (!e.target.closest('#search-row')) dd.style.display = 'none';
  });
}
// ── CONTACT FORM ─────────────────────────────────────────────
window.sendContactForm = function() {
  const name  = document.getElementById('cf-name')?.value.trim()  || '';
  const email = document.getElementById('cf-email')?.value.trim() || '';
  const body  = document.getElementById('cf-body')?.value.trim()  || '';
  const msg   = document.getElementById('cf-msg');
  const btn   = document.getElementById('cf-send');

  const show = (txt, ok) => {
    if (!msg) return;
    msg.style.cssText = `display:block;padding:.75rem 1rem;border-radius:8px;font-size:.84rem;margin-bottom:1rem;background:${ok?'rgba(88,230,168,.1)':'rgba(248,81,73,.1)'};border:1px solid ${ok?'rgba(88,230,168,.3)':'rgba(248,81,73,.3)'};color:${ok?'var(--accent)':'var(--red)'}`;
    msg.textContent = txt;
  };

  if (!name || !email || !body) { show('Please fill in all fields.', false); return; }
  if (!/^[^@]+@[^@]+\.[^@]+$/.test(email)) { show('Enter a valid email address.', false); return; }

  const subject  = encodeURIComponent(`Portfolio contact from ${name}`);
  const mailBody = encodeURIComponent(`Name: ${name}\nEmail: ${email}\n\n${body}`);
  window.location.href = `mailto:codeninjaa@gmail.com?subject=${subject}&body=${mailBody}`;

  if (btn) { btn.textContent = 'Opening mail client…'; btn.disabled = true; }
  setTimeout(() => {
    show('✓ Mail client opened! If nothing happened, email codeninjaa@gmail.com directly.', true);
    if (btn) { btn.textContent = 'Send Message →'; btn.disabled = false; }
  }, 1500);
};

// ── CARD HTML HELPERS ────────────────────────────────────────
function articleCardHTML(a) {
  const words  = (a.content || '').replace(/<[^>]+>/g, '').split(/\s+/).length;
  const mins   = Math.max(1, Math.round(words / 200));
  const tags   = (a.tags || []).map(t => `<span class="tag ${tagClass(t)}">${t}</span>`).join('');
  const excerpt = (a.excerpt || (a.content || '').replace(/<[^>]+>/g,'').slice(0, 120) + '…');
  return `<div class="art-card fi">
    <div class="tags">${tags}</div>
    <h3>${a.title}</h3>
    <p class="excerpt">${excerpt}</p>
    <div class="meta"><span>${formatDate(a.date)}</span><span class="read-time">${mins} min read</span></div>
  </div>`;
}

function repoCardHTML(r) {
  const color = langColor(r.language);
  const topics = (r.topics || []).slice(0,3).map(t=>`<span class="tag tag-default">${t}</span>`).join('');
  const desc = r.description ? '<p class="proj-desc">' + r.description + '</p>' : '';
  return `<div class="proj-card fi ${r.pinned ? 'proj-pinned':''}" onclick="window.open('${r.html_url}','_blank')">
    <div class="proj-name">${r.name}${r.pinned ? ' <span class="badge badge-purple" style="margin-left:.4rem">Pinned</span>':''}</div>
    ${desc}
    ${topics ? `<div style="display:flex;gap:.3rem;flex-wrap:wrap">${topics}</div>` : ''}
    <div class="proj-footer">
      ${r.language ? `<span class="lang-dot" style="background:${color}"></span><span>${r.language}</span>` : ''}
      <span class="proj-stars">⭐ ${r.stargazers_count}</span>
      <span>🍴 ${r.forks_count}</span>
      <span style="margin-left:auto">Updated ${timeAgo({ toDate: () => new Date(r.updated_at) })}</span>
    </div>
  </div>`;
}

function emptyState(title, sub) {
  return `<div style="grid-column:1/-1;text-align:center;padding:3rem 1rem">
    <div style="font-size:2rem;margin-bottom:.75rem">📭</div>
    <div style="font-weight:700;margin-bottom:.35rem">${title}</div>
    <div style="font-family:var(--mono);font-size:.78rem;color:var(--text3)">${sub}</div>
  </div>`;
}

function tagClass(tag) {
  const t = (tag || '').toLowerCase();
  if (['android','java','kotlin'].includes(t)) return 'tag-android';
  if (t === 'kotlin') return 'tag-kotlin';
  if (['ai','ml','llm'].includes(t)) return 'tag-ai';
  if (['cicd','ci/cd','jenkins','devops'].includes(t)) return 'tag-cicd';
  return 'tag-default';
}

function langColor(lang) {
  const map = { JavaScript:'#f1e05a', TypeScript:'#3178c6', Kotlin:'#A97BFF', Java:'#b07219', Python:'#3572A5', 'C++':'#f34b7d', Swift:'#F05138', Dart:'#00B4AB', Go:'#00ADD8', Rust:'#dea584', HTML:'#e34c26', CSS:'#563d7c', Shell:'#89e051' };
  return map[lang] || '#8b949e';
}

// ── HERO CANVAS ──────────────────────────────────────────────
function initHeroCanvas() {
  const cv = document.getElementById('hero-canvas');
  if (!cv) return;
  if (cv._running) return;
  cv._running = true;
  const ctx = cv.getContext('2d');
  const C = ['rgba(88,230,168,','rgba(167,139,250,','rgba(249,115,22,','rgba(56,189,248,'];
  const LAYERS = [4,6,6,3];
  const LABELS = [['Android','Kotlin','Java','REST'],['MVVM','RxJava','XMPP','Auth','CI/CD','SDK'],['Jenkins','Appium','WebRTC','SonarQube','Gradle','Git'],['Ship','Test','Deploy']];
  let W,H,nodes,edges,parts;
  function resize() { W=cv.width=cv.parentElement.offsetWidth; H=cv.height=cv.parentElement.offsetHeight; build(); }
  function build() {
    nodes=[]; edges=[]; parts=[];
    const px=W*.1,py=H*.13,uw=W-px*2,uh=H-py*2;
    LAYERS.forEach((n,li)=>{ const x=px+(li/(LAYERS.length-1))*uw; for(let i=0;i<n;i++) nodes.push({x,y:py+((i+.5)/n)*uh,r:li===0||li===LAYERS.length-1?5:4,col:C[li],label:LABELS[li][i]||'',layer:li,ph:Math.random()*Math.PI*2,ps:.016+Math.random()*.012,op:.75+Math.random()*.25}); });
    let off=0; for(let li=0;li<LAYERS.length-1;li++){const as=off,ae=off+LAYERS[li],bs=ae,be=bs+LAYERS[li+1]; for(let a=as;a<ae;a++) for(let b=bs;b<be;b++) edges.push({a,b,op:.15+Math.random()*.25,col:C[li]}); off+=LAYERS[li]; }
    for(let i=0;i<20;i++) spawn();
  }
  function spawn(){const e=edges[Math.floor(Math.random()*edges.length)];parts.push({e,t:Math.random(),sp:.003+Math.random()*.005,sz:2+Math.random()*2.5,col:e.col});}
  function draw(){
    ctx.clearRect(0,0,W,H);
    edges.forEach(e=>{const a=nodes[e.a],b=nodes[e.b];const g=ctx.createLinearGradient(a.x,a.y,b.x,b.y);g.addColorStop(0,e.col+e.op+')');g.addColorStop(1,C[1]+e.op+')');ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.strokeStyle=g;ctx.lineWidth=1.1;ctx.stroke();});
    nodes.forEach(n=>{n.ph+=n.ps;const gl=2+Math.sin(n.ph)*1.5,al=n.op*(.75+Math.sin(n.ph)*.25);const rg=ctx.createRadialGradient(n.x,n.y,0,n.x,n.y,n.r*7);rg.addColorStop(0,n.col+al*.8+')');rg.addColorStop(.4,n.col+al*.25+')');rg.addColorStop(1,n.col+'0)');ctx.beginPath();ctx.arc(n.x,n.y,n.r*7,0,Math.PI*2);ctx.fillStyle=rg;ctx.fill();ctx.beginPath();ctx.arc(n.x,n.y,n.r+gl*.3,0,Math.PI*2);ctx.fillStyle=n.col+al+')';ctx.fill();if(W>680&&n.label){ctx.font='9px JetBrains Mono,monospace';ctx.fillStyle=n.col+(al*.7)+')';ctx.textAlign=n.layer===LAYERS.length-1?'left':n.layer===0?'right':'center';const lx=n.layer===LAYERS.length-1?n.x+10:n.layer===0?n.x-10:n.x;const ly=n.layer===0||n.layer===LAYERS.length-1?n.y+4:n.y-n.r-7;ctx.fillText(n.label,lx,ly);}});
    parts.forEach(p=>{p.t+=p.sp;if(p.t>1){p.e=edges[Math.floor(Math.random()*edges.length)];p.t=0;p.col=p.e.col;}const a=nodes[p.e.a],b=nodes[p.e.b];const x0=a.x+(b.x-a.x)*Math.max(0,p.t-.14),y0=a.y+(b.y-a.y)*Math.max(0,p.t-.14);const x1=a.x+(b.x-a.x)*p.t,y1=a.y+(b.y-a.y)*p.t;const pg=ctx.createLinearGradient(x0,y0,x1,y1);pg.addColorStop(0,p.col+'0)');pg.addColorStop(1,p.col+'1)');ctx.beginPath();ctx.moveTo(x0,y0);ctx.lineTo(x1,y1);ctx.strokeStyle=pg;ctx.lineWidth=p.sz;ctx.lineCap='round';ctx.stroke();});
    while(parts.length<32) spawn();
    requestAnimationFrame(draw);
  }
  resize();
  window.addEventListener('resize', resize);
  requestAnimationFrame(draw);
}
