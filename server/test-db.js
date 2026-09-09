const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function test() {
  console.log('Testing Prisma connection...');
  const t0 = Date.now();
  const counts = await Promise.all([
    prisma.user.count(),
    prisma.systemSetting.count(),
    prisma.yellowBox.count(),
    prisma.employee.count(),
    prisma.document.count(),
    prisma.auditLog.count(),
    prisma.file201BorrowLog.count(),
    prisma.approvalRequest.count(),
    prisma.activity.count(),
    prisma.chatMessage.count(),
  ]);
  console.log(`Prisma counts in ${Date.now() - t0}ms:`, counts);
}

test().catch(console.error).finally(() => prisma.$disconnect());
