import prisma from './lib/prisma';

async function main() {
  try {
    const users = await prisma.user.findMany();
    console.log('SUCCESS: Users count:', users.length);
  } catch (error: any) {
    console.error('DATABASE ERROR:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
