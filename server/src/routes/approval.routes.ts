import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { issueSuperadminApprovalToken } from '../lib/superadminApproval';
import bcrypt from 'bcryptjs';

const router = Router();

// GET /api/approvals — list all pending requests (superadmin/developer only)
router.get('/', async (req: Request, res: Response) => {
  try {
    const status = (req.query.status as string) || 'pending';
    const requests = await (prisma as any).approvalRequest.findMany({
      where: status === 'all' ? {} : { status },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    res.json(requests);
  } catch (error) {
    console.error('Error fetching approvals:', error);
    res.status(500).json({ error: 'Failed to fetch approvals' });
  }
});

// GET /api/approvals/pending-count — count of pending requests
router.get('/pending-count', async (_req: Request, res: Response) => {
  try {
    const count = await (prisma as any).approvalRequest.count({ where: { status: 'pending' } });
    res.json({ count });
  } catch (error) {
    res.status(500).json({ error: 'Failed to count approvals' });
  }
});

// POST /api/approvals — submit a new approval request
router.post('/', async (req: Request, res: Response) => {
  try {
    const { requestedBy, requestedByName, action, entityType, entityId, entityName, payload } = req.body;

    if (!requestedBy || !action || !entityType || !entityId || !payload) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Check if there's already a pending request for the same entity+action
    const existing = await (prisma as any).approvalRequest.findFirst({
      where: { requestedBy, entityId, action, status: 'pending' },
    });
    if (existing) {
      return res.status(409).json({ error: 'A pending request for this action already exists' });
    }

    const request = await (prisma as any).approvalRequest.create({
      data: {
        requestedBy,
        requestedByName: requestedByName || 'Unknown',
        action,
        entityType,
        entityId,
        entityName: entityName || null,
        payload,
        status: 'pending',
      },
    });

    res.status(201).json(request);
  } catch (error) {
    console.error('Error creating approval request:', error);
    res.status(500).json({ error: 'Failed to create approval request' });
  }
});

// POST /api/approvals/:id/approve — approve and execute the request
router.post('/:id/approve', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { username, password, approverId, approverName } = req.body;

    // Verify superadmin credentials
    const user = await prisma.user.findFirst({ where: { username } });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    if (user.role !== 'superadmin' && user.role !== 'developer') {
      return res.status(403).json({ error: 'Only Super Admin or Developer can approve requests' });
    }

    // Find the pending request
    const approvalReq = await (prisma as any).approvalRequest.findUnique({ where: { id } });
    if (!approvalReq) return res.status(404).json({ error: 'Approval request not found' });
    if (approvalReq.status !== 'pending') return res.status(400).json({ error: 'Request is no longer pending' });

    // Self-approval check
    if (user.id === approvalReq.requestedBy) {
      return res.status(403).json({ error: 'You cannot approve your own request' });
    }

    // Issue a fresh approval token to execute the protected action
    const approvalToken = issueSuperadminApprovalToken({
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
    });

    // Mark as approved
    await (prisma as any).approvalRequest.update({
      where: { id },
      data: {
        status: 'approved',
        approvedBy: user.id,
        approvedByName: `${user.lastName}, ${user.firstName}`,
        resolvedAt: new Date(),
      },
    });

    // Return the token and payload so the frontend can execute the action
    res.json({
      approved: true,
      approvalToken,
      payload: approvalReq.payload,
      action: approvalReq.action,
      entityId: approvalReq.entityId,
      requestedBy: approvalReq.requestedBy,
      requestedByName: approvalReq.requestedByName,
      approverName: `${user.lastName}, ${user.firstName}`,
    });
  } catch (error) {
    console.error('Error approving request:', error);
    res.status(500).json({ error: 'Failed to approve request' });
  }
});

// POST /api/approvals/:id/reject — reject a request
router.post('/:id/reject', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { reason, approverId, approverName } = req.body;

    const approvalReq = await (prisma as any).approvalRequest.findUnique({ where: { id } });
    if (!approvalReq) return res.status(404).json({ error: 'Approval request not found' });
    if (approvalReq.status !== 'pending') return res.status(400).json({ error: 'Request is no longer pending' });

    await (prisma as any).approvalRequest.update({
      where: { id },
      data: {
        status: 'rejected',
        approvedBy: approverId || null,
        approvedByName: approverName || null,
        rejectedReason: reason || 'Rejected by administrator',
        resolvedAt: new Date(),
      },
    });

    res.json({ rejected: true });
  } catch (error) {
    console.error('Error rejecting request:', error);
    res.status(500).json({ error: 'Failed to reject request' });
  }
});

// DELETE /api/approvals/:id — delete a resolved request (developer only)
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await (prisma as any).approvalRequest.delete({ where: { id } });
    res.json({ deleted: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete request' });
  }
});

export default router;
