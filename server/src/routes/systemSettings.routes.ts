import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

// Default dropdown options (used when none are saved)
const DEFAULT_APPOINTMENT_STATUSES = [
  'Consultant', 'Contract of Service', 'Contractual', 'Co-Terminous',
  'Casual', 'Elective', 'Job Order', 'Permanent', 'Probationary', 'Temporary',
];

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
        data: { idleTimeout: null },
      });
    }
    res.json({
      idleTimeout: settings.idleTimeout,
      appointmentStatuses: (settings.appointmentStatuses as string[] | null) ?? DEFAULT_APPOINTMENT_STATUSES,
      officeNames: (settings.officeNames as string[] | null) ?? [],
      positions: (settings.positions as string[] | null) ?? [],
    });
  } catch (error) {
    console.error('Error fetching system settings:', error);
    res.status(500).json({ error: 'Failed to fetch system settings' });
  }
});

// PUT /api/system-settings - Update idle timeout (Super Admin only)
router.put('/', requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { idleTimeout } = req.body;
    if (idleTimeout !== null && (typeof idleTimeout !== 'number' || idleTimeout < 0)) {
      return res.status(400).json({ error: 'Invalid idleTimeout value' });
    }
    let settings = await prisma.systemSetting.findFirst();
    if (settings) {
      settings = await prisma.systemSetting.update({
        where: { id: settings.id },
        data: { idleTimeout },
      });
    } else {
      settings = await prisma.systemSetting.create({ data: { idleTimeout } });
    }
    res.json({ idleTimeout: settings.idleTimeout, message: 'System settings updated successfully' });
  } catch (error) {
    console.error('Error updating system settings:', error);
    res.status(500).json({ error: 'Failed to update system settings' });
  }
});

// PUT /api/system-settings/dropdown-options - Update dropdown lists (Developer role only)
router.put('/dropdown-options', requireDeveloperRole, async (req: Request, res: Response) => {
  try {
    const { appointmentStatuses, officeNames, positions } = req.body;
    const updateData: any = {};
    if (Array.isArray(appointmentStatuses)) updateData.appointmentStatuses = appointmentStatuses;
    if (Array.isArray(officeNames)) updateData.officeNames = officeNames;
    if (Array.isArray(positions)) updateData.positions = positions;

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
      message: 'Dropdown options updated successfully',
    });
  } catch (error) {
    console.error('Error updating dropdown options:', error);
    res.status(500).json({ error: 'Failed to update dropdown options' });
  }
});

export default router;
