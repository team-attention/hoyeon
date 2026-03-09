type LogLevel = 'info' | 'warn' | 'error' | 'debug';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  meta?: Record<string, unknown>;
}

function formatTimestamp(): string {
  return new Date().toISOString();
}

function log(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
  const entry: LogEntry = {
    timestamp: formatTimestamp(),
    level,
    message,
    ...(meta !== undefined ? { meta } : {}),
  };
  const output = JSON.stringify(entry);
  if (level === 'error') {
    console.error(output);
  } else if (level === 'warn') {
    console.warn(output);
  } else {
    console.log(output);
  }
}

export const logger = {
  info(message: string, meta?: Record<string, unknown>): void {
    log('info', message, meta);
  },
  warn(message: string, meta?: Record<string, unknown>): void {
    log('warn', message, meta);
  },
  error(message: string, meta?: Record<string, unknown>): void {
    log('error', message, meta);
  },
  debug(message: string, meta?: Record<string, unknown>): void {
    log('debug', message, meta);
  },
};
