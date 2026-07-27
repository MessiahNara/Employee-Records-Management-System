const ExcelJS = require('exceljs');

(async () => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile('NAP FORM 1 (FORMAT).xlsx');
  const ws = wb.worksheets[0];
  console.log('NAME:', ws.name);
  console.log('ROWS:', ws.rowCount, 'COLS:', ws.columnCount);
  
  for (let i = 1; i <= 16; i++) {
    const l = String.fromCharCode(64 + i);
    console.log('Col', l, 'w:', ws.getColumn(i).width);
  }
  
  ws.eachRow({ includeEmpty: true }, (row, rn) => {
    console.log('Row', rn, 'h:', row.height);
  });
  
  console.log('MERGES:', JSON.stringify(ws.model.merges));
  
  ws.eachRow({ includeEmpty: true }, (row, rn) => {
    row.eachCell({ includeEmpty: false }, (cell, cn) => {
      const l = String.fromCharCode(64 + cn);
      let v = cell.value;
      if (v && typeof v === 'object' && v.richText) {
        v = 'RT:' + v.richText.map(r => r.text).join('');
      }
      const f = cell.font || {};
      const a = cell.alignment || {};
      const b = cell.border || {};
      console.log(`${l}${rn} val=${JSON.stringify(v)} font=${JSON.stringify(f)} align=${JSON.stringify(a)} border=${JSON.stringify(b)}`);
    });
  });
})().catch(e => console.error(e));
