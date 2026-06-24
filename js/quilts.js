// ── Quilt entry, list, edit, delete ──────────────────────────

let editingQuiltId   = null;
let quiltPhotoFile   = null;
let allQuilts        = [];

// ── Photo drop zone ───────────────────────────────────────────

const photoDrop    = $('quilt-photo-drop');
const photoInput   = $('qf-photo');
const photoPreview = $('quilt-photo-preview');
const photoPrompt  = $('quilt-photo-prompt');

photoDrop.addEventListener('click', () => photoInput.click());

photoDrop.addEventListener('dragover', e => {
  e.preventDefault();
  photoDrop.classList.add('drag-over');
});
photoDrop.addEventListener('dragleave', () => photoDrop.classList.remove('drag-over'));
photoDrop.addEventListener('drop', e => {
  e.preventDefault();
  photoDrop.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file && file.type.startsWith('image/')) setPhotoPreview(file);
});

photoInput.addEventListener('change', () => {
  if (photoInput.files[0]) setPhotoPreview(photoInput.files[0]);
});

function setPhotoPreview(file) {
  quiltPhotoFile = file;
  const reader = new FileReader();
  reader.onload = e => {
    photoPreview.src = e.target.result;
    show(photoPreview);
    hide(photoPrompt);
  };
  reader.readAsDataURL(file);
}

function clearPhotoPreview() {
  quiltPhotoFile = null;
  photoInput.value = '';
  photoPreview.src = '';
  hide(photoPreview);
  show(photoPrompt);
}

// ── Save quilt ────────────────────────────────────────────────

$('btn-save-quilt').addEventListener('click', saveQuilt);

async function saveQuilt() {
  const name    = $('qf-name').value.trim();
  const piecer  = $('qf-piecer').value.trim();
  const quilter = $('qf-quilter').value.trim();
  const width   = parseFloat($('qf-width').value);
  const height  = parseFloat($('qf-height').value);
  const pitch   = $('qf-pitch').value.trim();

  setError($('quilt-form-error'), '');

  if (!name || !piecer || !quilter || !width || !height) {
    setError($('quilt-form-error'), 'Name, piecer, quilter, width, and height are required.');
    return;
  }

  $('btn-save-quilt').disabled = true;
  $('btn-save-quilt').textContent = 'Saving…';

  let photoUrl = null;

  if (quiltPhotoFile) {
    const ext  = quiltPhotoFile.name.split('.').pop();
    const path = `quilt-${Date.now()}.${ext}`;
    const { error: uploadError } = await sb.storage
      .from('quilt-photos')
      .upload(path, quiltPhotoFile, { upsert: true });

    if (!uploadError) {
      const { data } = sb.storage.from('quilt-photos').getPublicUrl(path);
      photoUrl = data.publicUrl;
    }
  }

  const payload = { name, piecer_name: piecer, quilter_name: quilter,
    width_in: width, height_in: height, sales_pitch: pitch || null };
  if (photoUrl) payload.photo_url = photoUrl;

  let error;
  if (editingQuiltId) {
    ({ error } = await sb.from('quilts').update(payload).eq('id', editingQuiltId));
  } else {
    ({ error } = await sb.from('quilts').insert(payload));
  }

  $('btn-save-quilt').disabled = false;
  $('btn-save-quilt').textContent = editingQuiltId ? 'Save changes' : 'Save quilt';

  if (error) {
    setError($('quilt-form-error'), 'Could not save quilt: ' + error.message);
    return;
  }

  resetQuiltForm();
  loadQuilts();
}

function resetQuiltForm() {
  editingQuiltId = null;
  ['qf-name','qf-piecer','qf-quilter','qf-width','qf-height','qf-pitch'].forEach(id => { $(id).value = ''; });
  clearPhotoPreview();
  $('btn-save-quilt').textContent = 'Save quilt';
  hide($('btn-cancel-quilt-edit'));
  setError($('quilt-form-error'), '');
}

