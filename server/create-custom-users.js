const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const prisma = new PrismaClient();
const SALT_ROUNDS = 10;

async function main() {
  console.log('Inserting custom users...');
  
  const passwordHash = await bcrypt.hash('password123', SALT_ROUNDS);
  
  const usersToCreate = [
    {
      username: 'superadmin1',
      firstName: 'Super',
      lastName: 'Admin One',
      role: 'superadmin'
    },
    {
      username: 'superadmin2',
      firstName: 'Super',
      lastName: 'Admin Two',
      role: 'superadmin'
    },
    {
      username: 'devaccount',
      firstName: 'Dev',
      lastName: 'Account',
      role: 'developer'
    }
  ];

  for (const u of usersToCreate) {
    const existing = await prisma.user.findUnique({
      where: { username: u.username }
    });

    if (existing) {
      console.log(`User ${u.username} already exists. Skipping.`);
    } else {
      await prisma.user.create({
        data: {
          id: uuidv4(),
          username: u.username,
          password: passwordHash,
          firstName: u.firstName,
          lastName: u.lastName,
          role: u.role
        }
      });
      console.log(`Created user: ${u.username} (${u.role})`);
    }
  }

  console.log('Finished creating custom users!');
}

main()
  .catch((err) => {
    console.error('Error creating custom users:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
