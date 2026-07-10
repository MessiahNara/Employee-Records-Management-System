import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const usernames = ['mjquinto', 'z04brian', 'bryan', 'dev0', 'admin'];
  
  console.log('Checking current password hashes in DB:\n');
  for (const username of usernames) {
    const user = await prisma.user.findUnique({ 
      where: { username }, 
      select: { username: true, password: true } 
    });
    if (user) {
      const valid = await bcrypt.compare('password123', user.password);
      console.log(`${username}: hash=${user.password.substring(0,30)}... | 'password123' matches: ${valid}`);
    } else {
      console.log(`${username}: NOT FOUND`);
    }
  }

  // Reset all passwords to password123 fresh
  console.log('\nResetting all passwords to password123...');
  const newHash = await bcrypt.hash('password123', 10);
  for (const username of usernames) {
    try {
      await prisma.user.update({ where: { username }, data: { password: newHash } });
      console.log(`✅ Reset: ${username}`);
    } catch (e: any) {
      console.log(`❌ ${username}: ${e.message}`);
    }
  }

  // Verify
  console.log('\nVerifying after reset:');
  for (const username of usernames) {
    const user = await prisma.user.findUnique({ 
      where: { username }, 
      select: { username: true, password: true } 
    });
    if (user) {
      const valid = await bcrypt.compare('password123', user.password);
      console.log(`${username}: 'password123' matches: ${valid}`);
    }
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
