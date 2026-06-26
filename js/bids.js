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
  renderBidQuiltList($('bid-quilt-search').value.trim().toLowerCase());
});
 
// ── Load quilt list with bid status ──────────────────────────
 
async function loadBidQuiltList() {
  const { data: quilts } = await sb
    .from('quilts')
    .select('*')
    .order('quilt_number', { ascending: true });
 
  const { data: records } = await sb
    .from('bid_records')
    .select('quilt_id, is_finalized, mismatch');
 
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
 
  // Clear fields and colors when switching quilts
  clearAllFields();
  clearFieldColors();
  setError($('bid-a-error'), '');
  setError($('bid-b-error'), '');
  $('bid-status-banner').innerHTML = '';
 
  highlightBidRow();
  await loadBidRecord(id);
}
 
// ── Apply panel visibility based on role ──────────────────────
 
function applyPanelVisibility() {
  toggle($('bid-panel-a'), isDoc1());
  toggle($('bid-panel-b'), isDoc2());
}
 
// ── Load a bid record and render ──────────────────────────────
 
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
    clearFieldColors();
    return;
  }
 
  applyPanelVisibility();
 
  // Populate saved values without overwriting active typing
  populateIfIdle('bid-a-amount', record?.user_a_bid);
  populateIfIdle('bid-a-bidder', record?.user_a_bidder_number);
  populateIfIdle('bid-b-amount', record?.user_b_bid);
  populateIfIdle('bid-b-bidder', record?.user_b_bidder_number);
 
  // ── Field color indicators ────────────────────────────────────
  const bothHaveData =
    record?.user_a_submitted_at && record?.user_b_submitted_at &&
    record?.user_a_bid != null  && record?.user_b_bid != null  &&
    record?.user_a_bidder_number != null && record?.user_b_bidder_number != null;
 
  if (bothHaveData && !record?.is_finalized) {
    const amtMatch    = record.user_a_bid           === record.user_b_bid;
    const bidderMatch = record.user_a_bidder_number === record.user_b_bidder_number;
 
    if (isDoc1()) {
      setFieldColor($('bid-a-amount'), amtMatch);
      setFieldColor($('bid-a-bidder'), bidderMatch);
    }
    if (isDoc2()) {
      setFieldColor($('bid-b-amount'), amtMatch);
      setFieldColor($('bid-b-bidder'), bidderMatch);
    }
 
    if (!amtMatch || !bidderMatch) {
      $('bid-status-banner').innerHTML = `
        <div class="alert alert-needs" style="margin-top:8px">
          Data Mismatch — please re-check your entries.
        </div>`;
    }
  } else {
    clearFieldColors();
  }
}
 
function populateIfIdle(id, value) {
  const el = $(id);
  if (!el) return;
  // Only populate if not focused and field is empty
  if (document.activeElement !== el && !el.value && value != null) {
    el.value = value;
  }
}
 
function setFieldColor(el, matches) {
  if (!el) return;
  el.style.borderColor = matches ? '#2C8A7C' : '#B83A3A';
  el.style.borderWidth = '2px';
  el.style.outline     = 'none';
}
 
function clearFieldColors() {
  ['bid-a-amount','bid-a-bidder','bid-b-amount','bid-b-bidder'].forEach(id => {
    const el = $(id);
    if (el) { el.style.borderColor = ''; el.style.borderWidth = ''; el.style.outline = ''; }
  });
}
 
