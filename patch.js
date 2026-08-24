
const fs = require('fs');
const file = 'server/src/routes/inventory.routes.ts';
let content = fs.readFileSync(file, 'utf8');

const target = \outer.delete('/disposal-history/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    let logs = readDisposalHistory();
    const logIndex = logs.findIndex((l: any) => l.id === id);

    if (logIndex === -1) {
      return res.status(404).json({ error: 'Log not found' });
    }

    const log = logs[logIndex];
    let records = readRecords();
    const record = records.find((r: any) => r.id === log.recordId);
    let recordsModified = false;

    if (record) {
      const isStorageLog = String(log.disposedYears).includes('Storage');
      if (isStorageLog) {
        // Revert Storage Log
        record.retentionStage = 'Active';
        record.frequencyOfUse = 'Active';
        record.storageStartDate = undefined;
        if (log.previousInclusiveDates) {
          record.inclusiveDates = log.previousInclusiveDates;
        }
        recordsModified = true;
      } else if (log.status === 'Completed' || log.status === 'Decline') {
        // Revert Disposal Log
        const yearToRemove = parseInt(log.disposedYears, 10);
        if (!isNaN(yearToRemove)) {
          let currentDates = String(record.inclusiveDates || '');
          if (!currentDates.includes(yearToRemove.toString())) {
            // Add it back
            currentDates = currentDates ? \\\\, \\\\ : yearToRemove.toString();
            // Sort dates
            const parts = currentDates.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n));
            const sorted = parts.sort((a, b) => a - b).join(', ');
            record.inclusiveDates = sorted || currentDates;
          }
          if (record.retentionStage === 'Disposed') {
            record.retentionStage = 'Storage';
          }
          recordsModified = true;
        }
      }
    }

    // Remove the log
    logs.splice(logIndex, 1);
    saveDisposalHistory(logs);

    if (recordsModified) {
      saveRecords(records);
    }

    res.json({ success: true, message: 'Log deleted successfully' });
  } catch (err: any) {
    console.error('Error deleting disposal history log:', err);
    res.status(500).json({ error: 'Failed to delete disposal history log' });
  }
});\;

const replacement = \outer.delete('/disposal-history/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const yearToRemoveParam = req.query.year ? parseInt(String(req.query.year), 10) : NaN;
    
    let logs = readDisposalHistory();
    const logIndex = logs.findIndex((l: any) => l.id === id);

    if (logIndex === -1) {
      return res.status(404).json({ error: 'Log not found' });
    }

    const log = logs[logIndex];
    let records = readRecords();
    const recordIndex = records.findIndex((r: any) => r.id === log.recordId);
    let recordsModified = false;
    let logPartiallyDeleted = false;

    if (recordIndex !== -1) {
      const record = records[recordIndex];
      const isStorageLog = String(log.disposedYears).includes('Storage');
      
      if (isStorageLog) {
        if (!isNaN(yearToRemoveParam)) {
          // PARTIAL STORAGE REVERSION
          const logYearsStr = log.disposedYears.replace('Moved to Storage:', '').trim();
          const logYears = logYearsStr.split(',').map((y: string) => parseInt(y.trim(), 10)).filter((y: number) => !isNaN(y));
          
          if (logYears.includes(yearToRemoveParam)) {
            const remainingLogYears = logYears.filter((y: number) => y !== yearToRemoveParam);
            
            if (remainingLogYears.length > 0) {
              // Update log to only include remaining years
              log.disposedYears = \\\Moved to Storage: \\\\;
              
              // Remove the year from the original record's inclusiveDates
              const { newDatesStr } = calculateNewInclusiveDates(String(record.inclusiveDates), [yearToRemoveParam]);
              record.inclusiveDates = newDatesStr;
              
              // Create a cloned record for the restored year
              const clonedRecord = {
                ...record,
                id: \\\INV-\-\\\\,
                inclusiveDates: String(yearToRemoveParam),
                retentionStage: 'Active',
                frequencyOfUse: 'Active',
                storageStartDate: undefined
              };
              
              records.unshift(clonedRecord);
              recordsModified = true;
              logPartiallyDeleted = true;
            } else {
              // Fallback to standard full reversion
              record.retentionStage = 'Active';
              record.frequencyOfUse = 'Active';
              record.storageStartDate = undefined;
              if (log.previousInclusiveDates) {
                record.inclusiveDates = log.previousInclusiveDates;
              }
              recordsModified = true;
            }
          }
        } else {
          // Standard full reversion
          record.retentionStage = 'Active';
          record.frequencyOfUse = 'Active';
          record.storageStartDate = undefined;
          if (log.previousInclusiveDates) {
            record.inclusiveDates = log.previousInclusiveDates;
          }
          recordsModified = true;
        }
      } else if (log.status === 'Completed' || log.status === 'Decline') {
        // Revert Disposal Log
        const yearToRemove = parseInt(log.disposedYears, 10);
        if (!isNaN(yearToRemove)) {
          let currentDates = String(record.inclusiveDates || '');
          if (!currentDates.includes(yearToRemove.toString())) {
            // Add it back
            currentDates = currentDates ? \\\\, \\\\ : yearToRemove.toString();
            // Sort dates
            const parts = currentDates.split(',').map((s: string) => parseInt(s.trim(), 10)).filter((n: number) => !isNaN(n));
            const sorted = parts.sort((a: any, b: any) => a - b).join(', ');
            record.inclusiveDates = sorted || currentDates;
          }
          if (record.retentionStage === 'Disposed') {
            record.retentionStage = 'Storage';
          }
          recordsModified = true;
        }
      }
    }

    if (!logPartiallyDeleted) {
      // Remove the log
      logs.splice(logIndex, 1);
    }
    saveDisposalHistory(logs);

    if (recordsModified) {
      saveRecords(records);
    }

    res.json({ success: true, message: logPartiallyDeleted ? 'Partial storage log deleted and split record created.' : 'Log deleted successfully' });
  } catch (err: any) {
    console.error('Error deleting disposal history log:', err);
    res.status(500).json({ error: 'Failed to delete disposal history log' });
  }
});\;

if (content.includes(target)) {
  content = content.replace(target, replacement);
  fs.writeFileSync(file, content, 'utf8');
  console.log('Successfully replaced');
} else {
  console.log('Target not found');
}

