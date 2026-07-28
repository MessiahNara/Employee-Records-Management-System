import * as ExcelJS from 'exceljs';
import { NapRowItem, formatDynamicDates } from '../pages/InventoryAppraisal';

export default async function generateNapForm1Excel(
  items: NapRowItem[],
  divName: string,
  napFormHeader: any
): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('NAP Form 1', {
    views: [{ showGridLines: false }]
  });

  // Legal / Folio landscape
  worksheet.pageSetup = {
    orientation: 'landscape',
    paperSize: 14 as any,
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: { left: 0.6, right: 0.5, top: 0.6, bottom: 1, header: 0.3, footer: 0 }
  };

  // Column widths matching template exactly (from nap_detailed.json wch values)
  const colWidths: number[] = [
    5.6,   // A
    5.6,   // B
    47.4,  // C
    18.4,  // D
    13.1,  // E
    12.4,  // F
    16.3,  // G
    21.3,  // H
    15.4,  // I
    13.2,  // J
    12.3,  // K
    12.3,  // L
    9.3,   // M
    9.3,   // N
    9.3,   // O
    42.1   // P
  ];
  colWidths.forEach((w, i) => { worksheet.getColumn(i + 1).width = w; });

  const thin: ExcelJS.Border = { style: 'thin', color: { argb: 'FF000000' } };
  const thinBorder: Partial<ExcelJS.Borders> = { top: thin, bottom: thin, left: thin, right: thin };
  const headerLabelFont: Partial<ExcelJS.Font> = { name: 'Arial', size: 8, bold: true };
  const headerValueFont: Partial<ExcelJS.Font> = { name: 'Arial', size: 9 };

  // Dynamic values
  const deptLabel = 'Human Resource Management and Development Office (HRMDO)';
  const sectionLabel = napFormHeader.sectionUnit || (divName && divName !== 'ALL' ? divName : '');
  const datePrepared = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  // ==========================================
  // HEADER AREA (Rows 1-8)
  // Rows 1-2: Empty (spacer)
  // Row 3: Labels row (1. NAME OF OFFICE / 2. DEPARTMENT / 4. TELEPHONE)
  // Row 4-6: Values for row 3 labels (Name of Office value spans 3 rows F4:I6)
  //          Department value in J4:M4, Section/Unit label in J5:M5, values in J6/N6
  // Row 5: Section/Unit label, Email label
  // Row 7: Labels (6. ADDRESS / 7. PERSON-IN-CHARGE / 8. DATE PREPARED)
  // Row 8: Values for row 7 labels
  // ==========================================

  // Row heights
  worksheet.getRow(1).height = 15;
  worksheet.getRow(2).height = 15;
  for (let r = 3; r <= 8; r++) worksheet.getRow(r).height = 18;

  // --- TITLE BLOCK (A3:E8) ---
  // The template uses an image for the NAP logo, but we'll put the text here without borders
  // to match the clean look of the template's left side.
  worksheet.mergeCells('A3:E8');
  const titleCell = worksheet.getCell('A3');
  titleCell.value = {
    richText: [
      { text: 'NATIONAL ARCHIVES OF THE PHILIPPINES\n', font: { name: 'Book Antiqua', size: 16, bold: true } },
      { text: 'Pambansang Sinupan ng Pilipinas\n\n', font: { name: 'Verdana', size: 12, italic: true } },
      { text: 'RECORDS INVENTORY AND APPRAISAL', font: { name: 'Arial', size: 16, bold: true } }
    ]
  };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  titleCell.border = { top: thin, left: thin }; // The missing line the user pointed out

  // Also put the tiny form label in A1 and 2024 in A2
  worksheet.getCell('A1').value = 'NAP Records Inventory and Appraisal Form';
  worksheet.getCell('A1').font = { name: 'Arial', size: 6 };
  worksheet.getCell('A2').value = '2024';
  worksheet.getCell('A2').font = { name: 'Arial', size: 6 };

  // --- ROW 3: Header labels ---
  // F3:I3 = "1. NAME OF OFFICE:"
  worksheet.mergeCells('F3:I3');
  const nameLabel = worksheet.getCell('F3');
  nameLabel.value = '1. NAME OF OFFICE:';
  nameLabel.font = headerLabelFont;
  nameLabel.alignment = { horizontal: 'left', vertical: 'top', wrapText: true };
  nameLabel.border = { top: thin, left: thin, right: thin };

  // J3:M3 = "2. DEPARTMENT/DIVISION:"
  worksheet.mergeCells('J3:M3');
  const deptLabelCell = worksheet.getCell('J3');
  deptLabelCell.value = '2. DEPARTMENT/DIVISION:';
  deptLabelCell.font = headerLabelFont;
  deptLabelCell.alignment = { horizontal: 'left', vertical: 'top', wrapText: true };
  deptLabelCell.border = { top: thin, left: thin, right: thin };

  // N3:P3 = "4. TELEPHONE NO.:"
  worksheet.mergeCells('N3:P3');
  const telLabel = worksheet.getCell('N3');
  telLabel.value = '4. TELEPHONE NO.:';
  telLabel.font = headerLabelFont;
  telLabel.alignment = { horizontal: 'left', vertical: 'top', wrapText: true };
  telLabel.border = { top: thin, left: thin, right: thin };

  // --- ROW 4: Values for NAME OF OFFICE and DEPARTMENT ---
  // F4:I6 = "PROVINCIAL GOVERNMENT OF PANGASINAN" (spans 3 rows)
  worksheet.mergeCells('F4:I6');
  const nameVal = worksheet.getCell('F4');
  nameVal.value = 'PROVINCIAL GOVERNMENT OF PANGASINAN';
  nameVal.font = { name: 'Arial', size: 9, bold: true };
  nameVal.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  nameVal.border = { bottom: thin, left: thin, right: thin };

  // J4:M4 = Department value
  worksheet.mergeCells('J4:M4');
  const deptVal = worksheet.getCell('J4');
  deptVal.value = deptLabel;
  deptVal.font = headerValueFont;
  deptVal.alignment = { horizontal: 'center', vertical: 'middle', wrapText: false, shrinkToFit: true };
  deptVal.border = { bottom: thin, left: thin, right: thin };

  // N4:P4 = Telephone value
  worksheet.mergeCells('N4:P4');
  const telVal = worksheet.getCell('N4');
  telVal.value = napFormHeader.telephoneNo || '';
  telVal.font = headerValueFont;
  telVal.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  telVal.border = { bottom: thin, left: thin, right: thin };

  // --- ROW 5: Section/Unit label, Email label ---
  // J5:M5 = "3. SECTION/UNIT:"
  worksheet.mergeCells('J5:M5');
  const secLabel = worksheet.getCell('J5');
  secLabel.value = '3. SECTION/UNIT:';
  secLabel.font = headerLabelFont;
  secLabel.alignment = { horizontal: 'left', vertical: 'top', wrapText: true };
  secLabel.border = { top: thin, left: thin, right: thin };

  // N5:P5 = "5. EMAIL ADDRESS.:"
  worksheet.mergeCells('N5:P5');
  const emailLabel = worksheet.getCell('N5');
  emailLabel.value = '5. EMAIL ADDRESS.:';
  emailLabel.font = headerLabelFont;
  emailLabel.alignment = { horizontal: 'left', vertical: 'top', wrapText: true };
  emailLabel.border = { top: thin, left: thin, right: thin };

  // --- ROW 6: Section/Unit value, Email value ---
  // J6:M6 = Section value
  worksheet.mergeCells('J6:M6');
  const secVal = worksheet.getCell('J6');
  secVal.value = sectionLabel;
  secVal.font = headerValueFont;
  secVal.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  secVal.border = { bottom: thin, left: thin, right: thin };

  // N6:P6 = Email value
  worksheet.mergeCells('N6:P6');
  const emailVal = worksheet.getCell('N6');
  emailVal.value = napFormHeader.emailAddress || '';
  emailVal.font = headerValueFont;
  emailVal.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  emailVal.border = { bottom: thin, left: thin, right: thin };

  // --- ROW 7: Address label, Person-In-Charge label, Date Prepared label ---
  // F7:I7 = "6. ADDRESS:"
  worksheet.mergeCells('F7:I7');
  const addrLabel = worksheet.getCell('F7');
  addrLabel.value = '6. ADDRESS:';
  addrLabel.font = headerLabelFont;
  addrLabel.alignment = { horizontal: 'left', vertical: 'top', wrapText: true };
  addrLabel.border = { top: thin, left: thin, right: thin };

  // J7:M7 = "7. PERSON-IN-CHARGE OF FILES:"
  worksheet.mergeCells('J7:M7');
  const picLabel = worksheet.getCell('J7');
  picLabel.value = '7. PERSON-IN-CHARGE OF FILES:';
  picLabel.font = headerLabelFont;
  picLabel.alignment = { horizontal: 'left', vertical: 'top', wrapText: true };
  picLabel.border = { top: thin, left: thin, right: thin };

  // N7:P7 = "8. DATE PREPARED:"
  worksheet.mergeCells('N7:P7');
  const dateLabel = worksheet.getCell('N7');
  dateLabel.value = '8. DATE PREPARED:';
  dateLabel.font = headerLabelFont;
  dateLabel.alignment = { horizontal: 'left', vertical: 'top', wrapText: true };
  dateLabel.border = { top: thin, left: thin, right: thin };

  // --- ROW 8: Address value, Person-In-Charge value, Date Prepared value ---
  // F8:I8 = Address value
  worksheet.mergeCells('F8:I8');
  const addrVal = worksheet.getCell('F8');
  addrVal.value = 'Provincial Capitol Complex Lingayen, Pangasinan';
  addrVal.font = { name: 'Arial', size: 9 };
  addrVal.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  addrVal.border = { bottom: thin, left: thin, right: thin };

  // J8:M8 = Person-In-Charge value
  worksheet.mergeCells('J8:M8');
  const picVal = worksheet.getCell('J8');
  picVal.value = napFormHeader.personInCharge || '';
  picVal.font = headerValueFont;
  picVal.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  picVal.border = { bottom: thin, left: thin, right: thin };

  // N8:P8 = Date Prepared value
  worksheet.mergeCells('N8:P8');
  const dateVal = worksheet.getCell('N8');
  dateVal.value = datePrepared;
  dateVal.font = headerValueFont;
  dateVal.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  dateVal.border = { bottom: thin, left: thin, right: thin };

  // ==========================================
  // TABLE COLUMN HEADERS (Rows 9-11)
  // Row 9-11: Main column headers
  // Row 9-10: Retention Period header (M9:O10)
  // Row 11: Active / Storage / Total sub-headers
  // ==========================================
  worksheet.getRow(9).height = 18;
  worksheet.getRow(10).height = 18;
  worksheet.getRow(11).height = 18;

  const colHeaderFont: Partial<ExcelJS.Font> = { name: 'Arial', size: 10, bold: true };
  const colHeaderAlign: Partial<ExcelJS.Alignment> = { horizontal: 'center', vertical: 'middle', wrapText: true };
  const shrinkHeaderAlign: Partial<ExcelJS.Alignment> = { horizontal: 'center', vertical: 'middle', wrapText: true, shrinkToFit: true };

  const colHeaders: Array<{ range: string; val: string; shrink?: boolean }> = [
    { range: 'A9:C11', val: '9. RECORDS SERIES TITLE AND DESCRIPTION' },
    { range: 'D9:D11', val: '10. PERIOD COVERED / INCLUSIVE DATES' },
    { range: 'E9:E11', val: '11. VOLUME' },
    { range: 'F9:F11', val: '12. RECORDS MEDIUM' },
    { range: 'G9:G11', val: '13. RESTRICTION/S', shrink: true },
    { range: 'H9:H11', val: '14. LOCATION OF RECORDS' },
    { range: 'I9:I11', val: '15. FREQUENCY OF USE' },
    { range: 'J9:J11', val: '16. DUPLICATION', shrink: true },
    { range: 'K9:K11', val: '17. TIME VALUE (T/P)' },
    { range: 'L9:L11', val: '18. UTILITY VALUE\nAdm/F/L/Arc' },
    { range: 'P9:P11', val: '20. DISPOSITION PROVISION' }
  ];

  colHeaders.forEach(h => {
    worksheet.mergeCells(h.range);
    const c = worksheet.getCell(h.range.split(':')[0]);
    c.value = h.val;
    c.font = colHeaderFont;
    c.alignment = h.shrink ? shrinkHeaderAlign : colHeaderAlign;
    c.border = thinBorder;
  });

  // Retention Period header M9:O10
  worksheet.mergeCells('M9:O10');
  const retCell = worksheet.getCell('M9');
  retCell.value = '19. RETENTION PERIOD';
  retCell.font = colHeaderFont;
  retCell.alignment = colHeaderAlign;
  retCell.border = thinBorder;

  // Retention sub-headers row 11
  const retSubs = [
    { cell: 'M11', val: 'Active' },
    { cell: 'N11', val: 'Storage' },
    { cell: 'O11', val: 'Total' }
  ];
  retSubs.forEach(s => {
    const c = worksheet.getCell(s.cell);
    c.value = s.val;
    c.font = colHeaderFont;
    c.alignment = colHeaderAlign;
    c.border = thinBorder;
  });

  // ==========================================
  // DATA ROWS (starting row 12)
  // ==========================================
  let currentRow = 12;

  items.forEach((item) => {
    const row = worksheet.getRow(currentRow);
    row.height = 18;

    // Apply base styles to all A-P cells
    for (let c = 1; c <= 16; c++) {
      const cell = row.getCell(c);
      cell.font = { name: 'Arial', size: 11 };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border = thinBorder;
    }

    if (item.type === 'category') {
      worksheet.mergeCells(`A${currentRow}:P${currentRow}`);
      const c = worksheet.getCell(`A${currentRow}`);
      c.value = item.title;
      c.font = { name: 'Calibri', size: 11, bold: true };
      c.alignment = { horizontal: 'left', vertical: 'middle', wrapText: false };
      c.border = thinBorder;

    } else if (item.type === 'subCategory') {
      worksheet.mergeCells(`B${currentRow}:P${currentRow}`);
      const c = worksheet.getCell(`B${currentRow}`);
      c.value = item.title;
      c.font = { name: 'Times New Roman', size: 11, bold: true };
      c.alignment = { horizontal: 'left', vertical: 'middle', wrapText: false };
      
      row.getCell('A').border = { top: thin, bottom: thin, left: thin };
      c.border = { top: thin, bottom: thin, right: thin };

    } else if (item.type === 'record' && item.record) {
      // Remove lines between A, B, C
      row.getCell('A').border = { top: thin, bottom: thin, left: thin };
      row.getCell('B').border = { top: thin, bottom: thin };
      row.getCell('C').border = { top: thin, bottom: thin, right: thin };

      const r = item.record;
      const perm = r.appraisalCategory === 'Permanent';
      const util = (r.utilityValue || '').replace(/\s*\(.*?\)/g, '').trim();

      const setVal = (col: string, val: string, align?: Partial<ExcelJS.Alignment>, customBorder?: Partial<ExcelJS.Borders>) => {
        const cell = worksheet.getCell(`${col}${currentRow}`);
        cell.value = val;
        // Use Times New Roman for the entry title (col C), but keep others Arial
        cell.font = col === 'C' ? { name: 'Times New Roman', size: 11 } : { name: 'Arial', size: 11 };
        cell.alignment = align || { horizontal: 'center', vertical: 'middle', wrapText: true };
        cell.border = customBorder || thinBorder;
      };

      setVal('C', r.seriesTitle || '', { horizontal: 'left', vertical: 'middle', wrapText: false }, { top: thin, bottom: thin, right: thin });
      setVal('D', formatDynamicDates(r.inclusiveDates));
      setVal('E', r.volume || '');
      setVal('F', r.medium || '');
      setVal('G', r.restrictions && r.restrictions.toLowerCase() !== 'none' ? r.restrictions : '');
      setVal('H', r.locationOfRecords || '');
      setVal('I', r.frequencyOfUse || '');
      setVal('J', r.duplication || '');
      setVal('K', r.appraisalCategory || '');
      setVal('L', util);
      setVal('M', perm ? '-' : String(r.activeDeskYrs));
      setVal('N', perm ? '-' : String(r.storageYrs));
      setVal('O', perm ? '-' : String(r.totalRetention));
      setVal('P', r.dispositionProvision || '', { horizontal: 'left', vertical: 'middle', wrapText: true });
    }

    currentRow++;
  });

  // ==========================================
  // LEGEND SECTION (matching template row 34+)
  // ==========================================
  currentRow += 1; // gap

  const legendRow = currentRow;
  worksheet.getCell(`A${legendRow}`).value = 'LEGEND:';
  worksheet.getCell(`A${legendRow}`).font = { name: 'Arial', size: 11, bold: true };

  const tvRow = legendRow + 1;
  worksheet.getCell(`A${tvRow}`).value = 'TIME VALUE:';
  worksheet.getCell(`A${tvRow}`).font = { name: 'Arial', size: 11, bold: true };
  worksheet.getCell(`D${tvRow}`).value = 'T  -  Temporary';
  worksheet.getCell(`D${tvRow}`).font = { name: 'Arial', size: 11 };
  worksheet.getCell(`F${tvRow}`).value = 'P  -  Permanent';
  worksheet.getCell(`F${tvRow}`).font = { name: 'Arial', size: 11 };

  const uvRow = legendRow + 2;
  worksheet.getCell(`A${uvRow}`).value = 'UTILITY VALUE:';
  worksheet.getCell(`A${uvRow}`).font = { name: 'Arial', size: 11, bold: true };
  worksheet.getCell(`D${uvRow}`).value = 'Adm  -  Administrative';
  worksheet.getCell(`D${uvRow}`).font = { name: 'Arial', size: 11 };
  worksheet.getCell(`F${uvRow}`).value = 'F  -  Fiscal';
  worksheet.getCell(`F${uvRow}`).font = { name: 'Arial', size: 11 };
  worksheet.getCell(`G${uvRow}`).value = 'L  -  Legal';
  worksheet.getCell(`G${uvRow}`).font = { name: 'Arial', size: 11 };
  worksheet.getCell(`H${uvRow}`).value = 'Arc  -  Archival';
  worksheet.getCell(`H${uvRow}`).font = { name: 'Arial', size: 11 };

  // ==========================================
  // SIGNATURE BLOCK
  // Row 1: PREPARED BY / ASSISTED BY / APPROVED BY labels
  // Row 2: Empty spacer
  // Row 3: Signature line with bold placeholders ("Name and Position", "Name", "Name")
  // Row 4: Sub-titles ("Name and Position", "NAP Records Management Analyst", "Chief of...")
  // ==========================================
  const sigLabelRow = uvRow + 3;
  const sigNameRow = sigLabelRow + 2; // line for name
  const sigTitleRow = sigNameRow + 1; // position title below name

  worksheet.getRow(sigLabelRow).height = 15;
  worksheet.getRow(sigLabelRow + 1).height = 22;
  worksheet.getRow(sigNameRow).height = 18;
  worksheet.getRow(sigTitleRow).height = 15;

  const pVal = napFormHeader.preparedBy || '';
  const aVal = napFormHeader.assistedBy || '';
  const vVal = napFormHeader.approvedBy || '';

  // Labels
  worksheet.getCell(`A${sigLabelRow}`).value = 'PREPARED BY:';
  worksheet.getCell(`A${sigLabelRow}`).font = { name: 'Arial', size: 11, bold: true };

  worksheet.getCell(`G${sigLabelRow}`).value = 'ASSISTED BY:';
  worksheet.getCell(`G${sigLabelRow}`).font = { name: 'Arial', size: 11, bold: true };

  worksheet.getCell(`K${sigLabelRow}`).value = 'APPROVED BY:';
  worksheet.getCell(`K${sigLabelRow}`).font = { name: 'Arial', size: 11, bold: true };

  // PREPARED BY signature line (B to E)
  worksheet.mergeCells(`B${sigNameRow}:E${sigNameRow}`);
  const prepName = worksheet.getCell(`B${sigNameRow}`);
  prepName.value = pVal || 'Name and Position';
  prepName.font = { name: 'Arial', size: 11, bold: true };
  prepName.alignment = { horizontal: 'center', vertical: 'bottom' };
  prepName.border = { bottom: thin };

  // ASSISTED BY signature line (G to I)
  worksheet.mergeCells(`G${sigNameRow}:I${sigNameRow}`);
  const asstNameC = worksheet.getCell(`G${sigNameRow}`);
  asstNameC.value = aVal || 'Name';
  asstNameC.font = { name: 'Arial', size: 11, bold: true };
  asstNameC.alignment = { horizontal: 'center', vertical: 'bottom' };
  asstNameC.border = { bottom: thin };

  // APPROVED BY signature line (K to O)
  worksheet.mergeCells(`K${sigNameRow}:O${sigNameRow}`);
  const appvNameC = worksheet.getCell(`K${sigNameRow}`);
  appvNameC.value = vVal || 'Name';
  appvNameC.font = { name: 'Arial', size: 11, bold: true };
  appvNameC.alignment = { horizontal: 'center', vertical: 'bottom' };
  appvNameC.border = { bottom: thin };

  // Position titles below the line
  worksheet.mergeCells(`B${sigTitleRow}:E${sigTitleRow}`);
  const prepTitle = worksheet.getCell(`B${sigTitleRow}`);
  prepTitle.value = 'Name and Position';
  prepTitle.font = { name: 'Arial', size: 11 };
  prepTitle.alignment = { horizontal: 'center', vertical: 'top' };

  worksheet.mergeCells(`G${sigTitleRow}:I${sigTitleRow}`);
  const asstTitle = worksheet.getCell(`G${sigTitleRow}`);
  asstTitle.value = 'NAP Records Management Analyst';
  asstTitle.font = { name: 'Arial', size: 11 };
  asstTitle.alignment = { horizontal: 'center', vertical: 'top' };

  worksheet.mergeCells(`K${sigTitleRow}:O${sigTitleRow}`);
  const appvTitle = worksheet.getCell(`K${sigTitleRow}`);
  appvTitle.value = 'Chief of the Division/Department';
  appvTitle.font = { name: 'Arial', size: 11 };
  appvTitle.alignment = { horizontal: 'center', vertical: 'top' };

  // Footer page number placeholder
  const footerRow = sigTitleRow + 2;
  worksheet.mergeCells(`O${footerRow}:P${footerRow}`);
  const footerCell = worksheet.getCell(`O${footerRow}`);
  footerCell.value = 'Page ___ of ___ Pages';
  footerCell.font = { name: 'Arial', size: 11 };
  footerCell.alignment = { horizontal: 'right', vertical: 'middle' };

  const buffer = await workbook.xlsx.writeBuffer();
  return buffer;
}
