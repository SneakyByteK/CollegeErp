'use strict';

const appEl = document.getElementById('app');
const modalRoot = document.getElementById('modal-root');
const toastRoot = document.getElementById('toast-root');

const state = { user: null, csrf: '', depts: [], charts: [], att: null };

const esc = (v) => String(v === null || v === undefined ? '' : v)
  .replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtINR = (n) => '₹' + Number(n || 0).toLocaleString('en-IN');
const fmtNum = (n) => Number(n || 0).toLocaleString('en-IN');
const fmtDate = (d) => {
  if (!d) return '—';
  const dt = new Date(String(d).length === 10 ? d + 'T00:00:00' : d);
  if (Number.isNaN(dt.getTime())) return '—';
  return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};
const todayISO = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};
const isAdmin = () => state.user && state.user.role === 'admin';
const canManage = () => state.user && ['admin', 'registrar'].includes(state.user.role);
const stageLabel = (s) => String(s || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : 0);

class ApiError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}

async function api(path, opts = {}) {
  const method = opts.method || 'GET';
  const headers = { Accept: 'application/json' };
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (!['GET', 'HEAD'].includes(method) && state.csrf) headers['X-CSRF-Token'] = state.csrf;
  const res = await fetch(path, {
    method,
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined
  });
  const ct = res.headers.get('content-type') || '';
  const data = ct.includes('application/json') ? await res.json() : await res.text();
  if (!res.ok) throw new ApiError((data && data.error) || 'Request failed', res.status);
  return data;
}

function toast(message, type = 'success') {
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.innerHTML = '<span>' + esc(message) + '</span><span class="x">×</span>';
  el.querySelector('.x').addEventListener('click', () => el.remove());
  toastRoot.appendChild(el);
  setTimeout(() => el.remove(), 4200);
}

function handleActionError(err) {
  if (err && err.status === 401) {
    state.user = null;
    renderLogin('Your session expired. Please sign in again.');
    return;
  }
  toast((err && err.message) || 'Something went wrong', 'error');
}

function openModal(html, wide = false) {
  modalRoot.innerHTML = '<div class="modal-backdrop"><div class="modal ' + (wide ? 'wide' : '') + '" role="dialog" aria-modal="true">' + html + '</div></div>';
}
function closeModal() { modalRoot.innerHTML = ''; }

const ICONS = {
  dashboard: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  userplus: '<path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><path d="M20 8v6"/><path d="M23 11h-6"/>',
  card: '<rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/>',
  check: '<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>',
  briefcase: '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>',
  bell: '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>',
  award: '<circle cx="12" cy="8" r="6"/><path d="M15.5 13.5L17 22l-5-3-5 3 1.5-8.5"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>',
  plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
  search: '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
  x: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
  printer: '<polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>',
  menu: '<line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  send: '<line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>',
  refresh: '<polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>',
  arrowLeft: '<line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>'
};
function icon(name) {
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + (ICONS[name] || '') + '</svg>';
}

const NAV = [
  { section: 'Overview' },
  { key: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
  { section: 'Academics' },
  { key: 'students', label: 'Students', icon: 'users' },
  { key: 'admissions', label: 'Admissions', icon: 'userplus', roles: ['admin', 'registrar'] },
  { key: 'attendance', label: 'Attendance', icon: 'check' },
  { key: 'timetable', label: 'Timetable', icon: 'calendar' },
  { key: 'exams', label: 'Examinations', icon: 'file' },
  { key: 'faculty', label: 'Faculty & HR', icon: 'briefcase' },
  { section: 'Finance' },
  { key: 'fees', label: 'Fees & Payments', icon: 'card', roles: ['admin', 'registrar'] },
  { key: 'scholarships', label: 'Scholarships (MahaDBT)', icon: 'award' },
  { section: 'Communication' },
  { key: 'notices', label: 'Notices', icon: 'bell' },
  { section: 'Administration' },
  { key: 'settings', label: 'Settings', icon: 'settings', roles: ['admin'] }
];

function navFor(role) {
  return NAV.map(item => {
    if (item.section) return { section: item.section };
    if (item.roles && !item.roles.includes(role)) return null;
    return item;
  }).filter(Boolean);
}

function renderShell() {
  const visible = navFor(state.user.role);
  let html = '';
  for (const item of visible) {
    if (item.section) { html += '<div class="nav-label">' + esc(item.section) + '</div>'; continue; }
    html += '<a class="nav-item" data-nav="' + item.key + '" href="#/' + item.key + '">' + icon(item.icon) + '<span>' + esc(item.label) + '</span></a>';
  }
  const initials = state.user.name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
  appEl.innerHTML = `
  <div class="layout">
    <aside class="sidebar" id="sidebar">
      <div class="sidebar-head">
        <div class="logo-mark">V</div>
        <div>
          <div class="brand-name">VidyaERP</div>
          <div class="brand-sub">College Management Suite</div>
        </div>
      </div>
      <nav>${html}</nav>
      <div class="sidebar-foot">
        <div class="sidebar-user">
          <div class="avatar">${esc(initials)}</div>
          <div style="min-width:0">
            <div class="name">${esc(state.user.name)}</div>
            <div class="role">${esc(state.user.role)}</div>
          </div>
          <button class="icon-btn" data-action="logout" title="Sign out" style="margin-left:auto;background:transparent;border-color:#1e293b;color:#94a3b8">${icon('logout')}</button>
        </div>
      </div>
    </aside>
    <div class="main">
      <header class="topbar">
        <button class="icon-btn menu-btn" id="menu-btn" title="Menu">${icon('menu')}</button>
        <div class="crumb">VidyaERP / <b id="crumb">Dashboard</b></div>
        <div class="topbar-right">
          <span class="date-chip">${new Date().toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}</span>
          <span class="chip">${icon('shield')} Secure session</span>
        </div>
      </header>
      <main class="content" id="view"></main>
    </div>
  </div>`;
  document.getElementById('menu-btn').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('open');
  });
}

