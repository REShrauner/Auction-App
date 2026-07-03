// ── Prepare for Auction: readiness checklist + data lock ─────

let _lockBtnWired = false;

function wireLockButton() {
  if (_lockBtnWired) return;
  _lockBtnWired = true;
  $('btn-toggle-lock').addEventListener('click', async () => {
    await loadLockState();

    if (dataLocked) {
      const ok = await confirmDelete(
        'Unlock data? This will allow quilts and bidders to be modified again, and the Bids page will become unavailable until data is locked again.',
        'Unlock data', 'btn btn-accent'
      );
      if (!ok) return;
      await setLockState(false);
    } else {
      const ok = await confirmDelete(
        'Lock data? Quilts and bidders cannot be added, modified, or deleted while locked, and the Bids page will become available.',
        'Lock data', 'btn btn-accent'
      );
      if (!ok) return;
      await setLockState(true);
    }

    await loadPrepareForAuction();
  });
}

async function setLockState(locked) {
  const { error } = await sb.from('app_settings').upsert({
    id:          1,
    data_locked: locked,
    locked_at:   locked ? new Date().toISOString() : null,
    locked_by:   locked ? currentUser?.id : null,
  }, { onConflict: 'id' });

  if (error) {
    alert('Could not update the lock state: ' + error.message + '\n\nPlease try again.');
    await loadLockState();
    return false;
  }
  dataLocked = locked;
  return true;
}

async function loadPrepareForAuction() {
  await loadLockState();
  renderLockStatus();
  await Promise.all([
    renderUnnumberedQuilts(),
    renderUnnumberedBidders(),
  ]);
}

function renderLockStatus() {
  const statusEl = $('prepare-lock-status');
  const subEl    = $('prepare-lock-sub');
  const btn      = $('btn-toggle-lock');

  if (dataLocked) {
    statusEl.textContent = 'Data is locked';
    statusEl.style.color = 'var(--ready)';
    subEl.textContent = 'Quilts and bidders cannot be modified. The Bids page is active.';
    btn.textContent = 'Unlock data';
    btn.className = 'btn btn-secondary';
  } else {
    statusEl.textContent = 'Data is unlocked';
    statusEl.style.color = 'var(--needs)';
    subEl.textContent = 'Quilts and bidders can still be modified. The Bids page is inactive.';
    btn.textContent = 'Lock data';
    btn.className = 'btn btn-accent';
  }
}

async function renderUnnumberedQuilts() {
  const wrap = $('prepare-quilts-list');
  const { data, error } = await sb
    .from('quilts')
    .select('id, name')
    .is('quilt_number', null)
    .order('name', { ascending: true });

  if (error) {
    wrap.innerHTML = '<div class="alert alert-needs">Could not load quilts.</div>';
    return;
  }
  if (!data || data.length === 0) {
    wrap.innerHTML = '<div class="empty-state">Every quilt has a number.</div>';
    return;
  }
  wrap.innerHTML = `
    <div class="text-muted" style="margin-bottom:8px">${data.length} quilt(s) without a number:</div>
    ${data.map(q => `<div style="padding:6px 0;border-bottom:1px solid var(--rule)">${esc(q.name)}</div>`).join('')}
  `;
}

async function renderUnnumberedBidders() {
  const wrap = $('prepare-bidders-list');
  const { data, error } = await sb
    .from('bidders')
    .select('id, name, phone, email')
    .is('bidder_number', null)
    .order('name', { ascending: true });

  if (error) {
    wrap.innerHTML = '<div class="alert alert-needs">Could not load bidders.</div>';
    return;
  }
  if (!data || data.length === 0) {
    wrap.innerHTML = '<div class="empty-state">Every bidder has a number.</div>';
    return;
  }
  wrap.innerHTML = `
    <div class="text-muted" style="margin-bottom:8px">${data.length} bidder(s) without a number:</div>
    ${data.map(b => `<div style="padding:6px 0;border-bottom:1px solid var(--rule)">${esc(b.name)} ${b.phone ? '— ' + esc(b.phone) : ''}</div>`).join('')}
  `;
}
