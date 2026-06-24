// ── Bidder entry, list, edit, delete ─────────────────────────

let editingBidderId = null;
let allBidders      = [];

// ── Save bidder ───────────────────────────────────────────────

$('btn-save-bidder').addEventListener('click', saveBidder);

async function saveBidder() {
  const name    = $('bf-name').value.trim();
  const address = $('bf-address').value.trim();
  const phone   = $('bf-phone').value.trim();
  const email   = $('bf-email').value.trim();

  setError($('bidder-form-error'), '');

  if (!name) {
    setError($('bidder-form-error'), 'Name is required.');
    return;
  }

  $('btn-save-bidder').disabled = true;
  $('btn-save-bidder').textContent = 'Saving…';

  const payload = {
    name,
    address:  address || null,
    phone:    phone   || null,
    email:    email   || null,
  };

  let error;
  if (editingBidderId) {
    ({ error } = await sb.from('bidders').update(payload).eq('id', editingBidderId));
  } else {
    ({ error } = await sb.from('bidders').insert(payload));
  }

  $('btn-save-bidder').disabled = false;
  $('btn-save-bidder').textContent = editingBidderId ? 'Save changes' : 'Save bidder';

  if (error) {
    setError($('bidder-form-error'), 'Could not save bidder: ' + error.message);
    return;
  }

  resetBidderForm();
  loadBidders();
}

function resetBidderForm() {
  editingBidderId = null;
  ['bf-name','bf-address','bf-phone','bf-email'].forEach(id => { $(id).value = ''; });
  $('btn-save-bidder').textContent = 'Save bidder';
  hide($('btn-cancel-bidder-edit'));
  setError($('bidder-form-error'), '');
}

$('btn-cancel-bidder-edit').addEventListener('click', resetBidderForm);

// ── Load bidder list ──────────────────────────────────────────

async function loadBidders() {
  const { data, error } = await sb
    .from('bidders')
    .select('*')
    .order('bidder_number', { ascending: true });

  allBidders = data || [];
  renderBidderList(allBidders, error);
}

function renderBidderList(bidders, error) {
  const wrap = $('bidder-list');
  const isAdmin = currentProfile?.is_admin;

  if (error) { wrap.innerHTML = '<div class="alert alert-needs">Could not load bidders.</div>'; return; }
  if (!bidders || bidders.length === 0) {
    wrap.innerHTML = '<div class="empty-state">No bidders registered yet.</div>';
    return;
  }

  wrap.innerHTML = bidders.map(b => `
    <div class="card" id="bidder-card-${b.id}">
      <div class="card-row">
        <div style="flex:1;min-width:0">
          <div class="card-meta">Bidder #${b.bidder_number}</div>
          <div class="card-title">${esc(b.name)}</div>
          ${b.address ? `<div class="card-sub">${esc(b.address)}</div>` : ''}
          ${isAdmin && b.phone ? `<div class="card-sub text-faint">${esc(b.phone)}</div>` : ''}
          ${isAdmin && b.email ? `<div class="card-sub text-faint">${esc(b.email)}</div>` : ''}
        </div>
      </div>
      <div class="card-actions">
        <button class="btn btn-accent btn-sm" data-action="qr" data-id="${b.id}"
          data-num="${b.bidder_number}" data-name="${esc(b.name)}">Show QR</button>
        <button class="btn btn-secondary btn-sm" data-action="edit" data-id="${b.id}">Edit</button>
        <button class="btn btn-danger btn-sm" data-action="delete" data-id="${b.id}"
          data-name="${esc(b.name)}">Delete</button>
      </div>
    </div>
  `).join('');

  wrap.querySelectorAll('[data-action="qr"]').forEach(btn => {
    btn.addEventListener('click', () =>
      openQRModal(`Bidder #${btn.dataset.num}`, btn.dataset.num,
        `Bidder #${btn.dataset.num} — ${btn.dataset.name}`));
  });

  wrap.querySelectorAll('[data-action="edit"]').forEach(btn => {
    btn.addEventListener('click', () => startEditBidder(btn.dataset.id));
  });

  wrap.querySelectorAll('[data-action="delete"]').forEach(btn => {
    btn.addEventListener('click', () => deleteBidder(btn.dataset.id, btn.dataset.name));
  });
}

async function startEditBidder(id) {
  const b = allBidders.find(x => x.id === id);
  if (!b) return;

  editingBidderId = id;
  $('bf-name').value    = b.name;
  $('bf-address').value = b.address || '';
  $('bf-phone').value   = b.phone   || '';
  $('bf-email').value   = b.email   || '';

  $('btn-save-bidder').textContent = 'Save changes';
  show($('btn-cancel-bidder-edit'));
  document.querySelector('#screen-bidders .form-card')
    .scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function deleteBidder(id, name) {
  const ok = await confirmDelete(`Delete bidder "${name}"? This cannot be undone.`);
  if (!ok) return;
  await sb.from('bidders').delete().eq('id', id);
  if (editingBidderId === id) resetBidderForm();
  loadBidders();
}

// ── Lookup bidder by number (used by bids + checkout) ─────────

async function getBidderByNumber(num) {
  const { data } = await sb.from('bidders')
    .select('*').eq('bidder_number', parseInt(num)).single();
  return data;
}
