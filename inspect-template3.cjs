const JSZip = require('./node_modules/jszip');
const fs = require('fs');

const buf = fs.readFileSync('public/template.xlsx');
JSZip.loadAsync(buf).then(async zip => {
  const xml = await zip.file('xl/worksheets/sheet1.xml').async('string');

  // Find all unique style patterns to understand page structure
  // Row 9: first data row (style s="6" for A col)
  // Row 10-23: data rows (style s="7" for A col)
  // Row 24: special "last row of page 1" (style s="11")
  // Row 25: continues with s="7"
  // Row 67: changes to s="8"
  // Row 98: s="9"
  // Row 99: s="10" - appears to be a footer/last row
  // Row 100: signature row (C100, D100, G100)

  // Find all rows with style s="9", s="10", s="11" — these are structural
  const specialRows = [];
  const rowMatches = xml.match(/<row r="(\d+)"[^>]*>.*?(?=<row r="|<\/sheetData>)/gs) || [];
  for (const rowXml of rowMatches) {
    const rowNum = parseInt(rowXml.match(/<row r="(\d+)"/)[1]);
    if (rowXml.includes('s="9"') || rowXml.includes('s="10"') || rowXml.includes('s="11"')) {
      // Style 9 = second-to-last data row, 10 = last data row, 11 = page separator
      const cells = rowXml.match(/s="(\d+)"/g)?.map(m => m.match(/\d+/)[0]);
      console.log(`Row ${rowNum}: styles = ${[...new Set(cells)].join(',')}`);
    }
  }

  // Sample: find every row where A column style changes significantly
  console.log('\n=== Row style patterns (A column) ===');
  const aColStyles = {};
  const cMatches = xml.match(/<row r="(\d+)"[^>]*>[\s\S]*?<c r="A(\d+)" s="(\d+)"/g) || [];
  for (const m of cMatches) {
    const parts = m.match(/<row r="(\d+)"[^>]*>[\s\S]*?<c r="A\d+" s="(\d+)"/);
    if (parts) {
      const rowNum = parseInt(parts[1]);
      const style = parts[2];
      if (!aColStyles[style]) aColStyles[style] = [];
      aColStyles[style].push(rowNum);
    }
  }
  for (const [style, rows] of Object.entries(aColStyles)) {
    const sorted = rows.sort((a, b) => a - b);
    console.log(`Style ${style}: rows ${sorted[0]}-${sorted[sorted.length-1]} (count: ${sorted.length}), first few: ${sorted.slice(0,8).join(',')}`);
  }

  // Find page break pattern - look at rows around 99-102
  console.log('\n=== Rows 95-115 ===');
  for (let r = 95; r <= 115; r++) {
    const rMatch = xml.match(new RegExp(`<row r="${r}"[^>]*>[\\s\\S]*?(?=<row r="|<\\/sheetData>)`));
    if (rMatch) {
      console.log(`Row ${r}: ${rMatch[0].substring(0, 200)}`);
    }
  }

  // Look for rows with style 9 and 10 to understand the "last row" pattern
  console.log('\n=== All rows with s="9" in A column (second-to-last per page) ===');
  const s9Rows = [...xml.matchAll(/<c r="A(\d+)" s="9"/g)].map(m => parseInt(m[1]));
  console.log(s9Rows.join(', '));

  console.log('\n=== All rows with s="10" in A column (last row per page) ===');
  const s10Rows = [...xml.matchAll(/<c r="A(\d+)" s="10"/g)].map(m => parseInt(m[1]));
  console.log(s10Rows.join(', '));

  console.log('\n=== All rows with s="11" in A column (page header separator) ===');
  const s11Rows = [...xml.matchAll(/<c r="A(\d+)" s="11"/g)].map(m => parseInt(m[1]));
  console.log(s11Rows.join(', '));

  // Find signature rows (C and G cells but no A cell with data style)
  console.log('\n=== Rows with C+G cells but different pattern (signature rows) ===');
  const sigRows = [...xml.matchAll(/<row r="(\d+)"[^>]*><c r="C\d+"/g)].map(m => parseInt(m[1]));
  console.log('Rows starting with C:', sigRows.slice(0, 30).join(', '));

}).catch(e => console.error(e));
