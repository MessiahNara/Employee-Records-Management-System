const { PrismaClient } = require('@prisma/client');
process.env.DATABASE_URL = 'postgresql://postgres:mypassword123@localhost:5432/postgres';
const prisma = new PrismaClient();
async function main() {
  const result = await prisma.$queryRawUnsafe(`SELECT datname FROM pg_database WHERE datistemplate = false;`);
  console.log('Databases:', result);
}
main().catch(console.error).finally(() => prisma.$disconnect());
