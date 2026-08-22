// ==========================================================
// PDF-EXPORT.JS
// ==========================================================

function exportProductionPDF(rows, meta, summary, perShiftSummaries) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const navy = [16, 27, 61];
  const green = [22, 163, 74];

  doc.setFontSize(16);
  doc.setTextColor(...navy);
  doc.text('MOTHERBOARD PRODUCTION REPORT', 40, 40);

  doc.setFontSize(10);
  doc.setTextColor(90, 90, 90);
  doc.text(meta.title || '', 40, 58);

  doc.autoTable({
    startY: 72,
    head: [['Date', 'Shift', 'Line', 'FG Code', 'Model', 'Time Slot', 'Target', 'Overall', 'O.Yield%', 'Top', 'T.Yield%', 'Bottom', 'B.Yield%', 'Issues']],
    body: rows.map(r => [
      isoToDisplay(r.report_date), r.shift_name, r.line_number, r.fg_code, r.model_name, r.time_slot,
      r.target_production, r.overall_production, r.overall_yield,
      r.top_production, r.top_yield, r.bottom_production, r.bottom_yield, r.issues || ''
    ]),
    styles: { fontSize: 8, cellPadding: 4 },
    headStyles: { fillColor: navy, textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [246, 248, 252] },
    margin: { left: 40, right: 40 }
  });

  let y = doc.lastAutoTable.finalY + 20;
  doc.setFontSize(12);
  doc.setTextColor(...navy);
  doc.text('SHIFT SUMMARY', 40, y);
  y += 8;

  doc.autoTable({
    startY: y,
    head: [['Total Target', 'Total Overall', 'Overall Yield %', 'Total Top', 'Top Yield %', 'Total Bottom', 'Bottom Yield %', 'Issues', 'Completed Hours']],
    body: [[
      summary.totalTarget, summary.totalOverall, summary.overallYield + '%',
      summary.totalTop, summary.topYield + '%', summary.totalBottom, summary.bottomYield + '%',
      summary.issuesCount, `${summary.completedHours} / ${summary.totalHours}`
    ]],
    styles: { fontSize: 9, cellPadding: 5 },
    headStyles: { fillColor: green, textColor: 255, fontStyle: 'bold' },
    margin: { left: 40, right: 40 }
  });

  if (perShiftSummaries && perShiftSummaries.length > 1) {
    y = doc.lastAutoTable.finalY + 20;
    doc.setFontSize(12);
    doc.setTextColor(...navy);
    doc.text('FULL DAY / WEEK SUMMARY', 40, y);
    y += 8;
    doc.autoTable({
      startY: y,
      head: [['Shift', 'Overall Prod.', 'Overall Yield %', 'Top Prod.', 'Top Yield %', 'Bottom Prod.', 'Bottom Yield %', 'Issues', 'Completed Hrs']],
      body: perShiftSummaries.map(s => [
        s.label, s.summary.totalOverall, s.summary.overallYield + '%', s.summary.totalTop, s.summary.topYield + '%',
        s.summary.totalBottom, s.summary.bottomYield + '%', s.summary.issuesCount, `${s.summary.completedHours}/${s.summary.totalHours}`
      ]),
      styles: { fontSize: 9, cellPadding: 5 },
      headStyles: { fillColor: navy, textColor: 255, fontStyle: 'bold' },
      margin: { left: 40, right: 40 }
    });
  }

  doc.save(`Production_Report_${meta.fileLabel}.pdf`);
}
