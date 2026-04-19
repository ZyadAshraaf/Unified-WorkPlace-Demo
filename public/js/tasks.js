/* ── Tasks Page Controller ───────────────────────────────── */
let allTasks   = [];
let allUsers   = [];
let activeTask = null;
let activeFilter = 'all';

const taskDetailModal   = () => bootstrap.Modal.getOrCreateInstance(document.getElementById('taskDetailModal'));

// Reset review mode when modal closes
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('taskDetailModal')?.addEventListener('hidden.bs.modal', _exitReviewMode);
});

function _exitReviewMode() {
  document.getElementById('taskDetailModal')?.classList.remove('review-mode');
  document.getElementById('taskNormalView')?.classList.remove('d-none');
  document.getElementById('taskReviewView')?.classList.add('d-none');
  document.getElementById('reviewPdfScroller').innerHTML =
    '<div class="task-review-pdf-loading" id="reviewPdfLoading"><div class="spinner-border text-secondary" role="status"></div><div class="mt-2 text-muted" style="font-size:13px;">Loading document…</div></div>';
}

async function _enterReviewMode(docId, version, docTitle) {
  // Switch layout
  document.getElementById('taskNormalView').classList.add('d-none');
  document.getElementById('taskReviewView').classList.remove('d-none');
  document.getElementById('taskDetailModal').classList.add('review-mode');
  document.getElementById('reviewDocTitle').textContent = docTitle || 'Document';

  // Populate sidebar with task info
  const t = activeTask;
  document.getElementById('reviewSidebarBody').innerHTML = `
    <div class="fw-bold mb-3" style="font-size:15px;">${t.title}</div>
    <div class="d-flex flex-wrap gap-2 mb-3">${UI.statusBadge(t.status)} ${UI.priorityBadge(t.priority)}</div>
    <div class="mb-2"><span class="text-muted" style="font-size:11px;text-transform:uppercase;letter-spacing:.5px;">Assigned To</span><div style="font-size:13px;">${t.assignedToName}</div></div>
    <div class="mb-2"><span class="text-muted" style="font-size:11px;text-transform:uppercase;letter-spacing:.5px;">Created By</span><div style="font-size:13px;">${t.createdByName}</div></div>
    <div class="mb-3"><span class="text-muted" style="font-size:11px;text-transform:uppercase;letter-spacing:.5px;">System</span><div class="mt-1">${UI.systemBadge(t.sourceSystem)}</div></div>
    <hr>
    <div class="mb-3">
      <div class="text-muted mb-1" style="font-size:11px;text-transform:uppercase;letter-spacing:.5px;">Description</div>
      <div style="font-size:13px;line-height:1.6;">${t.description || 'No description.'}</div>
    </div>
    ${t.comments.length ? `<hr><div class="text-muted mb-2" style="font-size:11px;text-transform:uppercase;letter-spacing:.5px;">Comments</div>${t.comments.map(c=>`<div class="mb-2 p-2 rounded" style="background:#f8f9fa;font-size:12px;"><strong>${c.name||c.by}</strong><div>${c.text}</div></div>`).join('')}` : ''}
  `;

  // Load PDF via pdf.js
  const scroller = document.getElementById('reviewPdfScroller');
  try {
    const resp = await fetch(`/api/ems/documents/${docId}/versions/${version}/view`, { credentials: 'include' });
    const buffer = await resp.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
    const outputScale = window.devicePixelRatio || 1;

    scroller.innerHTML = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const availW = Math.max(400, scroller.parentElement.clientWidth - 40);
      const vp0 = page.getViewport({ scale: 1 });
      const fitScale = availW / vp0.width;
      const viewport = page.getViewport({ scale: fitScale * outputScale });
      const cssW = Math.floor(vp0.width * fitScale);
      const cssH = Math.floor(vp0.height * fitScale);

      const canvas = document.createElement('canvas');
      canvas.width  = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      canvas.style.width  = cssW + 'px';
      canvas.style.height = cssH + 'px';
      scroller.appendChild(canvas);
      await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    }
  } catch (err) {
    scroller.innerHTML = `<div class="text-danger p-3">Failed to load document: ${err.message}</div>`;
  }
}
const createTaskModal   = () => bootstrap.Modal.getOrCreateInstance(document.getElementById('createTaskModal'));
const delegateModal     = () => bootstrap.Modal.getOrCreateInstance(document.getElementById('delegateModal'));
const reassignModal     = () => bootstrap.Modal.getOrCreateInstance(document.getElementById('reassignModal'));
const escalateModal     = () => bootstrap.Modal.getOrCreateInstance(document.getElementById('escalateModal'));
const commentModal      = () => bootstrap.Modal.getOrCreateInstance(document.getElementById('commentModal'));

