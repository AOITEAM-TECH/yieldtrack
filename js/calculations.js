// ==========================================================
// CALCULATIONS.JS
// Every yield number in this app is derived from quantities.
// Never averaged from other percentages. Never entered by hand.
// ==========================================================

function round2(n) {
  if (!isFinite(n)) return 0;
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Overall Yield = Overall Production / Target Production x 100 */
function calculateOverallYield(target, overallProduction) {
  target = Number(target) || 0;
  overallProduction = Number(overallProduction) || 0;
  if (target === 0) return 0;
  return round2((overallProduction / target) * 100);
}

/** Top Yield = Top Production / Overall Production x 100 */
function calculateTopYield(overallProduction, topProduction) {
  overallProduction = Number(overallProduction) || 0;
  topProduction = Number(topProduction) || 0;
  if (overallProduction === 0) return 0;
  return round2((topProduction / overallProduction) * 100);
}

/** Bottom Yield = Bottom Production / Overall Production x 100 */
function calculateBottomYield(overallProduction, bottomProduction) {
  overallProduction = Number(overallProduction) || 0;
  bottomProduction = Number(bottomProduction) || 0;
  if (overallProduction === 0) return 0;
  return round2((bottomProduction / overallProduction) * 100);
}

/** Does Top + Bottom match Overall? Returns {ok, diff} */
function checkProductionMatch(overallProduction, topProduction, bottomProduction) {
  overallProduction = Number(overallProduction) || 0;
  topProduction = Number(topProduction) || 0;
  bottomProduction = Number(bottomProduction) || 0;
  const sum = topProduction + bottomProduction;
  const diff = round2(overallProduction - sum);
  return { ok: Math.abs(diff) < 0.001, sum, diff };
}

/**
 * Totals-based summary (used for shift summary, daily summary,
 * line-wise report, model-wise report, dashboard, Excel, PDF).
 * records: array of {target_production, overall_production, top_production, bottom_production, issues, status}
 */
function calculateSummaryFromRecords(records) {
  const totals = records.reduce((acc, r) => {
    acc.target += Number(r.target_production) || 0;
    acc.overall += Number(r.overall_production) || 0;
    acc.top += Number(r.top_production) || 0;
    acc.bottom += Number(r.bottom_production) || 0;
    acc.issues += (r.issues && String(r.issues).trim() && String(r.issues).trim().toLowerCase() !== 'none') ? 1 : 0;
    acc.completed += (r.status === 'saved' || r.status === 'completed') ? 1 : 0;
    acc.total += 1;
    return acc;
  }, { target: 0, overall: 0, top: 0, bottom: 0, issues: 0, completed: 0, total: 0 });

  return {
    totalTarget: totals.target,
    totalOverall: totals.overall,
    totalTop: totals.top,
    totalBottom: totals.bottom,
    overallYield: calculateOverallYield(totals.target, totals.overall),
    topYield: calculateTopYield(totals.overall, totals.top),
    bottomYield: calculateBottomYield(totals.overall, totals.bottom),
    issuesCount: totals.issues,
    completedHours: totals.completed,
    totalHours: totals.total
  };
}

// Kept as named aliases per spec section 52
function calculateShiftSummary(records) { return calculateSummaryFromRecords(records); }
function calculateDailySummary(records) { return calculateSummaryFromRecords(records); }

function yieldColor(pct) {
  if (pct >= 95) return 'good';
  if (pct >= 90) return 'warn';
  return 'bad';
}
