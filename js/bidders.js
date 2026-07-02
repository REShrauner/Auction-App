// ── Bidder entry, list, edit, delete ─────────────────────────
 
let editingBidderId  = null;
let selectedBidderId = null;
let allBidders       = [];
let scannedCardToken = null;
let scannedCardNumber = null;
 
// ── Search ────────────────────────────────────────────────────
 
$('bidder-search').addEventListener('input', () => {
  const term = $('bidder-search').value.trim().toLowerCase();
  const filtered = term
    ? allBidders.filter(b =>
        String(b.bidder_number).includes(term) ||
        b.name.toLowerCase().includes(term))
    : allBidders;
  renderBidderList(filtered, null);
});
 
// ── List action buttons ───────────────────────────────────────
 
$('btn-bidder-add').addEventListener('click', () => {
  resetBidderForm();
  $('bidder-form-title').textContent = 'Add Bidder';
  show($('bidder-form-wrap'));
  $('bidder-form-wrap').scrollIntoView({ behavior: 'smooth', block: 'start' });
});
 
$('btn-bidder-modify').addEventListener('click', () => {
  if (!selectedBidderId) return;
  startEditBidder(selectedBidderId);
});
 
$('btn-bidder-delete').addEventListener('click', async () => {
  if (!selectedBidderId) return;
  const b = allBidders.find(x => x.id === selectedBidderId);
  if (b) await deleteBidder(b.id, b.name);
});
 
// ── Scan card button ──────────────────────────────────────────
 
$('btn-scan-card').addEventListener('click', () => openScannerModal());
$('btn-scan-close').addEventListener('click', () => closeScannerModal());
$('btn-clear-card').addEventListener('click', () => {
  $('bf-card-number').value = '';
  scannedCardToken  = null;
  scannedCardNumber = null;
  toggle($('btn-bidder-show-qr'), false);
});
$('bf-card-number').addEventListener('input', () => {
  // Manual fallback: look up token by card number
  const num = parseInt($('bf-card-number').value.trim());
  if (!isNaN(num)) {
    scannedCardNumber = num;
    scannedCardToken  = null; // will validate on save
  }
});
 
// ── Save bidder ───────────────────────────────────────────────
 
$('btn-save-bidder').addEventListener('click', saveBidder);
 
