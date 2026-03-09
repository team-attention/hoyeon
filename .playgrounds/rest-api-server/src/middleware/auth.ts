import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../services/auth-service';

declare global {
  namespace Express {
    interface Request {
      user?: { userId: string };
    }
  }
}

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized: missing or invalid Authorization header' });
    return;
  }

  const token = authHeader.slice(7);

  try {
    const decoded = verifyToken(token);
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ error: 'Unauthorized: invalid or expired token' });
  }
}
