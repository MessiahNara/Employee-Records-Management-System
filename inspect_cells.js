const fs = require('fs');
const JSZip = require('jszip');

async function run() {
  const file = 'c:/Employee Records Management System/NAP FORM 1 (FORMAT).xlsx';
  const zip = await JSZip.loadAsync(fs.readFileSync(file));
  const sheetXml = await zip.file('xl/worksheets/sheet1.xml').async('text');
  
  let strings = [];
  if (zip.file('xl/sharedStrings.xml')) {
    const ssXml = await zip.file('xl/sharedStrings.xml').async('text');
    // Simple regex parse shared strings
    const matches = ssXml.match(/<t[^>]*>(.*?)<\/t>/g);
    if (matches) {
      strings = matches.map(m => m.replace(/<\/?[^>]+(>|$)/g, ''));
    }
  }

  fs.writeFileSync('c:/Employee Records Management System/inspect_output.txt', `Sheet XML length: ${sheetXml.length}\nShared strings count: ${strings.length}\nShared strings:\n${strings.join('\n')}\n`);
  console.log('Done inspecting');
}

run().catch(console.error);
