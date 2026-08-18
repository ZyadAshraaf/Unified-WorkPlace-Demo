/* ── Invoice Validator Controller ─────────────────────────────
   Talks directly to the external PO Invoice Validator API
   (invoicematchingai-...herokuapp.com) via fetch + FormData.
   The PO / vendor fields are cosmetic — the backend always
   matches against its single fixed purchase order.
   ─────────────────────────────────────────────────────────── */

const INVOICE_API_URL = 'https://invoicematchingai-5aef4363adb6.herokuapp.com/api/validate-invoice';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

let selectedFile   = null;
let filePreviewUrl = null;
let lastResult      = null;
let lastFileName    = '';
let _loadingStepInterval  = null;
let _loadingProgressTimer = null;
let emailTouched = false;

document.addEventListener('DOMContentLoaded', async () => {
  await Layout.init('invoice-matcher');
  setRequestDate();
  bindEvents();
});

function setRequestDate() {
  const el = document.getElementById('requestDate');
  const d  = new Date();
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  el.value = `${dd}/${mm}/${yyyy}`;
}

/* ════════════════════════════════════════════════════════════
   Form validation
   ════════════════════════════════════════════════════════════ */
function isFormValid() {
  const email = document.getElementById('vendorEmail').value.trim();
  const po    = document.getElementById('poSelect').value;
  return !!selectedFile && !!po && EMAIL_RE.test(email);
}

function validateEmailField() {
  const input = document.getElementById('vendorEmail');
  const error = document.getElementById('vendorEmailError');
  const val   = input.value.trim();
  const bad   = emailTouched && val.length > 0 && !EMAIL_RE.test(val);
  input.classList.toggle('is-invalid-soft', bad);
  error.classList.toggle('show', bad);
}

function updateValidateBtn() {
  document.getElementById('btnValidate').disabled = !isFormValid();
}

/* ════════════════════════════════════════════════════════════
   File upload
   ════════════════════════════════════════════════════════════ */
function handleFile(file) {
  if (!file) return;
  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  if (!isPdf) { UI.toast('Only PDF files are accepted', 'warning'); return; }
  selectedFile = file;
  if (filePreviewUrl) { URL.revokeObjectURL(filePreviewUrl); filePreviewUrl = null; }
  renderFileChip();
  updateValidateBtn();
}

function renderFileChip() {
  const wrap = document.getElementById('fileChipWrap');
  const zone = document.getElementById('uploadZone');
  if (!selectedFile) { wrap.innerHTML = ''; zone.classList.remove('d-none'); return; }
  zone.classList.add('d-none');
  wrap.innerHTML = `
    <div class="file-chip">
      <i class="bi bi-file-earmark-pdf file-chip-icon"></i>
      <div class="file-chip-body">
        <div class="file-chip-name" title="${escHtml(selectedFile.name)}">${escHtml(selectedFile.name)}</div>
        <div class="file-chip-meta"><span>${formatBytes(selectedFile.size)}</span><span>&middot;</span><span>Ready for validation</span></div>
      </div>
      <div class="file-chip-actions">
        <button class="file-chip-btn" id="btnPreviewFile" title="Preview PDF"><i class="bi bi-eye"></i></button>
        <button class="file-chip-btn danger" id="btnRemoveFile" title="Remove"><i class="bi bi-x-lg"></i></button>
      </div>
    </div>`;
  document.getElementById('btnRemoveFile').addEventListener('click', () => {
    selectedFile = null;
    if (filePreviewUrl) { URL.revokeObjectURL(filePreviewUrl); filePreviewUrl = null; }
    document.getElementById('fileInput').value = '';
    renderFileChip();
    updateValidateBtn();
  });
  document.getElementById('btnPreviewFile').addEventListener('click', () => {
    if (!filePreviewUrl) filePreviewUrl = URL.createObjectURL(selectedFile);
    window.open(filePreviewUrl, '_blank');
  });
}

/* ════════════════════════════════════════════════════════════
   View state switching
   ════════════════════════════════════════════════════════════ */
