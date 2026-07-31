const fs = require('fs');
const path = require('path');

const recordsPath = path.join(__dirname, 'server/data/records.json');
if (!fs.existsSync(recordsPath)) {
  console.log('No records.json found');
  process.exit(0);
}
let records = JSON.parse(fs.readFileSync(recordsPath, 'utf8'));
let modified = false;

const storageRecords = records.filter(r => r.id.includes('_storage_'));
storageRecords.forEach(sr => {
  const originalId = sr.id.split('_storage_')[0];
  const originalIndex = records.findIndex(r => r.id === originalId);
  if (originalIndex !== -1) {
    const orig = records[originalIndex];
    const origYears = orig.inclusiveDates ? orig.inclusiveDates.match(/\d{4}/g).map(Number) : [];
    const storYears = sr.inclusiveDates ? sr.inclusiveDates.match(/\d{4}/g).map(Number) : [];
    const allYears = [...new Set([...origYears, ...storYears])].sort((a,b)=>a-b);
    
    if (allYears.length > 0) {
      const targetGroups = [];
      let curGrp = [allYears[0]];
      for (let i = 1; i < allYears.length; i++) {
        if (allYears[i] === allYears[i-1] + 1) {
          curGrp.push(allYears[i]);
        } else {
          targetGroups.push(curGrp);
          curGrp = [allYears[i]];
        }
      }
      targetGroups.push(curGrp);
      orig.inclusiveDates = targetGroups.map(g => g.length === 1 ? String(g[0]) : g[0] + ' - ' + g[g.length - 1]).join(', ');
    }
    orig.retentionStage = 'Active';
    orig.frequencyOfUse = 'Active';
    modified = true;
  }
});

records = records.filter(r => !r.id.includes('_storage_'));

if (modified) {
  fs.writeFileSync(recordsPath, JSON.stringify(records, null, 2));
  console.log('Merged storage records successfully.');
} else {
  console.log('No storage records to merge.');
}
