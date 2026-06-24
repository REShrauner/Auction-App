// ── Auth: login, account request, admin approval ──────────────

// ── Login / Request tab switching ────────────────────────────

document.querySelectorAll('.login-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.login-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');

    const which = tab.dataset.tab;
    toggle($('login-form-panel'),   which === 'login');
    toggle($('request-form-panel'), which === 'request');
    setError($('login-error'), '');
    setError($('request-error'), '');
    hide($('request-success'));
  });
});

// ── Sign in ───────────────────────────────────────────────────

function usernameToEmail(username) {
  // Supabase auth requires an email; we map username → username@quiltauction.local
  return username.trim().toLowerCase() + '@quiltauction.local';
}

$('btn-login').addEventListener('click', async () => {
  const username = $('login-username').value.trim();
  const password = $('login-password').value;

  if (!username || !password) {
    setError($('login-error'), 'Enter your username and password.');
    return;
  }

  $('btn-login').disabled = true;
  $('btn-login').textContent = 'Signing in…';
  setError($('login-error'), '');

  const { error } = await sb.auth.signInWithPassword({
    email:    usernameToEmail(username),
    password: password,
  });

  $('btn-login').disabled = false;
  $('btn-login').textContent = 'Sign in';

  if (error) {
    setError($('login-error'), 'Username or password is incorrect.');
  }
});

$('login-password').addEventListener('keydown', e => {
  if (e.key === 'Enter') $('btn-login').click();
});

// ── Account request ────────────────────────────────────────────

function validatePassword(pw) {
  if (pw.length < 8)          return 'Password must be at least 8 characters.';
  if (!/[A-Z]/.test(pw))      return 'Password must contain at least one uppercase letter.';
  if (!/[0-9]/.test(pw))      return 'Password must contain at least one number.';
  return null;
}

$('btn-request').addEventListener('click', async () => {
  const fullName = $('req-name').value.trim();
  const username = $('req-username').value.trim();
  const password = $('req-password').value;

  setError($('request-error'), '');
  hide($('request-success'));

  if (!fullName || !username || !password) {
    setError($('request-error'), 'All fields are required.');
    return;
  }

  const pwError = validatePassword(password);
  if (pwError) { setError($('request-error'), pwError); return; }

  $('btn-request').disabled = true;
  $('btn-request').textContent = 'Submitting…';

  // Check username not already taken
  const { data: existing } = await sb.from('account_requests').select('id').eq('username', username);
  const { data: existingProfile } = await sb.from('profiles').select('id').eq('username', username);

  if ((existing && existing.length > 0) || (existingProfile && existingProfile.length > 0)) {
    setError($('request-error'), 'That username is already taken.');
    $('btn-request').disabled = false;
    $('btn-request').textContent = 'Submit request';
    return;
  }

  const { error } = await sb.from('account_requests').insert({
    full_name: fullName,
    username:  username,
    password:  password,
  });

  $('btn-request').disabled = false;
  $('btn-request').textContent = 'Submit request';

  if (error) {
    setError($('request-error'), 'Could not submit request. Try again.');
  } else {
    $('req-name').value = '';
    $('req-username').value = '';
    $('req-password').value = '';
    show($('request-success'));
    $('request-success').textContent = 'Request submitted. An admin will review it shortly.';
  }
});

// ── Admin: load pending requests + all accounts ───────────────

async function loadAdmin() {
  await loadPendingRequests();
  await loadAllUsers();
}

