// =============================================
//  DeployOS — app.js
//  Admin: troopermaskyt@gmail.com
//  Configura FIREBASE_CONFIG con tus credenciales reales
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

let fbApp, auth, db;
let currentUser = null;
let currentUserData = null;
let sites = [];
let currentSite = null;
let selectedRepo = null;
let deployRunning = false;

// ── Firebase Init ──────────────────────────
try {
  fbApp = firebase.initializeApp(FIREBASE_CONFIG);
  auth = firebase.auth();
  db = firebase.firestore();
  auth.onAuthStateChanged(user => {
    if (user) {
      loadUserData(user);
    }
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
  const err = document.getElementById('login-error');
  err.style.display = 'none';
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
    if (doc.exists) {
      currentUserData = doc.data();
    } else {
      currentUserData = { name: user.email.split('@')[0], email: user.email, plan: 'free', customDomainUsed: false };
    }
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
  document.getElementById('sites-grid').innerHTML = '';
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

// ── Sites ──────────────────────────────────
function loadSites() {
  const key = 'deployos_sites_' + currentUser.uid;
  try {
    sites = JSON.parse(localStorage.getItem(key) || '[]');
  } catch (e) { sites = []; }
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
  document.getElementById('stat-domains').textContent = sites.filter(s => s.customDomain).length;
  document.getElementById('stat-deploys').textContent = sites.reduce((a, s) => a + (s.deploys || 0), 0);
  if (!sites.length) { empty.style.display = 'block'; grid.style.display = 'none'; return; }
  empty.style.display = 'none';
  grid.style.display = 'grid';
  grid.innerHTML = sites.map((s, i) => `
    <div class="site-card" onclick="openSiteDetail(${i})">
      <div class="site-preview">
        <div class="site-preview-dot">${s.name[0].toUpperCase()}</div>
      </div>
      <div class="site-body">
        <div class="site-name">${s.name}</div>
        <div class="site-domain">${s.domain}</div>
        <div class="site-meta">
          <span class="badge ${s.status === 'active' ? 'badge-green' : 'badge-amber'}">${s.status === 'active' ? '● Activo' : '⏳ Desplegando'}</span>
          ${s.repo ? `<span class="badge badge-gray">⎇ ${s.repo}</span>` : ''}
          ${s.customDomain ? `<span class="badge badge-purple">🌐 Custom</span>` : ''}
          <span class="site-time">${s.time || 'hace un momento'}</span>
        </div>
      </div>
    </div>
  `).join('');
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
    sites.push({
      name: selectedRepo || sub,
      repo: selectedRepo,
      domain: sub + '.deployos.app',
      customDomain: cDomain || null,
      status: 'active',
      deploys: 1,
      time: 'hace un momento'
    });
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

// ── Site Detail ────────────────────────────
function openSiteDetail(i) {
  currentSite = sites[i];
  document.getElementById('detail-name').textContent = currentSite.name;
  document.getElementById('detail-domain').textContent = currentSite.domain;
  document.getElementById('detail-repo').textContent = currentSite.repo || '—';
  document.getElementById('detail-deploys').textContent = currentSite.deploys || 1;
  const badge = document.getElementById('detail-badge');
  badge.textContent = currentSite.status === 'active' ? '✅ Activo' : '⏳ Desplegando';
  badge.className = 'badge ' + (currentSite.status === 'active' ? 'badge-green' : 'badge-amber');
  const dl = document.getElementById('detail-domains-list');
  dl.innerHTML = currentSite.customDomain
    ? `<div class="domain-status" style="background:var(--bg3);border-radius:8px;padding:10px 12px;font-size:13px;margin-bottom:0.5rem;display:flex;align-items:center;gap:8px;">
        <span style="color:var(--green)">✅</span><span>${currentSite.customDomain}</span>
       </div>`
    : `<div style="color:var(--text3);font-size:13px;padding:8px 0;">Sin dominios personalizados aún</div>`;
  document.getElementById('detail-domain-msg').style.display = 'none';
  openModal('modal-site-detail');
}

function addDomainToSite() {
  const val = document.getElementById('detail-add-domain').value.trim();
  if (!val || !currentSite) return;
  const msg = document.getElementById('detail-domain-msg');
  if (!currentUserData.customDomainUsed) {
    currentSite.customDomain = val;
    currentUserData.customDomainUsed = true;
    const i = sites.indexOf(currentSite);
    if (i >= 0) { sites[i] = currentSite; saveSites(); renderSites(); }
    msg.className = 'alert-box alert-success';
    msg.innerHTML = '✅ Primer dominio personalizado añadido gratis.';
  } else {
    msg.className = 'alert-box alert-warning';
    msg.innerHTML = '💳 Dominio adicional: $10/mes en tu próxima factura.';
  }
  msg.style.display = 'flex';
}

function deleteSite() {
  if (!currentSite) return;
  if (!confirm('¿Eliminar "' + currentSite.name + '" permanentemente?')) return;
  sites = sites.filter(s => s !== currentSite);
  saveSites(); renderSites();
  closeModal('modal-site-detail');
}

function redeploySite() {
  if (!currentSite) return;
  currentSite.deploys = (currentSite.deploys || 1) + 1;
  document.getElementById('detail-deploys').textContent = currentSite.deploys;
  saveSites(); renderSites();
  alert('🔄 Redespliegue iniciado para ' + currentSite.name);
}

// ── Upgrade ────────────────────────────────
function selectPlan(el, plan) {
  document.querySelectorAll('.plan-card').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
  el._plan = plan;
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
