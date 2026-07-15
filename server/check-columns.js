const { PrismaClient } = require('./.prisma/client') || require('./node_modules/.prisma/client');
const prisma = new PrismaClient();
prisma.$queryRawUnsafe("SELECT column_name FROM information_schema.columns WHERE table_name = 'documents' ORDER BY ordinal_position")
  .then(r => { console.log('Documents columns:'); r.forEach(row => console.log(' -', row.column_name)); process.exit(0); })
  .catch(e => { console.error('ERROR:', e.message); process.exit(1); });
