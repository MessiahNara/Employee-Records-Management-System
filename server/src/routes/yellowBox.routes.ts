import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { createAuditLog } from '../utils/auditHelper';
import { getIO } from '../socket';

const router = Router();

// GET /api/yellow-boxes - List all boxes with their count of employees
router.get('/', async (req: Request, res: Response) => {
  try {
    const boxes = await prisma.yellowBox.findMany({
      include: {
        employees: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            middleName: true,
            officeName: true,
            position: true,
            file201Status: true,
          },
        },
      },
      orderBy: [
        { office: 'asc' },
        { boxLabel: 'asc' },
      ],
    });
    res.json(boxes);
  } catch (error) {
    console.error('Error fetching yellow boxes:', error);
    res.status(500).json({ error: 'Failed to fetch yellow boxes' });
  }
});

// GET /api/yellow-boxes/:id - Get a specific box details with employees list
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const box = await prisma.yellowBox.findUnique({
      where: { id },
      include: {
        employees: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            middleName: true,
            officeName: true,
            position: true,
            file201Status: true,
          },
        },
      },
    });

    if (!box) {
      return res.status(404).json({ error: 'Yellow box not found' });
    }

    res.json(box);
  } catch (error) {
    console.error('Error fetching yellow box:', error);
    res.status(500).json({ error: 'Failed to fetch yellow box' });
  }
});

// POST /api/yellow-boxes - Create a new box
router.post('/', async (req: Request, res: Response) => {
  try {
    const { boxLabel, office, type, color } = req.body;
    const userId = (req.headers['x-logged-in-user-id'] || req.headers['x-user-id']) as string;

    if (!boxLabel || !office || !type) {
      return res.status(400).json({ error: 'boxLabel, office, and type are required' });
    }

    const box = await prisma.yellowBox.create({
      data: {
        boxLabel,
        office,
        type,
        color: color || '#facc15',
      },
    });

    // Audit log
    if (userId) {
      const user = await prisma.user.findUnique({ where: { id: userId }, select: { firstName: true, lastName: true } });
      const userName = user ? `${user.lastName}, ${user.firstName}` : 'Administrator';
      await createAuditLog(prisma, {
        userId,
        userName,
        action: 'create_yellow_box',
        entity: 'yellow_box',
        entityId: box.id,
        entityName: `${box.office} - ${box.boxLabel} (${box.type})`,
        details: {
          description: `${userName} created Yellow Box "${box.boxLabel}" for office "${box.office}" (${box.type})`,
        },
      });
    }

    getIO()?.emit('file201Updated');
    getIO()?.emit('employeeUpdated');

    res.status(201).json(box);
  } catch (error) {
    console.error('Error creating yellow box:', error);
    res.status(500).json({ error: 'Failed to create yellow box' });
  }
});

// PUT /api/yellow-boxes/:id - Update box details
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { boxLabel, office, type, color } = req.body;
    const userId = (req.headers['x-logged-in-user-id'] || req.headers['x-user-id']) as string;

    if (!boxLabel || !office || !type) {
      return res.status(400).json({ error: 'boxLabel, office, and type are required' });
    }

    const updated = await prisma.yellowBox.update({
      where: { id },
      data: {
        boxLabel,
        office,
        type,
        color: color || '#facc15',
      },
    });

    // Audit log
    if (userId) {
      const user = await prisma.user.findUnique({ where: { id: userId }, select: { firstName: true, lastName: true } });
      const userName = user ? `${user.lastName}, ${user.firstName}` : 'Administrator';
      await createAuditLog(prisma, {
        userId,
        userName,
        action: 'update_yellow_box',
        entity: 'yellow_box',
        entityId: id,
        entityName: `${updated.office} - ${updated.boxLabel} (${updated.type})`,
        details: {
          description: `${userName} updated Yellow Box details to Label: "${updated.boxLabel}", Office: "${updated.office}", Type: "${updated.type}"`,
        },
      });
    }

    getIO()?.emit('file201Updated');
    getIO()?.emit('employeeUpdated');

    res.json(updated);
  } catch (error) {
    console.error('Error updating yellow box:', error);
    res.status(500).json({ error: 'Failed to update yellow box' });
  }
});

