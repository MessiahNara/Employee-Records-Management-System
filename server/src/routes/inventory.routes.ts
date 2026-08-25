import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import prisma from '../lib/prisma';
import { createAuditLog } from '../utils/auditHelper';
import { uploadInventoryAttachment } from '../middleware/upload';
import { getRecordLocations, saveRecordLocations, getDispositionProvisions, saveDispositionProvisions, getItemNumbers, saveItemNumbers, getDivisions, saveDivisions, getClassificationCategories, saveClassificationCategories, getSubCategories, saveSubCategories } from './systemSettings.routes';
import { checkAndAddDropdownOptions } from '../utils/dropdownOptionsHelper';
import { getIO } from '../socket';

const router = Router();

async function getUserInfo(req: Request) {
  const userId = (req.headers['x-logged-in-user-id'] || req.headers['x-user-id'] || req.body?.userId) as string;
  if (!userId || userId === 'system') {
    return { userId: 'system', userName: 'System' };
  }
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { firstName: true, lastName: true, username: true, role: true },
    });
    if (user) {
      const userName = (user.firstName && user.lastName)
        ? `${user.firstName} ${user.lastName}`
        : user.username || 'System User';
      return { userId, userName };
    }
  } catch (err) {
    console.error('Error fetching user for audit in inventory routes:', err);
  }
  return { userId, userName: 'System User' };
}

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

// Persistent JSON storage file location
function getDataFilePath(): string {
  return getMigratedFilePath('inventory_records.json');
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
  retentionStage?: 'Active' | 'Storage' | 'Disposed';
  storageStartDate?: string;
  createdAt: string;
  updatedAt: string;
}

// Default initial records if file is empty
const defaultInitialRecords: InventoryRecord[] = [];
let cachedRecords: InventoryRecord[] | null = null;

function readRecords(): InventoryRecord[] {
  if (cachedRecords) return cachedRecords;
  try {
    const filePath = getDataFilePath();
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, JSON.stringify(defaultInitialRecords, null, 2), 'utf8');
      cachedRecords = defaultInitialRecords;
      return defaultInitialRecords;
    }
    const rawData = fs.readFileSync(filePath, 'utf8');
    cachedRecords = JSON.parse(rawData);
    return cachedRecords || defaultInitialRecords;
  } catch (error) {
    console.error('Failed to read inventory records:', error);
    return cachedRecords || defaultInitialRecords;
  }
}

function saveRecords(records: InventoryRecord[]): void {
  try {
    cachedRecords = records;
    const filePath = getDataFilePath();
    fs.writeFileSync(filePath, JSON.stringify(records, null, 2), 'utf8');
    getIO()?.emit('inventoryUpdated');
  } catch (error) {
    console.error('Failed to save inventory records:', error);
  }
}

// Calculate Disposal Status helper
function calculateDisposalStatus(record: Partial<InventoryRecord>): 'Safe for Disposal' | 'Under Retention' | 'Permanent' {
  if (record.appraisalCategory === 'Permanent') {
    return 'Permanent';
  }

  // Must be in Storage stage to be evaluated for disposal
  const isStorage = record.retentionStage === 'Storage' || record.frequencyOfUse === 'Inactive';
  if (!isStorage) {
    return 'Under Retention';
  }

  const currentYear = new Date().getFullYear();
  const datesStr = String(record.inclusiveDates || '').trim();
  const activeYrs = Number(record.activeDeskYrs || 0);
  const storYrs = Number(record.storageYrs || 0);
  const totalRet = Number(record.totalRetention || (activeYrs + storYrs));

  if (!datesStr || totalRet <= 0) {
    return 'Under Retention';
  }

  const matches = (datesStr.match(/\b\d{4}\b/g) || []).map(Number);
  if (matches.length === 0) return 'Under Retention';

  const lower = datesStr.toLowerCase();
  if (lower.includes('present')) {
    const ongoingStartYear = matches[matches.length - 1];
    const elapsed = currentYear - ongoingStartYear;
    if (elapsed >= totalRet) {
      return 'Safe for Disposal';
    }
  } else {
    // Fixed year range e.g. 2020 - 2022 or single year 2020
    const endYear = matches.length >= 2 ? Math.max(matches[0], matches[1]) : matches[0];
    const elapsedInStorage = currentYear - endYear;
    if (elapsedInStorage >= storYrs) {
      return 'Safe for Disposal';
    }
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
router.post('/disposal-history', async (req: Request, res: Response) => {
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

    try {
      const { userId, userName } = await getUserInfo(req);
      const seriesTitle = logData.seriesTitle || 'Inventory Record';
      const disposedYears = logData.disposedYears || '';

      await createAuditLog(prisma, {
        userId,
        userName,
        action: 'status_change',
        entity: 'inventory',
        entityId: logData.recordId || 'disposal',
        entityName: seriesTitle,
        details: {
          description: `${userName} disposed inventory record: ${seriesTitle}${disposedYears ? ` (Years: ${disposedYears})` : ''}`,
          disposedYears,
          seriesTitle,
          previousInclusiveDates: logData.previousInclusiveDates,
          newInclusiveDates: logData.newInclusiveDates,
        },
      });
    } catch (auditErr) {
      console.error('Error logging audit for disposal history:', auditErr);
    }

    res.status(201).json(createdLogs.length === 1 ? createdLogs[0] : createdLogs);
  } catch (err: any) {
    console.error('Error logging disposal history:', err);
    res.status(500).json({ error: 'Failed to save disposal history log' });
  }
});

// ── Inventory Storage & Disposal Requests ──────────────────────────────────
export interface InventoryRequest {
  id: string;
  requesterId: string;
  requesterName: string;
  requestType: 'Storage' | 'Disposal';
  recordIds: string[];
  recordsSummary: { id: string; seriesTitle: string; division?: string; classificationCategory?: string; inclusiveDates?: string }[];
  reason: string;
  attachmentUrl?: string;
  attachmentName?: string;
  status: 'pending' | 'approved' | 'rejected';
  rejectionReason?: string;
  adminReason?: string;
  approvedBy?: string;
  approvedByName?: string;
  createdAt: string;
  resolvedAt?: string;
}

function getInventoryRequestsFilePath(): string {
  return getMigratedFilePath('inventory_requests.json');
}

let cachedInventoryRequests: InventoryRequest[] | null = null;

function readInventoryRequests(): InventoryRequest[] {
  if (cachedInventoryRequests) return cachedInventoryRequests;
  try {
    const filePath = getInventoryRequestsFilePath();
    if (!fs.existsSync(filePath)) {
      saveInventoryRequests([]);
      cachedInventoryRequests = [];
      return [];
    }
    const raw = fs.readFileSync(filePath, 'utf8');
    const reqs = JSON.parse(raw);
    cachedInventoryRequests = Array.isArray(reqs) ? reqs : [];
    return cachedInventoryRequests;
  } catch (err) {
    console.error('Failed to read inventory requests:', err);
    return cachedInventoryRequests || [];
  }
}

function saveInventoryRequests(reqs: InventoryRequest[]): void {
  try {
    cachedInventoryRequests = reqs;
    const filePath = getInventoryRequestsFilePath();
    fs.writeFileSync(filePath, JSON.stringify(reqs, null, 2), 'utf8');
    getIO()?.emit('inventoryUpdated');
  } catch (err) {
    console.error('Failed to save inventory requests:', err);
  }
}

// Upload proof attachment for storage or disposal request
router.post('/upload-attachment', uploadInventoryAttachment.single('attachment'), (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    const relativeUrl = `/uploads/inventory/${req.file.filename}`;
    res.json({
      attachmentUrl: relativeUrl,
      attachmentName: req.file.originalname,
    });
  } catch (err: any) {
    console.error('Error uploading inventory attachment:', err);
    res.status(500).json({ error: err.message || 'Failed to upload file' });
  }
});

