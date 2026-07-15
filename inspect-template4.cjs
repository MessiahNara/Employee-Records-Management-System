const JSZip = require('./node_modules/jszip');
const fs = require('fs');

const buf = fs.readFileSync('public/template.xlsx');
JSZip.loadAsync(buf).then(async zip => {
  const xml = await zip.file('xl/worksheets/sheet1.xml').async('string');

  // Find all page header rows (style 6 = first data row)
  const s6Rows = [...xml.matchAll(/<c r="A(\d+)" s="6"/g)].map(m => parseInt(m[1]));
  console.log('Rows with style 6 (first data row of page):', s6Rows.join(', '));

  // Find all rows with s="11" (page separator / divider)
  const s11Rows = [...xml.matchAll(/<c r="A(\d+)" s="11"/g)].map(m => parseInt(m[1]));
  console.log('Rows with style 11 (mid-page divider):', s11Rows.join(', '));

  // Find all rows with s="9" and s="10" per page 
  const s9Rows2 = [...xml.matchAll(/<c r="A(\d+)" s="9"/g)].map(m => parseInt(m[1]));
  const s10Rows2 = [...xml.matchAll(/<c r="A(\d+)" s="10"/g)].map(m => parseInt(m[1]));
  console.log('Rows with style 9 (penultimate per page):', s9Rows2.join(', '));
  console.log('Rows with style 10 (last data row per page):', s10Rows2.join(', '));

  // Show rows around 190-210 (second page boundary area)
  console.log('\n=== Rows 195-210 ===');
  for (let r = 195; r <= 210; r++) {
    const idx = xml.indexOf(`<row r="${r}"`);
    if (idx !== -1) {
      const snippet = xml.substring(idx, idx + 250);
      const nextRowIdx = snippet.indexOf(`<row r="${r+1}"`) || snippet.length;
      console.log(`Row ${r}: ${snippet.substring(0, 200)}`);
    }
  }

  // Count total pages: find all occurrences of the "page header" pattern
  // (rows 1-8 repeat at the top of each page)
  // Find the "rows 100+" that represent signature area of page 1
  // then find where page 2 starts

  // Better approach: look for rows where C and G have styles 3/4 with NO A column
  // That's the signature section. Find all groups.
  const sigStart = [];
  const allRows = xml.match(/<row r="(\d+)"[^>]*>[\s\S]*?(?=<row r="|<\/sheetData>)/g) || [];
  let inSig = false;
  for (const rowXml of allRows) {
    const rowNum = parseInt(rowXml.match(/<row r="(\d+)"/)[1]);
    const hasSigPattern = /^<row r="\d+"[^>]*><c r="C\d+" s="3"\/>/.test(rowXml) ||
                          rowXml.includes('<c r="C' + rowNum + '" s="3"') && !rowXml.includes('<c r="A' + rowNum);
    if (hasSigPattern && !inSig) {
      sigStart.push(rowNum);
      inSig = true;
    } else if (!hasSigPattern) {
      inSig = false;
    }
  }
  console.log('\nSignature section start rows:', sigStart.join(', '));

  // Find where each "page 2,3..." header starts (rows 1-8 pattern repeating)
  // Look for rows with A col style 37 (Republic of Philippines = row 1 pattern)
  const s37Rows = [...xml.matchAll(/<c r="A(\d+)" s="37"/g)].map(m => parseInt(m[1]));
  console.log('Rows with style 37 (Republic header):', s37Rows.join(', '));

}).catch(e => console.error(e));
