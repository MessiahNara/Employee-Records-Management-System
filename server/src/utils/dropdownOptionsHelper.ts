import prisma from '../lib/prisma';
import { getIO } from '../socket';

export async function checkAndAddDropdownOptions(data: {
  officeNames?: (string | null | undefined)[];
  positions?: (string | null | undefined)[];
  appointmentStatuses?: (string | null | undefined)[];
  recordLocations?: (string | null | undefined)[];
  divisions?: (string | null | undefined)[];
  classificationCategories?: (string | null | undefined)[];
  subCategories?: (string | null | undefined)[];
  itemNumbers?: (string | null | undefined)[];
  dispositionProvisions?: (string | null | undefined)[];
  prdsGrds?: (string | null | undefined)[];
  reasonsForSeparation?: (string | null | undefined)[];
  aoYears?: (string | null | undefined)[];
}) {
  try {
    let settings = await prisma.systemSetting.findFirst();
    if (!settings) {
      settings = await prisma.systemSetting.create({
        data: {
          appointmentStatuses: [],
          officeNames: [],
          positions: [],
          recordLocations: [],
          divisions: [],
          classificationCategories: [],
          subCategories: [],
          itemNumbers: [],
          dispositionProvisions: [],
          prdsGrds: [],
          reasonsForSeparation: [],
          aoYears: [],
        },
      });
    }

    const currentOfficeNames = new Set((settings.officeNames as string[] | null) ?? []);
    const currentPositions = new Set((settings.positions as string[] | null) ?? []);
    const currentAppointmentStatuses = new Set((settings.appointmentStatuses as string[] | null) ?? []);
    const currentRecordLocations = new Set((settings.recordLocations as string[] | null) ?? []);
    const currentDivisions = new Set((settings.divisions as string[] | null) ?? []);
    const currentClassificationCategories = new Set((settings.classificationCategories as string[] | null) ?? []);
    const currentSubCategories = new Set((settings.subCategories as string[] | null) ?? []);
    const currentItemNumbers = new Set((settings.itemNumbers as string[] | null) ?? []);
    const currentDispositionProvisions = new Set((settings.dispositionProvisions as string[] | null) ?? []);
    const currentPrdsGrds = new Set((settings.prdsGrds as string[] | null) ?? []);
    const currentReasonsForSeparation = new Set((settings.reasonsForSeparation as string[] | null) ?? []);
    const currentAoYears = new Set((settings.aoYears as string[] | null) ?? []);

    let needsUpdate = false;

    const addItemsToSet = (items: (string | null | undefined)[] | undefined, targetSet: Set<string>) => {
      if (!items) return;
      for (const item of items) {
        if (item && item.trim() !== '') {
          const trimmed = item.trim();
          if (!targetSet.has(trimmed)) {
            targetSet.add(trimmed);
            needsUpdate = true;
          }
        }
      }
    };

    addItemsToSet(data.officeNames, currentOfficeNames);
    addItemsToSet(data.positions, currentPositions);
    addItemsToSet(data.recordLocations, currentRecordLocations);
    addItemsToSet(data.divisions, currentDivisions);
    addItemsToSet(data.classificationCategories, currentClassificationCategories);
    addItemsToSet(data.subCategories, currentSubCategories);
    addItemsToSet(data.itemNumbers, currentItemNumbers);
    addItemsToSet(data.dispositionProvisions, currentDispositionProvisions);
    addItemsToSet(data.prdsGrds, currentPrdsGrds);
    addItemsToSet(data.reasonsForSeparation, currentReasonsForSeparation);
    addItemsToSet(data.aoYears, currentAoYears);

    if (data.appointmentStatuses) {
      for (const status of data.appointmentStatuses) {
        if (status && status.trim() !== '') {
          const trimmed = status.trim();
          const baseName = trimmed.toLowerCase();
          const exists = Array.from(currentAppointmentStatuses).some((s) => {
            const name = s.endsWith('|date') ? s.slice(0, -5) : s;
            return name.toLowerCase() === baseName;
          });
          if (!exists) {
            currentAppointmentStatuses.add(trimmed);
            needsUpdate = true;
          }
        }
      }
    }

    if (needsUpdate) {
      await prisma.systemSetting.update({
        where: { id: settings.id },
        data: {
          officeNames: Array.from(currentOfficeNames).sort(),
          positions: Array.from(currentPositions).sort(),
          appointmentStatuses: Array.from(currentAppointmentStatuses).sort(),
          recordLocations: Array.from(currentRecordLocations).sort(),
          divisions: Array.from(currentDivisions).sort(),
          classificationCategories: Array.from(currentClassificationCategories).sort(),
          subCategories: Array.from(currentSubCategories).sort(),
          itemNumbers: Array.from(currentItemNumbers).sort(),
          dispositionProvisions: Array.from(currentDispositionProvisions).sort(),
          prdsGrds: Array.from(currentPrdsGrds).sort(),
          reasonsForSeparation: Array.from(currentReasonsForSeparation).sort(),
          aoYears: Array.from(currentAoYears).sort(),
        },
      });
      console.log('[settings] Automatically added new dynamic dropdown options to database');
      getIO()?.emit('systemSettingsUpdated');
    }
  } catch (error) {
    console.error('[settings] Error auto-populating dropdown options:', error);
  }
}

