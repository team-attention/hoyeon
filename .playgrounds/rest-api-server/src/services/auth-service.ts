import jwt from 'jsonwebtoken';
import { config } from '../config';

export function generateToken(payload: { userId: string }): string {
  return jwt.sign(payload, config.JWT_SECRET, { expiresIn: '24h' });
}

export function verifyToken(token: string): { userId: string } {
  const decoded = jwt.verify(token, config.JWT_SECRET);
  if (typeof decoded === 'object' && decoded !== null && 'userId' in decoded) {
    return { userId: (decoded as { userId: string }).userId };
  }
  throw new Error('Invalid token payload');
}
