// ==========================================================
// DASHBOARD.JS
// ==========================================================
(async function () {
  const session = requireAuth();
  if (!session) return;
  renderShell('dashboard', 'Production Dashboard', 'Live motherboard production overview');

  let LINES = [], MODELS = [], SHIFTS = [];
  let trendChart = null, lineChart = null;

  const dateEl = document.getElementById('f-date');
  const shiftEl = document.getElementById('f-shift');
  const lineEl = document.getElementById('f-line');
  const modelEl = document.getElementById('f-model');
  dateEl.value = todayISO();

  async function loadMasters() {
    const [linesRes, modelsRes, shiftsRes] = await Promise.all([
      sb.from('lines').select('*').eq('active', true).order('line_number'),
      sb.from('models').select('*').eq('active', true).order('model_name'),
      sb.from('shifts').select('*').eq('active', true).order('sort_order'),
    ]);
    LINES = linesRes.data || [];
    MODELS = modelsRes.data || [];
    SHIFTS = shiftsRes.data || [];

    shiftEl.innerHTML = '<option value="">All Shifts</option>' + SHIFTS.map(s => `<option value="${s.id}">${s.shift_name}</option>`).join('');
    lineEl.innerHTML = '<option value="">All Lines</option>' + LINES.map(l => `<option value="${l.id}">${l.line_number}</option>`).join('');
    modelEl.innerHTML = '<option value="">All Models</option>' + MODELS.map(m => `<option value="${m.id}">${m.fg_code} &mdash; ${m.model_name}</option>`).join('');
  }

  async function fetchHourlyForDate() {
    let q = sb.from('hourly_production')
      .select(`*, production_reports!inner(id, report_date, shift_id, line_id, model_id, shift_incharge,
        shifts(id, shift_code, shift_name, start_time, end_time),
        lines(id, line_number),
        models(id, fg_code, model_name))`)
      .eq('production_reports.report_date', dateEl.value);

    if (shiftEl.value) q = q.eq('production_reports.shift_id', shiftEl.value);
    if (lineEl.value) q = q.eq('production_reports.line_id', lineEl.value);
    if (modelEl.value) q = q.eq('production_reports.model_id', modelEl.value);

    const { data, error } = await q.order('slot_order', { ascending: true });
    if (error) { console.error(error); showToast('Could not load production data', 'error'); return []; }
    return data || [];
  }

  function renderKpis(rows) {
    const summary = calculateSummaryFromRecords(rows);
    const activeLines = new Set(rows.filter(r => Number(r.overall_production) > 0).map(r => r.production_reports.line_id)).size;

    const cards = [
      { label: "Today's Overall Production", value: summary.totalOverall.toLocaleString(), icon: '&#128230;', color: 'blue', foot: 'Boards' },
      { label: "Today's Overall Yield", value: summary.overallYield + '%', icon: '&#128200;', color: yieldColor(summary.overallYield) === 'good' ? 'green' : yieldColor(summary.overallYield) === 'warn' ? 'orange' : 'red', foot: 'Production / Target' },
      { label: "Today's Top Yield", value: summary.topYield + '%', icon: '&#11014;', color: 'purple', foot: 'TOP' },
      { label: "Today's Bottom Yield", value: summary.bottomYield + '%', icon: '&#11015;', color: 'blue', foot: 'BOTTOM' },
      { label: "Today's Issues", value: summary.issuesCount, icon: '&#128027;', color: 'red', foot: 'Logged faults' },
      { label: 'Active Lines', value: activeLines, icon: '&#127981;', color: 'green', foot: `of ${LINES.length} lines` },
    ];

    document.getElementById('kpi-row').innerHTML = cards.map(c => `
      <div class="kpi-card">
        <div class="kpi-top">
          <div class="kpi-icon ${c.color}">${c.icon}</div>
        </div>
        <div class="kpi-label">${c.label}</div>
        <div class="kpi-value">${c.value}</div>
        <div class="kpi-foot">${c.foot}</div>
      </div>`).join('');
  }

  function renderCurrentProduction(rows) {
    const tbody = document.getElementById('current-production-body');
    const recent = [...rows].filter(r => Number(r.overall_production) > 0)
      .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at)).slice(0, 8);
    if (!recent.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="empty-state">No production entered yet for this selection</td></tr>';
      return;
    }
    tbody.innerHTML = recent.map(r => `
      <tr>
        <td>${r.time_slot}</td>
        <td>${r.production_reports.lines.line_number}</td>
        <td>${escapeHtml(r.production_reports.models.model_name)}</td>
        <td>${r.overall_production}</td>
        <td>${r.top_production}</td>
        <td>${r.bottom_production}</td>
      </tr>`).join('');
  }

  function renderShiftStatus(rows) {
    const nowMin = timeToMinutes(nowHHMM());
    const list = document.getElementById('shift-status-list');
    list.innerHTML = SHIFTS.map(s => {
      const start = timeToMinutes(s.start_time.slice(0, 5));
      let end = timeToMinutes(s.end_time.slice(0, 5));
      if (end <= start) end += 24 * 60;
      let cmpNow = nowMin < start ? nowMin + 24 * 60 : nowMin;
      const isActive = cmpNow >= start && cmpNow < end;
      const isPast = cmpNow >= end;
      const statusLabel = isActive ? 'Active' : isPast ? 'Completed' : 'Upcoming';
      return `
        <div class="shift-row ${isActive ? 'active' : ''}">
          <div class="flex gap-10">
            <div class="shift-chip">${s.shift_code}</div>
            <div>
              <div class="shift-name">${s.shift_name}</div>
              <div class="shift-time">${s.start_time.slice(0,5)} - ${s.end_time.slice(0,5)}</div>
            </div>
          </div>
          <span class="badge ${isActive ? 'saved' : isPast ? 'completed' : 'pending'}">${statusLabel}</span>
        </div>`;
    }).join('');
  }

  function renderCharts(rows) {
    const withData = rows.filter(r => Number(r.overall_production) > 0);
    const byHour = {};
    withData.forEach(r => {
      const key = r.time_slot;
      if (!byHour[key]) byHour[key] = [];
      byHour[key].push(r);
    });
    const hourLabels = Object.keys(byHour).sort((a, b) => {
      const oa = withData.find(r => r.time_slot === a).slot_order;
      const ob = withData.find(r => r.time_slot === b).slot_order;
      return oa - ob;
    });
    const hourYields = hourLabels.map(h => calculateSummaryFromRecords(byHour[h]).overallYield);

    const trendCtx = document.getElementById('yield-trend-chart');
    if (trendChart) trendChart.destroy();
    trendChart = new Chart(trendCtx, {
      type: 'line',
      data: {
        labels: hourLabels,
        datasets: [{ label: 'Overall Yield %', data: hourYields, borderColor: '#2f6fed', backgroundColor: 'rgba(47,111,237,0.12)', fill: true, tension: 0.35, pointRadius: 3 }]
      },
      options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { min: 0, max: 110 } } }
    });

    const byLine = {};
    withData.forEach(r => {
      const ln = r.production_reports.lines.line_number;
      byLine[ln] = (byLine[ln] || 0) + Number(r.overall_production);
    });
    const lineLabels = Object.keys(byLine).sort();
    const lineValues = lineLabels.map(l => byLine[l]);

    const lineCtx = document.getElementById('line-wise-chart');
    if (lineChart) lineChart.destroy();
    lineChart = new Chart(lineCtx, {
      type: 'bar',
      data: { labels: lineLabels, datasets: [{ label: 'Overall Production', data: lineValues, backgroundColor: '#7c9cf0', borderRadius: 6 }] },
      options: { responsive: true, plugins: { legend: { display: false } } }
    });
  }

  async function refresh() {
    const rows = await fetchHourlyForDate();
    renderKpis(rows);
    renderCurrentProduction(rows);
    renderShiftStatus(rows);
    renderCharts(rows);
  }

  [dateEl, shiftEl, lineEl, modelEl].forEach(el => el.addEventListener('change', refresh));

  await loadMasters();
  renderShiftStatus([]);
  await refresh();

  // Realtime: any change to hourly_production or production_reports refreshes the dashboard
  sb.channel('dashboard-live')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'hourly_production' }, debounce(refresh, 400))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'production_reports' }, debounce(refresh, 400))
    .subscribe();

  setInterval(renderShiftStatus.bind(null, []), 60000);
})();
