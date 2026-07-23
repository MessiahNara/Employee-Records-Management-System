const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');

const templatePath = path.join(__dirname, '..', 'NAP FORM 1 (FORMAT).xlsx');
const buffer = fs.readFileSync(templatePath);

JSZip.loadAsync(buffer).then(async (zip) => {
  console.log('Zip file list:', Object.keys(zip.files));
  
  if (zip.files['xl/sharedStrings.xml']) {
    const sharedStrings = await zip.files['xl/sharedStrings.xml'].async('text');
    console.log('Shared Strings snippet:', sharedStrings.slice(0, 500));
  }
  
  if (zip.files['xl/worksheets/sheet1.xml']) {
    const sheet1 = await zip.files['xl/worksheets/sheet1.xml'].async('text');
    console.log('Sheet1 snippet:', sheet1.slice(0, 1000));
  }
});
