const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany();
  let updated = 0;
  
  for (const user of users) {
    if (user.permissions && user.permissions.allowedTabs) {
      const allowedTabs = user.permissions.allowedTabs;
      if (!allowedTabs.includes('Dashboard Analytics')) {
        // Only add if they have admin or superadmin role
        if (['admin', 'superadmin', 'developer'].includes(user.role)) {
            allowedTabs.push('Dashboard Analytics');
            await prisma.user.update({
              where: { id: user.id },
              data: { permissions: { ...user.permissions, allowedTabs } }
            });
            updated++;
        }
      }
    }
  }
  
  console.log(`Successfully granted Dashboard Analytics tab to ${updated} users.`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
