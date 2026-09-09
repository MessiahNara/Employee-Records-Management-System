import ExcelJS from 'exceljs';
import fs from 'fs';
import path from 'path';

async function testPopulate() {
  const templatePath = path.resolve('..', 'public', 'SCANNING SUMMARY FORMAT.xlsx');
  const buffer = fs.readFileSync(templatePath);

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as any);

  console.log('Successfully loaded template into ExcelJS!');
  const trackerSheet = workbook.getWorksheet('Office Scanning Tracker')!;
  const dashboardSheet = workbook.getWorksheet('Dashboard & Summary')!;

  console.log('Tracker sheet name:', trackerSheet.name);
  console.log('Dashboard sheet name:', dashboardSheet.name);

  // Check C6 cell: "Number of Employees as of ____________"
  console.log('C6 value:', trackerSheet.getCell('C6').value);
}

testPopulate().catch(console.error);
