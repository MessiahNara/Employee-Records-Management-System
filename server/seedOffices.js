const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const offices = [
  "Accounting - Provincial Accounting Office",
  "Agriculture - Provincial Agriculture Office",
  "Archives - Provincial Archives and Records Center",
  "Assessor - Provincial Assessment Office",
  "BAC - Bids and Awards Committee",
  "BM Staff - all offices of bm",
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

async function main() {
  let settings = await prisma.systemSetting.findFirst();
  if (!settings) {
    settings = await prisma.systemSetting.create({
      data: {
        officeNames: offices,
      },
    });
    console.log(`Created new systemSetting with ${offices.length} offices.`);
  } else {
    // Preserve any custom non-duplicate office entries, but ensure all 53 are present
    const existing = Array.isArray(settings.officeNames) ? settings.officeNames : [];
    const set = new Set(existing);
    offices.forEach(o => set.add(o));
    const merged = Array.from(set);

    await prisma.systemSetting.update({
      where: { id: settings.id },
      data: {
        officeNames: offices, // Set exactly to the 53 requested standard offices
      },
    });
    console.log(`Successfully updated systemSetting #${settings.id} with all ${offices.length} offices!`);
  }
}

main()
  .catch(e => {
    console.error('Failed to seed offices:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
