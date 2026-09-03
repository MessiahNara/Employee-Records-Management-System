import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { createAuditLog, getEmployeeName } from '../utils/auditHelper';
import { checkAndAddDropdownOptions } from '../utils/dropdownOptionsHelper';
import { requireSuperadminApproval } from '../middleware/superadminApproval';
import { uploadEmployeeProfilePicture, getBaseUploadsDir } from '../middleware/upload';
import fs from 'fs';
import path from 'path';
import { getIO } from '../socket';

const router = Router();

const toNullableDate = (value: any): Date | null => {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  if (typeof value === 'string' && value.trim().toLowerCase() === 'until revoked') {
    return new Date('9999-12-31T00:00:00.000Z');
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const normalizeImportedEmployee = (payload: any) => ({
  id: String(payload.id || '').trim(),
  lastName: String(payload.lastName || '').trim(),
  firstName: String(payload.firstName || '').trim(),
  middleName: payload.middleName ? String(payload.middleName).trim() : null,
  dateOfBirth: toNullableDate(payload.dateOfBirth),
  gender: String(payload.gender || '').trim(),
  officeName: String(payload.officeName || payload.officeHospitalName || '').trim(),
  appointmentStatus: String(payload.appointmentStatus || '').trim(),
  appointmentFrom: toNullableDate(payload.appointmentFrom),
  appointmentTo: toNullableDate(payload.appointmentTo),
  expirationDate: toNullableDate(payload.expirationDate),
  aoNumber: payload.aoNumber ? String(payload.aoNumber).trim() || null : null,
  status: String(payload.status || 'Active').trim() || 'Active',
  position: String(payload.position || payload.positionFunction || '').trim(),
  dateOfEmployment: toNullableDate(payload.dateOfEmployment),
  dateOfSeparation: toNullableDate(payload.dateOfSeparation),
  reasonOfSeparation: (() => {
    const rawReason = payload.reasonOfSeparation !== undefined ? payload.reasonOfSeparation : payload.reasonForSeparation;
    const cleanReason = String(rawReason || '').trim();
    const cleanRemarks = String(payload.remarks || '').trim();
    if (cleanReason && cleanRemarks) {
      return cleanReason.includes(cleanRemarks) ? cleanReason : `${cleanReason} - ${cleanRemarks}`;
    }
    return cleanReason || cleanRemarks || null;
  })(),
  isDetailed: payload.isDetailed === true || payload.isDetailed === 'true' ? true : false,
  motherUnit: payload.motherUnit ? String(payload.motherUnit).trim() || null : null,
  detailedTo: payload.detailedTo ? String(payload.detailedTo).trim() || null : null,
  detailedDivision: payload.detailedDivision ? String(payload.detailedDivision).trim() || null : null,
  detailedFunction: payload.detailedFunction ? String(payload.detailedFunction).trim() || null : null,
  detailedDate: toNullableDate(payload.detailedDate),
});

// Helper function to delete physical files
const deletePhysicalFiles = async (employeeId: string): Promise<number> => {
  try {
    // Get all documents for this employee
    const documents = await prisma.document.findMany({
      where: { employeeId },
    });

    let deletedCount = 0;

    // Delete each physical file
    for (const doc of documents) {
      try {
        // The filePath is stored as absolute path in the database
        if (fs.existsSync(doc.filePath)) {
          fs.unlinkSync(doc.filePath);
          deletedCount++;
          console.log(`Deleted file: ${doc.filePath}`);
        } else {
          console.warn(`File not found: ${doc.filePath}`);
        }
      } catch (fileError) {
        console.error(`Error deleting file ${doc.filePath}:`, fileError);
        // Continue with other files even if one fails
      }
    }

    return deletedCount;
  } catch (error) {
    console.error('Error in deletePhysicalFiles:', error);
    return 0;
  }
};

// Get KPI stats
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const totalCount = await prisma.employee.count();
    const activeCount = await prisma.employee.count({
      where: { status: 'Active' },
    });
    const documentsCount = await prisma.document.count();
    const storageStats = await prisma.document.aggregate({
      _sum: {
        fileSize: true
      }
    });
    
    res.json({
      total: totalCount,
      active: activeCount,
      inactive: totalCount - activeCount,
      documents: documentsCount,
      storageUsed: storageStats._sum.fileSize || 0,
    });
  } catch (error) {
    console.error('Error fetching employee stats:', error);
    res.status(500).json({ error: 'Failed to fetch employee stats' });
  }
});

// Get all employees with optional filters
router.get('/', async (req: Request, res: Response) => {
  try {
    const { status, appointmentStatus, search, filter_type, page, limit } = req.query;

    const where: any = {};
    if (status) where.status = status as string;
    if (appointmentStatus) where.appointmentStatus = appointmentStatus as string;

    // Add search functionality
    if (search && typeof search === 'string') {
      const searchTerm = search.trim();
      
      if (searchTerm) {
        const filterType = (filter_type as string) || 'all';
        const tokens = searchTerm.split(/[\s,]+/).filter(Boolean);
        
        switch (filterType) {
          case 'first_name':
            where.firstName = {
              contains: searchTerm,
              mode: 'insensitive',
            };
            break;
          case 'middle_name':
            where.middleName = {
              contains: searchTerm,
              mode: 'insensitive',
            };
            break;
          case 'last_name':
            where.lastName = {
              contains: searchTerm,
              mode: 'insensitive',
            };
            break;
          case 'id':
            where.id = {
              contains: searchTerm,
              mode: 'insensitive',
            };
            break;
          default:
            // Multi-token case-insensitive search across all fields
            if (tokens.length > 1) {
              where.AND = tokens.map((token) => ({
                OR: [
                  { id: { contains: token, mode: 'insensitive' } },
                  { firstName: { contains: token, mode: 'insensitive' } },
                  { middleName: { contains: token, mode: 'insensitive' } },
                  { lastName: { contains: token, mode: 'insensitive' } },
                  { officeName: { contains: token, mode: 'insensitive' } },
                  { position: { contains: token, mode: 'insensitive' } },
                  { aoNumber: { contains: token, mode: 'insensitive' } },
                ],
              }));
            } else {
              where.OR = [
                { id: { contains: searchTerm, mode: 'insensitive' } },
                { firstName: { contains: searchTerm, mode: 'insensitive' } },
                { middleName: { contains: searchTerm, mode: 'insensitive' } },
                { lastName: { contains: searchTerm, mode: 'insensitive' } },
                { officeName: { contains: searchTerm, mode: 'insensitive' } },
                { position: { contains: searchTerm, mode: 'insensitive' } },
                { aoNumber: { contains: searchTerm, mode: 'insensitive' } },
              ];
            }
            break;
        }
      }
    }

    let skip: number | undefined;
    let take: number | undefined;

    if (page && limit) {
      const pageNumber = parseInt(page as string, 10);
      const limitNumber = parseInt(limit as string, 10);
      
      if (!isNaN(pageNumber) && !isNaN(limitNumber)) {
        skip = (pageNumber - 1) * limitNumber;
        take = limitNumber;
      }
    }

    const includeDocuments = req.query.includeDocuments === 'true' || (!page && !limit);

    const [employees, total] = await Promise.all([
      prisma.employee.findMany({
        where,
        skip,
        take,
        include: {
          documents: includeDocuments,
          yellowBox: true,
        },
        orderBy: [
          { lastName: 'asc' },
          { firstName: 'asc' },
        ],
      }),
      page && limit ? prisma.employee.count({ where }) : Promise.resolve(0)
    ]);

    if (page && limit) {
      res.json({ data: employees, total });
    } else {
      res.json(employees);
    }
  } catch (error) {
    console.error('Error fetching employees:', error);
    res.status(500).json({ error: 'Failed to fetch employees' });
  }
});

