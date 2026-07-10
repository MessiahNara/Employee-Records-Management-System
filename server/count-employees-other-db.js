const { PrismaClient } = require('@prisma/client');
process.env.DATABASE_URL = 'postgresql://postgres:mypassword123@localhost:5432/record_management ';
const prisma = new PrismaClient();
async function main() {
  const count = await prisma.employee.count();
  console.log('Employee count in record_management (trailing space):', count);
}
main().catch(console.error).finally(() => prisma.$disconnect());
