const fs = require('fs');
const path = require('path');
fs.copyFileSync(
  path.join(__dirname, 'public', 'template.xlsx'),
  path.join(__dirname, 'public', 'ao_template.xlsx')
);
console.log('Restored ao_template.xlsx successfully');
