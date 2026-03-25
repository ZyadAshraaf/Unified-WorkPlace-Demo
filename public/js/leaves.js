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
    <tr>
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
