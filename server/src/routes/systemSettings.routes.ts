import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

const DEFAULT_APPOINTMENT_STATUSES = [
  'Consultant', 'Contract of Service', 'Contractual', 'Co-Terminous',
  'Casual', 'Elective', 'Job Order', 'Permanent', 'Probationary', 'Temporary',
];

const DEFAULT_REASONS_FOR_SEPARATION = [
  'Expiration of Appointment', 'AWOL', 'Death', 'Devolution', 'Dismissal',
  'Dropped from the Service', 'End of Contract', 'End of Term', 'Re-Appointment',
  'Re-Employment', 'Resignation', 'Retirement', 'Reinstatement', 'Suspension',
  'Terminal Leave', 'Termination of Employment', 'Transferred'
];

const DEFAULT_AO_YEARS = Array.from(
  { length: new Date().getFullYear() - 2015 + 11 },
  (_, i) => (2015 + i).toString()
).reverse();

// Middleware to check if user is superadmin or developer (for idle timeout settings)
const requireSuperAdmin = (req: Request, res: Response, next: Function) => {
  const userRole = req.headers['x-user-role'] as string;
  if (userRole !== 'superadmin' && userRole !== 'developer') {
    return res.status(403).json({ error: 'Forbidden: Only Super Admin or Developer can access this resource' });
  }
  next();
};

// Middleware for dropdown options — Developer role only
const requireDeveloperRole = (req: Request, res: Response, next: Function) => {
  const userRole = req.headers['x-user-role'] as string;
  if (userRole !== 'developer') {
    return res.status(403).json({ error: 'Forbidden: Only the Developer role can manage dropdown options' });
  }
  next();
};

import fs from 'fs';
import path from 'path';

function getDataDir(): string {
  const customUploads = process.env.UPLOADS_DIR;
  if (customUploads) {
    const p = path.join(customUploads, 'data');
    if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
    return p;
  }
  const programData = process.env.PROGRAMDATA || 'C:\\ProgramData';
  const defaultDir = path.join(programData, 'ERMS', 'uploads', 'data');
  try {
    if (!fs.existsSync(defaultDir)) fs.mkdirSync(defaultDir, { recursive: true });
    return defaultDir;
  } catch {
    const localDir = path.join(__dirname, '../../uploads/data');
    if (!fs.existsSync(localDir)) fs.mkdirSync(localDir, { recursive: true });
    return localDir;
  }
}

// Migrate legacy file if destination does not exist yet
function getMigratedFilePath(fileName: string): string {
  const targetDir = getDataDir();
  const targetFile = path.join(targetDir, fileName);
  if (!fs.existsSync(targetFile)) {
    const legacyFile = path.join(__dirname, '../../uploads/data', fileName);
    if (fs.existsSync(legacyFile)) {
      try {
        fs.copyFileSync(legacyFile, targetFile);
      } catch (err) {
        console.error(`Failed to migrate ${fileName}:`, err);
      }
    }
  }
  return targetFile;
}

function getRecordLocationsFilePath(): string {
  return getMigratedFilePath('record_locations.json');
}

const DEFAULT_RECORD_LOCATIONS: string[] = [];

