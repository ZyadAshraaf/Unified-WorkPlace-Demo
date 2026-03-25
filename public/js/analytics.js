/* ── Analytics Page Controller ───────────────────────────── */
document.addEventListener('DOMContentLoaded', async () => {
  await Layout.init('analytics');
  await Promise.all([loadSummary(), loadCharts()]);
});

async function loadSummary() {
  const data = await API.get('/api/analytics/summary');
  if (!data?.success) return;
  const s = data.summary;
  document.getElementById('kpiPending').textContent   = s.pendingTasks;
  document.getElementById('kpiCompleted').textContent = s.completedTasks;
  document.getElementById('kpiEscalated').textContent = s.escalatedTasks;
  document.getElementById('kpiPresent').textContent   = s.attendance.presentDays;
}

async function loadCharts() {
  const [byStatus, bySystem, byPriority, leaveSum] = await Promise.all([
    API.get('/api/analytics/tasks-by-status'),
    API.get('/api/analytics/tasks-by-system'),
    API.get('/api/analytics/tasks-by-priority'),
    API.get('/api/analytics/leave-summary')
  ]);

  const primary  = '#198D87';
  const colors   = ['#198D87','#22B5AD','#4DC5BE','#126660','#0C4440','#5ECEC9'];
  const defaults = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'bottom', labels: { padding: 16, font: { size: 12 } } }
    }
  };

  // Tasks by Status — Doughnut
  if (byStatus?.success) {
    const d = byStatus.data;
    new Chart(document.getElementById('chartStatus'), {
      type: 'doughnut',
      data: {
        labels: Object.keys(d).map(k => k.replace(/-/g,' ').replace(/\b\w/g,c=>c.toUpperCase())),
        datasets: [{ data: Object.values(d), backgroundColor: ['#E6A817','#0D7BB5','#1A9E6A','#DC3545'], borderWidth: 0, hoverOffset: 6 }]
      },
      options: { ...defaults, cutout: '62%' }
    });
  }

  // Tasks by System — Bar
  if (bySystem?.success) {
    const d = bySystem.data;
    new Chart(document.getElementById('chartSystem'), {
      type: 'bar',
      data: {
        labels: Object.keys(d),
        datasets: [{ label: 'Tasks', data: Object.values(d), backgroundColor: colors, borderRadius: 6, borderSkipped: false }]
      },
      options: {
        ...defaults,
        plugins: { ...defaults.plugins, legend: { display: false } },
        scales: {
          y: { beginAtZero: true, ticks: { stepSize: 1 }, grid: { color: '#f0f0f0' } },
          x: { grid: { display: false } }
        }
      }
    });
  }

  // Tasks by Priority — Horizontal Bar
  if (byPriority?.success) {
    const d = byPriority.data;
    new Chart(document.getElementById('chartPriority'), {
      type: 'bar',
      data: {
        labels: ['Critical','High','Medium','Low'],
        datasets: [{ label: 'Tasks', data: [d.critical, d.high, d.medium, d.low], backgroundColor: ['#DC3545','#fd7e14','#E6A817','#1A9E6A'], borderRadius: 6, borderSkipped: false }]
      },
      options: {
        ...defaults,
        indexAxis: 'y',
        plugins: { ...defaults.plugins, legend: { display: false } },
        scales: {
          x: { beginAtZero: true, ticks: { stepSize: 1 }, grid: { color: '#f0f0f0' } },
          y: { grid: { display: false } }
        }
      }
    });
  }

  // Leave Summary — Bar
  if (leaveSum?.success) {
    const bt = leaveSum.byType;
    new Chart(document.getElementById('chartLeave'), {
      type: 'bar',
      data: {
        labels: Object.keys(bt).map(k => k.charAt(0).toUpperCase()+k.slice(1)),
        datasets: [{ label: 'Days', data: Object.values(bt), backgroundColor: [primary,'#22B5AD','#4DC5BE','#126660'], borderRadius: 6, borderSkipped: false }]
      },
      options: {
        ...defaults,
        plugins: { ...defaults.plugins, legend: { display: false } },
        scales: {
          y: { beginAtZero: true, ticks: { stepSize: 1 }, grid: { color: '#f0f0f0' } },
          x: { grid: { display: false } }
        }
      }
    });
  }
}
