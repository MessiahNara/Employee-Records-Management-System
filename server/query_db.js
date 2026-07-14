const { PrismaClient } = require('@prisma/client');
process.env.DATABASE_URL = 'postgresql://postgres:mypassword123@localhost:5432/record_management';
const prisma = new PrismaClient();
async function main() {
  const employees = await prisma.employee.findMany({
    select: {
      id: true,
      lastName: true,
      firstName: true,
      aoNumber: true,
      aoYear: true,
      aoType: true,
      isDetailed: true,
      appointmentFrom: true,
      appointmentTo: true,
      detailedDate: true,
      designatedOrderFrom: true,
      designatedOrderTo: true,
    }
  });
  console.log('Employees:', JSON.stringify(employees, null, 2));
}
main().catch(console.error).finally(() => prisma.$disconnect());
