// ==========================================================
// PRODUCTION.JS
// ==========================================================
(function () {
  const session = requireAuth();
  if (!session) return;
  renderShell('production', 'Hourly Production Entry', 'Enter one-hour production and yield data');

  let LINES = [], MODELS = [], SHIFTS = [];
  let currentReportId = null;
  let slots = []; // working rows
  let defaultTarget = 0;
  let tickTimer = null;

  const $ = (id) => document.getElementById(id);
  const dateEl = $('cfg-date'), lineEl = $('cfg-line'), modelEl = $('cfg-model'),
        shiftEl = $('cfg-shift'), inchargeEl = $('cfg-incharge'), timingEl = $('cfg-timing');

  dateEl.value = todayISO();

  async function loadMasters() {
    const [linesRes, modelsRes, shiftsRes] = await Promise.all([
      sb.from('lines').select('*').eq('active', true).order('line_number'),
      sb.from('models').select('*').eq('active', true).order('model_name'),
      sb.from('shifts').select('*').eq('active', true).order('sort_order'),
    ]);
    LINES = linesRes.data || []; MODELS = modelsRes.data || []; SHIFTS = shiftsRes.data || [];
    lineEl.innerHTML = '<option value="">Select line&hellip;</option>' + LINES.map(l => `<option value="${l.id}">${l.line_number}</option>`).join('');
    modelEl.innerHTML = '<option value="">Select model&hellip;</option>' + MODELS.map(m => `<option value="${m.id}">${m.fg_code} &mdash; ${m.model_name}</option>`).join('');
    shiftEl.innerHTML = '<option value="">Select shift&hellip;</option>' + SHIFTS.map(s => `<option value="${s.id}">${s.shift_name}</option>`).join('');
  }

  function selectedShift() { return SHIFTS.find(s => s.id === shiftEl.value); }
  function selectedLine() { return LINES.find(l => l.id === lineEl.value); }
  function selectedModel() { return MODELS.find(m => m.id === modelEl.value); }

  function updateSelectedInfoBar() {
    const m = selectedModel();
    $('sel-fgcode').textContent = m ? m.fg_code : '\u2014';
    $('sel-modelname').textContent = m ? m.model_name : '\u2014';
    const s = selectedShift();
    $('cfg-timing').value = s ? `${s.start_time.slice(0,5)} - ${s.end_time.slice(0,5)}` : '';
    $('shift-timing-badge').textContent = s ? `${s.shift_name} \u2022 ${s.start_time.slice(0,5)} - ${s.end_time.slice(0,5)}` : 'Select a shift';
  }

  function configReady() {
    return dateEl.value && lineEl.value && modelEl.value && shiftEl.value;
  }

  async function fetchTarget() {
    if (!lineEl.value || !modelEl.value) return 0;
    const { data } = await sb.from('targets').select('target_per_hour').eq('line_id', lineEl.value).eq('model_id', modelEl.value).maybeSingle();
    return data ? Number(data.target_per_hour) : 0;
  }

  async function loadOrInitSlots() {
    if (!configReady()) {
      slots = [];
      renderTable();
      $('shift-summary-card').style.display = 'none';
      return;
    }
    const shift = selectedShift();
    const baseSlots = generateHourlySlots(shift.start_time, shift.end_time);
    defaultTarget = await fetchTarget();

    // does a production_report already exist for this exact combination?
    const { data: existingReport } = await sb.from('production_reports')
      .select('id, shift_incharge')
      .eq('report_date', dateEl.value)
      .eq('shift_id', shiftEl.value)
      .eq('line_id', lineEl.value)
      .eq('model_id', modelEl.value)
      .maybeSingle();

    let existingHourly = [];
    if (existingReport) {
      currentReportId = existingReport.id;
      if (existingReport.shift_incharge && !inchargeEl.value) inchargeEl.value = existingReport.shift_incharge;
      const { data } = await sb.from('hourly_production').select('*').eq('production_report_id', existingReport.id);
      existingHourly = data || [];
    } else {
      currentReportId = null;
    }

    slots = baseSlots.map(bs => {
      const match = existingHourly.find(h => h.time_slot === bs.time_slot);
      if (match) {
        return { ...bs, id: match.id, target_production: match.target_production, overall_production: match.overall_production,
          top_production: match.top_production, bottom_production: match.bottom_production,
          overall_yield: match.overall_yield, top_yield: match.top_yield, bottom_yield: match.bottom_yield,
          issues: match.issues || '', status: match.status, saved_at: match.saved_at };
      }
      return { ...bs, id: null, target_production: defaultTarget, overall_production: 0, top_production: 0, bottom_production: 0,
        overall_yield: 0, top_yield: 0, bottom_yield: 0, issues: '', status: 'pending', saved_at: null };
    });

    renderTable();
    $('shift-summary-card').style.display = '';
    renderSummary();
  }

  function recalcRow(i) {
    const r = slots[i];
    r.overall_yield = calculateOverallYield(r.target_production, r.overall_production);
    r.top_yield = calculateTopYield(r.overall_production, r.top_production);
    r.bottom_yield = calculateBottomYield(r.overall_production, r.bottom_production);
  }

  function pctClass(v) { return v >= 95 ? 'good' : v >= 90 ? 'warn' : 'bad'; }

  function renderMismatchBanner() {
    const problems = slots.filter(r => Number(r.overall_production) > 0 && !checkProductionMatch(r.overall_production, r.top_production, r.bottom_production).ok);
    if (!problems.length) { $('mismatch-alert').innerHTML = ''; return; }
    $('mismatch-alert').innerHTML = `<div class="alert warn">&#9888; <div>
      <b>Top + Bottom production does not match Overall Production</b> for ${problems.length} slot(s): ${problems.map(p => p.time_slot).join(', ')}.
      Please verify the quantities before saving.
    </div></div>`;
  }

  function renderTable() {
    const tbody = $('hourly-body');
    if (!slots.length) {
      tbody.innerHTML = `<tr><td colspan="12" class="empty-state">Select date, line, model and shift to begin</td></tr>`;
      $('slot-progress').textContent = '0 / 0 Hours';
      return;
    }
    const shift = selectedShift();
    const isToday = dateEl.value === todayISO();
    const curIdx = isToday ? currentSlotIndex(shift.start_time, slots) : -1;
    const completed = slots.filter(s => s.status === 'saved' || s.status === 'completed').length;
    $('slot-progress').textContent = `${completed} / ${slots.length} Hours`;

    tbody.innerHTML = slots.map((r, i) => {
      const match = checkProductionMatch(r.overall_production, r.top_production, r.bottom_production);
      const mismatchStyle = (Number(r.overall_production) > 0 && !match.ok) ? 'border:1px solid var(--red-600) !important;background:var(--red-50);' : '';
      const isCurrent = i === curIdx;
      return `
      <tr class="${isCurrent ? 'row-current' : ''}">
        <td class="slot-num">${i + 1}</td>
        <td>${r.time_slot}${isCurrent ? '<span class="badge current" style="margin-left:6px;">Current</span>' : ''}</td>
        <td><span class="badge ${r.status}">${r.status}</span>${r.saved_at ? `<span class="save-timestamp">Saved ${new Date(r.saved_at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</span>` : ''}</td>
        <td><input type="number" min="0" value="${r.target_production}" style="${mismatchStyle}" onchange="window.__prodOnChange(${i},'target_production',this.value)"></td>
        <td><input type="number" min="0" value="${r.overall_production}" style="${mismatchStyle}" onchange="window.__prodOnChange(${i},'overall_production',this.value)"></td>
        <td><input type="number" min="0" value="${r.top_production}" style="${mismatchStyle}" onchange="window.__prodOnChange(${i},'top_production',this.value)"></td>
        <td><input type="number" min="0" value="${r.bottom_production}" style="${mismatchStyle}" onchange="window.__prodOnChange(${i},'bottom_production',this.value)"></td>
        <td class="yield-inline pct ${pctClass(r.overall_yield)}">${r.overall_yield}%</td>
        <td class="yield-inline pct ${pctClass(r.top_yield)}">${r.top_yield}%</td>
        <td class="yield-inline pct ${pctClass(r.bottom_yield)}">${r.bottom_yield}%</td>
        <td class="issue-cell"><input type="text" value="${escapeHtml(r.issues)}" placeholder="None" onchange="window.__prodOnChange(${i},'issues',this.value)"></td>
        <td><button class="btn btn-primary btn-sm" onclick="window.__prodSave(${i})">Save</button></td>
      </tr>`;
    }).join('');
    renderMismatchBanner();
  }

  window.__prodOnChange = function (i, field, value) {
    const r = slots[i];
    if (field === 'issues') r.issues = value;
    else r[field] = value === '' ? 0 : Number(value);
    recalcRow(i);
    renderTable();
  };

  window.__prodSave = async function (i) {
    const r = slots[i];
    const match = checkProductionMatch(r.overall_production, r.top_production, r.bottom_production);
    if (Number(r.overall_production) > 0 && !match.ok) {
      const proceed = confirm(
        `\u26A0 Production mismatch\n\nTop Production + Bottom Production = ${match.sum}\nOverall Production = ${r.overall_production}\nDifference = ${match.diff}\n\nSave anyway?`
      );
      if (!proceed) return;
    }

    try {
      // 1. Ensure the production_report exists (create or reuse)
      if (!currentReportId) {
        const { data: rep, error: repErr } = await sb.from('production_reports')
          .upsert({
            report_date: dateEl.value,
            shift_id: shiftEl.value,
            line_id: lineEl.value,
            model_id: modelEl.value,
            shift_incharge: inchargeEl.value || null,
            created_by: session.id
          }, { onConflict: 'report_date,shift_id,line_id,model_id' })
          .select().single();
        if (repErr) throw repErr;
        currentReportId = rep.id;
      } else if (inchargeEl.value) {
        await sb.from('production_reports').update({ shift_incharge: inchargeEl.value }).eq('id', currentReportId);
      }

      // 2. Upsert the hourly row
      const payload = {
        production_report_id: currentReportId,
        time_slot: r.time_slot,
        slot_order: r.slot_order,
        target_production: r.target_production,
        overall_production: r.overall_production,
        top_production: r.top_production,
        bottom_production: r.bottom_production,
        overall_yield: r.overall_yield,
        top_yield: r.top_yield,
        bottom_yield: r.bottom_yield,
        issues: r.issues,
        status: 'saved',
        saved_at: new Date().toISOString()
      };
      const { data: saved, error: saveErr } = await sb.from('hourly_production')
        .upsert(payload, { onConflict: 'production_report_id,time_slot' })
        .select().single();
      if (saveErr) throw saveErr;

      slots[i] = { ...r, id: saved.id, status: 'saved', saved_at: saved.saved_at };
      renderTable();
      renderSummary();
      showToast(`Saved \u2014 ${r.time_slot}`, 'success');
    } catch (err) {
      console.error(err);
      showToast('Could not save this hour. ' + (err.message || ''), 'error');
    }
  };

  function renderSummary() {
    const summary = calculateSummaryFromRecords(slots);
    const setCard = (id, val) => {
      const el = $(id);
      el.classList.remove('good', 'warn', 'bad');
      el.classList.add(pctClass(val));
      el.querySelector('.value').textContent = val + '%';
    };
    setCard('ss-overall', summary.overallYield);
    setCard('ss-top', summary.topYield);
    setCard('ss-bottom', summary.bottomYield);
    $('ss-completed').textContent = `${summary.completedHours} / ${summary.totalHours}`;
    $('ss-issues').textContent = `${summary.issuesCount} issue(s) logged`;
    $('ss-total-target').textContent = summary.totalTarget.toLocaleString();
    $('ss-total-overall').textContent = summary.totalOverall.toLocaleString();
    $('ss-total-top').textContent = summary.totalTop.toLocaleString();
    $('ss-total-bottom').textContent = summary.totalBottom.toLocaleString();
  }

  [dateEl, lineEl, modelEl, shiftEl].forEach(el => el.addEventListener('change', () => { updateSelectedInfoBar(); loadOrInitSlots(); }));

  (async function init() {
    await loadMasters();
    updateSelectedInfoBar();
    tickTimer = setInterval(() => { if (slots.length) renderTable(); }, 30000);
  })();
})();
