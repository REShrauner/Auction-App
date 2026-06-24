// ── Two-person bid documentation ──────────────────────────────

let selectedQuiltId   = null;
let currentBidRecord  = null;
let resolveAConfirmed = false;
let resolveBConfirmed = false;

// ── Populate quilt select ─────────────────────────────────────

function populateBidQuiltSelect() {
  const sel = $('bid-quilt-select');
  const prev = sel.value;
  sel.innerHTML = '<option value="">— choose a quilt —</option>' +
    (allQuilts || []).map(q =>
      `<option value="${q.id}">${q.quilt_number} — ${esc(q.name)}</option>`
    ).join('');
  if (prev) sel.value = prev;
}

// ── Init bids screen ──────────────────────────────────────────

function initBids() {
  populateBidQuiltSelect();
  loadRecentBids();
  if (selectedQuiltId) {
    $('bid-quilt-select').value = selectedQuiltId;
    loadBidRecord(selectedQuiltId);
  } else {
    hide($('bid-panels-wrap'));
    hide($('mismatch-panel'));
    $('bid-status-banner').innerHTML = '';
  }
}

$('bid-quilt-select').addEventListener('change', () => {
  selectedQuiltId = $('bid-quilt-select').value || null;
  if (selectedQuiltId) {
    loadBidRecord(selectedQuiltId);
  } else {
    hide($('bid-panels-wrap'));
    hide($('mismatch-panel'));
    $('bid-status-banner').innerHTML = '';
  }
});

// ── Load / render a bid record ────────────────────────────────

async function loadBidRecord(quiltId) {
  const { data } = await sb.from('bid_records')
    .select('*').eq('quilt_id', quiltId).maybeSingle();

  currentBidRecord = data;
  renderBidPanels(data);
}

function renderBidPanels(record) {
  show($('bid-panels-wrap'));
  hide($('mismatch-panel'));
  $('bid-status-banner').innerHTML = '';

  resolveAConfirmed = false;
  resolveBConfirmed = false;

  // Determine which panel is "mine" based on who submitted A
  const iAmA = record?.user_a_id === currentUser?.id;
  const iAmB = record?.user_b_id === currentUser?.id;

  // ── Panel A ───────────────────────────────────────────────────
  if (record?.user_a_submitted_at) {
    // A is submitted — show summary
    show($('bid-a-submitted-view'));
    hide($('bid-a-entry-form'));
    $('bid-panel-a').classList.add('submitted');
    $('bid-a-summary').innerHTML = `
      <div class="text-accent fw-bold">${fmtMoney(record.user_a_bid)}</div>
      <div class="text-muted">Bidder #${record.user_a_bidder_number}</div>
    `;
  } else {
    hide($('bid-a-submitted-view'));
    show($('bid-a-entry-form'));
    $('bid-panel-a').classList.remove('submitted','mismatch');
    $('bid-a-amount').value  = '';
    $('bid-a-bidder').value  = '';
    setError($('bid-a-error'), '');
  }

  // ── Panel B ───────────────────────────────────────────────────
  if (record?.user_b_submitted_at) {
    show($('bid-b-submitted-view'));
    hide($('bid-b-entry-form'));
    $('bid-panel-b').classList.add('submitted');
    $('bid-b-summary').innerHTML = `
      <div class="text-accent fw-bold">${fmtMoney(record.user_b_bid)}</div>
      <div class="text-muted">Bidder #${record.user_b_bidder_number}</div>
    `;
  } else {
    hide($('bid-b-submitted-view'));
    show($('bid-b-entry-form'));
    $('bid-panel-b').classList.remove('submitted','mismatch');
    $('bid-b-amount').value  = '';
    $('bid-b-bidder').value  = '';
    setError($('bid-b-error'), '');
  }

  // ── Finalized ─────────────────────────────────────────────────
  if (record?.is_finalized) {
    const bidder = record.resolved_bidder_number || record.user_a_bidder_number;
    const amount = record.resolved_bid           ?? record.user_a_bid;
    $('bid-status-banner').innerHTML = `
      <div class="alert alert-ready">
        <span>Bid recorded: <strong>${fmtMoney(amount)}</strong> — Bidder #<strong>${bidder}</strong></span>
      </div>`;
    hide($('bid-panels-wrap'));
    return;
  }

  // ── Mismatch ──────────────────────────────────────────────────
  if (record?.mismatch) {
    $('bid-panel-a').classList.add('mismatch');
    $('bid-panel-b').classList.add('mismatch');
    show($('mismatch-panel'));

    // Pre-fill resolution fields if not yet set
    if (!$('res-amount').value) $('res-amount').value = '';
    if (!$('res-bidder').value) $('res-bidder').value = '';
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
    quilt_id:             selectedQuiltId,
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

  if (error) { setError($('bid-a-error'), 'Could not save entry: ' + error.message); return; }

  await loadBidRecord(selectedQuiltId);
  await checkAndFinalizeIfMatch();
  loadRecentBids();
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
    setError($('bid-b-error'), 'Person A must submit first.');
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

  if (error) { setError($('bid-b-error'), 'Could not save entry: ' + error.message); return; }

  await loadBidRecord(selectedQuiltId);
  await checkAndFinalizeIfMatch();
  loadRecentBids();
});

