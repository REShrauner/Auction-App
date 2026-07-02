// ── App router + session management ──────────────────────────
 
let currentUser    = null;
let currentProfile = null;
let dataLocked      = false;

async function loadLockState() {
  const { data } = await sb.from('app_settings').select('data_locked').eq('id', 1).single();
  dataLocked = !!data?.data_locked;
  return dataLocked;
}
 
// ── Helpers ───────────────────────────────────────────────────
 
function $(id) { return document.getElementById(id); }
 
function show(el) { if (el) el.classList.remove('hidden'); }
function hide(el) { if (el) el.classList.add('hidden'); }
function toggle(el, on) { on ? show(el) : hide(el); }
 
function setError(el, msg) {
  if (!el) return;
  el.textContent = msg;
  toggle(el, !!msg);
}
 
function fmtMoney(n) {
  return '$' + Number(n || 0).toFixed(2);
}
 
function fmtDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
 
// Confirm-delete modal
let _confirmResolve = null;
function confirmDelete(msg) {
  return new Promise(resolve => {
    _confirmResolve = resolve;
    $('confirm-modal-msg').textContent = msg;
    show($('confirm-modal'));
  });
}
 
$('btn-confirm-yes').addEventListener('click', () => {
  hide($('confirm-modal'));
  if (_confirmResolve) { _confirmResolve(true); _confirmResolve = null; }
});
$('btn-confirm-no').addEventListener('click', () => {
  hide($('confirm-modal'));
  if (_confirmResolve) { _confirmResolve(false); _confirmResolve = null; }
});
 
// ── Screen routing ────────────────────────────────────────────
 
const SCREENS = ['login','home','quilts','bidders','bids','checkout','reports','admin'];
 
async function showScreen(name) {
  // Block access to screens the user doesn't have a role for
  const restricted = ['quilts','bidders','bids','checkout','reports','admin'];
  if (restricted.includes(name) && !userCanAccess(name)) {
    return;
  }
 
  SCREENS.forEach(s => {
    const el = $('screen-' + s);
    if (el) el.classList.toggle('active', s === name);
  });
  document.querySelectorAll('.nav-btn[data-screen]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.screen === name);
  });
 
  if (['quilts','bidders','bids','admin'].includes(name)) {
    await loadLockState();
  }
 
  // Trigger screen-specific refresh
  if (name === 'home')      { if (typeof renderHomeDashboard === 'function') renderHomeDashboard(); }
  if (name === 'quilts')    { if (typeof loadQuilts   === 'function') loadQuilts(); }
  if (name === 'bidders')   { if (typeof loadBidders  === 'function') loadBidders(); }
  if (name === 'bids')      { if (typeof initBids     === 'function') initBids(); }
  if (name === 'checkout')  { if (typeof resetCheckout=== 'function') resetCheckout(); }
  if (name === 'reports')   { $('report-output').innerHTML = ''; hide($('report-actions')); }
  if (name === 'admin')     { if (typeof loadAdmin    === 'function') loadAdmin(); }
}
 
// Nav clicks
document.querySelectorAll('.nav-btn[data-screen]').forEach(btn => {
  btn.addEventListener('click', () => showScreen(btn.dataset.screen));
});
 
// ── Auth state management ─────────────────────────────────────
 
async function loadProfile(userId) {
  const { data } = await sb.from('profiles').select('*').eq('id', userId).single();
  return data;
}
 
// ── Role helpers ──────────────────────────────────────────────
 
const ROLE_SCREEN_MAP = {
  'quilt_entry':    'quilts',
  'bidder_entry':   'bidders',
  'documentarian1': 'bids',
  'documentarian2': 'bids',
  'checkout':       'checkout',
};
 
function userCanAccess(screen) {
  if (!currentProfile) return false;
  if (currentProfile.is_admin) return true;
  const roles = currentProfile.roles || [];
  const allowed = Object.entries(ROLE_SCREEN_MAP)
    .filter(([role]) => roles.includes(role))
    .map(([, scr]) => scr);
  return allowed.includes(screen);
}
 
function applySession(user, profile) {
  currentUser    = user;
  currentProfile = profile;
 
  const isAdmin = profile?.is_admin;
  const roles   = profile?.roles || [];
 
  hide($('screen-login'));
  show($('app-nav'));
 
  // Show/hide nav buttons based on roles
  document.querySelectorAll('.nav-btn[data-screen]').forEach(btn => {
    const screen = btn.dataset.screen;
    const adminOnly = ['reports', 'admin'].includes(screen);
    if (adminOnly) {
      toggle(btn, isAdmin);
    } else {
      toggle(btn, isAdmin || userCanAccess(screen));
    }
  });
 
  $('nav-user-info').textContent = profile?.username || user?.email || '';
 
  // Navigate to home dashboard
  showScreen('home');
}
 
