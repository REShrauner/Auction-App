// ── Checkout: payment + quilt delivery ───────────────────────
 
let checkoutBidder  = null;
let checkoutRecord  = null;
let checkoutQuilts  = [];   // won quilts for this bidder
let paymentLineCount = 0;
 
function resetCheckout() {
  stopAllScanners();
  checkoutBidder   = null;
  checkoutRecord   = null;
  checkoutQuilts   = [];
  paymentLineCount = 0;
 
  $('checkout-bidder-num').value = '';
  setError($('checkout-lookup-error'), '');
  hide($('checkout-scan-wrap'));
  hide($('checkout-step-2'));
  hide($('checkout-confirmed-wrap'));
  show($('checkout-step-1'));
}
 
// ── Step 1: Identify bidder ───────────────────────────────────
 
$('btn-checkout-lookup').addEventListener('click', async () => {
  const num = parseInt($('checkout-bidder-num').value);
  if (!num || num < 1) {
    setError($('checkout-lookup-error'), 'Enter a bidder number.');
    return;
  }
  await lookupBidderForCheckout(num);
});
 
$('checkout-bidder-num').addEventListener('keydown', e => {
  if (e.key === 'Enter') $('btn-checkout-lookup').click();
});
 
$('btn-checkout-scan').addEventListener('click', async () => {
  show($('checkout-scan-wrap'));
  const started = await startScanner('checkout-video', async value => {
    stopScanner('checkout-video');
    hide($('checkout-scan-wrap'));
 
    const raw = String(value).trim();
    const num = parseInt(raw);
 
    // Case 1: QR encodes a plain bidder number (from the bidder "Show QR")
    if (!isNaN(num) && num > 0 && String(num) === raw) {
      $('checkout-bidder-num').value = num;
      await lookupBidderForCheckout(num);
      return;
    }
 
    // Case 2: QR is a printed bidder-card token (QA-…) — look up its number
    const { data: card } = await sb
      .from('bidder_cards')
      .select('card_number')
      .eq('qr_token', raw)
      .maybeSingle();
 
    if (card && card.card_number) {
      $('checkout-bidder-num').value = card.card_number;
      await lookupBidderForCheckout(card.card_number);
    } else {
      setError($('checkout-lookup-error'), `QR code "${raw}" is not a recognised bidder card.`);
    }
  });
  if (!started) hide($('checkout-scan-wrap'));
});
 
$('btn-checkout-scan-stop').addEventListener('click', () => {
  stopScanner('checkout-video');
  hide($('checkout-scan-wrap'));
});
 
async function lookupBidderForCheckout(bidderNumber) {
  setError($('checkout-lookup-error'), '');
  $('btn-checkout-lookup').disabled = true;
 
  const bidder = await getBidderByNumber(bidderNumber);
  if (!bidder) {
    setError($('checkout-lookup-error'), `Bidder #${bidderNumber} not found.`);
    $('btn-checkout-lookup').disabled = false;
    return;
  }
 
  // Load finalized bids for this bidder
  const { data: bids } = await sb.from('bid_records')
    .select('*, quilts(id, quilt_number, name)')
    .eq('resolved_bidder_id', bidder.id)
    .eq('is_finalized', true);
 
  checkoutBidder = bidder;
  checkoutQuilts = (bids || []).map(b => ({
    quiltId:     b.quilts.id,
    quiltNumber: b.quilts.quilt_number,
    quiltName:   b.quilts.name,
    amount:      b.resolved_bid,
    bidRecordId: b.id,
  }));
 
  // Load or create checkout record
  const { data: existing } = await sb.from('checkout_records')
    .select('*').eq('bidder_id', bidder.id).maybeSingle();
 
  if (existing && existing.checkout_confirmed) {
    setError($('checkout-lookup-error'), `Bidder #${bidderNumber} has already checked out.`);
    $('btn-checkout-lookup').disabled = false;
    return;
  }
 
  checkoutRecord = existing || null;
  $('btn-checkout-lookup').disabled = false;
  renderCheckoutStep2();
}
 
// ── Step 2: Payment ───────────────────────────────────────────
 
function renderCheckoutStep2() {
  hide($('checkout-step-1'));
  hide($('checkout-confirmed-wrap'));
  show($('co-quilts-card'));
  show($('co-payment-card'));
  show($('checkout-step-2'));

  $('co-bidder-name').textContent = checkoutBidder.name;
  $('co-bidder-num').textContent  = `Bidder #${checkoutBidder.bidder_number}`;
 
  // Won quilts table
  const totalDue = checkoutQuilts.reduce((s, q) => s + q.amount, 0);
  $('co-quilts-list').innerHTML = checkoutQuilts.length === 0
    ? '<div class="text-muted">No won quilts found for this bidder.</div>'
    : checkoutQuilts.map(q => `
        <div class="flex-center gap-8" style="padding:8px 0;border-bottom:1px solid var(--rule)">
          <div>
            <div class="card-meta">Quilt #${q.quiltNumber}</div>
            <div class="fw-bold">${esc(q.quiltName)}</div>
          </div>
          <div class="text-accent fw-bold" style="margin-left:auto">${fmtMoney(q.amount)}</div>
        </div>`).join('');
 
  $('co-total-due').textContent = fmtMoney(totalDue);
 
  // Reset payment lines
  paymentLineCount = 0;
  $('co-payment-lines').innerHTML = '';
  hide($('co-payment-mismatch'));
  setError($('checkout-payment-error'), '');
 
  // Pre-populate from existing checkout record if applicable
  if (checkoutRecord) {
    loadExistingPaymentLines();
  } else {
    addPaymentLine();
  }
}
 