// Get employee by ID
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const employee = await prisma.employee.findUnique({
      where: { id },
      include: {
        documents: true,
        yellowBox: true,
      },
    });

    if (!employee) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    // Derive the correct file201Status from borrow logs
    // Collect all unique non-Complete conditions across all return logs
    // until a Complete return resets them
    const allLogs = await (prisma as any).file201BorrowLog.findMany({
      where: { employeeId: id },
      orderBy: { dateBorrowed: 'desc' },
    });

    let derivedFile201Status = employee.file201Status || 'Available';
    let activeConditions: Set<string> = new Set();

    if (allLogs && allLogs.length > 0) {
      const latestLog = allLogs[0];

      if (!latestLog.dateReturned) {
        // File is currently borrowed
        derivedFile201Status = 'Borrowed';
        activeConditions = new Set();
      } else {
        // File is returned — scan all return logs from newest to oldest
        // Stop accumulating when we hit a Complete return (it resets the state)
        for (const log of allLogs) {
          if (!log.dateReturned) continue; // skip active borrows
          const condition = log.fileCondition || 'Complete';
          if (condition === 'Complete') {
            // A Complete return clears all previous conditions
            break;
          }
          activeConditions.add(condition);
        }

        if (activeConditions.size === 0) {
          derivedFile201Status = 'Available';
        } else if (activeConditions.size === 1) {
          derivedFile201Status = [...activeConditions][0];
        } else {
          // Multiple conditions — join them e.g. "Incomplete,Damaged"
          derivedFile201Status = [...activeConditions].join(',');
        }
      }
    }

    // Get audit logs separately (no longer a relation)
    const auditLogs = await prisma.auditLog.findMany({
      where: {
        entity: 'employee',
        entityId: id,
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 10,
    });

    res.json({
      ...employee,
      file201Status: derivedFile201Status,
      auditLogs,
    });
  } catch (error) {
    console.error('Error fetching employee:', error);
    res.status(500).json({ error: 'Failed to fetch employee' });
  }
});

// Create employee
router.post('/', async (req: Request, res: Response) => {
  try {
    const {
      id,
      lastName,
      firstName,
      middleName,
      dateOfBirth,
      gender,
      officeName,
      appointmentStatus,
      appointmentFrom,
      appointmentTo,
      expirationDate,
      aoNumber,
      aoYear,
      aoType,
      status,
      position,
      dateOfEmployment,
      isDetailed,
      motherUnit,
      detailedTo,
      detailedDivision,
      detailedFunction,
      detailedDate,
      detailedOrderFrom,
      detailedOrderTo,
      designatedPositionFunction,
      designatedOrderFrom,
      designatedOrderTo,
      recalledFrom,
      recalledTo,
      recalledOrderFrom,
      recalledOrderTo,
      fileboxLocation,
    } = req.body;

    // Validation
    if (!id || !lastName || !firstName || !gender || !officeName || 
        !appointmentStatus || !status || !position) {
      return res.status(400).json({ error: 'Missing required fields (including ID)' });
    }

    // Check if ID already exists
    const existingEmployee = await prisma.employee.findUnique({
      where: { id },
    });

    if (existingEmployee) {
      return res.status(409).json({ error: 'Employee ID already exists' });
    }

    const employee = await prisma.employee.create({
      data: {
        id,
        lastName,
        firstName,
        middleName,
        dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
        gender,
        officeName,
        appointmentStatus,
        appointmentFrom: appointmentFrom ? new Date(appointmentFrom) : null,
        appointmentTo: appointmentTo ? new Date(appointmentTo) : null,
        expirationDate: expirationDate ? new Date(expirationDate) : null,
        aoNumber: aoNumber || null,
        aoYear: aoYear || null,
        aoType: aoType || null,
        status,
        position,
        dateOfEmployment: dateOfEmployment ? new Date(dateOfEmployment) : null,
        isDetailed: isDetailed === true || isDetailed === 'true' ? true : false,
        motherUnit: motherUnit || null,
        detailedTo: detailedTo || null,
        detailedDivision: detailedDivision || null,
        detailedFunction: detailedFunction || null,
        detailedDate: detailedDate ? new Date(detailedDate) : null,
        detailedOrderFrom: detailedOrderFrom ? new Date(detailedOrderFrom) : null,
        detailedOrderTo: toNullableDate(detailedOrderTo),
        designatedPositionFunction: designatedPositionFunction || null,
        designatedOrderFrom: designatedOrderFrom ? new Date(designatedOrderFrom) : null,
        designatedOrderTo: toNullableDate(designatedOrderTo),
        recalledFrom: recalledFrom || null,
        recalledTo: recalledTo || null,
        recalledOrderFrom: recalledOrderFrom ? new Date(recalledOrderFrom) : null,
        recalledOrderTo: toNullableDate(recalledOrderTo),
        fileboxLocation: fileboxLocation || null,
      },
    });

    // Auto-populate custom dynamic options
    await checkAndAddDropdownOptions({
      officeNames: [officeName, motherUnit, detailedTo],
      positions: [position, designatedPositionFunction],
      appointmentStatuses: [appointmentStatus],
    });

    // Get user info from headers
    const userId = req.headers['x-user-id'] as string || 'system';
    const userName = req.headers['x-user-name'] as string || 'System';

    // Only create audit log if userId is provided (not during bulk import)
    if (userId !== 'system') {
      await createAuditLog(prisma, {
        userId,
        userName,
        action: 'create',
        entity: 'employee',
        entityId: employee.id,
        entityName: getEmployeeName(employee),
      });
    }

    getIO()?.emit('employeeUpdated');
    res.status(201).json(employee);
  } catch (error) {
    console.error('Error creating employee:', error);
    res.status(500).json({ error: 'Failed to create employee' });
  }
});

