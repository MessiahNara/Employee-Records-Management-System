const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs');

async function run() {
  const filePath = path.join(__dirname, '../../public/SCANNING SUMMARY FORMAT.xlsx');
  console.log('Reading:', filePath);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);

  console.log('Original worksheets:', wb.worksheets.map(w => ({ id: w.id, name: w.name })));

  const sheetsToRemove = wb.worksheets.filter(w => w.name !== 'Office Scanning Tracker');
  sheetsToRemove.forEach(w => {
    console.log('Removing sheet:', w.name, 'id:', w.id);
    wb.removeWorksheet(w.id);
  });

  const wsTracker = wb.getWorksheet('Office Scanning Tracker');
  if (wsTracker) {
    wsTracker.state = 'visible';
    wb.views = [
      {
        x: 0,
        y: 0,
        width: 10000,
        height: 20000,
        firstSheet: 0,
        activeTab: 0,
        visibility: 'visible',
      },
    ];
  }

  await wb.xlsx.writeFile(filePath);
  console.log('Successfully saved cleaned template!');

  const checkWb = new ExcelJS.Workbook();
  await checkWb.xlsx.readFile(filePath);
  console.log('Verified worksheets in template:', checkWb.worksheets.map(w => w.name));
}

run().catch(err => console.error(err));
