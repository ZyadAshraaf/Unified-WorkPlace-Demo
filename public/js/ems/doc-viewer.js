/* ═══════════════════════════════════════════════════════
   EMS — Document Viewer Component
   ═══════════════════════════════════════════════════════ */
const EMS_DocViewer = (() => {
  let currentDoc = null;

  /* ── Placement state ────────────────────────────────── */
  let placement = null; // { docId, sigId, imageData, x, y, width }
  let _dragState = null;

  /* ════════════════════════════════════════════════════
     Open / render
     ════════════════════════════════════════════════════ */
  async function open(docId, docTypes) {
    // Exit any active placement before switching documents
    cancelPlacement();

    const data = await API.get(`/api/ems/documents/${docId}`);
    if (!data?.success) return;
    currentDoc = data.document;

    document.getElementById('docListWrap')?.classList.add('d-none');
    document.getElementById('docViewerWrap')?.classList.remove('d-none');

    document.getElementById('viewerTitle').textContent = currentDoc.title;

    // Lock button
    const lockBtn = document.getElementById('btnViewerLock');
    if (lockBtn) {
      const isLocked = !!currentDoc.lockedBy;
      lockBtn.innerHTML = isLocked ? '<i class="bi bi-unlock"></i>' : '<i class="bi bi-lock"></i>';
      lockBtn.title     = isLocked ? 'Unlock' : 'Lock';
      lockBtn.onclick   = () => toggleLock(docId);
    }

    // Download
    document.getElementById('btnViewerDownload').onclick = () => {
      if (!currentDoc.versions?.length) return UI.toast('No file to download', 'warning');
      window.open(`/api/ems/documents/${docId}/versions/${currentDoc.currentVersion}/download`, '_blank');
    };

    // Sign — use onclick so repeated clicks work (addEventListener+once only fires once)
    const signBtn = document.getElementById('btnViewerSign');
    if (signBtn) signBtn.onclick = () => EMS_SignaturePad.openForDoc(docId);

    const wmBtn = document.getElementById('btnViewerWatermark');
    if (wmBtn) wmBtn.onclick = () => openWatermarkModal(docId);

    const verBtn = document.getElementById('btnViewerVersions');
    if (verBtn) verBtn.onclick = () => showVersionHistory(docId);

    renderPreview();
    renderWatermark();
    renderSignatures();
  }

  function renderPreview() {
    const body = document.getElementById('docViewerBody');
    if (!body || !currentDoc) return;

    if (!currentDoc.versions?.length) {
      body.innerHTML = '<div class="doc-viewer-placeholder"><i class="bi bi-file-earmark-x" style="font-size:4rem;opacity:.2;"></i><p class="mt-2 text-muted">No file uploaded yet</p></div>';
      return;
    }

    const latest = currentDoc.versions[currentDoc.versions.length - 1];
    const url    = `/${latest.storagePath}`;

    if (latest.mimeType === 'application/pdf') {
      body.innerHTML = `<iframe src="${url}" style="width:100%;height:100%;border:none;"></iframe>`;
    } else if (latest.mimeType?.startsWith('image/')) {
      body.innerHTML = `<img src="${url}" alt="${currentDoc.title}" style="max-width:100%;max-height:100%;object-fit:contain;">`;
    } else {
      body.innerHTML = `<div class="doc-viewer-placeholder">
        <i class="bi bi-file-earmark" style="font-size:4rem;opacity:.2;"></i>
        <p class="mt-2 text-muted">Preview not available for this file type</p>
        <button class="btn btn-sm btn-primary mt-2" onclick="window.open('${url}','_blank')"><i class="bi bi-download me-1"></i>Download to view</button>
      </div>`;
    }
  }

  /* ════════════════════════════════════════════════════
     Signature overlays (placed signatures)
     ════════════════════════════════════════════════════ */
  function renderSignatures() {
    // For PDFs: signatures are baked into the file by the server (pdf-lib),
    // so no overlay needed — the iframe shows them naturally.
    // For non-PDF files (images): render overlays as fallback.
    document.querySelectorAll('.sig-placed-overlay').forEach(el => el.remove());

    if (!currentDoc?.signatures?.length) return;

    const latestVer = currentDoc.versions?.[currentDoc.versions.length - 1];
    if (latestVer?.mimeType === 'application/pdf') return; // PDF: already in the file

    const body = document.getElementById('docViewerBody');
    currentDoc.signatures.forEach(sig => {
      if (sig.x == null) return;
      const el = document.createElement('div');
      el.className   = 'sig-placed-overlay';
      el.style.left  = sig.x + '%';
      el.style.top   = sig.y + '%';
      el.style.width = (sig.width || 20) + '%';
      el.innerHTML   = `
        <img src="${sig.imageData}" alt="Signature">
        <div class="sig-placed-meta">${sig.userName} &bull; ${UI.formatDate(sig.signedAt)}</div>`;
      body.appendChild(el);
    });
  }

  /* ════════════════════════════════════════════════════
     Signature placement mode
     ════════════════════════════════════════════════════ */
  function enterSignaturePlacementMode(docId, sigId, imageData) {
    // Wipe any previous ghost cleanly
    _removePlacementGhost();

    placement = { docId, sigId, imageData, x: 5, y: 70, width: 22 };

    document.getElementById('signPlacementBanner')?.classList.remove('d-none');
    _spawnGhost();
  }

  function _spawnGhost() {
    if (!placement) return;
    const body = document.getElementById('docViewerBody');
    if (!body) return;

    // Transparent intercept layer — sits above the PDF iframe so mouse events
    // aren't swallowed by the iframe while the user drags the signature ghost.
    const intercept = document.createElement('div');
    intercept.id    = 'sigDragIntercept';
    intercept.style.cssText = 'position:absolute;inset:0;z-index:25;cursor:grab;';
    body.appendChild(intercept);

    const ghost = document.createElement('div');
    ghost.id          = 'sigPlacementGhost';
    ghost.className   = 'sig-placement-ghost';
    ghost.style.left  = placement.x + '%';
    ghost.style.top   = placement.y + '%';
    ghost.style.width = placement.width + '%';
    ghost.innerHTML   = `
      <img src="${placement.imageData}" alt="Signature">
      <div class="sig-placement-ghost-hint"><i class="bi bi-arrows-move"></i> Drag to position</div>`;

    // Drag starts on either the ghost or the intercept layer
    intercept.addEventListener('mousedown', _onGhostMouseDown);
    ghost.addEventListener('mousedown', _onGhostMouseDown);

    body.appendChild(ghost);
  }

  function _onGhostMouseDown(e) {
    if (e.button !== 0) return;
    e.preventDefault();

    const body  = document.getElementById('docViewerBody');
    const ghost = document.getElementById('sigPlacementGhost');
    const bodyRect  = body.getBoundingClientRect();
    const ghostRect = ghost.getBoundingClientRect();

    // Offset of the click inside the ghost (so it doesn't jump to corner)
    const offsetX = e.clientX - ghostRect.left;
    const offsetY = e.clientY - ghostRect.top;

    _dragState = { offsetX, offsetY };
    const ic = document.getElementById('sigDragIntercept');
    if (ic) ic.style.cursor = 'grabbing';

    const onMove = e => {
      if (!_dragState) return;
      const body = document.getElementById('docViewerBody');
      const ghost = document.getElementById('sigPlacementGhost');
      if (!body || !ghost) return;

      const br    = body.getBoundingClientRect();
      const gw    = ghost.offsetWidth;
      const gh    = ghost.offsetHeight;

      let newLeft = e.clientX - br.left - _dragState.offsetX;
      let newTop  = e.clientY - br.top  - _dragState.offsetY;

      // Clamp so ghost stays fully inside the viewer
      newLeft = Math.max(0, Math.min(br.width  - gw, newLeft));
      newTop  = Math.max(0, Math.min(br.height - gh, newTop));

      const xPct = (newLeft / br.width)  * 100;
      const yPct = (newTop  / br.height) * 100;

      ghost.style.left = xPct + '%';
      ghost.style.top  = yPct + '%';
      placement.x = xPct;
      placement.y = yPct;
    };

    const onUp = () => {
      _dragState = null;
      const ic = document.getElementById('sigDragIntercept');
      if (ic) ic.style.cursor = 'grab';
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup',   onUp);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup',   onUp);
  }

  function _removePlacementGhost() {
    document.getElementById('sigPlacementGhost')?.remove();
    document.getElementById('sigDragIntercept')?.remove();
    _dragState = null;
  }

  async function confirmPlacement() {
    if (!placement) return;

    const data = await API.post(`/api/ems/documents/${placement.docId}/sign`, {
      signatureId: placement.sigId,
      x:           Math.round(placement.x     * 10) / 10,
      y:           Math.round(placement.y     * 10) / 10,
      width:       Math.round(placement.width * 10) / 10
    });

    if (data?.success) {
      UI.toast('Signature placed successfully', 'success');
      currentDoc = data.document;
      cancelPlacement(); // removes ghost + banner

      // Reload the PDF iframe so the baked-in signature becomes visible.
      // Remove + re-insert the iframe entirely — browsers ignore src changes
      // and query-string cache-busts for native PDF iframes.
      const body   = document.getElementById('docViewerBody');
      const iframe = body?.querySelector('iframe');
      if (iframe) {
        const newSrc = iframe.src.split('?')[0] + '?t=' + Date.now();
        iframe.remove();
        const fresh = document.createElement('iframe');
        fresh.src   = newSrc;
        fresh.style.cssText = 'width:100%;height:100%;border:none;';
        body.appendChild(fresh);
      }
    } else {
      UI.toast(data?.message || 'Failed to place signature', 'danger');
    }
  }

  function cancelPlacement() {
    _removePlacementGhost();
    placement = null;
    document.getElementById('signPlacementBanner')?.classList.add('d-none');
  }

  /* ════════════════════════════════════════════════════
     Watermark
     ════════════════════════════════════════════════════ */
  function renderWatermark() {
    const overlay = document.getElementById('watermarkOverlay');
    if (!overlay || !currentDoc) return;

    if (currentDoc.watermark?.enabled) {
      overlay.classList.remove('d-none');
      overlay.innerHTML = `<span class="watermark-text" style="opacity:${currentDoc.watermark.opacity};transform:rotate(${currentDoc.watermark.angle}deg);">${currentDoc.watermark.text}</span>`;
    } else {
      overlay.classList.add('d-none');
    }
  }

  function openWatermarkModal(docId) {
    if (!currentDoc) return;
    document.getElementById('watermarkEnabled').checked  = currentDoc.watermark?.enabled || false;
    document.getElementById('watermarkText').value       = currentDoc.watermark?.text    || 'CONFIDENTIAL';
    document.getElementById('watermarkOpacity').value    = (currentDoc.watermark?.opacity || 0.15) * 100;
    document.getElementById('watermarkOpacityVal').textContent = Math.round((currentDoc.watermark?.opacity || 0.15) * 100);
    document.getElementById('watermarkAngle').value      = currentDoc.watermark?.angle   || -30;
    document.getElementById('watermarkAngleVal').textContent   = currentDoc.watermark?.angle || -30;

    document.getElementById('watermarkOpacity').oninput = function () {
      document.getElementById('watermarkOpacityVal').textContent = this.value;
    };
    document.getElementById('watermarkAngle').oninput = function () {
      document.getElementById('watermarkAngleVal').textContent = this.value;
    };

    document.getElementById('btnSaveWatermark').onclick = async () => {
      const wm = {
        enabled: document.getElementById('watermarkEnabled').checked,
        text:    document.getElementById('watermarkText').value,
        opacity: parseInt(document.getElementById('watermarkOpacity').value) / 100,
        angle:   parseInt(document.getElementById('watermarkAngle').value)
      };
      const data = await API.put(`/api/ems/documents/${docId}/watermark`, wm);
      if (data?.success) {
        currentDoc = data.document;
        renderWatermark();
        UI.toast('Watermark updated');
      }
      bootstrap.Modal.getOrCreateInstance(document.getElementById('watermarkModal')).hide();
    };

    bootstrap.Modal.getOrCreateInstance(document.getElementById('watermarkModal')).show();
  }

  /* ════════════════════════════════════════════════════
     Version history
     ════════════════════════════════════════════════════ */
  async function showVersionHistory(docId) {
    const data = await API.get(`/api/ems/documents/${docId}`);
    if (!data?.success) return;
    const doc = data.document;

    document.getElementById('versionHistoryBody').innerHTML = doc.versions
      .slice().reverse()
      .map(v => `
        <div class="version-item">
          <div class="version-number">${v.version}</div>
          <div class="version-info">
            <div class="version-filename">${v.filename}</div>
            <div class="version-meta">
              ${UI.formatDate(v.uploadedAt)} &bull; ${(v.size / 1024).toFixed(1)} KB &bull; by ${v.uploadedBy}
            </div>
            ${v.notes ? `<div class="version-meta mt-1"><i class="bi bi-chat-left-text me-1"></i>${v.notes}</div>` : ''}
          </div>
          <button class="btn btn-sm btn-outline-primary" onclick="window.open('/api/ems/documents/${docId}/versions/${v.version}/download','_blank')">
            <i class="bi bi-download"></i>
          </button>
        </div>
      `).join('');

    bootstrap.Modal.getOrCreateInstance(document.getElementById('versionHistoryModal')).show();
  }

  /* ════════════════════════════════════════════════════
     Lock / Unlock
     ════════════════════════════════════════════════════ */
  async function toggleLock(docId) {
    if (!currentDoc) return;
    const endpoint = currentDoc.lockedBy ? 'unlock' : 'lock';
    const data     = await API.post(`/api/ems/documents/${docId}/${endpoint}`);
    if (data?.success) {
      currentDoc = data.document;
      const lockBtn = document.getElementById('btnViewerLock');
      const isLocked = !!currentDoc.lockedBy;
      lockBtn.innerHTML = isLocked ? '<i class="bi bi-unlock"></i>' : '<i class="bi bi-lock"></i>';
      lockBtn.title     = isLocked ? 'Unlock' : 'Lock';
      UI.toast(isLocked ? 'Document locked' : 'Document unlocked');
    } else {
      UI.toast(data?.message || 'Action failed', 'danger');
    }
  }

  return { open, renderPreview, renderWatermark, enterSignaturePlacementMode, confirmPlacement, cancelPlacement };
})();
