const fs = require('fs');
const content = fs.readFileSync('c:\\Employee Records Management System\\src\\pages\\Dashboard.tsx', 'utf8');
const lines = content.split('\n');
let out = '';
lines.forEach((line, i) => {
  if (line.includes('handleExport')) {
    out += `${i+1}: ${line}\n`;
  }
  if (line.includes('ExportButton')) {
    out += `${i+1}: ${line}\n`;
  }
});
fs.writeFileSync('c:\\Employee Records Management System\\search_out.txt', out);
