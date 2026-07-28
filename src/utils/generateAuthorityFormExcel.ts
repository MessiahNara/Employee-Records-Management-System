import * as ExcelJS from 'exceljs';

export default async function generateAuthorityFormExcel(
  records: any[],
  formType: 'Storage' | 'Disposal'
): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Authority Form', {
    views: [{ showGridLines: false }]
  });

  // Page setup: 8.5 x 11 (Letter), Margins as specified
  worksheet.pageSetup = {
    orientation: 'portrait', // The image looks like portrait or landscape? The user didn't say orientation, but 8.5 x 11 is standard Letter. Let's use portrait.
    paperSize: 1 as any, // 1 = Letter
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: { left: 0.6, right: 0.6, top: 0.6, bottom: 1.9, header: 0.8, footer: 0.8 }
  };

  // Define Columns A to M
  // B7: GRDS/RDS ITEM NO.
  // C7: RECORD SERIES TITLE AND DESCRIPTION (spans C to I)
  // J7: Document Year
  // K7: Period Covered
  const colWidths = [
    2,    // A
    12,   // B (GRDS/RDS)
    10,   // C
    10,   // D
    10,   // E
    10,   // F
    10,   // G
    10,   // H
    10,   // I
    12,   // J (Doc Year)
    15,   // K (Period Covered)
    5,    // L
    5     // M
  ];
  colWidths.forEach((w, i) => { worksheet.getColumn(i + 1).width = w; });

  const thin: ExcelJS.Border = { style: 'thin', color: { argb: 'FF000000' } };
  const borderAll: Partial<ExcelJS.Borders> = { top: thin, bottom: thin, left: thin, right: thin };

  // B2 - Provincial Government of Pangasinan
  worksheet.mergeCells('B2:K2');
  const b2 = worksheet.getCell('B2');
  b2.value = 'Provincial Government of Pangasinan';
  b2.font = { name: 'Times New Roman', size: 12, bold: true };
  b2.alignment = { horizontal: 'center', vertical: 'middle' };
  b2.border = borderAll;

  // B3 - Lingayen, Pangasinan
  worksheet.mergeCells('B3:K3');
  const b3 = worksheet.getCell('B3');
  b3.value = 'Lingayen, Pangasinan';
  b3.font = { name: 'Times New Roman', size: 11, bold: true };
  b3.alignment = { horizontal: 'center', vertical: 'middle' };
  b3.border = borderAll; // Based on typical forms, maybe B2:K3 have a box? The user said "B2 ... B3 ...". I'll add borders.

  // B5 - Title
  worksheet.mergeCells('B5:K5');
  const b5 = worksheet.getCell('B5');
  b5.value = formType === 'Storage' ? 'REQUEST FOR AUTHORITY TO STORAGE OF RECORD FORM' : 'REQUEST FOR AUTHORITY TO DISPOSE OF RECORD FORM';
  b5.font = { name: 'Times New Roman', size: 12, bold: true };
  b5.alignment = { horizontal: 'center', vertical: 'middle' };

  // Table Headers (Row 7)
  worksheet.getRow(7).height = 30;

  // B7
  const b7 = worksheet.getCell('B7');
  b7.value = 'GRDS/RDS\nITEM NO.';
  b7.font = { name: 'Times New Roman', size: 10, bold: true };
  b7.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  b7.border = borderAll;

  // C7:I7 - RECORD SERIES TITLE AND DESCRIPTION
  worksheet.mergeCells('C7:I7');
  const c7 = worksheet.getCell('C7');
  c7.value = 'RECORD SERIES TITLE AND DESCRIPTION';
  c7.font = { name: 'Times New Roman', size: 11, bold: true };
  c7.alignment = { horizontal: 'center', vertical: 'middle' };
  c7.border = borderAll;

  // J7
  const j7 = worksheet.getCell('J7');
  j7.value = 'Document\nYear';
  j7.font = { name: 'Times New Roman', size: 10, bold: true };
  j7.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  j7.border = borderAll;

  // K7
  const k7 = worksheet.getCell('K7');
  k7.value = 'Period\nCovered';
  k7.font = { name: 'Times New Roman', size: 10, bold: true };
  k7.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  k7.border = borderAll;

  // Populate data starting from Row 8
  let currentRow = 8;
  const numEmptyRows = 10; // ensure minimum 10 rows to look like a form
  const totalRows = Math.max(records.length, numEmptyRows);

  for (let i = 0; i < totalRows; i++) {
    worksheet.getRow(currentRow).height = 20;

    // B
    const cellB = worksheet.getCell(`B${currentRow}`);
    cellB.border = borderAll;
    cellB.alignment = { horizontal: 'center', vertical: 'middle' };

    // C-I
    worksheet.mergeCells(`C${currentRow}:I${currentRow}`);
    const cellC = worksheet.getCell(`C${currentRow}`);
    cellC.border = borderAll;
    cellC.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };

    // J
    const cellJ = worksheet.getCell(`J${currentRow}`);
    cellJ.border = borderAll;
    cellJ.alignment = { horizontal: 'center', vertical: 'middle' };

    // K
    const cellK = worksheet.getCell(`K${currentRow}`);
    cellK.border = borderAll;
    cellK.alignment = { horizontal: 'center', vertical: 'middle' };

    if (i < records.length) {
      const r = records[i];
      cellB.value = `${r.prdsGrds || ''} ${r.itemNo || ''}`.trim();
      cellC.value = r.seriesTitle || '';
      // Parse Document Year from inclusive dates if available, or createdAt
      let docYear = '';
      if (r.inclusiveDates) {
        const matches = r.inclusiveDates.match(/\b\d{4}\b/g);
        if (matches) docYear = matches.join('-');
      }
      if (!docYear) docYear = new Date(r.createdAt || Date.now()).getFullYear().toString();
      
      cellJ.value = docYear;
      cellK.value = r.inclusiveDates || 'N/A';
    }

    currentRow++;
  }

  // Add some space
  currentRow += 2;

  // Signatures
  // Prepared by:
  const prepLabel = worksheet.getCell(`B${currentRow}`);
  prepLabel.value = 'Prepared by:';
  prepLabel.font = { name: 'Times New Roman', size: 10 };

  // Checked and reviewed by:
  const chkLabel = worksheet.getCell(`G${currentRow}`);
  chkLabel.value = 'Checked and reviewed by:';
  chkLabel.font = { name: 'Times New Roman', size: 10 };

  currentRow += 3;

  // Lines
  worksheet.mergeCells(`B${currentRow}:D${currentRow}`);
  const prepLine = worksheet.getCell(`B${currentRow}`);
  prepLine.border = { bottom: thin };

  worksheet.mergeCells(`G${currentRow}:J${currentRow}`);
  const chkLine = worksheet.getCell(`G${currentRow}`);
  chkLine.border = { bottom: thin };

  const buffer = await workbook.xlsx.writeBuffer();
  return buffer;
}