// GET all inventory requests
router.get('/requests', (_req: Request, res: Response) => {
  const requests = readInventoryRequests();
  res.json(requests);
});

// POST submit a storage or disposal request
router.post('/requests', async (req: Request, res: Response) => {
  try {
    const { requestType, recordIds, recordsSummary: clientSummary, reason, attachmentUrl, attachmentName } = req.body;
    if (!recordIds || !Array.isArray(recordIds) || recordIds.length === 0) {
      return res.status(400).json({ error: 'At least one record series must be selected' });
    }
    if (!reason || !reason.trim()) {
      return res.status(400).json({ error: 'A reason for storage/disposal is required' });
    }

    const { userId, userName } = await getUserInfo(req);
    const records = readRecords();
    const targetRecords: any[] = [];
    (recordIds || []).forEach((id: string) => {
      const clientItem = Array.isArray(clientSummary) ? clientSummary.find((s: any) => s.id === id) : null;
      const baseRecord = records.find((r: InventoryRecord) => r.id === id || id.startsWith(`${r.id}-`) || id.startsWith(`${r.id}_`));

      if (clientItem) {
        targetRecords.push({
          id: id,
          seriesTitle: clientItem.seriesTitle || (baseRecord ? baseRecord.seriesTitle : id),
          prdsGrds: clientItem.prdsGrds || (baseRecord ? baseRecord.prdsGrds : ''),
          itemNo: clientItem.itemNo || (baseRecord ? baseRecord.itemNo : ''),
          division: clientItem.division || (baseRecord ? baseRecord.division : 'General'),
          classificationCategory: clientItem.classificationCategory || (baseRecord ? baseRecord.classificationCategory : 'General'),
          inclusiveDates: clientItem.inclusiveDates || (baseRecord ? baseRecord.inclusiveDates : 'N/A'),
        });
      } else if (baseRecord) {
        const yearMatch = id.match(/-yr-(\d{4})/);
        const year = yearMatch ? yearMatch[1] : null;
        targetRecords.push({
          id: id,
          seriesTitle: year ? `${baseRecord.seriesTitle} (${year})` : baseRecord.seriesTitle,
          prdsGrds: baseRecord.prdsGrds || '',
          itemNo: baseRecord.itemNo || '',
          division: baseRecord.division,
          classificationCategory: baseRecord.classificationCategory,
          inclusiveDates: year || baseRecord.inclusiveDates,
        });
      } else {
        targetRecords.push({
          id: id,
          seriesTitle: id,
          prdsGrds: '',
          itemNo: '',
          division: 'General',
          classificationCategory: 'General',
          inclusiveDates: 'N/A',
        });
      }
    });

    const newRequest: InventoryRequest = {
      id: `REQ-${Date.now()}`,
      requesterId: userId,
      requesterName: userName,
      requestType: requestType === 'Disposal' ? 'Disposal' : 'Storage',
      recordIds,
      recordsSummary: targetRecords.map((r: any) => ({
        id: r.id,
        seriesTitle: r.seriesTitle,
        prdsGrds: r.prdsGrds,
        itemNo: r.itemNo,
        division: r.division,
        classificationCategory: r.classificationCategory || 'General',
        inclusiveDates: r.inclusiveDates,
      })),
      reason: reason.trim(),
      attachmentUrl,
      attachmentName,
      status: 'pending',
      createdAt: new Date().toISOString(),
    };

    const requests = readInventoryRequests();
    requests.unshift(newRequest);
    saveInventoryRequests(requests);

    res.status(201).json(newRequest);
  } catch (err: any) {
    console.error('Error submitting inventory request:', err);
    res.status(500).json({ error: err.message || 'Failed to submit request' });
  }
});

