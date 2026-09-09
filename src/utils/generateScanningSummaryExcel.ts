import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';

export interface ReportOfficeRow {
  abbreviation: string;
  name?: string;
  type: 'Department' | 'Hospital';
  employees: {
    regular: number;
    casual: number;
    jobOrder: number;
    consultant: number;
    total: number;
  };
  pdf: {
    regular: number;
    casual: number;
    jobOrder: number;
    consultant: number;
    total: number;
  };
  file201: {
    regular: number;
    casual: number;
    jobOrder: number;
    consultant: number;
    total: number;
  };
  remarks?: string;
}

export interface ReportTotals {
  employees: {
    regular: number;
    casual: number;
    jobOrder: number;
    consultant: number;
    total: number;
  };
  pdf: {
    regular: number;
    casual: number;
    jobOrder: number;
    consultant: number;
    total: number;
  };
  file201: {
    regular: number;
    casual: number;
    jobOrder: number;
    consultant: number;
    total: number;
  };
}

export interface ScanningSummaryExportOptions {
  rows: ReportOfficeRow[];
  totals: ReportTotals;
  asOfDate?: string;
  dateFrom?: string;
  dateTo?: string;
}

/**
 * Generates and downloads the Scanning Summary Report Excel file
 * based on the official SCANNING SUMMARY FORMAT with the Overall column removed.
 */
export async function generateScanningSummaryExcel(options: ScanningSummaryExportOptions): Promise<void> {
  const { rows, totals, asOfDate } = options;
  const formattedAsOf = asOfDate || new Date().toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  const workbook = new ExcelJS.Workbook();
  let loadedFromTemplate = false;

  // 1. Attempt to load the official template (via Electron IPC or browser fetch)
  try {
    if (typeof window !== 'undefined' && (window as any).electron?.getScanningTemplateFile) {
      const arrayBuffer = await (window as any).electron.getScanningTemplateFile();
      await workbook.xlsx.load(arrayBuffer);
      loadedFromTemplate = true;
    } else {
      const res = await fetch('/SCANNING SUMMARY FORMAT.xlsx');
      if (res.ok) {
        const arrayBuffer = await res.arrayBuffer();
        await workbook.xlsx.load(arrayBuffer);
        loadedFromTemplate = true;
      }
    }
  } catch (err) {
    console.warn('Could not load template file directly, falling back to programmatic creation:', err);
  }

  if (loadedFromTemplate && workbook.getWorksheet('Office Scanning Tracker')) {
    populateWorkbook(workbook, rows, totals, formattedAsOf);
  } else {
    buildWorkbookFromScratch(workbook, rows, totals, formattedAsOf);
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });

  const dateSlug = new Date().toISOString().slice(0, 10);
  const fileName = `Scanning_Summary_Report_${dateSlug}.xlsx`;
  saveAs(blob, fileName);
}

/**
 * Sets up and populates the Office Scanning Tracker worksheet
 * ensuring exact formatting, colors, alignments, and paper setup.
 */
function populateWorkbook(
  workbook: ExcelJS.Workbook,
  rows: ReportOfficeRow[],
  totals: ReportTotals,
  asOfDate: string
) {
  // Guarantee NO other sheets exist in the workbook
  const extraSheets = workbook.worksheets.filter((w) => w.name !== 'Office Scanning Tracker');
  extraSheets.forEach((w) => workbook.removeWorksheet(w.id));

  let ws = workbook.getWorksheet('Office Scanning Tracker');
  if (!ws) {
    ws = workbook.addWorksheet('Office Scanning Tracker');
  }

  applySheetStructureAndData(ws, rows, totals, asOfDate);
}

/**
 * Builds the complete workbook from scratch matching the template design
 */
function buildWorkbookFromScratch(
  workbook: ExcelJS.Workbook,
  rows: ReportOfficeRow[],
  totals: ReportTotals,
  asOfDate: string
) {
  const ws = workbook.addWorksheet('Office Scanning Tracker');
  applySheetStructureAndData(ws, rows, totals, asOfDate);
}

