import { Request, Response, NextFunction } from 'express';
import { AppError } from '../errors';
import { logger } from '../logger';

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof AppError) {
    logger.error(err.message, {
      statusCode: err.statusCode,
      isOperational: err.isOperational,
      stack: err.stack,
    });

    const body: Record<string, unknown> = {
      message: err.message,
      statusCode: err.statusCode,
      ...(process.env.NODE_ENV === 'development' ? { stack: err.stack } : {}),
    };

    res.status(err.statusCode).json({ error: body });
    return;
  }

  // Unexpected / non-operational error
  logger.error('Unexpected error', {
    message: err.message,
    stack: err.stack,
  });

  const body: Record<string, unknown> = {
    message: 'Internal server error',
    statusCode: 500,
    ...(process.env.NODE_ENV === 'development' ? { stack: err.stack } : {}),
  };

  res.status(500).json({ error: body });
}
