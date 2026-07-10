const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const prisma = new PrismaClient();

async function main() {
  const adminHash = await bcrypt.hash('admin123', 10);
  
  const user = await prisma.user.upsert({
    where: { username: 'admin' },
    update: { password: adminHash },
    create: {
      id: uuidv4(),
      username: 'admin',
      password: adminHash,
      firstName: 'Admin',
      lastName: 'User',
      role: 'admin'
    }
  });
  
  console.log('Created/Updated user:', user.username);
  await prisma.$disconnect();
}

main().catch(console.error);
