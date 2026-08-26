import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
});

// Enable SQLite Write-Ahead Logging (WAL) and busy timeout only if using SQLite
(async () => {
  const dbUrl = process.env.DATABASE_URL || '';
  if (dbUrl.startsWith('file:') || dbUrl.includes('sqlite')) {
    try {
      await prisma.$executeRawUnsafe('PRAGMA journal_mode = WAL;');
      await prisma.$executeRawUnsafe('PRAGMA busy_timeout = 5000;');
      await prisma.$executeRawUnsafe('PRAGMA synchronous = NORMAL;');
    } catch (err) {
      // Graceful fallback for non-SQLite environments
    }
  }
})();

export default prisma;