/**
 * Shared layout, header styling, and row populator
 */
function applySheetStructureAndData(
  ws: ExcelJS.Worksheet,
  rows: ReportOfficeRow[],
  totals: ReportTotals,
  asOfDate: string
) {
  ws.state = 'visible';
  ws.views = [{ showGridLines: true }];

  // 1. Page Setup: 8.5 by 13 inches (Folio / Philippine Legal, code 14) in Landscape
  ws.pageSetup = {
    orientation: 'landscape',
    paperSize: 14 as any,
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: { left: 0.25, right: 0.25, top: 0.3, bottom: 0.4, header: 0.2, footer: 0.2 },
  };

  // 2. Set Column Widths (18 Columns total, A through R, NO Overall column)
  const colWidths: Record<number, number> = {
    1: 6,   // A: No.
    2: 20,  // B: Office / Hospital (Abbreviation)
    3: 10,  // C: Regular Emp
    4: 10,  // D: Casual Emp
    5: 11,  // E: Job Order Emp
    6: 11,  // F: Consultant Emp
    7: 14,  // G: Total Emp
    8: 10,  // H: Regular PDF
    9: 10,  // I: Casual PDF
    10: 11, // J: Job Order PDF
    11: 11, // K: Consultant PDF
    12: 14, // L: Total PDF
    13: 10, // M: Regular 201
    14: 10, // N: Casual 201
    15: 11, // O: Job Order 201
    16: 11, // P: Consultant 201
    17: 14, // Q: Total 201
    18: 28, // R: Remarks / Progress Notes
  };

  for (let c = 1; c <= 18; c++) {
    ws.getColumn(c).width = colWidths[c];
  }

  // Clear any existing merged ranges
  const mergesToUnmerge = [...(ws.model.merges || [])];
  mergesToUnmerge.forEach((m) => {
    try { ws.unMergeCells(m); } catch (e) {}
  });

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
  for (let r = 2; r <= 5; r++) {
    ws.getRow(r).height = 16;
  }

  // Tier 1 Merges (Row 6)
  ws.mergeCells('A6:A8');
  ws.getCell('A6').value = 'No.';

  ws.mergeCells('B6:B8');
  ws.getCell('B6').value = 'Office / Hospital';

  ws.mergeCells('C6:G6');
  ws.getCell('C6').value = `Number of Employees as of ${asOfDate}`;

  ws.mergeCells('H6:L6');
  ws.getCell('H6').value = 'Position Description Form (PDF)';

  ws.mergeCells('M6:Q6');
  ws.getCell('M6').value = '201 File';

  ws.mergeCells('R6:R8');
  ws.getCell('R6').value = 'Remarks / Progress Notes';

  // Tier 2 Merges (Row 7)
  ws.mergeCells('C7:C8');
  ws.getCell('C7').value = 'Regular';

  ws.mergeCells('D7:F7');
  ws.getCell('D7').value = 'Non-Regular';

  ws.mergeCells('G7:G8');
  ws.getCell('G7').value = 'Total Number of Employees';

  ws.mergeCells('H7:H8');
  ws.getCell('H7').value = 'Regular';

  ws.mergeCells('I7:K7');
  ws.getCell('I7').value = 'Non-Regular';

  ws.mergeCells('L7:L8');
  ws.getCell('L7').value = 'Total Scanned PDF';

  ws.mergeCells('M7:M8');
  ws.getCell('M7').value = 'Regular';

  ws.mergeCells('N7:P7');
  ws.getCell('N7').value = 'Non-Regular';

  ws.mergeCells('Q7:Q8');
  ws.getCell('Q7').value = 'Total Scanned 201 File';

  // Tier 3 Values (Row 8)
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

  // Header Color Palettes
  const headerBorder: Partial<ExcelJS.Borders> = {
    top: { style: 'thin', color: { argb: 'FF94A3B8' } },
    bottom: { style: 'thin', color: { argb: 'FF94A3B8' } },
    left: { style: 'thin', color: { argb: 'FF94A3B8' } },
    right: { style: 'thin', color: { argb: 'FF94A3B8' } },
  };

  const fillNavy: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E78' } };
  const fillBlueEmp: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2E75B6' } };
  const fillSkyPdf: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0284C7' } };
  const fillTeal201: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0D9488' } };

  // Row 6 styling
  for (let c = 1; c <= 18; c++) {
    const cell = ws.getRow(6).getCell(c);
    cell.border = headerBorder;
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    if (c === 1 || c === 2 || c === 18) {
      cell.fill = fillNavy;
      cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    } else if (c >= 3 && c <= 7) {
      cell.fill = fillBlueEmp;
      cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    } else if (c >= 8 && c <= 12) {
      cell.fill = fillSkyPdf;
      cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    } else if (c >= 13 && c <= 17) {
      cell.fill = fillTeal201;
      cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    }
  }

  // Row 7 & 8 Subheader styling
  const fillSubEmp: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } };
  const fillSubEmpTot: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFB4C6E7' } };
  const fillSubPdf: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0F2FE' } };
  const fillSubPdfTot: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFBAE6FD' } };
  const fillSub201: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFCCFBF1' } };
  const fillSub201Tot: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF99F6E4' } };

  for (let r = 7; r <= 8; r++) {
    const row = ws.getRow(r);
    for (let c = 1; c <= 18; c++) {
      const cell = row.getCell(c);
      cell.border = headerBorder;
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };

      if (c === 1 || c === 2 || c === 18) {
        cell.fill = fillNavy;
        cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
      } else if (c >= 3 && c <= 6) {
        cell.fill = fillSubEmp;
        cell.font = { name: 'Calibri', size: 9, bold: true, color: { argb: 'FF1F4E78' } };
      } else if (c === 7) {
        cell.fill = fillSubEmpTot;
        cell.font = { name: 'Calibri', size: 9, bold: true, color: { argb: 'FF1F4E78' } };
      } else if (c >= 8 && c <= 11) {
        cell.fill = fillSubPdf;
        cell.font = { name: 'Calibri', size: 9, bold: true, color: { argb: 'FF0369A1' } };
      } else if (c === 12) {
        cell.fill = fillSubPdfTot;
        cell.font = { name: 'Calibri', size: 9, bold: true, color: { argb: 'FF0369A1' } };
      } else if (c >= 13 && c <= 16) {
        cell.fill = fillSub201;
        cell.font = { name: 'Calibri', size: 9, bold: true, color: { argb: 'FF0F766E' } };
      } else if (c === 17) {
        cell.fill = fillSub201Tot;
        cell.font = { name: 'Calibri', size: 9, bold: true, color: { argb: 'FF0F766E' } };
      }
    }
  }

  // Clear any existing rows past row 8 and break any inherited row styles
  const existingMax = Math.max(ws.rowCount, 100);
  for (let r = 9; r <= existingMax; r++) {
    const row = ws.getRow(r);
    (row as any).style = {};
    for (let c = 1; c <= 20; c++) {
      const cell = row.getCell(c);
      cell.value = null;
      cell.style = {};
    }
  }

  // Data rows starting at row 9
  const dataBorder: Partial<ExcelJS.Borders> = {
    top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
  };

  let currentRow = 9;
  rows.forEach((item, index) => {
    const r = ws.getRow(currentRow);
    r.height = 22;
    (r as any).style = {};
    const isEven = index % 2 === 0;
    const bgRow = isEven ? 'FFFFFFFF' : 'FFF8FAFC';

    const values = [
      index + 1,                                                // A: No.
      item.abbreviation,                                        // B: Office / Hospital (Abbreviation)
      item.employees.regular || 0,                              // C: Employees Regular
      item.employees.casual || 0,                       // D: Employees Casual
      item.employees.jobOrder || 0,                     // E: Employees Job Order
      item.employees.consultant || 0,                   // F: Employees Consultant
      item.employees.total || 0,                        // G: Employees Total
      item.pdf?.regular || 0,                           // H: PDF Regular
      item.pdf?.casual || 0,                            // I: PDF Casual
      item.pdf?.jobOrder || 0,                          // J: PDF Job Order
      item.pdf?.consultant || 0,                        // K: PDF Consultant
      item.pdf?.total || 0,                             // L: PDF Total
      item.file201?.regular || 0,                       // M: 201 Regular
      item.file201?.casual || 0,                        // N: 201 Casual
      item.file201?.jobOrder || 0,                      // O: 201 Job Order
      item.file201?.consultant || 0,                    // P: 201 Consultant
      item.file201?.total || 0,                         // Q: 201 Total
      item.remarks || '',                               // R: Remarks / Progress Notes
    ];

    values.forEach((val, idx) => {
      const cell = r.getCell(idx + 1);
      cell.style = {}; // Break any shared row style reference
      cell.value = val;
      cell.border = dataBorder;
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgRow } };

      if (idx === 0) {
        // No. -> Middle Center
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.font = { name: 'Calibri', size: 10, color: { argb: 'FF475569' } };
      } else if (idx === 1) {
        // Office / Hospital -> Middle Left
        cell.alignment = { horizontal: 'left', vertical: 'middle' };
        cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF1E293B' } };
      } else if (idx >= 2 && idx <= 16) {
        // Numbers in Middle Center
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        if (idx === 6) {
          // Total Emp
          cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF1E293B' } };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
        } else if (idx === 11) {
          // Total PDF
          cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF0369A1' } };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F9FF' } };
        } else if (idx === 16) {
          // Total 201
          cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF0F766E' } };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0FDFA' } };
        } else {
          cell.font = { name: 'Calibri', size: 10, color: { argb: 'FF334155' } };
        }
      } else {
        // Remarks / Progress Notes -> Middle Left with wrapText
        cell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
        cell.font = { name: 'Calibri', size: 10, color: { argb: 'FF334155' } };
      }
    });

    currentRow++;
  });

  // Grand Total Row
  const totalRowNumber = currentRow;
  const totRow = ws.getRow(totalRowNumber);
  totRow.height = 25;
  (totRow as any).style = {};
  for (let c = 1; c <= 20; c++) {
    totRow.getCell(c).style = {};
  }

  const totalBorder: Partial<ExcelJS.Borders> = {
    top: { style: 'medium', color: { argb: 'FF1F4E78' } },
    bottom: { style: 'double', color: { argb: 'FF1F4E78' } },
    left: { style: 'thin', color: { argb: 'FF94A3B8' } },
    right: { style: 'thin', color: { argb: 'FF94A3B8' } },
  };

  const totalValues = [
    '',                                                // A
    'TOTAL',                                           // B
    totals.employees.regular,                          // C
    totals.employees.casual,                           // D
    totals.employees.jobOrder,                         // E
    totals.employees.consultant,                       // F
    totals.employees.total,                            // G
    totals.pdf.regular,                                // H
    totals.pdf.casual,                                 // I
    totals.pdf.jobOrder,                               // J
    totals.pdf.consultant,                             // K
    totals.pdf.total,                                  // L
    totals.file201.regular,                            // M
    totals.file201.casual,                             // N
    totals.file201.jobOrder,                           // O
    totals.file201.consultant,                         // P
    totals.file201.total,                              // Q
    '',                                                // R: Remarks
  ];

  totalValues.forEach((val, idx) => {
    const cell = totRow.getCell(idx + 1);
    cell.value = val;
    cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF0F172A' } };
    cell.border = totalBorder;
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFD9E1F2' },
    };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
  });
}

export default generateScanningSummaryExcel;