function formatYearsToRanges(years: number[], hasPresent: boolean = false, currentYear: number = new Date().getFullYear()): string {
  const uniqueSorted = [...new Set(years)].filter((y) => !isNaN(y)).sort((a, b) => a - b);
  if (uniqueSorted.length === 0) {
    return '';
  }

  const groups: number[][] = [];
  let currentGroup: number[] = [uniqueSorted[0]];
  for (let i = 1; i < uniqueSorted.length; i++) {
    if (uniqueSorted[i] === uniqueSorted[i - 1] + 1) {
      currentGroup.push(uniqueSorted[i]);
    } else {
      groups.push(currentGroup);
      currentGroup = [uniqueSorted[i]];
    }
  }
  groups.push(currentGroup);

  const formatted = groups.map((g, idx) => {
    const isLastGroup = idx === groups.length - 1;
    const gStart = g[0];
    const gEnd = g[g.length - 1];
    if (g.length === 1) {
      return (hasPresent && isLastGroup && gEnd === currentYear) ? `${gStart} - Present` : `${gStart}`;
    } else {
      return (hasPresent && isLastGroup && gEnd === currentYear) ? `${gStart} - Present` : `${gStart} - ${gEnd}`;
    }
  });

  return formatted.join(', ');
}

function extractYearsFromInclusiveDates(datesStr: string, currentYear: number = new Date().getFullYear()): { years: number[], hasPresent: boolean } {
  const yearsStr = String(datesStr || '').trim();
  if (!yearsStr || yearsStr.toLowerCase() === 'disposed' || yearsStr.toLowerCase() === 'n/a') {
    return { years: [], hasPresent: false };
  }
  const hasPresent = /present/i.test(yearsStr);
  let allYears: number[] = [];

  const segments = yearsStr.split(',').map((s) => s.trim());
  segments.forEach((seg) => {
    if (seg.includes('-')) {
      const rangeParts = seg.split('-').map((p) => p.trim());
      const rangeStart = parseInt(rangeParts[0], 10);
      let rangeEnd: number;
      if (/present/i.test(rangeParts[rangeParts.length - 1])) {
        rangeEnd = currentYear;
      } else {
        rangeEnd = parseInt(rangeParts[rangeParts.length - 1], 10);
      }
      if (!isNaN(rangeStart) && !isNaN(rangeEnd)) {
        for (let y = rangeStart; y <= rangeEnd; y++) {
          allYears.push(y);
        }
      }
    } else {
      const singleYear = parseInt(seg, 10);
      if (!isNaN(singleYear)) {
        allYears.push(singleYear);
      }
    }
  });

  return { years: [...new Set(allYears)].sort((a, b) => a - b), hasPresent };
}

function calculateNewInclusiveDates(currentDatesStr: string, yearsToRemove: number[]): { newDatesStr: string, isDisposed: boolean } {
  const currentYear = new Date().getFullYear();
  const { years: allYears, hasPresent } = extractYearsFromInclusiveDates(currentDatesStr, currentYear);
  const remainingYears = allYears.filter((y) => !yearsToRemove.includes(y));
  if (remainingYears.length === 0) {
    return { newDatesStr: 'Disposed', isDisposed: true };
  }

  return { newDatesStr: formatYearsToRanges(remainingYears, hasPresent, currentYear), isDisposed: false };
}

