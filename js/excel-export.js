// ==========================================================
// EXCEL-EXPORT.JS
// ==========================================================

/**
 * rows: flattened hourly records with joined display fields:
 *   { report_date, shift_name, line_number, fg_code, model_name, time_slot,
 *     target_production, overall_production, overall_yield,
 *     top_production, top_yield, bottom_production, bottom_yield, issues }
 * meta: { fileLabel, title }
 * summary: overall calculateSummaryFromRecords() result for the whole export
 * perShiftSummaries: [{ label, summary }] e.g. A/B/C shift breakdown for a full-day export
 */
function exportProductionExcel(rows, meta, summary, perShiftSummaries) {
  const header = ['Date', 'Shift', 'Line', 'FG Code', 'Model Name', 'Time Slot',
    'Target Production', 'Overall Production', 'Overall Yield %',
    'Top Production', 'Top Yield %', 'Bottom Production', 'Bottom Yield %', 'Issues'];

  const aoa = [header];
  rows.forEach(r => {
    aoa.push([
      isoToDisplay(r.report_date), r.shift_name, r.line_number, r.fg_code, r.model_name, r.time_slot,
      r.target_production, r.overall_production, Number(r.overall_yield),
      r.top_production, Number(r.top_yield), r.bottom_production, Number(r.bottom_yield),
      r.issues || ''
    ]);
  });

  aoa.push([]);
  aoa.push(['SHIFT SUMMARY']);
  aoa.push(['Total Target', summary.totalTarget, '', 'Total Overall Production', summary.totalOverall]);
  aoa.push(['Overall Yield %', summary.overallYield, '', 'Top Production', summary.totalTop, 'Top Yield %', summary.topYield]);
  aoa.push(['Bottom Production', summary.totalBottom, 'Bottom Yield %', summary.bottomYield]);
  aoa.push(['Issues', summary.issuesCount, 'Completed Hours', `${summary.completedHours} / ${summary.totalHours}`]);

  if (perShiftSummaries && perShiftSummaries.length > 1) {
    aoa.push([]);
    aoa.push(['FULL DAY / WEEK SUMMARY BY SHIFT']);
    aoa.push(['Shift', 'Overall Production', 'Overall Yield %', 'Top Production', 'Top Yield %', 'Bottom Production', 'Bottom Yield %', 'Issues', 'Completed Hours']);
    perShiftSummaries.forEach(s => {
      aoa.push([s.label, s.summary.totalOverall, s.summary.overallYield, s.summary.totalTop, s.summary.topYield,
        s.summary.totalBottom, s.summary.bottomYield, s.summary.issuesCount, `${s.summary.completedHours}/${s.summary.totalHours}`]);
    });
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa);

  // column widths
  ws['!cols'] = [
    { wch: 12 }, { wch: 10 }, { wch: 8 }, { wch: 16 }, { wch: 20 }, { wch: 14 },
    { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 22 }
  ];

  // freeze header row
  ws['!views'] = [{ state: 'frozen', ySplit: 1, topLeftCell: 'A2', activePane: 'bottomLeft' }];

  // number format for yield % columns (I, K, M => indices 8,10,12 zero-based)
  const range = XLSX.utils.decode_range(ws['!ref']);
  for (let R = 1; R <= rows.length; R++) {
    [8, 10, 12].forEach(C => {
      const addr = XLSX.utils.encode_cell({ r: R, c: C });
      if (ws[addr]) ws[addr].z = '0.00"%"';
    });
  }

  // bold header row (supported when the SheetJS build includes cell styling)
  header.forEach((_, C) => {
    const addr = XLSX.utils.encode_cell({ r: 0, c: C });
    if (ws[addr]) {
      ws[addr].s = {
        font: { bold: true, color: { rgb: 'FFFFFF' } },
        fill: { fgColor: { rgb: '10203F' } },
        alignment: { horizontal: 'center' },
        border: { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } }
      };
    }
  });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Production Report');
  XLSX.writeFile(wb, `Production_Report_${meta.fileLabel}.xlsx`);
}
