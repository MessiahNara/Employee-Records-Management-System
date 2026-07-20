import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';

const router = Router();

// GET /api/file201/logs/all — get all borrow logs in the database
router.get('/logs/all', async (req: Request, res: Response) => {
  try {
    const logs = await (prisma as any).file201BorrowLog.findMany({
      include: {
        employee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            middleName: true,
            officeName: true,
            position: true,
            appointmentStatus: true,
            status: true,
            yellowBox: {
              select: {
                office: true
              }
            }
          }
        }
      },
      orderBy: { dateBorrowed: 'desc' },
    });
    res.json(logs);
  } catch (error) {
    console.error('Error fetching all borrow logs:', error);
    res.status(500).json({ error: 'Failed to fetch all borrow logs' });
  }
});

// GET /api/file201/:employeeId/history — get borrow history for an employee
router.get('/:employeeId/history', async (req: Request, res: Response) => {
  try {
    const { employeeId } = req.params;
    const logs = await (prisma as any).file201BorrowLog.findMany({
      where: { employeeId },
      orderBy: { createdAt: 'desc' },
    });
    res.json(logs);
  } catch (error) {
    console.error('Error fetching borrow history:', error);
    res.status(500).json({ error: 'Failed to fetch borrow history' });
  }
});

// GET /api/file201/:employeeId/active — get the current active borrow record
router.get('/:employeeId/active', async (req: Request, res: Response) => {
  try {
    const { employeeId } = req.params;
    const active = await (prisma as any).file201BorrowLog.findFirst({
      where: { employeeId, action: 'borrow', dateReturned: null },
      orderBy: { dateBorrowed: 'desc' },
    });
    res.json(active || null);
  } catch (error) {
    console.error('Error fetching active borrow:', error);
    res.status(500).json({ error: 'Failed to fetch active borrow record' });
  }
});

// POST /api/file201/:employeeId/borrow — record a borrow
router.post('/:employeeId/borrow', async (req: Request, res: Response) => {
  try {
    const { employeeId } = req.params;
    const {
      borrowerName,
      borrowerPosition,
      borrowerOffice,
      purpose,
      expectedReturnDate,
      releasedBy,
    } = req.body;

    if (!borrowerName) {
      return res.status(400).json({ error: 'Borrower name is required' });
    }

    // Check employee exists
    const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
    if (!employee) return res.status(404).json({ error: 'Employee not found' });

    // Check not already borrowed
    const alreadyBorrowed = await (prisma as any).file201BorrowLog.findFirst({
      where: { employeeId, action: 'borrow', dateReturned: null },
    });
    if (alreadyBorrowed) {
      return res.status(409).json({ error: 'This 201 file is already borrowed' });
    }

    // Create borrow log
    const log = await (prisma as any).file201BorrowLog.create({
      data: {
        employeeId,
        action: 'borrow',
        borrowerName,
        borrowerPosition: borrowerPosition || null,
        borrowerOffice: borrowerOffice || null,
        purpose: purpose || null,
        expectedReturnDate: expectedReturnDate ? new Date(expectedReturnDate) : null,
        releasedBy: releasedBy || null,
        dateBorrowed: new Date(),
      },
    });

    // Update employee 201 status
    await prisma.employee.update({
      where: { id: employeeId },
      data: { file201Status: 'Borrowed' },
    });

    res.status(201).json(log);
  } catch (error) {
    console.error('Error recording borrow:', error);
    res.status(500).json({ error: 'Failed to record borrow' });
  }
});

