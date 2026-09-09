import ExcelJS from 'exceljs';
import path from 'path';

async function inspect() {
  const filePath = path.resolve('..', 'public', 'SCANNING SUMMARY FORMAT.xlsx');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const ws = workbook.getWorksheet('Office Scanning Tracker')!;

  console.log('--- Page Setup ---');
  console.log(ws.pageSetup);

  console.log('\n--- Merged Ranges ---');
  // @ts-ignore
  console.log(ws.model?.merges);

  console.log('\n--- Rows 1-8 Header Layout ---');
  for (let r = 1; r <= 8; r++) {
    const row = ws.getRow(r);
    console.log(`\nRow ${r} (height: ${row.height})`);
    for (let c = 1; c <= 19; c++) {
      const cell = row.getCell(c);
      if (cell.value !== null && cell.value !== undefined) {
        console.log(`  ${cell.address}: "${String(cell.value).replace(/\n/g, ' ')}" font=${cell.font?.name} ${cell.font?.size}pt ${cell.font?.bold ? 'bold' : ''} align=${cell.alignment?.horizontal}/${cell.alignment?.vertical}`);
      }
    }
  }

  console.log('\n--- Sample Data Row 9 ---');
  const r9 = ws.getRow(9);
  for (let c = 1; c <= 19; c++) {
    const cell = r9.getCell(c);
    console.log(`  ${cell.address} (col ${c}): val=${JSON.stringify(cell.value)} formula=${cell.formula || ''}`);
  }

  console.log('\n--- Totals Row 62 ---');
  const r62 = ws.getRow(62);
  for (let c = 1; c <= 19; c++) {
    const cell = r62.getCell(c);
    if (cell.value !== null && cell.value !== undefined) {
      console.log(`  ${cell.address} (col ${c}): val=${JSON.stringify(cell.value)} formula=${cell.formula || ''}`);
    }
  }
}

inspect().catch(console.error);
