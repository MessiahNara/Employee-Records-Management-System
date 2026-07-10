const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function resetAllPasswords() {
  try {
    const standardPassword = await bcrypt.hash('Password123', 10);
    
    // Update all users to standard password
    const users = ['bryan', 'z04brian', 'dev0', 'admin', 'mjquinto'];
    
    for (const username of users) {
      const updated = await prisma.user.update({
        where: { username },
        data: { password: standardPassword },
      });
      console.log(`✓ Updated ${username} password to: Password123`);
    }
    
    console.log('\n📋 Available Users:');
    const allUsers = await prisma.user.findMany({
      select: { username: true, role: true }
    });
    allUsers.forEach(u => console.log(`  ${u.username} (${u.role})`));
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

resetAllPasswords();
