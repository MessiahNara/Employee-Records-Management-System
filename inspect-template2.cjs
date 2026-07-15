const JSZip = require('./node_modules/jszip');
const fs = require('fs');

const buf = fs.readFileSync('public/template.xlsx');
JSZip.loadAsync(buf).then(async zip => {
  const xml = await zip.file('xl/worksheets/sheet1.xml').async('string');
  
  // Print full xml
  console.log('=== FULL sheet1.xml ===');
  console.log(xml);
  
  // Check for page breaks
  const hasRowBreaks = xml.includes('rowBreaks');
  const hasColBreaks = xml.includes('colBreaks');
  const hasMerge = xml.includes('mergeCells');
  const hasPrint = xml.includes('pageSetup');
  const hasPageMargins = xml.includes('pageMargins');
  
  console.log('\n=== STRUCTURE SUMMARY ===');
  console.log('Has rowBreaks:', hasRowBreaks);
  console.log('Has colBreaks:', hasColBreaks);
  console.log('Has mergeCells:', hasMerge);
  console.log('Has pageSetup:', hasPrint);
  console.log('Has pageMargins:', hasPageMargins);
  console.log('Total XML length:', xml.length);
  
  // Count rows
  const rowMatches = xml.match(/<row r="(\d+)"/g) || [];
  if (rowMatches.length > 0) {
    const rowNums = rowMatches.map(m => parseInt(m.match(/\d+/)[0]));
    console.log('First row:', Math.min(...rowNums));
    console.log('Last row:', Math.max(...rowNums));
    console.log('Total rows in template:', rowNums.length);
  }

  // Extract rowBreaks section
  const rbMatch = xml.match(/<rowBreaks[\s\S]*?<\/rowBreaks>/);
  if (rbMatch) {
    console.log('\n=== rowBreaks ===');
    console.log(rbMatch[0]);
  }
  
  // Extract mergeCells section
  const mcMatch = xml.match(/<mergeCells[\s\S]*?<\/mergeCells>/);
  if (mcMatch) {
    console.log('\n=== mergeCells ===');
    console.log(mcMatch[0]);
  }
  
  // Extract pageSetup
  const psMatch = xml.match(/<pageSetup[^>]*\/>/);
  if (psMatch) {
    console.log('\n=== pageSetup ===');
    console.log(psMatch[0]);
  }
  
  // Extract printOptions
  const poMatch = xml.match(/<printOptions[^>]*\/>/);
  if (poMatch) {
    console.log('\n=== printOptions ===');
    console.log(poMatch[0]);
  }
}).catch(e => console.error(e));