// Import: upsert imported records and add new ones without removing existing records
router.post('/sync-import', requireSuperadminApproval, async (req: Request, res: Response) => {
  try {
    const payloadEmployees = req.body?.employees;

    if (!Array.isArray(payloadEmployees) || payloadEmployees.length === 0) {
      return res.status(400).json({ error: 'employees array is required' });
    }

    const normalizedEmployees = payloadEmployees.map(normalizeImportedEmployee);

    for (let index = 0; index < normalizedEmployees.length; index++) {
      const emp = normalizedEmployees[index];
      const missingFields: string[] = [];

      if (!emp.id) missingFields.push('id');
      if (!emp.lastName) missingFields.push('lastName');
      if (!emp.firstName) missingFields.push('firstName');
      // gender is optional — no validation
      if (!emp.officeName) missingFields.push('officeName');
      if (!emp.appointmentStatus) missingFields.push('appointmentStatus');
      if (!emp.status) missingFields.push('status');

      if (missingFields.length > 0) {
        return res.status(400).json({
          error: `Invalid import payload at row ${index + 1} for employee ID: ${emp.id || 'missing'}; missing: ${missingFields.join(', ')}`,
        });
      }
    }

    const incomingIds = normalizedEmployees.map((emp) => emp.id);
    const duplicateIds = incomingIds.filter((id, index) => incomingIds.indexOf(id) !== index);
    if (duplicateIds.length > 0) {
      return res.status(400).json({ error: `Duplicate employee IDs in import file: ${[...new Set(duplicateIds)].join(', ')}` });
    }

    const existingEmployees = await prisma.employee.findMany({
      select: {
        id: true,
      },
    });

    const existingIds = new Set(existingEmployees.map((emp) => emp.id));

    const toCreate = normalizedEmployees.filter((emp) => !existingIds.has(emp.id));
    const toUpdate = normalizedEmployees.filter((emp) => existingIds.has(emp.id));

    // Auto-populate dynamic options from imported employees
    const officeNamesSet = new Set<string>();
    const positionsSet = new Set<string>();
    const statusSet = new Set<string>();

    for (const emp of normalizedEmployees) {
      if (emp.officeName) officeNamesSet.add(emp.officeName);
      if (emp.motherUnit) officeNamesSet.add(emp.motherUnit);
      if (emp.detailedTo) officeNamesSet.add(emp.detailedTo);
      if (emp.position) positionsSet.add(emp.position);
      if ((emp as any).designatedPositionFunction) positionsSet.add((emp as any).designatedPositionFunction);
      if (emp.appointmentStatus) statusSet.add(emp.appointmentStatus);
    }

    await checkAndAddDropdownOptions({
      officeNames: Array.from(officeNamesSet),
      positions: Array.from(positionsSet),
      appointmentStatuses: Array.from(statusSet),
    });

    // Bulk insert new employees in one query
    if (toCreate.length > 0) {
      await prisma.employee.createMany({
        data: toCreate.map((emp) => ({
          id: emp.id,
          lastName: emp.lastName,
          firstName: emp.firstName,
          middleName: emp.middleName,
          dateOfBirth: emp.dateOfBirth,
          gender: emp.gender,
          officeName: emp.officeName,
          appointmentStatus: emp.appointmentStatus,
          appointmentFrom: emp.appointmentFrom,
          appointmentTo: emp.appointmentTo,
          expirationDate: emp.expirationDate,
          aoNumber: emp.aoNumber,
          status: emp.status,
          position: emp.position,
          dateOfEmployment: emp.dateOfEmployment,
          dateOfSeparation: emp.dateOfSeparation,
          reasonOfSeparation: emp.reasonOfSeparation,
          isDetailed: emp.isDetailed,
          motherUnit: emp.motherUnit,
          detailedTo: emp.detailedTo,
          detailedDivision: emp.detailedDivision,
          detailedFunction: emp.detailedFunction,
          detailedDate: emp.detailedDate,
        })),
        skipDuplicates: true,
      });
    }

    // Update existing employees in batches of 100
    const BATCH_SIZE = 100;
    for (let i = 0; i < toUpdate.length; i += BATCH_SIZE) {
      const batch = toUpdate.slice(i, i + BATCH_SIZE);
      await Promise.all(
        batch.map((emp) =>
          prisma.employee.update({
            where: { id: emp.id },
            data: {
              lastName: emp.lastName,
              firstName: emp.firstName,
              middleName: emp.middleName,
              dateOfBirth: emp.dateOfBirth,
              gender: emp.gender,
              officeName: emp.officeName,
              appointmentStatus: emp.appointmentStatus,
              appointmentFrom: emp.appointmentFrom,
              appointmentTo: emp.appointmentTo,
              expirationDate: emp.expirationDate,
              aoNumber: emp.aoNumber,
              status: emp.status,
              position: emp.position,
              dateOfEmployment: emp.dateOfEmployment,
              dateOfSeparation: emp.dateOfSeparation,
              reasonOfSeparation: emp.reasonOfSeparation,
              isDetailed: emp.isDetailed,
              motherUnit: emp.motherUnit,
              detailedTo: emp.detailedTo,
              detailedDivision: emp.detailedDivision,
              detailedFunction: emp.detailedFunction,
              detailedDate: emp.detailedDate,
            },
          })
        )
      );
    }

    const insertedCount = toCreate.length;
    const updatedCount = toUpdate.length;

    const userId = (req.headers['x-user-id'] as string) || 'system';
    const userName = (req.headers['x-user-name'] as string) || 'System';
    const authorizingUserName = (req.headers['x-authorizing-user-name'] as string) || userName;

    await prisma.auditLog.create({
      data: {
        userId,
        action: 'import',
        entity: 'employee',
        entityId: 'bulk',
        details: `${userName} imported ${normalizedEmployees.length} employee record${normalizedEmployees.length > 1 ? 's' : ''}`,
        metadata: {
          importedCount: normalizedEmployees.length,
          authorizingUserName,
        },
      },
    });

    getIO()?.emit('employeeUpdated');
    return res.json({
      message: 'Import completed successfully',
      upsertedCount: insertedCount + updatedCount,
      insertedCount,
      updatedCount,
    });
  } catch (error) {
    console.error('Error syncing import employees:', error);
    return res.status(500).json({ error: 'Failed to sync imported employees' });
  }
});