// POST confirm / approve an inventory request (Admin action)
router.post('/requests/:id/confirm', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { adminReason } = req.body;
    const { userId, userName } = await getUserInfo(req);

    const requests = readInventoryRequests();
    const reqItem = requests.find((r: InventoryRequest) => r.id === id);
    if (!reqItem) {
      return res.status(404).json({ error: 'Request not found' });
    }
    if (reqItem.status !== 'pending') {
      return res.status(400).json({ error: 'Request has already been processed' });
    }

    const records = readRecords();
    const targetStage = reqItem.requestType === 'Storage' ? 'Storage' : 'Disposed';
    const logs = readDisposalHistory();
    const baseTimestamp = Date.now();

    const recordsToAdd: any[] = [];

    // Update retention stage, inclusive dates, and create history logs
    records.forEach((r: InventoryRecord) => {
      const isMatched = reqItem.recordIds.some((id: string) => {
        const exactRecordId = id.replace(/-yr-\d{4}$/, '');
        return id === r.id || exactRecordId === r.id;
      });

      if (isMatched) {
        const previousInclusiveDates = r.inclusiveDates || 'N/A';
        const targetYears: number[] = [];

        reqItem.recordIds.forEach((id: string) => {
          const exactRecordId = id.replace(/-yr-\d{4}$/, '');
          if (id === r.id || exactRecordId === r.id) {
            const yearMatch = id.match(/-yr-(\d{4})/);
            if (yearMatch) targetYears.push(parseInt(yearMatch[1], 10));
          }
        });

        if (reqItem.recordsSummary) {
          reqItem.recordsSummary.forEach((s: any) => {
            const exactSId = s.id ? s.id.replace(/-yr-\d{4}$/, '') : '';
            if (s.id === r.id || exactSId === r.id) {
              if (s.inclusiveDates && /^\d{4}$/.test(String(s.inclusiveDates).trim())) {
                targetYears.push(parseInt(String(s.inclusiveDates).trim(), 10));
              }
              const titleYearMatch = s.seriesTitle ? s.seriesTitle.match(/\((20\d{2})\)$/) : null;
              if (titleYearMatch) {
                targetYears.push(parseInt(titleYearMatch[1], 10));
              }
            }
          });
        }

        let newInclusiveDates = previousInclusiveDates;
        const uniqueTargetYears = [...new Set(targetYears)].filter((y) => !isNaN(y));
        const currentYear = new Date().getFullYear();

        if (targetStage === 'Storage') {
          if (uniqueTargetYears.length > 0 && r.inclusiveDates) {
            const { newDatesStr, isDisposed } = calculateNewInclusiveDates(String(r.inclusiveDates), uniqueTargetYears);

            if (isDisposed) {
              r.retentionStage = 'Storage';
              r.storageStartDate = new Date().toISOString();
              r.frequencyOfUse = 'Inactive';
            } else {
              r.inclusiveDates = newDatesStr;
            }
          } else {
            r.retentionStage = 'Storage';
            r.storageStartDate = new Date().toISOString();
            r.frequencyOfUse = 'Inactive';
          }

          const sortedTargetYears = uniqueTargetYears.sort((a, b) => a - b);
          if (sortedTargetYears.length > 0) {
            sortedTargetYears.forEach((year, idx) => {
              logs.unshift({
                id: `DISP-${baseTimestamp}-${logs.length}-${idx}`,
                status: 'Completed',
                recordId: r.id,
                seriesTitle: r.seriesTitle,
                prdsGrds: r.prdsGrds,
                itemNo: r.itemNo,
                division: r.division || 'General',
                classificationCategory: r.classificationCategory || 'General',
                subCategory: r.subCategory || '',
                disposedYears: `Moved to Storage: ${year}`,
                previousInclusiveDates: previousInclusiveDates,
                newInclusiveDates: r.inclusiveDates,
                disposedAt: new Date().toISOString(),
                disposedBy: `${userName} (Approved for ${reqItem.requesterName})`,
                reason: reqItem.reason,
                attachmentUrl: reqItem.attachmentUrl,
                attachmentName: reqItem.attachmentName,
              } as any);
            });
          } else {
            logs.unshift({
              id: `DISP-${baseTimestamp}-${logs.length}`,
              status: 'Completed',
              recordId: r.id,
              seriesTitle: r.seriesTitle,
              prdsGrds: r.prdsGrds,
              itemNo: r.itemNo,
              division: r.division || 'General',
              classificationCategory: r.classificationCategory || 'General',
              subCategory: r.subCategory || '',
              disposedYears: `Moved to Storage: ${previousInclusiveDates}`,
              previousInclusiveDates: previousInclusiveDates,
              newInclusiveDates: r.inclusiveDates,
              disposedAt: new Date().toISOString(),
              disposedBy: `${userName} (Approved for ${reqItem.requesterName})`,
              reason: reqItem.reason,
              attachmentUrl: reqItem.attachmentUrl,
              attachmentName: reqItem.attachmentName,
            } as any);
          }

        } else {
          // targetStage === 'Disposed'
          const sortedTargetYears = uniqueTargetYears.sort((a, b) => a - b);
          if (sortedTargetYears.length > 0) {
            sortedTargetYears.forEach(year => {
              logs.unshift({
                id: `DISP-${baseTimestamp}-${logs.length}`,
                status: 'Pending',
                recordId: r.id,
                seriesTitle: r.seriesTitle,
                prdsGrds: r.prdsGrds,
                itemNo: r.itemNo,
                division: r.division || 'General',
                classificationCategory: r.classificationCategory || 'General',
                subCategory: r.subCategory || '',
                disposedYears: String(year),
                previousInclusiveDates: previousInclusiveDates,
                newInclusiveDates: '', // Calculated dynamically upon completion
                disposedAt: new Date().toISOString(),
                disposedBy: `${userName} (Approved for ${reqItem.requesterName})`,
                reason: reqItem.reason,
                attachmentUrl: reqItem.attachmentUrl,
                attachmentName: reqItem.attachmentName,
              } as any);
            });
          } else {
            logs.unshift({
              id: `DISP-${baseTimestamp}-${logs.length}`,
              status: 'Pending',
              recordId: r.id,
              seriesTitle: r.seriesTitle,
              prdsGrds: r.prdsGrds,
              itemNo: r.itemNo,
              division: r.division || 'General',
              classificationCategory: r.classificationCategory || 'General',
              subCategory: r.subCategory || '',
              disposedYears: previousInclusiveDates || 'Disposed',
              previousInclusiveDates: previousInclusiveDates,
              newInclusiveDates: '',
              disposedAt: new Date().toISOString(),
              disposedBy: `${userName} (Approved for ${reqItem.requesterName})`,
              reason: reqItem.reason,
              attachmentUrl: reqItem.attachmentUrl,
              attachmentName: reqItem.attachmentName,
            } as any);
          }
        }
      }
    });

    // Add newly created storage records to the main records list
    if (recordsToAdd.length > 0) {
      records.push(...recordsToAdd);
    }

    saveRecords(records);
    saveDisposalHistory(logs);

    reqItem.status = 'approved';
    reqItem.approvedBy = userId;
    reqItem.approvedByName = userName;
    reqItem.adminReason = adminReason || '';
    reqItem.resolvedAt = new Date().toISOString();
    saveInventoryRequests(requests);

    res.json(reqItem);
  } catch (err: any) {
    console.error('Error confirming inventory request:', err);
    res.status(500).json({ error: err.message || 'Failed to confirm request' });
  }
});

