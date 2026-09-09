require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const s = await prisma.systemSetting.findFirst();
  console.log('--- SYSTEM SETTINGS officeNames ---');
  if (s && s.officeNames) {
    console.log(s.officeNames.filter(x => x.includes('Asingan') || x.includes('Community Hospital')));
  } else {
    console.log('No officeNames in systemSetting');
  }

  console.log('--- DISTINCT EMPLOYEE officeName ---');
  const distinct = await prisma.employee.findMany({
    select: { officeName: true },
    distinct: ['officeName'],
  });
  console.log(distinct.map(d => d.officeName).filter(x => x && (x.includes('Asingan') || x.includes('Community Hospital'))));
}

main().catch(console.error).finally(() => prisma.$disconnect());
