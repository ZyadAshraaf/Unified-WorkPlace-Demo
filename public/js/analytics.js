/* ── Analytics Page Controller ── Modern redesign ── */
document.addEventListener('DOMContentLoaded', async () => {
  await Layout.init('analytics');
  await Promise.all([loadSummary(), loadCharts()]);
});

async function loadSummary() {
  const data = await API.get('/api/analytics/summary');
  if (!data?.success) return;
  const s = data.summary;

  const total = s.totalTasks || 0;

  document.getElementById('kpiTotal').textContent     = total;
  document.getElementById('kpiCompleted').textContent = s.completedTasks;
  document.getElementById('kpiPending').textContent   = s.pendingTasks;
  document.getElementById('kpiEscalated').textContent = s.escalatedTasks;

  // hero
  const heroTotal = document.getElementById('heroTotal');
  if (heroTotal) heroTotal.textContent = total || '—';

  // attendance
  const attNum = document.getElementById('attNum');
  const attSub = document.getElementById('attSub');
  if (attNum) attNum.textContent = s.attendance?.presentDays ?? '—';
  if (attSub) attSub.textContent = `Present out of ~22 working days this month`;
}

async function loadCharts() {
  const [byStatus, bySystem, byPriority, leaveSum] = await Promise.all([
    API.get('/api/analytics/tasks-by-status'),
    API.get('/api/analytics/tasks-by-system'),
    API.get('/api/analytics/tasks-by-priority'),
    API.get('/api/analytics/leave-summary')
  ]);

  buildAreaChart(bySystem);
  buildStatusDonut(byStatus);
  buildSystemBar(bySystem);
  buildPriorityList(byPriority);
  buildLeaveChart(leaveSum);
  buildAttendanceChart();
}

/* ── Gradient helper ── */
function makeGradient(ctx, color1, color2) {
  const g = ctx.createLinearGradient(0, 0, 0, ctx.canvas.height);
  g.addColorStop(0, color1);
  g.addColorStop(1, color2);
  return g;
}

/* ── Area chart (tasks by system) ── */
function buildAreaChart(bySystem) {
  const canvas = document.getElementById('chartArea');
  if (!canvas || !bySystem?.success) return;
  const ctx = canvas.getContext('2d');

  const labels = Object.keys(bySystem.data);
  const values = Object.values(bySystem.data);

  const total = values.reduce((a,b)=>a+b,0);
  const badge = document.getElementById('systemBadge');
  if (badge) badge.textContent = `${total} tasks`;

  const grad = ctx.createLinearGradient(0, 0, 0, 200);
  grad.addColorStop(0, 'rgba(25,141,135,0.15)');
  grad.addColorStop(1, 'rgba(25,141,135,0.0)');

  new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        data: values,
        fill: true,
        backgroundColor: grad,
        borderColor: '#198D87',
        borderWidth: 2.5,
        pointBackgroundColor: '#198D87',
        pointBorderColor: '#fff',
        pointBorderWidth: 2,
        pointRadius: 5,
        pointHoverRadius: 7,
        tension: 0.4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#1e293b',
          titleColor: '#fff',
          bodyColor: 'rgba(255,255,255,0.8)',
          padding: 10,
          cornerRadius: 8
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: '#94a3b8', font: { size: 11, weight: '600' } },
          border: { display: false }
        },
        y: {
          beginAtZero: true,
          ticks: { stepSize: 1, color: '#94a3b8', font: { size: 11 } },
          grid: { color: '#f1f5f9' },
          border: { display: false }
        }
      }
    }
  });
}

/* ── Donut: tasks by status ── */
function buildStatusDonut(byStatus) {
  const canvas = document.getElementById('chartStatus');
  if (!canvas || !byStatus?.success) return;
  const d = byStatus.data;

  const labels = Object.keys(d).map(k => k.replace(/-/g,' ').replace(/\b\w/g,c=>c.toUpperCase()));
  const values = Object.values(d);
  const total  = values.reduce((a, b) => a + b, 0);

  const palette = ['#198D87', '#0dd4c8', '#5eead4', '#0e7490'];

  const donutTotalEl = document.getElementById('donutTotal');
  if (donutTotalEl) donutTotalEl.textContent = total;

  // Status legend rows
  const legendEl = document.getElementById('statusLegend');
  if (legendEl) {
    legendEl.innerHTML = labels.map((lbl, i) => {
      const pct = total > 0 ? Math.round(values[i] / total * 100) : 0;
      return `
        <div class="sl-row">
          <div class="sl-dot" style="background:${palette[i % palette.length]}"></div>
          <div class="sl-label">${lbl}</div>
          <div class="sl-val">${values[i]}<span class="sl-pct">${pct}%</span></div>
        </div>
      `;
    }).join('');
  }

  // Glow plugin — draws a blurred shadow ring behind each arc
  const glowPlugin = {
    id: 'arcGlow',
    beforeDraw(chart) {
      const ctx = chart.ctx;
      ctx.save();
      ctx.shadowBlur   = 18;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
    },
    afterDatasetsDraw(chart) {
      chart.ctx.restore();
    }
  };

  new Chart(canvas, {
    type: 'doughnut',
    plugins: [glowPlugin],
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: palette,
        hoverBackgroundColor: palette.map(c => c + 'dd'),
        borderWidth: 3,
        borderColor: '#fff',
        hoverOffset: 10,
        borderRadius: 6,
        spacing: 3
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '74%',
      animation: {
        animateRotate: true,
        duration: 900,
        easing: 'easeInOutQuart'
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(10,30,35,0.85)',
          titleColor: '#0dd4c8',
          bodyColor: 'rgba(255,255,255,0.9)',
          borderColor: 'rgba(13,212,200,0.3)',
          borderWidth: 1,
          padding: 12,
          cornerRadius: 10,
          callbacks: {
            label: ctx => ` ${ctx.parsed} tasks  (${Math.round(ctx.parsed/total*100)}%)`
          }
        }
      }
    }
  });
}

