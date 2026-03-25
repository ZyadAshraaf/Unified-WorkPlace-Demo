/* ── Leaves Page Controller ──────────────────────────────── */
let allLeaves    = [];
let activeLeave  = null;
let reviewAction = null;

document.addEventListener('DOMContentLoaded', async () => {
  await Layout.init('leaves');
  await loadLeaves();
  bindActions();
});

async function loadLeaves() {
  const data = await API.get('/api/leaves');
  if (!data?.success) return;
  allLeaves = data.leaves;
  renderMyLeaves();
  renderPendingApprovals();
  updateBalance();
}

function updateBalance() {
  const user      = Layout.user;
  const myApproved = allLeaves.filter(l => l.userId === user.id && l.type === 'annual' && l.status === 'approved');
  const usedDays   = myApproved.reduce((s, l) => s + (l.days || 0), 0);
  const total      = 21;
  const remaining  = total - usedDays;

  document.getElementById('balAnnual').textContent = remaining;
  document.getElementById('balUsed').textContent   = usedDays;
  const pct = Math.round((usedDays / total) * 100);
  document.getElementById('balAnnualBar').style.width = `${Math.max(0, 100 - pct)}%`;
  document.getElementById('balUsedBar').style.width   = `${pct}%`;
}

function renderMyLeaves() {
  const user   = Layout.user;
  const mine   = allLeaves.filter(l => l.userId === user.id);
  const tbody  = document.getElementById('myLeavesBody');

  if (!mine.length) {
    tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state"><i class="bi bi-calendar-x"></i><h5>No leave requests yet</h5><p>Submit your first leave request above.</p></div></td></tr>`;
    return;
  }

  tbody.innerHTML = mine.map(l => `
    <tr onclick="openLeaveDrawer('${l.id}')" title="Click to view details">
      <td><span class="badge-custom" style="background:var(--color-primary-faint);color:var(--color-primary);text-transform:capitalize">${l.type}</span></td>
      <td class="fs-sm">${UI.formatDate(l.startDate)}</td>
      <td class="fs-sm">${UI.formatDate(l.endDate)}</td>
      <td class="text-center fw-600">${l.days}</td>
      <td class="fs-sm text-muted" style="max-width:180px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${l.reason || '—'}</td>
      <td>${UI.statusBadge(l.status)}</td>
      <td class="fs-sm">${l.reviewerName || '—'}</td>
      <td class="fs-sm text-muted" style="max-width:180px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${l.reviewNote || '—'}</td>
    </tr>`).join('');
}

