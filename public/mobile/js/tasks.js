// Approval endpoint routing map keyed on metadata field
const APPROVAL_MAP = {
  leaveId:  {
    approve: id => API.put(`/api/leaves/${id}`,  { status: 'approved' }),
    reject:  id => API.put(`/api/leaves/${id}`,  { status: 'rejected' })
  },
  wfhId: {
    approve: id => API.put(`/api/wfh/${id}`,     { status: 'approved' }),
    reject:  id => API.put(`/api/wfh/${id}`,     { status: 'rejected' })
  },
  travelId: {
    approve: id => API.put(`/api/travel/${id}`,  { status: 'approved' }),
    reject:  id => API.put(`/api/travel/${id}`,  { status: 'rejected' })
  },
  mrqId: {
    approve: id => API.put(`/api/material-requisitions/${id}/approve`, {}),
    reject:  id => API.put(`/api/material-requisitions/${id}/reject`,  {})
  },
  poId: {
    approve: id => API.put(`/api/purchase-orders/${id}/approve`, {}),
    reject:  id => API.put(`/api/purchase-orders/${id}/reject`,  {})
  },
  planId: null  // handled specially below (needs approvalType)
};

let allTasks    = [];
let activeFilter = 'all';
let activeTask   = null;
let _tasksInited = false;

const Tasks = {
  async init() {
    // Bind event listeners only once
    if (!_tasksInited) {
      bindFilterChips();
      bindSheet();
      _tasksInited = true;
    }
    await loadTasks();
  }
};

async function loadTasks() {
  const data = await API.get('/api/tasks');
  if (!data || !data.success) return;
  allTasks = data.tasks || [];
  updateBadges();
  renderList();
}

function updateBadges() {
  const pending  = allTasks.filter(t => t.status === 'pending').length;
  const approval = allTasks.filter(t => t.type === 'approval' && t.status === 'pending').length;

  const pb = document.getElementById('pendingBadge');
  const ab = document.getElementById('approvalBadge');
  pb.textContent = pending;  pb.style.display = pending  ? '' : 'none';
  ab.textContent = approval; ab.style.display = approval ? '' : 'none';
}

function filterTasks() {
  if (activeFilter === 'all')       return allTasks;
  if (activeFilter === 'pending')   return allTasks.filter(t => t.status === 'pending');
  if (activeFilter === 'completed') return allTasks.filter(t => t.status === 'completed' || t.status === 'approved' || t.status === 'rejected');
  if (activeFilter === 'approval')  return allTasks.filter(t => t.type === 'approval' && t.status === 'pending');
  return allTasks;
}

function renderList() {
  const list = filterTasks();
  const el   = document.getElementById('taskList');
  if (!list.length) { el.innerHTML = '<div class="empty-state">No tasks found</div>'; return; }
  el.innerHTML = list.map(t => `
    <div class="task-card" data-id="${t.id}">
      <div class="task-card__title">${t.title}</div>
      <div class="task-card__meta">
        ${statusBadge(t.status)}
        ${priorityDot(t.priority)}
        <span>${t.sourceSystem || ''}</span>
        <span>${t.dueDate ? fmtDate(t.dueDate) : ''}</span>
      </div>
    </div>
  `).join('');

  el.querySelectorAll('.task-card').forEach(card => {
    card.addEventListener('click', () => openSheet(card.dataset.id));
  });
}

function bindFilterChips() {
  document.getElementById('filterChips').addEventListener('click', e => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    activeFilter = chip.dataset.filter;
    document.querySelectorAll('.chip').forEach(c => c.classList.remove('chip--active'));
    chip.classList.add('chip--active');
    renderList();
  });
}

// ── Bottom sheet ───────────────────────────────────────────────────────────────
function bindSheet() {
  document.getElementById('sheetOverlay').addEventListener('click', closeSheet);
}

function openSheet(id) {
  activeTask = allTasks.find(t => t.id === id);
  if (!activeTask) return;
  renderSheet(activeTask);
  document.getElementById('sheetOverlay').classList.add('sheet-overlay--visible');
  document.getElementById('taskSheet').classList.add('bottom-sheet--open');
}

function closeSheet() {
  document.getElementById('sheetOverlay').classList.remove('sheet-overlay--visible');
  document.getElementById('taskSheet').classList.remove('bottom-sheet--open');
  activeTask = null;
}

