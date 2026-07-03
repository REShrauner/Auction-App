// ── Bidder card generation and printing ───────────────────────
 
$('btn-print-cards').addEventListener('click', () => {
  show($('print-cards-form'));
  setError($('print-cards-error'), '');
});
 
$('btn-print-cards-cancel').addEventListener('click', () => {
  hide($('print-cards-form'));
  setError($('print-cards-error'), '');
});
 
$('btn-print-cards-go').addEventListener('click', generateAndPrintCards);
 
async function generateAndPrintCards() {
  const startNum = parseInt($('cards-start').value);
  const count    = parseInt($('cards-count').value);
 
  setError($('print-cards-error'), '');
 
  if (!startNum || startNum < 1) {
    setError($('print-cards-error'), 'Enter a valid starting number.');
    return;
  }
  if (!count || count < 1 || count > 200) {
    setError($('print-cards-error'), 'Enter a count between 1 and 200.');
    return;
  }
 
  $('btn-print-cards-go').disabled = true;
  $('btn-print-cards-go').textContent = 'Generating…';
 
  // Generate tokens for each card
  const cards = [];
  for (let i = 0; i < count; i++) {
    const num   = startNum + i;
    const token = generateToken(num);
    cards.push({ card_number: num, qr_token: token, assigned: false });
  }
 
  // Check for existing card numbers
  const numbers = cards.map(c => c.card_number);
  const { data: existing } = await sb
    .from('bidder_cards')
    .select('card_number')
    .in('card_number', numbers);
 
  if (existing && existing.length > 0) {
    const dupes = existing.map(e => e.card_number).join(', ');
    setError($('print-cards-error'), `Cards already exist for number(s): ${dupes}. Change your starting number or count.`);
    $('btn-print-cards-go').disabled = false;
    $('btn-print-cards-go').textContent = 'Generate & Print';
    return;
  }
 
  // Save to Supabase
  const { error } = await sb.from('bidder_cards').insert(cards);
  if (error) {
    setError($('print-cards-error'), 'Could not save cards: ' + error.message);
    $('btn-print-cards-go').disabled = false;
    $('btn-print-cards-go').textContent = 'Generate & Print';
    return;
  }
 
  $('btn-print-cards-go').disabled = false;
  $('btn-print-cards-go').textContent = 'Generate & Print';
  hide($('print-cards-form'));
 
  // Build print window
  await printCards(cards);
}
 
function generateToken(cardNumber) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let token = 'QA-';
  for (let i = 0; i < 8; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
}
 
async function printCards(cards) {
  // Build an array of QR data URLs using QRCode.js
  const qrDataUrls = await Promise.all(cards.map(card =>
    new Promise((resolve, reject) => {
      const canvas = document.createElement('canvas');
      QRCode.toCanvas(canvas, card.qr_token, { width: 160, margin: 1 }, err => {
        if (err) reject(err);
        else resolve({ number: card.card_number, dataUrl: canvas.toDataURL() });
      });
    })
  ));
 
  // Build print HTML — 2 cards per page (half-sheet portrait)
  let pairsHTML = '';
  for (let i = 0; i < qrDataUrls.length; i += 2) {
    const a = qrDataUrls[i];
    const b = qrDataUrls[i + 1];
    pairsHTML += `
      <div class="page">
        <div class="card-half">
          <div class="card-number">${a.number}</div>
          <img class="card-qr" src="${a.dataUrl}" alt="QR ${a.number}">
        </div>
        <div class="divider"></div>
        <div class="card-half">
          ${b ? `<div class="card-number">${b.number}</div>
          <img class="card-qr" src="${b.dataUrl}" alt="QR ${b.number}">` : ''}
        </div>
      </div>
    `;
  }
 
  const printWindow = window.open('', '_blank');
  printWindow.document.write(`<!DOCTYPE html>
<html>
<head>
<title>Bidder Cards</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, sans-serif; }
  .page {
    width: 8.5in;
    height: 11in;
    display: flex;
    flex-direction: column;
    page-break-after: always;
  }
  .card-half {
    flex: 1;
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
    padding: 0.5in 0.75in;
  }
  .divider {
    border-top: 1px dashed #aaa;
    width: 100%;
  }
  .card-number {
    font-size: 260pt;
    font-weight: 900;
    line-height: 1;
    color: #111;
    transform: rotate(-90deg);
  }
  .card-qr {
    width: 160px;
    height: 160px;
    transform: rotate(-90deg);
    flex-shrink: 0;
  }
  @media print {
    .page { page-break-after: always; }
  }
</style>
</head>
<body>${pairsHTML}</body>
</html>`);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => printWindow.print(), 600);
}
 
