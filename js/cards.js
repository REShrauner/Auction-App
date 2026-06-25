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
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 24px;
  }
  .divider {
    border-top: 1px dashed #aaa;
    width: 100%;
  }
  .card-number {
    font-size: 160pt;
    font-weight: 900;
    line-height: 1;
    color: #111;
  }
  .card-qr {
    width: 160px;
    height: 160px;
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
