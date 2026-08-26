import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
});

// Enable SQLite Write-Ahead Logging (WAL) and busy timeout for crash resilience & concurrency
(async () => {
  try {
    await prisma.$executeRawUnsafe('PRAGMA journal_mode = WAL;');
    await prisma.$executeRawUnsafe('PRAGMA busy_timeout = 5000;');
    await prisma.$executeRawUnsafe('PRAGMA synchronous = NORMAL;');
  } catch (err) {
    // Graceful fallback for non-SQLite environments
  }
})();

export default prisma;
