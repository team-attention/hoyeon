import express, { Request, Response, NextFunction } from 'express';
import { healthRouter } from './routes/health-routes';
import { userRouter } from './routes/user-routes';
import { errorHandler } from './middleware/error-handler';
import { logger } from './logger';

const app = express();

// 1. JSON body parser
app.use(express.json());

// 2. Request logging middleware
app.use((req: Request, _res: Response, next: NextFunction): void => {
  logger.info('Incoming request', { method: req.method, url: req.url });
  next();
});

// 3. Routes
app.use('/', healthRouter);
app.use('/users', userRouter);

// 4. Error handler (must be last)
app.use(errorHandler);

export { app };
