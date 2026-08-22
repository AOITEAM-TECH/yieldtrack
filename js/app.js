// ==========================================================
// APP.JS — shared across every page
// ==========================================================

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: '&#128200;', href: 'dashboard.html' },
  { id: 'production', label: 'Production Entry', icon: '&#128196;', href: 'production.html' },
  { id: 'faults', label: 'Fault Report', icon: '&#9888;', href: 'faults.html' },
  { id: 'reports', label: 'Reports', icon: '&#128196;', href: 'reports.html' },
];

const ADMIN_NAV_ITEM = { id: 'admin', label: 'Admin', icon: '&#9881;', href: 'admin.html' };

// ---------------- SESSION ----------------
function getSession() {
  try { return JSON.parse(sessionStorage.getItem('mb_session') || 'null'); }
  catch (e) { return null; }
}
function setSession(user) { sessionStorage.setItem('mb_session', JSON.stringify(user)); }
function clearSession() { sessionStorage.removeItem('mb_session'); }

function requireAuth() {
  const s = getSession();
  if (!s) { window.location.href = 'index.html'; return null; }
  return s;
}

function requireAdmin() {
  const s = requireAuth();
  if (s && s.role !== 'admin') {
    window.location.href = 'dashboard.html';
    return null;
  }
  return s;
}

function logout() { clearSession(); window.location.href = 'index.html'; }

// ---------------- SHELL RENDER ----------------
function renderShell(activeId, titleText, subText) {
  const session = getSession();
  const items = [...NAV_ITEMS];
  if (session && session.role === 'admin') items.push(ADMIN_NAV_ITEM);

  const navHtml = items.map(it => `
    <a class="nav-item ${it.id === activeId ? 'active' : ''}" href="${it.href}">
      <span class="nav-icon">${it.icon}</span><span>${it.label}</span>
    </a>`).join('');

  document.getElementById('sidebar-mount').innerHTML = `
    <div class="sidebar">
      <div class="brand">
        <div class="brand-icon">&#128421;</div>
        <div>
          <div class="brand-name">MB Production</div>
          <div class="brand-sub">Production System</div>
        </div>
      </div>
      <div class="nav-group">${navHtml}</div>
      <div class="sidebar-footer">
        <div class="status-pill"><span class="status-dot"></span> System Online</div>
        <button class="btn-logout" onclick="logout()">&#8618; Logout</button>
      </div>
    </div>`;

  const initials = session ? session.full_name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase() : '?';
  document.getElementById('topbar-mount').innerHTML = `
    <div class="topbar">
      <div>
        <h1>${titleText}</h1>
        <div class="sub">${subText}</div>
      </div>
      <div class="topbar-user">
        <div class="avatar">${initials}</div>
        <div class="user-meta">
          <div class="name">${session ? session.full_name : ''}</div>
          <div class="role">${session ? (session.role === 'admin' ? 'Administrator' : 'Production User') : ''}</div>
        </div>
      </div>
    </div>`;
}

// ---------------- TOASTS ----------------
function showToast(message, type) {
  type = type || 'success';
  let stack = document.getElementById('toast-stack');
  if (!stack) {
    stack = document.createElement('div');
    stack.id = 'toast-stack';
    document.body.appendChild(stack);
  }
  const icon = type === 'success' ? '&#10003;' : type === 'error' ? '&#10007;' : '&#9888;';
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.innerHTML = `<span>${icon}</span><span>${message}</span>`;
  stack.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity 0.3s'; }, 2600);
  setTimeout(() => el.remove(), 3000);
}

// ---------------- DATE HELPERS ----------------
function todayISO() {
  const d = new Date();
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d - tz).toISOString().slice(0, 10);
}
function isoToDisplay(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}-${m}-${y}`;
}
function displayToIso(disp) {
  const [d, m, y] = disp.split('-');
  return `${y}-${m}-${d}`;
}
function nowHHMM() {
  const d = new Date();
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}
function timeToMinutes(t) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + (m || 0);
}

// ---------------- HOURLY SLOT GENERATION ----------------
/**
 * Builds hourly slot labels between start_time and end_time (HH:MM:SS or HH:MM),
 * correctly handling shifts that cross midnight (e.g. C Shift 22:00 -> 06:00).
 */
function generateHourlySlots(startTime, endTime) {
  const fmt = (t) => t.slice(0, 5);
  let start = timeToMinutes(fmt(startTime));
  let end = timeToMinutes(fmt(endTime));
  if (end <= start) end += 24 * 60; // crosses midnight

  const slots = [];
  let order = 1;
  for (let m = start; m < end; m += 60) {
    const from = m % (24 * 60);
    const to = (m + 60) % (24 * 60);
    slots.push({
      time_slot: `${minutesToLabel(from)} - ${minutesToLabel(to)}`,
      slot_order: order++,
      from_minutes_absolute: m // absolute minutes from shift start reference, used to find "current" slot
    });
  }
  return slots;
}
function minutesToLabel(mins) {
  const h = String(Math.floor(mins / 60)).padStart(2, '0');
  const mm = String(mins % 60).padStart(2, '0');
  return `${h}:${mm}`;
}

/** Determine which slot index is "now", given the shift start time and slot count. Returns -1 if shift not currently active. */
function currentSlotIndex(startTime, slots) {
  const fmt = (t) => t.slice(0, 5);
  const start = timeToMinutes(fmt(startTime));
  let nowMin = timeToMinutes(nowHHMM());
  if (nowMin < start) nowMin += 24 * 60;
  for (let i = 0; i < slots.length; i++) {
    const slotStartAbs = start + i * 60;
    const slotEndAbs = slotStartAbs + 60;
    if (nowMin >= slotStartAbs && nowMin < slotEndAbs) return i;
  }
  return -1;
}

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  return div.innerHTML;
}
