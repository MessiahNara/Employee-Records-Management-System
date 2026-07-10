import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();
const SALT_ROUNDS = 10;

async function main() {
  console.log('🌱 Starting database seed...');

  const [adminHash, staffHash] = await Promise.all([
    bcrypt.hash('admin123', SALT_ROUNDS),
    bcrypt.hash('staff123', SALT_ROUNDS),
  ]);

  // Create or refresh default users with deterministic credentials
  const users = await Promise.all([
    prisma.user.upsert({
      where: { username: 'superadmin' },
      update: {
        firstName: 'Super',
        lastName: 'Admin',
        password: adminHash,
        role: 'superadmin',
      },
      create: {
        id: uuidv4(),
        username: 'superadmin',
        firstName: 'Super',
        lastName: 'Admin',
        password: adminHash,
        role: 'superadmin',
      },
    }),
    prisma.user.upsert({
      where: { username: 'admin' },
      update: {
        firstName: 'Admin',
        lastName: 'User',
        password: adminHash,
        role: 'admin',
      },
      create: {
        id: uuidv4(),
        username: 'admin',
        firstName: 'Admin',
        lastName: 'User',
        password: adminHash,
        role: 'admin',
      },
    }),
    prisma.user.upsert({
      where: { username: 'staff' },
      update: {
        firstName: 'Staff',
        lastName: 'Member',
        password: staffHash,
        role: 'staff',
      },
      create: {
        id: uuidv4(),
        username: 'staff',
        firstName: 'Staff',
        lastName: 'Member',
        password: staffHash,
        role: 'staff',
      },
    }),
  ]);

  console.log('✅ Created users:', users.length);

  // Create sample employees with IDs
  const employees = await Promise.all([
    prisma.employee.create({
      data: {
        id: uuidv4(),
        lastName: 'Doe',
        firstName: 'John',
        middleName: 'Smith',
        gender: 'Male',
        officeName: 'Main Office',
        appointmentStatus: 'Permanent',
        appointmentFrom: new Date('2023-01-15'),
        appointmentTo: new Date('2024-01-14'),
        status: 'Active',
        position: 'Software Engineer',
        dateOfEmployment: new Date('2023-01-15'),
      },
    }),
    prisma.employee.create({
      data: {
        id: uuidv4(),
        lastName: 'Smith',
        firstName: 'Jane',
        middleName: 'Marie',
        gender: 'Female',
        officeName: 'City Hospital',
        appointmentStatus: 'Permanent',
        appointmentFrom: new Date('2022-06-01'),
        appointmentTo: new Date('2023-05-31'),
        status: 'Active',
        position: 'Nurse',
        dateOfEmployment: new Date('2022-06-01'),
      },
    }),
    prisma.employee.create({
      data: {
        id: uuidv4(),
        lastName: 'Johnson',
        firstName: 'Robert',
        gender: 'Male',
        officeName: 'Branch Office',
        appointmentStatus: 'Casual',
        appointmentFrom: new Date('2024-01-10'),
        appointmentTo: new Date('2024-12-31'),
        status: 'Active',
        position: 'Administrative Assistant',
        dateOfEmployment: new Date('2024-01-10'),
      },
    }),
    prisma.employee.create({
      data: {
        id: uuidv4(),
        lastName: 'Williams',
        firstName: 'Emily',
        middleName: 'Rose',
        gender: 'Female',
        officeName: 'Regional Hospital',
        appointmentStatus: 'Job Order',
        appointmentFrom: new Date('2021-03-15'),
        appointmentTo: new Date('2023-12-31'),
        status: 'Inactive',
        position: 'Medical Technician',
        dateOfEmployment: new Date('2021-03-15'),
        dateOfSeparation: new Date('2023-12-31'),
        reasonOfSeparation: 'Contract ended',
      },
    }),
  ]);

  console.log('✅ Created employees:', employees.length);

  // Create sample documents with IDs
  const documents = await Promise.all([
    prisma.document.create({
      data: {
        id: uuidv4(),
        employeeId: employees[0].id,
        category: 'Personal Documents',
        fileName: 'john_doe_resume.pdf',
        filePath: '/uploads/john_doe_resume.pdf',
        fileSize: 245000,
        mimeType: 'application/pdf',
      },
    }),
    prisma.document.create({
      data: {
        id: uuidv4(),
        employeeId: employees[0].id,
        category: 'Certifications',
        fileName: 'john_doe_certificate.pdf',
        filePath: '/uploads/john_doe_certificate.pdf',
        fileSize: 180000,
        mimeType: 'application/pdf',
      },
    }),
    prisma.document.create({
      data: {
        id: uuidv4(),
        employeeId: employees[1].id,
        category: 'Medical Records',
        fileName: 'jane_smith_license.pdf',
        filePath: '/uploads/jane_smith_license.pdf',
        fileSize: 320000,
        mimeType: 'application/pdf',
      },
    }),
  ]);

  console.log('✅ Created documents:', documents.length);

  // Create sample audit logs with IDs
  const auditLogs = await Promise.all([
    prisma.auditLog.create({
      data: {
        id: uuidv4(),
        userId: users[0].id,
        action: 'create',
        entity: 'employee',
        entityId: employees[0].id,
        details: JSON.stringify({ name: 'John Doe' }),
      },
    }),
    prisma.auditLog.create({
      data: {
        id: uuidv4(),
        userId: users[0].id,
        action: 'create',
        entity: 'employee',
        entityId: employees[1].id,
        details: JSON.stringify({ name: 'Jane Smith' }),
      },
    }),
    prisma.auditLog.create({
      data: {
        id: uuidv4(),
        userId: users[1].id,
        action: 'update',
        entity: 'employee',
        entityId: employees[0].id,
        details: JSON.stringify({ field: 'position', oldValue: 'Junior Engineer', newValue: 'Software Engineer' }),
      },
    }),
  ]);

  console.log('✅ Created audit logs:', auditLogs.length);

  console.log('🎉 Database seeded successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
