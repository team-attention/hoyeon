import { describe, it, expect } from 'vitest';
import { generateToken, verifyToken } from '../../src/services/auth-service';

describe('AuthService', () => {
  describe('generateToken', () => {
    it('generateToken: returns a non-empty string', () => {
      const token = generateToken({ userId: 'user-123' });
      expect(typeof token).toBe('string');
      expect(token.length).toBeGreaterThan(0);
    });

    it('generateToken: returns a JWT-format string (3 dot-separated parts)', () => {
      const token = generateToken({ userId: 'user-123' });
      const parts = token.split('.');
      expect(parts).toHaveLength(3);
    });
  });

  describe('verifyToken', () => {
    it('verifyToken: round-trip returns correct userId', () => {
      const token = generateToken({ userId: 'user-abc' });
      const payload = verifyToken(token);
      expect(payload.userId).toBe('user-abc');
    });

    it('verifyToken: throws on invalid token', () => {
      expect(() => verifyToken('not.a.valid.token')).toThrow();
    });

    it('verifyToken: throws on tampered token', () => {
      const token = generateToken({ userId: 'user-xyz' });
      const tampered = token.slice(0, -5) + 'XXXXX';
      expect(() => verifyToken(tampered)).toThrow();
    });
  });
});