// Update employee (Full update - PUT)
router.put('/:id', requireSuperadminApproval, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    // Convert date strings to Date objects and treat blank values as null
    if ('dateOfBirth' in updateData) {
      updateData.dateOfBirth = toNullableDate(updateData.dateOfBirth);
    }
    if ('dateOfEmployment' in updateData) {
      updateData.dateOfEmployment = toNullableDate(updateData.dateOfEmployment);
    }
    if ('appointmentFrom' in updateData) {
      updateData.appointmentFrom = toNullableDate(updateData.appointmentFrom);
    }
    if ('appointmentTo' in updateData) {
      updateData.appointmentTo = toNullableDate(updateData.appointmentTo);
    }
    if ('expirationDate' in updateData) {
      updateData.expirationDate = toNullableDate(updateData.expirationDate);
    }
    if ('dateOfSeparation' in updateData) {
      updateData.dateOfSeparation = toNullableDate(updateData.dateOfSeparation);
    }
    if ('detailedDate' in updateData) {
      updateData.detailedDate = toNullableDate(updateData.detailedDate);
    }
    if ('designatedOrderFrom' in updateData) {
      updateData.designatedOrderFrom = toNullableDate(updateData.designatedOrderFrom);
    }
    if ('designatedOrderTo' in updateData) {
      updateData.designatedOrderTo = toNullableDate(updateData.designatedOrderTo);
    }
    if ('recalledOrderFrom' in updateData) {
      updateData.recalledOrderFrom = toNullableDate(updateData.recalledOrderFrom);
    }
    if ('recalledOrderTo' in updateData) {
      updateData.recalledOrderTo = toNullableDate(updateData.recalledOrderTo);
    }
    if ('detailedOrderFrom' in updateData) {
      updateData.detailedOrderFrom = toNullableDate(updateData.detailedOrderFrom);
    }
    if ('detailedOrderTo' in updateData) {
      updateData.detailedOrderTo = toNullableDate(updateData.detailedOrderTo);
    }

    // Fetch old values before overwriting so audit history can be reconstructed
    const oldEmployee = await prisma.employee.findUnique({ where: { id } });
    if (!oldEmployee) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    const oldValues: any = {};
    for (const field of Object.keys(oldEmployee)) {
      oldValues[field] = (oldEmployee as any)[field] ?? null;
    }

    const employee = await prisma.employee.update({
      where: { id },
      data: updateData,
    });

    // Auto-populate custom dynamic options
    await checkAndAddDropdownOptions({
      officeNames: [updateData.officeName, updateData.motherUnit, updateData.detailedTo],
      positions: [updateData.position, updateData.designatedPositionFunction],
      appointmentStatuses: [updateData.appointmentStatus],
    });

    // Get user info from headers
    const userId = req.headers['x-user-id'] as string || 'system';
    const userName = req.headers['x-user-name'] as string || 'System';

    // Create audit log with both old and new values
    await createAuditLog(prisma, {
      userId,
      userName,
      action: 'update',
      entity: 'employee',
      entityId: employee.id,
      entityName: getEmployeeName(employee),
      details: { changedFields: Object.keys(updateData), values: updateData, oldValues },
    });

    getIO()?.emit('employeeUpdated');
    res.json(employee);
  } catch (error) {
    console.error('Error updating employee:', error);
    res.status(500).json({ error: 'Failed to update employee' });
  }
});

