// @ts-ignore
import ExcelJS from 'exceljs';

export interface AOStatusExportData {
  monthFrom?: string;
  monthTo?: string;
  seriesYear?: string;
  records: Array<{
    nameOfEmployee: string;
    position: string;
    motherUnit: string;
    detailedOffice: string;
    designatedPosition: string;
    recalledFrom: string;
    recalledTo: string;
    durationFrom: string;
    durationTo: string;
    adminOrderNo: string;
  }>;
  visibleColumns?: Record<string, boolean>;
}

/**
 * Isolated service to generate the AO Status Designated Excel buffer.
 */
export default async function generateAOStatusDesignatedExcel(data: AOStatusExportData): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('AO Status Designated');

  // Configure for 8.5 x 13 (Legal/Folio size)
  worksheet.pageSetup = {
    paperSize: 5 as any, // 5 = Legal (8.5 x 14) to prevent A4 fallback
    orientation: 'landscape',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: { left: 0.6 / 2.54, right: 0.6 / 2.54, top: 0.6 / 2.54, bottom: 1.0 / 2.54, header: 0.3 / 2.54, footer: 0 }
  };

  const { monthFrom, monthTo, seriesYear, records } = data;

  const getMonthName = (monthValue: string): string => {
    const months = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];
    const monthNum = parseInt(monthValue, 10);
    if (!isNaN(monthNum) && monthNum >= 1 && monthNum <= 12) {
      return months[monthNum - 1];
    }
    return monthValue.toUpperCase();
  };

  const monthFromName = monthFrom ? getMonthName(monthFrom) : '';
  const monthToName = monthTo ? getMonthName(monthTo) : '';

  let headerText = 'LIST OF EMPLOYEES WITH ADMINISTRATIVE ORDERS';
  if (monthFrom && monthTo && seriesYear) {
    headerText += ` ISSUED FROM ${monthFromName} - ${monthToName} ${seriesYear}`;
  } else if (monthFrom && seriesYear) {
    headerText += ` ISSUED FOR ${monthFromName} ${seriesYear}`;
  } else if (seriesYear) {
    headerText += ` ISSUED FOR SERIES YEAR ${seriesYear}`;
  } else {
    // If no specific filters were passed, use the literal template placeholder text
    headerText += ' ISSUED FROM MONTH - MONTH YEAR';
  }

  // Dynamically build the columns based on visibility
  const visibleColumns = data.visibleColumns || {};

  const colDefs = [
    { key: 'no', label: 'NO.', width: 5 },
    { key: 'name', label: 'Name of Employee', width: 25 },
    { key: 'motherUnit', label: 'Mother Unit', width: 25, show: visibleColumns.motherUnit !== false },
    { key: 'designatedPosition', label: 'Designated Position', width: 20, show: visibleColumns.designatedPositionFunction !== false },
    { key: 'durationFrom', label: 'From', width: 13, show: visibleColumns.durationFrom !== false, group: 'Duration of Detailed Order' },
    { key: 'durationTo', label: 'To', width: 13, show: visibleColumns.durationTo !== false, group: 'Duration of Detailed Order' },
    { key: 'administrativeOrder', label: 'Administrative Order No.', width: 20, show: visibleColumns.administrativeOrder !== false }
  ].filter(c => c.show !== false);

  const totalCols = colDefs.length;
  const endLetter = worksheet.getColumn(totalCols).letter;

  // Row 1-4: Standard Government Header
  const headerTexts = [
    'Republic of the Philippines',
    'Province of Pangasinan',
    'Lingayen',
    'HUMAN RESOURCE MGT. & DEVELOPMENT OFFICE'
  ];

  const headerFonts = [
    { name: 'Times New Roman', size: 10.5, italic: true },
    { name: 'Times New Roman', size: 11, bold: true },
    { name: 'Times New Roman', size: 10 },
    { name: 'Calibri', size: 11.5, bold: true }
  ];

  headerTexts.forEach((text, i) => {
    const rowNumber = i + 1;
    worksheet.mergeCells(`A${rowNumber}:${endLetter}${rowNumber}`);
    const cell = worksheet.getCell(`A${rowNumber}`);
    cell.value = text;
    cell.font = headerFonts[i];
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
  });

  // Empty row 5
  worksheet.mergeCells(`A5:${endLetter}5`);

  // Title Row 6
  worksheet.mergeCells(`A6:${endLetter}6`);
  const titleCell = worksheet.getCell('A6');
  titleCell.value = headerText;
  titleCell.font = { name: 'Times New Roman', size: 11, bold: true };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };

  const titleRow = worksheet.getRow(6);
  titleRow.height = 30; // Make height taller

  // Apply the full border directly to the merged cell master (A6)
  titleCell.border = {
    top: { style: 'medium' },
    bottom: { style: 'medium' },
    left: { style: 'medium' },
    right: { style: 'medium' }
  };



  // Set up headers
  const TARGET_TOTAL_WIDTH = 194;
  const totalActiveBaseWidth = colDefs.reduce((acc, col) => acc + col.width, 0);
  const scaleFactor = TARGET_TOTAL_WIDTH / totalActiveBaseWidth;

  let currentExcelCol = 1;
  let durationGroupStartCol = -1;
  let durationGroupEndCol = -1;

  colDefs.forEach((col) => {
    const colLetter = worksheet.getColumn(currentExcelCol).letter;
    if (col.group) {
      if (durationGroupStartCol === -1) durationGroupStartCol = currentExcelCol;
      durationGroupEndCol = currentExcelCol;
      worksheet.getCell(`${colLetter}7`).value = col.group;
      worksheet.getCell(`${colLetter}8`).value = col.label;
    } else {
      worksheet.getCell(`${colLetter}7`).value = col.label;
      worksheet.mergeCells(`${colLetter}7:${colLetter}8`);
    }

    // Scale column widths proportionally to force the table to stretch across the whole page
    worksheet.getColumn(currentExcelCol).width = col.width * scaleFactor;

    currentExcelCol++;
  });

  if (durationGroupStartCol !== -1 && durationGroupEndCol !== -1 && durationGroupStartCol !== durationGroupEndCol) {
    const startLetter = worksheet.getColumn(durationGroupStartCol).letter;
    const endLetter = worksheet.getColumn(durationGroupEndCol).letter;
    worksheet.mergeCells(`${startLetter}7:${endLetter}7`);
  }

  // Apply styling to Rows 7 and 8

  [7, 8].forEach(rowNum => {
    const row = worksheet.getRow(rowNum);
    row.font = { name: 'Times New Roman', size: 10, bold: true };
    row.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    for (let col = 1; col <= totalCols; col++) {
      const cell = row.getCell(col);
      cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
    }
  });

  // Dynamically load and place the logo
  try {
    const logoRes = await fetch('/template_logo.png');
    if (logoRes.ok) {
      const logoBuffer = await logoRes.arrayBuffer();
      const imageId = workbook.addImage({ buffer: logoBuffer, extension: 'png' });
      // Place the logo closer to the text
      worksheet.addImage(imageId, {
        tl: { col: 2.99, row: 0 },
        ext: { width: 97, height: 78 } // width 2.57 cm, height 2.06 cm
      });
    }
  } catch (e) {
    console.warn('Logo could not be loaded', e);
  }

  // Data starts at row 9 because rows 7 and 8 are headers
  let currentRowNumber = 9;

  if (records && Array.isArray(records)) {
    records.forEach((record, index) => {
      const row = worksheet.getRow(currentRowNumber);
      row.height = 30;

      const rowValues: any[] = [];
      colDefs.forEach((col, colIndex) => {
        let val: any = '';
        if (col.key === 'no') val = index + 1;
        else if (col.key === 'name') val = record.nameOfEmployee || '';
        else if (col.key === 'position') val = record.position || '';
        else if (col.key === 'motherUnit') val = record.motherUnit || '';
        else if (col.key === 'detailedOffice') val = record.detailedOffice || '';
        else if (col.key === 'designatedPosition') val = record.designatedPosition || '';
        else if (col.key === 'recalledFrom') val = record.recalledFrom || '';
        else if (col.key === 'recalledTo') val = record.recalledTo || '';
        else if (col.key === 'durationFrom') val = record.durationFrom || '';
        else if (col.key === 'durationTo') val = record.durationTo || '';
        else if (col.key === 'administrativeOrder') val = record.adminOrderNo || '';

        rowValues.push(val);
      });
      row.values = rowValues;

      row.eachCell({ includeEmpty: true }, (cell: ExcelJS.Cell, colNumber: number) => {
        if (colNumber <= totalCols) {
          cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
          cell.alignment = { wrapText: true, vertical: 'middle', horizontal: 'center' };
        }
      });
      currentRowNumber++;
    });
  }

  return workbook.xlsx.writeBuffer() as unknown as Promise<Buffer>;
}
