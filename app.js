// =============================================
//  DeployOS — app.js v3
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

// ─── GitHub OAuth ───────────────────────────
// Para usar GitHub OAuth real:
// 1. Crea una OAuth App en github.com/settings/developers
// 2. Callback URL: la URL donde está hosteado tu DeployOS
// 3. Pon tu Client ID aquí:
const GITHUB_CLIENT_ID = "TU_GITHUB_CLIENT_ID";
// NOTA: El Client Secret NO va en frontend. Necesitas un backend/proxy.
// En modo demo, simulamos el flujo OAuth con repos reales públicos.

let fbApp, auth, db;
let currentUser = null;
let currentUserData = null;
let sites = [];
let currentSite = null;
let currentSiteIndex = -1;
let selectedRepo = null;
let deployRunning = false;
let githubToken = null;
let githubUser = null;
let githubRepos = [];

// ── Firebase Init ──────────────────────────
try {
  fbApp = firebase.initializeApp(FIREBASE_CONFIG);
  auth = firebase.auth();
  db = firebase.firestore();
  auth.onAuthStateChanged(user => { if (user) loadUserData(user); });
} catch (e) {
  console.warn("Firebase no configurado. Modo demo.", e);
}

// Revisar si volvimos de GitHub OAuth
window.addEventListener('load', () => {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('github_code'); // simulado via hash
  const ghToken = sessionStorage.getItem('gh_token');
  if (ghToken) {
    githubToken = ghToken;
    const ghU = sessionStorage.getItem('gh_user');
    if (ghU) githubUser = JSON.parse(ghU);
  }
});

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
  try { await auth.signInWithEmailAndPassword(email, pass); }
  catch (e) { loginDemo(email, null); }
}

async function doRegister() {
  const name = document.getElementById('reg-name').value.trim();
  const email = document.getElementById('reg-email').value.trim();
  const pass = document.getElementById('reg-password').value;
  if (!name || !email || !pass) { showError('reg-error', 'Completa todos los campos'); return; }
  if (pass.length < 6) { showError('reg-error', 'Contraseña mínimo 6 caracteres'); return; }
  try {
    const cred = await auth.createUserWithEmailAndPassword(email, pass);
    await db.collection('users').doc(cred.user.uid).set({ name, email, plan: 'free', createdAt: new Date(), customDomainUsed: false });
  } catch (e) { loginDemo(email, name); }
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
  currentUserData = { name: name || (email === ADMIN_EMAIL ? 'TrooperMaskyt' : email.split('@')[0]), email, plan: 'free', isAdmin: email === ADMIN_EMAIL, customDomainUsed: false };
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
  el.textContent = msg; el.style.display = 'block';
}

// ── GitHub PAT ─────────────────────────────
async function connectGitHub() {
  const token = document.getElementById('gh-pat-input').value.trim();
  const btn = document.getElementById('btn-connect-github');
  const err = document.getElementById('gh-pat-error');
  err.style.display = 'none';
  if (!token) { err.textContent = 'Pega tu Personal Access Token'; err.style.display = 'block'; return; }
  btn.textContent = '⏳ Verificando...';
  btn.disabled = true;
  try {
    const userResp = await fetch('https://api.github.com/user', { headers: { 'Authorization': 'token ' + token } });
    if (!userResp.ok) throw new Error('Token inválido o sin permisos');
    const userData = await userResp.json();
    const reposResp = await fetch('https://api.github.com/user/repos?sort=updated&per_page=50&affiliation=owner', { headers: { 'Authorization': 'token ' + token } });
    const repos = await reposResp.json();
    githubUser = { login: userData.login, name: userData.name || userData.login, avatar: userData.avatar_url };
    githubToken = token;
    githubRepos = repos.map(r => ({
      id: r.id, name: r.name, full_name: r.full_name,
      description: r.description, language: r.language,
      updated_at: r.updated_at, private: r.private,
      default_branch: r.default_branch || 'main', html_url: r.html_url
    }));
    sessionStorage.setItem('gh_token', githubToken);
    sessionStorage.setItem('gh_user', JSON.stringify(githubUser));
    sessionStorage.setItem('gh_repos', JSON.stringify(githubRepos));
    updateGitHubUI();
    closeModal('modal-github-connect');
    openNewSite();
  } catch (e) {
    err.textContent = e.message;
    err.style.display = 'block';
    btn.textContent = 'Conectar';
    btn.disabled = false;
  }
}

function updateGitHubUI() {
  if (!githubUser) return;
  // Topbar badge
  const ghBadge = document.getElementById('github-badge');
  if (ghBadge) {
    ghBadge.innerHTML = `<img src="${githubUser.avatar}" style="width:20px;height:20px;border-radius:50%;"> ${githubUser.login}`;
    ghBadge.style.display = 'flex';
  }
  // Settings
  document.getElementById('github-status').textContent = '✅ Conectado como @' + githubUser.login;
  const btnGH = document.getElementById('btn-settings-github');
  if (btnGH) { btnGH.textContent = 'Desconectar'; btnGH.onclick = disconnectGitHub; }
}

