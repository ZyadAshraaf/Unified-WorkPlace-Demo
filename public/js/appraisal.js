/* ── Appraisal Page Controller ───────────────────────────── */
let allAppraisals = [];
let activeAp      = null;

document.addEventListener('DOMContentLoaded', async () => {
  await Layout.init('appraisal');
  await loadAppraisals();
});

async function loadAppraisals() {
  const data = await API.get('/api/appraisal');
  if (!data?.success) return;
  allAppraisals = data.appraisals;
  renderList();
  renderLatestScore();
  checkActiveCycle();
}

function checkActiveCycle() {
  const active = allAppraisals.find(a => a.status === 'self-assessment');
  const banner = document.getElementById('activeCycleBanner');
  if (!active) return;

  banner.classList.remove('d-none');
  banner.innerHTML = `
    <div class="d-flex align-items-center gap-3 p-3 rounded" style="background:var(--color-warning-light);border:1px solid var(--color-warning);border-radius:var(--radius-lg)">
      <i class="bi bi-exclamation-circle-fill text-warning fs-4"></i>
      <div style="flex:1">
        <div class="fw-700">Self-Assessment Due — ${active.cycle}</div>
        <div class="fs-sm text-muted">Please complete your self-assessment for the ${active.cycle} appraisal cycle.</div>
      </div>
      <button class="btn btn-warning btn-sm fw-600" onclick="openAppraisalDetail('${active.id}')">
        <i class="bi bi-pencil-square me-1"></i>Complete Now
      </button>
    </div>`;
}

function renderList() {
  const el = document.getElementById('appraisalList');
  if (!allAppraisals.length) {
    el.innerHTML = '<div class="text-muted py-3 fs-sm">No appraisal records found.</div>';
    return;
  }

  el.innerHTML = allAppraisals.map(a => {
    const statusClass = a.status.replace(/-/g,'').replace(' ','-');
    const scoreHtml   = a.overallScore ? `<div class="fw-700 fs-5" style="color:var(--color-primary)">${a.overallScore} <span class="fs-sm text-muted">/ 5.0</span></div>` : '<span class="text-muted fs-sm">Pending</span>';
    return `
      <div class="appraisal-hist-card" onclick="openAppraisalDetail('${a.id}')">
        <div class="d-flex align-items-center justify-content-between">
          <div>
            <div class="d-flex align-items-center gap-2 mb-1">
              <span class="cycle-badge">${a.cycle}</span>
              <span class="badge-custom badge-status-${a.status === 'completed' ? 'completed' : 'pending'} status-badge-ap ${statusClass}">
                ${a.status.replace(/-/g,' ').replace(/\b\w/g,c=>c.toUpperCase())}
              </span>
            </div>
            <div class="fs-sm text-muted">${UI.formatDate(a.period?.from)} → ${UI.formatDate(a.period?.to)}</div>
            <div class="fs-sm mt-1">Reviewer: <strong>${a.reviewerName || '—'}</strong></div>
          </div>
          <div class="text-end">${scoreHtml}</div>
        </div>
      </div>`;
  }).join('');
}

function renderLatestScore() {
  const completed = allAppraisals.filter(a => a.status === 'completed');
  const latest    = completed.sort((a,b) => new Date(b.completedAt) - new Date(a.completedAt))[0];
  const panel     = document.getElementById('latestScorePanel');
  const catPanel  = document.getElementById('categoryScores');

  if (!latest) return;

  const score = latest.overallScore || 0;
  const stars  = Math.round(score);
  const starHtml = '★'.repeat(stars) + '☆'.repeat(5 - stars);

  panel.innerHTML = `
    <div class="score-ring ${score >= 4 ? 'high' : score >= 3 ? 'mid' : ''}">
      <div class="score-big">${score}</div>
      <div class="score-max">/ 5.0</div>
    </div>
    <div class="star-rating mb-1">${starHtml}</div>
    <div class="fs-sm text-muted">${latest.cycle} Appraisal</div>
    ${latest.managerAssessment?.recommendation ? `<div class="mt-2 p-2 rounded fs-sm" style="background:var(--color-primary-faint);color:var(--color-primary)">"${latest.managerAssessment.recommendation}"</div>` : ''}`;

  catPanel.innerHTML = `<div style="padding:0 16px">` + latest.categories.map(c => {
    const avg = ((c.selfScore || 0) + (c.managerScore || 0)) / 2;
    return `
      <div class="category-row">
        <div class="category-name">${c.name}</div>
        <div class="score-chip chip-self" title="Self">${c.selfScore ?? '—'}</div>
        <div class="score-chip chip-mgr"  title="Manager">${c.managerScore ?? '—'}</div>
      </div>`;
  }).join('') + '</div>';
}

async function openAppraisalDetail(id) {
  activeAp   = allAppraisals.find(a => a.id === id);
  const modal = bootstrap.Modal.getOrCreateInstance(document.getElementById('appraisalDetailModal'));
  const body  = document.getElementById('appraisalDetailBody');
  const btn   = document.getElementById('btnSubmitSelfAssessment');

  document.getElementById('modalAppraisalTitle').textContent = `${activeAp.cycle} — ${activeAp.status.replace(/-/g,' ').replace(/\b\w/g,c=>c.toUpperCase())}`;

  if (activeAp.status === 'self-assessment') {
    btn.classList.remove('d-none');
    body.innerHTML = buildSelfAssessmentForm(activeAp);
  } else if (activeAp.status === 'completed') {
    btn.classList.add('d-none');
    body.innerHTML = buildCompletedView(activeAp);
  } else {
    btn.classList.add('d-none');
    body.innerHTML = '<div class="text-muted py-3">Appraisal in progress — awaiting manager review.</div>';
  }

  modal.show();
}

