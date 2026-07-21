import prisma from '../lib/prisma';

export async function checkAndAddDropdownOptions(data: {
  officeNames?: (string | null | undefined)[];
  positions?: (string | null | undefined)[];
  appointmentStatuses?: (string | null | undefined)[];
}) {
  try {
    let settings = await prisma.systemSetting.findFirst();
    if (!settings) {
      settings = await prisma.systemSetting.create({
        data: {
          appointmentStatuses: [],
          officeNames: [],
          positions: [],
        },
      });
    }

    const currentOfficeNames = new Set((settings.officeNames as string[] | null) ?? []);
    const currentPositions = new Set((settings.positions as string[] | null) ?? []);
    const currentAppointmentStatuses = new Set((settings.appointmentStatuses as string[] | null) ?? []);

    let needsUpdate = false;

    if (data.officeNames) {
      for (const office of data.officeNames) {
        if (office && office.trim() !== '') {
          const trimmed = office.trim();
          if (!currentOfficeNames.has(trimmed)) {
            currentOfficeNames.add(trimmed);
            needsUpdate = true;
          }
        }
      }
    }

    if (data.positions) {
      for (const pos of data.positions) {
        if (pos && pos.trim() !== '') {
          const trimmed = pos.trim();
          if (!currentPositions.has(trimmed)) {
            currentPositions.add(trimmed);
            needsUpdate = true;
          }
        }
      }
    }

    if (data.appointmentStatuses) {
      for (const status of data.appointmentStatuses) {
        if (status && status.trim() !== '') {
          const trimmed = status.trim();
          const baseName = trimmed.toLowerCase();
          const exists = Array.from(currentAppointmentStatuses).some(s => {
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
        },
      });
      console.log('[settings] Automatically added new dynamic dropdown options');
    }
  } catch (error) {
    console.error('[settings] Error auto-populating dropdown options:', error);
  }
}

export async function syncExistingRecordsToDropdownOptions() {
  try {
    console.log('[settings] Starting database check to sync existing offices and positions to dynamic settings...');
    
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