async function saveBidder() {
  await loadLockState();
  if (dataLocked) {
    setError($('bidder-form-error'), 'Data is locked for the auction. Unlock it in Admin → Prepare for Auction to make changes.');
    return;
  }
  const name    = $('bf-name').value.trim();
  const address = $('bf-address').value.trim();
  const phone   = $('bf-phone').value.trim();
  const email   = $('bf-email').value.trim();
  const cardNumRaw = $('bf-card-number').value.trim();
  const cardNum = cardNumRaw === '' ? null : parseInt(cardNumRaw);
 
  setError($('bidder-form-error'), '');
 
  if (!name) {
    setError($('bidder-form-error'), 'Name is required.');
    return;
  }
 
  $('btn-save-bidder').disabled = true;
  $('btn-save-bidder').textContent = 'Saving…';
 
  if (!editingBidderId) {
    // Card number is optional on Add
    if (cardNum) {
      const { data: card, error: cardError } = await sb
        .from('bidder_cards')
        .select('*')
        .eq('card_number', cardNum)
        .single();
 
      if (cardError || !card) {
        setError($('bidder-form-error'), 'Card number not recognised. Please scan the card or check the number.');
        $('btn-save-bidder').disabled = false;
        $('btn-save-bidder').textContent = 'Save bidder';
        return;
      }
      if (card.assigned) {
        setError($('bidder-form-error'), `Card #${cardNum} is already registered to another bidder.`);
        $('btn-save-bidder').disabled = false;
        $('btn-save-bidder').textContent = 'Save bidder';
        return;
      }
      if (scannedCardToken && card.qr_token !== scannedCardToken) {
        setError($('bidder-form-error'), 'Card token mismatch. Please rescan.');
        $('btn-save-bidder').disabled = false;
        $('btn-save-bidder').textContent = 'Save bidder';
        return;
      }
    }
 
    const insertPayload = {
      name,
      address: address || null,
      phone:   phone   || null,
      email:   email   || null,
    };
    if (cardNum) insertPayload.bidder_number = cardNum;
 
    const { error } = await sb.from('bidders').insert(insertPayload);
 
    if (error) {
      setError($('bidder-form-error'), 'Could not save bidder: ' + error.message);
      $('btn-save-bidder').disabled = false;
      $('btn-save-bidder').textContent = 'Save bidder';
      return;
    }
 
    if (cardNum) {
      await sb.from('bidder_cards').update({ assigned: true }).eq('card_number', cardNum);
    }
 
  } else {
    // Editing — update all fields including card number if being set for first time
    const b = allBidders.find(x => x.id === editingBidderId);
    const previousCardNum = b?.bidder_number;
 
    if (cardNum && cardNum !== previousCardNum) {
      // Validate the new card
      const { data: card, error: cardError } = await sb
        .from('bidder_cards')
        .select('*')
        .eq('card_number', cardNum)
        .single();
 
      if (cardError || !card) {
        setError($('bidder-form-error'), 'Card number not recognised. Please scan the card or check the number.');
        $('btn-save-bidder').disabled = false;
        $('btn-save-bidder').textContent = 'Save changes';
        return;
      }
      if (card.assigned) {
        setError($('bidder-form-error'), `Card #${cardNum} is already registered to another bidder.`);
        $('btn-save-bidder').disabled = false;
        $('btn-save-bidder').textContent = 'Save changes';
        return;
      }
      if (scannedCardToken && card.qr_token !== scannedCardToken) {
        setError($('bidder-form-error'), 'Card token mismatch. Please rescan.');
        $('btn-save-bidder').disabled = false;
        $('btn-save-bidder').textContent = 'Save changes';
        return;
      }
    }
 
    const { error } = await sb.from('bidders').update({
      name,
      address:       address || null,
      phone:         phone   || null,
      email:         email   || null,
      bidder_number: cardNum,
    }).eq('id', editingBidderId);
 
    if (error) {
      setError($('bidder-form-error'), 'Could not save bidder: ' + error.message);
      $('btn-save-bidder').disabled = false;
      $('btn-save-bidder').textContent = 'Save changes';
      return;
    }
 
    // Mark new card as assigned, and free up the old one
    if (cardNum && cardNum !== previousCardNum) {
      await sb.from('bidder_cards').update({ assigned: true }).eq('card_number', cardNum);
      if (previousCardNum) {
        await sb.from('bidder_cards').update({ assigned: false }).eq('card_number', previousCardNum);
      }
    } else if (!cardNum && previousCardNum) {
      await sb.from('bidder_cards').update({ assigned: false }).eq('card_number', previousCardNum);
    }
  }
 
  $('btn-save-bidder').disabled = false;
  $('btn-save-bidder').textContent = 'Save bidder';
  hide($('bidder-form-wrap'));
  resetBidderForm();
  await loadBidders();
}
 
function resetBidderForm() {
  editingBidderId  = null;
  scannedCardToken = null;
  scannedCardNumber = null;
  ['bf-name','bf-address','bf-phone','bf-email','bf-card-number']
    .forEach(id => { $(id).value = ''; });
  $('btn-save-bidder').textContent = 'Save bidder';
  $('bf-card-number').readOnly = false;
  show($('btn-scan-card'));
  hide($('btn-bidder-show-qr'));
  hide($('btn-clear-card'));
  setError($('bidder-form-error'), '');
}
 
$('btn-cancel-bidder-edit').addEventListener('click', () => {
  hide($('bidder-form-wrap'));
  resetBidderForm();
});
 
// ── Show QR (inside edit form) ────────────────────────────────
 
$('btn-bidder-show-qr').addEventListener('click', () => {
  const b = allBidders.find(x => x.id === editingBidderId);
  const num = parseInt($('bf-card-number').value.trim());
  if (!num) return;
  openQRModal(`Bidder #${num}`, num,
    `Bidder #${num} — ${b ? b.name : ''}`);
});
 
// ── Load bidder list ──────────────────────────────────────────
 
async function loadBidders() {
  const { data, error } = await sb
    .from('bidders')
    .select('*')
    .order('bidder_number', { ascending: true });
 
  allBidders = data || [];
  renderBidderList(allBidders, error);
  applyBidderLockState();
}
 
function applyBidderLockState() {
  toggle($('bidders-lock-notice'), !!dataLocked);
  $('btn-bidder-add').disabled = !!dataLocked;
  const hasSelection = !!selectedBidderId;
  $('btn-bidder-modify').disabled = dataLocked || !hasSelection;
  $('btn-bidder-delete').disabled = dataLocked || !hasSelection;
}
 