function buildSelfAssessmentForm(a) {
  const cats = a.categories.map(c => `
    <div class="mb-3">
      <label class="form-label fw-600">${c.name}</label>
      <div class="d-flex gap-2 flex-wrap">
        ${[1,2,3,4,5].map(n => `
          <label class="d-flex flex-column align-items-center gap-1" style="cursor:pointer">
            <input type="radio" name="cat_${c.name.replace(/\s/g,'_')}" value="${n}" class="cat-score">
            <span style="font-size:24px;color:#d1d5db" class="star-opt" data-val="${n}">★</span>
            <span class="fs-xs text-muted">${n}</span>
          </label>`).join('')}
      </div>
    </div>`).join('');

  return `
    <div class="mb-4">
      <h6 class="fw-700 mb-3"><i class="bi bi-person-check text-primary me-2"></i>Self Assessment</h6>
      <div class="mb-3"><label class="form-label">Key Achievements</label><textarea class="form-control" id="saAchievements" rows="3" placeholder="What did you accomplish this quarter?"></textarea></div>
      <div class="mb-3"><label class="form-label">Challenges Faced</label><textarea class="form-control" id="saChallenges" rows="2" placeholder="What challenges did you encounter?"></textarea></div>
      <div class="mb-3"><label class="form-label">Areas for Improvement</label><textarea class="form-control" id="saImprovements" rows="2" placeholder="What will you focus on next quarter?"></textarea></div>
      <h6 class="fw-700 mb-3 mt-4"><i class="bi bi-star text-primary me-2"></i>Category Ratings</h6>
      ${cats}
    </div>`;
}

function buildCompletedView(a) {
  const sa = a.selfAssessment;
  const ma = a.managerAssessment;

  return `
    <div class="row g-4">
      <div class="col-md-6">
        <h6 class="fw-700 mb-3"><i class="bi bi-person text-primary me-2"></i>Self Assessment</h6>
        <div class="mb-2"><div class="fs-xs text-muted fw-600 text-uppercase">Achievements</div><div class="fs-sm">${sa?.achievements || '—'}</div></div>
        <div class="mb-2"><div class="fs-xs text-muted fw-600 text-uppercase">Challenges</div><div class="fs-sm">${sa?.challenges || '—'}</div></div>
        <div class="mb-2"><div class="fs-xs text-muted fw-600 text-uppercase">Improvements</div><div class="fs-sm">${sa?.improvements || '—'}</div></div>
        <div class="mt-2 fw-700" style="color:var(--color-primary)">Self Score: ${sa?.score ?? '—'} / 5</div>
      </div>
      <div class="col-md-6">
        <h6 class="fw-700 mb-3"><i class="bi bi-person-check text-success me-2"></i>Manager Assessment</h6>
        <div class="mb-2"><div class="fs-xs text-muted fw-600 text-uppercase">Strengths</div><div class="fs-sm">${ma?.strengths || '—'}</div></div>
        <div class="mb-2"><div class="fs-xs text-muted fw-600 text-uppercase">Areas for Improvement</div><div class="fs-sm">${ma?.areasForImprovement || '—'}</div></div>
        <div class="mb-2"><div class="fs-xs text-muted fw-600 text-uppercase">Recommendation</div><div class="fs-sm fw-600" style="color:var(--color-primary)">${ma?.recommendation || '—'}</div></div>
        <div class="mt-2 fw-700" style="color:var(--color-success)">Manager Score: ${ma?.score ?? '—'} / 5</div>
      </div>
      <div class="col-12">
        <div class="p-3 rounded text-center" style="background:var(--color-primary);color:white;border-radius:var(--radius-md)">
          <div class="fs-sm opacity-75">Overall Score</div>
          <div style="font-size:36px;font-weight:800;line-height:1.1">${a.overallScore}</div>
          <div class="fs-sm opacity-75">/ 5.0</div>
        </div>
      </div>
    </div>`;
}

document.getElementById('btnSubmitSelfAssessment')?.addEventListener('click', async () => {
  if (!activeAp) return;

  const achievements = document.getElementById('saAchievements')?.value.trim();
  const challenges   = document.getElementById('saChallenges')?.value.trim();
  const improvements = document.getElementById('saImprovements')?.value.trim();

  if (!achievements) return UI.toast('Please fill in your achievements', 'warning');

  const catScores = {};
  document.querySelectorAll('.cat-score:checked').forEach(el => {
    catScores[el.name] = parseInt(el.value);
  });

  const score = Object.values(catScores).length
    ? +(Object.values(catScores).reduce((s,n)=>s+n,0) / Object.values(catScores).length).toFixed(1)
    : 3;

  const data = await API.put(`/api/appraisal/${activeAp.id}`, {
    selfAssessment: { achievements, challenges, improvements, score }
  });

  if (data?.success) {
    UI.toast('Self-assessment submitted successfully', 'success');
    bootstrap.Modal.getOrCreateInstance(document.getElementById('appraisalDetailModal')).hide();
    await loadAppraisals();
  }
});
