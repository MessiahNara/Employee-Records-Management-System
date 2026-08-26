import fs from 'fs';
import path from 'path';
import prisma from '../lib/prisma';

export interface BackupScheduleConfig {
  enabled: boolean;
  frequency: 'daily' | 'weekly';
  time: string; // "HH:MM" 24-hr format (e.g. "02:00")
  retentionCount: number; // e.g. 10
  lastRun?: string;
  nextRun?: string;
}

const SCHEDULE_CONFIG_PATH = path.join(__dirname, '../../data/backup_schedule.json');
const BACKUP_DIR = path.join(__dirname, '../../backups');

export const getBackupDir = (): string => {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }
  return BACKUP_DIR;
};

export const getScheduleConfig = (): BackupScheduleConfig => {
  try {
    const dataDir = path.dirname(SCHEDULE_CONFIG_PATH);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    if (fs.existsSync(SCHEDULE_CONFIG_PATH)) {
      const raw = fs.readFileSync(SCHEDULE_CONFIG_PATH, 'utf-8');
      return JSON.parse(raw);
    }
  } catch (error) {
    console.error('[BackupScheduler] Failed to read schedule config:', error);
  }

  const defaultConfig: BackupScheduleConfig = {
    enabled: true,
    frequency: 'daily',
    time: '02:00',
    retentionCount: 10,
  };
  saveScheduleConfig(defaultConfig);
  return defaultConfig;
};

export const saveScheduleConfig = (config: BackupScheduleConfig): void => {
  try {
    const dataDir = path.dirname(SCHEDULE_CONFIG_PATH);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    fs.writeFileSync(SCHEDULE_CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
  } catch (error) {
    console.error('[BackupScheduler] Failed to save schedule config:', error);
  }
};

/**
 * Execute a full database JSON snapshot
 */
export const executeDatabaseBackup = async (
  type: 'manual' | 'scheduled' | 'safety' = 'manual',
  creatorName: string = 'System'
): Promise<{ filename: string; filePath: string; recordCounts: Record<string, number>; sizeBytes: number }> => {
  const backupDir = getBackupDir();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `db_backup_${type}_${timestamp}.json`;
  const filePath = path.join(backupDir, filename);

  // Fetch data from all tables
  const [
    users,
    systemSettings,
    yellowBoxes,
    employees,
    documents,
    auditLogs,
    file201BorrowLogs,
    approvalRequests,
    activities,
    chatMessages,
  ] = await Promise.all([
    prisma.user.findMany(),
    prisma.systemSetting.findMany(),
    prisma.yellowBox.findMany(),
    prisma.employee.findMany(),
    prisma.document.findMany(),
    prisma.auditLog.findMany(),
    prisma.file201BorrowLog.findMany(),
    prisma.approvalRequest.findMany(),
    prisma.activity.findMany(),
    prisma.chatMessage.findMany(),
  ]);

  // Helper to read data directory JSON files (Inventory, Disposal, etc.) across all candidate paths
  const readDataJson = (file: string): any[] => {
    const PROGRAM_DATA = process.env.PROGRAMDATA || 'C:\\ProgramData';
    const candidatePaths = [
      process.env.UPLOADS_DIR ? path.join(process.env.UPLOADS_DIR, 'data', file) : null,
      path.join(PROGRAM_DATA, 'ERMS', 'uploads', 'data', file),
      path.join(__dirname, '../../uploads/data', file),
      path.join('D:\\ERMS-Uploads\\data', file),
      path.join('C:\\ProgramData\\ERMS\\uploads\\data', file),
    ].filter(Boolean) as string[];

    let bestRecords: any[] = [];

    for (const target of candidatePaths) {
      try {
        if (fs.existsSync(target)) {
          const raw = fs.readFileSync(target, 'utf-8');
          if (raw && raw.trim().length > 2) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed) && parsed.length > bestRecords.length) {
              bestRecords = parsed;
            }
          }
        }
      } catch (e) {
        console.warn(`[BackupScheduler] Error reading ${target}:`, e);
      }
    }
    return bestRecords;
  };

  const inventoryRecords = readDataJson('inventory_records.json');
  const disposalHistory = readDataJson('disposal_history.json');
  const transferredStorageHistory = readDataJson('transferred_storage_history.json');
  const inventoryRequests = readDataJson('inventory_requests.json');

  const recordCounts: Record<string, number> = {
    users: users.length,
    systemSettings: systemSettings.length,
    yellowBoxes: yellowBoxes.length,
    employees: employees.length,
    documents: documents.length,
    auditLogs: auditLogs.length,
    file201BorrowLogs: file201BorrowLogs.length,
    approvalRequests: approvalRequests.length,
    activities: activities.length,
    chatMessages: chatMessages.length,
    inventoryRecords: inventoryRecords.length,
    disposalHistory: disposalHistory.length,
    transferredStorage: transferredStorageHistory.length,
    inventoryRequests: inventoryRequests.length,
  };

  const backupPayload = {
    version: '1.0',
    systemName: 'Employee Records Management System',
    type,
    createdAt: new Date().toISOString(),
    createdBy: creatorName,
    recordCounts,
    data: {
      users,
      systemSettings,
      yellowBoxes,
      employees,
      documents,
      auditLogs,
      file201BorrowLogs,
      approvalRequests,
      activities,
      chatMessages,
      inventoryRecords,
      disposalHistory,
      transferredStorageHistory,
      inventoryRequests,
    },
  };

  fs.writeFileSync(filePath, JSON.stringify(backupPayload, null, 2), 'utf-8');
  const stats = fs.statSync(filePath);

  // Clean up old backups according to retention policy
  cleanOldBackups();

  return {
    filename,
    filePath,
    recordCounts,
    sizeBytes: stats.size,
  };
};

