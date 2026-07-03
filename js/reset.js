// ── Database reset (admin only) ───────────────────────────────

// ── Full Reset ────────────────────────────────────────────────

$('btn-reset-full').addEventListener('click', () => {
  $('reset-full-input').value = '';
  setError($('reset-full-error'), '');
  show($('reset-full-confirm'));
});

$('btn-reset-full-cancel').addEventListener('click', () => {
  hide($('reset-full-confirm'));
  $('reset-full-input').value = '';
  setError($('reset-full-error'), '');
});

$('btn-reset-full-go').addEventListener('click', async () => {
  if ($('reset-full-input').value.trim() !== 'RESET') {
    $('reset-full-input').style.borderColor = '#B83A3A';
    $('reset-full-input').focus();
    setError($('reset-full-error'), 'Type RESET in capitals to confirm.');
    return;
  }
  $('reset-full-input').style.borderColor = '';
  setError($('reset-full-error'), '');

  $('btn-reset-full-go').disabled = true;
  $('btn-reset-full-go').textContent = 'Resetting…';

  try {
    // Delete in dependency order (children before parents)
    await sb.from('payment_lines').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await sb.from('quilt_deliveries').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await sb.from('checkout_records').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await sb.from('bid_records').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await sb.from('quilts').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await sb.from('bidder_cards').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await sb.from('bidders').delete().neq('id', '00000000-0000-0000-0000-000000000000');

    // Return to an editable state: unlock data
    await sb.from('app_settings').upsert({
      id: 1, data_locked: false, locked_at: null, locked_by: null
    }, { onConflict: 'id' });
    dataLocked = false;

    hide($('reset-full-confirm'));
    $('reset-full-input').value = '';
    alert('Full reset complete. All auction data has been deleted.');
  } catch (err) {
    setError($('reset-full-error'), 'Reset failed: ' + (err.message || 'Unknown error'));
  }

  $('btn-reset-full-go').disabled = false;
  $('btn-reset-full-go').textContent = 'Confirm Full Reset';
});

// ── Keep Bidder Contacts Reset ────────────────────────────────

$('btn-reset-keep').addEventListener('click', () => {
  $('reset-keep-input').value = '';
  setError($('reset-keep-error'), '');
  show($('reset-keep-confirm'));
});

$('btn-reset-keep-cancel').addEventListener('click', () => {
  hide($('reset-keep-confirm'));
  $('reset-keep-input').value = '';
  setError($('reset-keep-error'), '');
});

$('btn-reset-keep-go').addEventListener('click', async () => {
  if ($('reset-keep-input').value.trim() !== 'RESET') {
    $('reset-keep-input').style.borderColor = '#B83A3A';
    $('reset-keep-input').focus();
    setError($('reset-keep-error'), 'Type RESET in capitals to confirm.');
    return;
  }
  $('reset-keep-input').style.borderColor = '';
  setError($('reset-keep-error'), '');

  $('btn-reset-keep-go').disabled = true;
  $('btn-reset-keep-go').textContent = 'Resetting…';

  try {
    // Delete in dependency order
    await sb.from('payment_lines').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await sb.from('quilt_deliveries').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await sb.from('checkout_records').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await sb.from('bid_records').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await sb.from('quilts').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await sb.from('bidder_cards').delete().neq('id', '00000000-0000-0000-0000-000000000000');

    // Clear bidder numbers but keep contact info
    await sb.from('bidders').update({ bidder_number: null }).neq('id', '00000000-0000-0000-0000-000000000000');

    // Return to an editable state: unlock data
    await sb.from('app_settings').upsert({
      id: 1, data_locked: false, locked_at: null, locked_by: null
    }, { onConflict: 'id' });
    dataLocked = false;

    hide($('reset-keep-confirm'));
    $('reset-keep-input').value = '';
    alert('Reset complete. Bidder contact info has been kept; everything else has been deleted.');
  } catch (err) {
    setError($('reset-keep-error'), 'Reset failed: ' + (err.message || 'Unknown error'));
  }

  $('btn-reset-keep-go').disabled = false;
  $('btn-reset-keep-go').textContent = 'Confirm Reset';
});