function setCrumb(name) {
  const crumb = document.getElementById('crumb');
  if (!crumb) return;
  const item = NAV.find(n => n.key === name);
  crumb.textContent = item ? item.label : 'Dashboard';
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.nav === name);
  });
}

function renderLogin(message) {
  state.charts.forEach(c => c.destroy());
  state.charts = [];
  closeModal();
  toastRoot.innerHTML = '';
  appEl.innerHTML = `
  <div class="login-screen">
    <div class="login-visual">
      <div class="login-brand"><div class="logo-mark">V</div> VidyaERP</div>
      <div>
        <h1>Run your entire campus from one secure system.</h1>
        <p>Admissions, student records, attendance, examinations, fees and MahaDBT scholarships in a single connected platform built for Indian colleges.</p>
        <div class="login-points">
          <div class="login-point"><span class="tick">1</span><span>Role-based access for admin, registrar and faculty</span></div>
          <div class="login-point"><span class="tick">2</span><span>Fee collection, challans, receipts and outstanding tracking</span></div>
          <div class="login-point"><span class="tick">3</span><span>MahaDBT scholarship workflow with document verification</span></div>
          <div class="login-point"><span class="tick">4</span><span>NAAC-ready records, audit trail and printable reports</span></div>
        </div>
      </div>
      <div class="login-foot">Demo environment · Data is sample data for evaluation</div>
    </div>
    <div class="login-panel">
      <div class="login-card">
        <h2>Sign in</h2>
        <div class="sub">Use your institute account to continue</div>
        <div class="login-error ${message ? 'show' : ''}" id="login-error">${esc(message || '')}</div>
        <form id="login-form">
          <div class="field">
            <label for="email">Email address</label>
            <input class="input" id="email" name="email" type="email" autocomplete="username" required>
          </div>
          <div class="field">
            <label for="password">Password</label>
            <input class="input" id="password" name="password" type="password" autocomplete="current-password" required>
          </div>
          <button class="btn primary block" type="submit" style="margin-top:8px">Sign in securely</button>
        </form>
        <div class="demo-creds">
          <div class="label">Demo accounts — click to fill</div>
          <div class="demo-cred" data-demo="admin@demo.edu|Admin@123"><div><div class="role">Administrator</div><div class="mail">admin@demo.edu</div></div><span class="use">Use</span></div>
          <div class="demo-cred" data-demo="registrar@demo.edu|Staff@123"><div><div class="role">Registrar</div><div class="mail">registrar@demo.edu</div></div><span class="use">Use</span></div>
          <div class="demo-cred" data-demo="faculty@demo.edu|Faculty@123"><div><div class="role">Faculty</div><div class="mail">faculty@demo.edu</div></div><span class="use">Use</span></div>
        </div>
      </div>
    </div>
  </div>`;

  document.querySelectorAll('[data-demo]').forEach(el => {
    el.addEventListener('click', () => {
      const [email, password] = el.dataset.demo.split('|');
      document.getElementById('email').value = email;
      document.getElementById('password').value = password;
    });
  });

  document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errBox = document.getElementById('login-error');
    const btn = e.target.querySelector('button');
    errBox.classList.remove('show');
    btn.disabled = true;
    btn.textContent = 'Signing in…';
    try {
      const csrfRes = await api('/api/auth/csrf');
      state.csrf = csrfRes.csrf;
      const res = await api('/api/auth/login', {
        method: 'POST',
        body: {
          email: document.getElementById('email').value,
          password: document.getElementById('password').value
        }
      });
      state.user = res.user;
      state.csrf = res.csrf;
      await loadMeta();
      renderShell();
      if (!location.hash.startsWith('#/')) location.hash = '#/dashboard';
      route();
    } catch (err) {
      errBox.textContent = err.message;
      errBox.classList.add('show');
      btn.disabled = false;
      btn.textContent = 'Sign in securely';
    }
  });
}

async function loadMeta() {
  const meta = await api('/api/meta/departments');
  state.depts = meta.rows;
}

function currentRoute() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [pathPart, queryPart] = raw.split('?');
  const parts = pathPart.split('/').filter(Boolean);
  return {
    name: parts[0] || 'dashboard',
    id: parts[1] ? Number(parts[1]) : null,
    query: new URLSearchParams(queryPart || '')
  };
}

let routeToken = 0;
async function route() {
  if (!state.user) return;
  const token = ++routeToken;
  const { name, id, query } = currentRoute();
  const view = document.getElementById('view');
  if (!view) return;
  state.charts.forEach(c => c.destroy());
  state.charts = [];
  closeModal();
  setCrumb(name);
  view.innerHTML = '<div class="empty">Loading…</div>';
  const fn = VIEWS[name] || VIEWS.dashboard;
  try {
    await fn(id, query);
  } catch (err) {
    if (token !== routeToken) return;
    if (err.status === 401) return handleActionError(err);
    view.innerHTML = '<div class="card"><div class="empty"><b>Could not load this page</b>' + esc(err.message) + '</div></div>';
  }
}
