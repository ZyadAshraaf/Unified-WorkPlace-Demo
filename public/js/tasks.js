/* ── Tasks Page Controller ───────────────────────────────── */
let allTasks   = [];
let allUsers   = [];
let activeTask = null;
let activeFilter = 'all';

const taskDetailModal   = () => bootstrap.Modal.getOrCreateInstance(document.getElementById('taskDetailModal'));
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
  document.getElementById('countAll').textContent        = allTasks.length;
  document.getElementById('countPending').textContent    = f('pending');
  document.getElementById('countCompleted').textContent  = f('completed');
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
      if (activeFilter === 'escalated' && !t.escalated) return false;
      else if (activeFilter !== 'escalated' && t.status !== activeFilter) return false;
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
      const overdue = t.dueDate && new Date(t.dueDate) < new Date() && t.status !== 'completed';
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
    <div class="mb-3 p-3 rounded" style="background:var(--color-surface);border:1px solid var(--color-border)">${t.description || 'No description.'}</div>
    <div class="mb-3">
      <div class="fw-600 mb-2">Comments</div>${comments}
    </div>
    <div>
      <div class="fw-600 mb-2">History</div>${history}
    </div>`;

  const isLeaveApproval = t.type === 'approval' && t.metadata?.leaveId;
  const isWfhApproval   = t.type === 'approval' && t.metadata?.wfhId;
  const isApproval      = isLeaveApproval || isWfhApproval;
  const isDone = t.status === 'completed';

  document.getElementById('btnCompleteTask').classList.toggle('d-none', isApproval || isDone);
  document.getElementById('btnApproveLeave').classList.toggle('d-none', !isApproval || isDone);
  document.getElementById('btnRejectLeave').classList.toggle('d-none', !isApproval || isDone);

  taskDetailModal().show();
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

  // Approve leave or WFH
  document.getElementById('btnApproveLeave')?.addEventListener('click', async () => {
    if (!activeTask) return;
    let data;
    if (activeTask.metadata?.leaveId) {
      data = await API.put(`/api/leaves/${activeTask.metadata.leaveId}`, { status: 'approved' });
    } else if (activeTask.metadata?.wfhId) {
      data = await API.put(`/api/wfh/${activeTask.metadata.wfhId}`, { status: 'approved' });
    } else return;
    if (data?.success) { UI.toast('Request approved', 'success'); taskDetailModal().hide(); await loadTasks(); }
    else UI.toast(data?.message || 'Error approving request', 'danger');
  });

  // Reject leave or WFH
  document.getElementById('btnRejectLeave')?.addEventListener('click', async () => {
    if (!activeTask) return;
    let data;
    if (activeTask.metadata?.leaveId) {
      data = await API.put(`/api/leaves/${activeTask.metadata.leaveId}`, { status: 'rejected' });
    } else if (activeTask.metadata?.wfhId) {
      data = await API.put(`/api/wfh/${activeTask.metadata.wfhId}`, { status: 'rejected' });
    } else return;
    if (data?.success) { UI.toast('Request rejected', 'warning'); taskDetailModal().hide(); await loadTasks(); }
    else UI.toast(data?.message || 'Error rejecting request', 'danger');
  });

  // Complete task
  document.getElementById('btnCompleteTask')?.addEventListener('click', async () => {
    if (!activeTask) return;
    const data = await API.put(`/api/tasks/${activeTask.id}`, { status: 'completed', note: 'Marked as complete' });
    if (data?.success) { UI.toast('Task marked complete', 'success'); taskDetailModal().hide(); await loadTasks(); }
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
