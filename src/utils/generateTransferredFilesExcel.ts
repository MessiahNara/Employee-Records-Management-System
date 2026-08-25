import * as ExcelJS from 'exceljs';

export default async function generateTransferredFilesExcel(
  title: string,
  rowsData: any[],
  statusType: 'All' | 'Transferred' | 'Returned' = 'All'
) {
  const workbook = new ExcelJS.Workbook();
  const sheetName = statusType === 'Transferred' 
    ? 'Transferred Files' 
    : 'Transferred & Returned Files';
  const worksheet = workbook.addWorksheet(sheetName);

  // Page Setup (8.5 x 13 Folio Landscape, exact margins)
  worksheet.pageSetup = {
    orientation: 'landscape',
    paperSize: 14 as any, // 14 = Folio (8.5 x 13 in)
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

  // =========================================================================
  // 1. CURRENTLY TRANSFERRED STATUS FORMAT (12 Columns)
  // Title: TRANSFERRED 201 FILES TO RSP REPORT
  // =========================================================================
  if (statusType === 'Transferred') {
    const colDefs = [
      { key: 'colA', width: 6 },   // NO.
      { key: 'colB', width: 26 },  // EMPLOYEE NAME
      { key: 'colC', width: 24 },  // OFFICE/HOSPITAL
      { key: 'colD', width: 22 },  // POSITION / DESIGNATION
      { key: 'colE', width: 16 },  // EMPLOYMENT STATUS
      { key: 'colF', width: 20 },  // RELEASED BY
      { key: 'colG', width: 20 },  // RECEIVED BY
      { key: 'colH', width: 14 },  // DATE
      { key: 'colI', width: 12 },  // TIME
      { key: 'colJ', width: 20 },  // RECORDS CONFORMED
      { key: 'colK', width: 16 },  // FILE CONDITION
      { key: 'colL', width: 24 },  // REMARKS
    ];

    worksheet.columns = colDefs.map(c => ({ key: c.key, width: c.width }));
    const endLetter = 'L'; // Col 12

    // Header Section (Rows 1-4)
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

    // Title Row (Row 6)
    worksheet.mergeCells(`A6:${endLetter}6`);
    const titleCell = worksheet.getCell('A6');
    titleCell.value = title || 'TRANSFERRED 201 FILES TO RSP REPORT';
    titleCell.font = { name: 'Times New Roman', size: 11, bold: true };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    const titleRow = worksheet.getRow(6);
    titleRow.height = 30;

    titleCell.border = {
      top: { style: 'medium' },
      bottom: { style: 'medium' },
      left: { style: 'medium' },
      right: { style: 'medium' }
    };

    // Table Headers (Row 7)
    const headerCols = ['A','B','C','D','E','F','G','H','I','J','K','L'];
    const headers = [
      'NO.',
      'EMPLOYEE NAME',
      'OFFICE/HOSPITAL',
      'POSITION / DESIGNATION',
      'EMPLOYMENT STATUS',
      'RELEASED BY',
      'RECEIVED BY',
      'DATE',
      'TIME',
      'RECORDS CONFORMED',
      'FILE CONDITION',
      'REMARKS'
    ];

    worksheet.getRow(7).height = 28;

    headers.forEach((h, idx) => {
      const colLetter = headerCols[idx];
      const cell = worksheet.getCell(`${colLetter}7`);
      cell.value = h;
      cell.font = { name: 'Times New Roman', size: 9.5, bold: true };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: false, shrinkToFit: true };
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'medium' },
        right: { style: 'thin' }
      };
    });

    // Data Rows
    let currentRow = 8;
    rowsData.forEach((row, index) => {
      const dataCellRow = worksheet.getRow(currentRow);
      dataCellRow.height = 28;

      const emp = row.employee;
      const nameVal = emp ? `${emp.lastName}, ${emp.firstName}` : row.employeeId;
      const officeVal = row.employee?.yellowBox?.office || row.employee?.officeName || '—';
      const positionVal = row.employee?.position || '—';
      const statusVal = row.employee?.status || '—';

      const releasedByVal = row.releasedBy || '—';
      const receivedByVal = row.borrowerName || '';
      const transferDateVal = formatDatePart(row.dateBorrowed);
      const transferTimeVal = formatTimePart(row.dateBorrowed);
      const fileConditionVal = row.transferCondition || row.fileCondition || 'Complete';
      const remarksVal = row.transferRemarks || row.purpose || (!row.dateReturned ? row.remarks : '') || '';

      const values = [
        index + 1,        // A: NO.
        nameVal,          // B: EMPLOYEE NAME
        officeVal,        // C: OFFICE/HOSPITAL
        positionVal,      // D: POSITION / DESIGNATION
        statusVal,        // E: EMPLOYMENT STATUS
        releasedByVal,    // F: RELEASED BY
        receivedByVal,    // G: RECEIVED BY
        transferDateVal,  // H: DATE
        transferTimeVal,  // I: TIME
        '',               // J: RECORDS CONFORMED
        fileConditionVal, // K: FILE CONDITION
        remarksVal        // L: REMARKS
      ];

      headerCols.forEach((col, i) => {
        const cell = worksheet.getCell(`${col}${currentRow}`);
        cell.value = values[i];
        cell.font = { name: 'Times New Roman', size: 10 };
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: false, shrinkToFit: true };
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

  // =========================================================================
  // 2. RETURNED / ALL / COMBINED FORMAT (20 Columns)
  // RELEASED BY IS FIRST BEFORE TRANSFERRED TO (RSP)
  // Title: TRANSFERRED AND RETURNED 201 FILES REPORT
  // =========================================================================
  const colDefs = [
    { key: 'colA', width: 5 },   // NO.
    { key: 'colB', width: 22 },  // EMPLOYEE NAME
    { key: 'colC', width: 20 },  // OFFICE / HOSPITAL
    { key: 'colD', width: 18 },  // POSITION / DESIGNATION
    { key: 'colE', width: 14 },  // EMPLOYMENT STATUS
    { key: 'colF', width: 16 },  // RELEASED BY
    { key: 'colG', width: 18 },  // TRANSFERRED TO - RECEIVED BY
    { key: 'colH', width: 12 },  // TRANSFERRED TO - DATE
    { key: 'colI', width: 10 },  // TRANSFERRED TO - TIME
    { key: 'colJ', width: 16 },  // RECORDS CONFORMED (TRANSFER)
    { key: 'colK', width: 14 },  // FILE CONDITION
    { key: 'colL', width: 18 },  // REMARKS
    { key: 'colM', width: 12 },  // STATUS
    { key: 'colN', width: 18 },  // RETURNED BACK TO RECORDS - RETURNED BY
    { key: 'colO', width: 12 },  // RETURNED BACK TO RECORDS - DATE
    { key: 'colP', width: 10 },  // RETURNED BACK TO RECORDS - TIME
    { key: 'colQ', width: 16 },  // RECEIVED BY
    { key: 'colR', width: 16 },  // RECORDS CONFORMED (RETURN)
    { key: 'colS', width: 14 },  // RETURN CONDITION
    { key: 'colT', width: 18 },  // RETURN REMARKS
  ];

  worksheet.columns = colDefs.map(c => ({ key: c.key, width: c.width }));
  const endLetter = 'T'; // Col 20

  // Header Section (Rows 1-4)
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

  // Title Row (Row 6)
  worksheet.mergeCells(`A6:${endLetter}6`);
  const titleCell = worksheet.getCell('A6');
  titleCell.value = title || 'TRANSFERRED AND RETURNED 201 FILES REPORT';
  titleCell.font = { name: 'Times New Roman', size: 11, bold: true };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  const titleRow = worksheet.getRow(6);
  titleRow.height = 30;

  titleCell.border = {
    top: { style: 'medium' },
    bottom: { style: 'medium' },
    left: { style: 'medium' },
    right: { style: 'medium' }
  };

  // Table Headers (Rows 7 and 8)
  // RELEASED BY (Col F) comes FIRST before TRANSFERRED TO (Cols G-I)
  worksheet.mergeCells('A7:A8'); // NO.
  worksheet.mergeCells('B7:B8'); // EMPLOYEE NAME
  worksheet.mergeCells('C7:C8'); // OFFICE / HOSPITAL
  worksheet.mergeCells('D7:D8'); // POSITION / DESIGNATION
  worksheet.mergeCells('E7:E8'); // EMPLOYMENT STATUS
  worksheet.mergeCells('F7:F8'); // RELEASED BY
  worksheet.mergeCells('G7:I7'); // TRANSFERRED TO (RSP)
  worksheet.mergeCells('J7:J8'); // RECORDS CONFORMED
  worksheet.mergeCells('K7:K8'); // FILE CONDITION
  worksheet.mergeCells('L7:L8'); // REMARKS
  worksheet.mergeCells('M7:M8'); // STATUS
  worksheet.mergeCells('N7:P7'); // RETURNED BACK TO RECORDS
  worksheet.mergeCells('Q7:Q8'); // RECEIVED BY
  worksheet.mergeCells('R7:R8'); // RECORDS CONFORMED
  worksheet.mergeCells('S7:S8'); // RETURN CONDITION
  worksheet.mergeCells('T7:T8'); // RETURN REMARKS

  const headersMapRow7 = [
    { col: 'A', value: 'NO.' },
    { col: 'B', value: 'EMPLOYEE NAME' },
    { col: 'C', value: 'OFFICE / HOSPITAL' },
    { col: 'D', value: 'POSITION / DESIGNATION' },
    { col: 'E', value: 'EMPLOYMENT STATUS' },
    { col: 'F', value: 'RELEASED BY' },
    { col: 'G', value: 'TRANSFERRED TO (RSP)' },
    { col: 'J', value: 'RECORDS CONFORMED' },
    { col: 'K', value: 'FILE CONDITION' },
    { col: 'L', value: 'REMARKS' },
    { col: 'M', value: 'STATUS' },
    { col: 'N', value: 'RETURNED BACK TO RECORDS' },
    { col: 'Q', value: 'RECEIVED BY' },
    { col: 'R', value: 'RECORDS CONFORMED' },
    { col: 'S', value: 'RETURN CONDITION' },
    { col: 'T', value: 'RETURN REMARKS' },
  ];

  headersMapRow7.forEach(h => {
    const c = worksheet.getCell(`${h.col}7`);
    c.value = h.value;
    c.font = { name: 'Times New Roman', size: 9, bold: true };
    c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: false, shrinkToFit: true };
  });

  const headersMapRow8 = [
    { col: 'G', value: 'RECEIVED BY' },
    { col: 'H', value: 'DATE' },
    { col: 'I', value: 'TIME' },
    { col: 'N', value: 'RETURNED BY' },
    { col: 'O', value: 'DATE' },
    { col: 'P', value: 'TIME' },
  ];

  headersMapRow8.forEach(h => {
    const c = worksheet.getCell(`${h.col}8`);
    c.value = h.value;
    c.font = { name: 'Times New Roman', size: 9, bold: true };
    c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: false, shrinkToFit: true };
  });

  const headerCols = ['A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P','Q','R','S','T'];
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

  // Data Rows
  let currentRow = 9;
  rowsData.forEach((row, index) => {
    const dataCellRow = worksheet.getRow(currentRow);
    dataCellRow.height = 30;

    const emp = row.employee;
    const nameVal = emp ? `${emp.lastName}, ${emp.firstName}` : row.employeeId;
    const officeVal = row.employee?.yellowBox?.office || row.employee?.officeName || '—';
    const positionVal = row.employee?.position || '—';
    const statusVal = row.employee?.status || '—';

    const releasedByVal = row.releasedBy || '—';
    const receivedByVal = row.borrowerName || '';
    const transferDateVal = formatDatePart(row.dateBorrowed);
    const transferTimeVal = formatTimePart(row.dateBorrowed);
    const fileConditionVal = row.transferCondition || row.fileCondition || 'Complete';
    const remarksVal = row.transferRemarks || row.purpose || '';

    const isReturned = row.action === 'return' || !!row.dateReturned;
    const transferStatusVal = isReturned ? 'Returned' : 'Transferred';
    const returnedByNameVal = isReturned ? (row.returnedByName || '') : '';
    const returnedDateVal = isReturned ? formatDatePart(row.dateReturned) : '';
    const returnedTimeVal = isReturned ? formatTimePart(row.dateReturned) : '';
    const recordsReceivedByVal = isReturned ? (row.receivedBy || '') : '';
    const returnFileConditionVal = isReturned ? (row.returnCondition || row.fileCondition || 'Complete') : '';
    const returnRemarksVal = isReturned ? (row.returnRemarks || row.remarks || '') : '';

    const values = [
      index + 1,              // A: NO.
      nameVal,                // B: EMPLOYEE NAME
      officeVal,              // C: OFFICE / HOSPITAL
      positionVal,            // D: POSITION / DESIGNATION
      statusVal,              // E: EMPLOYMENT STATUS
      releasedByVal,          // F: RELEASED BY
      receivedByVal,          // G: TRANSFERRED TO - RECEIVED BY
      transferDateVal,        // H: TRANSFERRED TO - DATE
      transferTimeVal,        // I: TRANSFERRED TO - TIME
      '',                     // J: RECORDS CONFORMED (TRANSFER)
      fileConditionVal,       // K: FILE CONDITION
      remarksVal,             // L: REMARKS
      transferStatusVal,      // M: STATUS
      returnedByNameVal,      // N: RETURNED BACK TO RECORDS - RETURNED BY
      returnedDateVal,        // O: RETURNED BACK TO RECORDS - DATE
      returnedTimeVal,        // P: RETURNED BACK TO RECORDS - TIME
      recordsReceivedByVal,   // Q: RECEIVED BY
      '',                     // R: RECORDS CONFORMED (RETURN)
      returnFileConditionVal, // S: RETURN CONDITION
      returnRemarksVal        // T: RETURN REMARKS
    ];

    headerCols.forEach((col, i) => {
      const cell = worksheet.getCell(`${col}${currentRow}`);
      cell.value = values[i];
      cell.font = { name: 'Times New Roman', size: 10 };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: false, shrinkToFit: true };
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
