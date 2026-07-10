import { Request, Response, NextFunction } from 'express';
import { consumeSuperadminApprovalToken } from '../lib/superadminApproval';

export function requireSuperadminApproval(req: Request, res: Response, next: NextFunction) {
  const approvalToken = (req.headers['x-superadmin-approval-token'] as string) || (req.body?.approvalToken as string);

  if (!approvalToken) {
    return res.status(403).json({ error: 'Super Admin approval is required to update data' });
  }

  const approval = consumeSuperadminApprovalToken(approvalToken);
  if (!approval) {
    return res.status(403).json({ error: 'Invalid or expired Super Admin approval token' });
  }

  if (approval.role !== 'superadmin' && approval.role !== 'developer') {
    return res.status(403).json({ error: 'Only Super Admin or Developer can authorize updates' });
  }

  req.headers['x-authorizing-user-id'] = approval.userId;
  req.headers['x-authorizing-user-name'] = approval.userName;

  next();
}
