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
  const name    = $('bf-name').value.trim();
  const address = $('bf-address').value.trim();
  const phone   = $('bf-phone').value.trim();
  const email   = $('bf-email').value.trim();
  const cardNum = parseInt($('bf-card-number').value.trim());

  setError($('bidder-form-error'), '');

  if (!name) {
    setError($('bidder-form-error'), 'Name is required.');
    return;
  }
  if (!cardNum) {
    setError($('bidder-form-error'), 'Please scan or enter a bidder card number.');
    return;
  }

  $('btn-save-bidder').disabled = true;
  $('btn-save-bidder').textContent = 'Saving…';

  if (!editingBidderId) {
    // Validate card exists and is not assigned
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
    // If scanned, verify token matches
    if (scannedCardToken && card.qr_token !== scannedCardToken) {
      setError($('bidder-form-error'), 'Card token mismatch. Please rescan.');
      $('btn-save-bidder').disabled = false;
      $('btn-save-bidder').textContent = 'Save bidder';
      return;
    }

    // Save bidder
    const { error } = await sb.from('bidders').insert({
      name,
      address:      address || null,
      phone:        phone   || null,
      email:        email   || null,
      bidder_number: cardNum,
    });

    if (error) {
      setError($('bidder-form-error'), 'Could not save bidder: ' + error.message);
      $('btn-save-bidder').disabled = false;
      $('btn-save-bidder').textContent = 'Save bidder';
      return;
    }

    // Mark card as assigned
    await sb.from('bidder_cards').update({ assigned: true }).eq('card_number', cardNum);

  } else {
    // Editing — update name/address/phone/email only, not card number
    const { error } = await sb.from('bidders').update({
      name,
      address: address || null,
      phone:   phone   || null,
      email:   email   || null,
    }).eq('id', editingBidderId);

    if (error) {
      setError($('bidder-form-error'), 'Could not save bidder: ' + error.message);
      $('btn-save-bidder').disabled = false;
      $('btn-save-bidder').textContent = 'Save changes';
      return;
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
  hide($('btn-bidder-show-qr'));
  setError($('bidder-form-error'), '');
}

$('btn-cancel-bidder-edit').addEventListener('click', () => {
  hide($('bidder-form-wrap'));
  resetBidderForm();
});

// ── Show QR (inside edit form) ────────────────────────────────

$('btn-bidder-show-qr').addEventListener('click', () => {
  const b = allBidders.find(x => x.id === editingBidderId);
  if (!b) return;
  openQRModal(`Bidder #${b.bidder_number}`, b.bidder_number,
    `Bidder #${b.bidder_number} — ${b.name}`);
});

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
    row.addEventListener('click',   () => setBidderSelection(row.dataset.id));
    row.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') setBidderSelection(row.dataset.id);
    });
  });

  if (selectedBidderId) highlightSelectedBidderRow();
}

function setBidderSelection(id) {
  selectedBidderId = id;
  highlightSelectedBidderRow();
  const has = !!id;
  $('btn-bidder-modify').disabled = !has;
  $('btn-bidder-delete').disabled = !has;
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
  $('bf-card-number').value = b.bidder_number;
  $('bf-card-number').readOnly = true;

  $('btn-save-bidder').textContent = 'Save changes';
  $('bidder-form-title').textContent = 'Modify Bidder';
  show($('btn-bidder-show-qr'));
  hide($('btn-scan-card'));
  show($('bidder-form-wrap'));
  $('bidder-form-wrap').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ── Delete bidder ─────────────────────────────────────────────

async function deleteBidder(id, name) {
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

let scannerStream   = null;
let scannerAnimFrame = null;

function openScannerModal() {
  show($('scanner-modal'));
  startScanner();
}

function closeScannerModal() {
  stopScanner();
  hide($('scanner-modal'));
  setError($('scanner-error'), '');
}

async function startScanner() {
  setError($('scanner-error'), '');
  const video = $('scanner-video');
  try {
    scannerStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' }
    });
    video.srcObject = scannerStream;
    video.setAttribute('playsinline', true);
    await video.play();
    scannerAnimFrame = requestAnimationFrame(scanFrame);
  } catch (err) {
    setError($('scanner-error'), 'Camera access denied. Please enter the card number manually.');
  }
}

function stopScanner() {
  if (scannerAnimFrame) { cancelAnimationFrame(scannerAnimFrame); scannerAnimFrame = null; }
  if (scannerStream)    { scannerStream.getTracks().forEach(t => t.stop()); scannerStream = null; }
  const video = $('scanner-video');
  video.srcObject = null;
}

function scanFrame() {
  const video  = $('scanner-video');
  const canvas = $('scanner-canvas');
  if (video.readyState !== video.HAVE_ENOUGH_DATA) {
    scannerAnimFrame = requestAnimationFrame(scanFrame);
    return;
  }
  canvas.width  = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const code = jsQR(imageData.data, imageData.width, imageData.height, {
    inversionAttempts: 'dontInvert',
  });
  if (code) {
    handleScan(code.data);
    return; // stop scanning once found
  }
  scannerAnimFrame = requestAnimationFrame(scanFrame);
}

async function handleScan(rawValue) {
  stopScanner();
  setError($('scanner-error'), '');

  // Look up token in bidder_cards
  const { data: card, error } = await sb
    .from('bidder_cards')
    .select('*')
    .eq('qr_token', rawValue)
    .single();

  if (error || !card) {
    setError($('scanner-error'), 'Card not recognised. Try scanning again or enter manually.');
    // Restart scanner
    startScanner();
    return;
  }

  if (card.assigned) {
    setError($('scanner-error'), `Card #${card.card_number} is already registered to another bidder.`);
    startScanner();
    return;
  }

  // Success
  scannedCardToken  = card.qr_token;
  scannedCardNumber = card.card_number;
  $('bf-card-number').value = card.card_number;
  closeScannerModal();
}
