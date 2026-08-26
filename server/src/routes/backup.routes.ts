import express, { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import bcrypt from 'bcryptjs';
import prisma from '../lib/prisma';
import { getIO } from '../socket';
import {
  getBackupDir,
  getScheduleConfig,
  saveScheduleConfig,
  executeDatabaseBackup,
  BackupScheduleConfig,
} from '../utils/backupScheduler';

const router = express.Router();

// Multer storage for uploaded backup files
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, getBackupDir());
  },
  filename: (req, file, cb) => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `uploaded_backup_${timestamp}_${safeName}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
  fileFilter: (req, file, cb) => {
    if (file.originalname.endsWith('.json') || file.mimetype === 'application/json') {
      cb(null, true);
    } else {
      cb(new Error('Only JSON database backup files are supported for upload.'));
    }
  },
});

// Middleware to ensure user is Superadmin or Developer
const requireSuperadminOrDev = async (req: Request, res: Response, next: express.NextFunction) => {
  const userId = (req.headers['x-logged-in-user-id'] || req.headers['x-user-id']) as string;
  if (!userId || userId === 'system') {
    return next();
  }
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    if (user && (user.role === 'superadmin' || user.role === 'developer')) {
      return next();
    }
    return res.status(403).json({ error: 'Access denied. Only Superadmin and Developer accounts can manage database backups.' });
  } catch {
    return next();
  }
};

router.use(requireSuperadminOrDev);

/**
 * GET /api/backup/list
 * Returns list of all available restore points
 */
router.get('/list', async (req: Request, res: Response) => {
  try {
    const backupDir = getBackupDir();
    const files = fs.readdirSync(backupDir).filter((f) => f.endsWith('.json'));

    const backups = files.map((filename) => {
      const filePath = path.join(backupDir, filename);
      const stats = fs.statSync(filePath);
      let metadata: any = {
        type: filename.includes('_scheduled_')
          ? 'scheduled'
          : filename.includes('_safety_')
          ? 'safety'
          : filename.includes('uploaded_')
          ? 'uploaded'
          : 'manual',
        createdAt: stats.ctime.toISOString(),
        createdBy: 'System',
        recordCounts: {},
      };

      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const parsed = JSON.parse(content);
        if (parsed.createdAt) metadata.createdAt = parsed.createdAt;
        if (parsed.createdBy) metadata.createdBy = parsed.createdBy;
        if (parsed.type) metadata.type = parsed.type;
        if (parsed.recordCounts) metadata.recordCounts = parsed.recordCounts;
      } catch (e) {
        // Fallback to basic stats
      }

      return {
        filename,
        sizeBytes: stats.size,
        createdAt: metadata.createdAt,
        createdBy: metadata.createdBy,
        type: metadata.type,
        recordCounts: metadata.recordCounts,
      };
    });

    // Sort newest first
    backups.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    // Also count current live records
    const [
      usersCount,
      employeesCount,
      documentsCount,
      yellowBoxesCount,
      borrowLogsCount,
      auditLogsCount,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.employee.count(),
      prisma.document.count(),
      prisma.yellowBox.count(),
      prisma.file201BorrowLog.count(),
      prisma.auditLog.count(),
    ]);

    const liveRecordCounts = {
      users: usersCount,
      employees: employeesCount,
      documents: documentsCount,
      yellowBoxes: yellowBoxesCount,
      borrowLogs: borrowLogsCount,
      auditLogs: auditLogsCount,
      total: usersCount + employeesCount + documentsCount + yellowBoxesCount + borrowLogsCount + auditLogsCount,
    };

    res.json({
      success: true,
      backups,
      liveRecordCounts,
      schedule: getScheduleConfig(),
    });
  } catch (error: any) {
    console.error('[BackupAPI] Failed to list backups:', error);
    res.status(500).json({ error: 'Failed to retrieve backup list', details: error.message });
  }
});

/**
 * POST /api/backup/create
 * Creates an immediate manual backup
 */
router.post('/create', async (req: Request, res: Response) => {
  try {
    const { createdBy = 'Administrator', type = 'manual' } = req.body;
    const result = await executeDatabaseBackup(type, createdBy);

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: createdBy,
        action: 'create',
        entity: 'system_backup',
        entityId: result.filename,
        details: `Manual database backup created: ${result.filename} (${(result.sizeBytes / 1024).toFixed(1)} KB)`,
        metadata: {
          filename: result.filename,
          recordCounts: result.recordCounts,
          sizeBytes: result.sizeBytes,
        },
      },
    });

    res.json({
      success: true,
      message: 'Backup created successfully',
      backup: result,
    });
  } catch (error: any) {
    console.error('[BackupAPI] Failed to create backup:', error);
    res.status(500).json({ error: 'Failed to create database backup', details: error.message });
  }
});

/**
 * GET /api/backup/download/:filename
 * Stream / download backup file
 */
router.get('/download/:filename', (req: Request, res: Response) => {
  try {
    const filename = path.basename(req.params.filename);
    const filePath = path.join(getBackupDir(), filename);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Backup file not found' });
    }

    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/json');
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);
  } catch (error: any) {
    console.error('[BackupAPI] Failed to download backup:', error);
    res.status(500).json({ error: 'Failed to download backup file' });
  }
});

/**
 * POST /api/backup/upload
 * Upload external backup JSON file
 */
router.post('/upload', upload.single('backupFile'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const filePath = req.file.path;
    const content = fs.readFileSync(filePath, 'utf-8');
    let parsed: any;
    try {
      parsed = JSON.parse(content);
    } catch (e) {
      fs.unlinkSync(filePath);
      return res.status(400).json({ error: 'Uploaded file is not a valid JSON document.' });
    }

    if (!parsed.data || typeof parsed.data !== 'object') {
      fs.unlinkSync(filePath);
      return res.status(400).json({ error: 'Invalid backup structure. Missing "data" container.' });
    }

    res.json({
      success: true,
      message: 'Backup file uploaded and validated successfully',
      filename: req.file.filename,
      recordCounts: parsed.recordCounts || {},
      createdAt: parsed.createdAt || new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[BackupAPI] Failed to upload backup:', error);
    res.status(500).json({ error: 'Failed to upload backup file', details: error.message });
  }
});

/**
 * Helper to parse ISO date strings safely for Prisma
 */
const parseDates = (item: any, dateKeys: string[]): any => {
  const cloned = { ...item };
  for (const key of dateKeys) {
    if (cloned[key]) {
      const d = new Date(cloned[key]);
      cloned[key] = isNaN(d.getTime()) ? null : d;
    } else {
      cloned[key] = null;
    }
  }
  return cloned;
};

/**
 * POST /api/backup/restore
 * Restores database from a selected restore point
 */
router.post('/restore', async (req: Request, res: Response) => {
  try {
    const { filename, superadminPassword, username = 'admin' } = req.body;

    if (!filename) {
      return res.status(400).json({ error: 'Please specify the backup filename to restore.' });
    }

    if (!superadminPassword) {
      return res.status(400).json({ error: 'Superadmin password confirmation is required to restore the database.' });
    }

    // Verify administrative user password strictly for Superadmin or Developer
    let authorizedUser: any = null;
    if (username) {
      const user = await prisma.user.findFirst({ where: { username } });
      if (user && (user.role === 'superadmin' || user.role === 'developer')) {
        if (await bcrypt.compare(superadminPassword, user.password)) {
          authorizedUser = user;
        }
      }
    }

    if (!authorizedUser) {
      // Check across any superadmin / developer account
      const superadmins = await prisma.user.findMany({
        where: { OR: [{ role: 'superadmin' }, { role: 'developer' }] },
      });
      for (const sa of superadmins) {
        if (await bcrypt.compare(superadminPassword, sa.password)) {
          authorizedUser = sa;
          break;
        }
      }
    }

    if (!authorizedUser) {
      return res.status(401).json({
        error: 'Invalid password. Only Superadmin and Developer accounts are authorized to restore the database.',
      });
    }

    const safeFilename = path.basename(filename);
    const filePath = path.join(getBackupDir(), safeFilename);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Selected backup file does not exist.' });
    }

    // Step 1: Automatically create a pre-restore safety snapshot
    console.log('[BackupAPI] Creating pre-restore safety snapshot...');
    const safetySnapshot = await executeDatabaseBackup('safety', `Auto-Safety (Pre-Restore ${safeFilename})`);
    console.log(`[BackupAPI] Safety snapshot created: ${safetySnapshot.filename}`);

    // Step 2: Read and parse backup file
    const content = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(content);
    const data = parsed.data || {};

    // Step 3: Execute full database restore in ordered sequence
    console.log('[BackupAPI] Beginning database restoration...');

    // A. Clear dependent child tables first
    await prisma.chatMessage.deleteMany({});
    await prisma.activity.deleteMany({});
    await prisma.approvalRequest.deleteMany({});
    await prisma.auditLog.deleteMany({});
    await prisma.file201BorrowLog.deleteMany({});
    await prisma.document.deleteMany({});
    await prisma.employee.deleteMany({});
    await prisma.yellowBox.deleteMany({});
    await prisma.systemSetting.deleteMany({});
    await prisma.user.deleteMany({});

    // B. Re-insert Users (Bulk)
    if (Array.isArray(data.users) && data.users.length > 0) {
      const formatted = data.users.map((u: any) =>
        parseDates(u, ['createdAt', 'updatedAt', 'lastLogin', 'lastActive'])
      );
      await prisma.user.createMany({ data: formatted, skipDuplicates: true });
    }

    // C. Re-insert System Settings (Bulk)
    if (Array.isArray(data.systemSettings) && data.systemSettings.length > 0) {
      const formatted = data.systemSettings.map((s: any) =>
        parseDates(s, ['createdAt', 'updatedAt'])
      );
      await prisma.systemSetting.createMany({ data: formatted, skipDuplicates: true });
    }

    // D. Re-insert Yellow Boxes (Bulk)
    if (Array.isArray(data.yellowBoxes) && data.yellowBoxes.length > 0) {
      const formatted = data.yellowBoxes.map((y: any) =>
        parseDates(y, ['createdAt', 'updatedAt'])
      );
      await prisma.yellowBox.createMany({ data: formatted, skipDuplicates: true });
    }

    // E. Re-insert Employees (Bulk)
    if (Array.isArray(data.employees) && data.employees.length > 0) {
      const formatted = data.employees.map((e: any) => {
        const item = parseDates(e, [
          'dateOfBirth',
          'appointmentFrom',
          'appointmentTo',
          'expirationDate',
          'dateOfEmployment',
          'dateOfSeparation',
          'detailedDate',
          'detailedOrderFrom',
          'detailedOrderTo',
          'designatedOrderFrom',
          'designatedOrderTo',
          'recalledOrderFrom',
          'recalledOrderTo',
          'createdAt',
          'updatedAt',
        ]);
        delete item.documents;
        delete item.borrowLogs;
        delete item.yellowBox;
        return item;
      });
      await prisma.employee.createMany({ data: formatted, skipDuplicates: true });
    }

    // F. Re-insert Documents (Bulk)
    if (Array.isArray(data.documents) && data.documents.length > 0) {
      const formatted = data.documents.map((d: any) => {
        const item = parseDates(d, [
          'createdAt',
          'updatedAt',
          'detailedDate',
          'detailedOrderFrom',
          'detailedOrderTo',
          'designatedOrderFrom',
          'designatedOrderTo',
          'recalledOrderFrom',
          'recalledOrderTo',
          'appointmentFrom',
          'appointmentTo',
        ]);
        delete item.employee;
        return item;
      });
      await prisma.document.createMany({ data: formatted, skipDuplicates: true });
    }

    // G. Re-insert Borrow Logs (Bulk)
    if (Array.isArray(data.file201BorrowLogs) && data.file201BorrowLogs.length > 0) {
      const formatted = data.file201BorrowLogs.map((b: any) => {
        const item = parseDates(b, ['dateBorrowed', 'dateReturned', 'expectedReturnDate', 'createdAt']);
        delete item.employee;
        return item;
      });
      await prisma.file201BorrowLog.createMany({ data: formatted, skipDuplicates: true });
    }

    // H. Re-insert Approval Requests (Bulk)
    if (Array.isArray(data.approvalRequests) && data.approvalRequests.length > 0) {
      const formatted = data.approvalRequests.map((a: any) =>
        parseDates(a, ['createdAt', 'resolvedAt'])
      );
      await prisma.approvalRequest.createMany({ data: formatted, skipDuplicates: true });
    }

    // I. Re-insert Activities (Bulk)
    if (Array.isArray(data.activities) && data.activities.length > 0) {
      const formatted = data.activities.map((act: any) =>
        parseDates(act, ['createdAt', 'updatedAt'])
      );
      await prisma.activity.createMany({ data: formatted, skipDuplicates: true });
    }

    // J. Re-insert Chat Messages (Bulk)
    if (Array.isArray(data.chatMessages) && data.chatMessages.length > 0) {
      const formatted = data.chatMessages.map((c: any) =>
        parseDates(c, ['createdAt'])
      );
      await prisma.chatMessage.createMany({ data: formatted, skipDuplicates: true });
    }

    // K. Re-insert Audit Logs (Bulk)
    if (Array.isArray(data.auditLogs) && data.auditLogs.length > 0) {
      const formatted = data.auditLogs.map((log: any) =>
        parseDates(log, ['createdAt'])
      );
      await prisma.auditLog.createMany({ data: formatted, skipDuplicates: true });
    }

    // L. Restore Inventory Appraisal & Disposal Data files across all active paths
    const writeDataFile = (fileName: string, items: any[]) => {
      const PROGRAM_DATA = process.env.PROGRAMDATA || 'C:\\ProgramData';
      const targetDirs = [
        process.env.UPLOADS_DIR ? path.join(process.env.UPLOADS_DIR, 'data') : null,
        path.join(PROGRAM_DATA, 'ERMS', 'uploads', 'data'),
        path.join(__dirname, '../../uploads/data'),
      ].filter(Boolean) as string[];

      for (const dir of targetDirs) {
        try {
          if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
          }
          fs.writeFileSync(path.join(dir, fileName), JSON.stringify(items, null, 2), 'utf-8');
          console.log(`[BackupAPI] Restored ${items.length} records to ${path.join(dir, fileName)}`);
        } catch (e) {
          console.error(`[BackupAPI] Failed to restore to ${dir}/${fileName}:`, e);
        }
      }
    };

    if (Array.isArray(data.inventoryRecords)) {
      writeDataFile('inventory_records.json', data.inventoryRecords);
    }
    if (Array.isArray(data.disposalHistory)) {
      writeDataFile('disposal_history.json', data.disposalHistory);
    }
    if (Array.isArray(data.transferredStorageHistory)) {
      writeDataFile('transferred_storage_history.json', data.transferredStorageHistory);
    }
    if (Array.isArray(data.inventoryRequests)) {
      writeDataFile('inventory_requests.json', data.inventoryRequests);
    }

    // Create a new Audit Log recording the successful restore
    await prisma.auditLog.create({
      data: {
        userId: authorizedUser.id,
        action: 'restore',
        entity: 'system_database',
        entityId: safeFilename,
        details: `Database restored from backup snapshot: ${safeFilename}. Safety backup stored as ${safetySnapshot.filename}`,
        metadata: {
          restoredFile: safeFilename,
          safetyBackup: safetySnapshot.filename,
          restoredAt: new Date().toISOString(),
        },
      },
    });

    console.log('[BackupAPI] Database restoration completed successfully.');

    // Step 5: Broadcast real-time global logout & sync event to all open client systems
    try {
      const io = getIO();
      if (io) {
        console.log('[BackupAPI] Broadcasting databaseRestored event to all connected clients...');
        io.emit('databaseRestored', {
          timestamp: new Date().toISOString(),
          restoredBy: authorizedUser?.username || 'Superadmin',
          message: 'The database has been restored from a snapshot point. All user sessions have been logged out to synchronize live data. Please log in again.',
        });
      }
    } catch (socketErr) {
      console.warn('[BackupAPI] Could not emit databaseRestored socket event:', socketErr);
    }

    res.json({
      success: true,
      message: 'Database has been successfully restored from snapshot.',
      safetyBackup: safetySnapshot.filename,
      restoredFrom: safeFilename,
    });
  } catch (error: any) {
    console.error('[BackupAPI] Database restore failed:', error);
    res.status(500).json({ error: 'Database restore encountered an error', details: error.message });
  }
});

/**
 * DELETE /api/backup/:filename
 * Delete an old backup file
 */
router.delete('/:filename', async (req: Request, res: Response) => {
  try {
    const filename = path.basename(req.params.filename);
    const filePath = path.join(getBackupDir(), filename);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Backup file not found' });
    }

    fs.unlinkSync(filePath);

    res.json({
      success: true,
      message: `Backup ${filename} deleted successfully`,
    });
  } catch (error: any) {
    console.error('[BackupAPI] Failed to delete backup:', error);
    res.status(500).json({ error: 'Failed to delete backup file', details: error.message });
  }
});

/**
 * GET /api/backup/schedule
 * Retrieve automated schedule config
 */
router.get('/schedule', (req: Request, res: Response) => {
  try {
    res.json({
      success: true,
      schedule: getScheduleConfig(),
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to get schedule config' });
  }
});

/**
 * POST /api/backup/schedule
 * Update automated schedule config
 */
router.post('/schedule', (req: Request, res: Response) => {
  try {
    const { enabled, frequency, time, retentionCount } = req.body;

    const current = getScheduleConfig();
    const updated: BackupScheduleConfig = {
      ...current,
      enabled: typeof enabled === 'boolean' ? enabled : current.enabled,
      frequency: frequency === 'weekly' ? 'weekly' : 'daily',
      time: time || current.time,
      retentionCount: Number(retentionCount) || current.retentionCount,
    };

    saveScheduleConfig(updated);

    res.json({
      success: true,
      message: 'Backup schedule settings saved successfully',
      schedule: updated,
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to save schedule config' });
  }
});

export default router;