function renderBidderList(bidders, error) {
  const wrap = $('bidder-list');
  if (error) {
    wrap.innerHTML = '<div class="alert alert-needs">Could not load bidders.</div>';
    return;
  }
  if (!bidders || bidders.length === 0) {
    wrap.innerHTML = '<div class="empty-state">No Bidders Registered</div>';
    setBidderSelection(null);
    return;
  }
 
  wrap.innerHTML = bidders.map(b => `
    <div class="quilt-list-row" data-id="${b.id}" tabindex="0"
         role="option" aria-selected="false">
      <span class="quilt-list-num">${b.bidder_number}</span>
      <span class="quilt-list-name">${esc(b.name)}</span>
    </div>
  `).join('');
 
  wrap.querySelectorAll('.quilt-list-row').forEach(row => {
    row.addEventListener('click',   () => setBidderSelection(row.dataset.id === selectedBidderId ? null : row.dataset.id));
    row.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') setBidderSelection(row.dataset.id === selectedBidderId ? null : row.dataset.id);
    });
  });
 
  if (selectedBidderId) highlightSelectedBidderRow();
}
 
function setBidderSelection(id) {
  selectedBidderId = id;
  highlightSelectedBidderRow();
  const has = !!id;
  $('btn-bidder-modify').disabled = dataLocked || !has;
  $('btn-bidder-delete').disabled = dataLocked || !has;
  if (!has) {
    hide($('bidder-form-wrap'));
    resetBidderForm();
  }
}
 
function highlightSelectedBidderRow() {
  $('bidder-list').querySelectorAll('.quilt-list-row').forEach(row => {
    const selected = row.dataset.id === selectedBidderId;
    row.classList.toggle('selected', selected);
    row.setAttribute('aria-selected', selected);
  });
}
 
// ── Edit bidder ───────────────────────────────────────────────
 
function startEditBidder(id) {
  const b = allBidders.find(x => x.id === id);
  if (!b) return;
 
  editingBidderId = id;
  $('bf-name').value        = b.name;
  $('bf-address').value     = b.address || '';
  $('bf-phone').value       = b.phone   || '';
  $('bf-email').value       = b.email   || '';
  $('bf-card-number').value = b.bidder_number || '';
 
  $('btn-save-bidder').textContent = 'Save changes';
  $('bidder-form-title').textContent = 'Modify Bidder';
  show($('btn-scan-card'));
  if (b.bidder_number) {
    show($('btn-bidder-show-qr'));
    show($('btn-clear-card'));
  } else {
    hide($('btn-bidder-show-qr'));
    hide($('btn-clear-card'));
  }
  show($('bidder-form-wrap'));
  $('bidder-form-wrap').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
 
// ── Delete bidder ─────────────────────────────────────────────
 
async function deleteBidder(id, name) {
  await loadLockState();
  if (dataLocked) { alert('Data is locked for the auction. Unlock it first to delete bidders.'); return; }
  const ok = await confirmDelete(`Delete bidder "${name}"? This cannot be undone.`);
  if (!ok) return;
 
  // Find bidder number to un-assign the card
  const b = allBidders.find(x => x.id === id);
  await sb.from('bidders').delete().eq('id', id);
  if (b) {
    await sb.from('bidder_cards').update({ assigned: false }).eq('card_number', b.bidder_number);
  }
  if (editingBidderId === id) {
    hide($('bidder-form-wrap'));
    resetBidderForm();
  }
  setBidderSelection(null);
  loadBidders();
}
 
// ── Lookup bidder by number (used by bids + checkout) ─────────
 
async function getBidderByNumber(num) {
  const { data } = await sb.from('bidders')
    .select('*').eq('bidder_number', parseInt(num)).single();
  return data;
}
 
// ── QR Scanner modal ──────────────────────────────────────────
 
function openScannerModal() {
  show($('scanner-modal'));
  setError($('scanner-error'), '');
  startBidderCardScanner();
}
 
function closeScannerModal() {
  stopScanner('scanner-video');
  hide($('scanner-modal'));
  setError($('scanner-error'), '');
}
 
async function startBidderCardScanner() {
  startScanner('scanner-video', async rawValue => {
    stopScanner('scanner-video');
 
    const { data: card, error } = await sb
      .from('bidder_cards')
      .select('*')
      .eq('qr_token', rawValue)
      .single();
 
    if (error || !card) {
      setError($('scanner-error'), 'Card not recognised. Try scanning again or enter manually.');
      startBidderCardScanner();
      return;
    }
 
    if (card.assigned) {
      setError($('scanner-error'), `Card #${card.card_number} is already registered to another bidder.`);
      startBidderCardScanner();
      return;
    }
 
    // Success
    scannedCardToken  = card.qr_token;
    scannedCardNumber = card.card_number;
    $('bf-card-number').value = card.card_number;
    closeScannerModal();
  });
}