// Partial update employee (PATCH)
router.patch('/:id', requireSuperadminApproval, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updateData: any = {};

    // Only include fields that are present in the request
    const allowedFields = [
      'id', 'lastName', 'firstName', 'middleName', 'dateOfBirth', 'gender',
      'officeName', 'appointmentStatus', 'status', 'position',
      'appointmentFrom', 'appointmentTo', 'expirationDate', 'aoNumber', 'aoYear', 'aoType', 'dateOfEmployment', 'dateOfSeparation', 'reasonOfSeparation', 'remarks',
      'isDetailed', 'motherUnit', 'detailedTo', 'detailedDivision', 'detailedFunction', 'detailedDate', 'detailedOrderFrom', 'detailedOrderTo',
      'designatedPositionFunction', 'designatedOrderFrom', 'designatedOrderTo',
      'recalledFrom', 'recalledTo', 'recalledOrderFrom', 'recalledOrderTo',
      'fileboxLocation', 'file201Status'
    ];

    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) {
        updateData[field] = req.body[field];
      }
    });

    // Merge remarks with reasonOfSeparation if provided, and delete remarks from updateData to prevent Prisma Unknown Argument error
    if (req.body.remarks !== undefined || updateData.remarks !== undefined) {
      const remarksVal = String(req.body.remarks ?? updateData.remarks ?? '').trim();
      const existingReason = updateData.reasonOfSeparation !== undefined
        ? String(updateData.reasonOfSeparation || '').trim()
        : (req.body.reasonForSeparation ? String(req.body.reasonForSeparation).trim() : '');
      if (remarksVal && existingReason) {
        if (!existingReason.includes(remarksVal)) {
          updateData.reasonOfSeparation = `${existingReason} - ${remarksVal}`;
        } else {
          updateData.reasonOfSeparation = existingReason;
        }
      } else if (remarksVal) {
        updateData.reasonOfSeparation = remarksVal;
      }
      delete updateData.remarks;
    }

    // Convert date strings to Date objects and treat blank values as null
    if ('dateOfBirth' in updateData) {
      updateData.dateOfBirth = toNullableDate(updateData.dateOfBirth);
    }
    if ('dateOfEmployment' in updateData) {
      updateData.dateOfEmployment = toNullableDate(updateData.dateOfEmployment);
    }
    if ('appointmentFrom' in updateData) {
      updateData.appointmentFrom = toNullableDate(updateData.appointmentFrom);
    }
    if ('appointmentTo' in updateData) {
      updateData.appointmentTo = toNullableDate(updateData.appointmentTo);
    }
    if ('expirationDate' in updateData) {
      updateData.expirationDate = toNullableDate(updateData.expirationDate);
    }
    if ('dateOfSeparation' in updateData) {
      updateData.dateOfSeparation = toNullableDate(updateData.dateOfSeparation);
    }
    if ('detailedDate' in updateData) {
      updateData.detailedDate = toNullableDate(updateData.detailedDate);
    }
    if ('designatedOrderFrom' in updateData) {
      updateData.designatedOrderFrom = toNullableDate(updateData.designatedOrderFrom);
    }
    if ('designatedOrderTo' in updateData) {
      updateData.designatedOrderTo = toNullableDate(updateData.designatedOrderTo);
    }
    if ('detailedOrderFrom' in updateData) {
      updateData.detailedOrderFrom = toNullableDate(updateData.detailedOrderFrom);
    }
    if ('detailedOrderTo' in updateData) {
      updateData.detailedOrderTo = toNullableDate(updateData.detailedOrderTo);
    }
    if ('recalledOrderFrom' in updateData) {
      updateData.recalledOrderFrom = toNullableDate(updateData.recalledOrderFrom);
    }
    if ('recalledOrderTo' in updateData) {
      updateData.recalledOrderTo = toNullableDate(updateData.recalledOrderTo);
    }
    if ('isDetailed' in updateData) {
      updateData.isDetailed = updateData.isDetailed === true || updateData.isDetailed === 'true';
    }

    // Check if there are any fields to update
    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    // If updating ID, check if new ID already exists
    if (updateData.id && updateData.id !== id) {
      const existingEmployee = await prisma.employee.findUnique({
        where: { id: updateData.id },
      });

      if (existingEmployee) {
        return res.status(409).json({ error: 'Employee ID already exists' });
      }
    }

    // Get user info from headers
    const userId = req.headers['x-user-id'] as string || 'system';
    const userName = req.headers['x-user-name'] as string || 'System';

    let employee;

    // If ID is being updated, we need to handle it specially
    if (updateData.id && updateData.id !== id) {
      // Create new employee with new ID and delete old one (within transaction)
      employee = await prisma.$transaction(async (tx) => {
        // Get old employee data
        const oldEmployee = await tx.employee.findUnique({ 
          where: { id },
          include: { documents: true }
        });
        
        if (!oldEmployee) {
          throw new Error('Employee not found');
        }

        // Delete old employee first to avoid any constraint issues
        await tx.employee.delete({ where: { id } });

        // Create new employee with new ID
        const newEmployee = await tx.employee.create({
          data: {
            id: updateData.id,
            lastName: updateData.lastName !== undefined ? updateData.lastName : oldEmployee.lastName,
            firstName: updateData.firstName !== undefined ? updateData.firstName : oldEmployee.firstName,
            middleName: updateData.middleName !== undefined ? updateData.middleName : oldEmployee.middleName,
            dateOfBirth: updateData.dateOfBirth !== undefined ? updateData.dateOfBirth : oldEmployee.dateOfBirth,
            gender: updateData.gender !== undefined ? updateData.gender : oldEmployee.gender,
            officeName: updateData.officeName !== undefined ? updateData.officeName : oldEmployee.officeName,
            appointmentStatus: updateData.appointmentStatus !== undefined ? updateData.appointmentStatus : oldEmployee.appointmentStatus,
            appointmentFrom: updateData.appointmentFrom !== undefined ? updateData.appointmentFrom : oldEmployee.appointmentFrom,
            appointmentTo: updateData.appointmentTo !== undefined ? updateData.appointmentTo : oldEmployee.appointmentTo,
            expirationDate: updateData.expirationDate !== undefined ? updateData.expirationDate : oldEmployee.expirationDate,
            aoNumber: updateData.aoNumber !== undefined ? updateData.aoNumber : oldEmployee.aoNumber,
            aoYear: updateData.aoYear !== undefined ? updateData.aoYear : (oldEmployee as any).aoYear,
            status: updateData.status !== undefined ? updateData.status : oldEmployee.status,
            position: updateData.position !== undefined ? updateData.position : oldEmployee.position,
            dateOfEmployment: updateData.dateOfEmployment !== undefined ? updateData.dateOfEmployment : oldEmployee.dateOfEmployment,
            dateOfSeparation: updateData.dateOfSeparation !== undefined ? updateData.dateOfSeparation : oldEmployee.dateOfSeparation,
            reasonOfSeparation: updateData.reasonOfSeparation !== undefined ? updateData.reasonOfSeparation : oldEmployee.reasonOfSeparation,
            isDetailed: updateData.isDetailed !== undefined ? updateData.isDetailed : oldEmployee.isDetailed,
            aoType: updateData.aoType !== undefined ? updateData.aoType : (oldEmployee as any).aoType,
            motherUnit: updateData.motherUnit !== undefined ? updateData.motherUnit : oldEmployee.motherUnit,
            detailedTo: updateData.detailedTo !== undefined ? updateData.detailedTo : oldEmployee.detailedTo,
            detailedDivision: updateData.detailedDivision !== undefined ? updateData.detailedDivision : oldEmployee.detailedDivision,
            detailedFunction: updateData.detailedFunction !== undefined ? updateData.detailedFunction : oldEmployee.detailedFunction,
            detailedDate: updateData.detailedDate !== undefined ? updateData.detailedDate : oldEmployee.detailedDate,
            detailedOrderFrom: updateData.detailedOrderFrom !== undefined ? updateData.detailedOrderFrom : (oldEmployee as any).detailedOrderFrom,
            detailedOrderTo: updateData.detailedOrderTo !== undefined ? updateData.detailedOrderTo : (oldEmployee as any).detailedOrderTo,
            designatedPositionFunction: updateData.designatedPositionFunction !== undefined ? updateData.designatedPositionFunction : (oldEmployee as any).designatedPositionFunction,
            designatedOrderFrom: updateData.designatedOrderFrom !== undefined ? updateData.designatedOrderFrom : (oldEmployee as any).designatedOrderFrom,
            designatedOrderTo: updateData.designatedOrderTo !== undefined ? updateData.designatedOrderTo : (oldEmployee as any).designatedOrderTo,
            recalledFrom: updateData.recalledFrom !== undefined ? updateData.recalledFrom : (oldEmployee as any).recalledFrom,
            recalledTo: updateData.recalledTo !== undefined ? updateData.recalledTo : (oldEmployee as any).recalledTo,
            recalledOrderFrom: updateData.recalledOrderFrom !== undefined ? updateData.recalledOrderFrom : (oldEmployee as any).recalledOrderFrom,
            recalledOrderTo: updateData.recalledOrderTo !== undefined ? updateData.recalledOrderTo : (oldEmployee as any).recalledOrderTo,
            fileboxLocation: updateData.fileboxLocation !== undefined ? updateData.fileboxLocation : oldEmployee.fileboxLocation,
            file201Status: updateData.file201Status !== undefined ? updateData.file201Status : oldEmployee.file201Status,
            profilePicture: oldEmployee.profilePicture,
            createdAt: oldEmployee.createdAt,
            updatedAt: new Date(),
          } as any,
        });

        // Update all documents to point to new employee ID
        await tx.document.updateMany({
          where: { employeeId: id },
          data: { employeeId: updateData.id },
        });

        // Update audit logs to point to new employee ID
        await tx.auditLog.updateMany({
          where: { 
            entity: 'employee',
            entityId: id 
          },
          data: { entityId: updateData.id },
        });

        return newEmployee;
      });
    } else {
      // Normal update without ID change — fetch old values first for audit history
      const oldEmployee = await prisma.employee.findUnique({ where: { id } });
      if (!oldEmployee) {
        return res.status(404).json({ error: 'Employee not found' });
      }

      // Build oldValues snapshot for all fields
      const oldValues: any = {};
      for (const field of Object.keys(oldEmployee)) {
        oldValues[field] = (oldEmployee as any)[field] ?? null;
      }

      employee = await prisma.employee.update({
        where: { id },
        data: updateData,
      });

      // Auto-populate custom dynamic options
      await checkAndAddDropdownOptions({
        officeNames: [updateData.officeName, updateData.motherUnit, updateData.detailedTo],
        positions: [updateData.position, updateData.designatedPositionFunction],
        appointmentStatuses: [updateData.appointmentStatus],
      });

      // Create audit log with both old and new values so history can be reconstructed
      await createAuditLog(prisma, {
        userId,
        userName,
        action: 'update',
        entity: 'employee',
        entityId: employee.id,
        entityName: getEmployeeName(employee),
        details: { changedFields: Object.keys(updateData), values: updateData, oldValues },
      });

      getIO()?.emit('employeeUpdated');
      res.json(employee);
      return;
    }

    // Auto-populate custom dynamic options
    await checkAndAddDropdownOptions({
      officeNames: [updateData.officeName, updateData.motherUnit, updateData.detailedTo],
      positions: [updateData.position, updateData.designatedPositionFunction],
      appointmentStatuses: [updateData.appointmentStatus],
    });

    // Create audit log for ID-change path (oldValues not easily available, omit)
    await createAuditLog(prisma, {
      userId,
      userName,
      action: 'update',
      entity: 'employee',
      entityId: employee.id,
      entityName: getEmployeeName(employee),
      details: { changedFields: Object.keys(updateData), values: updateData },
    });

    getIO()?.emit('employeeUpdated');
    res.json(employee);
  } catch (error: any) {
    console.error('Error updating employee:', error);
    res.status(500).json({ error: error.message || 'Failed to update employee' });
  }
});

