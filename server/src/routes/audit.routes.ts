import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';

const router = Router();

// Get audit statistics (MUST come before /:id route)
router.get('/stats/summary', async (req: Request, res: Response) => {
  try {
    const [total, byAction, byEntity, recent] = await Promise.all([
      prisma.auditLog.count(),
      prisma.auditLog.groupBy({
        by: ['action'],
        _count: true,
      }),
      prisma.auditLog.groupBy({
        by: ['entity'],
        _count: true,
      }),
      prisma.auditLog.findMany({
        orderBy: {
          createdAt: 'desc',
        },
        take: 10,
      }),
    ]);

    res.json({
      total,
      byAction,
      byEntity,
      recent,
    });
  } catch (error) {
    console.error('Error fetching audit statistics:', error);
    res.status(500).json({ error: 'Failed to fetch audit statistics' });
  }
});

// Get audit logs by entity (MUST come before /:id route)
router.get('/entity/:entityId', async (req: Request, res: Response) => {
  try {
    const { entityId } = req.params;

    const auditLogs = await prisma.auditLog.findMany({
      where: { entityId },
      orderBy: {
        createdAt: 'desc',
      },
    });

    res.json(auditLogs);
  } catch (error) {
    console.error('Error fetching entity audit logs:', error);
    res.status(500).json({ error: 'Failed to fetch entity audit logs' });
  }
});

// Get all audit logs with optional filters
router.get('/', async (req: Request, res: Response) => {
  try {
    const { action, entity, userId, limit = '50' } = req.query;

    const where: any = {};
    if (action) where.action = action as string;
    if (entity) where.entity = entity as string;
    if (userId) where.userId = userId as string;

    const auditLogs = await prisma.auditLog.findMany({
      where,
      orderBy: {
        createdAt: 'desc',
      },
      take: parseInt(limit as string),
    });

    // Fetch user information for each audit log
    const logsWithUserInfo = await Promise.all(
      auditLogs.map(async (log) => {
        let userName = 'System';
        let userRole = 'system';

        if (log.userId !== 'system') {
          try {
            const user = await prisma.user.findUnique({
              where: { id: log.userId },
              select: {
                firstName: true,
                lastName: true,
                role: true,
              },
            });

            if (user) {
              userName = `${user.firstName} ${user.lastName}`;
              userRole = user.role;
            }
          } catch (err) {
            console.error(`Failed to fetch user ${log.userId}:`, err);
          }
        }

        return {
          ...log,
          userName,
          userRole,
        };
      })
    );

    res.json(logsWithUserInfo);
  } catch (error) {
    console.error('Error fetching audit logs:', error);
    res.status(500).json({ error: 'Failed to fetch audit logs' });
  }
});

// Get audit log by ID (MUST come after more specific routes)
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const auditLog = await prisma.auditLog.findUnique({
      where: { id },
    });

    if (!auditLog) {
      return res.status(404).json({ error: 'Audit log not found' });
    }

    res.json(auditLog);
  } catch (error) {
    console.error('Error fetching audit log:', error);
    res.status(500).json({ error: 'Failed to fetch audit log' });
  }
});

// Create bulk import audit log (MUST come before POST / route)
router.post('/bulk-import', async (req: Request, res: Response) => {
  try {
    const { userId, userName, employees } = req.body;

    if (!userId || !userName || !employees || !Array.isArray(employees)) {
      return res.status(400).json({ error: 'userId, userName, and employees array are required' });
    }

    const count = employees.length;
    const description = `${userName} imported ${count} employee${count > 1 ? 's' : ''}`;

    // Create audit log with metadata
    const auditLog = await prisma.auditLog.create({
      data: {
        userId,
        action: 'import',
        entity: 'employee',
        entityId: 'bulk', // Use 'bulk' as entityId for bulk operations
        details: description,
        metadata: {
          employees: employees.map((emp: any) => ({
            first_name: emp.firstName,
            last_name: emp.lastName,
          })),
        },
      },
    });

    res.status(201).json(auditLog);
  } catch (error) {
    console.error('Error creating bulk import audit log:', error);
    res.status(500).json({ error: 'Failed to create bulk import audit log' });
  }
});

// Create audit log (generic POST route)
router.post('/', async (req: Request, res: Response) => {
  try {
    const { userId, action, entity, entityId, details, metadata } = req.body;

    if (!userId || !action || !entity || !entityId || !details) {
      return res.status(400).json({ error: 'userId, action, entity, entityId, and details are required' });
    }

    const auditLog = await prisma.auditLog.create({
      data: {
        userId,
        action,
        entity,
        entityId,
        details,
        metadata: metadata || null,
      },
    });

    res.status(201).json(auditLog);
  } catch (error) {
    console.error('Error creating audit log:', error);
    res.status(500).json({ error: 'Failed to create audit log' });
  }
});

export default router;
