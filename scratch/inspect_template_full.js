const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const fileP = path.join(__dirname, '..', 'NAP FORM 1 (FORMAT).xlsx');
const wb = XLSX.readFile(fileP, { cellStyles: true });

console.log('Sheet Names:', wb.SheetNames);
const ws = wb.Sheets[wb.SheetNames[0]];

const range = XLSX.utils.decode_range(ws['!ref'] || 'A1:P50');
console.log('Ref Range:', ws['!ref']);
console.log('Merges:', JSON.stringify(ws['!merges']));

console.log('\n--- NON EMPTY CELLS IN TEMPLATE ---');
for (let r = range.s.r; r <= range.e.r; r++) {
  let rowStr = `Row ${r + 1}: `;
  let hasVal = false;
  for (let c = range.s.c; c <= range.e.c; c++) {
    const addr = XLSX.utils.encode_cell({ r, c });
    if (ws[addr] && ws[addr].v !== undefined) {
      rowStr += `[${addr}=${JSON.stringify(ws[addr].v)}] `;
      hasVal = true;
    }
  }
  if (hasVal) console.log(rowStr);
}