// POST update disposal history status
router.post('/disposal-history/update-status', async (req: Request, res: Response) => {
  try {
    const { logIds, newStatus } = req.body;
    if (!Array.isArray(logIds) || !['Completed', 'Decline'].includes(newStatus)) {
      return res.status(400).json({ error: 'Invalid payload' });
    }
    
    const logs = readDisposalHistory();
    const records = readRecords();
    let recordsModified = false;

    logIds.forEach((id: string) => {
      const log = logs.find((l: any) => l.id === id);
      if (log && log.status === 'Pending') {
        log.status = newStatus;
        if (newStatus === 'Completed') {
          const record = records.find((r: any) => r.id === log.recordId);
          if (record) {
            const yearToRemove = parseInt(log.disposedYears, 10);
            if (!isNaN(yearToRemove)) {
              const { newDatesStr, isDisposed } = calculateNewInclusiveDates(String(record.inclusiveDates), [yearToRemove]);
              record.inclusiveDates = newDatesStr;
              log.newInclusiveDates = newDatesStr;
              if (isDisposed) {
                record.retentionStage = 'Disposed';
              }
              recordsModified = true;
            }
          }
        }
      }
    });

    saveDisposalHistory(logs);
    if (recordsModified) {
      saveRecords(records);
    }
    
    res.json({ success: true });
  } catch (err: any) {
    console.error('Error updating disposal history status:', err);
    res.status(500).json({ error: 'Failed to update disposal history status' });
  }
});

// POST bulk delete disposal history logs
router.post('/disposal-history/bulk-delete', async (req: Request, res: Response) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'ids array is required' });
    }

    let logs = readDisposalHistory();
    let records = readRecords();
    let recordsModified = false;
    let logsModified = false;

    // Process each requested id (direct ID or synthetic/expanded ID)
    for (const rawId of ids) {
      let logIndex = logs.findIndex((l: any) => l.id === rawId);
      let targetYear: number | undefined;

      if (logIndex === -1) {
        // Match by prefix for expanded synthetic IDs: e.g. "DISP-1787536305394-148-2020-0"
        for (let i = 0; i < logs.length; i++) {
          const l = logs[i];
          if (rawId.startsWith(l.id)) {
            logIndex = i;
            const rest = rawId.slice(l.id.length);
            const yMatch = rest.match(/\b(19\d{2}|20\d{2})\b/);
            if (yMatch) targetYear = parseInt(yMatch[1], 10);
            break;
          }
        }
      }

      if (logIndex !== -1) {
        const log = logs[logIndex];
        const record = records.find((r: any) => r.id === log.recordId);

        // Determine years to revert
        let yearsToRevert: number[] = [];
        if (targetYear) {
          yearsToRevert = [targetYear];
        } else {
          const rawYears = String(log.disposedYears || '').replace(/Moved to Storage:\s*/i, '');
          yearsToRevert = extractYearsFromInclusiveDates(rawYears).years;
          if (yearsToRevert.length === 0 && log.previousInclusiveDates) {
            const prevYears = extractYearsFromInclusiveDates(log.previousInclusiveDates).years;
            const currYears = record ? extractYearsFromInclusiveDates(record.inclusiveDates).years : [];
            yearsToRevert = prevYears.filter(y => !currYears.includes(y));
            if (yearsToRevert.length === 0) yearsToRevert = prevYears;
          }
        }

        if (record && yearsToRevert.length > 0) {
          const { years: currentYears, hasPresent } = extractYearsFromInclusiveDates(String(record.inclusiveDates || ''));
          const logHasPresent = /present/i.test(String(log.previousInclusiveDates || ''));
          const combinedYears = [...new Set([...currentYears, ...yearsToRevert])].sort((a, b) => a - b);

          record.inclusiveDates = formatYearsToRanges(combinedYears, hasPresent || logHasPresent);

          const isStorageLog = String(log.disposedYears).includes('Storage');
          if (isStorageLog) {
            const otherStorageLogs = logs.filter((l: any, idx: number) =>
              idx !== logIndex &&
              l.recordId === record.id &&
              String(l.disposedYears).includes('Storage') &&
              !ids.some(delId => delId === l.id || delId.startsWith(l.id))
            );
            if (otherStorageLogs.length === 0) {
              record.retentionStage = 'Active';
              record.frequencyOfUse = 'Active';
              record.storageStartDate = undefined;
            }
          } else {
            if (record.retentionStage === 'Disposed') {
              const hasStorageLog = logs.some((l: any, idx: number) =>
                idx !== logIndex &&
                l.recordId === record.id &&
                String(l.disposedYears).includes('Storage') &&
                !ids.some(delId => delId === l.id || delId.startsWith(l.id))
              );
              record.retentionStage = hasStorageLog ? 'Storage' : 'Active';
              record.frequencyOfUse = 'Active';
            }
          }
          recordsModified = true;
        }

        // Remove single year from log or remove entire log
        if (targetYear && log.disposedYears) {
          const allLogYears = extractYearsFromInclusiveDates(log.disposedYears.replace(/Moved to Storage:\s*/i, '')).years;
          const remainingLogYears = allLogYears.filter(y => y !== targetYear);
          if (remainingLogYears.length > 0) {
            const isStorage = String(log.disposedYears).includes('Storage');
            log.disposedYears = isStorage
              ? `Moved to Storage: ${remainingLogYears.sort((a, b) => a - b).join(', ')}`
              : remainingLogYears.sort((a, b) => a - b).join(', ');
            logsModified = true;
          } else {
            logs.splice(logIndex, 1);
            logsModified = true;
          }
        } else {
          logs.splice(logIndex, 1);
          logsModified = true;
        }
      }
    }

    if (logsModified) saveDisposalHistory(logs);
    if (recordsModified) saveRecords(records);

    res.json({ success: true, message: 'Logs deleted and records reverted successfully' });
  } catch (err: any) {
    console.error('Error bulk deleting disposal history logs:', err);
    res.status(500).json({ error: 'Failed to bulk delete disposal history logs' });
  }
});

