// ── Quilt entry, list, edit, delete ──────────────────────────

let editingQuiltId   = null;
let selectedQuiltId  = null;
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

// ── Search ────────────────────────────────────────────────────

$('quilt-search').addEventListener('input', () => {
  const term = $('quilt-search').value.trim().toLowerCase();
  const filtered = term
    ? allQuilts.filter(q =>
        String(q.quilt_number).includes(term) ||
        q.name.toLowerCase().includes(term))
    : allQuilts;
  renderQuiltList(filtered, null);
});

// ── List action buttons ───────────────────────────────────────

$('btn-quilt-add').addEventListener('click', () => {
  resetQuiltForm();
  $('quilt-form-title').textContent = 'Add Quilt';
  show($('quilt-form-wrap'));
  $('quilt-form-wrap').scrollIntoView({ behavior: 'smooth', block: 'start' });
});

$('btn-quilt-modify').addEventListener('click', () => {
  if (!selectedQuiltId) return;
  startEditQuilt(selectedQuiltId);
});

$('btn-quilt-delete').addEventListener('click', async () => {
  if (!selectedQuiltId) return;
  const q = allQuilts.find(x => x.id === selectedQuiltId);
  if (q) await deleteQuilt(q.id, q.name);
});

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
  $('btn-save-quilt').textContent = 'Save quilt';

  if (error) {
    setError($('quilt-form-error'), 'Could not save quilt: ' + error.message);
    return;
  }

  hide($('quilt-form-wrap'));
  resetQuiltForm();
  await loadQuilts();
}

// ── Cancel ────────────────────────────────────────────────────

$('btn-cancel-quilt-edit').addEventListener('click', () => {
  hide($('quilt-form-wrap'));
  resetQuiltForm();
});

function resetQuiltForm() {
  editingQuiltId = null;
  ['qf-name','qf-piecer','qf-quilter','qf-width','qf-height','qf-pitch']
    .forEach(id => { $(id).value = ''; });
  clearPhotoPreview();
  $('btn-save-quilt').textContent = 'Save quilt';
  hide($('btn-show-qr'));
  setError($('quilt-form-error'), '');
}

// ── Show QR (inside edit form) ────────────────────────────────

$('btn-show-qr').addEventListener('click', () => {
  const q = allQuilts.find(x => x.id === editingQuiltId);
  if (!q) return;
  openQRModal(`Quilt #${q.quilt_number}`, q.quilt_number,
    `Quilt #${q.quilt_number} — ${q.name}`);
});

// ── Load quilt list ───────────────────────────────────────────

async function loadQuilts() {
  const { data, error } = await sb
    .from('quilts')
    .select('*')
    .order('quilt_number', { ascending: true });

  allQuilts = data || [];
  renderQuiltList(allQuilts, error);
  populateBidQuiltSelect();
}

function renderQuiltList(quilts, error) {
  const wrap = $('quilt-list');
  if (error) {
    wrap.innerHTML = '<div class="alert alert-needs">Could not load quilts.</div>';
    return;
  }
  if (!quilts || quilts.length === 0) {
    wrap.innerHTML = '<div class="empty-state">No Quilts Entered</div>';
    setQuiltSelection(null);
    return;
  }

  wrap.innerHTML = quilts.map(q => `
    <div class="quilt-list-row" data-id="${q.id}" tabindex="0"
         role="option" aria-selected="false">
      <span class="quilt-list-num">${q.quilt_number}</span>
      <span class="quilt-list-name">${esc(q.name)}</span>
    </div>
  `).join('');

  wrap.querySelectorAll('.quilt-list-row').forEach(row => {
    row.addEventListener('click',    () => setQuiltSelection(row.dataset.id));
    row.addEventListener('keydown',  e => {
      if (e.key === 'Enter' || e.key === ' ') setQuiltSelection(row.dataset.id);
    });
  });

  // Re-apply selection highlight if a quilt was previously selected
  if (selectedQuiltId) highlightSelectedRow();
}

function setQuiltSelection(id) {
  selectedQuiltId = id;
  highlightSelectedRow();
  const hasSelection = !!id;
  $('btn-quilt-modify').disabled = !hasSelection;
  $('btn-quilt-delete').disabled = !hasSelection;
}

function highlightSelectedRow() {
  $('quilt-list').querySelectorAll('.quilt-list-row').forEach(row => {
    const selected = row.dataset.id === selectedQuiltId;
    row.classList.toggle('selected', selected);
    row.setAttribute('aria-selected', selected);
  });
}

// ── Edit quilt ────────────────────────────────────────────────

function startEditQuilt(id) {
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
  $('quilt-form-title').textContent = 'Modify Quilt';
  show($('btn-show-qr'));
  show($('quilt-form-wrap'));
  $('quilt-form-wrap').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ── Delete quilt ──────────────────────────────────────────────

async function deleteQuilt(id, name) {
  const ok = await confirmDelete(`Delete quilt "${name}"? This cannot be undone.`);
  if (!ok) return;
  await sb.from('quilts').delete().eq('id', id);
  if (editingQuiltId === id) {
    hide($('quilt-form-wrap'));
    resetQuiltForm();
  }
  setQuiltSelection(null);
  loadQuilts();
}