// ── Auto-finalize on match ────────────────────────────────────

async function checkAndFinalizeIfMatch() {
  const { data: rec } = await sb.from('bid_records')
    .select('*').eq('quilt_id', selectedQuiltId).single();

  if (!rec || !rec.user_a_submitted_at || !rec.user_b_submitted_at) return;

  const match =
    rec.user_a_bid === rec.user_b_bid &&
    rec.user_a_bidder_number === rec.user_b_bidder_number;

  if (match) {
    // Look up bidder uuid
    const { data: bidderRow } = await sb.from('bidders')
      .select('id').eq('bidder_number', rec.user_a_bidder_number).maybeSingle();

    await sb.from('bid_records').update({
      mismatch:                false,
      resolved_bid:            rec.user_a_bid,
      resolved_bidder_number:  rec.user_a_bidder_number,
      resolved_bidder_id:      bidderRow?.id || null,
      is_finalized:            true,
    }).eq('id', rec.id);
  } else {
    await sb.from('bid_records').update({ mismatch: true }).eq('id', rec.id);
  }

  await loadBidRecord(selectedQuiltId);
  loadRecentBids();
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

  if (person === 'A') { resolveAConfirmed = true; $('btn-resolve-a').classList.add('hidden'); }
  if (person === 'B') { resolveBConfirmed = true; $('btn-resolve-b').classList.add('hidden'); }

  if (!resolveAConfirmed || !resolveBConfirmed) {
    $('resolution-error').textContent = 'Waiting for the other person to confirm…';
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

  await loadBidRecord(selectedQuiltId);
  loadRecentBids();
}

// ── Recent bids list ──────────────────────────────────────────

async function loadRecentBids() {
  const { data } = await sb.from('bid_records')
    .select(`*, quilts(quilt_number, name)`)
    .eq('is_finalized', true)
    .order('updated_at', { ascending: false })
    .limit(20);

  const wrap = $('bid-recent-list');
  if (!data || data.length === 0) {
    wrap.innerHTML = '<div class="empty-state">No finalized bids yet.</div>';
    return;
  }

  wrap.innerHTML = data.map(r => `
    <div class="card">
      <div class="flex-center gap-8">
        <div>
          <div class="card-meta">Quilt #${r.quilts?.quilt_number}</div>
          <div class="card-title">${esc(r.quilts?.name)}</div>
        </div>
        <div style="margin-left:auto;text-align:right">
          <div class="text-accent fw-bold">${fmtMoney(r.resolved_bid)}</div>
          <div class="text-muted">Bidder #${r.resolved_bidder_number}</div>
        </div>
        <span class="badge badge-ready">Final</span>
      </div>
    </div>
  `).join('');
}

// ── Real-time subscription (refresh bids screen when open) ────

sb.channel('bid_records_changes')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'bid_records' }, () => {
    if ($('screen-bids').classList.contains('active')) {
      if (selectedQuiltId) loadBidRecord(selectedQuiltId);
      loadRecentBids();
    }
  })
  .subscribe();
