import { createHash } from 'crypto';
import { Store } from '../store';
import { User, RegisterInput, LoginInput, UpdateUserInput } from '../models/user';

function hashPassword(password: string): string {
  return createHash('sha256').update(password).digest('hex');
}

export class UserService {
  private store: Store<User>;

  constructor() {
    this.store = new Store<User>();
  }

  register(input: RegisterInput): User | { error: string } {
    const existing = this.store.findAll().find((u) => u.email === input.email);
    if (existing) {
      return { error: 'Email already registered' };
    }

    const user = this.store.create({
      email: input.email,
      password: hashPassword(input.password),
      name: input.name,
      createdAt: new Date().toISOString(),
    });

    return user;
  }

  login(input: LoginInput): User | { error: string } {
    const user = this.store.findAll().find((u) => u.email === input.email);
    if (!user) {
      return { error: 'Invalid email or password' };
    }

    const hashedPassword = hashPassword(input.password);
    if (user.password !== hashedPassword) {
      return { error: 'Invalid email or password' };
    }

    return user;
  }

  getById(id: string): User | undefined {
    return this.store.findById(id);
  }

  update(id: string, input: UpdateUserInput): User | undefined | { error: string } {
    const existing = this.store.findById(id);
    if (!existing) {
      return undefined;
    }

    if (input.email && input.email !== existing.email) {
      const emailTaken = this.store.findAll().find((u) => u.email === input.email && u.id !== id);
      if (emailTaken) {
        return { error: 'Email already in use' };
      }
    }

    const updateData: Partial<Omit<User, 'id'>> = {};
    if (input.email !== undefined) updateData.email = input.email;
    if (input.name !== undefined) updateData.name = input.name;
    if (input.password !== undefined) updateData.password = hashPassword(input.password);

    return this.store.update(id, updateData);
  }

  delete(id: string): boolean {
    return this.store.delete(id);
  }

  list(): User[] {
    return this.store.findAll();
  }
}

export const userService = new UserService();
