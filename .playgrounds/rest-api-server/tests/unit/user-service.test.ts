import { describe, it, expect, beforeEach } from 'vitest';
import { UserService } from '../../src/services/user-service';

describe('UserService', () => {
  let service: UserService;

  beforeEach(() => {
    service = new UserService();
  });

  describe('register', () => {
    it('register: returns user on success', () => {
      const result = service.register({ email: 'alice@example.com', password: 'pass123', name: 'Alice' });
      expect('error' in result).toBe(false);
      if (!('error' in result)) {
        expect(result.id).toBeDefined();
        expect(result.email).toBe('alice@example.com');
        expect(result.name).toBe('Alice');
      }
    });

    it('register: returns error on duplicate email', () => {
      service.register({ email: 'alice@example.com', password: 'pass123', name: 'Alice' });
      const result = service.register({ email: 'alice@example.com', password: 'other', name: 'Alice2' });
      expect('error' in result).toBe(true);
      if ('error' in result) {
        expect(result.error).toBe('Email already registered');
      }
    });

    it('register: hashes the password (does not store plaintext)', () => {
      const result = service.register({ email: 'bob@example.com', password: 'mypassword', name: 'Bob' });
      if (!('error' in result)) {
        expect(result.password).not.toBe('mypassword');
        expect(result.password).toHaveLength(64); // sha256 hex
      }
    });
  });

  describe('login', () => {
    it('login: returns user on correct credentials', () => {
      service.register({ email: 'alice@example.com', password: 'pass123', name: 'Alice' });
      const result = service.login({ email: 'alice@example.com', password: 'pass123' });
      expect('error' in result).toBe(false);
      if (!('error' in result)) {
        expect(result.email).toBe('alice@example.com');
      }
    });

    it('login: returns error on wrong password', () => {
      service.register({ email: 'alice@example.com', password: 'pass123', name: 'Alice' });
      const result = service.login({ email: 'alice@example.com', password: 'wrongpass' });
      expect('error' in result).toBe(true);
      if ('error' in result) {
        expect(result.error).toBe('Invalid email or password');
      }
    });

    it('login: returns error for unknown email', () => {
      const result = service.login({ email: 'nobody@example.com', password: 'pass' });
      expect('error' in result).toBe(true);
    });
  });

  describe('getById', () => {
    it('getById: returns user by id', () => {
      const created = service.register({ email: 'alice@example.com', password: 'pass', name: 'Alice' });
      if (!('error' in created)) {
        const found = service.getById(created.id);
        expect(found).toBeDefined();
        expect(found!.id).toBe(created.id);
      }
    });

    it('getById: returns undefined for missing id', () => {
      expect(service.getById('nonexistent')).toBeUndefined();
    });
  });

  describe('update', () => {
    it('update: updates user name', () => {
      const created = service.register({ email: 'alice@example.com', password: 'pass', name: 'Alice' });
      if (!('error' in created)) {
        const updated = service.update(created.id, { name: 'Alicia' });
        expect(updated).toBeDefined();
        if (updated && !('error' in updated)) {
          expect(updated.name).toBe('Alicia');
        }
      }
    });

    it('update: returns undefined for missing id', () => {
      expect(service.update('nonexistent', { name: 'X' })).toBeUndefined();
    });
  });

  describe('delete', () => {
    it('delete: removes user and returns true', () => {
      const created = service.register({ email: 'alice@example.com', password: 'pass', name: 'Alice' });
      if (!('error' in created)) {
        expect(service.delete(created.id)).toBe(true);
        expect(service.getById(created.id)).toBeUndefined();
      }
    });

    it('delete: returns false for missing id', () => {
      expect(service.delete('nonexistent')).toBe(false);
    });
  });

  describe('list', () => {
    it('list: returns all registered users', () => {
      service.register({ email: 'a@example.com', password: 'pass', name: 'A' });
      service.register({ email: 'b@example.com', password: 'pass', name: 'B' });
      expect(service.list()).toHaveLength(2);
    });

    it('list: returns empty array when no users', () => {
      expect(service.list()).toEqual([]);
    });
  });
});
