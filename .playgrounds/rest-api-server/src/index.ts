import { app } from './app';
import { config } from './config';
import { logger } from './logger';

if (require.main === module) {
  app.listen(config.PORT, () => {
    logger.info('Server started', { port: config.PORT, env: config.NODE_ENV });
  });
}
