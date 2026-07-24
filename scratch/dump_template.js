const fs = require('fs');
const JSZip = require('jszip');

async function inspect() {
  const data = fs.readFileSync('c:\\Employee Records Management System\\NAP FORM 1 (FORMAT).xlsx');
  const zip = await JSZip.loadAsync(data);
  const sheet = await zip.file('xl/worksheets/sheet1.xml').async('text');
  
  const stringsFile = zip.file('xl/sharedStrings.xml');
  let strings = '';
  if (stringsFile) strings = await stringsFile.async('text');
  
  fs.writeFileSync('c:\\Employee Records Management System\\scratch\\template_dump.txt', '=== SHEET ===\n' + sheet.substring(0, 5000) + '\n\n=== STRINGS ===\n' + strings.substring(0, 5000));
}
inspect().catch(console.error);
