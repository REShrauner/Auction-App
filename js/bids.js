// ── Two-person bid documentation ──────────────────────────────

let selectedBidQuiltId  = null;
let currentBidRecord    = null;
let resolveAConfirmed   = false;
let resolveBConfirmed   = false;
let allBidQuiltList     = [];  // [{quilt, record}]

// ── Role helpers ──────────────────────────────────────────────

function isDoc1()  { return currentProfile?.roles?.includes('documentarian1') || currentProfile?.is_admin; }
function isDoc2()  { return currentProfile?.roles?.includes('documentarian2') || currentProfile?.is_admin; }

// ── Init bids screen ──────────────────────────────────────────

async function initBids() {
  await loadBidQuiltList();
  applyPanelVisibility();

  // Re-select previously chosen quilt
  if (selectedBidQuiltId) {
    await loadBidRecord(selectedBidQuiltId);
    highlightBidRow();
  } else {
    hide($('bid-panels-wrap'));
  }
}

// ── Search ────────────────────────────────────────────────────

$('bid-quilt-search').addEventListener('input', () => {
  const term = $('bid-quilt-search').value.trim().toLowerCase();
  renderBidQuiltList(term);
});

// ── Load quilt list with bid status ──────────────────────────

async function loadBidQuiltList() {
  const { data: quilts } = await sb
    .from('quilts')
    .select('*')
    .order('quilt_number', { ascending: true });

  const { data: records } = await sb
    .from('bid_records')
    .select('quilt_id, is_finalized, mismatch, resolved_bid, resolved_bidder_number');

  const recordMap = {};
  (records || []).forEach(r => { recordMap[r.quilt_id] = r; });

  allBidQuiltList = (quilts || []).map(q => ({
    quilt:  q,
    record: recordMap[q.id] || null,
  }));

  renderBidQuiltList('');
}

function renderBidQuiltList(term) {
  const wrap = $('bid-quilt-list');
  const filtered = term
    ? allBidQuiltList.filter(({ quilt: q }) =>
        String(q.quilt_number).includes(term) ||
        q.name.toLowerCase().includes(term))
    : allBidQuiltList;

  if (!filtered.length) {
    wrap.innerHTML = '<div class="empty-state">No quilts found.</div>';
    return;
  }

  wrap.innerHTML = filtered.map(({ quilt: q, record: r }) => {
    const finalized = r?.is_finalized;
    const mismatch  = r?.mismatch && !finalized;
    const partialA  = r && !r.is_finalized && !r.mismatch;

    let badge = '';
    if (finalized) badge = ' <span style="color:#2C8A7C;font-weight:700">✓</span>';
    else if (mismatch) badge = ' <span style="color:#B83A3A;font-weight:700">!</span>';
    else if (partialA) badge = ' <span style="color:#888">…</span>';

    return `
      <div class="quilt-list-row${finalized ? ' bid-finalized' : ''}" 
           data-id="${q.id}" tabindex="0" role="option" aria-selected="false">
        <span class="quilt-list-num">${q.quilt_number}</span>
        <span class="quilt-list-name">${esc(q.name)}${badge}</span>
      </div>`;
  }).join('');

  wrap.querySelectorAll('.quilt-list-row').forEach(row => {
    row.addEventListener('click',   () => selectBidQuilt(row.dataset.id));
    row.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') selectBidQuilt(row.dataset.id);
    });
  });

  highlightBidRow();
}

function highlightBidRow() {
  $('bid-quilt-list').querySelectorAll('.quilt-list-row').forEach(row => {
    const sel = row.dataset.id === selectedBidQuiltId;
    row.classList.toggle('selected', sel);
    row.setAttribute('aria-selected', sel);
  });
}

async function selectBidQuilt(id) {
  selectedBidQuiltId = id;
  highlightBidRow();
  await loadBidRecord(id);
}

// ── Apply panel visibility based on role ──────────────────────

function applyPanelVisibility() {
  toggle($('bid-panel-a'), isDoc1());
  toggle($('bid-panel-b'), isDoc2());
}

// ── Load / render a bid record ────────────────────────────────

