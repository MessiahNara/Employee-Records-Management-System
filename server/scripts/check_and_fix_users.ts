import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();
const SALT_ROUNDS = 10;

async function main() {
  console.log('🔍 Checking users and their passwords...\n');

  // Users to check
  const usernames = ['mjquinto', 'z04brian', 'bryan', 'dev0'];

  for (const username of usernames) {
    const user = await prisma.user.findUnique({
      where: { username },
      select: {
        id: true,
        username: true,
        password: true,
        role: true,
        firstName: true,
        lastName: true,
      },
    });

    if (!user) {
      console.log(`❌ User "${username}" not found in database`);
      continue;
    }

    console.log(`✅ User "${username}" exists:`);
    console.log(`   - ID: ${user.id}`);
    console.log(`   - Role: ${user.role}`);
    console.log(`   - Name: ${user.firstName} ${user.lastName}`);
    console.log(`   - Password hash: ${user.password.substring(0, 20)}...`);

    // Check if password is a bcrypt hash
    const isBcryptHash = user.password.startsWith('$2b$') || user.password.startsWith('$2a$');
    console.log(`   - Is bcrypt hash: ${isBcryptHash}`);
    
    if (!isBcryptHash) {
      console.log(`   ⚠️  Password is NOT hashed! Raw value: "${user.password}"`);
    }
    console.log('');
  }

  // Reset passwords
  console.log('\n🔄 Resetting passwords...\n');
  
  const password = 'password123';
  const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

  for (const username of usernames) {
    try {
      const updated = await prisma.user.update({
        where: { username },
        data: { password: hashedPassword },
      });
      console.log(`✅ Updated password for ${username}`);
    } catch (error) {
      console.log(`❌ Failed to update ${username}:`, error);
    }
  }

  console.log('\n✨ Password reset complete!');
  console.log('All users can now login with password: password123');
}

main()
  .catch((e) => {
    console.error('❌ Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
