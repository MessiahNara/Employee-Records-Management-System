const JSZip = require('./node_modules/jszip');
const fs = require('fs');

const buf = fs.readFileSync('public/template.xlsx');
JSZip.loadAsync(buf).then(async zip => {
  const xml = await zip.file('xl/worksheets/sheet1.xml').async('string');

  // Find ALL rows with style 6 (first data row of each page)
  const s6All = [...xml.matchAll(/<c r="A(\d+)" s="6"/g)].map(m => parseInt(m[1]));
  console.log('All style-6 rows (first data row per page):', s6All.join(', '));

  // Find ALL rows with style 37 (Republic header row = page top)
  const s37All = [...xml.matchAll(/<c r="A(\d+)" s="37"/g)].map(m => parseInt(m[1]));
  console.log('All style-37 rows (page header row 1):', s37All.join(', '));

  // Find ALL rows with style 38 (rows 2-5 of each page header)
  const s38All = [...xml.matchAll(/<c r="A(\d+)" s="38"/g)].map(m => parseInt(m[1]));
  console.log('All style-38 rows (header rows 2-5):', s38All.join(', '));

  // Find ALL rows with style 39 (title row = A6 of each page)
  const s39All = [...xml.matchAll(/<c r="A(\d+)" s="39"/g)].map(m => parseInt(m[1]));
  console.log('All style-39 rows (title row per page):', s39All.join(', '));

  // Find ALL rows with style 10 (last data row per page)
  const s10All = [...xml.matchAll(/<c r="A(\d+)" s="10"/g)].map(m => parseInt(m[1]));
  console.log('All style-10 rows (last data row per page):', s10All.join(', '));

  // Find ALL rows with style 35 (column header row 7)
  const s35All = [...xml.matchAll(/<c r="A(\d+)" s="35"/g)].map(m => parseInt(m[1]));
  console.log('All style-35 rows (column header row 7):', s35All.join(', '));

  // Find ALL rows with style 11 (mid-page divider)
  const s11All = [...xml.matchAll(/<c r="A(\d+)" s="11"/g)].map(m => parseInt(m[1]));
  console.log('All style-11 rows (mid-page divider):', s11All.join(', '));

  // Determine the page interval by looking at gap between style-37 rows
  if (s37All.length > 1) {
    for (let i = 1; i < s37All.length; i++) {
      console.log(`Page interval ${i}: ${s37All[i] - s37All[i-1]} rows`);
    }
  }

  // Show rows around what should be page 2 start
  // If page 1 ends at row 99 with sigs at 100-112, page 2 header might start at ~113
  console.log('\n=== Looking for page 2 start (rows 108-125) ===');
  for (let r = 108; r <= 125; r++) {
    const idx = xml.indexOf(`<row r="${r}"`);
    if (idx !== -1) {
      const snippet = xml.substring(idx, idx + 180);
      console.log(`Row ${r}: ${snippet.substring(0, 180)}`);
    }
  }

}).catch(e => console.error(e));
