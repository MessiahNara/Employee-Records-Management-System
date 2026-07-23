import xlsx from 'xlsx';
import fs from 'fs';

try {
  const wb = xlsx.readFile('NAP FORM 1 (FORMAT).xlsx');
  console.log('SheetNames:', wb.SheetNames);
  wb.SheetNames.forEach(sheetName => {
    console.log('--- Sheet:', sheetName, '---');
    const ws = wb.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json(ws, { header: 1 });
    data.slice(0, 40).forEach((row, i) => console.log(i + 1, JSON.stringify(row)));
  });
} catch (e) {
  console.error(e);
}