function disconnectGitHub() {
  githubToken = null; githubUser = null; githubRepos = [];
  sessionStorage.removeItem('gh_token');
  sessionStorage.removeItem('gh_user');
  sessionStorage.removeItem('gh_repos');
  document.getElementById('github-status').textContent = 'No conectado';
  const ghBadge = document.getElementById('github-badge');
  if (ghBadge) ghBadge.style.display = 'none';
  const btnGH = document.getElementById('btn-settings-github');
  if (btnGH) { btnGH.textContent = 'Conectar'; btnGH.onclick = () => openModal('modal-github-connect'); }
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
  // Restaurar sesión de GitHub
  const savedToken = sessionStorage.getItem('gh_token');
  const savedUser = sessionStorage.getItem('gh_user');
  const savedRepos = sessionStorage.getItem('gh_repos');
  if (savedToken && savedUser) {
    githubToken = savedToken;
    githubUser = JSON.parse(savedUser);
    githubRepos = savedRepos ? JSON.parse(savedRepos) : [];
    updateGitHubUI();
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

// ── New Site Modal ─────────────────────────
function openNewSite() {
  selectedRepo = null; deployRunning = false;

  if (!githubToken) {
    // No conectado a GitHub → mostrar modal de conexión
    openModal('modal-github-connect');
    return;
  }

  // Cargar repos de GitHub en la lista
  document.getElementById('subdomain-input').value = '';
  document.getElementById('custom-domain-input').value = '';
  document.getElementById('deploy-log').innerHTML = '<div class="log-line info">Listo para desplegar...</div>';
  document.getElementById('domain-check').style.display = 'none';
  document.getElementById('custom-domain-info').style.display = 'none';
  renderRepoList('');
  goStep(1);
  openModal('modal-new-site');
}

function renderRepoList(filter) {
  const list = document.getElementById('repo-list');
  const repos = githubRepos.length ? githubRepos : getFallbackRepos();
  const filtered = repos.filter(r => r.name.toLowerCase().includes(filter.toLowerCase()) || (r.description||'').toLowerCase().includes(filter.toLowerCase()));

  const langIcons = { JavaScript:'🟨', TypeScript:'🔷', Python:'🐍', HTML:'🌐', CSS:'🎨', Vue:'💚', React:'⚛️', 'C++':'⚙️', Go:'🐹', Rust:'🦀', PHP:'🐘', Ruby:'💎', default:'📁' };

  if (!filtered.length) {
    list.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--text3);font-size:13px;">No se encontraron repositorios</div>';
    return;
  }

  list.innerHTML = filtered.map(r => {
    const icon = langIcons[r.language] || langIcons.default;
    const ago = timeAgo(r.updated_at);
    const badge = r.private ? '<span class="badge badge-gray" style="font-size:10px;">🔒 Privado</span>' : '';
    return `
      <div class="repo-item" onclick="selectRepo(this,'${r.name}','${r.default_branch||'main'}','${r.language||''}','${r.full_name||r.name}','${(r.description||'').replace(/'/g,'')}','${r.stargazers_count||0}')" data-repo="${r.name}">
        <div class="repo-icon">${icon}</div>
        <div style="flex:1;min-width:0;">
          <div style="display:flex;align-items:center;gap:6px;"><b style="font-size:13px;">${r.name}</b>${badge}</div>
          <div style="font-size:11px;color:var(--text3);margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${r.language ? r.language + ' · ' : ''}actualizado ${ago}</div>
          ${r.description ? `<div style="font-size:11px;color:var(--text2);margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${r.description}</div>` : ''}
        </div>
      </div>
    `;
  }).join('');
}

function getFallbackRepos() {
  return [
    { name:'my-portfolio', full_name:'user/my-portfolio', description:'Portafolio personal', language:'HTML', updated_at: new Date().toISOString(), private:false, default_branch:'main' },
    { name:'react-blog', full_name:'user/react-blog', description:'Blog con React y MDX', language:'TypeScript', updated_at: new Date(Date.now()-86400000).toISOString(), private:false, default_branch:'main' },
    { name:'nextjs-shop', full_name:'user/nextjs-shop', description:'Tienda con Next.js + Stripe', language:'TypeScript', updated_at: new Date(Date.now()-86400000*3).toISOString(), private:false, default_branch:'main' },
    { name:'landing-page', full_name:'user/landing-page', description:'Landing page animada', language:'Vue', updated_at: new Date(Date.now()-86400000*7).toISOString(), private:false, default_branch:'main' },
    { name:'api-backend', full_name:'user/api-backend', description:'REST API con Express', language:'JavaScript', updated_at: new Date(Date.now()-86400000*14).toISOString(), private:false, default_branch:'main' },
  ];
}

function timeAgo(dateStr) {
  if (!dateStr) return 'recientemente';
  const diff = (Date.now() - new Date(dateStr)) / 1000;
  if (diff < 3600) return 'hace ' + Math.floor(diff/60) + 'm';
  if (diff < 86400) return 'hace ' + Math.floor(diff/3600) + 'h';
  if (diff < 86400*30) return 'hace ' + Math.floor(diff/86400) + 'd';
  return 'hace ' + Math.floor(diff/86400/30) + ' meses';
}

function filterRepos() {
  const q = document.getElementById('repo-search').value;
  renderRepoList(q);
}

function selectRepo(el, repo, branch, lang, fullName, desc, stars) {
  document.querySelectorAll('.repo-item').forEach(r => r.classList.remove('selected'));
  el.classList.add('selected');
  selectedRepo = repo;
  selectedRepoBranch = branch || 'main';
  selectedRepoLang = lang;
  selectedRepoFull = fullName;
  selectedRepoDesc = desc || '';
  selectedRepoStars = parseInt(stars) || 0;
  // Auto-rellenar subdominio con nombre del repo
  const subInput = document.getElementById('subdomain-input');
  if (!subInput.value) {
    subInput.value = repo.toLowerCase().replace(/[^a-z0-9-]/g, '-');
    checkDomain();
  }
}

let selectedRepoBranch = 'main';
let selectedRepoLang = '';
let selectedRepoFull = '';
let selectedRepoDesc = '';
let selectedRepoStars = 0;

function goStep(n) {
  [1, 2, 3].forEach(i => {
    document.getElementById('new-step-' + i).style.display = i === n ? 'block' : 'none';
    const s = document.getElementById('step' + i);
    s.classList.remove('active', 'done');
    if (i < n) s.classList.add('done');
    if (i === n) s.classList.add('active');
  });
  if (n === 2 && selectedRepo) {
    // Detectar framework automáticamente
    detectFramework(selectedRepoLang);
  }
  if (n === 3) {
    const sub = document.getElementById('subdomain-input').value || 'mi-sitio';
    document.getElementById('summary-repo').textContent = selectedRepoFull || selectedRepo || '(sin repo)';
    document.getElementById('summary-url').textContent = sub + '.deployos.app';
    document.getElementById('summary-branch').textContent = selectedRepoBranch || 'main';
    document.getElementById('summary-framework').textContent = document.getElementById('framework-select').value || 'Auto';
  }
}

function detectFramework(lang) {
  const sel = document.getElementById('framework-select');
  if (!sel) return;
  const map = { 'TypeScript':'nextjs', 'JavaScript':'react', 'Vue':'vue', 'HTML':'static', 'CSS':'static', 'Python':'other' };
  const name = selectedRepo ? selectedRepo.toLowerCase() : '';
  if (name.includes('next')) sel.value = 'nextjs';
  else if (name.includes('vue') || name.includes('nuxt')) sel.value = 'vue';
  else if (name.includes('svelte')) sel.value = 'svelte';
  else if (name.includes('react') || name.includes('blog')) sel.value = 'react';
  else if (lang && map[lang]) sel.value = map[lang];
  else sel.value = 'static';
  updateBuildCommand();
}

function updateBuildCommand() {
  const sel = document.getElementById('framework-select');
  const cmds = { nextjs:'next build', react:'react-scripts build', vue:'vue-cli-service build', svelte:'vite build', static:'(ninguno)', other:'npm run build' };
  const out = { nextjs:'.next', react:'build', vue:'dist', svelte:'dist', static:'./', other:'dist' };
  if (!sel) return;
  const v = sel.value;
  document.getElementById('build-cmd-display').textContent = cmds[v] || 'npm run build';
  document.getElementById('output-dir-display').textContent = out[v] || 'dist';
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
  } else {
    info.className = 'alert-box alert-warning';
    info.innerHTML = '💳 <span>Este dominio adicional costará <b>$10/mes</b>.</span>';
  }
}

// ── Deploy con Preview funcional ───────────────
function startDeploy() {
  if (deployRunning) return;
  if (!selectedRepo) { alert('Selecciona un repositorio primero'); goStep(1); return; }
  deployRunning = true;
  const btnDeploy = document.getElementById('btn-deploy');
  const btnBack = document.getElementById('btn-back-3');
  btnDeploy.textContent = '⏳ Desplegando...';
  btnDeploy.disabled = true;
  btnBack.style.display = 'none';
  const log = document.getElementById('deploy-log');
  const framework = document.getElementById('framework-select') ? document.getElementById('framework-select').value : 'static';
  const sub = document.getElementById('subdomain-input').value || selectedRepo.toLowerCase().replace(/[^a-z0-9-]/g,'');

  const lines = [
    { t: 200,  c: 'info',    m: '[00:00] Iniciando despliegue...' },
    { t: 600,  c: '',        m: `[00:01] Clonando ${selectedRepoFull || selectedRepo} (${selectedRepoBranch})...` },
    { t: 1100, c: '',        m: '[00:02] Instalando dependencias...' },
    { t: 1700, c: 'info',    m: `[00:03] Framework detectado: ${framework}` },
    { t: 2200, c: '',        m: '[00:05] Ejecutando build...' },
    { t: 2800, c: '',        m: '[00:06] Optimizando assets y comprimiendo...' },
    { t: 3300, c: '',        m: '[00:07] Subiendo a CDN (edge nodes: US, EU, LATAM)...' },
    { t: 3800, c: '',        m: '[00:08] Configurando SSL/TLS...' },
    { t: 4200, c: '',        m: `[00:09] Asignando dominio ${sub}.deployos.app...` },
    { t: 4600, c: 'success', m: '[00:10] ✅ ¡Despliegue completado con éxito!' }
  ];
  log.innerHTML = '';
  lines.forEach(({ t, c, m }) => setTimeout(() => { log.innerHTML += `<div class="log-line ${c}">${m}</div>`; log.scrollTop = log.scrollHeight; }, t));

  setTimeout(() => {
    const cDomain = document.getElementById('custom-domain-input').value.trim();
    const newSite = {
      name: selectedRepo,
      repo: selectedRepoFull || selectedRepo,
      repoBranch: selectedRepoBranch || 'main',
      repoLang: selectedRepoLang,
      repoDesc: selectedRepoDesc,
      repoStars: selectedRepoStars,
      framework: framework,
      domain: sub + '.deployos.app',
      customDomain: cDomain || null,
      extraDomains: [],
      status: 'active',
      deploys: 1,
      time: 'hace un momento',
      previewUrl: null, // generado en el cliente
      deployHistory: [{ id: 'd_' + Math.random().toString(36).slice(2,7), status: 'ok', branch: selectedRepoBranch||'main', commit: Math.random().toString(36).slice(2,9), msg: 'Initial deploy via DeployOS', time: 'hace un momento' }]
    };
    sites.push(newSite);
    saveSites(); renderSites();
    setTimeout(() => {
      closeModal('modal-new-site');
      deployRunning = false;
      btnDeploy.textContent = '🚀 Desplegar';
      btnDeploy.disabled = false;
      btnBack.style.display = '';
      // Abrir la página del proyecto recién creado
      openProjectPage(sites.length - 1);
    }, 800);
  }, 4800);
}

// ── Sites ──────────────────────────────────
function loadSites() {
  const key = 'deployos_sites_' + currentUser.uid;
  try { sites = JSON.parse(localStorage.getItem(key) || '[]'); } catch (e) { sites = []; }
  renderSites();
}
function saveSites() {
  localStorage.setItem('deployos_sites_' + currentUser.uid, JSON.stringify(sites));
}

function renderSites() {
  const grid = document.getElementById('sites-grid');
  const empty = document.getElementById('empty-state');
  document.getElementById('stat-sites').textContent = sites.filter(s => s.status === 'active').length;
  document.getElementById('stat-domains').textContent = sites.filter(s => s.customDomain || (s.extraDomains && s.extraDomains.length)).length;
  document.getElementById('stat-deploys').textContent = sites.reduce((a, s) => a + (s.deploys || 0), 0);
  if (!sites.length) { empty.style.display = 'block'; grid.style.display = 'none'; return; }
  empty.style.display = 'none'; grid.style.display = 'grid';
  const palette = ['#7C3AED','#2563EB','#059669','#DC2626','#D97706','#0891B2','#7C3AED'];
  grid.innerHTML = sites.map((s, i) => `
    <div class="site-card" onclick="openProjectPage(${i})">
      <div class="site-preview-card">
        <div class="site-preview-mini" id="mini-preview-${i}"></div>
        <div class="site-preview-overlay"></div>
      </div>
      <div class="site-body">
        <div class="site-name">${s.name}</div>
        <div class="site-domain">${s.domain}</div>
        <div class="site-meta">
          <span class="badge ${s.status === 'active' ? 'badge-green' : 'badge-amber'}">${s.status === 'active' ? '● Activo' : '⏳ Desplegando'}</span>
          ${s.repo ? `<span class="badge badge-gray">⎇ ${s.repo.split('/').pop()}</span>` : ''}
          ${s.customDomain || (s.extraDomains && s.extraDomains.length) ? `<span class="badge badge-purple">🌐 Custom</span>` : ''}
          <span class="site-time">${s.time || 'hace un momento'}</span>
        </div>
      </div>
    </div>
  `).join('');
  // Generar mini previews
  sites.forEach((s, i) => renderMiniPreview(i, s, palette[i % palette.length]));
}

function renderMiniPreview(i, site, color) {
  const container = document.getElementById('mini-preview-' + i);
  if (!container) return;
  const name = site.name;
  const letter = name[0].toUpperCase();
  const html = `<!DOCTYPE html><html><head><style>
    *{margin:0;padding:0;box-sizing:border-box;}
    body{font-family:system-ui,sans-serif;background:#0f0f1a;color:#f0f0ff;height:100vh;overflow:hidden;}
    nav{background:${color}22;padding:8px 12px;display:flex;align-items:center;gap:8px;border-bottom:1px solid ${color}44;}
    .brand{font-weight:700;font-size:11px;color:${color};}
    .dot{width:6px;height:6px;border-radius:50%;background:${color};}
    .hero{padding:16px 12px;text-align:center;}
    .hero h1{font-size:16px;font-weight:800;color:${color};margin-bottom:4px;}
    .hero p{font-size:8px;color:#808090;}
    .grid{display:grid;grid-template-columns:1fr 1fr;gap:4px;padding:0 8px;}
    .card{background:#1a1a2e;border-radius:4px;padding:6px;border-left:2px solid ${color};}
    .card h4{font-size:7px;color:${color};margin-bottom:2px;}
    .card p{font-size:6px;color:#606070;}
    footer{position:absolute;bottom:0;width:100%;padding:4px;text-align:center;font-size:6px;color:#404050;background:#080810;}
  </style></head><body>
  <nav><div class="dot"></div><span class="brand">${name}</span></nav>
  <div class="hero"><h1>${letter}</h1><p>${name}.deployos.app</p></div>
  <div class="grid">
    <div class="card"><h4>⚡ Fast</h4><p>CDN global</p></div>
    <div class="card"><h4>🔒 SSL</h4><p>Auto cert</p></div>
  </div>
  <footer>Powered by DeployOS</footer>
  </body></html>`;
  var iframe = document.createElement('iframe');
  iframe.srcdoc = html;
  iframe.style.cssText = 'width:200%;height:200%;transform:scale(0.5);transform-origin:top left;border:none;pointer-events:none;';
  container.appendChild(iframe);
}

// ── Project Page ───────────────────────────
function openProjectPage(i) {
  currentSite = sites[i]; currentSiteIndex = i;
  document.getElementById('proj-title').textContent = currentSite.name;
  const domLink = document.getElementById('proj-domain-link');
  domLink.textContent = currentSite.domain;
  domLink.href = 'https://' + currentSite.domain;
  const badge = document.getElementById('proj-status-badge');
  badge.textContent = currentSite.status === 'active' ? '● Activo' : '⏳ Desplegando';
  badge.className = 'badge ' + (currentSite.status === 'active' ? 'badge-green' : 'badge-amber');
  document.getElementById('proj-setting-name').textContent = currentSite.name;
  document.getElementById('proj-setting-repo').textContent = currentSite.repo || '—';
  const fwNames = { nextjs:'Next.js', react:'React', vue:'Vue', svelte:'Svelte', static:'HTML/CSS estático', other:'Node.js' };
  document.getElementById('proj-setting-framework').textContent = fwNames[currentSite.framework] || 'Autodetectado';
  document.getElementById('preview-url-text').textContent = 'https://' + currentSite.domain;
  loadPreview();
  renderDeployments();
  renderAnalytics();
  renderProjectDomains();
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

// ── Preview funcional ──────────────────────
var _previewBlobUrl = null;

function buildPreviewHTML(site) {
  var fwMap = { nextjs:'Next.js', react:'React', vue:'Vue', svelte:'Svelte', static:'HTML/CSS', other:'Node.js' };
  var bgMap = { nextjs:'#000000', react:'#0d1117', vue:'#0d1117', svelte:'#0d1117', static:'#0d1117', other:'#0d1117' };
  var acMap = { nextjs:'#ffffff', react:'#61dafb', vue:'#42b883', svelte:'#ff3e00', static:'#7c3aed', other:'#10b981' };
  var iconMap = { nextjs:'▲', react:'⚛', vue:'◆', svelte:'◎', static:'◻', other:'⬡' };
  var fw = site.framework || 'static';
  var bg = bgMap[fw] || '#0d1117';
  var ac = acMap[fw] || '#7c3aed';
  var icon = iconMap[fw] || '◻';
  var nm = (site.name || 'Mi Sitio').replace(/</g,'&lt;');
  var rp = (site.repo || nm).replace(/</g,'&lt;');
  var br = site.repoBranch || 'main';
  var fwLabel = fwMap[fw] || fw;
  var desc = (site.repoDesc || '').replace(/</g,'&lt;') || 'Repositorio desplegado en DeployOS';
  var title = nm.replace(/-/g,' ').replace(/\b\w/g, function(c){ return c.toUpperCase(); });
  var stars = site.repoStars || 0;
  var lang = site.repoLang || '';
  var domain = site.domain || '';
  var commit = (site.deployHistory && site.deployHistory[0] && site.deployHistory[0].commit) || 'a3f2b1c';
  var langColor = { JavaScript:'#f1e05a', TypeScript:'#3178c6', HTML:'#e34c26', CSS:'#563d7c', Vue:'#42b883', Python:'#3572A5', React:'#61dafb' };
  var lc = langColor[lang] || '#8b949e';

  var h = [];
  h.push('<!DOCTYPE html><html lang="es"><head>');
  h.push('<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">');
  h.push('<title>' + nm + '</title>');
  h.push('<style>');
  h.push('*{margin:0;padding:0;box-sizing:border-box;}');
  h.push('body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;background:#0d1117;color:#e6edf3;min-height:100vh;}');
  h.push('a{color:inherit;text-decoration:none;}');
  h.push('.pv-topbar{background:#161b22;border-bottom:1px solid #30363d;padding:12px 24px;display:flex;align-items:center;gap:12px;}');
  h.push('.pv-logo{font-size:20px;color:#f0f6fc;font-weight:700;display:flex;align-items:center;gap:8px;}');
  h.push('.pv-logo-icon{width:28px;height:28px;background:' + ac + ';border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:14px;color:#000;font-weight:900;}');
  h.push('.pv-badge{display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:500;border:1px solid;}');
  h.push('.pv-badge-green{background:#1f3a1f;border-color:#2ea04380;color:#3fb950;}');
  h.push('.pv-badge-fw{background:#' + ac.replace('#','') + '15;border-color:' + ac + '40;color:' + ac + ';}');
  h.push('.pv-repo-header{padding:28px 24px 0;max-width:980px;margin:0 auto;}');
  h.push('.pv-repo-path{font-size:18px;color:#e6edf3;margin-bottom:8px;}');
  h.push('.pv-repo-path .pv-owner{color:#58a6ff;font-weight:400;}');
  h.push('.pv-repo-path .pv-slash{color:#8b949e;margin:0 2px;}');
  h.push('.pv-repo-path .pv-reponame{font-weight:600;}');
  h.push('.pv-repo-desc{color:#8b949e;font-size:14px;margin:8px 0 16px;}');
  h.push('.pv-repo-meta{display:flex;gap:16px;flex-wrap:wrap;margin-bottom:20px;}');
  h.push('.pv-meta-item{display:flex;align-items:center;gap:5px;font-size:13px;color:#8b949e;}');
  h.push('.pv-lang-dot{width:10px;height:10px;border-radius:50%;background:' + lc + ';}');
  h.push('.pv-tab-bar{border-bottom:1px solid #30363d;display:flex;gap:0;padding:0 24px;max-width:980px;margin:0 auto;}');
  h.push('.pv-tab{padding:10px 16px;font-size:14px;color:#8b949e;border-bottom:2px solid transparent;cursor:pointer;}');
  h.push('.pv-tab.active{color:#e6edf3;border-bottom-color:' + ac + ';}');
  h.push('.pv-content{max-width:980px;margin:0 auto;padding:24px;display:grid;grid-template-columns:1fr 280px;gap:24px;}');
  h.push('.pv-file-box{background:#161b22;border:1px solid #30363d;border-radius:6px;overflow:hidden;}');
  h.push('.pv-file-header{background:#161b22;border-bottom:1px solid #30363d;padding:10px 16px;display:flex;align-items:center;justify-content:space-between;}');
  h.push('.pv-commit-info{display:flex;align-items:center;gap:8px;font-size:13px;}');
  h.push('.pv-commit-hash{font-family:monospace;color:#58a6ff;font-size:12px;background:#1f2937;padding:2px 6px;border-radius:4px;}');
  h.push('.pv-file-list{font-size:13px;}');
  h.push('.pv-file-row{display:flex;align-items:center;gap:10px;padding:8px 16px;border-bottom:1px solid #21262d;color:#8b949e;}');
  h.push('.pv-file-row:last-child{border-bottom:none;}');
  h.push('.pv-file-row .pv-fname{color:#58a6ff;flex:1;}');
  h.push('.pv-file-row .pv-fmsg{flex:2;color:#8b949e;}');
  h.push('.pv-file-row .pv-fdate{color:#6e7681;font-size:12px;}');
  h.push('.pv-sidebar{display:flex;flex-direction:column;gap:16px;}');
  h.push('.pv-side-box{background:#161b22;border:1px solid #30363d;border-radius:6px;padding:16px;}');
  h.push('.pv-side-box h3{font-size:14px;font-weight:600;margin-bottom:10px;color:#e6edf3;}');
  h.push('.pv-side-box p{font-size:13px;color:#8b949e;line-height:1.5;}');
  h.push('.pv-deploy-status{display:flex;align-items:center;gap:8px;font-size:13px;padding:8px 0;}');
  h.push('.pv-status-dot{width:8px;height:8px;border-radius:50%;background:#3fb950;}');
  h.push('.pv-deploy-url{color:#58a6ff;font-size:13px;word-break:break-all;}');
  h.push('.pv-topic{display:inline-block;background:#1f3a5f;color:#58a6ff;border-radius:20px;padding:3px 10px;font-size:12px;margin:2px;}');
  h.push('</style></head><body>');

  // Topbar
  h.push('<div class="pv-topbar"><div class="pv-logo"><div class="pv-logo-icon">' + icon + '</div>' + nm + '</div>');
  h.push('<div style="margin-left:auto;display:flex;gap:8px;"><span class="pv-badge pv-badge-green">● Live</span><span class="pv-badge pv-badge-fw">' + fwLabel + '</span></div></div>');

  // Repo header
  h.push('<div class="pv-repo-header">');
  h.push('<div class="pv-repo-path"><span class="pv-owner">' + (rp.split('/')[0]||nm) + '</span><span class="pv-slash">/</span><span class="pv-reponame">' + (rp.split('/')[1]||nm) + '</span></div>');
  h.push('<div class="pv-repo-desc">' + desc + '</div>');
  h.push('<div class="pv-repo-meta">');
  if(lang) h.push('<span class="pv-meta-item"><span class="pv-lang-dot"></span>' + lang + '</span>');
  if(stars) h.push('<span class="pv-meta-item">★ ' + stars + '</span>');
  h.push('<span class="pv-meta-item">🌿 ' + br + '</span>');
  h.push('</div></div>');

  // Tabs
  h.push('<div class="pv-tab-bar"><span class="pv-tab active">📄 Código</span><span class="pv-tab">🔀 Commits</span><span class="pv-tab">⚙ Ajustes</span></div>');

  // Content grid
  h.push('<div class="pv-content">');

  // File list
  var files = {
    nextjs: [['app/','','hace 2 días'],['public/','','hace 5 días'],['package.json','Initial commit','hace 2 días'],['next.config.js','Config update','hace 3 días'],['README.md','Add docs','hace 1 semana']],
    react:  [['src/','','hace 2 días'],['public/','','hace 5 días'],['package.json','Initial commit','hace 2 días'],['vite.config.js','Config update','hace 3 días'],['README.md','Add docs','hace 1 semana']],
    vue:    [['src/','','hace 2 días'],['public/','','hace 5 días'],['package.json','Initial commit','hace 2 días'],['vue.config.js','Config update','hace 3 días'],['README.md','Add docs','hace 1 semana']],
    static: [['index.html','Initial commit','hace 2 días'],['styles.css','Style update','hace 3 días'],['script.js','Add interactions','hace 4 días'],['assets/','','hace 5 días'],['README.md','Add docs','hace 1 semana']],
    other:  [['src/','','hace 2 días'],['package.json','Initial commit','hace 2 días'],['index.js','Main entry','hace 3 días'],['Dockerfile','Add docker','hace 4 días'],['README.md','Add docs','hace 1 semana']]
  };
  var fileList = files[fw] || files['static'];
  h.push('<div class="pv-file-box"><div class="pv-file-header"><div class="pv-commit-info">');
  h.push('<div style="width:20px;height:20px;border-radius:50%;background:#30363d;display:inline-block;"></div>');
  h.push('<span style="color:#e6edf3">' + (rp.split('/')[0]||nm) + '</span>');
  h.push('<span style="color:#8b949e">último commit</span>');
  h.push('<span class="pv-commit-hash">' + commit + '</span></div>');
  h.push('<span style="color:#6e7681;font-size:12px;">hace un momento</span></div>');
  h.push('<div class="pv-file-list">');
  fileList.forEach(function(f){ h.push('<div class="pv-file-row"><span>' + (f[0].endsWith('/')?'📁':'📄') + '</span><span class="pv-fname">' + f[0] + '</span><span class="pv-fmsg">' + f[1] + '</span><span class="pv-fdate">' + f[2] + '</span></div>'); });
  h.push('</div></div>');

  // Sidebar
  h.push('<div class="pv-sidebar">');
  h.push('<div class="pv-side-box"><h3>🚀 Deploy</h3>');
  h.push('<div class="pv-deploy-status"><div class="pv-status-dot"></div><span style="color:#3fb950">Activo</span></div>');
  h.push('<div class="pv-deploy-url">' + domain + '</div>');
  h.push('<div style="margin-top:8px;font-size:12px;color:#6e7681">Rama: ' + br + ' · ' + fwLabel + '</div></div>');
  if(desc && desc !== 'Repositorio desplegado en DeployOS') {
    h.push('<div class="pv-side-box"><h3>ℹ Sobre este proyecto</h3><p>' + desc + '</p></div>');
  }
  h.push('<div class="pv-side-box"><h3>🔧 Stack</h3>');
  h.push('<div style="margin-top:4px">');
  if(lang) h.push('<span class="pv-topic">' + lang + '</span>');
  h.push('<span class="pv-topic">' + fwLabel + '</span><span class="pv-topic">SSL</span><span class="pv-topic">CI/CD</span></div></div>');
  h.push('</div></div></body></html>');
  return h.join('\n');
}

function getSitePreviewUrl(site) {
  var repo = site.repo || '';
  var parts = repo.split('/');
  if (parts.length === 2) {
    return 'https://' + parts[0] + '.github.io/' + parts[1] + '/';
  }
  return null;
}

async function fetchRepoHTML(site) {
  var repo = site.repo || '';
  var branch = site.repoBranch || 'main';
  if (!repo) return null;
  // Archivos entry point a intentar en orden
  var candidates = ['index.html', 'public/index.html', 'dist/index.html', 'src/index.html', 'build/index.html'];
  var headers = {};
  if (githubToken && githubToken !== 'demo_public') {
    headers['Authorization'] = 'token ' + githubToken;
  }
  for (var i = 0; i < candidates.length; i++) {
    try {
      var url = 'https://api.github.com/repos/' + repo + '/contents/' + candidates[i] + '?ref=' + branch;
      var resp = await fetch(url, { headers: headers });
      if (!resp.ok) continue;
      var data = await resp.json();
      if (data.content) {
        var html = atob(data.content.replace(/\n/g, ''));
        // Reescribir rutas relativas a raw.githubusercontent.com para que los assets carguen
        var base = 'https://raw.githubusercontent.com/' + repo + '/' + branch + '/';
        html = html.replace(/<head>/i, '<head><base href="' + base + '">');
        return html;
      }
    } catch(e) {}
  }
  return null;
}

function loadPreview() {
  var iframe = document.getElementById('preview-iframe');
  var placeholder = document.getElementById('preview-placeholder');
  var urlText = document.getElementById('preview-url-text');
  if (!currentSite) return;
  if (urlText) urlText.textContent = 'https://' + (currentSite.domain || currentSite.name + '.deployos.app');
  // Mostrar loading
  iframe.removeAttribute('src');
  iframe.removeAttribute('sandbox');
  iframe.srcdoc = '<html><body style="background:#0d1117;display:flex;align-items:center;justify-content:center;height:100vh;font-family:system-ui;color:#8b949e;gap:10px"><div style="width:16px;height:16px;border:2px solid #30363d;border-top-color:#58a6ff;border-radius:50%;animation:spin 0.8s linear infinite"></div><span>Cargando sitio...</span><style>@keyframes spin{to{transform:rotate(360deg)}}</style></body></html>';
  iframe.style.display = 'block';
  placeholder.style.display = 'none';
  fetchRepoHTML(currentSite).then(function(html) {
    if (html) {
      iframe.srcdoc = html;
    } else {
      // Fallback: preview generada
      iframe.srcdoc = buildPreviewHTML(currentSite);
    }
  });
}

function openSiteInNewTab() {
  if (!currentSite) return;
  fetchRepoHTML(currentSite).then(function(html) {
    var content = html || buildPreviewHTML(currentSite);
    var tab = window.open('', '_blank');
    if (tab) { tab.document.open(); tab.document.write(content); tab.document.close(); }
  });
}

function setPreviewSize(width, height, btn) {
  document.querySelectorAll('.size-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  const viewport = document.getElementById('preview-viewport');
  const iframe = document.getElementById('preview-iframe');
  viewport.style.background = width === '100%' ? '' : '#1a1a26';
  viewport.style.display = 'flex';
  viewport.style.alignItems = 'center';
  viewport.style.justifyContent = 'center';
  iframe.style.width = width;
  iframe.style.height = height === '100%' ? '520px' : height;
  if (width === '100%') { viewport.style.padding = '0'; iframe.style.margin = '0'; }
  else { viewport.style.padding = '1rem'; }
}

function refreshPreview() {
  loadPreview();
}

// ── Deployments ────────────────────────────
function renderDeployments() {
  const list = document.getElementById('deploy-list');
  if (!currentSite) return;
  const deploys = currentSite.deployHistory || [{ id:'d_init', status:'ok', branch:currentSite.repoBranch||'main', commit:'a3f2b1c', msg:'Initial deploy', time:'hace un momento' }];
  if (!currentSite.deployHistory) currentSite.deployHistory = deploys;
  list.innerHTML = deploys.slice().reverse().map((d, i) => `
    <div class="deploy-item">
      <div class="deploy-status-dot ${d.status === 'ok' ? 'ok' : 'pending'}"></div>
      <div class="deploy-info">
        <div class="deploy-name">${d.msg}</div>
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
  document.getElementById('ana-visits').textContent = (Math.floor(Math.random() * 5000 + 1000)).toLocaleString();
  document.getElementById('ana-views').textContent = (Math.floor(Math.random() * 12000 + 2000)).toLocaleString();
  document.getElementById('ana-time').textContent = '2m 34s';
  document.getElementById('ana-bounce').textContent = Math.floor(Math.random() * 20 + 30) + '%';
  document.getElementById('mini-bars').innerHTML = Array.from({ length: 30 }, () => {
    const h = Math.floor(Math.random() * 90 + 10);
    return `<div class="mini-bar" style="height:${h}%"></div>`;
  }).join('');
}

// ── Project Domains ────────────────────────
function renderProjectDomains() {
  if (!currentSite) return;
  const list = document.getElementById('proj-domains-list');
  const domains = [{ name: currentSite.domain, type: 'deployos', verified: true }];
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
  currentSite.extraDomains.push(val);
  saveSites(); renderProjectDomains(); renderSites();
  msg.className = 'alert-box ' + (!currentUserData.customDomainUsed ? 'alert-success' : 'alert-warning');
  msg.innerHTML = !currentUserData.customDomainUsed ? '✅ Primer dominio personalizado gratis.' : '💳 Dominio adicional: $10/mes.';
  msg.style.display = 'flex';
  if (!currentUserData.customDomainUsed) currentUserData.customDomainUsed = true;
  document.getElementById('proj-add-domain-input').value = '';
}

function removeDomain(name) {
  if (!currentSite || !confirm('¿Eliminar ' + name + '?')) return;
  if (currentSite.extraDomains) currentSite.extraDomains = currentSite.extraDomains.filter(d => d !== name);
  if (currentSite.customDomain === name) currentSite.customDomain = null;
  saveSites(); renderProjectDomains(); renderSites();
}

function addEnvVar() {
  const key = prompt('Nombre de la variable:');
  if (!key) return;
  const val = prompt('Valor:');
  if (val === null) return;
  const list = document.getElementById('env-list');
  const item = document.createElement('div');
  item.className = 'env-item';
  item.style.cssText = 'border-radius:10px;border-bottom:1px solid var(--border2);margin-top:6px;';
  item.innerHTML = `<div class="env-key">${key}</div><div style="display:flex;gap:8px;align-items:center;"><span class="badge badge-purple env-env-badge">Custom</span><div class="env-value">••••••••••</div></div>`;
  list.appendChild(item);
}

function redeployCurrent() {
  if (!currentSite) return;
  currentSite.deploys = (currentSite.deploys || 1) + 1;
  currentSite.time = 'hace un momento';
  const newDeploy = { id:'d_'+Math.random().toString(36).slice(2,7), status:'ok', branch:currentSite.repoBranch||'main', commit:Math.random().toString(36).slice(2,9), msg:'Redespliegue manual', time:'hace un momento' };
  if (!currentSite.deployHistory) currentSite.deployHistory = [];
  currentSite.deployHistory.push(newDeploy);
  saveSites(); renderDeployments(); renderSites();
  const log = document.getElementById('deploy-log');
  if (log) { log.innerHTML = '<div class="log-line info">Redespliegue iniciado...</div>'; }
  alert('🔄 Redespliegue iniciado correctamente');
}

function deleteCurrentSite() {
  if (!currentSite) { alert('No hay sitio seleccionado'); return; }
  var name = currentSite.name;
  var ok = window.confirm('Eliminar "' + name + '" permanentemente? Esta accion no se puede deshacer.');
  if (!ok) return;
  sites = sites.filter(function(s){ return s !== currentSite; });
  currentSite = null;
  saveSites();
  renderSites();
  goToDashboard();
}

// ── Upgrade ────────────────────────────────
function selectPlan(el) {
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
    { name:'TrooperMaskyt', email:ADMIN_EMAIL, plan:'Admin', sites:999 },
    { name:'María García', email:'maria@example.com', plan:'Pro', sites:12 },
    { name:'Carlos López', email:'carlos@example.com', plan:'Free', sites:2 },
    { name:'Ana Martínez', email:'ana@example.com', plan:'Team', sites:7 },
    { name:'Pedro Gómez', email:'pedro@example.com', plan:'Free', sites:1 }
  ];
  document.getElementById('users-tbody').innerHTML = demoUsers.map(u => `
    <tr>
      <td>${u.name}</td><td style="color:var(--text2)">${u.email}</td>
      <td><span class="badge ${u.plan==='Admin'?'badge-purple':u.plan==='Pro'?'badge-green':u.plan==='Team'?'badge-amber':'badge-gray'}">${u.plan}</span></td>
      <td style="font-family:var(--mono)">${u.sites}</td>
      <td><button class="btn-sm btn-ghost" style="font-size:11px;padding:4px 8px;">${u.email===ADMIN_EMAIL?'Tú':'Ver'}</button></td>
    </tr>
  `).join('');
}

// ── Modals ─────────────────────────────────
function openModal(id) { document.getElementById(id).style.display = 'flex'; }
function closeModal(id) { document.getElementById(id).style.display = 'none'; }
document.querySelectorAll('.modal-overlay').forEach(m => {
  m.addEventListener('click', e => { if (e.target === m) m.style.display = 'none'; });
});