function renderSheet(task) {
  const meta       = task.metadata || {};
  const isApproval = task.type === 'approval' && task.status === 'pending';

  document.getElementById('sheetBody').innerHTML = `
    <div class="sheet-title">${task.title}</div>
    <div class="detail-row"><span class="detail-row__label">Status</span><span class="detail-row__value">${statusBadge(task.status)}</span></div>
    <div class="detail-row"><span class="detail-row__label">Priority</span><span class="detail-row__value">${task.priority || '—'}</span></div>
    <div class="detail-row"><span class="detail-row__label">Source</span><span class="detail-row__value">${task.sourceSystem || '—'}</span></div>
    <div class="detail-row"><span class="detail-row__label">Due Date</span><span class="detail-row__value">${fmtDate(task.dueDate)}</span></div>
    ${task.description ? `<div class="detail-row"><span class="detail-row__label">Description</span><span class="detail-row__value">${task.description}</span></div>` : ''}
    ${renderHistory(task.history || [])}
    ${isApproval ? `
      <div style="margin-top:14px">
        <div class="form-group">
          <label>Note (optional)</label>
          <textarea id="approvalNote" class="comment-input" rows="3" placeholder="Add a note…"></textarea>
        </div>
      </div>` : ''}
    ${(!isApproval && task.status !== 'completed') ? `
      <div style="margin-top:14px">
        <div class="form-group">
          <label>Comment</label>
          <textarea id="commentText" class="comment-input" rows="3" placeholder="Add a comment…"></textarea>
          <button class="btn btn--ghost" style="margin-top:8px" onclick="submitComment('${task.id}')">Post Comment</button>
        </div>
      </div>` : ''}
  `;

  const actions = document.getElementById('sheetActions');
  if (isApproval) {
    actions.innerHTML = `
      <button class="btn btn--danger"  onclick="doApproval('${task.id}','reject')">Reject</button>
      <button class="btn btn--primary" onclick="doApproval('${task.id}','approve')">Approve</button>
    `;
  } else if (task.type === 'task' && task.status !== 'completed') {
    actions.innerHTML = `
      <button class="btn btn--ghost"   onclick="closeSheet()">Close</button>
      <button class="btn btn--primary" onclick="markComplete('${task.id}')">Mark Complete</button>
    `;
  } else {
    actions.innerHTML = `<button class="btn btn--ghost btn--full" onclick="closeSheet()">Close</button>`;
  }
}

function renderHistory(history) {
  if (!history.length) return '';
  return `<div style="margin-top:12px"><strong style="font-size:13px;color:#475569">History</strong>
    ${history.map(h => `<div class="history-item">${fmtDate(h.timestamp)} — ${h.action}${h.by ? ' by ' + h.by : ''}${h.note ? ': ' + h.note : ''}</div>`).join('')}
  </div>`;
}

async function doApproval(taskId, action) {
  const task = allTasks.find(t => t.id === taskId);
  if (!task) return;
  const note = document.getElementById('approvalNote')?.value || '';
  const meta = task.metadata || {};

  let res;
  if (meta.planId) {
    const type     = meta.approvalType === 'objectives' ? 'objectives' : 'appraisal';
    const endpoint = action === 'approve'
      ? `/api/appraisal/${meta.planId}/${type}/approve`
      : `/api/appraisal/${meta.planId}/${type}/${type === 'objectives' ? 'return' : 'reject'}`;
    res = await API.put(endpoint, { note });
  } else {
    const key = Object.keys(APPROVAL_MAP).find(k => k !== 'planId' && meta[k]);
    if (!key) { UI.toast('Unknown approval type', 'error'); return; }
    res = await APPROVAL_MAP[key][action](meta[key], note);
  }

  if (res && res.success) {
    UI.toast(action === 'approve' ? 'Approved' : 'Rejected');
    closeSheet();
    await loadTasks();
  } else {
    UI.toast(res?.message || 'Action failed', 'error');
  }
}

async function markComplete(taskId) {
  const res = await API.put(`/api/tasks/${taskId}`, { status: 'completed' });
  if (res && res.success) {
    UI.toast('Task completed');
    closeSheet();
    await loadTasks();
  } else {
    UI.toast(res?.message || 'Failed', 'error');
  }
}

async function submitComment(taskId) {
  const text = document.getElementById('commentText')?.value?.trim();
  if (!text) return;
  const res = await API.post(`/api/tasks/${taskId}/comment`, { text });
  if (res && res.success) {
    UI.toast('Comment added');
    document.getElementById('commentText').value = '';
  } else {
    UI.toast('Failed to add comment', 'error');
  }
}
