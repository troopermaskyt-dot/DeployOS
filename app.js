// =============================================
//  DeployOS — app.js
//  Admin: troopermaskyt@gmail.com
// =============================================

const FIREBASE_CONFIG = {
  apiKey: "TU_API_KEY_AQUI",
  authDomain: "TU_PROYECTO.firebaseapp.com",
  projectId: "TU_PROYECTO",
  storageBucket: "TU_PROYECTO.appspot.com",
  messagingSenderId: "TU_SENDER_ID",
  appId: "TU_APP_ID"
};

const ADMIN_EMAIL = "troopermaskyt@gmail.com";

// Preview URLs de demo para mostrar en el iframe (sitios públicos reales)
const DEMO_PREVIEW_URLS = {
  'my-portfolio':  'https://example.com',
  'react-blog':    'https://blog.example.com',
  'nextjs-shop':   'https://shop.example.com',
  'landing-page':  'https://example.com',
  'api-backend':   null
};

let fbApp, auth, db;
let currentUser = null;
let currentUserData = null;
let sites = [];
let currentSite = null;
let currentSiteIndex = -1;
let selectedRepo = null;
let deployRunning = false;

// ── Firebase Init ──────────────────────────
try {
  fbApp = firebase.initializeApp(FIREBASE_CONFIG);
  auth = firebase.auth();
  db = firebase.firestore();
  auth.onAuthStateChanged(user => {
    if (user) loadUserData(user);
  });
} catch (e) {
  console.warn("Firebase no configurado. Usando modo demo.", e);
}

// ── Auth ───────────────────────────────────
function switchTab(tab) {
  document.querySelectorAll('.auth-tab').forEach((t, i) =>
    t.classList.toggle('active', (i === 0 && tab === 'login') || (i === 1 && tab === 'register'))
  );
  document.getElementById('tab-login').style.display = tab === 'login' ? 'block' : 'none';
  document.getElementById('tab-register').style.display = tab === 'register' ? 'block' : 'none';
}

async function doLogin() {
  const email = document.getElementById('login-email').value.trim();
  const pass = document.getElementById('login-password').value;
  document.getElementById('login-error').style.display = 'none';
  if (!email || !pass) { showError('login-error', 'Completa todos los campos'); return; }
  try {
    await auth.signInWithEmailAndPassword(email, pass);
  } catch (e) {
    loginDemo(email, null);
  }
}

async function doRegister() {
  const name = document.getElementById('reg-name').value.trim();
  const email = document.getElementById('reg-email').value.trim();
  const pass = document.getElementById('reg-password').value;
  if (!name || !email || !pass) { showError('reg-error', 'Completa todos los campos'); return; }
  if (pass.length < 6) { showError('reg-error', 'Contraseña mínimo 6 caracteres'); return; }
  try {
    const cred = await auth.createUserWithEmailAndPassword(email, pass);
    await db.collection('users').doc(cred.user.uid).set({
      name, email, plan: 'free', createdAt: new Date(), customDomainUsed: false
    });
  } catch (e) {
    loginDemo(email, name);
  }
}

async function loadUserData(user) {
  currentUser = user;
  try {
    const doc = await db.collection('users').doc(user.uid).get();
    currentUserData = doc.exists ? doc.data() : { name: user.email.split('@')[0], email: user.email, plan: 'free', customDomainUsed: false };
  } catch (e) {
    currentUserData = { name: user.email.split('@')[0], email: user.email, plan: 'free', customDomainUsed: false };
  }
  currentUserData.isAdmin = user.email === ADMIN_EMAIL;
  loadApp();
}

function loginDemo(email, name) {
  currentUser = { email, uid: btoa(email).replace(/=/g, '') };
  currentUserData = {
    name: name || (email === ADMIN_EMAIL ? 'TrooperMaskyt' : email.split('@')[0]),
    email, plan: 'free',
    isAdmin: email === ADMIN_EMAIL,
    customDomainUsed: false
  };
  loadApp();
}

