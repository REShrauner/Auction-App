// ── Two-person bid documentation ──────────────────────────────

let selectedBidQuiltId = null;
let currentBidRecord   = null;
let allBidQuiltList    = [];
let debounceTimer      = null;

// ── Role helpers ──────────────────────────────────────────────

function isDoc1()  { return currentProfile?.roles?.includes('documentarian1') || currentProfile?.is_admin; }
function isDoc2()  { return currentProfile?.roles?.includes('documentarian2') || currentProfile?.is_admin; }

// ── Init bids screen ──────────────────────────────────────────

async function initBids() {
  await loadBidQuiltList();
  applyPanelVisibility();
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

  renderBidQuiltList($('bid-quilt-search').value.trim().toLowerCase());
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
    const partial   = r && !finalized && !mismatch;

    let badge = '';
    if (finalized)     badge = ' <span style="color:#2C8A7C;font-weight:700">✓</span>';
    else if (mismatch) badge = ' <span style="color:#B83A3A;font-weight:700">!</span>';
    else if (partial)  badge = ' <span style="color:#888">…</span>';

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

  const entry = allBidQuiltList.find(e => e.quilt.id === quiltId);
  if (entry) {
    $('bid-selected-heading').textContent =
      `Quilt #${entry.quilt.quilt_number} — ${entry.quilt.name}`;
  }

  show($('bid-panels-wrap'));
  applyPanelVisibility();
  renderBidPanels(data);
}

function renderBidPanels(record) {
  $('bid-status-banner').innerHTML = '';

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

  applyPanelVisibility();

  // Populate fields with saved values (don't overwrite if user is typing)
  if (isDoc1()) {
    if (document.activeElement !== $('bid-a-amount') && !$('bid-a-amount').value)
      $('bid-a-amount').value = record?.user_a_bid        || '';
    if (document.activeElement !== $('bid-a-bidder') && !$('bid-a-bidder').value)
      $('bid-a-bidder').value = record?.user_a_bidder_number || '';
  }
  if (isDoc2()) {
    if (document.activeElement !== $('bid-b-amount') && !$('bid-b-amount').value)
      $('bid-b-amount').value = record?.user_b_bid           || '';
    if (document.activeElement !== $('bid-b-bidder') && !$('bid-b-bidder').value)
      $('bid-b-bidder').value = record?.user_b_bidder_number || '';
  }

  // Show mismatch indicators if both sides submitted
  if (record?.mismatch) {
    const amtMatch    = record.user_a_bid            === record.user_b_bid;
    const bidderMatch = record.user_a_bidder_number  === record.user_b_bidder_number;

    if (isDoc1()) {
      setFieldMatch($('bid-a-amount'), amtMatch);
      setFieldMatch($('bid-a-bidder'), bidderMatch);
    }
    if (isDoc2()) {
      setFieldMatch($('bid-b-amount'), amtMatch);
      setFieldMatch($('bid-b-bidder'), bidderMatch);
    }

    $('bid-status-banner').innerHTML = `
      <div class="alert alert-needs" style="margin-top:8px">Data Mismatch — please re-check your entries.</div>`;
  } else {
    clearFieldColors();
  }
}

function setFieldMatch(el, matches) {
  el.style.borderColor = matches ? '#2C8A7C' : '#B83A3A';
  el.style.borderWidth = '2px';
}

function clearFieldColors() {
  ['bid-a-amount','bid-a-bidder','bid-b-amount','bid-b-bidder'].forEach(id => {
    const el = $(id);
    if (el) { el.style.borderColor = ''; el.style.borderWidth = ''; }
  });
}

// ── Live input — debounced save ───────────────────────────────

['bid-a-amount','bid-a-bidder'].forEach(id => {
  $(id)?.addEventListener('input', () => scheduleSave('A'));
});
['bid-b-amount','bid-b-bidder'].forEach(id => {
  $(id)?.addEventListener('input', () => scheduleSave('B'));
});

function scheduleSave(person) {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => saveEntry(person), 900);
}

async function saveEntry(person) {
  if (!selectedBidQuiltId) return;

  const isA = person === 'A';
  const amountEl = $(isA ? 'bid-a-amount' : 'bid-b-amount');
  const bidderEl = $(isA ? 'bid-a-bidder' : 'bid-b-bidder');
  const errorEl  = $(isA ? 'bid-a-error'  : 'bid-b-error');

  const amount = parseFloat(amountEl.value);
  const bidder = parseInt(bidderEl.value);

  setError(errorEl, '');

  if (!amount || amount <= 0) return; // wait for valid amount
  if (!bidder || bidder < 1)  return; // wait for valid bidder

  // Validate bidder exists
  const { data: bidderRow } = await sb.from('bidders')
    .select('id, name').eq('bidder_number', bidder).maybeSingle();

  if (!bidderRow) {
    setError(errorEl, `Bidder #${bidder} not found.`);
    bidderEl.style.borderColor = '#B83A3A';
    bidderEl.style.borderWidth = '2px';
    return;
  }

  // Clear any bidder error
  bidderEl.style.borderColor = '';
  bidderEl.style.borderWidth = '';

  const payload = isA ? {
    quilt_id:             selectedBidQuiltId,
    user_a_id:            currentUser.id,
    user_a_bid:           amount,
    user_a_bidder_number: bidder,
    user_a_submitted_at:  new Date().toISOString(),
  } : {
    user_b_id:            currentUser.id,
    user_b_bid:           amount,
    user_b_bidder_number: bidder,
    user_b_submitted_at:  new Date().toISOString(),
  };

  let error;
  if (currentBidRecord) {
    ({ error } = await sb.from('bid_records').update(payload).eq('id', currentBidRecord.id));
  } else if (isA) {
    ({ error } = await sb.from('bid_records').insert(payload));
  } else {
    setError(errorEl, 'Documentarian 1 must enter data first.');
    return;
  }

  if (error) { setError(errorEl, 'Could not save: ' + error.message); return; }

  // Reload and check for match
  const { data: rec } = await sb.from('bid_records')
    .select('*').eq('quilt_id', selectedBidQuiltId).single();

  currentBidRecord = rec;

  if (rec?.user_a_submitted_at && rec?.user_b_submitted_at) {
    await checkAndFinalizeIfMatch(rec);
  }

  await loadBidQuiltList();
  highlightBidRow();
  renderBidPanels(currentBidRecord);
}

// ── Auto-finalize on match ────────────────────────────────────

async function checkAndFinalizeIfMatch(rec) {
  const match =
    rec.user_a_bid            === rec.user_b_bid &&
    rec.user_a_bidder_number  === rec.user_b_bidder_number;

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

  const { data: updated } = await sb.from('bid_records')
    .select('*').eq('quilt_id', selectedBidQuiltId).single();
  currentBidRecord = updated;
}

// ── Real-time subscription ────────────────────────────────────

sb.channel('bid_records_changes')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'bid_records' }, async () => {
    if ($('screen-bids').classList.contains('active') && selectedBidQuiltId) {
      const { data } = await sb.from('bid_records')
        .select('*').eq('quilt_id', selectedBidQuiltId).maybeSingle();
      currentBidRecord = data;
      renderBidPanels(data);
      await loadBidQuiltList();
      highlightBidRow();
    }
  })
  .subscribe();

// ── Compatibility stub ────────────────────────────────────────

function populateBidQuiltSelect() { /* replaced by bid-quilt-list */ }