function showState(state) {
  const idle    = document.getElementById('stateIdle');
  const loading = document.getElementById('stateLoading');
  const results = document.getElementById('stateResults');

  idle.classList.toggle('d-none', state !== 'idle');
  loading.classList.toggle('d-none', state !== 'loading');
  results.classList.toggle('d-none', state !== 'results');

  [idle, loading, results].forEach(el => el.classList.remove('fade-in-up'));
  const active = state === 'idle' ? idle : state === 'loading' ? loading : results;
  void active.offsetWidth; // restart animation
  active.classList.add('fade-in-up');

  if (state === 'loading') { startLoadingStepCycle(); startLoadingProgress(); }
  else { stopLoadingStepCycle(); stopLoadingProgress(); }
}

function startLoadingStepCycle() {
  const steps = document.querySelectorAll('#stateLoading .ai-loading-step');
  let current = 0;
  steps.forEach((s, i) => { s.classList.toggle('active', i === 0); s.classList.remove('done'); });
  _loadingStepInterval = setInterval(() => {
    if (current >= steps.length - 1) {
      clearInterval(_loadingStepInterval);
      _loadingStepInterval = null;
      return;
    }
    steps[current].classList.remove('active');
    steps[current].classList.add('done');
    current++;
    steps[current].classList.add('active');
  }, 1800);
}

function stopLoadingStepCycle() {
  if (_loadingStepInterval) { clearInterval(_loadingStepInterval); _loadingStepInterval = null; }
  document.querySelectorAll('#stateLoading .ai-loading-step').forEach((s, i) => {
    s.classList.toggle('active', i === 0);
    s.classList.remove('done');
  });
}

/* Progress bar eases toward ~92% over the expected 5-8s window, then
   the actual response snaps it to 100% — never lies about being done
   before the network call actually resolves. */
function startLoadingProgress() {
  const fill = document.getElementById('loadingProgressFill');
  const start = Date.now();
  const estimatedMs = 6500;
  fill.style.width = '0%';
  _loadingProgressTimer = setInterval(() => {
    const elapsed = Date.now() - start;
    const pct = Math.min(92, (elapsed / estimatedMs) * 92);
    fill.style.width = pct + '%';
  }, 120);
}

function stopLoadingProgress() {
  if (_loadingProgressTimer) { clearInterval(_loadingProgressTimer); _loadingProgressTimer = null; }
  const fill = document.getElementById('loadingProgressFill');
  if (fill) fill.style.width = '100%';
}

/* ════════════════════════════════════════════════════════════
   Validate invoice
   ════════════════════════════════════════════════════════════ */