// Delete employee
router.delete('/:id', requireSuperadminApproval, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Get employee data before deleting (for audit log)
    const employee = await prisma.employee.findUnique({
      where: { id },
      include: {
        documents: true,
      },
    });

    if (!employee) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    // Get user info from headers
    const userId = req.headers['x-user-id'] as string || 'system';
    const userName = req.headers['x-user-name'] as string || 'System';
    const authorizingUserName = req.headers['x-authorizing-user-name'] as string;

    // Delete physical files BEFORE deleting from database
    const deletedFilesCount = await deletePhysicalFiles(id);
    console.log(`Deleted ${deletedFilesCount} physical file(s) for employee ${id}`);

    // Create audit log BEFORE deleting (so employee still exists)
    await createAuditLog(prisma, {
      userId,
      userName,
      action: 'delete',
      entity: 'employee',
      entityId: id,
      entityName: getEmployeeName(employee),
      details: {
        authorizingUserName: authorizingUserName || userName,
      },
    });

    // Now delete the employee (CASCADE will delete document records)
    await prisma.employee.delete({
      where: { id },
    });

    getIO()?.emit('employeeUpdated');
    getIO()?.emit('file201Updated');
    getIO()?.emit('documentsUpdated');

    res.json({ 
      message: 'Employee deleted successfully',
      deletedDocuments: employee.documents.length,
      deletedFiles: deletedFilesCount,
    });
  } catch (error) {
    console.error('Error deleting employee:', error);
    res.status(500).json({ error: 'Failed to delete employee' });
  }
});

