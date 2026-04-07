/* ═══════════════════════════════════════════════════════
   EMS — Signature Pad Component
   ═══════════════════════════════════════════════════════ */
const EMS_SignaturePad = (() => {
  let canvas, ctx;
  let drawing = false;
  let paths = []; // Array of path arrays for undo
  let currentPath = [];
  let savedSignatures = [];
  let selectedSavedId = null;
  let targetDocId = null;

  function initCanvas() {
    canvas = document.getElementById('signatureCanvas');
    if (!canvas) return;
    ctx = canvas.getContext('2d');

    // Scale for high-DPI
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * 2;
    canvas.height = 200 * 2;
    canvas.style.height = '200px';
    ctx.scale(2, 2);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    clearCanvas();

    canvas.addEventListener('mousedown', startDraw);
    canvas.addEventListener('mousemove', draw);
    canvas.addEventListener('mouseup', endDraw);
    canvas.addEventListener('mouseleave', endDraw);

    // Touch support
    canvas.addEventListener('touchstart', (e) => { e.preventDefault(); startDraw(touchToMouse(e)); });
    canvas.addEventListener('touchmove', (e) => { e.preventDefault(); draw(touchToMouse(e)); });
    canvas.addEventListener('touchend', (e) => { e.preventDefault(); endDraw(); });

    // Controls
    document.getElementById('btnSignClear')?.addEventListener('click', clearCanvas);
    document.getElementById('btnSignUndo')?.addEventListener('click', undo);
    document.getElementById('btnSaveSignature')?.addEventListener('click', saveSignature);
    document.getElementById('btnApplySignature')?.addEventListener('click', applySignature);

    // Tab switching
    document.querySelectorAll('#signTabs .nav-link').forEach(tab => {
      tab.addEventListener('click', (e) => {
        e.preventDefault();
        document.querySelectorAll('#signTabs .nav-link').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        const target = tab.dataset.signtab;
        document.getElementById('signDrawTab').classList.toggle('d-none', target !== 'draw');
        document.getElementById('signSavedTab').classList.toggle('d-none', target !== 'saved');
      });
    });
  }

  function touchToMouse(e) {
    const touch = e.touches[0];
    const rect = canvas.getBoundingClientRect();
    return { offsetX: touch.clientX - rect.left, offsetY: touch.clientY - rect.top };
  }

  function getColor() { return document.getElementById('signColor')?.value || '#000000'; }
  function getThickness() { return parseInt(document.getElementById('signThickness')?.value || '3'); }

  function startDraw(e) {
    drawing = true;
    currentPath = [{ x: e.offsetX, y: e.offsetY, color: getColor(), thickness: getThickness() }];
    ctx.beginPath();
    ctx.moveTo(e.offsetX, e.offsetY);
    ctx.strokeStyle = getColor();
    ctx.lineWidth = getThickness();
  }

  function draw(e) {
    if (!drawing) return;
    currentPath.push({ x: e.offsetX, y: e.offsetY });
    ctx.lineTo(e.offsetX, e.offsetY);
    ctx.stroke();
  }

  function endDraw() {
    if (!drawing) return;
    drawing = false;
    if (currentPath.length > 1) paths.push([...currentPath]);
    currentPath = [];
  }

  function clearCanvas() {
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, 200);
    paths = [];
    currentPath = [];
  }

  function undo() {
    if (!paths.length) return;
    paths.pop();
    redraw();
  }

  function redraw() {
    const rect = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, 200);
    paths.forEach(pathArr => {
      if (pathArr.length < 2) return;
      ctx.beginPath();
      ctx.strokeStyle = pathArr[0].color;
      ctx.lineWidth = pathArr[0].thickness;
      ctx.moveTo(pathArr[0].x, pathArr[0].y);
      for (let i = 1; i < pathArr.length; i++) {
        ctx.lineTo(pathArr[i].x, pathArr[i].y);
      }
      ctx.stroke();
    });
  }

  function getCanvasData() {
    // Scale back to 1x for export
    const tmpCanvas = document.createElement('canvas');
    const rect = canvas.getBoundingClientRect();
    tmpCanvas.width = rect.width;
    tmpCanvas.height = 200;
    const tmpCtx = tmpCanvas.getContext('2d');
    tmpCtx.drawImage(canvas, 0, 0, tmpCanvas.width, tmpCanvas.height);
    return tmpCanvas.toDataURL('image/png');
  }

  async function saveSignature() {
    if (!paths.length) return UI.toast('Please draw a signature first', 'warning');
    const name = prompt('Name this signature:', 'My Signature');
    if (!name) return;
    const imageData = getCanvasData();
    const data = await API.post('/api/ems/signatures', { name, imageData, type: 'drawn' });
    if (data?.success) {
      UI.toast('Signature saved');
      await loadSaved();
    }
  }

  async function loadSaved() {
    const data = await API.get('/api/ems/signatures');
    if (data?.success) {
      savedSignatures = data.signatures;
      renderSaved();
    }
  }

  function renderSaved() {
    const container = document.getElementById('savedSignaturesList');
    const empty = document.getElementById('noSavedSignatures');
    if (!container) return;

    if (!savedSignatures.length) {
      container.innerHTML = '';
      empty?.classList.remove('d-none');
      return;
    }
    empty?.classList.add('d-none');

    container.innerHTML = savedSignatures.map(s => `
      <div class="col-md-4">
        <div class="saved-sig-card ${selectedSavedId === s.id ? 'selected' : ''}" data-sig-id="${s.id}">
          <img src="${s.imageData}" alt="${s.name}">
          <div class="sig-name">${s.name}</div>
          <button class="btn btn-sm btn-link text-danger p-0 mt-1" onclick="event.stopPropagation(); EMS_SignaturePad.deleteSaved('${s.id}')">
            <i class="bi bi-trash3"></i>
          </button>
        </div>
      </div>
    `).join('');

    container.querySelectorAll('.saved-sig-card').forEach(card => {
      card.addEventListener('click', () => {
        selectedSavedId = card.dataset.sigId;
        container.querySelectorAll('.saved-sig-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
      });
    });
  }

  async function deleteSaved(sigId) {
    if (!confirm('Delete this saved signature?')) return;
    await API.del(`/api/ems/signatures/${sigId}`);
    await loadSaved();
  }

  async function applySignature() {
    if (!targetDocId) return;

    // Check if using drawn or saved
    const activeTab = document.querySelector('#signTabs .nav-link.active')?.dataset.signtab;

    let sigId;
    if (activeTab === 'saved' && selectedSavedId) {
      sigId = selectedSavedId;
    } else if (activeTab === 'draw' && paths.length) {
      // Save signature first, then apply
      const imageData = getCanvasData();
      const saveData = await API.post('/api/ems/signatures', { name: 'Quick Sign', imageData, type: 'drawn' });
      if (!saveData?.success) return UI.toast('Failed to save signature', 'danger');
      sigId = saveData.signature.id;
    } else {
      return UI.toast('Please draw or select a signature', 'warning');
    }

    const data = await API.post(`/api/ems/documents/${targetDocId}/sign`, { signatureId: sigId });
    if (data?.success) {
      UI.toast('Signature applied');
      bootstrap.Modal.getOrCreateInstance(document.getElementById('signatureModal')).hide();
    } else {
      UI.toast(data?.message || 'Failed to apply signature', 'danger');
    }
  }

  function openForDoc(docId) {
    targetDocId = docId;
    selectedSavedId = null;
    clearCanvas();
    initCanvas();
    loadSaved();
    bootstrap.Modal.getOrCreateInstance(document.getElementById('signatureModal')).show();
  }

  return { openForDoc, deleteSaved };
})();