function clearSession() {
  currentUser    = null;
  currentProfile = null;
  hide($('app-nav'));
  SCREENS.forEach(s => {
    const el = $('screen-' + s);
    if (el) el.classList.remove('active');
  });
  show($('screen-login'));
}
 
// Sign-out
$('nav-logout').addEventListener('click', async () => {
  await sb.auth.signOut();
  clearSession();
});
 
// ── Theme controls ────────────────────────────────────────────
 
function applyMode(mode) {
  document.documentElement.setAttribute('data-mode', mode);
  localStorage.setItem('qa_mode', mode);
}
 
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('qa_theme', theme);
  // Mark active dot
  document.querySelectorAll('.theme-dot').forEach(d => {
    d.classList.toggle('active', d.dataset.theme === theme);
  });
}
 
$('btn-mode-dark').addEventListener('click',  () => applyMode('dark'));
$('btn-mode-light').addEventListener('click', () => applyMode('light'));
 
document.querySelectorAll('.theme-dot').forEach(dot => {
  dot.addEventListener('click', () => applyTheme(dot.dataset.theme));
});
 
// Mark current theme dot on load
applyTheme(localStorage.getItem('qa_theme') || 'teal');
 
// ── QR modal ──────────────────────────────────────────────────
 
function openQRModal(title, value, label) {
  $('qr-modal-title').textContent = title;
  $('qr-modal-label').textContent = label;
  QRCode.toCanvas($('qr-modal-canvas'), String(value), { width: 220, margin: 1 });
  show($('qr-modal'));
}
 
$('btn-qr-close').addEventListener('click', () => hide($('qr-modal')));
$('btn-qr-print').addEventListener('click', () => window.print());
$('qr-modal').addEventListener('click', e => { if (e.target === $('qr-modal')) hide($('qr-modal')); });
 
// ── Home dashboard ───────────────────────────────────────────
 
const SCREEN_LABELS = {
  quilts:   { label: 'Quilts',   icon: '🧵' },
  bidders:  { label: 'Bidders',  icon: '🪪' },
  bids:     { label: 'Bids',     icon: '✋' },
  checkout: { label: 'Checkout', icon: '💳' },
  reports:  { label: 'Reports',  icon: '📊' },
  admin:    { label: 'Admin',    icon: '⚙️'  },
};
 
const ROLE_DISPLAY = {
  quilt_entry:    'Quilt Entry',
  bidder_entry:   'Bidder Entry',
  documentarian1: 'Documentarian 1',
  documentarian2: 'Documentarian 2',
  checkout:       'Checkout',
};
 
function renderHomeDashboard() {
  if (!currentProfile) return;
 
  const isAdmin = currentProfile.is_admin;
  const roles   = currentProfile.roles || [];
  const name    = currentProfile.full_name || currentProfile.username || '';
 
  $('home-welcome').textContent = `Welcome, ${name}!`;
 
  if (isAdmin) {
    $('home-roles').textContent = 'Administrator';
  } else {
    const roleNames = roles.map(r => ROLE_DISPLAY[r] || r).join(', ');
    $('home-roles').textContent = roleNames || 'No roles assigned';
  }
 
 
}
 
// ── Boot ──────────────────────────────────────────────────────
 
async function boot() {
  const { data: { session } } = await sb.auth.getSession();
 
  if (session?.user) {
    const profile = await loadProfile(session.user.id);
    if (profile?.is_approved) {
      applySession(session.user, profile);
    } else {
      // Logged in but not yet approved
      await sb.auth.signOut();
      clearSession();
      setError($('login-error'), 'Your account is pending admin approval.');
      show($('screen-login'));
    }
  } else {
    clearSession();
  }
 
  // Listen for auth changes
  sb.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_IN' && session) {
      const profile = await loadProfile(session.user.id);
      if (profile?.is_approved) {
        applySession(session.user, profile);
      } else {
        await sb.auth.signOut();
        setError($('login-error'), 'Your account is pending admin approval.');
      }
    } else if (event === 'SIGNED_OUT') {
      clearSession();
    }
  });
}
 
boot();