/**
 * Clean up old backup files exceeding retention limit
 */
export const cleanOldBackups = (): void => {
  try {
    const config = getScheduleConfig();
    const backupDir = getBackupDir();
    const files = fs.readdirSync(backupDir)
      .filter((f) => f.endsWith('.json') || f.endsWith('.zip'))
      .map((f) => {
        const fullPath = path.join(backupDir, f);
        return {
          filename: f,
          path: fullPath,
          ctime: fs.statSync(fullPath).ctimeMs,
        };
      })
      .sort((a, b) => b.ctime - a.ctime); // newest first

    const retention = Math.max(3, config.retentionCount || 10);
    if (files.length > retention) {
      const filesToDelete = files.slice(retention);
      for (const file of filesToDelete) {
        // Keep safety backups if possible, or delete oldest
        try {
          fs.unlinkSync(file.path);
          console.log(`[BackupScheduler] Pruned old backup: ${file.filename}`);
        } catch (e) {
          console.error(`[BackupScheduler] Error deleting ${file.filename}:`, e);
        }
      }
    }
  } catch (error) {
    console.error('[BackupScheduler] Failed to prune old backups:', error);
  }
};

let schedulerInterval: NodeJS.Timeout | null = null;

/**
 * Initialize background automated backup check
 */
export const initBackupScheduler = (): void => {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
  }

  // Check every 60 seconds
  schedulerInterval = setInterval(async () => {
    try {
      const config = getScheduleConfig();
      if (!config.enabled) return;

      const now = new Date();
      const currentHours = String(now.getHours()).padStart(2, '0');
      const currentMinutes = String(now.getMinutes()).padStart(2, '0');
      const currentTimeStr = `${currentHours}:${currentMinutes}`;

      if (currentTimeStr === config.time) {
        const todayStr = now.toISOString().split('T')[0];
        if (config.lastRun === todayStr) {
          return; // Already ran today
        }

        if (config.frequency === 'weekly') {
          // Run on Sundays (day 0)
          if (now.getDay() !== 0) return;
        }

        console.log(`[BackupScheduler] Triggering scheduled ${config.frequency} backup...`);
        await executeDatabaseBackup('scheduled', 'Automated Scheduler');

        config.lastRun = todayStr;
        saveScheduleConfig(config);
        console.log(`[BackupScheduler] Scheduled backup completed successfully.`);
      }
    } catch (error) {
      console.error('[BackupScheduler] Error in backup scheduler loop:', error);
    }
  }, 60 * 1000);

  console.log('[BackupScheduler] Automated backup scheduler initialized.');
};