/* ── Leave Detail Drawer ── */
function openLeaveDrawer(id) {
  const l = allLeaves.find(x => x.id === id);
  if (!l) return;

  const typeIcons = { annual: 'bi-sun', sick: 'bi-heart-pulse', emergency: 'bi-lightning', unpaid: 'bi-wallet2' };
  const statusConfig = {
    approved: { icon: 'bi-check-circle-fill', sub: 'This request has been approved' },
    pending:  { icon: 'bi-clock-fill',        sub: 'Awaiting manager review' },
    rejected: { icon: 'bi-x-circle-fill',     sub: 'This request was not approved' }
  };
  const sc = statusConfig[l.status] || statusConfig.pending;

  // Header
  document.getElementById('ldTypeIcon').innerHTML = `<i class="bi ${typeIcons[l.type] || 'bi-calendar-check'}"></i>`;
  document.getElementById('ldTitle').textContent    = `${l.type.charAt(0).toUpperCase() + l.type.slice(1)} Leave`;
  document.getElementById('ldSubtitle').textContent = `#${l.id.slice(0,8).toUpperCase()}`;

  // Status banner
  const banner = document.getElementById('ldStatusBanner');
  banner.className = `ld-status-banner ${l.status}`;
  document.getElementById('ldStatusIcon').className = `ld-status-icon bi ${sc.icon} ${l.status}`;
  document.getElementById('ldStatusText').className = `ld-status-text ${l.status}`;
  document.getElementById('ldStatusText').textContent = l.status.charAt(0).toUpperCase() + l.status.slice(1);
  document.getElementById('ldStatusSub').textContent  = sc.sub;

  // Duration
  document.getElementById('ldDays').textContent      = l.days;
  document.getElementById('ldDateRange').textContent = `${UI.formatDate(l.startDate)} → ${UI.formatDate(l.endDate)}`;

  // Info grid
  document.getElementById('ldType').textContent      = l.type.charAt(0).toUpperCase() + l.type.slice(1);
  document.getElementById('ldStart').textContent     = UI.formatDate(l.startDate);
  document.getElementById('ldEnd').textContent       = UI.formatDate(l.endDate);
  document.getElementById('ldSubmitted').textContent = l.createdAt ? UI.formatDate(l.createdAt.split('T')[0]) : '—';

  // Reason
  document.getElementById('ldReason').textContent = l.reason || 'No reason provided.';

  // Reviewer
  const reviewSection = document.getElementById('ldReviewSection');
  if (l.reviewerName) {
    reviewSection.style.display = '';
    document.getElementById('ldReviewerAvatar').textContent = l.reviewerName.charAt(0).toUpperCase();
    document.getElementById('ldReviewerName').textContent   = l.reviewerName;
    const noteEl = document.getElementById('ldReviewNote');
    if (l.reviewNote) {
      noteEl.textContent    = `"${l.reviewNote}"`;
      noteEl.style.display  = '';
    } else {
      noteEl.style.display  = 'none';
    }
  } else {
    reviewSection.style.display = 'none';
  }

  // Timeline
  const steps = [
    { label: 'Request Submitted',  sub: l.createdAt ? UI.formatDate(l.createdAt.split('T')[0]) : 'Submitted', done: true },
    { label: 'Under Review',       sub: 'Manager notified', done: l.status !== 'pending', active: l.status === 'pending' },
    { label: l.status === 'rejected' ? 'Request Rejected' : 'Request Approved',
      sub: l.reviewerName ? `By ${l.reviewerName}` : 'Pending',
      done: l.status === 'approved' || l.status === 'rejected',
      active: false,
      danger: l.status === 'rejected' }
  ];
  document.getElementById('ldTimeline').innerHTML = steps.map(s => `
    <div class="ld-tl-item">
      <div class="ld-tl-dot ${s.danger ? 'done' : s.done ? 'done' : s.active ? 'active' : 'grey'}"
           style="${s.danger ? 'background:#dc3545' : ''}">
        <i class="bi ${s.done ? (s.danger ? 'bi-x' : 'bi-check') : s.active ? 'bi-clock' : 'bi-circle'}"></i>
      </div>
      <div class="ld-tl-content">
        <div class="ld-tl-label">${s.label}</div>
        <div class="ld-tl-sub">${s.sub}</div>
      </div>
    </div>
  `).join('');

  // Open
  document.getElementById('leaveDrawer').classList.add('open');
  document.getElementById('leaveDrawerOverlay').classList.add('open');
}

function closeLeaveDrawer() {
  document.getElementById('leaveDrawer').classList.remove('open');
  document.getElementById('leaveDrawerOverlay').classList.remove('open');
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('leaveDrawerClose')?.addEventListener('click', closeLeaveDrawer);
  document.getElementById('leaveDrawerOverlay')?.addEventListener('click', closeLeaveDrawer);
});

function renderPendingApprovals() {
  const user    = Layout.user;
  if (user.role === 'employee') return;

  const pending = allLeaves.filter(l => l.status === 'pending' && l.userId !== user.id);
  const section = document.getElementById('pendingApprovalsSection');
  section.classList.toggle('d-none', pending.length === 0);
  document.getElementById('pendingCount').textContent = pending.length;

  if (!pending.length) return;

  document.getElementById('pendingApprovalsBody').innerHTML = pending.map(l => `
    <tr>
      <td class="fw-600 fs-sm">${l.userName}</td>
      <td><span class="badge-custom" style="background:var(--color-primary-faint);color:var(--color-primary);text-transform:capitalize">${l.type}</span></td>
      <td class="fs-sm">${UI.formatDate(l.startDate)}</td>
      <td class="fs-sm">${UI.formatDate(l.endDate)}</td>
      <td class="text-center fw-600">${l.days}</td>
      <td class="fs-sm text-muted">${l.reason || '—'}</td>
      <td>
        <button class="btn btn-sm btn-outline-success me-1" onclick="openReview('${l.id}','approve')"><i class="bi bi-check-lg"></i></button>
        <button class="btn btn-sm btn-outline-danger"  onclick="openReview('${l.id}','reject')"><i class="bi bi-x-lg"></i></button>
      </td>
    </tr>`).join('');
}

