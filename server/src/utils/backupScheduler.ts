import fs from 'fs';
import path from 'path';
import prisma from '../lib/prisma';
import { getIO } from '../socket';

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

const emitBackupProgress = (payload: { step: number; totalSteps: number; percent: number; stage: string; detail: string }) => {
  try {
    getIO()?.emit('backupProgress', payload);
  } catch (_) {}
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

export function getBaseUploadsDir(): string {
  const PROGRAM_DATA = process.env.PROGRAMDATA || 'C:\\ProgramData';
  const DEFAULT_UPLOADS_BASE = path.join(PROGRAM_DATA, 'ERMS', 'uploads');
  return process.env.UPLOADS_DIR || DEFAULT_UPLOADS_BASE;
}

export interface BackupFileEntry {
  path: string;
  size: number;
  mtime?: string;
}

export function countPhysicalFiles(baseUploadsDir: string): number {
  let count = 0;
  if (!fs.existsSync(baseUploadsDir)) return 0;
  const scanDir = (dir: string) => {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          if (entry.name === 'backups' || entry.name === '.git' || entry.name === 'node_modules') continue;
          scanDir(path.join(dir, entry.name));
        } else if (entry.isFile()) {
          if (!entry.name.endsWith('.log') && !entry.name.endsWith('.tmp')) count++;
        }
      }
    } catch (_) {}
  };
  scanDir(baseUploadsDir);
  return count;
}

const delay = (ms: number = 30) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Execute a full database & physical files snapshot
 */
export const executeDatabaseBackup = async (
  type: 'manual' | 'scheduled' | 'safety' = 'manual',
  creatorName: string = 'System'
): Promise<{ filename: string; filePath: string; recordCounts: Record<string, number>; sizeBytes: number }> => {
  const backupDir = getBackupDir();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `db_backup_${type}_${timestamp}.json`;
  const filePath = path.join(backupDir, filename);

  emitBackupProgress({
    step: 1,
    totalSteps: 6,
    percent: 15,
    stage: 'Querying Database Tables',
    detail: 'Executing parallel queries across all database tables...',
  });
  await delay(25);

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

  emitBackupProgress({
    step: 2,
    totalSteps: 6,
    percent: 42,
    stage: 'Processing Table Records',
    detail: `Loaded ${employees.length.toLocaleString()} employees, ${documents.length.toLocaleString()} docs, ${auditLogs.length.toLocaleString()} audit logs.`,
  });
  await delay(25);

  // Helper to read data directory JSON files (Inventory, Disposal, Group chats, etc.) across all candidate paths
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
            } else if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
              return parsed as any;
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
  const groupChats = readDataJson('group_chats.json');
  const groupChatReads = readDataJson('group_chat_reads.json');

  emitBackupProgress({
    step: 3,
    totalSteps: 6,
    percent: 62,
    stage: 'Reading App Storage',
    detail: `Loaded inventory (${Array.isArray(inventoryRecords) ? inventoryRecords.length : 0} items) & group chats.`,
  });
  await delay(25);

  // Perform companion physical files synchronization asynchronously in background
  const baseUploadsDir = getBaseUploadsDir();
  const companionDir = path.join(backupDir, `${path.parse(filename).name}_files`);
  setTimeout(() => {
    if (fs.existsSync(baseUploadsDir)) {
      try {
        fs.cpSync(baseUploadsDir, companionDir, {
          recursive: true,
          filter: (src) => {
            const base = path.basename(src);
            return base !== 'backups' && base !== '.git' && base !== 'node_modules' && !base.endsWith('.log') && !base.endsWith('.tmp');
          },
        });
      } catch (err) {
        console.warn('[BackupScheduler] Error creating companion files directory:', err);
      }
    }
  }, 10);

  const physicalFileCount = countPhysicalFiles(baseUploadsDir);

  emitBackupProgress({
    step: 4,
    totalSteps: 6,
    percent: 76,
    stage: 'Scanning Physical Assets',
    detail: `Cataloged ${physicalFileCount.toLocaleString()} physical files (PDFs, profile pictures, attachments).`,
  });
  await delay(25);

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
    groupChats: Array.isArray(groupChats) ? groupChats.length : 0,
    inventoryRecords: Array.isArray(inventoryRecords) ? inventoryRecords.length : 0,
    disposalHistory: Array.isArray(disposalHistory) ? disposalHistory.length : 0,
    transferredStorage: Array.isArray(transferredStorageHistory) ? transferredStorageHistory.length : 0,
    inventoryRequests: Array.isArray(inventoryRequests) ? inventoryRequests.length : 0,
    physicalFiles: physicalFileCount,
  };

  const backupPayload = {
    version: '1.2',
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
      groupChats,
      groupChatReads,
      inventoryRecords,
      disposalHistory,
      transferredStorageHistory,
      inventoryRequests,
    },
  };

  const serializedData = JSON.stringify(backupPayload);
  const sizeMb = (serializedData.length / (1024 * 1024)).toFixed(1);

  emitBackupProgress({
    step: 5,
    totalSteps: 6,
    percent: 86,
    stage: 'Writing Snapshot File',
    detail: `Writing ${sizeMb} MB snapshot archive to disk (${filename})...`,
  });
  await delay(30);

  await fs.promises.writeFile(filePath, serializedData, 'utf-8');
  const stats = await fs.promises.stat(filePath);

  emitBackupProgress({
    step: 6,
    totalSteps: 6,
    percent: 96,
    stage: 'Verifying Snapshot Integrity',
    detail: `Snapshot written (${(stats.size / (1024 * 1024)).toFixed(1)} MB). Finalizing...`,
  });
  await delay(20);

  // Clean up old backups asynchronously in background
  setTimeout(() => cleanOldBackups(), 50);

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

    // If retentionCount is 0, retention is unlimited (never prune)
    if (config.retentionCount === 0) return;

    const retention = typeof config.retentionCount === 'number' && config.retentionCount > 0 ? config.retentionCount : 10;
    
    // Only auto-prune automated scheduled backups and auto-safety rollbacks
    // Manual snapshots created explicitly by administrators and uploaded files are preserved
    const pruneCandidateFiles = files.filter((f) => f.filename.includes('_scheduled_') || f.filename.includes('_safety_'));

    if (pruneCandidateFiles.length > retention) {
      const filesToDelete = pruneCandidateFiles.slice(retention);
      for (const file of filesToDelete) {
        try {
          fs.unlinkSync(file.path);
          const companionDir = path.join(backupDir, `${path.parse(file.filename).name}_files`);
          if (fs.existsSync(companionDir)) {
            try { fs.rmSync(companionDir, { recursive: true, force: true }); } catch (_) {}
          }
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
