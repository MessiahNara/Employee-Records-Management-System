import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  // Check employees that have AO documents
  const empsWithAoDocs = await (prisma as any).employee.findMany({
    where: { documents: { some: { category: 'Administrative Order' } } },
    select: {
      id: true, aoType: true, aoNumber: true, aoYear: true,
      detailedOrderFrom: true, detailedOrderTo: true,
      detailedDate: true, detailedTo: true,
      designatedOrderFrom: true, designatedOrderTo: true,
      designatedPositionFunction: true,
    },
    take: 10,
  });
  console.log('EMPS WITH AO DOCS:', JSON.stringify(empsWithAoDocs, null, 2));
}
main().catch(console.error).finally(() => prisma.$disconnect());
