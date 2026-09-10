const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs');

async function createCleanTemplate() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Office Scanning Tracker', {
    views: [{ showGridLines: true }]
  });

  ws.pageSetup = {
    orientation: 'landscape',
    paperSize: 14, // Folio / Legal
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: { left: 0.25, right: 0.25, top: 0.3, bottom: 0.4, header: 0.2, footer: 0.2 },
  };

  const colWidths = {
    1: 6, 2: 24, 3: 11, 4: 11, 5: 12, 6: 12, 7: 15,
    8: 11, 9: 11, 10: 12, 11: 12, 12: 15,
    13: 11, 14: 11, 15: 12, 16: 12, 17: 15, 18: 30
  };
  for (let c = 1; c <= 18; c++) {
    ws.getColumn(c).width = colWidths[c];
  }

  // Row 1: Title
  ws.mergeCells('A1:R1');
  const cellA1 = ws.getCell('A1');
  cellA1.value = 'DOCUMENT SCANNING DETAILED TRACKER';
  cellA1.font = { name: 'Calibri', size: 16, bold: true, color: { argb: 'FF1F4E78' } };
  cellA1.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 28;

  // Rows 2 to 5: Subtitle
  ws.mergeCells('A2:R5');
  const cellA2 = ws.getCell('A2');
  cellA2.value = 'Human Resource Management and Development Office\nProvincial Government of Pangasinan\nComplete Offices & Hospitals Scanning Status';
  cellA2.font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF334155' } };
  cellA2.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  for (let r = 2; r <= 5; r++) ws.getRow(r).height = 16;

  // Tier 1 (Row 6)
  ws.mergeCells('A6:A8');
  ws.getCell('A6').value = 'No.';
  ws.mergeCells('B6:B8');
  ws.getCell('B6').value = 'Office / Hospital';
  ws.mergeCells('C6:G6');
  ws.getCell('C6').value = 'Number of Active Employees';
  ws.mergeCells('H6:L6');
  ws.getCell('H6').value = 'Position Description Form (PDF)';
  ws.mergeCells('M6:Q6');
  ws.getCell('M6').value = '201 File';
  ws.mergeCells('R6:R8');
  ws.getCell('R6').value = 'Remarks / Progress Notes';

  // Tier 2 (Row 7)
  ws.mergeCells('C7:C8');
  ws.getCell('C7').value = 'Regular';
  ws.mergeCells('D7:F7');
  ws.getCell('D7').value = 'Non-Regular';
  ws.mergeCells('G7:G8');
  ws.getCell('G7').value = 'Total';

  ws.mergeCells('H7:H8');
  ws.getCell('H7').value = 'Regular';
  ws.mergeCells('I7:K7');
  ws.getCell('I7').value = 'Non-Regular';
  ws.mergeCells('L7:L8');
  ws.getCell('L7').value = 'Total PDF';

  ws.mergeCells('M7:M8');
  ws.getCell('M7').value = 'Regular';
  ws.mergeCells('N7:P7');
  ws.getCell('N7').value = 'Non-Regular';
  ws.mergeCells('Q7:Q8');
  ws.getCell('Q7').value = 'Total 201 File';

  // Tier 3 (Row 8)
  ws.getCell('D8').value = 'Casual';
  ws.getCell('E8').value = 'Job Order';
  ws.getCell('F8').value = 'Consultant';
  ws.getCell('I8').value = 'Casual';
  ws.getCell('J8').value = 'Job Order';
  ws.getCell('K8').value = 'Consultant';
  ws.getCell('N8').value = 'Casual';
  ws.getCell('O8').value = 'Job Order';
  ws.getCell('P8').value = 'Consultant';

  ws.getRow(6).height = 28;
  ws.getRow(7).height = 22;
  ws.getRow(8).height = 22;

  const headerBorder = {
    top: { style: 'thin', color: { argb: 'FF94A3B8' } },
    bottom: { style: 'thin', color: { argb: 'FF94A3B8' } },
    left: { style: 'thin', color: { argb: 'FF94A3B8' } },
    right: { style: 'thin', color: { argb: 'FF94A3B8' } },
  };

  const fillNavy = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E78' } };
  const fillBlueEmp = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2E75B6' } };
  const fillSkyPdf = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0284C7' } };
  const fillTeal201 = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0D9488' } };

  for (let c = 1; c <= 18; c++) {
    const cell = ws.getRow(6).getCell(c);
    cell.border = headerBorder;
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    if (c <= 2 || c === 18) {
      cell.fill = fillNavy;
      cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    } else if (c <= 7) {
      cell.fill = fillBlueEmp;
      cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    } else if (c <= 12) {
      cell.fill = fillSkyPdf;
      cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    } else {
      cell.fill = fillTeal201;
      cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    }
  }

  const fillSubEmp = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } };
  const fillSubEmpTot = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFB4C6E7' } };
  const fillSubPdf = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0F2FE' } };
  const fillSubPdfTot = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFBAE6FD' } };
  const fillSub201 = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFCCFBF1' } };
  const fillSub201Tot = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF99F6E4' } };

  for (let r = 7; r <= 8; r++) {
    const row = ws.getRow(r);
    for (let c = 1; c <= 18; c++) {
      const cell = row.getCell(c);
      cell.border = headerBorder;
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      if (c <= 2 || c === 18) {
        cell.fill = fillNavy;
        cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
      } else if (c <= 6) {
        cell.fill = fillSubEmp;
        cell.font = { name: 'Calibri', size: 9, bold: true, color: { argb: 'FF1F4E78' } };
      } else if (c === 7) {
        cell.fill = fillSubEmpTot;
        cell.font = { name: 'Calibri', size: 9, bold: true, color: { argb: 'FF1F4E78' } };
      } else if (c <= 11) {
        cell.fill = fillSubPdf;
        cell.font = { name: 'Calibri', size: 9, bold: true, color: { argb: 'FF0369A1' } };
      } else if (c === 12) {
        cell.fill = fillSubPdfTot;
        cell.font = { name: 'Calibri', size: 9, bold: true, color: { argb: 'FF0369A1' } };
      } else if (c <= 16) {
        cell.fill = fillSub201;
        cell.font = { name: 'Calibri', size: 9, bold: true, color: { argb: 'FF0F766E' } };
      } else if (c === 17) {
        cell.fill = fillSub201Tot;
        cell.font = { name: 'Calibri', size: 9, bold: true, color: { argb: 'FF0F766E' } };
      }
    }
  }

  wb.views = [{ x: 0, y: 0, width: 10000, height: 20000, firstSheet: 0, activeTab: 0, visibility: 'visible' }];

  const publicPath = path.join(__dirname, '../public/SCANNING SUMMARY FORMAT.xlsx');
  await wb.xlsx.writeFile(publicPath);
  console.log('Wrote clean template to:', publicPath);

  const distPath = path.join(__dirname, '../dist/SCANNING SUMMARY FORMAT.xlsx');
  if (fs.existsSync(path.dirname(distPath))) {
    await wb.xlsx.writeFile(distPath);
    console.log('Wrote clean template to:', distPath);
  }
}

createCleanTemplate().catch(console.error);
