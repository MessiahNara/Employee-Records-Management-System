import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

// Helper middleware/check to see if user has write permissions
const requireAdmin = async (req: Request, res: Response, next: Function) => {
  const userId = req.headers['x-logged-in-user-id'] as string || req.headers['x-user-id'] as string;
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized: User ID not provided' });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });

    if (!user) {
      return res.status(401).json({ error: 'Unauthorized: User not found' });
    }

    if (user.role !== 'superadmin' && user.role !== 'admin' && user.role !== 'developer') {
      return res.status(403).json({ error: 'Forbidden: Only administrators can modify activities' });
    }

    next();
  } catch (error) {
    console.error('Error validating user role:', error);
    res.status(500).json({ error: 'Failed to validate user role' });
  }
};

// GET /api/activities - Retrieve all activities
router.get('/', async (req: Request, res: Response) => {
  try {
    const activities = await prisma.activity.findMany({
      orderBy: { dateFrom: 'desc' },
    });
    res.json(activities);
  } catch (error) {
    console.error('Error fetching activities:', error);
    res.status(500).json({ error: 'Failed to fetch activities' });
  }
});

// POST /api/activities - Create a new activity
router.post('/', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { title, dateFrom, dateTo, timeFrom, timeTo, location, category, description } = req.body;

    if (!title || !dateFrom || !category) {
      return res.status(400).json({ error: 'Title, start date, and category are required' });
    }

    const activity = await prisma.activity.create({
      data: {
        title,
        dateFrom,
        dateTo: dateTo || null,
        timeFrom: timeFrom || null,
        timeTo: timeTo || null,
        location: location || 'N/A',
        category,
        description: description || '',
      },
    });

    res.status(201).json(activity);
  } catch (error) {
    console.error('Error creating activity:', error);
    res.status(500).json({ error: 'Failed to create activity' });
  }
});

// DELETE /api/activities/:id - Delete an activity
router.delete('/:id', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const activity = await prisma.activity.findUnique({
      where: { id },
    });

    if (!activity) {
      return res.status(404).json({ error: 'Activity not found' });
    }

    await prisma.activity.delete({
      where: { id },
    });

    res.json({ message: 'Activity deleted successfully' });
  } catch (error) {
    console.error('Error deleting activity:', error);
    res.status(500).json({ error: 'Failed to delete activity' });
  }
});

export default router;