// Bulk delete employees
router.post('/bulk-delete', requireSuperadminApproval, async (req: Request, res: Response) => {
  try {
    const { ids, employeeNames } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'Invalid or empty employee IDs array' });
    }

    // Get user info from headers
    const userId = req.headers['x-user-id'] as string || 'system';
    const userName = req.headers['x-user-name'] as string || 'System';
    const authorizingUserName = req.headers['x-authorizing-user-name'] as string;

    // Fetch all documents for all target employees in one query
    const documents = await prisma.document.findMany({
      where: {
        employeeId: {
          in: ids,
        },
      },
      select: {
        filePath: true,
      },
    });

    // Delete physical files for all employees in batch
    let totalDeletedFiles = 0;
    for (const doc of documents) {
      try {
        if (fs.existsSync(doc.filePath)) {
          fs.unlinkSync(doc.filePath);
          totalDeletedFiles++;
        }
      } catch (fileError) {
        console.error(`Error deleting physical file ${doc.filePath}:`, fileError);
      }
    }

    // Fetch all employees to delete their profile pictures in batch
    const employeesToDelete = await prisma.employee.findMany({
      where: {
        id: {
          in: ids,
        },
      },
      select: {
        profilePicture: true,
      },
    });

    for (const emp of employeesToDelete) {
      if (emp.profilePicture) {
        try {
          const uploadsDir = process.env.UPLOADS_DIR || path.join(__dirname, '../../uploads');
          const profilePicPath = path.join(uploadsDir, 'profile-pictures', path.basename(emp.profilePicture));
          if (fs.existsSync(profilePicPath)) {
            fs.unlinkSync(profilePicPath);
          }
        } catch (picError) {
          console.error(`Error deleting profile picture for employee:`, picError);
        }
      }
    }

    console.log(`Bulk delete: Deleted ${totalDeletedFiles} physical file(s) for ${ids.length} employee(s)`);

    // Create bulk delete audit log with metadata
    const count = ids.length;
    const authorizerInfo = authorizingUserName ? ` (Authorized by: ${authorizingUserName})` : '';
    const description = `${userName} deleted ${count} employee${count > 1 ? 's' : ''}${authorizerInfo}`;

    const auditData: any = {
      userId,
      action: 'delete',
      entity: 'employee',
      entityId: 'bulk', // Use 'bulk' as entityId for bulk operations
      details: description,
    };

    // Only add metadata if employeeNames is provided
    if (employeeNames && employeeNames.length > 0) {
      auditData.metadata = {
        employees: employeeNames.map((emp: any) => ({
          first_name: emp.firstName,
          last_name: emp.lastName,
        })),
        authorizingUserName: authorizingUserName || userName,
      };
    }

    await prisma.auditLog.create({
      data: auditData,
    });

    // Delete all employees with the given IDs (CASCADE will delete document records)
    const result = await prisma.employee.deleteMany({
      where: {
        id: {
          in: ids,
        },
      },
    });

    getIO()?.emit('employeeUpdated');
    getIO()?.emit('file201Updated');
    getIO()?.emit('documentsUpdated');

    res.json({ 
      message: `Successfully deleted ${result.count} employee(s)`,
      deletedCount: result.count,
      deletedFiles: totalDeletedFiles,
    });
  } catch (error) {
    console.error('Error bulk deleting employees:', error);
    res.status(500).json({ error: 'Failed to bulk delete employees' });
  }
});

