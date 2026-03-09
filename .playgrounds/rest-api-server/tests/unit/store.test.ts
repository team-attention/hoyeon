import { describe, it, expect, beforeEach } from 'vitest';
import { Store } from '../../src/store';

interface User {
  id: string;
  name: string;
  email: string;
}

describe('Store', () => {
  let store: Store<User>;

  beforeEach(() => {
    store = new Store<User>();
  });

  it('create: adds a record and returns it with an id', () => {
    const user = store.create({ name: 'Alice', email: 'alice@example.com' });
    expect(user.id).toBeDefined();
    expect(user.name).toBe('Alice');
    expect(user.email).toBe('alice@example.com');
  });

  it('create: generates unique UUIDs', () => {
    const a = store.create({ name: 'Alice', email: 'a@example.com' });
    const b = store.create({ name: 'Bob', email: 'b@example.com' });
    expect(a.id).not.toBe(b.id);
  });

  it('findById: returns the correct record', () => {
    const user = store.create({ name: 'Alice', email: 'alice@example.com' });
    const found = store.findById(user.id);
    expect(found).toEqual(user);
  });

  it('findById: returns undefined for missing id', () => {
    expect(store.findById('nonexistent')).toBeUndefined();
  });

  it('findAll: returns all records', () => {
    store.create({ name: 'Alice', email: 'alice@example.com' });
    store.create({ name: 'Bob', email: 'bob@example.com' });
    const all = store.findAll();
    expect(all).toHaveLength(2);
  });

  it('findAll: returns empty array when no records', () => {
    expect(store.findAll()).toEqual([]);
  });

  it('update: modifies an existing record', () => {
    const user = store.create({ name: 'Alice', email: 'alice@example.com' });
    const updated = store.update(user.id, { name: 'Alicia' });
    expect(updated).toBeDefined();
    expect(updated!.name).toBe('Alicia');
    expect(updated!.email).toBe('alice@example.com');
    expect(updated!.id).toBe(user.id);
  });

  it('update: returns undefined for missing id', () => {
    expect(store.update('nonexistent', { name: 'X' })).toBeUndefined();
  });

  it('delete: removes an existing record', () => {
    const user = store.create({ name: 'Alice', email: 'alice@example.com' });
    const result = store.delete(user.id);
    expect(result).toBe(true);
    expect(store.findById(user.id)).toBeUndefined();
  });

  it('delete: returns false for missing id', () => {
    expect(store.delete('nonexistent')).toBe(false);
  });
});
