import { z } from 'zod';
import { BaseRecord } from '../store';

export interface User extends BaseRecord {
  id: string;
  email: string;
  password: string;
  name: string;
  createdAt: string;
}

export const UserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  password: z.string().min(1),
  name: z.string().min(1),
  createdAt: z.string(),
});

export const RegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  name: z.string().min(1),
});

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const UpdateUserSchema = z.object({
  email: z.string().email().optional(),
  password: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
});

export type RegisterInput = z.infer<typeof RegisterSchema>;
export type LoginInput = z.infer<typeof LoginSchema>;
export type UpdateUserInput = z.infer<typeof UpdateUserSchema>;