// Get employee statistics
router.get('/stats/summary', async (req: Request, res: Response) => {
  try {
    const [total, active, inactive, byAppointment] = await Promise.all([
      prisma.employee.count(),
      prisma.employee.count({ where: { status: 'Active' } }),
      prisma.employee.count({ where: { status: 'Inactive' } }),
      prisma.employee.groupBy({
        by: ['appointmentStatus'],
        _count: true,
      }),
    ]);

    res.json({
      total,
      active,
      inactive,
      byAppointment,
    });
  } catch (error) {
    console.error('Error fetching statistics:', error);
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

// ── Employee Profile Picture ──────────────────────────────────────────────────

function getProfilePicturesDir(): string {
  const baseUploadsDir = getBaseUploadsDir();
  const dir = path.join(baseUploadsDir, "employee's profile picture");
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

// Migrate any existing employee profile pictures from legacy 'profile-pictures' to "employee's profile picture"
(async () => {
  try {
    const baseUploadsDir = getBaseUploadsDir();
    const legacyDir = path.join(baseUploadsDir, 'profile-pictures');
    const targetDir = path.join(baseUploadsDir, "employee's profile picture");
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    const employees = await prisma.employee.findMany({
      where: {
        profilePicture: {
          contains: '/uploads/profile-pictures/',
        },
      },
      select: { id: true, profilePicture: true },
    });

    for (const emp of employees) {
      if (emp.profilePicture) {
        const fileName = path.basename(emp.profilePicture);
        const legacyFile = path.join(legacyDir, fileName);
        const targetFile = path.join(targetDir, fileName);

        if (fs.existsSync(legacyFile) && !fs.existsSync(targetFile)) {
          try {
            fs.copyFileSync(legacyFile, targetFile);
          } catch (e) {
            console.warn(`[employee] Failed to copy legacy profile picture ${fileName}:`, e);
          }
        }

        const newUrl = `/uploads/employee's profile picture/${fileName}`;
        await prisma.employee.update({
          where: { id: emp.id },
          data: { profilePicture: newUrl },
        });
        console.log(`[employee] Migrated profile picture for employee ${emp.id} to ${newUrl}`);
      }
    }
  } catch (err) {
    console.error('[employee] Error migrating employee profile pictures:', err);
  }
})();

// Upload employee profile picture
router.post('/:id/profile-picture', uploadEmployeeProfilePicture.single('profilePicture'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const employee = await prisma.employee.findUnique({
      where: { id },
      select: { profilePicture: true },
    });

    if (!employee) {
      fs.unlinkSync(req.file.path);
      return res.status(404).json({ error: 'Employee not found' });
    }

    // Delete old profile picture if exists
    if (employee.profilePicture) {
      const oldPath = path.join(getProfilePicturesDir(), path.basename(employee.profilePicture));
      if (fs.existsSync(oldPath)) {
        try { fs.unlinkSync(oldPath); } catch (_) {}
      }
    }

    const profilePictureUrl = `/uploads/employee's profile picture/${req.file.filename}`;

    const updated = await prisma.employee.update({
      where: { id },
      data: { profilePicture: profilePictureUrl },
    });

    getIO()?.emit('employeeUpdated');

    res.json({ profilePicture: updated.profilePicture });
  } catch (error: any) {
    if (req.file) fs.unlinkSync(req.file.path);
    res.status(500).json({ error: error.message || 'Failed to upload profile picture' });
  }
});

// Remove employee profile picture
router.delete('/:id/profile-picture', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const employee = await prisma.employee.findUnique({
      where: { id },
      select: { profilePicture: true },
    });

    if (!employee) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    if (employee.profilePicture) {
      const filePath = path.join(getProfilePicturesDir(), path.basename(employee.profilePicture));
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }

    await prisma.employee.update({
      where: { id },
      data: { profilePicture: null },
    });

    getIO()?.emit('employeeUpdated');

    res.json({ message: 'Profile picture removed successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to remove profile picture' });
  }
});

// POST /api/employees/delete-report-entries
router.post('/delete-report-entries', async (req: Request, res: Response) => {
  try {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'Invalid or empty IDs array' });
    }

    const userId = req.headers['x-user-id'] as string || 'system';
    const userName = req.headers['x-user-name'] as string || 'System';

    let currentDeletedCount = 0;
    let historicalDeletedCount = 0;

    for (const rawId of ids) {
      // Format: "{employeeId}-doc-{docId}"  (current row linked to a specific document)
      if (rawId.includes('-doc-')) {
        const docIdIndex = rawId.lastIndexOf('-doc-');
        const employeeId = rawId.substring(0, docIdIndex);
        const docId = rawId.substring(docIdIndex + 5); // skip '-doc-'

        // Delete only the specific AO document
        const doc = await prisma.document.findUnique({ where: { id: docId } });
        if (doc) {
          try {
            if (fs.existsSync(doc.filePath)) {
              fs.unlinkSync(doc.filePath);
            }
          } catch (fileErr) {
            console.error(`Error deleting physical file during report entry deletion:`, fileErr);
          }
          await prisma.document.delete({ where: { id: docId } });
        }

        // Check how many AO docs remain for this employee
        const remainingAoDocs = await prisma.document.findMany({
          where: { employeeId, category: 'Administrative Order' },
        });

        // Only clear AO fields when there are no AO documents left
        if (remainingAoDocs.length === 0) {
          const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
          if (employee) {
            await prisma.employee.update({
              where: { id: employeeId },
              data: {
                aoNumber: null,
                aoYear: null,
                aoType: null,
                detailedTo: null,
                detailedDivision: null,
                detailedFunction: null,
                detailedDate: null,
                detailedOrderFrom: null,
                detailedOrderTo: null,
                designatedPositionFunction: null,
                designatedOrderFrom: null,
                designatedOrderTo: null,
                recalledFrom: null,
                recalledTo: null,
                recalledOrderFrom: null,
                recalledOrderTo: null,
                isDetailed: false,
              }
            });
          }
        }

        await createAuditLog(prisma, {
          userId,
          userName,
          action: 'delete_report_entry',
          entity: 'employee',
          entityId: employeeId,
          entityName: employeeId,
          details: { message: `Deleted report entry linked to document ${docId}` }
        });

        currentDeletedCount++;

      } else if (rawId.includes('-audit-')) {
        // Legacy format: "{employeeId}-audit-{logId}"
        const parts = rawId.split('-audit-');
        const employeeId = parts[0];
        const logId = parts[1];

        const auditLog = await prisma.auditLog.findUnique({ where: { id: logId } });
        if (auditLog) {
          await prisma.auditLog.delete({ where: { id: logId } });

          await createAuditLog(prisma, {
            userId,
            userName,
            action: 'delete_report_entry',
            entity: 'audit_log',
            entityId: logId,
            entityName: 'Historical AO Log',
            details: { message: `Deleted historical report entry for employee ID ${employeeId}` }
          });

          historicalDeletedCount++;
        }

      } else if (rawId.endsWith('-current')) {
        // Legacy format kept for backward compatibility
        const employeeId = rawId.replace(/-current$/, '');
        const employee = await prisma.employee.findUnique({
          where: { id: employeeId },
          include: { documents: true }
        });

        if (employee) {
          const aoDocs = employee.documents.filter(d => d.category === 'Administrative Order');
          for (const doc of aoDocs) {
            try {
              if (fs.existsSync(doc.filePath)) fs.unlinkSync(doc.filePath);
            } catch (fileErr) {
              console.error(`Error deleting physical file:`, fileErr);
            }
            await prisma.document.delete({ where: { id: doc.id } });
          }

          await prisma.employee.update({
            where: { id: employeeId },
            data: {
              aoNumber: null, aoYear: null, aoType: null,
              detailedTo: null, detailedDivision: null, detailedFunction: null,
              detailedDate: null, detailedOrderFrom: null, detailedOrderTo: null,
              designatedPositionFunction: null,
              designatedOrderFrom: null, designatedOrderTo: null,
              recalledFrom: null, recalledTo: null,
              recalledOrderFrom: null, recalledOrderTo: null,
              isDetailed: false,
            }
          });

          await createAuditLog(prisma, {
            userId, userName,
            action: 'delete_report_entry',
            entity: 'employee',
            entityId: employeeId,
            entityName: `${employee.lastName}, ${employee.firstName}`,
            details: { message: `Deleted current report entry` }
          });

          currentDeletedCount++;
        }
      }
    }

    getIO()?.emit('employeeUpdated');
    getIO()?.emit('documentsUpdated');

    res.json({ success: true, currentDeleted: currentDeletedCount, historicalDeleted: historicalDeletedCount });
  } catch (error: any) {
    console.error('Error deleting report entries:', error);
    res.status(500).json({ error: 'Failed to delete report entries', details: error.message });
  }
});

export default router;
// force reload
