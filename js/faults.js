// ==========================================================
// FAULTS.JS
// ==========================================================
(function () {
  const session = requireAuth();
  if (!session) return;
  renderShell('faults', 'Fault Report', 'All logged production issues, across lines and shifts');

  const $ = (id) => document.getElementById(id);
  const fromEl = $('f-from'), toEl = $('f-to'), lineEl = $('f-line'), shiftEl = $('f-shift');
  const d = new Date(); const weekAgo = new Date(d.getTime() - 6 * 86400000);
  fromEl.value = weekAgo.toISOString().slice(0, 10);
  toEl.value = todayISO();

  async function loadFilters() {
    const [linesRes, shiftsRes] = await Promise.all([
      sb.from('lines').select('*').eq('active', true).order('line_number'),
      sb.from('shifts').select('*').eq('active', true).order('sort_order'),
    ]);
    lineEl.innerHTML = '<option value="">All Lines</option>' + (linesRes.data || []).map(l => `<option value="${l.id}">${l.line_number}</option>`).join('');
    shiftEl.innerHTML = '<option value="">All Shifts</option>' + (shiftsRes.data || []).map(s => `<option value="${s.id}">${s.shift_name}</option>`).join('');
  }

  async function search() {
    $('fault-body').innerHTML = '<tr><td colspan="7" class="empty-state">Loading&hellip;</td></tr>';
    let q = sb.from('hourly_production')
      .select(`*, production_reports!inner(report_date, shift_id, line_id, model_id,
        shifts(shift_name), lines(line_number), models(fg_code, model_name))`)
      .gte('production_reports.report_date', fromEl.value)
      .lte('production_reports.report_date', toEl.value)
      .not('issues', 'is', null)
      .neq('issues', '')
      .neq('issues', 'None');
    if (lineEl.value) q = q.eq('production_reports.line_id', lineEl.value);
    if (shiftEl.value) q = q.eq('production_reports.shift_id', shiftEl.value);

    const { data, error } = await q.order('report_date', { foreignTable: 'production_reports', ascending: false });
    if (error) { console.error(error); showToast('Could not load fault data', 'error'); return; }

    const rows = data || [];
    renderKpis(rows);
    if (!rows.length) {
      $('fault-body').innerHTML = '<tr><td colspan="7" class="empty-state">No faults logged for this selection</td></tr>';
      return;
    }
    $('fault-body').innerHTML = rows.map(r => `
      <tr>
        <td>${isoToDisplay(r.production_reports.report_date)}</td>
        <td>${r.production_reports.shifts.shift_name}</td>
        <td>${r.production_reports.lines.line_number}</td>
        <td>${escapeHtml(r.production_reports.models.model_name)}</td>
        <td>${r.time_slot}</td>
        <td>${r.overall_production}</td>
        <td>${escapeHtml(r.issues)}</td>
      </tr>`).join('');
  }

  function renderKpis(rows) {
    $('k-total').textContent = rows.length;
    $('k-lines').textContent = new Set(rows.map(r => r.production_reports.line_id)).size;
    const counts = {};
    rows.forEach(r => { const key = (r.issues || '').trim(); counts[key] = (counts[key] || 0) + 1; });
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    $('k-common').textContent = top ? top[0] : '\u2014';
    $('k-hours').textContent = rows.length;
  }

  $('btn-search').addEventListener('click', search);
  $('btn-reset').addEventListener('click', () => {
    fromEl.value = weekAgo.toISOString().slice(0, 10);
    toEl.value = todayISO();
    lineEl.value = ''; shiftEl.value = '';
    search();
  });

  (async function init() { await loadFilters(); await search(); })();
})();