// POST /api/file201/:employeeId/return — record a return
router.post('/:employeeId/return', async (req: Request, res: Response) => {
  try {
    const { employeeId } = req.params;
    const {
      borrowLogId,
      fileCondition,
      remarks,
      returnedByName,
      receivedBy,
    } = req.body;

    // Find the active borrow log
    const whereClause: any = { employeeId, action: 'borrow', dateReturned: null };
    if (borrowLogId) whereClause.id = borrowLogId;

    const activeBorrow = await (prisma as any).file201BorrowLog.findFirst({
      where: whereClause,
      orderBy: { dateBorrowed: 'desc' },
    });

    if (!activeBorrow) {
      return res.status(404).json({ error: 'No active borrow record found for this employee' });
    }

    // Update the borrow log with return details
    const updated = await (prisma as any).file201BorrowLog.update({
      where: { id: activeBorrow.id },
      data: {
        action: 'return',
        dateReturned: new Date(),
        fileCondition: fileCondition || 'Complete',
        remarks: remarks || null,
        returnedByName: returnedByName || null,
        receivedBy: receivedBy || null,
      },
    });

    // Update employee 201 status based on file condition
    const resolvedCondition = fileCondition || 'Complete';
    let newFile201Status: string;
    if (resolvedCondition === 'Damaged') {
      newFile201Status = 'Damaged';
    } else if (resolvedCondition === 'Incomplete') {
      newFile201Status = 'Incomplete';
    } else {
      newFile201Status = 'Available';
    }

    await prisma.employee.update({
      where: { id: employeeId },
      data: { file201Status: newFile201Status },
    });

    res.json(updated);
  } catch (error) {
    console.error('Error recording return:', error);
    res.status(500).json({ error: 'Failed to record return' });
  }
});

// POST /api/file201/:employeeId/update-condition — add a new return log to update the file condition
router.post('/:employeeId/update-condition', async (req: Request, res: Response) => {
  try {
    const { employeeId } = req.params;
    const { returnedByName, receivedBy, fileCondition, remarks } = req.body;

    if (!returnedByName || !receivedBy) {
      return res.status(400).json({ error: 'Returned By and Received By are required' });
    }

    const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
    if (!employee) return res.status(404).json({ error: 'Employee not found' });

    const resolvedCondition = fileCondition || 'Complete';

    // Create a new condition-update log entry
    const newLog = await (prisma as any).file201BorrowLog.create({
      data: {
        employeeId,
        action: 'return',
        dateBorrowed: new Date(),
        dateReturned: new Date(),
        borrowerName: '—',
        fileCondition: resolvedCondition,
        returnedByName: returnedByName.trim(),
        receivedBy: receivedBy.trim(),
        remarks: remarks?.trim() || null,
        releasedBy: null,
      },
    });

    // Derive new status
    let newFile201Status: string;
    if (resolvedCondition === 'Damaged') {
      newFile201Status = 'Damaged';
    } else if (resolvedCondition === 'Incomplete') {
      newFile201Status = 'Incomplete';
    } else {
      newFile201Status = 'Available';
    }

    await prisma.employee.update({
      where: { id: employeeId },
      data: { file201Status: newFile201Status },
    });

    res.json(newLog);
  } catch (error) {
    console.error('Error updating file condition:', error);
    res.status(500).json({ error: 'Failed to update file condition' });
  }
});

// DELETE /api/file201/:employeeId/clear — delete all borrow logs for an employee (developer only)
router.delete('/:employeeId/clear', async (req: Request, res: Response) => {
  try {
    const { employeeId } = req.params;
    await (prisma as any).file201BorrowLog.deleteMany({ where: { employeeId } });
    // Reset status to Available
    await prisma.employee.update({
      where: { id: employeeId },
      data: { file201Status: 'Available' },
    });
    res.json({ message: 'History cleared' });
  } catch (error) {
    console.error('Error clearing borrow history:', error);
    res.status(500).json({ error: 'Failed to clear history' });
  }
});
// POST /api/file201/delete-logs — delete selected borrow logs
router.post('/delete-logs', async (req: Request, res: Response) => {
  try {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'Invalid or empty IDs array' });
    }

    const logs = await (prisma as any).file201BorrowLog.findMany({
      where: { id: { in: ids } },
    });

    await (prisma as any).file201BorrowLog.deleteMany({
      where: { id: { in: ids } },
    });

    for (const log of logs) {
      if (log.action === 'borrow' && !log.dateReturned) {
        const active = await (prisma as any).file201BorrowLog.findFirst({
          where: { employeeId: log.employeeId, action: 'borrow', dateReturned: null },
        });
        if (!active) {
          await prisma.employee.update({
            where: { id: log.employeeId },
            data: { file201Status: 'Available' },
          });
        }
      }
    }

    res.json({ success: true, count: logs.length });
  } catch (error: any) {
    console.error('Error deleting borrow logs:', error);
    res.status(500).json({ error: 'Failed to delete borrow logs', details: error.message });
  }
});

export default router;