export async function syncExistingRecordsToDropdownOptions() {
  try {
    const settings = await prisma.systemSetting.findFirst();
    const hasOffices = Array.isArray(settings?.officeNames) && (settings.officeNames as string[]).length > 0;
    const hasPositions = Array.isArray(settings?.positions) && (settings.positions as string[]).length > 0;
    const hasStatuses = Array.isArray(settings?.appointmentStatuses) && (settings.appointmentStatuses as string[]).length > 0;

    // If dropdown options are already initialized and populated in DB, do not re-scan to avoid resurrecting deleted options
    if (hasOffices && hasPositions && hasStatuses) {
      console.log('[settings] Dropdown options already initialized in database. Skipping startup sync.');
      return;
    }

    console.log('[settings] Initializing dynamic dropdown options from existing records...');
    
    // Fetch unique fields from Employee table
    const employees = await prisma.employee.findMany({
      select: {
        officeName: true,
        position: true,
        appointmentStatus: true,
        motherUnit: true,
        detailedTo: true,
        designatedPositionFunction: true,
      },
    });

    const officeNamesSet = new Set<string>();
    const positionsSet = new Set<string>();
    const statusSet = new Set<string>();

    employees.forEach((emp) => {
      if (emp.officeName) officeNamesSet.add(emp.officeName);
      if (emp.motherUnit) officeNamesSet.add(emp.motherUnit);
      if (emp.detailedTo) officeNamesSet.add(emp.detailedTo);
      
      if (emp.position) positionsSet.add(emp.position);
      if (emp.designatedPositionFunction) positionsSet.add(emp.designatedPositionFunction);
      
      if (emp.appointmentStatus) statusSet.add(emp.appointmentStatus);
    });

    // Also check Documents table for detailedTo/designatedPositionFunction
    const documents = await prisma.document.findMany({
      where: {
        category: 'Administrative Order',
      },
      select: {
        detailedTo: true,
        designatedPositionFunction: true,
      },
    });

    documents.forEach((doc) => {
      if (doc.detailedTo) officeNamesSet.add(doc.detailedTo);
      if (doc.designatedPositionFunction) positionsSet.add(doc.designatedPositionFunction);
    });

    if (officeNamesSet.size === 0 && positionsSet.size === 0 && statusSet.size === 0) {
      console.log('[settings] No existing employee records found to sync.');
      return;
    }

    await checkAndAddDropdownOptions({
      officeNames: Array.from(officeNamesSet),
      positions: Array.from(positionsSet),
      appointmentStatuses: Array.from(statusSet),
    });
    console.log('[settings] Completed database check and synchronized all existing values.');
  } catch (error) {
    console.error('[settings] Error syncing existing records to dynamic settings:', error);
  }
}

