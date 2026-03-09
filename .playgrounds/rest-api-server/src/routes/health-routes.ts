import { Router, Request, Response } from 'express';
import { config } from '../config';

const router = Router();

const startTime = Date.now();

const API_VERSION = '1.0.0';

router.get('/', (_req: Request, res: Response): void => {
  res.json({
    message: 'Welcome to the REST API Server',
    version: API_VERSION,
    environment: config.NODE_ENV,
  });
});

router.get('/health', (_req: Request, res: Response): void => {
  const uptimeMs = Date.now() - startTime;
  const uptimeSec = Math.floor(uptimeMs / 1000);

  const memUsage = process.memoryUsage();

  res.json({
    status: 'ok',
    uptime: {
      ms: uptimeMs,
      seconds: uptimeSec,
    },
    memory: {
      rss: memUsage.rss,
      heapTotal: memUsage.heapTotal,
      heapUsed: memUsage.heapUsed,
      external: memUsage.external,
    },
    timestamp: new Date().toISOString(),
  });
});

export { router as healthRouter };
