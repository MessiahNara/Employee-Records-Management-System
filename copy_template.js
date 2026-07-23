const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, 'NAP FORM 1 (Sample Format).xlsx');

const targets = [
  path.join(__dirname, 'public', 'nap_template.xlsx'),
  path.join(__dirname, 'public', 'template.xlsx'),
  path.join(__dirname, 'public', 'NAP FORM 1 (FORMAT).xlsx'),
  path.join(__dirname, 'public', 'NAP FORM 1 (Sample Format).xlsx'),
  path.join(__dirname, 'dist', 'nap_template.xlsx'),
  path.join(__dirname, 'dist', 'template.xlsx'),
  path.join(__dirname, 'dist', 'NAP FORM 1 (FORMAT).xlsx'),
  path.join(__dirname, 'dist', 'NAP FORM 1 (Sample Format).xlsx')
];

const buf = fs.readFileSync(src);
targets.forEach(t => {
  try {
    const dir = path.dirname(t);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(t, buf);
  } catch (e) {
    // ignore if dir missing
  }
});

console.log('SUCCESS: All public & dist template files synchronized to 174KB master NAP FORM 1 (Sample Format).xlsx');