async function validateInvoice() {
  if (!selectedFile) return;

  lastFileName = selectedFile.name;
  showState('loading');

  const fd = new FormData();
  fd.append('file', selectedFile);

  try {
    const res = await fetch(INVOICE_API_URL, { method: 'POST', body: fd });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    const data = await res.json();
    lastResult = data;
    renderResults(data);
    showState('results');
    document.getElementById('stateResults').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (e) {
    UI.toast('Validation failed: ' + e.message, 'danger');
    showState('idle');
  }
}

/* ════════════════════════════════════════════════════════════
   Outcome → presentation config (mirrors the reference app's
   business logic, restyled with our own visual language)
   ════════════════════════════════════════════════════════════ */
const OUTCOME_CONFIG = {
  full_match: {
    severity: 'success', icon: 'bi-patch-check-fill',
    title: 'Invoice Fully Validated',
    sub: 'All parts validated successfully against the purchase order.',
    reasonRequired: false, blocked: false, submitLabel: 'Submit Invoice'
  },
  partial_match: {
    severity: 'success', icon: 'bi-check-circle-fill',
    title: 'Invoice Partially Validated',
    sub: 'Invoice items are fully correct, but some PO items are missing (partial invoice).',
    reasonRequired: true, blocked: false, submitLabel: 'Submit Anyway'
  },
  partial_rejected: {
    severity: 'warning', icon: 'bi-exclamation-triangle-fill',
    title: 'Invoice Partially Rejected',
    sub: 'Some line items have been rejected. Please review the highlighted parts below.',
    reasonRequired: true, blocked: false, submitLabel: 'Submit Anyway'
  },
  wrong_currency: {
    severity: 'danger', icon: 'bi-currency-exchange',
    title: 'Currency Mismatch',
    sub: 'The invoice currency does not match the purchase order currency. All line items have been rejected.',
    reasonRequired: true, blocked: false, submitLabel: 'Submit Anyway'
  },
  full_rejected: {
    severity: 'danger', icon: 'bi-x-octagon-fill',
    title: 'Invoice Fully Rejected',
    sub: 'All line items in this invoice have been rejected. Please review and resubmit.',
    reasonRequired: false, blocked: true
  },
  wrong_po: {
    severity: 'danger', icon: 'bi-search',
    title: 'Purchase Order Not Found',
    sub: null, // uses po_not_found_message
    reasonRequired: false, blocked: true
  }
};

/* ════════════════════════════════════════════════════════════
   Rendering
   ════════════════════════════════════════════════════════════ */
function renderResults(data) {
  const cfg = OUTCOME_CONFIG[data.outcome] || OUTCOME_CONFIG.full_rejected;

  document.getElementById('resPoNumber').textContent = data.po_number_extracted || '--';

  const lines = data.line_item_results || [];
  const total    = lines.length;
  const approved = lines.filter(l => l.status === 'approved').length;
  const rejected = lines.filter(l => l.status === 'rejected').length;

  document.getElementById('statApproved').textContent = approved;
  document.getElementById('statRejected').textContent = rejected;

  const approvedPct = total ? (approved / total) * 100 : 0;
  const rejectedPct = total ? (rejected / total) * 100 : 0;
  document.getElementById('progressSegApproved').style.width = approvedPct + '%';
  document.getElementById('progressSegRejected').style.width = rejectedPct + '%';
  document.getElementById('progressLabel').textContent =
    data.outcome === 'wrong_po' ? 'Purchase order could not be located' : `${approved} of ${total} line items validated`;

  renderHeaderPanel(data, cfg);
  renderLineItems(data, cfg);
  renderOutcomeBanner(data, cfg);
}

function fieldStatusIcon(status) {
  if (status === 'approved') return '<i class="bi bi-check-circle-fill compare-icon approved"></i>';
  if (status === 'rejected') return '<i class="bi bi-x-circle-fill compare-icon rejected"></i>';
  if (status === 'missing')  return '<i class="bi bi-dash-circle compare-icon missing"></i>';
  return '<span class="compare-icon"></span>';
}

function buildCompareRows(fields) {
  return (fields || []).map(f => {
    const poNa   = f.db_value === null || f.db_value === undefined || f.db_value === '';
    const poCell = poNa ? '<span class="compare-po na">N/A</span>' : `<span class="compare-po">${escHtml(String(f.db_value))}</span>`;
    const invCell = `<span class="compare-invoice">${escHtml(String(f.invoice_value ?? '--'))}</span>`;
    const stClass = f.status === 'rejected' ? 'st-rejected' : f.status === 'approved' ? 'st-approved' : f.status === 'missing' ? 'st-missing' : '';
    const reasonHtml = f.reason ? `<div class="compare-reason"><i class="bi bi-info-circle"></i>${escHtml(f.reason)}</div>` : '';
    return `
      <div class="compare-row ${stClass}">
        <div class="compare-label">${escHtml(f.display_name)}</div>
        ${poCell}
        <i class="bi bi-arrow-right compare-arrow"></i>
        ${invCell}
        ${fieldStatusIcon(f.status)}
        ${reasonHtml}
      </div>`;
  }).join('');
}

function renderHeaderPanel(data, cfg) {
  const badge = document.getElementById('headerBadge');
  const body  = document.getElementById('headerBody');

  if (data.outcome === 'wrong_po') {
    badge.textContent = 'PO Not Found';
    badge.className   = 'match-panel-badge notfound';
  } else {
    const headerRejected = (data.header_fields || []).some(f => f.status === 'rejected');
    badge.textContent = headerRejected ? 'Rejected' : 'Matching';
    badge.className   = 'match-panel-badge ' + (headerRejected ? 'rejected' : 'matching');
  }

  let html = '';
  if (data.po_not_found_message) {
    html += `<div class="match-alert"><i class="bi bi-exclamation-triangle-fill"></i><span>${escHtml(data.po_not_found_message)}</span></div>`;
  }

  html += `
    <div class="compare-list">
      <div class="compare-head-row"><span>Field</span><span>Purchase Order</span><span></span><span>Invoice</span><span></span></div>
      ${buildCompareRows(data.header_fields)}
    </div>`;

  body.innerHTML = html;
}

function renderLineItems(data, cfg) {
  const badge = document.getElementById('linesBadge');
  const body  = document.getElementById('lineItemsBody');
  const lines = data.line_item_results || [];

  const rejectedCount = lines.filter(l => l.status === 'rejected').length;

  if (data.outcome === 'wrong_po') {
    badge.textContent = 'N/A';
    badge.className   = 'match-panel-badge notfound';
  } else if (rejectedCount > 0) {
    badge.textContent = `${rejectedCount} Line(s) Rejected`;
    badge.className   = 'match-panel-badge rejected';
  } else {
    badge.textContent = 'All Validated';
    badge.className   = 'match-panel-badge matching';
  }

  if (!lines.length) {
    body.innerHTML = '<div class="text-muted" style="font-size:13px;padding:8px 0">No line items returned.</div>';
    return;
  }

  body.innerHTML = lines.map((li, idx) => buildLineItemHtml(li, idx)).join('');

  body.querySelectorAll('.line-item-head').forEach(headEl => {
    headEl.addEventListener('click', () => toggleLineItem(headEl.closest('.line-item')));
  });
}

function toggleLineItem(itemEl) {
  const outer = itemEl.querySelector('.line-item-body-outer');
  const isOpen = itemEl.classList.contains('open');
  if (isOpen) {
    outer.style.maxHeight = '0px';
    itemEl.classList.remove('open');
  } else {
    itemEl.classList.add('open');
    outer.style.maxHeight = outer.scrollHeight + 'px';
  }
}

const LINE_STATUS_ICON = { approved: 'bi-check-circle-fill', rejected: 'bi-x-circle-fill', missing: 'bi-dash-circle' };
const LINE_STATUS_LABEL = { approved: 'Validated', rejected: 'Rejected', missing: 'N/A' };

function buildLineItemHtml(li, idx) {
  const statusClass = { approved: 'st-approved', rejected: 'st-rejected', missing: 'st-missing' }[li.status] || '';
  const statusLabel = LINE_STATUS_LABEL[li.status] || (li.status || '--');
  const statusIcon  = LINE_STATUS_ICON[li.status] || 'bi-question-circle';

  return `
    <div class="line-item">
      <div class="line-item-head ${statusClass}">
        <i class="bi ${statusIcon} line-item-status-icon"></i>
        <i class="bi bi-chevron-right line-item-chevron"></i>
        <span class="line-item-num">Line ${escHtml(li.line_num || String(idx + 1))}</span>
        <span class="line-item-title">Part ${escHtml(li.part || '--')}</span>
        ${li.reason ? `<span class="line-item-reason" title="${escHtml(li.reason)}">${escHtml(li.reason)}</span>` : ''}
        <span class="line-item-status">${statusLabel}</span>
      </div>
      <div class="line-item-body-outer">
        <div class="line-item-body">
          <div class="compare-list">
            <div class="compare-head-row"><span>Field</span><span>Purchase Order</span><span></span><span>Invoice</span><span></span></div>
            ${buildCompareRows(li.fields)}
          </div>
        </div>
      </div>
    </div>`;
}

/* Collect the distinct rejection reasons across header + line-item fields,
   grouping the locations each reason affects. Line-item reasons live at
   field level for partial rejects, so we scan both levels. */
function collectInvoiceIssues(headerFields, lineItems) {
  const map = new Map(); // reason -> Set(location labels)
  const add = (reason, loc) => {
    if (!reason) return;
    const r = String(reason).trim();
    if (!r) return;
    if (!map.has(r)) map.set(r, new Set());
    if (loc) map.get(r).add(loc);
  };
  (headerFields || []).forEach(f => { if (f.status === 'rejected') add(f.reason, f.display_name); });
  (lineItems || []).forEach(li => {
    if (li.status !== 'rejected') return;
    const loc = `Line ${li.line_num || ''}`.trim();
    let matched = false;
    (li.fields || []).forEach(f => { if (f.status === 'rejected' && f.reason) { add(f.reason, loc); matched = true; } });
    if (li.reason) { add(li.reason, loc); matched = true; }
    if (!matched) add('Line item does not match the purchase order', loc);
  });
  return [...map.entries()].map(([reason, locs]) => ({ reason, locations: [...locs] }));
}

function formatIssueLocations(locs) {
  if (!locs.length) return '';
  if (locs.length <= 4) return locs.join(' · ');
  return locs.slice(0, 4).join(' · ') + ` · +${locs.length - 4} more`;
}

function buildIssuesList(data) {
  const issues = collectInvoiceIssues(data.header_fields, data.line_item_results);
  if (!issues.length) return '';
  const rows = issues.map(is => `
    <div class="outcome-issue">
      <i class="bi bi-exclamation-triangle-fill outcome-issue-ic"></i>
      <div class="outcome-issue-body">
        <div class="outcome-issue-reason">${escHtml(is.reason)}</div>
        ${is.locations.length ? `<div class="outcome-issue-loc">${escHtml(formatIssueLocations(is.locations))}</div>` : ''}
      </div>
    </div>`).join('');
  return `<div class="outcome-issues"><div class="outcome-issues-head">Issues found (${issues.length})</div>${rows}</div>`;
}

function renderOutcomeBanner(data, cfg) {
  const wrap = document.getElementById('outcomeBannerWrap');
  const sub  = data.po_not_found_message || cfg.sub || '';
  const issuesHtml = buildIssuesList(data);

  let html = `
    <div class="outcome-banner ${cfg.severity}">
      <div class="outcome-banner-icon"><i class="bi ${cfg.icon}"></i></div>
      <div class="outcome-banner-body">
        <div class="outcome-banner-title">${escHtml(cfg.title)}</div>
        <p class="outcome-banner-sub">${escHtml(sub)}</p>
        ${issuesHtml}`;

  if (!cfg.blocked) {
    if (cfg.reasonRequired) {
      html += `
        <div class="outcome-reason-label">Reason for submitting with issues</div>
        <textarea class="form-control" id="reasonInput" rows="2" placeholder="Enter at least 3 characters..."></textarea>
        <div class="mt-3">
          <button class="btn-ai" id="btnSubmit" style="width:auto;padding:11px 26px" disabled>
            <i class="bi bi-send-check me-2"></i>${escHtml(cfg.submitLabel)}
          </button>
        </div>`;
    } else {
      html += `
        <div class="mt-3">
          <button class="btn-ai" id="btnSubmit" style="width:auto;padding:11px 26px">
            <i class="bi bi-send-check me-2"></i>${escHtml(cfg.submitLabel)}
          </button>
        </div>`;
    }
  }

  html += `<div id="approvalBoxWrap"></div></div></div>`;
  wrap.innerHTML = html;

  if (cfg.blocked) return;

  const submitBtn = document.getElementById('btnSubmit');

  if (cfg.reasonRequired) {
    const reasonInput = document.getElementById('reasonInput');
    reasonInput.addEventListener('input', () => {
      submitBtn.disabled = reasonInput.value.trim().length < 3;
    });
  }

  submitBtn.addEventListener('click', async () => {
    const originalLabel = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm" style="width:14px;height:14px"></span>';

    const reasonEl = document.getElementById('reasonInput');
    // Multipart: the PDF is sent along so the backend can archive it into the CMS Invoices folder
    const fd = new FormData();
    if (selectedFile) fd.append('file', selectedFile);
    fd.append('outcome',           data.outcome || '');
    fd.append('headerFields',      JSON.stringify(data.header_fields     || []));
    fd.append('lineItemResults',   JSON.stringify(data.line_item_results || []));
    fd.append('poNumberExtracted', data.po_number_extracted || '');
    fd.append('approvalNumber',    data.approval_number     || '');
    fd.append('poNotFoundMessage', data.po_not_found_message || '');
    fd.append('vendorEmail',       document.getElementById('vendorEmail').value.trim());
    fd.append('poNumber',          document.getElementById('poSelect').value);
    fd.append('fileName',          lastFileName);
    fd.append('reason',            reasonEl ? reasonEl.value.trim() : '');

    let resp = null;
    try {
      const r = await fetch('/unifiedwp/api/invoices', { method: 'POST', body: fd, credentials: 'include' });
      if (r.status === 401) { window.location.href = '/unifiedwp/login'; return; }
      resp = await r.json();
    } catch (e) { resp = null; }

    if (!resp?.success) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalLabel;
      UI.toast(resp?.message || 'Could not submit invoice for approval', 'danger');
      return;
    }

    const approvalWrap = document.getElementById('approvalBoxWrap');
    approvalWrap.innerHTML = `
      <div class="outcome-approval-box">
        <div>
          <div class="outcome-approval-label">Reference Number</div>
          <div class="outcome-approval-value" id="approvalValue">${escHtml(resp.invoice.invoiceNumber || data.approval_number || '--')}</div>
        </div>
        <button class="btn-copy-approval" id="btnCopyApproval"><i class="bi bi-clipboard"></i>Copy</button>
      </div>
      <div class="match-alert" style="margin-top:14px;margin-bottom:0;background:var(--color-primary-faint);color:var(--color-text)">
        <i class="bi bi-send-check-fill" style="color:var(--color-primary)"></i>
        <span>Invoice submitted for approval. An approval task has been created for your manager — track it under <strong>My Tasks</strong>.</span>
      </div>
      ${resp.invoice.emsDocId ? `<div class="match-alert" style="margin-top:10px;margin-bottom:0;background:var(--color-success-light);color:var(--color-text)">
        <i class="bi bi-folder-check" style="color:var(--color-success)"></i>
        <span>A copy has been filed in <strong>CMS &rsaquo; Finance &rsaquo; Invoices</strong>.</span>
      </div>` : ''}`;
    document.getElementById('btnCopyApproval')?.addEventListener('click', () => {
      const val = document.getElementById('approvalValue').textContent;
      navigator.clipboard?.writeText(val).then(() => UI.toast('Reference number copied', 'success'));
    });
    submitBtn.remove();
    reasonEl?.setAttribute('disabled', 'true');
    UI.toast('Invoice submitted for approval', 'success');
  });
}

