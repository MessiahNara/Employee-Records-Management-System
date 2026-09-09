const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');
const prisma = new PrismaClient();

// 1. All requested offices with abbreviations (and BM Staff as just "BM Staff")
const standardAbbreviated = [
  "Accounting - Provincial Accounting Office",
  "Agriculture - Provincial Agriculture Office",
  "Archives - Provincial Archives and Records Center",
  "Assessor - Provincial Assessment Office",
  "BAC - Bids and Awards Committee",
  "BM Staff",
  "Board Members - Office of the Sangguniang Panlalawigan Members",
  "Board Secretary - Office of the Provincial Board Secretary",
  "Budget - Provincial Budget Office",
  "Capitol Resort - Capitol Resort Hotel Operations Division",
  "COA - Commission on Audit",
  "CSC - Civil Service Commission",
  "Engineering - Provincial Engineering Office",
  "GSO - General Services Office",
  "Housing - Provincial Human Settlements and Urban Development Authority",
  "HRMDO - Human Resource Management and Development Office",
  "IAD - Internal Audit Division",
  "Jail - Pangasinan Provincial Jail",
  "Legal - Provincial Legal Office",
  "Library - Pangasinan Provincial Library",
  "MISO - Management Information Service Office",
  "PDRRMO - Provincial Disaster Risk Reduction and Management Office",
  "PEDIPO - Provincial Economic Development and Investment Promotion Office",
  "PENRO - Provincial Government - Environment and Natural Resources Office",
  "PESO - Public Employment Services Office",
  "PGO - Provincial Governor's Office",
  "PHMSO - Provincial Hospital Management Services Office",
  "PHO - Provincial Health Office",
  "PIMRO - Pangasinan Information and Media Relations Office",
  "PPC - Pangasinan Polytechnic College",
  "PPCLDO - Provincial Population Cooperative and Livelihood Development Office",
  "PPDO - Provincial Planning and Development Office",
  "PSWDO - Provincial Social Welfare and Development Office",
  "Reformation - Pangasinan Reformation Center",
  "TESDA - Technical Education and Skills Development Authority",
  "Tourism - Provincial Tourism and Cultural Affairs Office",
  "Treasury - Provincial Treasury Office",
  "Veterinary - Provincial Veterinary Office",
  "Vice Gov - Provincial Vice Governor's Office",
  "Alaminos - Western Pangasinan District Hospital",
  "Asingan - Asingan Community Hospital",
  "Bayambang - Bayambang District Hospital",
  "Bolinao - Bolinao Community Hospital",
  "Dasol - Dasol Community Hospital",
  "Lingayen - Lingayen District Hospital",
  "Manaoag - Manaoag Community Hospital",
  "Mangatarem - Mangatarem District Hospital",
  "Mapandan - Mapandan Community Hospital",
  "Pozorrubio - Pozorrubio Community Hospital",
  "PPH San Carlos - Pangasinan Provincial Hospital",
  "Tayug - Eastern Pangasinan District Hospital",
  "Umingan - Umingan Community Hospital",
  "Urdaneta - Urdaneta District Hospital"
];

async function run() {
  console.log('1. Updating all employee records with "Office of BM ..." to "BM Staff"...');
  
  const empOfficeRes = await prisma.employee.updateMany({
    where: { officeName: { startsWith: 'Office of BM ' } },
    data: { officeName: 'BM Staff' }
  });
  console.log(`Updated ${empOfficeRes.count} employee officeName records.`);

  const empMotherRes = await prisma.employee.updateMany({
    where: { motherUnit: { startsWith: 'Office of BM ' } },
    data: { motherUnit: 'BM Staff' }
  });
  console.log(`Updated ${empMotherRes.count} employee motherUnit records.`);

  const empDetailedRes = await prisma.employee.updateMany({
    where: { detailedTo: { startsWith: 'Office of BM ' } },
    data: { detailedTo: 'BM Staff' }
  });
  console.log(`Updated ${empDetailedRes.count} employee detailedTo records.`);

  // 2. Load all previous non-BM offices from latest pre-edit backup
  const backupPath = path.join(__dirname, 'backups', 'db_backup_scheduled_2026-09-03T03-00-04-815Z.json');
  let backupOffices = [];
  if (fs.existsSync(backupPath)) {
    const backup = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
    backupOffices = backup.data?.systemSettings?.[0]?.officeNames || [];
  }

  // Filter out any "Office of BM ..." and "all offices of bm"
  const nonBmPreviousOffices = backupOffices.filter(o => 
    !o.startsWith('Office of BM ') && 
    !o.toLowerCase().includes('all office')
  );

  // Combine: Start with standard abbreviated list, then add previous offices that aren't already included
  const finalSet = new Set(standardAbbreviated);

  for (const prev of nonBmPreviousOffices) {
    // If it's not already in the set, add it
    if (!finalSet.has(prev)) {
      finalSet.add(prev);
    }
  }

  const finalList = Array.from(finalSet);

  // 3. Save to SystemSetting in DB
  const settings = await prisma.systemSetting.findFirst();
  if (settings) {
    await prisma.systemSetting.update({
      where: { id: settings.id },
      data: { officeNames: finalList }
    });
    console.log(`Updated systemSetting officeNames with ${finalList.length} total offices.`);
  }

  console.log('Sample of final office list:', finalList.slice(0, 10));
  console.log('BM related entries in final list:', finalList.filter(o => o.includes('BM') || o.includes('Board')));
}

run()
  .catch(e => {
    console.error('Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
