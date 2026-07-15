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

// GET /api/system-settings
router.get('/', async (req: Request, res: Response) => {
  try {
    let settings = await prisma.systemSetting.findFirst();
    if (!settings) {
      settings = await prisma.systemSetting.create({
        data: { idleTimeout: null, autoRename: false },
      });
    }
    res.json({
      idleTimeout: settings.idleTimeout,
      autoRename: settings.autoRename,
      appointmentStatuses: (settings.appointmentStatuses as string[] | null) ?? DEFAULT_APPOINTMENT_STATUSES,
      officeNames: (settings.officeNames as string[] | null) ?? [],
      positions: (settings.positions as string[] | null) ?? [],
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
    const { appointmentStatuses, officeNames, positions, aoYears, reasonsForSeparation } = req.body;
    const updateData: any = {};
    if (Array.isArray(appointmentStatuses)) updateData.appointmentStatuses = appointmentStatuses;
    if (Array.isArray(officeNames)) updateData.officeNames = officeNames;
    if (Array.isArray(positions)) updateData.positions = positions;
    if (Array.isArray(aoYears)) updateData.aoYears = aoYears;
    if (Array.isArray(reasonsForSeparation)) updateData.reasonsForSeparation = reasonsForSeparation;

    let settings = await prisma.systemSetting.findFirst();
    if (settings) {
      settings = await prisma.systemSetting.update({ where: { id: settings.id }, data: updateData });
    } else {
      settings = await prisma.systemSetting.create({ data: updateData });
    }

    res.json({
      appointmentStatuses: (settings.appointmentStatuses as string[] | null) ?? DEFAULT_APPOINTMENT_STATUSES,
      officeNames: (settings.officeNames as string[] | null) ?? [],
      positions: (settings.positions as string[] | null) ?? [],
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
