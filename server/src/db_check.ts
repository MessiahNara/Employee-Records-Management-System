import prisma from './lib/prisma';

async function main() {
  const employees = await prisma.employee.findMany({
    include: {
      documents: true,
    }
  });
  console.log("Database status of employees with AO number:");
  employees.forEach(e => {
    if (e.aoNumber) {
      console.log(`- ${e.lastName}, ${e.firstName} (ID: ${e.id}):`);
      console.log(`  AO Number: ${e.aoNumber}, AO Year: ${e.aoYear}`);
      console.log(`  Documents:`, e.documents.map(d => `${d.category} ("${d.fileName}")`).join(', ') || 'None');
    }
  });
}

main().catch(err => {
  console.error(err);
});
