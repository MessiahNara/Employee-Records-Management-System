const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

function parseCSV(content) {
  content = content.replace(/^\uFEFF/, '');
  const lines = [];
  let row = [];
  let cell = '';
  let inQuotes = false;
  
  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    const next = content[i + 1];
    
    if (inQuotes) {
      if (char === '"' && next === '"') {
        cell += '"';
        i++; // skip next quote
      } else if (char === '"') {
        inQuotes = false;
      } else {
        cell += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        row.push(cell);
        cell = '';
      } else if (char === '\r' || char === '\n') {
        if (char === '\r' && next === '\n') {
          i++;
        }
        row.push(cell);
        if (row.length > 1 || row[0] !== '') {
          lines.push(row);
        }
        row = [];
        cell = '';
      } else {
        cell += char;
      }
    }
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell);
    lines.push(row);
  }
  
  const headers = lines[0];
  const data = [];
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i];
    const obj = {};
    headers.forEach((header, index) => {
      let val = values[index] !== undefined ? values[index] : null;
      if (val === 'null' || val === '') val = null;
      obj[header] = val;
    });
    data.push(obj);
  }
  return data;
}

async function restore() {
  console.log('🔄 Cleaning existing database...');
  await prisma.approvalRequest.deleteMany({});
  await prisma.file201BorrowLog.deleteMany({});
  await prisma.auditLog.deleteMany({});
  await prisma.document.deleteMany({});
  await prisma.employee.deleteMany({});
  await prisma.user.deleteMany({});
  await prisma.systemSetting.deleteMany({});
  console.log('✅ Database cleared!');

  const backupDir = path.join(__dirname, '../db_backup');

  // 1. Restore System Settings
  console.log('⚙️ Restoring system settings...');
  const settingsFile = path.join(backupDir, 'system_settings.csv');
  if (fs.existsSync(settingsFile)) {
    const raw = fs.readFileSync(settingsFile, 'utf8');
    const records = parseCSV(raw);
    for (const record of records) {
      if (!record.id) continue;
      await prisma.systemSetting.create({
        data: {
          id: record.id,
          idleTimeout: record.idleTimeout ? parseInt(record.idleTimeout) : null,
          createdAt: record.createdAt ? new Date(record.createdAt) : new Date(),
          updatedAt: record.updatedAt ? new Date(record.updatedAt) : new Date(),
        }
      });
    }
  }

  // 2. Restore Users
  console.log('👤 Restoring users...');
  const usersFile = path.join(backupDir, 'users.csv');
  if (fs.existsSync(usersFile)) {
    const raw = fs.readFileSync(usersFile, 'utf8');
    const records = parseCSV(raw);
    for (const record of records) {
      if (!record.id) continue;
      await prisma.user.create({
        data: {
          id: record.id,
          username: record.username,
          password: record.password,
          role: record.role,
          firstName: record.firstName || '',
          lastName: record.lastName || '',
          profilePicture: record.profilePicture,
          permissions: record.permissions ? JSON.parse(record.permissions) : null,
          lastLogin: record.lastLogin ? new Date(record.lastLogin) : null,
          createdAt: record.createdAt ? new Date(record.createdAt) : new Date(),
          updatedAt: record.updatedAt ? new Date(record.updatedAt) : new Date(),
        }
      });
    }
  }

  // 3. Restore Employees
  console.log('📋 Restoring employees...');
  const employeesFile = path.join(backupDir, 'employees.csv');
  if (fs.existsSync(employeesFile)) {
    const raw = fs.readFileSync(employeesFile, 'utf8');
    const records = parseCSV(raw);
    for (const record of records) {
      if (!record.id) continue;
      await prisma.employee.create({
        data: {
          id: record.id,
          lastName: record.lastName,
          firstName: record.firstName,
          middleName: record.middleName,
          gender: record.gender,
          officeName: record.officeName,
          appointmentStatus: record.appointmentStatus,
          status: record.status,
          position: record.position,
          dateOfBirth: record.dateOfBirth ? new Date(record.dateOfBirth) : null,
          dateOfEmployment: record.dateOfEmployment ? new Date(record.dateOfEmployment) : null,
          dateOfSeparation: record.dateOfSeparation ? new Date(record.dateOfSeparation) : null,
          reasonOfSeparation: record.reasonOfSeparation,
          appointmentFrom: record.appointmentFrom ? new Date(record.appointmentFrom) : null,
          appointmentTo: record.appointmentTo ? new Date(record.appointmentTo) : null,
          createdAt: record.createdAt ? new Date(record.createdAt) : new Date(),
          updatedAt: record.updatedAt ? new Date(record.updatedAt) : new Date(),
        }
      });
    }
  }

  // 4. Restore Documents
  console.log('📂 Restoring documents...');
  const docsFile = path.join(backupDir, 'documents.csv');
  if (fs.existsSync(docsFile)) {
    const raw = fs.readFileSync(docsFile, 'utf8');
    const records = parseCSV(raw);
    for (const record of records) {
      if (!record.id) continue;
      await prisma.document.create({
        data: {
          id: record.id,
          employeeId: record.employeeId,
          category: record.category,
          fileName: record.fileName,
          filePath: record.filePath,
          fileSize: record.fileSize ? parseInt(record.fileSize) : 0,
          mimeType: record.mimeType || 'application/pdf',
          createdAt: record.createdAt ? new Date(record.createdAt) : new Date(),
          updatedAt: record.updatedAt ? new Date(record.updatedAt) : new Date(),
        }
      });
    }
  }

  // 5. Restore Audit Logs
  console.log('📝 Restoring audit logs...');
  const logsFile = path.join(backupDir, 'audit_logs.csv');
  if (fs.existsSync(logsFile)) {
    const raw = fs.readFileSync(logsFile, 'utf8');
    const records = parseCSV(raw);
    for (const record of records) {
      if (!record.id) continue;
      await prisma.auditLog.create({
        data: {
          id: record.id,
          userId: record.userId,
          action: record.action,
          entity: record.entity,
          entityId: record.entityId,
          details: record.details,
          metadata: record.metadata ? JSON.parse(record.metadata) : null,
          createdAt: record.createdAt ? new Date(record.createdAt) : new Date(),
        }
      });
    }
  }
  // 6. Ensure admin123 exists
  console.log('🔑 Ensuring admin123 superadmin account exists...');
  const bcrypt = require('bcryptjs');
  const adminHash = await bcrypt.hash('admin123', 10);
  await prisma.user.upsert({
    where: { username: 'admin123' },
    update: {
      password: adminHash,
      role: 'superadmin',
    },
    create: {
      id: 'admin123-id',
      username: 'admin123',
      firstName: 'Admin',
      lastName: '123',
      password: adminHash,
      role: 'superadmin',
    }
  });

  console.log('🎉 Database successfully restored from backup CSV files!');
}

restore()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
