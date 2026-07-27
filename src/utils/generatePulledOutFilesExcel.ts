import * as ExcelJS from 'exceljs';
import { formatDateDDMMYYYY } from './dateUtils';

export default async function generatePulledOutFilesExcel(
  title: string,
  rowsData: any[]
) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Pulled-Out Files');

  // Page Setup (Landscape, exact margins)
  worksheet.pageSetup = {
    orientation: 'landscape',
    paperSize: 9, // A4
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: {
      left: 0.17,
      right: 0.17,
      top: 0.17,
      bottom: 0.17,
      header: 0,
      footer: 0
    }
  };

  // Define exactly 13 columns and their proportional widths 
  // Total active base width = 194 (same scale as AO reports)
  const colDefs = [
    { key: 'colA', width: 5 },   // NO.
    { key: 'colB', width: 20 },  // EMPLOYEE NAME
    { key: 'colC', width: 20 },  // OFFICE/HOSPITAL
    { key: 'colD', width: 15 },  // EMPLOYMENT STATUS
    { key: 'colE', width: 18 },  // BORROWER NAME
    { key: 'colF', width: 12 },  // BORROWER DATE
    { key: 'colG', width: 12 },  // BORROWER TIME
    { key: 'colH', width: 12 },  // NAME OF FILES
    { key: 'colI', width: 18 },  // RETURNED NAME
    { key: 'colJ', width: 12 },  // RETURNED DATE
    { key: 'colK', width: 12 },  // RETURNED TIME
    { key: 'colL', width: 18 },  // RECORDS CONFORMED
    { key: 'colM', width: 20 },  // REMARK
  ];

  worksheet.columns = colDefs.map(c => ({ key: c.key, width: c.width }));
  const endLetter = 'M'; // Col 13

  // ==========================================
  // HEADER SECTION (Rows 1-5)
  // ==========================================
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

  // ==========================================
  // TITLE ROW (Row 6)
  // ==========================================
  worksheet.mergeCells(`A6:${endLetter}6`);
  const titleCell = worksheet.getCell('A6');
  titleCell.value = title || 'PULLED-OUT FILES REPORT';
  titleCell.font = { name: 'Times New Roman', size: 11, bold: true };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  const titleRow = worksheet.getRow(6);
  titleRow.height = 30; // Make height taller

  titleCell.border = {
    top: { style: 'medium' },
    bottom: { style: 'medium' },
    left: { style: 'medium' },
    right: { style: 'medium' }
  };


  // ==========================================
  // TABLE HEADERS (Rows 7 and 8)
  // ==========================================
  // Row 7 merges: 
  worksheet.mergeCells('A7:A8');
  worksheet.mergeCells('B7:B8');
  worksheet.mergeCells('C7:C8');
  worksheet.mergeCells('D7:D8');
  worksheet.mergeCells('E7:G7'); // BORROWER over 3 columns
  worksheet.mergeCells('H7:H8');
  worksheet.mergeCells('I7:K7'); // RETURNED over 3 columns
  worksheet.mergeCells('L7:L8');
  worksheet.mergeCells('M7:M8');

  const headersMapRow7 = [
    { col: 'A', value: 'NO.' },
    { col: 'B', value: 'EMPLOYEE NAME' },
    { col: 'C', value: 'OFFICE/HOSPITAL' },
    { col: 'D', value: 'EMPLOYMENT STATUS' },
    { col: 'E', value: 'BORROWER' },
    { col: 'H', value: 'NAME OF FILES' },
    { col: 'I', value: 'RETURNED' },
    { col: 'L', value: 'RECORDS CONFORMED' },
    { col: 'M', value: 'REMARK' }
  ];

  headersMapRow7.forEach(h => {
    const c = worksheet.getCell(`${h.col}7`);
    c.value = h.value;
    c.font = { name: 'Times New Roman', size: 9, bold: true };
    c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  });

  const headersMapRow8 = [
    { col: 'E', value: 'NAME' },
    { col: 'F', value: 'DATE' },
    { col: 'G', value: 'TIME' },
    { col: 'I', value: 'NAME' },
    { col: 'J', value: 'DATE' },
    { col: 'K', value: 'TIME' }
  ];

  headersMapRow8.forEach(h => {
    const c = worksheet.getCell(`${h.col}8`);
    c.value = h.value;
    c.font = { name: 'Times New Roman', size: 9, bold: true };
    c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  });

  const headerCols = ['A','B','C','D','E','F','G','H','I','J','K','L','M'];
  headerCols.forEach(col => {
    [7, 8].forEach(rowNum => {
      const c = worksheet.getCell(`${col}${rowNum}`);
      c.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'medium' },
        right: { style: 'thin' }
      };
    });
  });

  worksheet.getRow(7).height = 18;
  worksheet.getRow(8).height = 18;

  // ==========================================
  // DATA ROWS
  // ==========================================
  let currentRow = 9;

  const formatDatePart = (dateVal: any) => {
    if (!dateVal) return '';
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return '';
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const year = d.getFullYear();
    return `${month}/${day}/${year}`;
  };

  const formatTimePart = (dateVal: any) => {
    if (!dateVal) return '';
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return '';
    let hours = d.getHours();
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12;
    return `${String(hours).padStart(2, '0')}:${minutes} ${ampm}`;
  };

  rowsData.forEach((row, index) => {
    const dataCellRow = worksheet.getRow(currentRow);
    dataCellRow.height = 30; // Base minimum height for multi-line support

    const emp = row.employee;
    const nameVal = emp ? `${emp.lastName}, ${emp.firstName}` : row.employeeId;
    const officeVal = row.employee?.yellowBox?.office || row.employee?.officeName || '—';
    const statusVal = row.employee?.status || '—';

    const borrowerNameVal = row.borrowerName || '';
    const borrowerDateVal = formatDatePart(row.dateBorrowed);
    const borrowerTimeVal = formatTimePart(row.dateBorrowed);

    const filesVal = '201 File';

    const isReturned = row.action === 'return' || !!row.dateReturned;
    const returnedNameVal = isReturned ? (row.returnedByName || '') : '';
    const returnedDateVal = isReturned ? formatDatePart(row.dateReturned) : '';
    const returnedTimeVal = isReturned ? formatTimePart(row.dateReturned) : '';

    const values = [
      index + 1,       // A
      nameVal,         // B
      officeVal,       // C
      statusVal,       // D
      borrowerNameVal, // E
      borrowerDateVal, // F
      borrowerTimeVal, // G
      filesVal,        // H
      returnedNameVal, // I
      returnedDateVal, // J
      returnedTimeVal, // K
      '',              // L (Records Conformed)
      row.purpose || '' // M (Remark / Purpose)
    ];

    headerCols.forEach((col, i) => {
      const cell = worksheet.getCell(`${col}${currentRow}`);
      cell.value = values[i];
      cell.font = { name: 'Times New Roman', size: 10 };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      };
    });

    currentRow++;
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return buffer;
}