async function loadPendingRequests() {
  const { data: requests, error } = await sb
    .from('account_requests')
    .select('*')
    .order('created_at', { ascending: true });

  const wrap = $('admin-requests-list');

  if (error || !requests || requests.length === 0) {
    wrap.innerHTML = '<div class="empty-state">No pending requests.</div>';
    return;
  }

  wrap.innerHTML = requests.map(r => `
    <div class="approval-card" data-req-id="${r.id}">
      <div>
        <div class="approval-name">${esc(r.full_name)}</div>
        <div class="approval-username text-muted">@${esc(r.username)}</div>
        <div class="text-faint" style="font-size:var(--fs-xs)">${fmtDate(r.created_at)}</div>
      </div>
      <div style="margin-left:auto;display:flex;gap:8px">
        <button class="btn btn-accent btn-sm" data-action="approve" data-req-id="${r.id}"
          data-name="${esc(r.full_name)}" data-username="${esc(r.username)}" data-password="${esc(r.password)}">
          Approve
        </button>
        <button class="btn btn-danger btn-sm" data-action="reject" data-req-id="${r.id}">
          Reject
        </button>
      </div>
    </div>
  `).join('');

  wrap.querySelectorAll('[data-action="approve"]').forEach(btn => {
    btn.addEventListener('click', () => approveRequest(btn.dataset));
  });
  wrap.querySelectorAll('[data-action="reject"]').forEach(btn => {
    btn.addEventListener('click', () => rejectRequest(btn.dataset.reqId));
  });
}

async function approveRequest({ reqId, name, username, password }) {
  const btn = document.querySelector(`[data-action="approve"][data-req-id="${reqId}"]`);
  if (btn) { btn.disabled = true; btn.textContent = 'Approving…'; }

  // Create the Supabase auth user via admin — we call a Supabase Edge Function
  // that has service-role access. For now, use the workaround of signing up
  // the user with their chosen credentials, then immediately approving.
  // NOTE: This requires the "Disable email confirmations" setting in Supabase Auth.
  const { data: signUpData, error: signUpError } = await sb.auth.signUp({
    email:    usernameToEmail(username),
    password: password,
    options: {
      data: {
        username:    username,
        full_name:   name,
        is_admin:    false,
        is_approved: true,
      }
    }
  });

  if (signUpError) {
    alert('Error creating account: ' + signUpError.message);
    if (btn) { btn.disabled = false; btn.textContent = 'Approve'; }
    return;
  }

  // Mark profile approved (trigger may have created it; update to be sure)
  if (signUpData?.user) {
    await sb.from('profiles').upsert({
      id:          signUpData.user.id,
      username:    username,
      full_name:   name,
      is_admin:    false,
      is_approved: true,
    });
  }

  // Delete the request
  await sb.from('account_requests').delete().eq('id', reqId);

  loadPendingRequests();
  loadAllUsers();
}

async function rejectRequest(reqId) {
  const ok = await confirmDelete('Reject and discard this account request?');
  if (!ok) return;
  await sb.from('account_requests').delete().eq('id', reqId);
  loadPendingRequests();
}

async function loadAllUsers() {
  const { data: users, error } = await sb
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: true });

  const wrap = $('admin-users-list');
  if (error || !users || users.length === 0) {
    wrap.innerHTML = '<div class="empty-state">No accounts yet.</div>';
    return;
  }

  wrap.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Username</th>
            <th>Full name</th>
            <th>Role</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${users.map(u => `
            <tr>
              <td>@${esc(u.username)}</td>
              <td>${esc(u.full_name)}</td>
              <td>${u.is_admin ? '<span class="badge badge-admin">Admin</span>' : '<span class="badge badge-muted">User</span>'}</td>
              <td>${u.is_approved ? '<span class="badge badge-ready">Approved</span>' : '<span class="badge badge-near">Pending</span>'}</td>
              <td>
                ${!u.is_admin && u.id !== currentUser?.id ? `
                  <button class="btn btn-secondary btn-sm" data-action="toggle-admin"
                    data-uid="${u.id}" data-current="${u.is_admin}">
                    ${u.is_admin ? 'Remove admin' : 'Make admin'}
                  </button>` : ''}
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;

  wrap.querySelectorAll('[data-action="toggle-admin"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const newVal = btn.dataset.current !== 'true';
      await sb.from('profiles').update({ is_admin: newVal }).eq('id', btn.dataset.uid);
      loadAllUsers();
    });
  });
}

function esc(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
