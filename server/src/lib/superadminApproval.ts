import crypto from 'crypto';

type SuperadminApproval = {
  userId: string;
  userName: string;
  role: string;
  expiresAt: number;
};

const TOKEN_TTL_MS = 2 * 60 * 1000;
const approvals = new Map<string, SuperadminApproval>();

function cleanupExpiredApprovals() {
  const now = Date.now();
  for (const [token, approval] of approvals.entries()) {
    if (approval.expiresAt <= now) {
      approvals.delete(token);
    }
  }
}

export function issueSuperadminApprovalToken(user: { id: string; firstName: string; lastName: string; role: string }): string {
  cleanupExpiredApprovals();

  const token = crypto.randomUUID();
  approvals.set(token, {
    userId: user.id,
    userName: `${user.lastName}, ${user.firstName}`,
    role: user.role,
    expiresAt: Date.now() + TOKEN_TTL_MS,
  });

  return token;
}

export function consumeSuperadminApprovalToken(token: string): SuperadminApproval | null {
  cleanupExpiredApprovals();

  const approval = approvals.get(token);
  if (!approval) {
    return null;
  }

  approvals.delete(token);

  if (approval.expiresAt <= Date.now()) {
    return null;
  }

  return approval;
}