// DELETE /api/yellow-boxes/:id - Delete a yellow box (dissociates employees automatically due to optional foreign key)
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = (req.headers['x-logged-in-user-id'] || req.headers['x-user-id']) as string;

    const box = await prisma.yellowBox.findUnique({ where: { id } });
    if (!box) {
      return res.status(404).json({ error: 'Yellow box not found' });
    }

    // Dissociate employees first (optional relation cleanup)
    await prisma.employee.updateMany({
      where: { yellowBoxId: id },
      data: { yellowBoxId: null },
    });

    await prisma.yellowBox.delete({
      where: { id },
    });

    // Audit log
    if (userId) {
      const user = await prisma.user.findUnique({ where: { id: userId }, select: { firstName: true, lastName: true } });
      const userName = user ? `${user.lastName}, ${user.firstName}` : 'Administrator';
      await createAuditLog(prisma, {
        userId,
        userName,
        action: 'delete_yellow_box',
        entity: 'yellow_box',
        entityId: id,
        entityName: `${box.office} - ${box.boxLabel}`,
        details: {
          description: `${userName} deleted Yellow Box "${box.boxLabel}" for office "${box.office}"`,
        },
      });
    }

    getIO()?.emit('file201Updated');
    getIO()?.emit('employeeUpdated');

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting yellow box:', error);
    res.status(500).json({ error: 'Failed to delete yellow box' });
  }
});

// POST /api/yellow-boxes/:id/employees - Add/assign an employee to a yellow box
router.post('/:id/employees', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { employeeId } = req.body;
    const userId = (req.headers['x-logged-in-user-id'] || req.headers['x-user-id']) as string;

    if (!employeeId) {
      return res.status(400).json({ error: 'employeeId is required' });
    }

    const box = await prisma.yellowBox.findUnique({ where: { id } });
    if (!box) {
      return res.status(404).json({ error: 'Yellow box not found' });
    }

    const updatedEmployee = await prisma.employee.update({
      where: { id: employeeId },
      data: { yellowBoxId: id },
    });

    // Audit log
    if (userId) {
      const user = await prisma.user.findUnique({ where: { id: userId }, select: { firstName: true, lastName: true } });
      const userName = user ? `${user.lastName}, ${user.firstName}` : 'Administrator';
      await createAuditLog(prisma, {
        userId,
        userName,
        action: 'assign_employee_to_box',
        entity: 'employee',
        entityId: employeeId,
        entityName: `${updatedEmployee.lastName}, ${updatedEmployee.firstName}`,
        details: {
          yellowBoxId: id,
          description: `${userName} assigned employee ${updatedEmployee.firstName} ${updatedEmployee.lastName} to Yellow Box "${box.boxLabel}" (${box.office})`,
        },
      });
    }

    getIO()?.emit('file201Updated');
    getIO()?.emit('employeeUpdated');

    res.json(updatedEmployee);
  } catch (error) {
    console.error('Error assigning employee to yellow box:', error);
    res.status(500).json({ error: 'Failed to assign employee to yellow box' });
  }
});

// DELETE /api/yellow-boxes/:id/employees/:employeeId - Remove an employee from a yellow box
router.delete('/:id/employees/:employeeId', async (req: Request, res: Response) => {
  try {
    const { id, employeeId } = req.params;
    const userId = (req.headers['x-logged-in-user-id'] || req.headers['x-user-id']) as string;

    const box = await prisma.yellowBox.findUnique({ where: { id } });
    if (!box) {
      return res.status(404).json({ error: 'Yellow box not found' });
    }

    const updatedEmployee = await prisma.employee.update({
      where: { id: employeeId },
      data: { yellowBoxId: null },
    });

    // Audit log
    if (userId) {
      const user = await prisma.user.findUnique({ where: { id: userId }, select: { firstName: true, lastName: true } });
      const userName = user ? `${user.lastName}, ${user.firstName}` : 'Administrator';
      await createAuditLog(prisma, {
        userId,
        userName,
        action: 'remove_employee_from_box',
        entity: 'employee',
        entityId: employeeId,
        entityName: `${updatedEmployee.lastName}, ${updatedEmployee.firstName}`,
        details: {
          yellowBoxId: id,
          description: `${userName} removed employee ${updatedEmployee.firstName} ${updatedEmployee.lastName} from Yellow Box "${box.boxLabel}" (${box.office})`,
        },
      });
    }

    getIO()?.emit('file201Updated');
    getIO()?.emit('employeeUpdated');

    res.json(updatedEmployee);
  } catch (error) {
    console.error('Error removing employee from yellow box:', error);
    res.status(500).json({ error: 'Failed to remove employee from yellow box' });
  }
});