async function loadBidRecord(quiltId) {
  const { data } = await sb.from('bid_records')
    .select('*').eq('quilt_id', quiltId).maybeSingle();

  currentBidRecord = data;

  // Update heading
  const entry = allBidQuiltList.find(e => e.quilt.id === quiltId);
  if (entry) {
    $('bid-selected-heading').textContent =
      `Quilt #${entry.quilt.quilt_number} — ${entry.quilt.name}`;
  }

  show($('bid-panels-wrap'));
  applyPanelVisibility();
  renderBidPanels(data);

  // Refresh list to update status indicators
  await loadBidQuiltList();
  highlightBidRow();
}

function renderBidPanels(record) {
  hide($('mismatch-panel'));
  $('bid-status-banner').innerHTML = '';
  resolveAConfirmed = false;
  resolveBConfirmed = false;

  // ── Finalized ─────────────────────────────────────────────────
  if (record?.is_finalized) {
    $('bid-status-banner').innerHTML = `
      <div class="alert alert-ready" style="margin-top:8px">
        Bid recorded: <strong>${fmtMoney(record.resolved_bid)}</strong>
        — Bidder #<strong>${record.resolved_bidder_number}</strong>
      </div>`;
    hide($('bid-panel-a'));
    hide($('bid-panel-b'));
    return;
  }

  // Re-apply role visibility since finalized hides both
  applyPanelVisibility();

  // ── Panel A ───────────────────────────────────────────────────
  if (record?.user_a_submitted_at) {
    show($('bid-a-submitted-view'));
    hide($('bid-a-entry-form'));
    $('bid-panel-a').classList.add('submitted');
    $('bid-a-summary').innerHTML = `
      <div class="text-accent fw-bold">${fmtMoney(record.user_a_bid)}</div>
      <div class="text-muted">Bidder #${record.user_a_bidder_number}</div>`;
  } else {
    hide($('bid-a-submitted-view'));
    show($('bid-a-entry-form'));
    $('bid-panel-a').classList.remove('submitted', 'mismatch');
    $('bid-a-amount').value = '';
    $('bid-a-bidder').value = '';
    setError($('bid-a-error'), '');
  }

  // ── Panel B ───────────────────────────────────────────────────
  if (record?.user_b_submitted_at) {
    show($('bid-b-submitted-view'));
    hide($('bid-b-entry-form'));
    $('bid-panel-b').classList.add('submitted');
    $('bid-b-summary').innerHTML = `
      <div class="text-accent fw-bold">${fmtMoney(record.user_b_bid)}</div>
      <div class="text-muted">Bidder #${record.user_b_bidder_number}</div>`;
  } else {
    hide($('bid-b-submitted-view'));
    show($('bid-b-entry-form'));
    $('bid-panel-b').classList.remove('submitted', 'mismatch');
    $('bid-b-amount').value = '';
    $('bid-b-bidder').value = '';
    setError($('bid-b-error'), '');
  }

  // ── Mismatch ──────────────────────────────────────────────────
  if (record?.mismatch) {
    $('bid-panel-a').classList.add('mismatch');
    $('bid-panel-b').classList.add('mismatch');
    show($('mismatch-panel'));
    $('res-amount').value = '';
    $('res-bidder').value = '';
    // Show only the relevant resolve button
    toggle($('btn-resolve-a'), isDoc1());
    toggle($('btn-resolve-b'), isDoc2());
  }
}

// ── Submit Panel A ────────────────────────────────────────────

$('btn-submit-a').addEventListener('click', async () => {
  const amount = parseFloat($('bid-a-amount').value);
  const bidder = parseInt($('bid-a-bidder').value);

  setError($('bid-a-error'), '');
  if (!amount || amount <= 0 || !bidder || bidder < 1) {
    setError($('bid-a-error'), 'Enter a valid amount and bidder number.');
    return;
  }

  $('btn-submit-a').disabled = true;

  const payload = {
    quilt_id:             selectedBidQuiltId,
    user_a_id:            currentUser.id,
    user_a_bid:           amount,
    user_a_bidder_number: bidder,
    user_a_submitted_at:  new Date().toISOString(),
  };

  let error;
  if (currentBidRecord) {
    ({ error } = await sb.from('bid_records').update(payload).eq('id', currentBidRecord.id));
  } else {
    ({ error } = await sb.from('bid_records').insert(payload));
  }

  $('btn-submit-a').disabled = false;
  if (error) { setError($('bid-a-error'), 'Could not save: ' + error.message); return; }

  await loadBidRecord(selectedBidQuiltId);
  await checkAndFinalizeIfMatch();
});

