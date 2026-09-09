import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function run() {
  const settings = await prisma.systemSetting.findFirst();
  const offices: string[] = (settings?.officeNames as string[]) || [];
  console.log(`TOTAL SETTINGS OFFICES: ${offices.length}`);
  offices.forEach(o => console.log(o));
}

run().finally(() => prisma.$disconnect());