function openReview(id, action) {
  activeLeave  = allLeaves.find(l => l.id === id);
  reviewAction = action;

  const modal = bootstrap.Modal.getOrCreateInstance(document.getElementById('reviewModal'));
  document.getElementById('reviewModalTitle').textContent = action === 'approve' ? 'Approve Leave' : 'Reject Leave';
  document.getElementById('reviewLeaveInfo').innerHTML = `
    <div class="fw-600">${activeLeave.userName}</div>
    <div class="fs-sm text-muted">${activeLeave.type} leave · ${activeLeave.days} day(s)</div>
    <div class="fs-sm">${UI.formatDate(activeLeave.startDate)} → ${UI.formatDate(activeLeave.endDate)}</div>`;
  document.getElementById('reviewNote').value = '';
  modal.show();
}

function bindActions() {
  // Submit leave request
  document.getElementById('btnRequestLeave')?.addEventListener('click', () => {
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('leaveStart').value = '';
    document.getElementById('leaveEnd').value   = '';
    document.getElementById('leaveStart').min   = today;
    document.getElementById('leaveEnd').min     = today;
    document.getElementById('leaveDaysCalc').textContent = '—';
    bootstrap.Modal.getOrCreateInstance(document.getElementById('requestLeaveModal')).show();
  });

  // Auto-calculate days
  ['leaveStart', 'leaveEnd'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', calcDays);
  });

  // Submit
  document.getElementById('btnSubmitLeave')?.addEventListener('click', async () => {
    const start = document.getElementById('leaveStart').value;
    const end   = document.getElementById('leaveEnd').value;
    const type  = document.getElementById('leaveType').value;
    const reason = document.getElementById('leaveReason').value;

    if (!start || !end) return UI.toast('Please select start and end dates', 'warning');
    if (end < start)    return UI.toast('End date cannot be before start date', 'warning');

    const days = calcWorkingDays(new Date(start), new Date(end));
    const data = await API.post('/api/leaves', { type, startDate: start, endDate: end, days, reason });

    if (data?.success) {
      UI.toast('Leave request submitted successfully', 'success');
      bootstrap.Modal.getOrCreateInstance(document.getElementById('requestLeaveModal')).hide();
      await loadLeaves();
    } else {
      UI.toast(data?.message || 'Error submitting request', 'danger');
    }
  });

  // Approve / Reject
  document.getElementById('btnApprove')?.addEventListener('click', () => submitReview('approved'));
  document.getElementById('btnReject')?.addEventListener('click',  () => submitReview('rejected'));
}

async function submitReview(status) {
  if (!activeLeave) return;
  const note = document.getElementById('reviewNote').value;
  const data = await API.put(`/api/leaves/${activeLeave.id}`, { status, note });

  if (data?.success) {
    UI.toast(`Leave request ${status}`, status === 'approved' ? 'success' : 'warning');
    bootstrap.Modal.getOrCreateInstance(document.getElementById('reviewModal')).hide();
    await loadLeaves();
  } else {
    UI.toast(data?.message || 'Error updating request', 'danger');
  }
}

function calcDays() {
  const start = document.getElementById('leaveStart').value;
  const end   = document.getElementById('leaveEnd').value;
  if (!start || !end || end < start) { document.getElementById('leaveDaysCalc').textContent = '—'; return; }
  const days = calcWorkingDays(new Date(start), new Date(end));
  document.getElementById('leaveDaysCalc').textContent = days;
}

function calcWorkingDays(start, end) {
  let count = 0;
  const cur = new Date(start);
  while (cur <= end) {
    const day = cur.getDay();
    if (day !== 0 && day !== 6) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}
