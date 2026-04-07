/* ═══════════════════════════════════════════════════════
   EMS — Document Viewer Component
   ═══════════════════════════════════════════════════════ */
const EMS_DocViewer = (() => {
  let currentDoc = null;

  async function open(docId, docTypes) {
    const data = await API.get(`/api/ems/documents/${docId}`);
    if (!data?.success) return;
    currentDoc = data.document;

    // Switch view
    document.getElementById('docListWrap')?.classList.add('d-none');
    document.getElementById('docViewerWrap')?.classList.remove('d-none');

    // Title
    document.getElementById('viewerTitle').textContent = currentDoc.title;

    // Lock button state
    const lockBtn = document.getElementById('btnViewerLock');
    if (lockBtn) {
      const isLocked = !!currentDoc.lockedBy;
      lockBtn.innerHTML = isLocked ? '<i class="bi bi-unlock"></i>' : '<i class="bi bi-lock"></i>';
      lockBtn.title = isLocked ? 'Unlock' : 'Lock';
      lockBtn.onclick = () => toggleLock(docId);
    }

    // Download
    document.getElementById('btnViewerDownload').onclick = () => {
      if (!currentDoc.versions?.length) return UI.toast('No file to download', 'warning');
      window.open(`/api/ems/documents/${docId}/versions/${currentDoc.currentVersion}/download`, '_blank');
    };

    // Sign button
    document.getElementById('btnViewerSign')?.addEventListener('click', () => EMS_SignaturePad.openForDoc(docId), { once: true });

    // Watermark button
    document.getElementById('btnViewerWatermark')?.addEventListener('click', () => openWatermarkModal(docId), { once: true });

    // Versions button
    document.getElementById('btnViewerVersions')?.addEventListener('click', () => showVersionHistory(docId), { once: true });

    // Render preview
    renderPreview();
    renderWatermark();
  }

  function renderPreview() {
    const body = document.getElementById('docViewerBody');
    if (!body || !currentDoc) return;

    if (!currentDoc.versions?.length) {
      body.innerHTML = '<div class="doc-viewer-placeholder"><i class="bi bi-file-earmark-x" style="font-size:4rem;opacity:.2;"></i><p class="mt-2 text-muted">No file uploaded yet</p></div>';
      return;
    }

    const latest = currentDoc.versions[currentDoc.versions.length - 1];
    const url = `/${latest.storagePath}`;

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
    document.getElementById('watermarkEnabled').checked = currentDoc.watermark?.enabled || false;
    document.getElementById('watermarkText').value = currentDoc.watermark?.text || 'CONFIDENTIAL';
    document.getElementById('watermarkOpacity').value = (currentDoc.watermark?.opacity || 0.15) * 100;
    document.getElementById('watermarkOpacityVal').textContent = Math.round((currentDoc.watermark?.opacity || 0.15) * 100);
    document.getElementById('watermarkAngle').value = currentDoc.watermark?.angle || -30;
    document.getElementById('watermarkAngleVal').textContent = currentDoc.watermark?.angle || -30;

    document.getElementById('watermarkOpacity').oninput = function() {
      document.getElementById('watermarkOpacityVal').textContent = this.value;
    };
    document.getElementById('watermarkAngle').oninput = function() {
      document.getElementById('watermarkAngleVal').textContent = this.value;
    };

    document.getElementById('btnSaveWatermark').onclick = async () => {
      const wm = {
        enabled: document.getElementById('watermarkEnabled').checked,
        text: document.getElementById('watermarkText').value,
        opacity: parseInt(document.getElementById('watermarkOpacity').value) / 100,
        angle: parseInt(document.getElementById('watermarkAngle').value)
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

  async function toggleLock(docId) {
    if (!currentDoc) return;
    const endpoint = currentDoc.lockedBy ? 'unlock' : 'lock';
    const data = await API.post(`/api/ems/documents/${docId}/${endpoint}`);
    if (data?.success) {
      currentDoc = data.document;
      const lockBtn = document.getElementById('btnViewerLock');
      const isLocked = !!currentDoc.lockedBy;
      lockBtn.innerHTML = isLocked ? '<i class="bi bi-unlock"></i>' : '<i class="bi bi-lock"></i>';
      lockBtn.title = isLocked ? 'Unlock' : 'Lock';
      UI.toast(isLocked ? 'Document locked' : 'Document unlocked');
    } else {
      UI.toast(data?.message || 'Action failed', 'danger');
    }
  }

  return { open, renderPreview, renderWatermark };
})();