document.addEventListener('DOMContentLoaded', async () => {
  await Layout.init('tasks');
  await loadUsers();
  await loadTasks();
  bindFilters();
  bindModals();
});

async function loadUsers() {
  const data = await API.get('/api/directory');
  if (data?.success) allUsers = data.users;
  populateUserSelects();
}

function populateUserSelects() {
  const opts = allUsers.map(u => `<option value="${u.id}">${u.name} (${u.department})</option>`).join('');
  ['newTaskAssignee','delegateUser','reassignUser'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = opts;
  });
}

async function loadTasks() {
  const data = await API.get('/api/tasks');
  if (!data?.success) return;
  allTasks = data.tasks;
  updateCounts();
  renderTasks();
}

function updateCounts() {
  const f = s => allTasks.filter(t => t.status === s).length;
  const closedStatuses = ['completed', 'approved', 'rejected'];
  document.getElementById('countAll').textContent        = allTasks.length;
  document.getElementById('countPending').textContent    = f('pending');
  document.getElementById('countCompleted').textContent  = allTasks.filter(t => closedStatuses.includes(t.status)).length;
  document.getElementById('countEscalated').textContent  = allTasks.filter(t => t.escalated).length;

  const pending = f('pending');
  const badge   = document.getElementById('tasksBadge');
  if (badge) { badge.textContent = pending; badge.classList.toggle('d-none', pending === 0); }
}

function getFilteredTasks() {
  const search    = document.getElementById('searchInput')?.value.toLowerCase() || '';
  const system    = document.getElementById('filterSystem')?.value || '';
  const priority  = document.getElementById('filterPriority')?.value || '';
  const dateFrom  = document.getElementById('filterDateFrom')?.value || '';
  const dateTo    = document.getElementById('filterDateTo')?.value || '';

  const filtered = allTasks.filter(t => {
    if (activeFilter !== 'all') {
      const closedStatuses = ['completed', 'approved', 'rejected'];
      if (activeFilter === 'escalated' && !t.escalated) return false;
      else if (activeFilter === 'closed' && !closedStatuses.includes(t.status)) return false;
      else if (activeFilter !== 'escalated' && activeFilter !== 'closed' && t.status !== activeFilter) return false;
    }
    if (search   && !t.title.toLowerCase().includes(search) && !t.description.toLowerCase().includes(search)) return false;
    if (system   && t.sourceSystem !== system) return false;
    if (priority && t.priority !== priority) return false;
    if (dateFrom && t.createdAt && t.createdAt.slice(0,10) < dateFrom) return false;
    if (dateTo   && t.createdAt && t.createdAt.slice(0,10) > dateTo)   return false;
    return true;
  });

  // Sort by createdAt descending (newest first)
  filtered.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  return filtered;
}

const SYSTEM_ICONS = {
  HR:          'bi-people',
  Accounting:  'bi-calculator',
  CRM:         'bi-person-lines-fill',
  Warehouse:   'bi-box-seam',
  IT:          'bi-laptop',
  Manual:      'bi-pencil-square'
};