// DELETE disposal history log (and revert record state)
router.delete('/disposal-history/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const yearToRemoveParam = req.query.year ? parseInt(String(req.query.year), 10) : NaN;

    let logs = readDisposalHistory();
    let records = readRecords();
    let recordsModified = false;
    let logsModified = false;

    let logIndex = logs.findIndex((l: any) => l.id === id);
    let targetYear = !isNaN(yearToRemoveParam) ? yearToRemoveParam : undefined;

    if (logIndex === -1) {
      for (let i = 0; i < logs.length; i++) {
        const l = logs[i];
        if (id.startsWith(l.id)) {
          logIndex = i;
          const rest = id.slice(l.id.length);
          const yMatch = rest.match(/\b(19\d{2}|20\d{2})\b/);
          if (yMatch) targetYear = parseInt(yMatch[1], 10);
          break;
        }
      }
    }

    if (logIndex === -1) {
      return res.status(404).json({ error: 'Log not found' });
    }

    const log = logs[logIndex];
    const record = records.find((r: any) => r.id === log.recordId);

    let yearsToRevert: number[] = [];
    if (targetYear) {
      yearsToRevert = [targetYear];
    } else {
      const rawYears = String(log.disposedYears || '').replace(/Moved to Storage:\s*/i, '');
      yearsToRevert = extractYearsFromInclusiveDates(rawYears).years;
      if (yearsToRevert.length === 0 && log.previousInclusiveDates) {
        const prevYears = extractYearsFromInclusiveDates(log.previousInclusiveDates).years;
        const currYears = record ? extractYearsFromInclusiveDates(record.inclusiveDates).years : [];
        yearsToRevert = prevYears.filter(y => !currYears.includes(y));
        if (yearsToRevert.length === 0) yearsToRevert = prevYears;
      }
    }

    if (record && yearsToRevert.length > 0) {
      const { years: currentYears, hasPresent } = extractYearsFromInclusiveDates(String(record.inclusiveDates || ''));
      const logHasPresent = /present/i.test(String(log.previousInclusiveDates || ''));
      const combinedYears = [...new Set([...currentYears, ...yearsToRevert])].sort((a, b) => a - b);

      record.inclusiveDates = formatYearsToRanges(combinedYears, hasPresent || logHasPresent);

      const isStorageLog = String(log.disposedYears).includes('Storage');
      if (isStorageLog) {
        const otherStorageLogs = logs.filter((l: any, idx: number) =>
          idx !== logIndex &&
          l.recordId === record.id &&
          String(l.disposedYears).includes('Storage') &&
          l.id !== id && !id.startsWith(l.id)
        );
        if (otherStorageLogs.length === 0) {
          record.retentionStage = 'Active';
          record.frequencyOfUse = 'Active';
          record.storageStartDate = undefined;
        }
      } else {
        if (record.retentionStage === 'Disposed') {
          const hasStorageLog = logs.some((l: any, idx: number) =>
            idx !== logIndex &&
            l.recordId === record.id &&
            String(l.disposedYears).includes('Storage') &&
            l.id !== id && !id.startsWith(l.id)
          );
          record.retentionStage = hasStorageLog ? 'Storage' : 'Active';
          record.frequencyOfUse = 'Active';
        }
      }
      recordsModified = true;
    }

    if (targetYear && log.disposedYears) {
      const allLogYears = extractYearsFromInclusiveDates(log.disposedYears.replace(/Moved to Storage:\s*/i, '')).years;
      const remainingLogYears = allLogYears.filter(y => y !== targetYear);
      if (remainingLogYears.length > 0) {
        const isStorage = String(log.disposedYears).includes('Storage');
        log.disposedYears = isStorage
          ? `Moved to Storage: ${remainingLogYears.sort((a, b) => a - b).join(', ')}`
          : remainingLogYears.sort((a, b) => a - b).join(', ');
        logsModified = true;
      } else {
        logs.splice(logIndex, 1);
        logsModified = true;
      }
    } else {
      logs.splice(logIndex, 1);
      logsModified = true;
    }

    if (logsModified) saveDisposalHistory(logs);
    if (recordsModified) saveRecords(records);

    res.json({ success: true, message: 'Log deleted and record reverted successfully' });
  } catch (err: any) {
    console.error('Error deleting disposal history log:', err);
    res.status(500).json({ error: 'Failed to delete disposal history log' });
  }
});

