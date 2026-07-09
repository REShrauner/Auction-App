// ── Delivery: bidder lookup + quilt delivery scan ─────────────

let deliveryBidder = null;
let deliveryRecord = null;

function resetDelivery() {
  stopScanner('delivery-bidder-video');
  stopScanner('delivery-quilt-video');
  deliveryBidder = null;
  deliveryRecord = null;

  $('delivery-bidder-num').value = '';
  setError($('delivery-lookup-error'), '');
  hide($('delivery-bidder-scan-wrap'));
  hide($('delivery-step-2'));
  show($('delivery-step-1'));
}

// ── Step 1: Identify bidder ───────────────────────────────────

$('btn-delivery-lookup').addEventListener('click', async () => {
  const num = parseInt($('delivery-bidder-num').value);
  if (!num || num < 1) {
    setError($('delivery-lookup-error'), 'Enter a bidder number.');
    return;
  }
  await lookupBidderForDelivery(num);
});

$('delivery-bidder-num').addEventListener('keydown', e => {
  if (e.key === 'Enter') $('btn-delivery-lookup').click();
});

$('btn-delivery-scan-bidder').addEventListener('click', async () => {
  show($('delivery-bidder-scan-wrap'));
  const started = await startScanner('delivery-bidder-video', async value => {
    stopScanner('delivery-bidder-video');
    hide($('delivery-bidder-scan-wrap'));

    const raw = String(value).trim();
    const num = parseInt(raw);

    // Case 1: QR encodes a plain bidder number (from the bidder "Show QR")
    if (!isNaN(num) && num > 0 && String(num) === raw) {
      $('delivery-bidder-num').value = num;
      await lookupBidderForDelivery(num);
      return;
    }

    // Case 2: QR is a printed bidder-card token (QA-…) — look up its number
    const { data: card } = await sb
      .from('bidder_cards')
      .select('card_number')
      .eq('qr_token', raw)
      .maybeSingle();

    if (card && card.card_number) {
      $('delivery-bidder-num').value = card.card_number;
      await lookupBidderForDelivery(card.card_number);
    } else {
      setError($('delivery-lookup-error'), `QR code "${raw}" is not a recognised bidder card.`);
    }
  });
  if (!started) hide($('delivery-bidder-scan-wrap'));
});

$('btn-delivery-bidder-scan-stop').addEventListener('click', () => {
  stopScanner('delivery-bidder-video');
  hide($('delivery-bidder-scan-wrap'));
});

async function lookupBidderForDelivery(bidderNumber) {
  setError($('delivery-lookup-error'), '');
  $('btn-delivery-lookup').disabled = true;

  const bidder = await getBidderByNumber(bidderNumber);
  if (!bidder) {
    setError($('delivery-lookup-error'), `Bidder #${bidderNumber} not found.`);
    $('btn-delivery-lookup').disabled = false;
    return;
  }

  // A checkout record only exists once the bidder has been through Checkout
  const { data: record } = await sb.from('checkout_records')
    .select('*').eq('bidder_id', bidder.id).maybeSingle();

  if (!record || !record.checkout_confirmed) {
    setError($('delivery-lookup-error'), `Bidder #${bidderNumber} hasn't checked out yet.`);
    $('btn-delivery-lookup').disabled = false;
    return;
  }

  deliveryBidder = bidder;
  deliveryRecord = record;
  $('btn-delivery-lookup').disabled = false;
  renderDeliveryStep2();
}

// ── Step 2: Quilt delivery scan ───────────────────────────────

function renderDeliveryStep2() {
  hide($('delivery-step-1'));
  show($('delivery-step-2'));

  $('dv-bidder-name').textContent = deliveryBidder.name;
  $('dv-bidder-num').textContent  = `Bidder #${deliveryBidder.bidder_number}`;

  hide($('dv-scan-feedback'));
  refreshDeliveryList();
}

$('btn-delivery-back').addEventListener('click', resetDelivery);

async function refreshDeliveryList() {
  const { data: deliveries } = await sb.from('quilt_deliveries')
    .select('*, quilts(quilt_number, name)')
    .eq('checkout_record_id', deliveryRecord.id);

  const wrap = $('dv-delivery-list');
  if (!deliveries || deliveries.length === 0) {
    wrap.innerHTML = '<div class="text-muted">No quilts to deliver.</div>';
    return;
  }

  wrap.innerHTML = deliveries.map(d => `
    <div class="flex-center gap-8" style="padding:8px 0;border-bottom:1px solid var(--rule)">
      <div>
        <div class="card-meta">Quilt #${d.quilts.quilt_number}</div>
        <div class="fw-bold">${esc(d.quilts.name)}</div>
      </div>
      <div style="margin-left:auto">
        ${d.delivered
          ? '<span class="badge badge-ready">Delivered</span>'
          : '<span class="badge badge-muted">Pending</span>'}
      </div>
    </div>`).join('');
}

// Quilt QR scan
$('btn-delivery-scan-quilt').addEventListener('click', async () => {
  show($('delivery-quilt-scan-wrap'));
  hide($('dv-scan-feedback'));
  const started = await startScanner('delivery-quilt-video', async value => {
    stopScanner('delivery-quilt-video');
    hide($('delivery-quilt-scan-wrap'));
    await markQuiltDelivered(value);
  });
  if (!started) hide($('delivery-quilt-scan-wrap'));
});

$('btn-delivery-quilt-scan-stop').addEventListener('click', () => {
  stopScanner('delivery-quilt-video');
  hide($('delivery-quilt-scan-wrap'));
});

async function markQuiltDelivered(rawValue) {
  const quiltNumber = parseInt(rawValue);
  if (isNaN(quiltNumber)) {
    $('dv-scan-feedback').textContent = `Unrecognized QR code: "${rawValue}"`;
    $('dv-scan-feedback').className = 'form-error';
    show($('dv-scan-feedback'));
    return;
  }

  // Find the quilt
  const { data: quilt } = await sb.from('quilts')
    .select('id, quilt_number, name').eq('quilt_number', quiltNumber).maybeSingle();

  if (!quilt) {
    $('dv-scan-feedback').textContent = `Quilt #${quiltNumber} not found.`;
    $('dv-scan-feedback').className = 'form-error';
    show($('dv-scan-feedback'));
    return;
  }

  // Update delivery record — .select() lets us confirm a row actually changed,
  // rather than silently doing nothing (e.g. quilt not part of this checkout).
  const { data: updated, error } = await sb.from('quilt_deliveries').update({
    delivered:    true,
    delivered_at: new Date().toISOString(),
  }).eq('checkout_record_id', deliveryRecord.id)
    .eq('quilt_id', quilt.id)
    .select();

  if (error || !updated || updated.length === 0) {
    $('dv-scan-feedback').textContent = `Quilt #${quiltNumber} "${quilt.name}" is not part of this bidder's checkout.`;
    $('dv-scan-feedback').className = 'form-error';
  } else {
    $('dv-scan-feedback').textContent = `✓ Quilt #${quiltNumber} "${quilt.name}" marked as delivered.`;
    $('dv-scan-feedback').className = 'form-success';
  }
  show($('dv-scan-feedback'));

  await refreshDeliveryList();
}
