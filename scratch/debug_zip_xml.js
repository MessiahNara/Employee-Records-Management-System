const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');

const templatePath = path.join(__dirname, '..', 'NAP FORM 1 (FORMAT).xlsx');
const buffer = fs.readFileSync(templatePath);

JSZip.loadAsync(buffer).then(async (zip) => {
  const xml = await zip.files['xl/worksheets/sheet1.xml'].async('text');
  console.log('--- SHEET1.XML LENGTH ---', xml.length);
  
  // Find rows 4, 8, 12 in xml
  const row4 = xml.match(/<row r="4".*?<\/row>/s);
  const row8 = xml.match(/<row r="8".*?<\/row>/s);
  const row12 = xml.match(/<row r="12".*?<\/row>/s);

  console.log('Row 4:', row4 ? row4[0] : 'NOT FOUND');
  console.log('Row 8:', row8 ? row8[0] : 'NOT FOUND');
  console.log('Row 12:', row12 ? row12[0] : 'NOT FOUND');
});