function renderTasks() {
  const tasks = getFilteredTasks();
  const tbody = document.getElementById('tasksTableBody');
  document.getElementById('taskCount').textContent = `Showing ${tasks.length} of ${allTasks.length} tasks`;

  if (!tasks.length) {
    tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><i class="bi bi-inbox"></i><h5>No tasks found</h5><p>Try adjusting your filters.</p></div></td></tr>`;
    return;
  }

  let html = '';
  tasks.forEach(t => {
      const overdue = t.dueDate && new Date(t.dueDate) < new Date() && !['completed','approved','rejected'].includes(t.status);
      const dueLabel = t.dueDate
        ? `<div>${UI.formatDate(t.dueDate)}</div>${overdue ? '<div class="overdue-indicator"><i class="bi bi-exclamation-circle me-1"></i>Overdue</div>' : ''}`
        : '—';

      const escalateItem = !t.escalated
        ? `<li><hr class="dropdown-divider my-1"></li>
           <li><button class="dropdown-item text-danger" onclick="openEscalate('${t.id}')"><i class="bi bi-exclamation-triangle me-2"></i>Escalate</button></li>`
        : '';

      html += `
        <tr class="task-row">
          <td>${UI.priorityBadge(t.priority)}</td>
          <td>
            <div class="task-title-cell">${t.title}</div>
            ${t.description ? `<div class="task-desc-preview">${t.description}</div>` : ''}
          </td>
          <td>${UI.systemBadge(t.sourceSystem)}</td>
          <td class="fs-sm" style="color:var(--color-text-muted)">${t.createdAt ? UI.formatDate(t.createdAt) : '—'}</td>
          <td class="fs-sm">${dueLabel}</td>
          <td>${UI.statusBadge(t.status)}</td>
          <td>
            <div class="task-action-cell">
              <button class="btn btn-sm btn-outline-primary btn-view" onclick="openDetail('${t.id}')">
                <i class="bi bi-eye me-1"></i>View
              </button>
              <div class="dropdown">
                <button class="btn btn-sm btn-outline-secondary btn-more dropdown-toggle" data-bs-toggle="dropdown" aria-expanded="false">
                  <i class="bi bi-three-dots"></i>
                </button>
                <ul class="dropdown-menu dropdown-menu-end shadow-sm">
                  <li><button class="dropdown-item" onclick="openDelegate('${t.id}')"><i class="bi bi-arrow-left-right me-2 text-primary"></i>Delegate</button></li>
                  <li><button class="dropdown-item" onclick="openReassign('${t.id}')"><i class="bi bi-person-check me-2 text-success"></i>Reassign</button></li>
                  <li><button class="dropdown-item" onclick="openComment('${t.id}')"><i class="bi bi-chat-dots me-2 text-info"></i>Add Comment</button></li>
                  ${escalateItem}
                </ul>
              </div>
            </div>
          </td>
        </tr>`;
  });

  tbody.innerHTML = html;
}

function bindFilters() {
  document.getElementById('searchInput')?.addEventListener('input', renderTasks);
  document.getElementById('filterSystem')?.addEventListener('change', renderTasks);
  document.getElementById('filterPriority')?.addEventListener('change', renderTasks);
  document.getElementById('filterDateFrom')?.addEventListener('change', renderTasks);
  document.getElementById('filterDateTo')?.addEventListener('change', renderTasks);
  document.getElementById('btnClearDates')?.addEventListener('click', () => {
    document.getElementById('filterDateFrom').value = '';
    document.getElementById('filterDateTo').value   = '';
    renderTasks();
  });
  document.getElementById('btnRefresh')?.addEventListener('click', loadTasks);

  document.getElementById('statusPills')?.addEventListener('click', e => {
    const pill = e.target.closest('.stat-pill');
    if (!pill) return;
    document.querySelectorAll('.stat-pill').forEach(p => p.classList.remove('active'));
    pill.classList.add('active');
    activeFilter = pill.dataset.filter;
    renderTasks();
  });
}

// ── Detail Modal ───────────────────────────────────────────
async function openDetail(id) {
  const data = await API.get(`/api/tasks/${id}`);
  if (!data?.success) return;
  const t = data.task;
  activeTask = t;

  document.getElementById('detailTitle').textContent = t.title;

  const isLeaveApproval      = t.type === 'approval' && t.metadata?.leaveId;
  const isWfhApproval        = t.type === 'approval' && t.metadata?.wfhId;
  const isEmsVersionApproval = t.type === 'approval' && t.metadata?.emsVersionId;
  const isPOApproval         = t.type === 'approval' && t.metadata?.poId;
  const isMRQApproval        = t.type === 'approval' && t.metadata?.mrqId;
  const isApproval           = isLeaveApproval || isWfhApproval || isEmsVersionApproval || isPOApproval || isMRQApproval;
  const isDone = ['completed', 'approved', 'rejected'].includes(t.status);

  // Fetch linked record for approval tasks
  let requestDetailsHtml = '';
  if (isLeaveApproval) {
    if (t.metadata.requestDetails) {
      requestDetailsHtml = buildLeaveDetails(t.metadata.requestDetails);
    } else {
      const r = await API.get(`/api/leaves/${t.metadata.leaveId}`);
      if (r?.success) requestDetailsHtml = buildLeaveDetails(r.leave);
    }
  } else if (isWfhApproval) {
    if (t.metadata.requestDetails) {
      requestDetailsHtml = buildWfhDetails(t.metadata.requestDetails);
    } else {
      const r = await API.get(`/api/wfh/${t.metadata.wfhId}`);
      if (r?.success) requestDetailsHtml = buildWfhDetails(r.wfh);
    }
  } else if (isPOApproval) {
    const r = await API.get(`/api/purchase-orders/${t.metadata.poId}`);
    if (r?.success) requestDetailsHtml = buildPODetails(r.po);
  } else if (isMRQApproval) {
    const r = await API.get(`/api/material-requisitions/${t.metadata.mrqId}`);
    if (r?.success) requestDetailsHtml = buildMRQDetails(r.mrq);
  }

  const comments = t.comments.map(c => `
    <div class="comment-bubble">
      <div class="comment-meta"><strong>${c.name || c.by}</strong> · ${UI.formatDateTime(c.at)}</div>
      <div class="comment-text">${c.text}</div>
    </div>`).join('') || '<div class="text-muted fs-sm">No comments yet.</div>';

  const history = t.history.map(h => `
    <div class="history-item">
      <span class="history-action">${h.action}</span> · ${UI.formatDateTime(h.at)}
      ${h.note ? `<div class="text-muted fs-xs mt-1">${h.note}</div>` : ''}
    </div>`).join('');

  document.getElementById('detailBody').innerHTML = `
    <div class="row g-3 mb-3">
      <div class="col-sm-6"><strong>Status:</strong> ${UI.statusBadge(t.status)}</div>
      <div class="col-sm-6"><strong>Priority:</strong> ${UI.priorityBadge(t.priority)}</div>
      <div class="col-sm-6"><strong>System:</strong> ${UI.systemBadge(t.sourceSystem)}</div>
      <div class="col-sm-6"><strong>Due:</strong> ${UI.formatDate(t.dueDate)}</div>
      <div class="col-sm-6"><strong>Assigned To:</strong> ${t.assignedToName}</div>
      <div class="col-sm-6"><strong>Created By:</strong> ${t.createdByName}</div>
    </div>
    ${requestDetailsHtml || `<div class="mb-3 p-3 rounded" style="background:var(--color-surface);border:1px solid var(--color-border)">${t.description || 'No description.'}</div>`}
    <div class="mb-3">
      <div class="fw-600 mb-2">Comments</div>${comments}
    </div>
    <div>
      <div class="fw-600 mb-2">History</div>${history}
    </div>`;

  document.getElementById('btnCompleteTask').classList.toggle('d-none', isApproval || isDone);
  document.getElementById('btnApproveLeave').classList.toggle('d-none', !isApproval || isDone);
  document.getElementById('btnRejectLeave').classList.toggle('d-none', !isApproval || isDone);
  document.getElementById('btnViewEmsDoc').classList.toggle('d-none', !isEmsVersionApproval);

  taskDetailModal().show();
}

function detailField(label, value) {
  return `<div class="col-sm-6 col-md-4">
    <label class="form-label mb-1" style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:var(--color-text-muted)">${label}</label>
    <input class="form-control form-control-sm" value="${(value || '—').toString().replace(/"/g, '&quot;')}" disabled>
  </div>`;
}

function detailSection(title, fieldsHtml, extraHtml = '') {
  return `<div class="mb-3">
    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:var(--color-text-muted);margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid var(--color-border)">${title}</div>
    <div class="row g-2">${fieldsHtml}</div>${extraHtml}
  </div>`;
}

function buildLeaveDetails(l) {
  const fields =
    detailField('Employee',   l.userName) +
    detailField('Leave Type', l.type?.charAt(0).toUpperCase() + l.type?.slice(1)) +
    detailField('Start Date', UI.formatDate(l.startDate)) +
    detailField('End Date',   UI.formatDate(l.endDate)) +
    detailField('Duration',   `${l.days} working day(s)`) +
    detailField('Submitted',  UI.formatDate(l.submittedAt)) +
    buildLeaveCustomFields(l.customFields, l.type);
  const reason = `<div class="mt-2"><label class="form-label mb-1" style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:var(--color-text-muted)">Reason</label>
    <textarea class="form-control form-control-sm" rows="2" disabled>${l.reason || '—'}</textarea></div>`;
  return detailSection('Leave Request Details', fields, reason);
}

function buildLeaveCustomFields(cf, type) {
  if (!cf || !type) return '';
  const f = (label, value) => value ? detailField(label, value) : '';
  if (type === 'sick')      return f('Medical Certificate', cf.hasCertificate ? 'Yes' : (cf.hasCertificate === false ? 'No' : '')) + f('Doctor / Clinic', cf.doctorName);
  if (type === 'emergency') return f('Emergency Category', cf.emergencyCategory);
  if (type === 'maternity') return f('Expected Due Date', UI.formatDate(cf.expectedDueDate));
  if (type === 'marriage')  return f('Wedding Date', UI.formatDate(cf.weddingDate));
  if (type === 'hajj')      return f('Departure City', cf.departureCity) + f('Pilgrim Reg. No.', cf.pilgrimRegNo);
  if (type === 'exam')      return f('Exam Date', UI.formatDate(cf.examDate)) + f('Course', cf.courseName) + f('Institution', cf.institutionName);
  return '';
}

function buildWfhDetails(w) {
  const fields =
    detailField('Employee',    w.userName) +
    detailField('WFH Type',    w.type || 'Remote') +
    detailField('Start Date',  UI.formatDate(w.startDate)) +
    detailField('End Date',    UI.formatDate(w.endDate)) +
    detailField('Duration',    `${w.days} day(s)`) +
    detailField('Submitted',   UI.formatDate(w.submittedAt));
  const reason = `<div class="mt-2"><label class="form-label mb-1" style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:var(--color-text-muted)">Reason</label>
    <textarea class="form-control form-control-sm" rows="2" disabled>${w.reason || '—'}</textarea></div>`;
  return detailSection('WFH Request Details', fields, reason);
}

function buildPODetails(p) {
  const fields =
    detailField('PO Number',         p.poNumber) +
    detailField('Requested By',      p.userName) +
    detailField('Vendor',            p.vendorName) +
    detailField('Cost Center',       p.costCenter) +
    detailField('Delivery Location', p.deliveryLocation) +
    detailField('Required By',       UI.formatDate(p.requiredBy)) +
    detailField('Currency',          p.currency) +
    detailField('Payment Terms',     p.paymentTerms) +
    detailField('Subtotal',          `${p.currency} ${(p.subtotal||0).toLocaleString('en-AE',{minimumFractionDigits:2})}`) +
    detailField('Tax',               `${p.taxPct}% — ${p.currency} ${(p.taxAmount||0).toLocaleString('en-AE',{minimumFractionDigits:2})}`) +
    `<div class="col-sm-6 col-md-4">
      <label class="form-label mb-1" style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:var(--color-text-muted)">Grand Total</label>
      <input class="form-control form-control-sm fw-700" value="${p.currency} ${(p.grandTotal||0).toLocaleString('en-AE',{minimumFractionDigits:2})}" disabled style="color:var(--color-primary);font-weight:700">
    </div>`;

  const lineRows = (p.lineItems || []).map(li => `
    <tr>
      <td class="fs-sm">${li.item}</td>
      <td class="fs-sm text-muted">${li.description || '—'}</td>
      <td class="text-center fs-sm">${li.qty} ${li.unit}</td>
      <td class="text-end fs-sm">${(li.unitPrice||0).toLocaleString('en-AE',{minimumFractionDigits:2})}</td>
      <td class="text-end fs-sm fw-700">${(li.lineTotal||0).toLocaleString('en-AE',{minimumFractionDigits:2})}</td>
    </tr>`).join('');

  const lineTable = `<div class="mt-2" style="border:1px solid var(--color-border);border-radius:8px;overflow:hidden">
    <table style="width:100%;border-collapse:collapse;font-size:12px">
      <thead><tr style="background:var(--color-surface)">
        <th style="padding:7px 10px;font-size:10px;font-weight:700;text-transform:uppercase;color:var(--color-text-muted)">Item</th>
        <th style="padding:7px 10px;font-size:10px;font-weight:700;text-transform:uppercase;color:var(--color-text-muted)">Description</th>
        <th style="padding:7px 10px;font-size:10px;font-weight:700;text-transform:uppercase;color:var(--color-text-muted);text-align:center">Qty</th>
        <th style="padding:7px 10px;font-size:10px;font-weight:700;text-transform:uppercase;color:var(--color-text-muted);text-align:right">Unit Price</th>
        <th style="padding:7px 10px;font-size:10px;font-weight:700;text-transform:uppercase;color:var(--color-text-muted);text-align:right">Total</th>
      </tr></thead>
      <tbody>${lineRows}</tbody>
    </table>
  </div>`;

  const justif = `<div class="mt-2"><label class="form-label mb-1" style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:var(--color-text-muted)">Justification</label>
    <textarea class="form-control form-control-sm" rows="2" disabled>${p.justification || '—'}</textarea></div>`;

  return detailSection('Purchase Order Details', fields, lineTable + justif);
}

function buildMRQDetails(m) {
  const totalQty = (m.lineItems || []).reduce((s, li) => s + (li.qtyRequested || 0), 0);
  const fields =
    detailField('MRQ Number',       m.mrqNumber) +
    detailField('Requested By',     m.userName) +
    detailField('Department',       m.department) +
    detailField('Delivery Location',m.deliveryLocation) +
    detailField('Required By',      UI.formatDate(m.requiredBy)) +
    detailField('Priority',         m.priority?.charAt(0).toUpperCase() + m.priority?.slice(1)) +
    detailField('Project Code',     m.projectCode || '—') +
    detailField('Total Items',      `${(m.lineItems||[]).length} line(s) · ${totalQty} unit(s)`);

  const lineRows = (m.lineItems || []).map(li => {
    const stockColor = li.stockAvailable === 0 ? '#dc3545' : li.stockAvailable <= 5 ? '#d97706' : '#1a9e6a';
    return `<tr>
      <td class="fs-sm text-muted">${li.materialCode}</td>
      <td class="fs-sm fw-600">${li.materialName}</td>
      <td class="fs-sm">${li.category}</td>
      <td class="text-center fs-sm">${li.uom}</td>
      <td class="text-center fs-sm fw-700">${li.qtyRequested}</td>
      <td class="text-center fs-sm fw-700" style="color:${stockColor}">${li.stockAvailable}</td>
    </tr>`;
  }).join('');

  const lineTable = `<div class="mt-2" style="border:1px solid var(--color-border);border-radius:8px;overflow:hidden">
    <table style="width:100%;border-collapse:collapse;font-size:12px">
      <thead><tr style="background:var(--color-surface)">
        <th style="padding:7px 10px;font-size:10px;font-weight:700;text-transform:uppercase;color:var(--color-text-muted)">Code</th>
        <th style="padding:7px 10px;font-size:10px;font-weight:700;text-transform:uppercase;color:var(--color-text-muted)">Material</th>
        <th style="padding:7px 10px;font-size:10px;font-weight:700;text-transform:uppercase;color:var(--color-text-muted)">Category</th>
        <th style="padding:7px 10px;font-size:10px;font-weight:700;text-transform:uppercase;color:var(--color-text-muted);text-align:center">UoM</th>
        <th style="padding:7px 10px;font-size:10px;font-weight:700;text-transform:uppercase;color:var(--color-text-muted);text-align:center">Qty Req.</th>
        <th style="padding:7px 10px;font-size:10px;font-weight:700;text-transform:uppercase;color:var(--color-text-muted);text-align:center">In Stock</th>
      </tr></thead>
      <tbody>${lineRows}</tbody>
    </table>
  </div>`;

  const justif = `<div class="mt-2"><label class="form-label mb-1" style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:var(--color-text-muted)">Justification</label>
    <textarea class="form-control form-control-sm" rows="2" disabled>${m.justification || '—'}</textarea></div>`;

  return detailSection('Material Requisition Details', fields, lineTable + justif);
}

// ── Bind Modals ────────────────────────────────────────────
function bindModals() {
  // Create task
  document.getElementById('btnCreateTask')?.addEventListener('click', () => createTaskModal().show());
  document.getElementById('btnSaveTask')?.addEventListener('click', async () => {
    const title = document.getElementById('newTaskTitle').value.trim();
    if (!title) return UI.toast('Title is required', 'warning');
    const data = await API.post('/api/tasks', {
      title, description: document.getElementById('newTaskDesc').value,
      sourceSystem: document.getElementById('newTaskSystem').value,
      priority:     document.getElementById('newTaskPriority').value,
      assignedTo:   document.getElementById('newTaskAssignee').value,
      dueDate:      document.getElementById('newTaskDue').value
    });
    if (data?.success) { UI.toast('Task created'); createTaskModal().hide(); await loadTasks(); }
    else UI.toast(data?.message || 'Error creating task', 'danger');
  });

  // Approve leave, WFH, or EMS version
  document.getElementById('btnApproveLeave')?.addEventListener('click', async () => {
    if (!activeTask) return;
    let data;
    if (activeTask.metadata?.leaveId) {
      data = await API.put(`/api/leaves/${activeTask.metadata.leaveId}`, { status: 'approved' });
    } else if (activeTask.metadata?.wfhId) {
      data = await API.put(`/api/wfh/${activeTask.metadata.wfhId}`, { status: 'approved' });
    } else if (activeTask.metadata?.emsVersionId) {
      const { docId, version } = activeTask.metadata;
      data = await API.post(`/api/ems/documents/${docId}/versions/${version}/approve`);
    } else if (activeTask.metadata?.poId) {
      data = await API.put(`/api/purchase-orders/${activeTask.metadata.poId}/approve`);
    } else if (activeTask.metadata?.mrqId) {
      data = await API.put(`/api/material-requisitions/${activeTask.metadata.mrqId}/approve`);
    } else return;
    if (data?.success) { UI.toast('Approved', 'success'); taskDetailModal().hide(); await loadTasks(); }
    else UI.toast(data?.message || 'Error approving', 'danger');
  });

  // Reject leave, WFH, or EMS version
  document.getElementById('btnRejectLeave')?.addEventListener('click', async () => {
    if (!activeTask) return;
    let data;
    if (activeTask.metadata?.leaveId) {
      data = await API.put(`/api/leaves/${activeTask.metadata.leaveId}`, { status: 'rejected' });
    } else if (activeTask.metadata?.wfhId) {
      data = await API.put(`/api/wfh/${activeTask.metadata.wfhId}`, { status: 'rejected' });
    } else if (activeTask.metadata?.emsVersionId) {
      const { docId, version } = activeTask.metadata;
      data = await API.post(`/api/ems/documents/${docId}/versions/${version}/reject`);
    } else if (activeTask.metadata?.poId) {
      data = await API.put(`/api/purchase-orders/${activeTask.metadata.poId}/reject`);
    } else if (activeTask.metadata?.mrqId) {
      data = await API.put(`/api/material-requisitions/${activeTask.metadata.mrqId}/reject`);
    } else return;
    if (data?.success) { UI.toast('Rejected', 'warning'); taskDetailModal().hide(); await loadTasks(); }
    else UI.toast(data?.message || 'Error rejecting', 'danger');
  });

  // Complete task
  document.getElementById('btnCompleteTask')?.addEventListener('click', async () => {
    if (!activeTask) return;
    const data = await API.put(`/api/tasks/${activeTask.id}`, { status: 'completed', note: 'Marked as complete' });
    if (data?.success) { UI.toast('Task marked complete', 'success'); taskDetailModal().hide(); await loadTasks(); }
  });

  // Enter document review mode
  document.getElementById('btnViewEmsDoc')?.addEventListener('click', () => {
    if (!activeTask?.metadata?.docId || !activeTask?.metadata?.version) return;
    const { docId, version, docTitle } = activeTask.metadata;
    _enterReviewMode(docId, version, docTitle);
  });

  // Back button — exit review mode
  document.getElementById('btnExitReview')?.addEventListener('click', _exitReviewMode);

  // Approve from review mode
  document.getElementById('btnApproveReview')?.addEventListener('click', async () => {
    if (!activeTask?.metadata?.emsVersionId) return;
    const { docId, version } = activeTask.metadata;
    const data = await API.post(`/api/ems/documents/${docId}/versions/${version}/approve`);
    if (data?.success) { UI.toast('Version approved', 'success'); taskDetailModal().hide(); await loadTasks(); }
    else UI.toast(data?.message || 'Error approving', 'danger');
  });

  // Reject from review mode
  document.getElementById('btnRejectReview')?.addEventListener('click', async () => {
    if (!activeTask?.metadata?.emsVersionId) return;
    const { docId, version } = activeTask.metadata;
    const data = await API.post(`/api/ems/documents/${docId}/versions/${version}/reject`);
    if (data?.success) { UI.toast('Version rejected', 'warning'); taskDetailModal().hide(); await loadTasks(); }
    else UI.toast(data?.message || 'Error rejecting', 'danger');
  });

  // Delegate
  document.getElementById('btnConfirmDelegate')?.addEventListener('click', async () => {
    if (!activeTask) return;
    const data = await API.post(`/api/tasks/${activeTask.id}/delegate`, {
      assignTo: document.getElementById('delegateUser').value,
      reason:   document.getElementById('delegateReason').value
    });
    if (data?.success) { UI.toast('Task delegated'); delegateModal().hide(); await loadTasks(); }
  });

  // Reassign
  document.getElementById('btnConfirmReassign')?.addEventListener('click', async () => {
    if (!activeTask) return;
    const data = await API.post(`/api/tasks/${activeTask.id}/reassign`, {
      assignTo: document.getElementById('reassignUser').value,
      reason:   document.getElementById('reassignReason').value
    });
    if (data?.success) { UI.toast('Task reassigned'); reassignModal().hide(); await loadTasks(); }
  });

  // Escalate
  document.getElementById('btnConfirmEscalate')?.addEventListener('click', async () => {
    if (!activeTask) return;
    const reason = document.getElementById('escalateReason').value.trim();
    if (!reason) return UI.toast('Please provide an escalation reason', 'warning');
    const data = await API.post(`/api/tasks/${activeTask.id}/escalate`, { reason });
    if (data?.success) { UI.toast('Task escalated', 'warning'); escalateModal().hide(); await loadTasks(); }
  });

  // Comment
  document.getElementById('btnSaveComment')?.addEventListener('click', async () => {
    if (!activeTask) return;
    const text = document.getElementById('commentText').value.trim();
    if (!text) return UI.toast('Comment cannot be empty', 'warning');
    const data = await API.post(`/api/tasks/${activeTask.id}/comment`, { text });
    if (data?.success) { UI.toast('Comment added'); commentModal().hide(); document.getElementById('commentText').value = ''; }
  });
}

function openDelegate(id) { activeTask = allTasks.find(t => t.id === id); document.getElementById('delegateReason').value = ''; delegateModal().show(); }
function openReassign(id) { activeTask = allTasks.find(t => t.id === id); document.getElementById('reassignReason').value = ''; reassignModal().show(); }
function openEscalate(id) { activeTask = allTasks.find(t => t.id === id); document.getElementById('escalateReason').value = ''; escalateModal().show(); }
function openComment(id)  { activeTask = allTasks.find(t => t.id === id); document.getElementById('commentText').value = '';   commentModal().show(); }
