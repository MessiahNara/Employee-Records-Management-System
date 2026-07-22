import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { getRecordLocations, saveRecordLocations, getDispositionProvisions, saveDispositionProvisions, getItemNumbers, saveItemNumbers, getDivisions, saveDivisions, getClassificationCategories, saveClassificationCategories, getSubCategories, saveSubCategories } from './systemSettings.routes';

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

function syncDispositionProvision(provisionName: string) {
  if (!provisionName || !provisionName.trim()) return;
  const prov = provisionName.trim();
  try {
    const currentProvs = getDispositionProvisions();
    if (!currentProvs.includes(prov)) {
      saveDispositionProvisions([...currentProvs, prov]);
    }
  } catch (err) {
    console.error('Error syncing disposition provision:', err);
  }
}

function syncItemNumberOption(itemNo: string) {
  if (!itemNo || !itemNo.trim()) return;
  const item = itemNo.trim();
  try {
    const currentItems = getItemNumbers();
    if (!currentItems.includes(item)) {
      saveItemNumbers([...currentItems, item]);
    }
  } catch (err) {
    console.error('Error syncing item number option:', err);
  }
}

function syncDivisionOption(divisionName: string) {
  if (!divisionName || !divisionName.trim()) return;
  const div = divisionName.trim();
  try {
    const currentDivs = getDivisions();
    if (!currentDivs.includes(div)) {
      saveDivisions([...currentDivs, div]);
    }
  } catch (err) {
    console.error('Error syncing division option:', err);
  }
}

function syncClassificationCategoryOption(categoryName: string) {
  if (!categoryName || !categoryName.trim()) return;
  const cat = categoryName.trim();
  try {
    const currentCats = getClassificationCategories();
    if (!currentCats.includes(cat)) {
      saveClassificationCategories([...currentCats, cat]);
    }
  } catch (err) {
    console.error('Error syncing classification category option:', err);
  }
}

function syncSubCategoryOption(subCategoryName: string) {
  if (!subCategoryName || !subCategoryName.trim()) return;
  const sub = subCategoryName.trim();
  try {
    const currentSubs = getSubCategories();
    if (!currentSubs.includes(sub)) {
      saveSubCategories([...currentSubs, sub]);
    }
  } catch (err) {
    console.error('Error syncing sub category option:', err);
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
  itemNo?: string;
  prdsGrds?: string;
  seriesTitle: string;
  division?: string;
  classificationCategory: string;
  subCategory?: string;
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

// GET all disposal history logs
router.get('/disposal-history', (req: Request, res: Response) => {
  const logs = readDisposalHistory();
  res.json(logs);
});

// POST new disposal history log
router.post('/disposal-history', (req: Request, res: Response) => {
  try {
    const logData = req.body;
    const logs = readDisposalHistory();
    const rawYears = String(logData.disposedYears || '').trim();

    let yearList: number[] = [];
    if (rawYears.includes('-')) {
      const parts = rawYears.split('-').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n));
      if (parts.length === 2 && parts[0] <= parts[1]) {
        for (let y = parts[0]; y <= parts[1]; y++) yearList.push(y);
      }
    }
    if (yearList.length === 0) {
      yearList = (rawYears.match(/\b\d{4}\b/g) || []).map(n => parseInt(n, 10));
    }

    if (yearList.length === 0 && rawYears) {
      yearList = [parseInt(rawYears, 10) || 0];
    }

    const createdLogs: DisposalLog[] = [];
    const baseTimestamp = Date.now();

    if (yearList.length > 1) {
      yearList.forEach((yr, idx) => {
        const newLog: DisposalLog = {
          id: `DISP-${baseTimestamp}-${idx}`,
          recordId: logData.recordId || '',
          seriesTitle: logData.seriesTitle || '',
          division: logData.division || '',
          classificationCategory: logData.classificationCategory || '',
          subCategory: logData.subCategory || '',
          disposedYears: String(yr),
          previousInclusiveDates: logData.previousInclusiveDates || '',
          newInclusiveDates: logData.newInclusiveDates || '',
          disposedAt: new Date(baseTimestamp + idx * 100).toISOString(),
          disposedBy: logData.disposedBy || 'System Admin',
        };
        logs.unshift(newLog);
        createdLogs.push(newLog);
      });
    } else {
      const newLog: DisposalLog = {
        id: `DISP-${baseTimestamp}`,
        recordId: logData.recordId || '',
        seriesTitle: logData.seriesTitle || '',
        division: logData.division || '',
        classificationCategory: logData.classificationCategory || '',
        subCategory: logData.subCategory || '',
        disposedYears: yearList[0] ? String(yearList[0]) : rawYears,
        previousInclusiveDates: logData.previousInclusiveDates || '',
        newInclusiveDates: logData.newInclusiveDates || '',
        disposedAt: new Date().toISOString(),
        disposedBy: logData.disposedBy || 'System Admin',
      };
      logs.unshift(newLog);
      createdLogs.push(newLog);
    }

    saveDisposalHistory(logs);
    res.status(201).json(createdLogs.length === 1 ? createdLogs[0] : createdLogs);
  } catch (err: any) {
    console.error('Error logging disposal history:', err);
    res.status(500).json({ error: 'Failed to save disposal history log' });
  }
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

    if (!seriesTitle || !inclusiveDates || !volume || !locationOfRecords) {
      return res.status(400).json({ error: 'Please fill in all required fields (Series Title, Dates, Volume, Location).' });
    }

    const records = readRecords();
    const newId = `INV-${new Date().getFullYear()}-${String(records.length + 1).padStart(3, '0')}`;

    const activeYrs = Number(activeDeskYrs) || 0;
    const storYrs = Number(storageYrs) || 0;
    const totalRetention = activeYrs + storYrs;

    const newRecord: InventoryRecord = {
      id: newId,
      itemNo: req.body.itemNo ? String(req.body.itemNo).trim() : '',
      prdsGrds: req.body.prdsGrds ? String(req.body.prdsGrds).trim() : '',
      seriesTitle: seriesTitle.trim(),
      division: req.body.division ? String(req.body.division).trim() : '',
      classificationCategory: classificationCategory ? String(classificationCategory).trim() : '',
      subCategory: req.body.subCategory ? String(req.body.subCategory).trim() : '',
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

    // Auto-sync options to system settings dropdown options
    syncLocationOption(newRecord.locationOfRecords);
    syncDispositionProvision(newRecord.dispositionProvision);
    if (newRecord.itemNo) syncItemNumberOption(newRecord.itemNo);
    if (newRecord.division) syncDivisionOption(newRecord.division);
    if (newRecord.classificationCategory) syncClassificationCategoryOption(newRecord.classificationCategory);
    if (newRecord.subCategory) syncSubCategoryOption(newRecord.subCategory);

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
      itemNo: req.body.itemNo !== undefined ? String(req.body.itemNo).trim() : records[index].itemNo,
      prdsGrds: req.body.prdsGrds !== undefined ? String(req.body.prdsGrds).trim() : records[index].prdsGrds,
      division: req.body.division !== undefined ? String(req.body.division).trim() : records[index].division,
      subCategory: req.body.subCategory !== undefined ? String(req.body.subCategory).trim() : records[index].subCategory,
      activeDeskYrs: activeYrs,
      storageYrs: storYrs,
      totalRetention,
      updatedAt: new Date().toISOString(),
    };

    updatedRecord.disposalStatus = calculateDisposalStatus(updatedRecord);

    records[index] = updatedRecord;
    saveRecords(records);

    // Auto-sync options on update
    syncLocationOption(updatedRecord.locationOfRecords);
    syncDispositionProvision(updatedRecord.dispositionProvision);
    if (updatedRecord.itemNo) syncItemNumberOption(updatedRecord.itemNo);
    if (updatedRecord.division) syncDivisionOption(updatedRecord.division);
    if (updatedRecord.classificationCategory) syncClassificationCategoryOption(updatedRecord.classificationCategory);
    if (updatedRecord.subCategory) syncSubCategoryOption(updatedRecord.subCategory);

    res.json(updatedRecord);
  } catch (error: any) {
    console.error('Error updating inventory record:', error);
    res.status(500).json({ error: error.message || 'Failed to update inventory record' });
  }
});

