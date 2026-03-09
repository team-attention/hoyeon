export interface Config {
  PORT: number;
  JWT_SECRET: string;
  NODE_ENV: 'development' | 'production' | 'test';
}

function loadConfig(): Config {
  const portRaw = process.env.PORT;
  const port = portRaw !== undefined ? parseInt(portRaw, 10) : 3000;

  if (portRaw !== undefined && isNaN(port)) {
    throw new Error(`Invalid PORT value: "${portRaw}". Must be a number.`);
  }

  const jwtSecret = process.env.JWT_SECRET ?? 'default-dev-secret';

  const nodeEnvRaw = process.env.NODE_ENV ?? 'development';
  const validNodeEnvs = ['development', 'production', 'test'] as const;
  if (!validNodeEnvs.includes(nodeEnvRaw as (typeof validNodeEnvs)[number])) {
    throw new Error(
      `Invalid NODE_ENV value: "${nodeEnvRaw}". Must be one of: ${validNodeEnvs.join(', ')}.`
    );
  }
  const nodeEnv = nodeEnvRaw as Config['NODE_ENV'];

  return { PORT: port, JWT_SECRET: jwtSecret, NODE_ENV: nodeEnv };
}

export const config: Config = loadConfig();