$('btn-cancel-quilt-edit').addEventListener('click', resetQuiltForm);

// ── Load quilt list ───────────────────────────────────────────

async function loadQuilts() {
  const { data, error } = await sb
    .from('quilts')
    .select('*')
    .order('quilt_number', { ascending: true });

  allQuilts = data || [];
  renderQuiltList(allQuilts, error);

  // Keep bid quilt selector in sync
  populateBidQuiltSelect();
}

function renderQuiltList(quilts, error) {
  const wrap = $('quilt-list');
  if (error) { wrap.innerHTML = '<div class="alert alert-needs">Could not load quilts.</div>'; return; }
  if (!quilts || quilts.length === 0) {
    wrap.innerHTML = '<div class="empty-state">No quilts registered yet.</div>';
    return;
  }

  wrap.innerHTML = quilts.map(q => `
    <div class="card" id="quilt-card-${q.id}">
      <div class="card-row">
        ${q.photo_url ? `<img src="${esc(q.photo_url)}" alt="Quilt photo"
            style="width:80px;height:80px;object-fit:cover;border-radius:var(--r-sm);flex-shrink:0">` : ''}
        <div style="flex:1;min-width:0">
          <div class="card-meta">Quilt #${q.quilt_number}</div>
          <div class="card-title">${esc(q.name)}</div>
          <div class="card-sub">${esc(q.width_in)}" × ${esc(q.height_in)}" &nbsp;·&nbsp;
            Pieced by ${esc(q.piecer_name)} &nbsp;·&nbsp; Quilted by ${esc(q.quilter_name)}</div>
          ${q.sales_pitch ? `<div class="card-sub mt-4 text-faint">${esc(q.sales_pitch)}</div>` : ''}
        </div>
      </div>
      <div class="card-actions">
        <button class="btn btn-accent btn-sm" data-action="qr" data-id="${q.id}"
          data-num="${q.quilt_number}" data-name="${esc(q.name)}">Show QR</button>
        <button class="btn btn-secondary btn-sm" data-action="edit" data-id="${q.id}">Edit</button>
        <button class="btn btn-danger btn-sm" data-action="delete" data-id="${q.id}"
          data-name="${esc(q.name)}">Delete</button>
      </div>
    </div>
  `).join('');

  wrap.querySelectorAll('[data-action="qr"]').forEach(btn => {
    btn.addEventListener('click', () =>
      openQRModal(`Quilt #${btn.dataset.num}`, btn.dataset.num,
        `Quilt #${btn.dataset.num} — ${btn.dataset.name}`));
  });

  wrap.querySelectorAll('[data-action="edit"]').forEach(btn => {
    btn.addEventListener('click', () => startEditQuilt(btn.dataset.id));
  });

  wrap.querySelectorAll('[data-action="delete"]').forEach(btn => {
    btn.addEventListener('click', () => deleteQuilt(btn.dataset.id, btn.dataset.name));
  });
}

async function startEditQuilt(id) {
  const q = allQuilts.find(x => x.id === id);
  if (!q) return;

  editingQuiltId = id;
  $('qf-name').value    = q.name;
  $('qf-piecer').value  = q.piecer_name;
  $('qf-quilter').value = q.quilter_name;
  $('qf-width').value   = q.width_in;
  $('qf-height').value  = q.height_in;
  $('qf-pitch').value   = q.sales_pitch || '';

  if (q.photo_url) {
    photoPreview.src = q.photo_url;
    show(photoPreview);
    hide(photoPrompt);
  } else {
    clearPhotoPreview();
  }

  $('btn-save-quilt').textContent = 'Save changes';
  show($('btn-cancel-quilt-edit'));
  $('quilt-form-wrap').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function deleteQuilt(id, name) {
  const ok = await confirmDelete(`Delete quilt "${name}"? This cannot be undone.`);
  if (!ok) return;
  await sb.from('quilts').delete().eq('id', id);
  if (editingQuiltId === id) resetQuiltForm();
  loadQuilts();
}