export function getRecordLocations(): string[] {
  try {
    const file = getRecordLocationsFilePath();
    if (!fs.existsSync(file)) {
      fs.writeFileSync(file, JSON.stringify([], null, 2), 'utf8');
      return [];
    }
    const raw = fs.readFileSync(file, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveRecordLocations(locs: string[]): void {
  try {
    const file = getRecordLocationsFilePath();
    fs.writeFileSync(file, JSON.stringify(locs, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to save record locations:', err);
  }
}

function getDispositionProvisionsFilePath(): string {
  return getMigratedFilePath('disposition_provisions.json');
}

function getItemNumbersFilePath(): string {
  return getMigratedFilePath('item_numbers.json');
}

function getDivisionsFilePath(): string {
  return getMigratedFilePath('divisions.json');
}

function getClassificationCategoriesFilePath(): string {
  return getMigratedFilePath('classification_categories.json');
}

function getSubCategoriesFilePath(): string {
  return getMigratedFilePath('sub_categories.json');
}

function getPrdsGrdsFilePath(): string {
  return getMigratedFilePath('prds_grds.json');
}

const DEFAULT_DISPOSITION_PROVISIONS = [
  'Dispose after completion of audit',
  'Permanent',
  'Dispose after 5 years',
  'Dispose after 10 years'
];

const DEFAULT_ITEM_NUMBERS = [
  'Item 1',
  'Item 2',
  'Item 3',
  'Item 4',
  'Item 5'
];

const DEFAULT_PRDS_GRDS = [
  'GRDS 2009',
  'GRDS 2021',
  'GRDS',
  'PRDS'
];

const DEFAULT_DIVISIONS = [
  'ADMINISTRATIVE',
  'FINANCE',
  'LEGAL',
  'RECORDS DIVISION',
  'HUMAN RESOURCE',
  'OPERATIONS',
  'LOGISTICS & SUPPLY'
];

const DEFAULT_CLASSIFICATION_CATEGORIES = [
  'ADMINISTRATIVE',
  'CSC GENERATED RECORDS',
  'EMPLOYEE WELFARE, WELLNESS AND REWARDS',
  'LEAVE RECORDS',
  'LOGBOOK',
  'ORDERS',
  'PAYROLL DRAFT ATTACHMENTS',
  'QUALITY MANAGEMENT SYSTEM',
  'RECRUITMENT AND PLACEMENT',
  'TRAINING AND EMPLOYEE DEVELOPMENT',
  'FINANCE',
  'LEGAL',
  'ARCHIVAL',
  'ISO GENERATED RECORDS',
  'ISO DOCUMENTS'
];

const DEFAULT_SUB_CATEGORIES = [
  'General Administration',
  'Personnel Records',
  'Financial Documents',
  'Legal Files',
  'Reports & Minutes',
  'Policies & Directives',
  'Certificates & Permits'
];

export function getDispositionProvisions(): string[] {
  try {
    const file = getDispositionProvisionsFilePath();
    if (!fs.existsSync(file)) {
      fs.writeFileSync(file, JSON.stringify(DEFAULT_DISPOSITION_PROVISIONS, null, 2), 'utf8');
      return DEFAULT_DISPOSITION_PROVISIONS;
    }
    const raw = fs.readFileSync(file, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : DEFAULT_DISPOSITION_PROVISIONS;
  } catch {
    return DEFAULT_DISPOSITION_PROVISIONS;
  }
}

export function saveDispositionProvisions(provs: string[]): void {
  try {
    const file = getDispositionProvisionsFilePath();
    fs.writeFileSync(file, JSON.stringify(provs, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to save disposition provisions:', err);
  }
}

export function getItemNumbers(): string[] {
  try {
    const file = getItemNumbersFilePath();
    if (!fs.existsSync(file)) {
      fs.writeFileSync(file, JSON.stringify(DEFAULT_ITEM_NUMBERS, null, 2), 'utf8');
      return DEFAULT_ITEM_NUMBERS;
    }
    const raw = fs.readFileSync(file, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : DEFAULT_ITEM_NUMBERS;
  } catch {
    return DEFAULT_ITEM_NUMBERS;
  }
}

export function saveItemNumbers(items: string[]): void {
  try {
    const file = getItemNumbersFilePath();
    fs.writeFileSync(file, JSON.stringify(items, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to save item numbers:', err);
  }
}

export function getPrdsGrds(): string[] {
  try {
    const file = getPrdsGrdsFilePath();
    if (!fs.existsSync(file)) {
      fs.writeFileSync(file, JSON.stringify(DEFAULT_PRDS_GRDS, null, 2), 'utf8');
      return DEFAULT_PRDS_GRDS;
    }
    const raw = fs.readFileSync(file, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : DEFAULT_PRDS_GRDS;
  } catch {
    return DEFAULT_PRDS_GRDS;
  }
}

export function savePrdsGrds(items: string[]): void {
  try {
    const file = getPrdsGrdsFilePath();
    fs.writeFileSync(file, JSON.stringify(items, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to save prds grds:', err);
  }
}

export function getDivisions(): string[] {
  try {
    const file = getDivisionsFilePath();
    if (!fs.existsSync(file)) {
      fs.writeFileSync(file, JSON.stringify(DEFAULT_DIVISIONS, null, 2), 'utf8');
      return DEFAULT_DIVISIONS;
    }
    const raw = fs.readFileSync(file, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : DEFAULT_DIVISIONS;
  } catch {
    return DEFAULT_DIVISIONS;
  }
}

export function saveDivisions(divs: string[]): void {
  try {
    const file = getDivisionsFilePath();
    fs.writeFileSync(file, JSON.stringify(divs, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to save divisions:', err);
  }
}

export function getClassificationCategories(): string[] {
  try {
    const file = getClassificationCategoriesFilePath();
    if (!fs.existsSync(file)) {
      fs.writeFileSync(file, JSON.stringify(DEFAULT_CLASSIFICATION_CATEGORIES, null, 2), 'utf8');
      return DEFAULT_CLASSIFICATION_CATEGORIES;
    }
    const raw = fs.readFileSync(file, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : DEFAULT_CLASSIFICATION_CATEGORIES;
  } catch {
    return DEFAULT_CLASSIFICATION_CATEGORIES;
  }
}

export function saveClassificationCategories(cats: string[]): void {
  try {
    const file = getClassificationCategoriesFilePath();
    fs.writeFileSync(file, JSON.stringify(cats, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to save classification categories:', err);
  }
}

export function getSubCategories(): string[] {
  try {
    const file = getSubCategoriesFilePath();
    if (!fs.existsSync(file)) {
      fs.writeFileSync(file, JSON.stringify(DEFAULT_SUB_CATEGORIES, null, 2), 'utf8');
      return DEFAULT_SUB_CATEGORIES;
    }
    const raw = fs.readFileSync(file, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : DEFAULT_SUB_CATEGORIES;
  } catch {
    return DEFAULT_SUB_CATEGORIES;
  }
}

export function saveSubCategories(subs: string[]): void {
  try {
    const file = getSubCategoriesFilePath();
    fs.writeFileSync(file, JSON.stringify(subs, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to save sub categories:', err);
  }
}

// GET /api/system-settings
router.get('/', async (req: Request, res: Response) => {
  try {
    let settings: any = await prisma.systemSetting.findFirst();
    if (!settings) {
      settings = await prisma.systemSetting.create({
        data: {
          idleTimeout: null,
          autoRename: false,
          recordLocations: getRecordLocations(),
          dispositionProvisions: getDispositionProvisions(),
          itemNumbers: getItemNumbers(),
          prdsGrds: getPrdsGrds(),
          divisions: getDivisions(),
          classificationCategories: getClassificationCategories(),
          subCategories: getSubCategories(),
        } as any,
      });
    }

    // Read from DB with fallback to JSON files / defaults, and backfill DB if missing
    const recordLocations = (settings.recordLocations as string[] | null) ?? getRecordLocations();
    const dispositionProvisions = (settings.dispositionProvisions as string[] | null) ?? getDispositionProvisions();
    const itemNumbers = (settings.itemNumbers as string[] | null) ?? getItemNumbers();
    const prdsGrds = (settings.prdsGrds as string[] | null) ?? getPrdsGrds();
    const divisions = (settings.divisions as string[] | null) ?? getDivisions();
    const classificationCategories = (settings.classificationCategories as string[] | null) ?? getClassificationCategories();
    const subCategories = (settings.subCategories as string[] | null) ?? getSubCategories();

    // Auto backfill if DB didn't have them yet
    if (
      !settings.recordLocations ||
      !settings.dispositionProvisions ||
      !settings.itemNumbers ||
      !settings.prdsGrds ||
      !settings.divisions ||
      !settings.classificationCategories ||
      !settings.subCategories
    ) {
      await prisma.systemSetting.update({
        where: { id: settings.id },
        data: {
          recordLocations: recordLocations,
          dispositionProvisions: dispositionProvisions,
          itemNumbers: itemNumbers,
          prdsGrds: prdsGrds,
          divisions: divisions,
          classificationCategories: classificationCategories,
          subCategories: subCategories,
        } as any,
      }).catch(() => {});
    }

    res.json({
      idleTimeout: settings.idleTimeout,
      autoRename: settings.autoRename,
      appointmentStatuses: (settings.appointmentStatuses as string[] | null) ?? DEFAULT_APPOINTMENT_STATUSES,
      officeNames: (settings.officeNames as string[] | null) ?? [],
      positions: (settings.positions as string[] | null) ?? [],
      recordLocations,
      dispositionProvisions,
      itemNumbers,
      prdsGrds,
      divisions,
      classificationCategories,
      subCategories,
      aoYears: (settings.aoYears as string[] | null) ?? DEFAULT_AO_YEARS,
      reasonsForSeparation: (settings.reasonsForSeparation as string[] | null) ?? DEFAULT_REASONS_FOR_SEPARATION,
    });
  } catch (error) {
    console.error('Error fetching system settings:', error);
    res.status(500).json({ error: 'Failed to fetch system settings' });
  }
});

// PUT /api/system-settings - Update system settings (Super Admin only)
router.put('/', requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { idleTimeout, autoRename } = req.body;
    const updateData: any = {};

    if (idleTimeout !== undefined) {
      if (idleTimeout !== null && (typeof idleTimeout !== 'number' || idleTimeout < 0)) {
        return res.status(400).json({ error: 'Invalid idleTimeout value' });
      }
      updateData.idleTimeout = idleTimeout;
    }

    if (autoRename !== undefined) {
      if (typeof autoRename !== 'boolean') {
        return res.status(400).json({ error: 'Invalid autoRename value' });
      }
      updateData.autoRename = autoRename;
    }

    let settings = await prisma.systemSetting.findFirst();
    if (settings) {
      settings = await prisma.systemSetting.update({
        where: { id: settings.id },
        data: updateData,
      });
    } else {
      settings = await prisma.systemSetting.create({ data: { idleTimeout: idleTimeout ?? null, autoRename: autoRename ?? false } });
    }
    res.json({
      idleTimeout: settings.idleTimeout,
      autoRename: settings.autoRename,
      message: 'System settings updated successfully',
    });
  } catch (error) {
    console.error('Error updating system settings:', error);
    res.status(500).json({ error: 'Failed to update system settings' });
  }
});

// PUT /api/system-settings/dropdown-options - Update dropdown lists (Developer role only)
router.put('/dropdown-options', requireDeveloperRole, async (req: Request, res: Response) => {
  try {
    const { appointmentStatuses, officeNames, positions, recordLocations, dispositionProvisions, itemNumbers, prdsGrds, divisions, classificationCategories, subCategories, aoYears, reasonsForSeparation } = req.body;
    const updateData: any = {};
    if (Array.isArray(appointmentStatuses)) updateData.appointmentStatuses = appointmentStatuses;
    if (Array.isArray(officeNames)) updateData.officeNames = officeNames;
    if (Array.isArray(positions)) updateData.positions = positions;
    if (Array.isArray(aoYears)) updateData.aoYears = aoYears;
    if (Array.isArray(reasonsForSeparation)) updateData.reasonsForSeparation = reasonsForSeparation;
    if (Array.isArray(recordLocations)) {
      updateData.recordLocations = recordLocations;
      saveRecordLocations(recordLocations);
    }
    if (Array.isArray(dispositionProvisions)) {
      updateData.dispositionProvisions = dispositionProvisions;
      saveDispositionProvisions(dispositionProvisions);
    }
    if (Array.isArray(itemNumbers)) {
      updateData.itemNumbers = itemNumbers;
      saveItemNumbers(itemNumbers);
    }
    if (Array.isArray(prdsGrds)) {
      updateData.prdsGrds = prdsGrds;
      savePrdsGrds(prdsGrds);
    }
    if (Array.isArray(divisions)) {
      updateData.divisions = divisions;
      saveDivisions(divisions);
    }
    if (Array.isArray(classificationCategories)) {
      updateData.classificationCategories = classificationCategories;
      saveClassificationCategories(classificationCategories);
    }
    if (Array.isArray(subCategories)) {
      updateData.subCategories = subCategories;
      saveSubCategories(subCategories);
    }

    let settings: any = await prisma.systemSetting.findFirst();
    if (settings) {
      settings = await prisma.systemSetting.update({ where: { id: settings.id }, data: updateData });
    } else {
      settings = await prisma.systemSetting.create({ data: updateData });
    }

    res.json({
      appointmentStatuses: (settings.appointmentStatuses as string[] | null) ?? DEFAULT_APPOINTMENT_STATUSES,
      officeNames: (settings.officeNames as string[] | null) ?? [],
      positions: (settings.positions as string[] | null) ?? [],
      recordLocations: (settings.recordLocations as string[] | null) ?? getRecordLocations(),
      dispositionProvisions: (settings.dispositionProvisions as string[] | null) ?? getDispositionProvisions(),
      itemNumbers: (settings.itemNumbers as string[] | null) ?? getItemNumbers(),
      prdsGrds: (settings.prdsGrds as string[] | null) ?? getPrdsGrds(),
      divisions: (settings.divisions as string[] | null) ?? getDivisions(),
      classificationCategories: (settings.classificationCategories as string[] | null) ?? getClassificationCategories(),
      subCategories: (settings.subCategories as string[] | null) ?? getSubCategories(),
      aoYears: (settings.aoYears as string[] | null) ?? DEFAULT_AO_YEARS,
      reasonsForSeparation: (settings.reasonsForSeparation as string[] | null) ?? DEFAULT_REASONS_FOR_SEPARATION,
      message: 'Dropdown options updated successfully',
    });
  } catch (error) {
    console.error('Error updating dropdown options:', error);
    res.status(500).json({ error: 'Failed to update dropdown options' });
  }
});

export default router;