$('btn-checkout-back').addEventListener('click', resetCheckout);
 
async function loadExistingPaymentLines() {
  const { data: lines } = await sb.from('payment_lines')
    .select('*').eq('checkout_record_id', checkoutRecord.id);
  if (lines && lines.length > 0) {
    lines.forEach(l => addPaymentLine(l.amount, l.method));
  } else {
    addPaymentLine();
  }
  recalcRemitted();
}
 
$('btn-add-payment-line').addEventListener('click', () => addPaymentLine());
 
function addPaymentLine(amount, method) {
  paymentLineCount++;
  const lineId = 'pl-' + paymentLineCount;
  const div = document.createElement('div');
  div.className = 'payment-line-row';
  div.id = lineId;
  div.innerHTML = `
    <select class="pl-method">
      <option value="cash"        ${method==='cash'?'selected':''}>Cash</option>
      <option value="check"       ${method==='check'?'selected':''}>Check</option>
      <option value="credit card" ${method==='credit card'?'selected':''}>Credit card</option>
    </select>
    <input type="number" class="pl-amount" min="0" step="0.01" placeholder="$0.00"
      value="${amount != null ? amount : ''}">
    <button class="btn btn-secondary btn-sm" data-remove="${lineId}" style="padding:6px 8px">✕</button>
  `;
  $('co-payment-lines').appendChild(div);
  div.querySelector('.pl-amount').addEventListener('input', recalcRemitted);
  div.querySelector('[data-remove]').addEventListener('click', () => {
    div.remove();
    recalcRemitted();
  });
}
 
function recalcRemitted() {
  let total = 0;
  document.querySelectorAll('.pl-amount').forEach(inp => {
    total += parseFloat(inp.value) || 0;
  });
  $('co-amount-remitted').textContent = fmtMoney(total);
 
  const due = checkoutQuilts.reduce((s, q) => s + q.amount, 0);
  const mismatch = Math.abs(total - due) > 0.001;
  toggle($('co-payment-mismatch'), mismatch);
}
 
// ── Confirm checkout ──────────────────────────────────────────
 
$('btn-confirm-checkout').addEventListener('click', async () => {
  const lines = [];
  const lineRows = document.querySelectorAll('.payment-line-row');
  let remitted = 0;
 
  for (const row of lineRows) {
    const method = row.querySelector('.pl-method').value;
    const amount = parseFloat(row.querySelector('.pl-amount').value);
    if (!amount || amount <= 0) {
      setError($('checkout-payment-error'), 'All payment lines must have a positive amount.');
      return;
    }
    remitted += amount;
    lines.push({ method, amount });
  }
 
  if (lines.length === 0) {
    setError($('checkout-payment-error'), 'Enter at least one payment line.');
    return;
  }
 
  const totalDue = checkoutQuilts.reduce((s, q) => s + q.amount, 0);
  const mismatch = Math.abs(remitted - totalDue) > 0.001;
 
  if (mismatch) {
    setError($('checkout-payment-error'), 'Amount entered does not match total due. Resolve before confirming.');
    return;
  }
 
  setError($('checkout-payment-error'), '');
  $('btn-confirm-checkout').disabled = true;
  $('btn-confirm-checkout').textContent = 'Saving…';
 
  // Upsert checkout record
  let recId = checkoutRecord?.id;
 
  if (!recId) {
    const { data: newRec, error } = await sb.from('checkout_records').insert({
      bidder_id:        checkoutBidder.id,
      total_due:        totalDue,
      amount_remitted:  remitted,
      payment_mismatch: mismatch,
      checkout_confirmed: true,
      confirmed_by:     currentUser.id,
      confirmed_at:     new Date().toISOString(),
    }).select().single();
 
    if (error || !newRec) {
      setError($('checkout-payment-error'), 'Could not save checkout: ' + (error?.message || ''));
      $('btn-confirm-checkout').disabled = false;
      $('btn-confirm-checkout').textContent = 'Confirm checkout';
      return;
    }
    recId = newRec.id;
    checkoutRecord = newRec;
  } else {
    await sb.from('checkout_records').update({
      total_due:          totalDue,
      amount_remitted:    remitted,
      payment_mismatch:   mismatch,
      checkout_confirmed: true,
      confirmed_by:       currentUser.id,
      confirmed_at:       new Date().toISOString(),
    }).eq('id', recId);
    // Remove old payment lines
    await sb.from('payment_lines').delete().eq('checkout_record_id', recId);
  }
 
  // Insert payment lines
  await sb.from('payment_lines').insert(
    lines.map(l => ({ checkout_record_id: recId, amount: l.amount, method: l.method }))
  );
 
  // Create quilt delivery rows
  for (const q of checkoutQuilts) {
    await sb.from('quilt_deliveries').upsert({
      checkout_record_id: recId,
      quilt_id:           q.quiltId,
      delivered:          false,
    }, { onConflict: 'checkout_record_id,quilt_id' });
  }
 
  $('btn-confirm-checkout').disabled = false;
  $('btn-confirm-checkout').textContent = 'Confirm checkout';

  $('co-confirmed-bidder').textContent = `${checkoutBidder.name} (Bidder #${checkoutBidder.bidder_number})`;
  hide($('co-quilts-card'));
  hide($('co-payment-card'));
  show($('checkout-confirmed-wrap'));
});

$('btn-checkout-new').addEventListener('click', resetCheckout);