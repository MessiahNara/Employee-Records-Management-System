const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const templatePath = path.join(__dirname, '..', 'NAP FORM 1 (FORMAT).xlsx');
const publicPath = path.join(__dirname, '..', 'public', 'nap_template.xlsx');

fs.copyFileSync(templatePath, publicPath);
console.log('Copied template to public/nap_template.xlsx');

const fileBuffer = fs.readFileSync(templatePath);
const wb = XLSX.read(fileBuffer, { type: 'buffer', cellStyles: true });

console.log('Sheet names:', wb.SheetNames);
const ws = wb.Sheets[wb.SheetNames[0]];

console.log('Ref before:', ws['!ref']);
console.log('Merges before count:', (ws['!merges'] || []).length);

// Test modifying cells
ws['J4'] = { t: 's', v: 'Human Resource Management and Development Office (HRMDO) - Administrative' };
ws['N8'] = { t: 's', v: 'July 23, 2026' };

// Test writing data rows
const mockData = [
  { seriesTitle: 'Test Series 1', scopeDescription: 'Desc 1', inclusiveDates: '2020-2025', volume: '5', medium: 'Paper', restrictions: 'None', locationOfRecords: 'Cabinet 1', frequencyOfUse: 'Active', duplication: 'Original', appraisalCategory: 'Temporary', utilityValue: 'Adm', activeDeskYrs: 2, storageYrs: 3, totalRetention: 5, dispositionProvision: 'Dispose' }
];

mockData.forEach((r, i) => {
  const rowIdx = 12 + i;
  ws[`A${rowIdx}`] = { t: 's', v: `${i + 1}. ${r.seriesTitle}\n${r.scopeDescription}` };
  ws[`D${rowIdx}`] = { t: 's', v: r.inclusiveDates };
  ws[`E${rowIdx}`] = { t: 's', v: r.volume };
  ws[`F${rNum = rowIdx}`] = { t: 's', v: r.medium };
});

const outPath = path.join(__dirname, 'test_output.xlsx');
XLSX.writeFile(wb, outPath);
console.log('Wrote test output successfully to:', outPath);