function clearAllFields() {
  ['bid-a-amount','bid-a-bidder','bid-b-amount','bid-b-bidder'].forEach(id => {
    const el = $(id);
    if (el) el.value = '';
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
 
  const isA      = person === 'A';
  const amountEl = $(isA ? 'bid-a-amount' : 'bid-b-amount');
  const bidderEl = $(isA ? 'bid-a-bidder' : 'bid-b-bidder');
  const errorEl  = $(isA ? 'bid-a-error'  : 'bid-b-error');
 
  const amount = parseFloat(amountEl.value);
  const bidder = parseInt(bidderEl.value);
 
  setError(errorEl, '');
 
  if (!amount || amount <= 0 || !bidder || bidder < 1) return;
 
  // Validate bidder exists
  const { data: bidderRow } = await sb.from('bidders')
    .select('id').eq('bidder_number', bidder).maybeSingle();
 
  if (!bidderRow) {
    setError(errorEl, `Bidder #${bidder} not found.`);
    setFieldColor(bidderEl, false);
    return;
  }
 
  // Build payload — either person can create the record
  const now = new Date().toISOString();
  const payload = isA ? {
    quilt_id:             selectedBidQuiltId,
    user_a_id:            currentUser.id,
    user_a_bid:           amount,
    user_a_bidder_number: bidder,
    user_a_submitted_at:  now,
  } : {
    quilt_id:             selectedBidQuiltId,
    user_b_id:            currentUser.id,
    user_b_bid:           amount,
    user_b_bidder_number: bidder,
    user_b_submitted_at:  now,
  };
 
  let error;
  if (currentBidRecord) {
    ({ error } = await sb.from('bid_records')
      .update(payload).eq('id', currentBidRecord.id));
  } else {
    // Either person can create the record
    ({ error } = await sb.from('bid_records').insert(payload));
  }
 
  if (error) { setError(errorEl, 'Could not save: ' + error.message); return; }
 
  // Always fetch latest and re-run the full cross-check
  const { data: rec } = await sb.from('bid_records')
    .select('*').eq('quilt_id', selectedBidQuiltId).single();
 
  currentBidRecord = rec;
  await checkAndUpdateMatch(rec);
 
  await loadBidQuiltList();
  highlightBidRow();
 
  const { data: latest } = await sb.from('bid_records')
    .select('*').eq('quilt_id', selectedBidQuiltId).maybeSingle();
  currentBidRecord = latest;
  renderBidPanels(latest);
}
 
// ── Cross-check and finalize ──────────────────────────────────
 
async function checkAndUpdateMatch(rec) {
  // Need both sides to have data before comparing
  const bothHaveData =
    rec.user_a_submitted_at && rec.user_b_submitted_at &&
    rec.user_a_bid != null  && rec.user_b_bid != null  &&
    rec.user_a_bidder_number != null && rec.user_b_bidder_number != null;
 
  if (!bothHaveData) {
    // If previously finalized or mismatched, clear those flags
    if (rec.is_finalized || rec.mismatch) {
      await sb.from('bid_records').update({
        mismatch: false, is_finalized: false,
        resolved_bid: null, resolved_bidder_number: null, resolved_bidder_id: null,
      }).eq('id', rec.id);
    }
    return;
  }
 
  const amtMatch    = rec.user_a_bid           === rec.user_b_bid;
  const bidderMatch = rec.user_a_bidder_number === rec.user_b_bidder_number;
  const match       = amtMatch && bidderMatch;
 
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
    await sb.from('bid_records').update({
      mismatch:     true,
      is_finalized: false,
      resolved_bid: null, resolved_bidder_number: null, resolved_bidder_id: null,
    }).eq('id', rec.id);
  }
}
 
// ── Real-time subscription ────────────────────────────────────
 
sb.channel('bid_records_changes')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'bid_records' }, async () => {
    if (!$('screen-bids').classList.contains('active')) return;
    await loadBidQuiltList();
    if (selectedBidQuiltId) {
      const { data } = await sb.from('bid_records')
        .select('*').eq('quilt_id', selectedBidQuiltId).maybeSingle();
      currentBidRecord = data;
      renderBidPanels(data);
    }
    highlightBidRow();
  })
  .subscribe();
 
// ── Compatibility stub ────────────────────────────────────────
 
function populateBidQuiltSelect() { /* replaced by bid-quilt-list */ }