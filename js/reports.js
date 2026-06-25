// ── Reports (admin only) ──────────────────────────────────────

document.querySelectorAll('[data-report]').forEach(btn => {
  btn.addEventListener('click', () => runReport(btn.dataset.report));
});

$('btn-print-report').addEventListener('click', () => window.print());

async function runReport(type) {
  $('report-output').innerHTML = '<div class="text-muted"><span class="spinner"></span> Loading…</div>';
  show($('report-actions'));

  switch (type) {
    case 'bidder':  await reportBidderSummary();    break;
    case 'unsold':  await reportUnsoldQuilts();     break;
    case 'unpaid':  await reportUnpaidBidders();    break;
    case 'methods': await reportPaymentMethods();   break;
    case 'nocard':  await reportBiddersWithoutCard(); break;
  }
}

// ── Report 1: Complete Bidder Summary ────────────────────────

async function reportBidderSummary() {
  const { data: bids } = await sb.from('bid_records')
    .select('resolved_bid, resolved_bidder_id, quilts(quilt_number, name), bidders!resolved_bidder_id(name, bidder_number)')
    .eq('is_finalized', true)
    .order('resolved_bidder_id');

  if (!bids || bids.length === 0) {
    $('report-output').innerHTML = '<div class="empty-state">No finalized bids to report.</div>';
    return;
  }

  // Group by bidder
  const byBidder = {};
  bids.forEach(b => {
    const key = b.resolved_bidder_id;
    if (!byBidder[key]) {
      byBidder[key] = {
        name:         b.bidders?.name || '(unknown)',
        bidderNumber: b.bidders?.bidder_number,
        bids: [],
      };
    }
    byBidder[key].bids.push(b);
  });

  const sorted = Object.values(byBidder)
    .sort((a, b) => a.name.localeCompare(b.name));

  let grandTotal = 0;

  const html = `
    <h3 style="font-size:var(--fs-xl);font-weight:700;margin-bottom:16px">Complete Bidder Report</h3>
    ${sorted.map(bidder => {
      const subtotal = bidder.bids.reduce((s, b) => s + b.resolved_bid, 0);
      grandTotal += subtotal;
      return `
        <div class="report-section">
          <div class="report-section-heading">
            ${esc(bidder.name)} <span class="text-faint" style="font-size:var(--fs-md)">Bidder #${bidder.bidderNumber}</span>
          </div>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Quilt name</th>
                  <th class="text-right">Bid</th>
                </tr>
              </thead>
              <tbody>
                ${bidder.bids.map(b => `
                  <tr>
                    <td>${b.quilts?.quilt_number}</td>
                    <td>${esc(b.quilts?.name)}</td>
                    <td class="text-right">${fmtMoney(b.resolved_bid)}</td>
                  </tr>`).join('')}
                <tr>
                  <td colspan="2" class="fw-bold text-right" style="padding-top:10px">Subtotal</td>
                  <td class="fw-bold text-right text-accent" style="padding-top:10px">${fmtMoney(subtotal)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>`;
    }).join('')}
    <div class="report-grand-total">Grand total: <span class="text-accent">${fmtMoney(grandTotal)}</span></div>
  `;

  $('report-output').innerHTML = html;
}

// ── Report 2: Unsold Quilts ───────────────────────────────────

async function reportUnsoldQuilts() {
  // Quilts with no finalized bid record
  const { data: allQ } = await sb.from('quilts')
    .select('quilt_number, name, piecer_name, quilter_name, id')
    .order('quilt_number');

  const { data: soldBids } = await sb.from('bid_records')
    .select('quilt_id').eq('is_finalized', true);

  const soldIds = new Set((soldBids || []).map(b => b.quilt_id));
  const unsold  = (allQ || []).filter(q => !soldIds.has(q.id));

  if (unsold.length === 0) {
    $('report-output').innerHTML = '<div class="empty-state">All quilts have been sold.</div>';
    return;
  }

  $('report-output').innerHTML = `
    <h3 style="font-size:var(--fs-xl);font-weight:700;margin-bottom:16px">
      Unsold Quilts <span class="text-muted">(${unsold.length})</span>
    </h3>
    <div class="table-wrap">
      <table>
        <thead>
          <tr><th>#</th><th>Quilt name</th><th>Piecer</th><th>Quilter</th></tr>
        </thead>
        <tbody>
          ${unsold.map(q => `
            <tr>
              <td>${q.quilt_number}</td>
              <td>${esc(q.name)}</td>
              <td>${esc(q.piecer_name)}</td>
              <td>${esc(q.quilter_name)}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>
  `;
}

// ── Report 3: Unpaid / Underpaid Bidders ─────────────────────

async function reportUnpaidBidders() {
  // Get all bidders who won quilts
  const { data: bids } = await sb.from('bid_records')
    .select('resolved_bid, resolved_bidder_id, bidders!resolved_bidder_id(bidder_number, name)')
    .eq('is_finalized', true);

  if (!bids || bids.length === 0) {
    $('report-output').innerHTML = '<div class="empty-state">No finalized bids.</div>';
    return;
  }

  // Sum total due per bidder
  const dueMap = {};
  bids.forEach(b => {
    const id = b.resolved_bidder_id;
    if (!dueMap[id]) dueMap[id] = { bidder: b.bidders, totalDue: 0 };
    dueMap[id].totalDue += b.resolved_bid;
  });

  // Load checkout records
  const { data: checkouts } = await sb.from('checkout_records')
    .select('bidder_id, amount_remitted, checkout_confirmed');

  const checkoutMap = {};
  (checkouts || []).forEach(c => { checkoutMap[c.bidder_id] = c; });

  const rows = Object.entries(dueMap).map(([bidderId, { bidder, totalDue }]) => {
    const co         = checkoutMap[bidderId];
    const remitted   = co?.amount_remitted || 0;
    const difference = totalDue - remitted;
    return { bidder, totalDue, remitted, difference };
  }).filter(r => Math.abs(r.difference) > 0.001)
    .sort((a, b) => a.bidder?.name?.localeCompare(b.bidder?.name));

  if (rows.length === 0) {
    $('report-output').innerHTML = '<div class="empty-state">All bidders have paid in full.</div>';
    return;
  }

  $('report-output').innerHTML = `
    <h3 style="font-size:var(--fs-xl);font-weight:700;margin-bottom:16px">
      Unpaid / Underpaid Bidders <span class="text-muted">(${rows.length})</span>
    </h3>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>#</th><th>Name</th>
            <th class="text-right">Total due</th>
            <th class="text-right">Paid</th>
            <th class="text-right">Difference</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(r => `
            <tr>
              <td>${r.bidder?.bidder_number}</td>
              <td>${esc(r.bidder?.name)}</td>
              <td class="text-right">${fmtMoney(r.totalDue)}</td>
              <td class="text-right">${fmtMoney(r.remitted)}</td>
              <td class="text-right text-needs fw-bold">${fmtMoney(r.difference)}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>
  `;
}

// ── Report 4: Payment Method Totals ──────────────────────────

async function reportPaymentMethods() {
  const { data: lines } = await sb.from('payment_lines').select('amount, method');

  if (!lines || lines.length === 0) {
    $('report-output').innerHTML = '<div class="empty-state">No payments recorded yet.</div>';
    return;
  }

  const totals = { cash: 0, check: 0, 'credit card': 0 };
  lines.forEach(l => { totals[l.method] = (totals[l.method] || 0) + l.amount; });

  const grandTotal = Object.values(totals).reduce((s, v) => s + v, 0);

  const labels = { cash: 'Cash', check: 'Check', 'credit card': 'Credit card' };

  $('report-output').innerHTML = `
    <h3 style="font-size:var(--fs-xl);font-weight:700;margin-bottom:16px">Payment Method Totals</h3>
    <div class="table-wrap">
      <table>
        <thead>
          <tr><th>Method</th><th class="text-right">Total collected</th></tr>
        </thead>
        <tbody>
          ${Object.entries(totals).map(([method, total]) => `
            <tr>
              <td>${labels[method] || method}</td>
              <td class="text-right fw-bold">${fmtMoney(total)}</td>
            </tr>`).join('')}
          <tr>
            <td class="fw-bold" style="padding-top:10px">Grand total</td>
            <td class="text-right fw-bold text-accent" style="padding-top:10px">${fmtMoney(grandTotal)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  `;
}

// ── Report 5: Bidders Without Card/QR Code ───────────────────

async function reportBiddersWithoutCard() {
  const { data: bidders, error } = await sb
    .from('bidders')
    .select('bidder_number, name, address, phone, email')
    .is('bidder_number', null)
    .order('name', { ascending: true });

  if (error) {
    $('report-output').innerHTML = '<div class="alert alert-needs">Could not load bidders.</div>';
    return;
  }

  if (!bidders || bidders.length === 0) {
    $('report-output').innerHTML = '<div class="empty-state">All bidders have been assigned a card.</div>';
    return;
  }

  $('report-output').innerHTML = `
    <h3 style="font-size:var(--fs-xl);font-weight:700;margin-bottom:16px">
      Bidders Without Card <span class="text-muted">(${bidders.length})</span>
    </h3>
    <div class="table-wrap">
      <table>
        <thead>
          <tr><th>Name</th><th>Phone</th><th>Email</th></tr>
        </thead>
        <tbody>
          ${bidders.map(b => `
            <tr>
              <td>${esc(b.name)}</td>
              <td>${esc(b.phone || '—')}</td>
              <td>${esc(b.email || '—')}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>
  `;
}