/* ════════════════════════════════════════════════════════════
   New validation (reset results, keep form values)
   ════════════════════════════════════════════════════════════ */
function startNewValidation() {
  lastResult = null;
  selectedFile = null;
  if (filePreviewUrl) { URL.revokeObjectURL(filePreviewUrl); filePreviewUrl = null; }
  document.getElementById('fileInput').value = '';
  renderFileChip();
  updateValidateBtn();
  showState('idle');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ════════════════════════════════════════════════════════════
   Event binding
   ════════════════════════════════════════════════════════════ */
function bindEvents() {
  const zone  = document.getElementById('uploadZone');
  const input = document.getElementById('fileInput');

  zone.addEventListener('dragover',  e => { e.preventDefault(); zone.classList.add('drag-over'); });
  zone.addEventListener('dragleave', ()  => zone.classList.remove('drag-over'));
  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.classList.remove('drag-over');
    if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
  });
  zone.addEventListener('click', () => input.click());
  input.addEventListener('change', () => {
    if (input.files.length) handleFile(input.files[0]);
    input.value = '';
  });

  const emailInput = document.getElementById('vendorEmail');
  emailInput.addEventListener('blur',  () => { emailTouched = true; validateEmailField(); updateValidateBtn(); });
  emailInput.addEventListener('input', () => { validateEmailField(); updateValidateBtn(); });

  document.getElementById('poSelect').addEventListener('change', updateValidateBtn);

  document.getElementById('btnValidate').addEventListener('click', validateInvoice);
  document.getElementById('btnNewValidation').addEventListener('click', startNewValidation);
}

/* ════════════════════════════════════════════════════════════
   Utilities
   ════════════════════════════════════════════════════════════ */
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatBytes(bytes) {
  if (bytes < 1024)        return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}
