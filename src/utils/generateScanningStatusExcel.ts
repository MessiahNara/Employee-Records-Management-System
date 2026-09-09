import * as ExcelJS from 'exceljs';

export interface ScanningStatusRow {
  no: number;
  abbreviation: string;
  officeName: string;
  totalFiles: number;
  scannedCount: number;
  unscannedCount: number;
  percentage: number;
  status: string;
  remarks: string;
}

export default async function generateScanningStatusExcel(
  title: string,
  rowsData: ScanningStatusRow[]
): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'ERMS - Province of Pangasinan';
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet('Scanning Status', {
    views: [{ showGridLines: true }]
  });

  // Page Setup (Folio / Legal Landscape, 0.5 in margins)
  worksheet.pageSetup = {
    orientation: 'landscape',
    paperSize: 14 as any, // 14 = Folio (8.5 x 13 in)
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: {
      left: 0.25,
      right: 0.25,
      top: 0.25,
      bottom: 0.25,
      header: 0,
      footer: 0,
    }
  };

  // Set column widths
  worksheet.columns = [
    { key: 'no', width: 6 },            // A: NO.
    { key: 'abbr', width: 12 },          // B: ABBREVIATION
    { key: 'officeName', width: 42 },    // C: OFFICE / HOSPITAL NAME
    { key: 'total', width: 14 },         // D: TOTAL FILES
    { key: 'scanned', width: 14 },       // E: SCANNED
    { key: 'pending', width: 14 },       // F: PENDING
    { key: 'progress', width: 14 },      // G: PROGRESS %
    { key: 'status', width: 16 },        // H: STATUS
    { key: 'remarks', width: 32 },       // I: REMARKS
  ];

  // Header Rows
  const headerTexts = [
    'Republic of the Philippines',
    'Province of Pangasinan',
    'Lingayen',
    'HUMAN RESOURCE MGT. & DEVELOPMENT OFFICE',
  ];

  headerTexts.forEach((text, idx) => {
    const rowNum = idx + 1;
    worksheet.mergeCells(`A${rowNum}:I${rowNum}`);
    const cell = worksheet.getCell(`A${rowNum}`);
    cell.value = text;
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.font = {
      name: 'Calibri',
      size: rowNum === 4 ? 11 : 10,
      bold: rowNum === 2 || rowNum === 4,
      italic: rowNum === 1,
    };
  });

  // Title Row (Row 6)
  worksheet.mergeCells('A6:I6');
  const titleCell = worksheet.getCell('A6');
  titleCell.value = title.toUpperCase();
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  titleCell.font = {
    name: 'Calibri',
    size: 13,
    bold: true,
    color: { argb: 'FF0F172A' },
  };
  worksheet.getRow(6).height = 24;

  // Subtitle / Date Row (Row 7)
  worksheet.mergeCells('A7:I7');
  const dateCell = worksheet.getCell('A7');
  dateCell.value = `As of ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`;
  dateCell.alignment = { horizontal: 'center', vertical: 'middle' };
  dateCell.font = { name: 'Calibri', size: 9, italic: true, color: { argb: 'FF475569' } };
  worksheet.getRow(7).height = 18;

  // Table Column Headers (Row 9)
  const tableHeaderRow = worksheet.getRow(9);
  tableHeaderRow.height = 26;

  const colHeaders = [
    'NO.',
    'ABBR.',
    'OFFICE / HOSPITAL NAME',
    'TOTAL FILES',
    'SCANNED',
    'PENDING',
    'PROGRESS %',
    'STATUS',
    'REMARKS',
  ];

  colHeaders.forEach((label, idx) => {
    const cell = tableHeaderRow.getCell(idx + 1);
    cell.value = label;
    cell.alignment = {
      horizontal: idx === 2 || idx === 8 ? 'left' : 'center',
      vertical: 'middle',
      wrapText: true,
    };
    cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1E3A8A' }, // Deep Royal Blue
    };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      bottom: { style: 'medium', color: { argb: 'FF0F172A' } },
      right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    };
  });

  // Populate Data Rows
  let currentRow = 10;
  let sumTotalFiles = 0;
  let sumScanned = 0;
  let sumPending = 0;

  rowsData.forEach((row, i) => {
    const r = worksheet.getRow(currentRow);
    r.height = 20;

    sumTotalFiles += row.totalFiles || 0;
    sumScanned += row.scannedCount || 0;
    sumPending += row.unscannedCount || 0;

    const values = [
      i + 1,
      row.abbreviation || '—',
      row.officeName,
      row.totalFiles,
      row.scannedCount,
      row.unscannedCount,
      `${row.percentage}%`,
      row.status,
      row.remarks || '',
    ];

    const isEven = i % 2 === 1;

    values.forEach((val, idx) => {
      const cell = r.getCell(idx + 1);
      cell.value = val;
      cell.font = {
        name: 'Calibri',
        size: 9.5,
        bold: idx === 1 || idx === 6,
      };

      if (idx === 0 || idx === 1 || idx === 7) {
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      } else if (idx === 2 || idx === 8) {
        cell.alignment = { horizontal: 'left', vertical: 'middle' };
      } else {
        cell.alignment = { horizontal: 'right', vertical: 'middle' };
      }

      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: isEven ? 'FFF8FAFC' : 'FFFFFFFF' },
      };

      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      };
    });

    currentRow++;
  });

  // Summary Totals Row
  const totalRow = worksheet.getRow(currentRow);
  totalRow.height = 24;

  const overallPercentage = sumTotalFiles > 0 ? Math.round((sumScanned / sumTotalFiles) * 100) : 0;

  const totalValues = [
    '',
    '',
    'TOTAL / SUMMARY',
    sumTotalFiles,
    sumScanned,
    sumPending,
    `${overallPercentage}%`,
    overallPercentage === 100 ? 'Completed' : 'In Progress',
    '',
  ];

  totalValues.forEach((val, idx) => {
    const cell = totalRow.getCell(idx + 1);
    cell.value = val;
    cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF0F172A' } };
    if (idx === 2) {
      cell.alignment = { horizontal: 'left', vertical: 'middle' };
    } else if (idx >= 3 && idx <= 6) {
      cell.alignment = { horizontal: 'right', vertical: 'middle' };
    } else {
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
    }

    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE2E8F0' },
    };

    cell.border = {
      top: { style: 'medium', color: { argb: 'FF1E293B' } },
      left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      bottom: { style: 'double', color: { argb: 'FF1E293B' } },
      right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    };
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return buffer as ArrayBuffer;
}
