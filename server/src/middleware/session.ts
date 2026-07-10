import { Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';

export async function validateSession(req: Request, res: Response, next: NextFunction) {
  // Allow login, health check, and password verification without session validation
  const skipPaths = [
    '/api/users/login',
    '/api/health',
    '/api/users/verify-password'
  ];

  const requestUrl = req.originalUrl || req.url || '';

  if (skipPaths.some(p => requestUrl.startsWith(p))) {
    return next();
  }

  const userId = (req.headers['x-logged-in-user-id'] || req.headers['x-user-id']) as string;
  const sessionId = req.headers['x-session-id'] as string;

  if (userId && userId !== 'system') {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { activeSessionId: true }
      });

      if (user && user.activeSessionId && user.activeSessionId !== sessionId) {
        console.warn(`[session] Session mismatch for user ${userId}. Header: ${sessionId}, DB: ${user.activeSessionId}. Rejecting request.`);
        return res.status(401).json({ 
          code: 'CONCURRENT_LOGIN', 
          error: 'Session expired' 
        });
      }
    } catch (error) {
      console.error('[session] Error validating session:', error);
    }
  }

  next();
}
