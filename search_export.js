const fs = require('fs');
const content = fs.readFileSync('c:\\Employee Records Management System\\src\\pages\\Dashboard.tsx', 'utf8');
const lines = content.split('\n');
let out = '';
lines.forEach((line, i) => {
  if (line.toLowerCase().includes('export')) {
    out += `${i+1}: ${line}\n`;
  }
});
fs.writeFileSync('c:\\Employee Records Management System\\search_export.txt', out);
