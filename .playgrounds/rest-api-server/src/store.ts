export interface BaseRecord {
  id: string;
}

export class Store<T extends BaseRecord> {
  private records: Map<string, T> = new Map();

  create(data: Omit<T, 'id'>): T {
    const id = crypto.randomUUID();
    const record = { ...data, id } as T;
    this.records.set(id, record);
    return record;
  }

  findById(id: string): T | undefined {
    return this.records.get(id);
  }

  findAll(): T[] {
    return Array.from(this.records.values());
  }

  update(id: string, data: Partial<Omit<T, 'id'>>): T | undefined {
    const existing = this.records.get(id);
    if (!existing) {
      return undefined;
    }
    const updated = { ...existing, ...data, id } as T;
    this.records.set(id, updated);
    return updated;
  }

  delete(id: string): boolean {
    return this.records.delete(id);
  }
}