// POST bulk delete inventory records
router.post('/bulk-delete', (req: Request, res: Response) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'ids array is required' });
    }

    let records = readRecords();
    const initialCount = records.length;
    records = records.filter(r => !ids.includes(r.id));
    saveRecords(records);

    res.json({ message: 'Records deleted successfully', deletedCount: initialCount - records.length });
  } catch (error: any) {
    console.error('Error bulk deleting inventory records:', error);
    res.status(500).json({ error: error.message || 'Failed to delete inventory records' });
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

export interface DisposalLog {
  id: string;
  recordId: string;
  seriesTitle: string;
  division?: string;
  classificationCategory?: string;
  subCategory?: string;
  disposedYears: string;
  previousInclusiveDates: string;
  newInclusiveDates: string;
  disposedAt: string;
  disposedBy?: string;
}

function getDisposalHistoryFilePath(): string {
  const dataDir = process.env.UPLOADS_DIR
    ? path.join(process.env.UPLOADS_DIR, 'data')
    : path.join(__dirname, '../../uploads/data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  return path.join(dataDir, 'disposal_history.json');
}

const defaultDisposalHistory: DisposalLog[] = [
  {
    id: 'DISP-1715000000000',
    recordId: 'INV-2026-001',
    seriesTitle: 'Leave Ledgers & Form 6 Requests',
    division: 'HUMAN RESOURCES',
    classificationCategory: 'PERSONNEL',
    disposedYears: '2010 - 2014',
    previousInclusiveDates: '2010 - 2020',
    newInclusiveDates: '2015 - 2020',
    disposedAt: new Date(Date.now() - 86400000 * 30).toISOString(),
    disposedBy: 'Records Manager',
  },
  {
    id: 'DISP-1716000000000',
    recordId: 'INV-2026-002',
    seriesTitle: 'Attendance on Flag Raising Ceremony',
    division: 'EMPLOYEE RELATIONS',
    classificationCategory: 'ADMINISTRATIVE',
    disposedYears: '2022, 2023',
    previousInclusiveDates: '2022 - 2026',
    newInclusiveDates: '2024 - 2026',
    disposedAt: new Date(Date.now() - 86400000 * 5).toISOString(),
    disposedBy: 'System Admin',
  },
];

function readDisposalHistory(): DisposalLog[] {
  try {
    const filePath = getDisposalHistoryFilePath();
    if (!fs.existsSync(filePath)) {
      saveDisposalHistory(defaultDisposalHistory);
      return defaultDisposalHistory;
    }
    const raw = fs.readFileSync(filePath, 'utf8');
    const logs = JSON.parse(raw);
    if (!Array.isArray(logs) || logs.length === 0) {
      saveDisposalHistory(defaultDisposalHistory);
      return defaultDisposalHistory;
    }
    return logs;
  } catch (err) {
    console.error('Failed to read disposal history:', err);
    return defaultDisposalHistory;
  }
}

function saveDisposalHistory(logs: DisposalLog[]): void {
  try {
    const filePath = getDisposalHistoryFilePath();
    fs.writeFileSync(filePath, JSON.stringify(logs, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to save disposal history:', err);
  }
}

export default router;