function doLogout() {
  try { auth.signOut(); } catch (e) {}
  currentUser = null; currentUserData = null; sites = []; currentSite = null;
  document.getElementById('app').style.display = 'none';
  document.getElementById('auth-screen').style.display = 'flex';
}

function showError(id, msg) {
  const el = document.getElementById(id);
  el.textContent = msg;
  el.style.display = 'block';
}

// ── App Init ───────────────────────────────
function loadApp() {
  document.getElementById('auth-screen').style.display = 'none';
  document.getElementById('app').style.display = 'flex';
  document.getElementById('user-display').textContent = currentUserData.name;
  document.getElementById('settings-name').textContent = currentUserData.name;
  document.getElementById('settings-email').textContent = currentUserData.email;
  document.getElementById('settings-plan').textContent = currentUserData.plan || 'Free';
  if (currentUserData.isAdmin) {
    document.querySelectorAll('.admin-only').forEach(el => el.style.display = '');
    loadAdminData();
  }
  loadSites();
}

// ── Navigation ─────────────────────────────
function showPage(name, btn) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('page-' + name).classList.add('active');
  if (btn) btn.classList.add('active');
}

function goToDashboard() {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('page-dashboard').classList.add('active');
  document.getElementById('nav-dashboard').classList.add('active');
}

// ── Project Page ───────────────────────────
function openProjectPage(i) {
  currentSite = sites[i];
  currentSiteIndex = i;

  // Header
  document.getElementById('proj-title').textContent = currentSite.name;
  const domainText = currentSite.domain;
  const domLink = document.getElementById('proj-domain-link');
  domLink.textContent = domainText;
  domLink.href = 'https://' + domainText;

  const badge = document.getElementById('proj-status-badge');
  badge.textContent = currentSite.status === 'active' ? '● Activo' : '⏳ Desplegando';
  badge.className = 'badge ' + (currentSite.status === 'active' ? 'badge-green' : 'badge-amber');

  // Settings tab
  document.getElementById('proj-setting-name').textContent = currentSite.name;
  document.getElementById('proj-setting-repo').textContent = currentSite.repo || '—';
  const frameworks = { 'react-blog': 'React', 'nextjs-shop': 'Next.js', 'landing-page': 'Vue', 'my-portfolio': 'HTML/CSS', 'api-backend': 'Node.js' };
  document.getElementById('proj-setting-framework').textContent = frameworks[currentSite.repo] || 'Autodetectado';

  // Preview tab
  const previewUrl = currentSite.previewUrl || null;
  document.getElementById('preview-url-text').textContent = 'https://' + domainText;
  loadPreview(previewUrl);

  // Deployments tab
  renderDeployments();

  // Analytics tab
  renderAnalytics();

  // Domains tab
  renderProjectDomains();

  // Switch to project page, reset to preview tab
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('page-project').classList.add('active');
  switchProjectTab('preview', document.querySelector('.project-tab'));
}

function switchProjectTab(name, btn) {
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.project-tab').forEach(t => t.classList.remove('active'));
  document.getElementById('tab-' + name).classList.add('active');
  if (btn) btn.classList.add('active');
}