// ── Delete card range ─────────────────────────────────────────
 
$('btn-delete-range-show').addEventListener('click', () => {
  show($('delete-range-form'));
  hide($('delete-range-warning'));
  setError($('delete-range-error'), '');
});
 
$('btn-delete-range-cancel').addEventListener('click', () => {
  hide($('delete-range-form'));
  hide($('delete-range-warning'));
  setError($('delete-range-error'), '');
});
 
$('btn-delete-range-go').addEventListener('click', async () => {
  const startNum = parseInt($('del-range-start').value);
  const count    = parseInt($('del-range-count').value);
 
  setError($('delete-range-error'), '');
  hide($('delete-range-warning'));
 
  if (!startNum || startNum < 1) {
    setError($('delete-range-error'), 'Enter a valid starting number.');
    return;
  }
  if (!count || count < 1) {
    setError($('delete-range-error'), 'Enter a count of at least 1.');
    return;
  }
 
  const numbers = Array.from({ length: count }, (_, i) => startNum + i);
 
  // Check which ones exist and which are assigned
  const { data: cards } = await sb
    .from('bidder_cards')
    .select('card_number, assigned')
    .in('card_number', numbers);
 
  if (!cards || cards.length === 0) {
    setError($('delete-range-error'), 'No cards found in that range.');
    return;
  }
 
  const assigned = cards.filter(c => c.assigned).map(c => c.card_number);
  if (assigned.length > 0) {
    const warn = $('delete-range-warning');
    warn.textContent = `Warning: ${assigned.length} card(s) in this range are assigned to registered bidders: #${assigned.join(', #')}. They will also be deleted.`;
    show(warn);
  }
 
  const ok = await confirmDelete(
    `Delete ${cards.length} card(s) starting at #${startNum}?${assigned.length > 0 ? ' This includes ' + assigned.length + ' assigned card(s).' : ''} This cannot be undone.`
  );
  if (!ok) return;
 
  await sb.from('bidder_cards').delete().in('card_number', numbers);
  hide($('delete-range-form'));
  hide($('delete-range-warning'));
  $('del-range-start').value = '';
  $('del-range-count').value = '1';
  alert(`Deleted ${cards.length} card(s).`);
});
 
// ── Clear unassigned cards ────────────────────────────────────
 
$('btn-clear-unassigned').addEventListener('click', async () => {
  const { data: cards } = await sb
    .from('bidder_cards')
    .select('card_number')
    .eq('assigned', false);
 
  if (!cards || cards.length === 0) {
    alert('There are no unassigned cards to delete.');
    return;
  }
 
  const ok = await confirmDelete(
    `Delete all ${cards.length} unassigned card(s)? Assigned cards will not be affected. This cannot be undone.`
  );
  if (!ok) return;
 
  await sb.from('bidder_cards').delete().eq('assigned', false);
  alert(`Deleted ${cards.length} unassigned card(s).`);
});
 
// ── Delete ALL cards (nuclear) ────────────────────────────────
 
$('btn-delete-all-cards').addEventListener('click', async () => {
  const { data: cards } = await sb.from('bidder_cards').select('card_number, assigned');
  const total    = cards?.length || 0;
  const assigned = cards?.filter(c => c.assigned).length || 0;
 
  $('delete-all-warning-msg').textContent =
    `This will permanently delete ALL ${total} card(s), including ${assigned} assigned to registered bidders.`;
  $('delete-all-input').value = '';
  show($('delete-all-confirm'));
});
 
$('btn-delete-all-cancel').addEventListener('click', () => {
  hide($('delete-all-confirm'));
  $('delete-all-input').value = '';
});
 
$('btn-delete-all-go').addEventListener('click', async () => {
  if ($('delete-all-input').value.trim() !== 'DELETE') {
    $('delete-all-input').style.borderColor = 'var(--needs)';
    $('delete-all-input').focus();
    return;
  }
  $('delete-all-input').style.borderColor = '';
 
  await sb.from('bidder_cards').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  hide($('delete-all-confirm'));
  alert('All bidder cards have been deleted.');
});