// POST /api/yellow-boxes/:id/employees/bulk - Bulk assign employees to a box
router.post('/:id/employees/bulk', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { employeeIds } = req.body;
    const userId = (req.headers['x-logged-in-user-id'] || req.headers['x-user-id']) as string;

    if (!employeeIds || !Array.isArray(employeeIds)) {
      return res.status(400).json({ error: 'employeeIds array is required' });
    }

    const box = await prisma.yellowBox.findUnique({ where: { id } });
    if (!box) {
      return res.status(404).json({ error: 'Yellow box not found' });
    }

    const updatedCount = await prisma.employee.updateMany({
      where: { id: { in: employeeIds } },
      data: { yellowBoxId: id },
    });

    if (userId) {
      const user = await prisma.user.findUnique({ where: { id: userId }, select: { firstName: true, lastName: true } });
      const userName = user ? `${user.lastName}, ${user.firstName}` : 'Administrator';
      await createAuditLog(prisma, {
        userId,
        userName,
        action: 'bulk_assign_employees_to_box',
        entity: 'yellow_box',
        entityId: id,
        entityName: `${box.office} - ${box.boxLabel}`,
        details: {
          employeeIds,
          description: `${userName} bulk assigned ${employeeIds.length} employees to Yellow Box "${box.boxLabel}" (${box.office})`,
        },
      });
    }

    getIO()?.emit('file201Updated');
    getIO()?.emit('employeeUpdated');

    res.json({ success: true, count: updatedCount.count });
  } catch (error) {
    console.error('Error bulk assigning employees:', error);
    res.status(500).json({ error: 'Failed to bulk assign employees' });
  }
});

// POST /api/yellow-boxes/:id/employees/bulk-remove - Bulk remove employees from a box
router.post('/:id/employees/bulk-remove', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { employeeIds } = req.body;
    const userId = (req.headers['x-logged-in-user-id'] || req.headers['x-user-id']) as string;

    if (!employeeIds || !Array.isArray(employeeIds)) {
      return res.status(400).json({ error: 'employeeIds array is required' });
    }

    const box = await prisma.yellowBox.findUnique({ where: { id } });
    if (!box) {
      return res.status(404).json({ error: 'Yellow box not found' });
    }

    const updatedCount = await prisma.employee.updateMany({
      where: { id: { in: employeeIds }, yellowBoxId: id },
      data: { yellowBoxId: null },
    });

    if (userId) {
      const user = await prisma.user.findUnique({ where: { id: userId }, select: { firstName: true, lastName: true } });
      const userName = user ? `${user.lastName}, ${user.firstName}` : 'Administrator';
      await createAuditLog(prisma, {
        userId,
        userName,
        action: 'bulk_remove_employees_from_box',
        entity: 'yellow_box',
        entityId: id,
        entityName: `${box.office} - ${box.boxLabel}`,
        details: {
          employeeIds,
          description: `${userName} bulk removed ${employeeIds.length} employees from Yellow Box "${box.boxLabel}" (${box.office})`,
        },
      });
    }

    getIO()?.emit('file201Updated');
    getIO()?.emit('employeeUpdated');

    res.json({ success: true, count: updatedCount.count });
  } catch (error) {
    console.error('Error bulk removing employees:', error);
    res.status(500).json({ error: 'Failed to bulk remove employees' });
  }
});

export default router;