// ── Preview ────────────────────────────────
function loadPreview(url) {
  const iframe = document.getElementById('preview-iframe');
  const placeholder = document.getElementById('preview-placeholder');
  if (url) {
    iframe.src = url;
    iframe.style.display = 'block';
    placeholder.style.display = 'none';
  } else {
    // Generar una preview simulada con HTML inline
    const siteName = currentSite ? currentSite.name : 'Mi sitio';
    const domain = currentSite ? currentSite.domain : 'sitio.deployos.app';
    const htmlContent = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
      *{margin:0;padding:0;box-sizing:border-box;}
      body{font-family:system-ui,sans-serif;background:#0f0f1a;color:#f0f0ff;min-height:100vh;}
      nav{background:#1a1a2e;padding:1rem 2rem;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid rgba(124,58,237,0.3);}
      nav .brand{font-weight:700;font-size:1.2rem;color:#a855f7;}
      nav ul{list-style:none;display:flex;gap:2rem;}
      nav ul li a{color:#a0a0c0;text-decoration:none;font-size:0.9rem;}
      .hero{text-align:center;padding:6rem 2rem;background:radial-gradient(ellipse at center,rgba(124,58,237,0.15) 0%,transparent 70%);}
      .hero h1{font-size:3rem;font-weight:800;margin-bottom:1rem;background:linear-gradient(135deg,#a855f7,#7c3aed);-webkit-background-clip:text;-webkit-text-fill-color:transparent;}
      .hero p{color:#a0a0c0;font-size:1.1rem;max-width:500px;margin:0 auto 2rem;}
      .btn{display:inline-block;padding:0.75rem 2rem;background:#7c3aed;color:white;border-radius:8px;text-decoration:none;font-weight:600;}
      .features{display:grid;grid-template-columns:repeat(3,1fr);gap:1.5rem;padding:3rem 4rem;background:#12121f;}
      .feature{background:#1a1a2e;border:1px solid rgba(124,58,237,0.2);border-radius:12px;padding:1.5rem;}
      .feature h3{color:#a855f7;margin-bottom:0.5rem;}
      .feature p{color:#808090;font-size:0.875rem;}
      footer{text-align:center;padding:2rem;color:#505060;font-size:0.8rem;border-top:1px solid rgba(255,255,255,0.05);}
    </style></head><body>
    <nav><span class="brand">${siteName}</span><ul><li><a href="#">Inicio</a></li><li><a href="#">Sobre mí</a></li><li><a href="#">Proyectos</a></li><li><a href="#">Contacto</a></li></ul></nav>
    <section class="hero">
      <h1>${siteName}</h1>
      <p>Bienvenido a mi sitio web. Desplegado con DeployOS en segundos.</p>
      <a class="btn" href="#">Ver proyectos</a>
    </section>
    <section class="features">
      <div class="feature"><h3>⚡ Rápido</h3><p>Optimizado para la máxima velocidad de carga con CDN global.</p></div>
      <div class="feature"><h3>🔒 Seguro</h3><p>SSL automático y protección incluida en todos los planes.</p></div>
      <div class="feature"><h3>🌍 Global</h3><p>Disponible en todo el mundo con latencia mínima.</p></div>
    </section>
    <footer>${domain} — Desplegado con DeployOS</footer>
    </body></html>`;
    iframe.srcdoc = htmlContent;
    iframe.style.display = 'block';
    placeholder.style.display = 'none';
  }
}

function setPreviewSize(width, height, btn) {
  document.querySelectorAll('.size-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  const viewport = document.getElementById('preview-viewport');
  const iframe = document.getElementById('preview-iframe');
  if (width === '100%') {
    viewport.style.display = 'block';
    iframe.style.width = '100%';
  } else {
    iframe.style.width = width;
    iframe.style.margin = '0 auto';
    iframe.style.display = 'block';
    viewport.style.textAlign = 'center';
    viewport.style.background = '#1a1a26';
  }
}

function refreshPreview() {
  const iframe = document.getElementById('preview-iframe');
  const src = iframe.src;
  const srcdoc = iframe.srcdoc;
  if (src && src !== window.location.href) { iframe.src = ''; setTimeout(() => { iframe.src = src; }, 100); }
  else if (srcdoc) { const tmp = srcdoc; iframe.srcdoc = ''; setTimeout(() => { iframe.srcdoc = tmp; }, 100); }
}

// ── Deployments ────────────────────────────
function renderDeployments() {
  const list = document.getElementById('deploy-list');
  if (!currentSite) return;
  const deploys = currentSite.deployHistory || [
    { id: 'd_' + Math.random().toString(36).slice(2,7), status: 'ok', branch: 'main', commit: 'a3f2b1c', msg: 'Initial deploy', time: 'hace un momento' },
  ];
  if (!currentSite.deployHistory) currentSite.deployHistory = deploys;
  list.innerHTML = deploys.slice().reverse().map((d, i) => `
    <div class="deploy-item">
      <div class="deploy-status-dot ${d.status === 'ok' ? 'ok' : 'pending'}"></div>
      <div class="deploy-info">
        <div class="deploy-name">${d.msg || 'Deploy #' + (deploys.length - i)}</div>
        <div class="deploy-meta">⎇ ${d.branch} · ${d.commit} · ${d.time}</div>
      </div>
      <div class="deploy-time">${d.time}</div>
      <div class="deploy-actions">
        ${i === 0 ? '<span class="badge badge-green">Activo</span>' : '<button class="btn-sm btn-ghost" style="font-size:11px;padding:4px 8px;" onclick="alert(\'Rollback iniciado\')">↩ Rollback</button>'}
      </div>
    </div>
  `).join('');
}

// ── Analytics ──────────────────────────────
function renderAnalytics() {
  const visits = Math.floor(Math.random() * 5000 + 1000);
  const views = Math.floor(visits * 2.3);
  document.getElementById('ana-visits').textContent = visits.toLocaleString();
  document.getElementById('ana-views').textContent = views.toLocaleString();
  document.getElementById('ana-time').textContent = '2m 34s';
  document.getElementById('ana-bounce').textContent = Math.floor(Math.random() * 20 + 30) + '%';

  // Mini chart bars
  const bars = document.getElementById('mini-bars');
  bars.innerHTML = Array.from({ length: 30 }, () => {
    const h = Math.floor(Math.random() * 90 + 10);
    return `<div class="mini-bar" style="height:${h}%" title="${Math.floor(Math.random()*200)} visitas"></div>`;
  }).join('');
}

// ── Project Domains ────────────────────────
function renderProjectDomains() {
  if (!currentSite) return;
  const list = document.getElementById('proj-domains-list');
  const domains = [];
  domains.push({ name: currentSite.domain, type: 'deployos', verified: true });
  if (currentSite.customDomain) domains.push({ name: currentSite.customDomain, type: 'custom', verified: true });
  if (currentSite.extraDomains) currentSite.extraDomains.forEach(d => domains.push({ name: d, type: 'custom', verified: true }));

  list.innerHTML = domains.map(d => `
    <div class="domain-item">
      <div class="domain-item-icon">${d.type === 'deployos' ? '🔷' : '🌐'}</div>
      <div class="domain-item-info">
        <div class="domain-item-name">${d.name}</div>
        <div class="domain-item-meta">${d.type === 'deployos' ? 'Subdominio DeployOS' : 'Dominio personalizado'} · ${d.verified ? '✅ Verificado' : '⏳ Pendiente'}</div>
      </div>
      ${d.type !== 'deployos' ? `<button class="btn-sm btn-danger" style="font-size:11px;padding:4px 10px;" onclick="removeDomain('${d.name}')">Eliminar</button>` : ''}
    </div>
  `).join('');
}

function addDomainToProject() {
  const val = document.getElementById('proj-add-domain-input').value.trim();
  const msg = document.getElementById('proj-domain-msg');
  if (!val || !currentSite) return;
  if (!currentSite.extraDomains) currentSite.extraDomains = [];
  if (!currentUserData.customDomainUsed) {
    currentSite.extraDomains.push(val);
    currentUserData.customDomainUsed = true;
    saveSites(); renderProjectDomains(); renderSites();
    msg.className = 'alert-box alert-success';
    msg.innerHTML = '✅ Primer dominio personalizado añadido gratis.';
  } else {
    currentSite.extraDomains.push(val);
    saveSites(); renderProjectDomains(); renderSites();
    msg.className = 'alert-box alert-warning';
    msg.innerHTML = '💳 Dominio adicional: $10/mes en tu próxima factura.';
  }
  msg.style.display = 'flex';
  document.getElementById('proj-add-domain-input').value = '';
}

function removeDomain(name) {
  if (!currentSite || !confirm('¿Eliminar el dominio ' + name + '?')) return;
  if (currentSite.extraDomains) currentSite.extraDomains = currentSite.extraDomains.filter(d => d !== name);
  if (currentSite.customDomain === name) currentSite.customDomain = null;
  saveSites(); renderProjectDomains(); renderSites();
}

function addEnvVar() {
  const key = prompt('Nombre de la variable (ej: API_KEY):');
  if (!key) return;
  const val = prompt('Valor:');
  if (val === null) return;
  const list = document.getElementById('env-list');
  const item = document.createElement('div');
  item.className = 'env-item';
  item.style.cssText = 'border-radius:10px;border-bottom:1px solid var(--border2);margin-top:6px;';
  item.innerHTML = `
    <div class="env-key">${key}</div>
    <div style="display:flex;gap:8px;align-items:center;">
      <span class="badge badge-purple env-env-badge">Custom</span>
      <div class="env-value">••••••••••</div>
    </div>
  `;
  list.appendChild(item);
}

function redeployCurrent() {
  if (!currentSite) return;
  currentSite.deploys = (currentSite.deploys || 1) + 1;
  const newDeploy = {
    id: 'd_' + Math.random().toString(36).slice(2, 7),
    status: 'ok',
    branch: 'main',
    commit: Math.random().toString(36).slice(2, 9),
    msg: 'Redespliegue manual',
    time: 'hace un momento'
  };
  if (!currentSite.deployHistory) currentSite.deployHistory = [];
  currentSite.deployHistory.push(newDeploy);
  saveSites();
  renderDeployments();
  renderSites();
  alert('🔄 Redespliegue iniciado para ' + currentSite.name);
}

function deleteCurrentSite() {
  if (!currentSite) return;
  if (!confirm('¿Eliminar "' + currentSite.name + '" permanentemente?')) return;
  sites = sites.filter(s => s !== currentSite);
  saveSites(); renderSites();
  goToDashboard();
}

// ── Sites ──────────────────────────────────
function loadSites() {
  const key = 'deployos_sites_' + currentUser.uid;
  try { sites = JSON.parse(localStorage.getItem(key) || '[]'); } catch (e) { sites = []; }
  renderSites();
}

function saveSites() {
  const key = 'deployos_sites_' + currentUser.uid;
  localStorage.setItem(key, JSON.stringify(sites));
}

function renderSites() {
  const grid = document.getElementById('sites-grid');
  const empty = document.getElementById('empty-state');
  document.getElementById('stat-sites').textContent = sites.filter(s => s.status === 'active').length;
  document.getElementById('stat-domains').textContent = sites.filter(s => s.customDomain || (s.extraDomains && s.extraDomains.length)).length;
  document.getElementById('stat-deploys').textContent = sites.reduce((a, s) => a + (s.deploys || 0), 0);
  if (!sites.length) { empty.style.display = 'block'; grid.style.display = 'none'; return; }
  empty.style.display = 'none';
  grid.style.display = 'grid';
  grid.innerHTML = sites.map((s, i) => {
    const letter = s.name[0].toUpperCase();
    const color = ['#7C3AED','#2563EB','#059669','#DC2626','#D97706'][i % 5];
    return `
      <div class="site-card" onclick="openProjectPage(${i})">
        <div class="site-preview">
          <div class="site-preview-fallback">
            <div class="site-preview-dot" style="background:${color}">${letter}</div>
          </div>
          <div class="site-preview-overlay"></div>
        </div>
        <div class="site-body">
          <div class="site-name">${s.name}</div>
          <div class="site-domain">${s.domain}</div>
          <div class="site-meta">
            <span class="badge ${s.status === 'active' ? 'badge-green' : 'badge-amber'}">${s.status === 'active' ? '● Activo' : '⏳ Desplegando'}</span>
            ${s.repo ? `<span class="badge badge-gray">⎇ ${s.repo}</span>` : ''}
            ${s.customDomain || (s.extraDomains && s.extraDomains.length) ? `<span class="badge badge-purple">🌐 Custom</span>` : ''}
            <span class="site-time">${s.time || 'hace un momento'}</span>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// ── New Site Modal ─────────────────────────
function openNewSite() {
  selectedRepo = null; deployRunning = false;
  document.getElementById('subdomain-input').value = '';
  document.getElementById('custom-domain-input').value = '';
  document.getElementById('deploy-log').innerHTML = '<div class="log-line info">Listo para desplegar...</div>';
  document.getElementById('domain-check').style.display = 'none';
  document.getElementById('custom-domain-info').style.display = 'none';
  document.querySelectorAll('.repo-item').forEach(r => r.classList.remove('selected'));
  goStep(1);
  openModal('modal-new-site');
}

function goStep(n) {
  [1, 2, 3].forEach(i => {
    document.getElementById('new-step-' + i).style.display = i === n ? 'block' : 'none';
    const s = document.getElementById('step' + i);
    s.classList.remove('active', 'done');
    if (i < n) s.classList.add('done');
    if (i === n) s.classList.add('active');
  });
  if (n === 3) {
    const sub = document.getElementById('subdomain-input').value || 'mi-sitio';
    document.getElementById('summary-repo').textContent = selectedRepo || '(sin repo)';
    document.getElementById('summary-url').textContent = sub + '.deployos.app';
  }
}

function selectRepo(el, repo) {
  document.querySelectorAll('.repo-item').forEach(r => r.classList.remove('selected'));
  el.classList.add('selected');
  selectedRepo = repo;
}

function filterRepos() {
  const q = document.getElementById('repo-search').value.toLowerCase();
  document.querySelectorAll('.repo-item').forEach(r => {
    r.style.display = r.dataset.repo.includes(q) ? '' : 'none';
  });
}

function checkDomain() {
  const val = document.getElementById('subdomain-input').value;
  const box = document.getElementById('domain-check');
  if (!val) { box.style.display = 'none'; return; }
  box.style.display = 'flex';
  const taken = ['demo', 'test', 'admin', 'app', 'api', 'www'].includes(val.toLowerCase());
  box.style.color = taken ? 'var(--red)' : 'var(--green)';
  box.style.background = taken ? 'rgba(239,68,68,0.08)' : 'rgba(16,185,129,0.08)';
  box.style.border = taken ? '1px solid rgba(239,68,68,0.2)' : '1px solid rgba(16,185,129,0.2)';
  box.innerHTML = taken ? '❌ Nombre no disponible' : '✅ ' + val + '.deployos.app — disponible';
}

function addCustomDomain() {
  const val = document.getElementById('custom-domain-input').value.trim();
  const info = document.getElementById('custom-domain-info');
  if (!val) return;
  info.style.display = 'flex';
  if (!currentUserData.customDomainUsed) {
    info.className = 'alert-box alert-success';
    info.innerHTML = '✅ <span>¡Primer dominio personalizado gratis! El próximo costará $10/mes.</span>';
    currentUserData.customDomainUsed = true;
    document.getElementById('custom-domain-badge').textContent = '2° = $10/mes';
    document.getElementById('custom-domain-badge').className = 'badge badge-amber';
  } else {
    info.className = 'alert-box alert-warning';
    info.innerHTML = '💳 <span>Este dominio adicional costará <b>$10/mes</b>. Se añadirá a tu factura.</span>';
  }
}

function startDeploy() {
  if (deployRunning) return;
  deployRunning = true;
  const btnDeploy = document.getElementById('btn-deploy');
  const btnBack = document.getElementById('btn-back-3');
  btnDeploy.textContent = '⏳ Desplegando...';
  btnDeploy.disabled = true;
  btnBack.style.display = 'none';
  const log = document.getElementById('deploy-log');
  const lines = [
    { t: 200,  c: 'info',    m: '[00:00] Iniciando despliegue...' },
    { t: 600,  c: '',        m: '[00:01] Clonando repositorio ' + (selectedRepo || 'proyecto') + '...' },
    { t: 1100, c: '',        m: '[00:02] Instalando dependencias (npm install)...' },
    { t: 1800, c: '',        m: '[00:04] Ejecutando build (npm run build)...' },
    { t: 2400, c: '',        m: '[00:06] Optimizando assets...' },
    { t: 3000, c: '',        m: '[00:07] Subiendo archivos a CDN...' },
    { t: 3500, c: '',        m: '[00:08] Configurando SSL/TLS...' },
    { t: 4000, c: '',        m: '[00:09] Asignando dominio...' },
    { t: 4500, c: 'success', m: '[00:10] ✅ ¡Despliegue completado con éxito!' }
  ];
  log.innerHTML = '';
  lines.forEach(({ t, c, m }) => {
    setTimeout(() => {
      log.innerHTML += `<div class="log-line ${c}">${m}</div>`;
      log.scrollTop = log.scrollHeight;
    }, t);
  });
  setTimeout(() => {
    const sub = document.getElementById('subdomain-input').value || ('sitio-' + Date.now().toString(36));
    const cDomain = document.getElementById('custom-domain-input').value.trim();
    const newSite = {
      name: selectedRepo || sub,
      repo: selectedRepo,
      domain: sub + '.deployos.app',
      customDomain: cDomain || null,
      status: 'active',
      deploys: 1,
      time: 'hace un momento',
      previewUrl: null,
      deployHistory: [{
        id: 'd_' + Math.random().toString(36).slice(2,7),
        status: 'ok', branch: 'main',
        commit: Math.random().toString(36).slice(2,9),
        msg: 'Initial deploy',
        time: 'hace un momento'
      }]
    };
    sites.push(newSite);
    saveSites();
    renderSites();
    setTimeout(() => {
      closeModal('modal-new-site');
      deployRunning = false;
      btnDeploy.textContent = '🚀 Desplegar';
      btnDeploy.disabled = false;
      btnBack.style.display = '';
    }, 800);
  }, 4700);
}

// ── Upgrade ────────────────────────────────
function selectPlan(el, plan) {
  document.querySelectorAll('.plan-card').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
}

function upgradePlan() {
  const sel = document.querySelector('.plan-card.selected');
  const planName = sel ? sel.querySelector('.plan-name').textContent : 'Pro';
  currentUserData.plan = planName;
  document.getElementById('settings-plan').textContent = planName;
  closeModal('modal-upgrade');
  alert('✅ Plan actualizado a ' + planName);
}

// ── Admin ──────────────────────────────────
function loadAdminData() {
  document.getElementById('admin-stat-users').textContent = Math.floor(Math.random() * 200 + 50);
  document.getElementById('admin-stat-sites').textContent = Math.floor(Math.random() * 500 + 100);
  document.getElementById('admin-stat-domains').textContent = Math.floor(Math.random() * 80 + 20);
  const demoUsers = [
    { name: 'TrooperMaskyt', email: ADMIN_EMAIL, plan: 'Admin', sites: 999 },
    { name: 'María García',  email: 'maria@example.com', plan: 'Pro',  sites: 12 },
    { name: 'Carlos López',  email: 'carlos@example.com', plan: 'Free', sites: 2  },
    { name: 'Ana Martínez',  email: 'ana@example.com',   plan: 'Team', sites: 7  },
    { name: 'Pedro Gómez',   email: 'pedro@example.com', plan: 'Free', sites: 1  }
  ];
  document.getElementById('users-tbody').innerHTML = demoUsers.map(u => `
    <tr>
      <td>${u.name}</td>
      <td style="color:var(--text2)">${u.email}</td>
      <td><span class="badge ${u.plan === 'Admin' ? 'badge-purple' : u.plan === 'Pro' ? 'badge-green' : u.plan === 'Team' ? 'badge-amber' : 'badge-gray'}">${u.plan}</span></td>
      <td style="font-family:var(--mono)">${u.sites}</td>
      <td><button class="btn-sm btn-ghost" style="font-size:11px;padding:4px 8px;">${u.email === ADMIN_EMAIL ? 'Tú' : 'Ver'}</button></td>
    </tr>
  `).join('');
}

// ── Modals ─────────────────────────────────
function openModal(id) { document.getElementById(id).style.display = 'flex'; }
function closeModal(id) { document.getElementById(id).style.display = 'none'; }

document.querySelectorAll('.modal-overlay').forEach(m => {
  m.addEventListener('click', e => { if (e.target === m) m.style.display = 'none'; });
});
