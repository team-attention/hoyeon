import { Router, Request, Response } from 'express';
import { userService } from '../services/user-service';
import { generateToken } from '../services/auth-service';
import { authMiddleware } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { RegisterSchema, LoginSchema, UpdateUserSchema } from '../models/user';

const router = Router();

// POST /users/register
router.post('/register', validate(RegisterSchema), (req: Request, res: Response): void => {
  const result = userService.register(req.body);

  if ('error' in result) {
    res.status(400).json({ error: result.error });
    return;
  }

  const { password: _password, ...userWithoutPassword } = result;
  const token = generateToken({ userId: result.id });

  res.status(201).json({ user: userWithoutPassword, token });
});

// POST /users/login
router.post('/login', validate(LoginSchema), (req: Request, res: Response): void => {
  const result = userService.login(req.body);

  if ('error' in result) {
    res.status(400).json({ error: result.error });
    return;
  }

  const token = generateToken({ userId: result.id });

  res.status(200).json({ token });
});

// GET /users (auth required)
router.get('/', authMiddleware, (_req: Request, res: Response): void => {
  const users = userService.list();
  const usersWithoutPasswords = users.map(({ password: _password, ...rest }) => rest);

  res.status(200).json({ users: usersWithoutPasswords });
});

// GET /users/:id (auth required)
router.get('/:id', authMiddleware, (req: Request, res: Response): void => {
  const user = userService.getById(req.params.id);

  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  const { password: _password, ...userWithoutPassword } = user;
  res.status(200).json({ user: userWithoutPassword });
});

// PUT /users/:id (auth required)
router.put('/:id', authMiddleware, validate(UpdateUserSchema), (req: Request, res: Response): void => {
  const result = userService.update(req.params.id, req.body);

  if (result === undefined) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  if ('error' in result) {
    res.status(400).json({ error: result.error });
    return;
  }

  const { password: _password, ...userWithoutPassword } = result;
  res.status(200).json({ user: userWithoutPassword });
});

// DELETE /users/:id (auth required)
router.delete('/:id', authMiddleware, (req: Request, res: Response): void => {
  const deleted = userService.delete(req.params.id);

  if (!deleted) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  res.status(200).json({ message: 'User deleted successfully' });
});

export { router as userRouter };
