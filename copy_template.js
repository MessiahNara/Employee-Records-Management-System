const fs = require('fs');
// Copy the correct AO template to the public directory
fs.copyFileSync('template.xlsx', 'public/template.xlsx');
console.log('AO template copied successfully. Size:', fs.statSync('public/template.xlsx').size, 'bytes');