// POST reject an inventory request (Admin action)
router.post('/requests/:id/reject', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { rejectionReason } = req.body;
    const { userId, userName } = await getUserInfo(req);

    const requests = readInventoryRequests();
    const reqItem = requests.find(r => r.id === id);
    if (!reqItem) {
      return res.status(404).json({ error: 'Request not found' });
    }
    if (reqItem.status !== 'pending') {
      return res.status(400).json({ error: 'Request has already been processed' });
    }

    reqItem.status = 'rejected';
    reqItem.approvedBy = userId;
    reqItem.approvedByName = userName;
    reqItem.rejectionReason = rejectionReason?.trim() || 'Request rejected by admin';
    reqItem.resolvedAt = new Date().toISOString();
    saveInventoryRequests(requests);

    res.json({ rejected: true, request: reqItem });
  } catch (err: any) {
    console.error('Error rejecting inventory request:', err);
    res.status(500).json({ error: err.message || 'Failed to reject request' });
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
router.post('/', async (req: Request, res: Response) => {
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
    const currentYear = new Date().getFullYear();
    const prefix = `INV-${currentYear}-`;
    const maxSeq = records.reduce((max, r) => {
      if (r.id.startsWith(prefix)) {
        const seq = parseInt(r.id.slice(prefix.length), 10);
        return (!isNaN(seq) && seq > max) ? seq : max;
      }
      return max;
    }, 0);
    const newId = `${prefix}${String(maxSeq + 1).padStart(3, '0')}`;

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
      retentionStage: req.body.retentionStage || 'Active',
      storageStartDate: req.body.storageStartDate || undefined,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    newRecord.disposalStatus = calculateDisposalStatus(newRecord);

    records.unshift(newRecord);
    saveRecords(records);

    // Auto-sync options to system settings dropdown options (both DB and JSON)
    await checkAndAddDropdownOptions({
      recordLocations: [newRecord.locationOfRecords],
      dispositionProvisions: [newRecord.dispositionProvision],
      itemNumbers: [newRecord.itemNo],
      divisions: [newRecord.division],
      classificationCategories: [newRecord.classificationCategory],
      subCategories: [newRecord.subCategory],
      prdsGrds: [newRecord.prdsGrds],
    });
    syncLocationOption(newRecord.locationOfRecords);
    syncDispositionProvision(newRecord.dispositionProvision);
    if (newRecord.itemNo) syncItemNumberOption(newRecord.itemNo);
    if (newRecord.division) syncDivisionOption(newRecord.division);
    if (newRecord.classificationCategory) syncClassificationCategoryOption(newRecord.classificationCategory);
    if (newRecord.subCategory) syncSubCategoryOption(newRecord.subCategory);

    try {
      const { userId, userName } = await getUserInfo(req);
      await createAuditLog(prisma, {
        userId,
        userName,
        action: 'create',
        entity: 'inventory',
        entityId: newRecord.id,
        entityName: newRecord.seriesTitle,
        details: {
          description: `${userName} created inventory record: ${newRecord.seriesTitle} (${newRecord.id})`,
          seriesTitle: newRecord.seriesTitle,
          classificationCategory: newRecord.classificationCategory,
          division: newRecord.division,
          locationOfRecords: newRecord.locationOfRecords,
          appraisalCategory: newRecord.appraisalCategory,
        },
      });
    } catch (auditErr) {
      console.error('Error creating audit log for inventory creation:', auditErr);
    }

    res.status(201).json(newRecord);
  } catch (error: any) {
    console.error('Error creating inventory record:', error);
    res.status(500).json({ error: error.message || 'Failed to create inventory record' });
  }
});

