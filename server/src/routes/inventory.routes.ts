import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';

import { getRecordLocations, saveRecordLocations } from './systemSettings.routes';

const router = Router();

function syncLocationOption(locationName: string) {
  if (!locationName || !locationName.trim()) return;
  const loc = locationName.trim();
  try {
    const currentLocs = getRecordLocations();
    if (!currentLocs.includes(loc)) {
      saveRecordLocations([...currentLocs, loc]);
    }
  } catch (err) {
    console.error('Error syncing location option:', err);
  }
}

// Persistent JSON storage file location
function getDataFilePath(): string {
  const dataDir = process.env.UPLOADS_DIR
    ? path.join(process.env.UPLOADS_DIR, 'data')
    : path.join(__dirname, '../../uploads/data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  return path.join(dataDir, 'inventory_records.json');
}

export interface InventoryRecord {
  id: string;
  seriesTitle: string;
  classificationCategory: string;
  scopeDescription?: string;
  inclusiveDates: string;
  volume: string;
  medium: string;
  restrictions?: string;
  locationOfRecords: string;
  frequencyOfUse: string;
  duplication: string;
  appraisalCategory: string;
  utilityValue: string;
  activeDeskYrs: number;
  storageYrs: number;
  totalRetention: number;
  dispositionProvision: string;
  disposalStatus: 'Safe for Disposal' | 'Under Retention' | 'Permanent';
  createdAt: string;
  updatedAt: string;
}

// Default initial records if file is empty
const defaultInitialRecords: InventoryRecord[] = [
  {
    id: 'INV-2026-001',
    seriesTitle: 'Leave Ledgers & Form 6 Requests',
    classificationCategory: 'PERSONNEL',
    scopeDescription: 'Employee application for leaves, leave credits ledger cards, and supporting medical certificates.',
    inclusiveDates: '2015-2020',
    volume: '0.045 cu. m.',
    medium: 'Paper',
    restrictions: 'None',
    locationOfRecords: 'Filing Cabinet B, Shelf 2',
    frequencyOfUse: 'Inactive',
    duplication: 'Original',
    appraisalCategory: 'Temporary (Disposal Authorized)',
    utilityValue: 'Adm (Administrative)',
    activeDeskYrs: 1,
    storageYrs: 4,
    totalRetention: 5,
    dispositionProvision: 'Dispose after completion of COA audit',
    disposalStatus: 'Safe for Disposal',
    createdAt: new Date('2026-01-15').toISOString(),
    updatedAt: new Date('2026-01-15').toISOString(),
  },
  {
    id: 'INV-2026-002',
    seriesTitle: 'PPSB Resolutions & Policy Minutes',
    classificationCategory: 'ADMINISTRATIVE',
    scopeDescription: 'Board resolutions, executive policy minutes, and organizational charters.',
    inclusiveDates: '2020-present',
    volume: '0.012 cu. m.',
    medium: 'Paper',
    restrictions: 'Restricted',
    locationOfRecords: 'Vault Room 1',
    frequencyOfUse: 'Active',
    duplication: 'Original',
    appraisalCategory: 'Permanent',
    utilityValue: 'Historical',
    activeDeskYrs: 5,
    storageYrs: 10,
    totalRetention: 15,
    dispositionProvision: 'Retain permanently for historical archives',
    disposalStatus: 'Permanent',
    createdAt: new Date('2026-02-01').toISOString(),
    updatedAt: new Date('2026-02-01').toISOString(),
  },
];

function readRecords(): InventoryRecord[] {
  try {
    const filePath = getDataFilePath();
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, JSON.stringify(defaultInitialRecords, null, 2), 'utf8');
      return defaultInitialRecords;
    }
    const rawData = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(rawData);
  } catch (error) {
    console.error('Failed to read inventory records:', error);
    return defaultInitialRecords;
  }
}

function saveRecords(records: InventoryRecord[]): void {
  try {
    const filePath = getDataFilePath();
    fs.writeFileSync(filePath, JSON.stringify(records, null, 2), 'utf8');
  } catch (error) {
    console.error('Failed to save inventory records:', error);
  }
}

// Calculate Disposal Status helper
function calculateDisposalStatus(record: Partial<InventoryRecord>): 'Safe for Disposal' | 'Under Retention' | 'Permanent' {
  if (record.appraisalCategory === 'Permanent') {
    return 'Permanent';
  }
  
  const isTemporary = record.appraisalCategory?.includes('Temporary') || record.appraisalCategory?.includes('Disposal');
  const totalRet = Number(record.totalRetention || (Number(record.activeDeskYrs || 0) + Number(record.storageYrs || 0)));

  // If disposition provision explicitly states safe/dispose or retention years reached
  const prov = String(record.dispositionProvision || '').toLowerCase();
  if (isTemporary && (prov.includes('safe') || prov.includes('dispose') || totalRet <= 2)) {
    return 'Safe for Disposal';
  }

  return 'Under Retention';
}