/* ── Bar: tasks by system ── */
function buildSystemBar(bySystem) {
  const canvas = document.getElementById('chartSystem');
  if (!canvas || !bySystem?.success) return;
  const ctx = canvas.getContext('2d');
  const d = bySystem.data;

  const total = Object.values(d).reduce((a,b)=>a+b,0);
  const badgeEl = document.getElementById('systemBadge');
  if (badgeEl) badgeEl.textContent = `${total} total`;

  const sysColors = ['#198D87','#0D7BB5','#6f42c1','#e6a817','#1A9E6A','#fd7e14'];

  new Chart(canvas, {
    type: 'bar',
    data: {
      labels: Object.keys(d),
      datasets: [{
        label: 'Tasks',
        data: Object.values(d),
        backgroundColor: sysColors,
        borderRadius: 10,
        borderSkipped: false,
        barThickness: 32
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(0,0,0,0.75)',
          titleColor: '#fff',
          bodyColor: 'rgba(255,255,255,0.85)',
          padding: 10,
          cornerRadius: 8
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: { stepSize: 1, color: '#aab4be', font: { size: 11 } },
          grid: { color: '#f0f4f8', drawBorder: false },
          border: { display: false }
        },
        x: {
          grid: { display: false },
          ticks: { color: '#5a7270', font: { size: 11, weight: '600' } },
          border: { display: false }
        }
      }
    }
  });
}

/* ── Priority list (progress bars, no chart) ── */
function buildPriorityList(byPriority) {
  const el = document.getElementById('priorityList');
  if (!el || !byPriority?.success) return;
  const d = byPriority.data;

  const items = [
    { key: 'critical', label: 'Critical', color: '#DC3545', bg: '#fde8ea' },
    { key: 'high',     label: 'High',     color: '#fd7e14', bg: '#fff3e0' },
    { key: 'medium',   label: 'Medium',   color: '#e6a817', bg: '#fffbeb' },
    { key: 'low',      label: 'Low',      color: '#1A9E6A', bg: '#e6f9f0' }
  ];

  const max = Math.max(...items.map(i => d[i.key] || 0)) || 1;

  el.innerHTML = items.map(item => {
    const val = d[item.key] || 0;
    const pct = Math.round((val / max) * 100);
    return `
      <div class="priority-row">
        <div class="priority-dot" style="background:${item.color}"></div>
        <div class="priority-name">${item.label}</div>
        <div class="priority-bar-wrap">
          <div class="priority-bar-fill" style="width:${pct}%;background:${item.color};"></div>
        </div>
        <div class="priority-count">${val}</div>
      </div>
    `;
  }).join('');

  // Animate bars after paint
  requestAnimationFrame(() => {
    const fills = el.querySelectorAll('.priority-bar-fill');
    fills.forEach(f => {
      const w = f.style.width;
      f.style.width = '0';
      setTimeout(() => { f.style.width = w; }, 50);
    });
  });
}

/* ── Leave summary ── */
function buildLeaveChart(leaveSum) {
  const canvas = document.getElementById('chartLeave');
  if (!canvas || !leaveSum?.success) return;
  const bt = leaveSum.byType;

  const palette = ['#198D87','#0D7BB5','#6f42c1','#e6a817'];

  new Chart(canvas, {
    type: 'bar',
    data: {
      labels: Object.keys(bt).map(k => k.charAt(0).toUpperCase() + k.slice(1)),
      datasets: [{
        label: 'Days',
        data: Object.values(bt),
        backgroundColor: palette,
        borderRadius: 10,
        borderSkipped: false,
        barThickness: 36
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(0,0,0,0.75)',
          titleColor: '#fff',
          bodyColor: 'rgba(255,255,255,0.85)',
          padding: 10,
          cornerRadius: 8
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: { stepSize: 1, color: '#aab4be', font: { size: 11 } },
          grid: { color: '#f0f4f8' },
          border: { display: false }
        },
        x: {
          grid: { display: false },
          ticks: { color: '#5a7270', font: { size: 11, weight: '600' } },
          border: { display: false }
        }
      }
    }
  });
}

/* ── Attendance gauge (donut) ── */
async function buildAttendanceChart() {
  const canvas = document.getElementById('chartAttendance');
  if (!canvas) return;

  const data = await API.get('/api/analytics/summary');
  if (!data?.success) return;
  const present  = data.summary.attendance?.presentDays || 0;
  const working  = 22;
  const absent   = Math.max(working - present, 0);

  new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: ['Present', 'Absent'],
      datasets: [{
        data: [present, absent],
        backgroundColor: ['#198D87', '#f0f4f8'],
        borderWidth: 0,
        borderRadius: 6,
        hoverOffset: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '78%',
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(0,0,0,0.75)',
          titleColor: '#fff',
          bodyColor: 'rgba(255,255,255,0.85)',
          padding: 10,
          cornerRadius: 8
        }
      }
    }
  });
}
