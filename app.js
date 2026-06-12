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

// ── GitHub OAuth ───────────────────────────
async function connectGitHub() {
  const btn = document.getElementById('btn-connect-github');
  btn.textContent = '⏳ Conectando...';
  btn.disabled = true;

  // Si hay Client ID real configurado, redirigir al flujo real
  if (GITHUB_CLIENT_ID !== "TU_GITHUB_CLIENT_ID") {
    const redirect = encodeURIComponent(window.location.href.split('?')[0]);
    window.location.href = `https://github.com/login/oauth/authorize?client_id=${GITHUB_CLIENT_ID}&scope=repo&redirect_uri=${redirect}`;
    return;
  }

  // Modo demo: pedir username de GitHub y cargar repos públicos reales
  const username = prompt('Introduce tu usuario de GitHub para cargar tus repos públicos (demo):');
  if (!username) { btn.textContent = 'Conectar GitHub'; btn.disabled = false; return; }

  btn.textContent = '⏳ Cargando repos...';
  try {
    const resp = await fetch(`https://api.github.com/users/${username}/repos?sort=updated&per_page=30`);
    if (!resp.ok) throw new Error('Usuario no encontrado');
    const repos = await resp.json();
    // Obtener info del usuario
    const userResp = await fetch(`https://api.github.com/users/${username}`);
    const userData = await userResp.json();

    githubUser = { login: userData.login, name: userData.name || userData.login, avatar: userData.avatar_url };
    githubToken = 'demo_public';
    githubRepos = repos.map(r => ({
      id: r.id,
      name: r.name,
      full_name: r.full_name,
      description: r.description,
      language: r.language,
      updated_at: r.updated_at,
      private: r.private,
      default_branch: r.default_branch || 'main',
      html_url: r.html_url
    }));

    sessionStorage.setItem('gh_token', githubToken);
    sessionStorage.setItem('gh_user', JSON.stringify(githubUser));
    sessionStorage.setItem('gh_repos', JSON.stringify(githubRepos));

    updateGitHubUI();
    closeModal('modal-github-connect');
    openNewSite(); // abrir directamente el modal de nuevo sitio
  } catch (e) {
    alert('Error: ' + e.message + '\nVerifica el username de GitHub.');
    btn.textContent = 'Conectar GitHub';
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
      <div class="repo-item" onclick="selectRepo(this,'${r.name}','${r.default_branch||'main'}','${r.language||''}','${r.full_name||r.name}')" data-repo="${r.name}">
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

function selectRepo(el, repo, branch, lang, fullName) {
  document.querySelectorAll('.repo-item').forEach(r => r.classList.remove('selected'));
  el.classList.add('selected');
  selectedRepo = repo;
  selectedRepoBranch = branch || 'main';
  selectedRepoLang = lang;
  selectedRepoFull = fullName;
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
  const iframe = document.createElement('iframe');
  iframe.srcdoc = html;
  iframe.setAttribute('sandbox', 'allow-scripts');
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
function loadPreview() {
  const iframe = document.getElementById('preview-iframe');
  const placeholder = document.getElementById('preview-placeholder');
  const site = currentSite;
  if (!site) return;

  const colors = { nextjs:'#000000', react:'#1e1e2e', vue:'#1a1a2a', svelte:'#1a0a0a', static:'#0f0f1a', other:'#0a0a0f' };
  const accents = { nextjs:'#ffffff', react:'#61dafb', vue:'#42b883', svelte:'#ff3e00', static:'#7c3aed', other:'#10b981' };
  const fw = site.framework || 'static';
  const bg = colors[fw] || '#0f0f1a';
  const accent = accents[fw] || '#7c3aed';
  const name = site.name;
  const domain = site.domain;
  const repo = site.repo || name;
  const branch = site.repoBranch || 'main';

  const html = `<!DOCTYPE html><html><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${name}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box;}
  :root{--accent:${accent};--bg:${bg};--bg2:${bg}cc;}
  body{font-family:system-ui,-apple-system,sans-serif;background:var(--bg);color:#f0f0ff;min-height:100vh;}
  nav{position:sticky;top:0;z-index:99;background:${bg}ee;backdrop-filter:blur(12px);border-bottom:1px solid ${accent}33;padding:.75rem 2rem;display:flex;align-items:center;justify-content:space-between;}
  .brand{display:flex;align-items:center;gap:.5rem;font-weight:700;font-size:1.1rem;color:var(--accent);}
  .brand-dot{width:10px;height:10px;border-radius:50%;background:var(--accent);}
  .nav-links{display:flex;gap:1.5rem;list-style:none;}
  .nav-links a{color:#a0a0c0;text-decoration:none;font-size:.875rem;transition:color .2s;}
  .nav-links a:hover{color:var(--accent);}
  .hero{padding:5rem 2rem 4rem;text-align:center;background:radial-gradient(ellipse 80% 60% at 50% 0%,${accent}22,transparent);}
  .hero-tag{display:inline-block;padding:.25rem .75rem;background:${accent}22;border:1px solid ${accent}44;border-radius:20px;font-size:.75rem;color:var(--accent);margin-bottom:1.5rem;letter-spacing:.05em;}
  h1{font-size:clamp(2rem,5vw,3.5rem);font-weight:800;line-height:1.1;margin-bottom:1rem;background:linear-gradient(135deg,#fff 0%,${accent} 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;}
  .hero p{color:#a0a0c0;font-size:1rem;max-width:540px;margin:0 auto 2rem;line-height:1.6;}
  .hero-btns{display:flex;gap:1rem;justify-content:center;flex-wrap:wrap;}
  .btn{display:inline-flex;align-items:center;gap:.5rem;padding:.65rem 1.5rem;border-radius:8px;font-weight:600;font-size:.875rem;cursor:pointer;text-decoration:none;transition:all .2s;}
  .btn-primary{background:var(--accent);color:${fw==='react'||fw==='nextjs'?'#000':'#fff'};}
  .btn-primary:hover{opacity:.85;transform:translateY(-1px);}
  .btn-ghost{background:transparent;border:1px solid ${accent}55;color:var(--accent);}
  .btn-ghost:hover{border-color:var(--accent);background:${accent}11;}
  .features{padding:3rem 2rem;background:${bg};}
  .features-title{text-align:center;font-size:1.5rem;font-weight:700;margin-bottom:.5rem;}
  .features-sub{text-align:center;color:#808090;font-size:.875rem;margin-bottom:2.5rem;}
  .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:1rem;max-width:900px;margin:0 auto;}
  .card{background:${bg}cc;border:1px solid ${accent}22;border-radius:12px;padding:1.5rem;transition:border-color .2s,transform .2s;}
  .card:hover{border-color:${accent}66;transform:translateY(-3px);}
  .card-icon{font-size:1.75rem;margin-bottom:.75rem;}
  .card h3{font-size:1rem;font-weight:600;margin-bottom:.4rem;color:var(--accent);}
  .card p{font-size:.8rem;color:#707090;line-height:1.5;}
  .stack{padding:2rem;background:${accent}08;border-top:1px solid ${accent}15;border-bottom:1px solid ${accent}15;}
  .stack-inner{max-width:700px;margin:0 auto;display:flex;align-items:center;justify-content:space-between;gap:1rem;flex-wrap:wrap;}
  .stack-tag{display:flex;align-items:center;gap:.4rem;padding:.35rem .85rem;background:${bg};border:1px solid ${accent}33;border-radius:20px;font-size:.8rem;color:var(--accent);}
  footer{padding:1.5rem 2rem;text-align:center;color:#404060;font-size:.75rem;border-top:1px solid ${accent}15;}
  footer a{color:${accent};text-decoration:none;}
  footer a:hover{text-decoration:underline;}
  .deployos-badge{display:inline-flex;align-items:center;gap:.4rem;padding:.25rem .65rem;background:${bg};border:1px solid ${accent}33;border-radius:6px;font-size:.7rem;color:var(--accent);margin-top:.5rem;}
</style>
</head><body>
<nav>
  <div class="brand"><div class="brand-dot"></div>${name}</div>
  <ul class="nav-links">
    <li><a href="#">Inicio</a></li>
    <li><a href="#">Proyectos</a></li>
    <li><a href="#">Sobre mí</a></li>
    <li><a href="#">Contacto</a></li>
  </ul>
</nav>
<section class="hero">
  <div class="hero-tag">✨ Desplegado con DeployOS</div>
  <h1>${name.replace(/-/g,' ').replace(/\b\w/g,c=>c.toUpperCase())}</h1>
  <p>Bienvenido a mi proyecto. Construido con ${fwNames[fw]||'tecnología moderna'} y desplegado automáticamente desde <code style="color:${accent};background:${accent}18;padding:0 4px;border-radius:3px;">${repo}</code>.</p>
  <div class="hero-btns">
    <a href="https://github.com/${repo}" target="_blank" class="btn btn-primary">Ver en GitHub</a>
    <a href="#features" class="btn btn-ghost">Conocer más</a>
  </div>
</section>
<div class="stack">
  <div class="stack-inner">
    <span class="stack-tag">⎇ ${branch}</span>
    <span class="stack-tag">📦 ${fwNames[fw]||fw}</span>
    <span class="stack-tag">🔒 SSL activo</span>
    <span class="stack-tag">🌍 CDN global</span>
    <span class="stack-tag">⚡ Optimizado</span>
  </div>
</div>
<section class="features" id="features">
  <div class="features-title">Características</div>
  <div class="features-sub">Todo lo que necesitas para tu proyecto</div>
  <div class="grid">
    <div class="card"><div class="card-icon">⚡</div><h3>Velocidad máxima</h3><p>CDN global con edge nodes en LATAM, US y EU para la mínima latencia.</p></div>
    <div class="card"><div class="card-icon">🔒</div><h3>SSL automático</h3><p>Certificados SSL/TLS gestionados automáticamente. Siempre seguro.</p></div>
    <div class="card"><div class="card-icon">🔄</div><h3>Deploy continuo</h3><p>Cada push a ${branch} despliega automáticamente. Sin pasos manuales.</p></div>
    <div class="card"><div class="card-icon">🌐</div><h3>Dominios custom</h3><p>Conecta tu dominio personalizado en segundos con DNS automático.</p></div>
    <div class="card"><div class="card-icon">📊</div><h3>Analíticas</h3><p>Visitas, page views y métricas en tiempo real desde el dashboard.</p></div>
    <div class="card"><div class="card-icon">🛡</div><h3>DDoS protection</h3><p>Protección automática contra ataques para que tu sitio siempre esté disponible.</p></div>
  </div>
</section>
<footer>
  <div>© ${new Date().getFullYear()} ${name} · <a href="https://github.com/${repo}" target="_blank">github.com/${repo}</a></div>
  <div class="deployos-badge">🚀 Desplegado con <strong>DeployOS</strong></div>
</footer>
</body></html>`;

  const fwNames2 = { nextjs:'Next.js', react:'React', vue:'Vue', svelte:'Svelte', static:'HTML/CSS estático', other:'Node.js' };
  iframe.srcdoc = html;
  iframe.style.display = 'block';
  placeholder.style.display = 'none';
}

// Re-usar el objeto fwNames en contexto global
const fwNames = { nextjs:'Next.js', react:'React', vue:'Vue', svelte:'Svelte', static:'HTML/CSS estático', other:'Node.js' };

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
  const iframe = document.getElementById('preview-iframe');
  const tmp = iframe.srcdoc;
  iframe.srcdoc = '';
  setTimeout(() => { iframe.srcdoc = tmp; }, 80);
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
  if (!currentSite || !confirm('¿Eliminar "' + currentSite.name + '" permanentemente?')) return;
  sites = sites.filter(s => s !== currentSite);
  saveSites(); renderSites(); goToDashboard();
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