// GET all inventory records
router.get('/', (req: Request, res: Response) => {
  const records = readRecords();
  res.json(records);
});

// GET inventory record by ID
router.get('/:id', (req: Request, res: Response) => {
  const records = readRecords();
  const record = records.find(r => r.id === req.params.id);
  if (!record) {
    return res.status(404).json({ error: 'Record not found' });
  }
  res.json(record);
});

// POST create new inventory record series entry
router.post('/', (req: Request, res: Response) => {
  try {
    const {
      seriesTitle,
      classificationCategory,
      scopeDescription,
      inclusiveDates,
      volume,
      medium,
      restrictions,
      locationOfRecords,
      frequencyOfUse,
      duplication,
      appraisalCategory,
      utilityValue,
      activeDeskYrs,
      storageYrs,
      dispositionProvision,
    } = req.body;

    if (!seriesTitle || !classificationCategory || !inclusiveDates || !volume || !locationOfRecords) {
      return res.status(400).json({ error: 'Please fill in all required fields (Series Title, Classification, Dates, Volume, Location).' });
    }

    const records = readRecords();
    const newId = `INV-${new Date().getFullYear()}-${String(records.length + 1).padStart(3, '0')}`;

    const activeYrs = Number(activeDeskYrs) || 0;
    const storYrs = Number(storageYrs) || 0;
    const totalRetention = activeYrs + storYrs;

    const newRecord: InventoryRecord = {
      id: newId,
      seriesTitle: seriesTitle.trim(),
      classificationCategory: classificationCategory || 'ADMINISTRATIVE',
      scopeDescription: scopeDescription ? scopeDescription.trim() : '',
      inclusiveDates: inclusiveDates.trim(),
      volume: String(volume).trim(),
      medium: medium || 'Paper',
      restrictions: restrictions ? restrictions.trim() : 'None',
      locationOfRecords: locationOfRecords.trim(),
      frequencyOfUse: frequencyOfUse || 'Active',
      duplication: duplication || 'Original',
      appraisalCategory: appraisalCategory || 'Temporary (Disposal Authorized)',
      utilityValue: utilityValue || 'Adm (Administrative)',
      activeDeskYrs: activeYrs,
      storageYrs: storYrs,
      totalRetention,
      dispositionProvision: dispositionProvision ? dispositionProvision.trim() : 'Dispose after completion of audit',
      disposalStatus: 'Under Retention',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    newRecord.disposalStatus = calculateDisposalStatus(newRecord);

    records.unshift(newRecord);
    saveRecords(records);

    // Auto-sync location name to system settings dropdown options
    syncLocationOption(newRecord.locationOfRecords);

    res.status(201).json(newRecord);
  } catch (error: any) {
    console.error('Error creating inventory record:', error);
    res.status(500).json({ error: error.message || 'Failed to create inventory record' });
  }
});

// PUT update inventory record
router.put('/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const records = readRecords();
    const index = records.findIndex(r => r.id === id);

    if (index === -1) {
      return res.status(404).json({ error: 'Record not found' });
    }

    const activeYrs = Number(req.body.activeDeskYrs ?? records[index].activeDeskYrs) || 0;
    const storYrs = Number(req.body.storageYrs ?? records[index].storageYrs) || 0;
    const totalRetention = activeYrs + storYrs;

    const updatedRecord: InventoryRecord = {
      ...records[index],
      ...req.body,
      id,
      activeDeskYrs: activeYrs,
      storageYrs: storYrs,
      totalRetention,
      updatedAt: new Date().toISOString(),
    };

    updatedRecord.disposalStatus = calculateDisposalStatus(updatedRecord);

    records[index] = updatedRecord;
    saveRecords(records);

    res.json(updatedRecord);
  } catch (error: any) {
    console.error('Error updating inventory record:', error);
    res.status(500).json({ error: error.message || 'Failed to update inventory record' });
  }
});

// DELETE inventory record
router.delete('/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    let records = readRecords();
    const initialCount = records.length;

    records = records.filter(r => r.id !== id);

    if (records.length === initialCount) {
      return res.status(404).json({ error: 'Record not found' });
    }

    saveRecords(records);
    res.json({ message: 'Record deleted successfully' });
  } catch (error: any) {
    console.error('Error deleting inventory record:', error);
    res.status(500).json({ error: error.message || 'Failed to delete inventory record' });
  }
});

export default router;