// PUT update inventory record
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const records = readRecords();
    const index = records.findIndex(r => r.id === id);

    if (index === -1) {
      return res.status(404).json({ error: 'Record not found' });
    }

    const oldRecord = records[index];

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
    await checkAndAddDropdownOptions({
      recordLocations: [updatedRecord.locationOfRecords],
      dispositionProvisions: [updatedRecord.dispositionProvision],
      itemNumbers: [updatedRecord.itemNo],
      divisions: [updatedRecord.division],
      classificationCategories: [updatedRecord.classificationCategory],
      subCategories: [updatedRecord.subCategory],
      prdsGrds: [updatedRecord.prdsGrds],
    });
    syncLocationOption(updatedRecord.locationOfRecords);
    syncDispositionProvision(updatedRecord.dispositionProvision);
    if (updatedRecord.itemNo) syncItemNumberOption(updatedRecord.itemNo);
    if (updatedRecord.division) syncDivisionOption(updatedRecord.division);
    if (updatedRecord.classificationCategory) syncClassificationCategoryOption(updatedRecord.classificationCategory);
    if (updatedRecord.subCategory) syncSubCategoryOption(updatedRecord.subCategory);

    try {
      const { userId, userName } = await getUserInfo(req);
      const changedFields: string[] = [];
      Object.keys(req.body).forEach((key) => {
        if (JSON.stringify((oldRecord as any)[key]) !== JSON.stringify((updatedRecord as any)[key])) {
          changedFields.push(key);
        }
      });

      await createAuditLog(prisma, {
        userId,
        userName,
        action: 'update',
        entity: 'inventory',
        entityId: updatedRecord.id,
        entityName: updatedRecord.seriesTitle,
        details: {
          changedFields,
          description: changedFields.length > 0
            ? `${userName} updated ${changedFields.length} field(s) of inventory record: ${updatedRecord.seriesTitle}`
            : `${userName} updated inventory record: ${updatedRecord.seriesTitle}`,
          seriesTitle: updatedRecord.seriesTitle,
        },
      });
    } catch (auditErr) {
      console.error('Error creating audit log for inventory update:', auditErr);
    }

    res.json(updatedRecord);
  } catch (error: any) {
    console.error('Error updating inventory record:', error);
    res.status(500).json({ error: error.message || 'Failed to update inventory record' });
  }
});

// POST bulk delete inventory records
router.post('/bulk-delete', async (req: Request, res: Response) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'ids array is required' });
    }

    let records = readRecords();
    const initialCount = records.length;
    const deletedRecords = records.filter(r => ids.includes(r.id));
    records = records.filter(r => !ids.includes(r.id));
    saveRecords(records);

    const deletedCount = initialCount - records.length;

    try {
      const { userId, userName } = await getUserInfo(req);
      await createAuditLog(prisma, {
        userId,
        userName,
        action: 'delete',
        entity: 'inventory',
        entityId: 'bulk',
        entityName: `${deletedCount} inventory records`,
        details: {
          deletedCount,
          description: `${userName} bulk deleted ${deletedCount} inventory record${deletedCount !== 1 ? 's' : ''}`,
          items: deletedRecords.map(r => ({ id: r.id, seriesTitle: r.seriesTitle })),
        },
      });
    } catch (auditErr) {
      console.error('Error creating audit log for inventory bulk delete:', auditErr);
    }

    res.json({ message: 'Records deleted successfully', deletedCount });
  } catch (error: any) {
    console.error('Error bulk deleting inventory records:', error);
    res.status(500).json({ error: error.message || 'Failed to delete inventory records' });
  }
});

// DELETE inventory record
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    let records = readRecords();
    const existingRecord = records.find(r => r.id === id);
    const initialCount = records.length;

    records = records.filter(r => r.id !== id);

    if (records.length === initialCount) {
      return res.status(404).json({ error: 'Record not found' });
    }

    saveRecords(records);

    if (existingRecord) {
      try {
        const { userId, userName } = await getUserInfo(req);
        await createAuditLog(prisma, {
          userId,
          userName,
          action: 'delete',
          entity: 'inventory',
          entityId: id,
          entityName: existingRecord.seriesTitle,
          details: {
            description: `${userName} deleted inventory record: ${existingRecord.seriesTitle} (${id})`,
            seriesTitle: existingRecord.seriesTitle,
          },
        });
      } catch (auditErr) {
        console.error('Error creating audit log for inventory delete:', auditErr);
      }
    }

    res.json({ message: 'Record deleted successfully' });
  } catch (error: any) {
    console.error('Error deleting inventory record:', error);
    res.status(500).json({ error: error.message || 'Failed to delete inventory record' });
  }
});

export interface DisposalLog {
  id: string;
  status?: 'Pending' | 'Completed' | 'Decline';
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
  return getMigratedFilePath('disposal_history.json');
}

const defaultDisposalHistory: DisposalLog[] = [];
let cachedDisposalLogs: DisposalLog[] | null = null;

function readDisposalHistory(): DisposalLog[] {
  if (cachedDisposalLogs) return cachedDisposalLogs;
  try {
    const filePath = getDisposalHistoryFilePath();
    if (!fs.existsSync(filePath)) {
      saveDisposalHistory(defaultDisposalHistory);
      cachedDisposalLogs = defaultDisposalHistory;
      return defaultDisposalHistory;
    }
    const raw = fs.readFileSync(filePath, 'utf8');
    const logs = JSON.parse(raw);
    if (!Array.isArray(logs) || logs.length === 0) {
      saveDisposalHistory(defaultDisposalHistory);
      cachedDisposalLogs = defaultDisposalHistory;
      return defaultDisposalHistory;
    }
    cachedDisposalLogs = logs;
    return cachedDisposalLogs;
  } catch (err) {
    console.error('Failed to read disposal history:', err);
    return cachedDisposalLogs || defaultDisposalHistory;
  }
}

function saveDisposalHistory(logs: DisposalLog[]): void {
  try {
    cachedDisposalLogs = logs;
    const filePath = getDisposalHistoryFilePath();
    fs.writeFileSync(filePath, JSON.stringify(logs, null, 2), 'utf8');
    getIO()?.emit('inventoryUpdated');
  } catch (err) {
    console.error('Failed to save disposal history:', err);
  }
}

export default router;
