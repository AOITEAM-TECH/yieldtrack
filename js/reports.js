// ==========================================================
// REPORTS.JS
// ==========================================================
(function () {
  const session = requireAuth();
  if (!session) return;
  renderShell('reports', 'Reports', 'Shift-wise, day-wise and week-wise production reports');

  const $ = (id) => document.getElementById(id);
  const typeEl = $('f-type'), fromEl = $('f-from'), toEl = $('f-to'),
        shiftEl = $('f-shift'), lineEl = $('f-line'), modelEl = $('f-model');

  let LINES = [], MODELS = [], SHIFTS = [];
  let lastFlatRows = [], lastSummary = null, lastPerShift = [], lastMeta = null;

  fromEl.value = todayISO();

  async function loadFilters() {
    const [linesRes, modelsRes, shiftsRes] = await Promise.all([
      sb.from('lines').select('*').eq('active', true).order('line_number'),
      sb.from('models').select('*').eq('active', true).order('model_name'),
      sb.from('shifts').select('*').eq('active', true).order('sort_order'),
    ]);
    LINES = linesRes.data || []; MODELS = modelsRes.data || []; SHIFTS = shiftsRes.data || [];
    lineEl.innerHTML = '<option value="">All Lines</option>' + LINES.map(l => `<option value="${l.id}">${l.line_number}</option>`).join('');
    modelEl.innerHTML = '<option value="">All Models</option>' + MODELS.map(m => `<option value="${m.id}">${m.fg_code} &mdash; ${m.model_name}</option>`).join('');
    shiftEl.innerHTML = '<option value="">All Shifts</option>' + SHIFTS.map(s => `<option value="${s.id}">${s.shift_name}</option>`).join('');
  }

  function handleTypeChange() {
    const type = typeEl.value;
    if (type === 'week') {
      $('lbl-from').textContent = 'From Date';
      toEl.disabled = false;
      $('to-date-field').classList.remove('disabled');
      if (!toEl.value || toEl.value === fromEl.value) {
        const d = new Date(fromEl.value); d.setDate(d.getDate() + 6);
        toEl.value = d.toISOString().slice(0, 10);
      }
    } else {
      $('lbl-from').textContent = 'Date';
      toEl.value = fromEl.value;
      toEl.disabled = true;
      $('to-date-field').classList.add('disabled');
    }
  }

  fromEl.addEventListener('change', () => { if (typeEl.value !== 'week') toEl.value = fromEl.value; });
  typeEl.addEventListener('change', handleTypeChange);

  async function search() {
    $('results-body').innerHTML = '<tr><td colspan="14" class="empty-state">Loading&hellip;</td></tr>';
    $('summary-card').style.display = 'none';
    $('breakdown-row').style.display = 'none';

    let q = sb.from('hourly_production')
      .select(`*, production_reports!inner(report_date, shift_id, line_id, model_id,
        shifts(shift_name), lines(line_number), models(fg_code, model_name))`)
      .gte('production_reports.report_date', fromEl.value)
      .lte('production_reports.report_date', toEl.value || fromEl.value);

    if (shiftEl.value) q = q.eq('production_reports.shift_id', shiftEl.value);
    if (lineEl.value) q = q.eq('production_reports.line_id', lineEl.value);
    if (modelEl.value) q = q.eq('production_reports.model_id', modelEl.value);

    const { data, error } = await q.order('slot_order', { ascending: true });
    if (error) { console.error(error); showToast('Could not load report data', 'error'); return; }

    const flat = (data || []).map(r => ({
      report_date: r.production_reports.report_date,
      shift_name: r.production_reports.shifts.shift_name,
      line_number: r.production_reports.lines.line_number,
      fg_code: r.production_reports.models.fg_code,
      model_name: r.production_reports.models.model_name,
      time_slot: r.time_slot,
      target_production: Number(r.target_production),
      overall_production: Number(r.overall_production),
      overall_yield: Number(r.overall_yield),
      top_production: Number(r.top_production),
      top_yield: Number(r.top_yield),
      bottom_production: Number(r.bottom_production),
      bottom_yield: Number(r.bottom_yield),
      issues: r.issues,
      status: r.status
    })).sort((a, b) => (a.report_date + a.time_slot).localeCompare(b.report_date + b.time_slot));

    lastFlatRows = flat;
    renderResults(flat);
  }

  function renderResults(flat) {
    $('results-count').textContent = `${flat.length} hourly record(s) found`;
    if (!flat.length) {
      $('results-body').innerHTML = '<tr><td colspan="14" class="empty-state">No records for this selection</td></tr>';
      return;
    }
    $('results-body').innerHTML = flat.map(r => `
      <tr>
        <td>${isoToDisplay(r.report_date)}</td><td>${r.shift_name}</td><td>${r.line_number}</td>
        <td>${escapeHtml(r.fg_code)}</td><td>${escapeHtml(r.model_name)}</td><td>${r.time_slot}</td>
        <td>${r.target_production}</td><td>${r.overall_production}</td>
        <td class="pct ${pctClass(r.overall_yield)}">${r.overall_yield}%</td>
        <td>${r.top_production}</td><td class="pct ${pctClass(r.top_yield)}">${r.top_yield}%</td>
        <td>${r.bottom_production}</td><td class="pct ${pctClass(r.bottom_yield)}">${r.bottom_yield}%</td>
        <td>${escapeHtml(r.issues || '')}</td>
      </tr>`).join('');

    lastSummary = calculateSummaryFromRecords(flat);
    $('summary-card').style.display = '';
    $('summary-title').textContent = typeEl.value === 'week' ? 'Week Summary' : typeEl.value === 'day' ? 'Full Day Summary' : 'Shift Summary';
    setYieldCard('rs-overall', lastSummary.overallYield);
    setYieldCard('rs-top', lastSummary.topYield);
    setYieldCard('rs-bottom', lastSummary.bottomYield);
    $('rs-completed').textContent = `${lastSummary.completedHours} / ${lastSummary.totalHours}`;
    $('rs-issues').textContent = `${lastSummary.issuesCount} issue(s) logged`;
    $('rs-total-target').textContent = lastSummary.totalTarget.toLocaleString();
    $('rs-total-overall').textContent = lastSummary.totalOverall.toLocaleString();
    $('rs-total-top').textContent = lastSummary.totalTop.toLocaleString();
    $('rs-total-bottom').textContent = lastSummary.totalBottom.toLocaleString();

    // per-shift breakdown (useful for day/week exports)
    const shiftGroups = {};
    flat.forEach(r => { (shiftGroups[r.shift_name] = shiftGroups[r.shift_name] || []).push(r); });
    lastPerShift = Object.keys(shiftGroups).sort().map(label => ({ label, summary: calculateSummaryFromRecords(shiftGroups[label]) }));

    // line-wise
    const lineGroups = {};
    flat.forEach(r => { (lineGroups[r.line_number] = lineGroups[r.line_number] || []).push(r); });
    const lineRows = Object.keys(lineGroups).sort().map(ln => {
      const s = calculateSummaryFromRecords(lineGroups[ln]);
      return `<tr><td>${ln}</td><td>${s.totalOverall.toLocaleString()}</td>
        <td class="pct ${pctClass(s.overallYield)}">${s.overallYield}%</td>
        <td class="pct ${pctClass(s.topYield)}">${s.topYield}%</td>
        <td class="pct ${pctClass(s.bottomYield)}">${s.bottomYield}%</td></tr>`;
    }).join('');
    $('linewise-body').innerHTML = lineRows;

    // model-wise
    const modelGroups = {};
    flat.forEach(r => { const key = r.fg_code + '|' + r.model_name; (modelGroups[key] = modelGroups[key] || []).push(r); });
    const modelRows = Object.keys(modelGroups).sort().map(key => {
      const [fg, name] = key.split('|');
      const s = calculateSummaryFromRecords(modelGroups[key]);
      return `<tr><td>${escapeHtml(fg)}</td><td>${escapeHtml(name)}</td><td>${s.totalOverall.toLocaleString()}</td>
        <td class="pct ${pctClass(s.overallYield)}">${s.overallYield}%</td><td>${s.issuesCount}</td></tr>`;
    }).join('');
    $('modelwise-body').innerHTML = modelRows;
    $('breakdown-row').style.display = '';

    lastMeta = buildMeta();
  }

  function setYieldCard(id, val) {
    const el = $(id);
    el.classList.remove('good', 'warn', 'bad');
    el.classList.add(pctClass(val));
    el.querySelector('.value').textContent = val + '%';
  }
  function pctClass(v) { return v >= 95 ? 'good' : v >= 90 ? 'warn' : 'bad'; }

  function buildMeta() {
    const type = typeEl.value;
    const from = fromEl.value, to = toEl.value || fromEl.value;
    const fileLabel = (type === 'week' && from !== to) ? `${from}_to_${to}` : from;
    const shiftLabel = shiftEl.value ? SHIFTS.find(s => s.id === shiftEl.value)?.shift_name : 'All Shifts';
    const lineLabel = lineEl.value ? LINES.find(l => l.id === lineEl.value)?.line_number : 'All Lines';
    const modelObj = modelEl.value ? MODELS.find(m => m.id === modelEl.value) : null;
    const modelLabel = modelObj ? `${modelObj.fg_code} - ${modelObj.model_name}` : 'All Models';
    const title = `${type === 'week' ? 'Week' : type === 'day' ? 'Day' : 'Shift'} Report | ${isoToDisplay(from)}${to !== from ? ' to ' + isoToDisplay(to) : ''} | ${shiftLabel} | ${lineLabel} | ${modelLabel}`;
    return { fileLabel, title };
  }

  $('btn-search').addEventListener('click', search);
  $('btn-reset').addEventListener('click', () => {
    typeEl.value = 'shift';
    fromEl.value = todayISO();
    toEl.value = todayISO();
    toEl.disabled = true;
    shiftEl.value = ''; lineEl.value = ''; modelEl.value = '';
    handleTypeChange();
    $('results-body').innerHTML = '<tr><td colspan="14" class="empty-state">Choose filters and click Search</td></tr>';
    $('results-count').textContent = 'No records loaded yet';
    $('summary-card').style.display = 'none';
    $('breakdown-row').style.display = 'none';
    lastFlatRows = [];
  });

  $('btn-excel').addEventListener('click', () => {
    if (!lastFlatRows.length) { showToast('Search for records before exporting', 'warn'); return; }
    exportProductionExcel(lastFlatRows, lastMeta, lastSummary, lastPerShift);
  });
  $('btn-pdf').addEventListener('click', () => {
    if (!lastFlatRows.length) { showToast('Search for records before exporting', 'warn'); return; }
    exportProductionPDF(lastFlatRows, lastMeta, lastSummary, lastPerShift);
  });

  (async function init() {
    await loadFilters();
    handleTypeChange();
    await search();
  })();
})();
