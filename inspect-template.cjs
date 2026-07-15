const JSZip = require('./node_modules/jszip');
const fs = require('fs');

const buf = fs.readFileSync('public/template.xlsx');
JSZip.loadAsync(buf).then(async zip => {
  console.log('=== FILES IN ZIP ===');
  Object.keys(zip.files).forEach(f => console.log(f));

  const wb = await zip.file('xl/workbook.xml').async('string');
  console.log('\n=== workbook.xml ===');
  console.log(wb);

  const sheets = Object.keys(zip.files).filter(f => f.startsWith('xl/worksheets/sheet') && f.endsWith('.xml'));
  for (const s of sheets) {
    const xml = await zip.file(s).async('string');
    console.log('\n=== ' + s + ' (first 8000 chars) ===');
    console.log(xml.substring(0, 8000));
  }

  // Also read sharedStrings if present
  const ss = zip.file('xl/sharedStrings.xml');
  if (ss) {
    const ssXml = await ss.async('string');
    console.log('\n=== sharedStrings.xml ===');
    console.log(ssXml.substring(0, 4000));
  }
}).catch(e => console.error(e));