// ── Submit Panel B ────────────────────────────────────────────

$('btn-submit-b').addEventListener('click', async () => {
  const amount = parseFloat($('bid-b-amount').value);
  const bidder = parseInt($('bid-b-bidder').value);

  setError($('bid-b-error'), '');
  if (!amount || amount <= 0 || !bidder || bidder < 1) {
    setError($('bid-b-error'), 'Enter a valid amount and bidder number.');
    return;
  }
  if (!currentBidRecord) {
    setError($('bid-b-error'), 'Documentarian 1 must submit first.');
    return;
  }

  $('btn-submit-b').disabled = true;

  const { error } = await sb.from('bid_records').update({
    user_b_id:            currentUser.id,
    user_b_bid:           amount,
    user_b_bidder_number: bidder,
    user_b_submitted_at:  new Date().toISOString(),
  }).eq('id', currentBidRecord.id);

  $('btn-submit-b').disabled = false;
  if (error) { setError($('bid-b-error'), 'Could not save: ' + error.message); return; }

  await loadBidRecord(selectedBidQuiltId);
  await checkAndFinalizeIfMatch();
});

// ── Auto-finalize on match ────────────────────────────────────

async function checkAndFinalizeIfMatch() {
  const { data: rec } = await sb.from('bid_records')
    .select('*').eq('quilt_id', selectedBidQuiltId).single();

  if (!rec || !rec.user_a_submitted_at || !rec.user_b_submitted_at) return;

  const match =
    rec.user_a_bid === rec.user_b_bid &&
    rec.user_a_bidder_number === rec.user_b_bidder_number;

  if (match) {
    const { data: bidderRow } = await sb.from('bidders')
      .select('id').eq('bidder_number', rec.user_a_bidder_number).maybeSingle();

    await sb.from('bid_records').update({
      mismatch:               false,
      resolved_bid:           rec.user_a_bid,
      resolved_bidder_number: rec.user_a_bidder_number,
      resolved_bidder_id:     bidderRow?.id || null,
      is_finalized:           true,
    }).eq('id', rec.id);
  } else {
    await sb.from('bid_records').update({ mismatch: true }).eq('id', rec.id);
  }

  await loadBidRecord(selectedBidQuiltId);
}

// ── Mismatch resolution ───────────────────────────────────────

$('btn-resolve-a').addEventListener('click', () => handleResolveConfirm('A'));
$('btn-resolve-b').addEventListener('click', () => handleResolveConfirm('B'));

async function handleResolveConfirm(person) {
  const amount = parseFloat($('res-amount').value);
  const bidder = parseInt($('res-bidder').value);

  setError($('resolution-error'), '');
  if (!amount || amount <= 0 || !bidder || bidder < 1) {
    setError($('resolution-error'), 'Enter valid agreed amount and bidder number.');
    return;
  }

  if (person === 'A') { resolveAConfirmed = true; hide($('btn-resolve-a')); }
  if (person === 'B') { resolveBConfirmed = true; hide($('btn-resolve-b')); }

  const needsA = isDoc1() && !resolveAConfirmed;
  const needsB = isDoc2() && !resolveBConfirmed;

  if (needsA || needsB) {
    $('resolution-error').textContent = 'Waiting for the other documentarian to confirm…';
    show($('resolution-error'));
    return;
  }

  // Both confirmed — finalize
  const { data: bidderRow } = await sb.from('bidders')
    .select('id').eq('bidder_number', bidder).maybeSingle();

  await sb.from('bid_records').update({
    mismatch:               false,
    resolved_bid:           amount,
    resolved_bidder_number: bidder,
    resolved_bidder_id:     bidderRow?.id || null,
    is_finalized:           true,
  }).eq('id', currentBidRecord.id);

  await loadBidRecord(selectedBidQuiltId);
}

// ── Real-time subscription ────────────────────────────────────

sb.channel('bid_records_changes')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'bid_records' }, () => {
    if ($('screen-bids').classList.contains('active')) {
      if (selectedBidQuiltId) loadBidRecord(selectedBidQuiltId);
      else loadBidQuiltList();
    }
  })
  .subscribe();

// ── Keep populateBidQuiltSelect for checkout compatibility ─────

function populateBidQuiltSelect() { /* no-op — replaced by bid-quilt-list */ }
