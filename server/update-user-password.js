const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function updatePassword() {
  try {
    const hashedPassword = await bcrypt.hash('Adminion1', 10);
    
    const user = await prisma.user.update({
      where: { username: 'mjquinto' },
      data: { password: hashedPassword },
    });
    
    console.log('✓ Updated mjquinto password to: Adminion1');
    console.log('User:', user.username, 'Role:', user.role);
  } catch (error) {
    console.error('Error updating password:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

updatePassword();
