import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const offices = await prisma.employee.groupBy({
    by: ['officeName'],
    _count: true,
  });
  console.log('--- ALL EMPLOYEE OFFICES AND COUNTS ---');
  offices.forEach((o: any) => {
    console.log(`"${o.officeName}": ${o._count}`);
  });

  const searchTerms = ['capitol', 'resort', 'hotel', 'crhod'];
  const emps = await prisma.employee.findMany({
    where: {
      OR: searchTerms.map((t: string) => ({ officeName: { contains: t, mode: 'insensitive' } })),
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      officeName: true,
      status: true,
      appointmentStatus: true,
    }
  });

  console.log('--- MATCHING EMPLOYEES ---');
  console.log(JSON.stringify(emps, null, 2));

  const settings = await prisma.systemSetting.findFirst();
  console.log('--- SETTINGS officeNames ---');
  console.log(JSON.stringify(settings?.officeNames, null, 2));
}

main().finally(() => prisma.$disconnect());
