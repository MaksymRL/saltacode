import http from 'http';
import { createApp } from './app.js';
import { config } from './config/index.js';
import { logger } from './utils/logger.js';
// import { attachWebSocketServer } from './websocket/wsServer.js';

async function main() {
  try {
    // TODO: verificare connessione DB Prisma all'avvio
    // await prisma.$connect();
    // logger.info('Database connected');

    const app = createApp();
    const server = http.createServer(app);

    // Attach WebSocket server (TODO: uncomment dopo aver creato wsServer.ts)
    // attachWebSocketServer(server);

    server.listen(config.port, () => {
      logger.info(`Saltacode backend listening on port ${config.port}`);
      logger.info(`Environment: ${config.nodeEnv}`);
    });

    // Graceful shutdown
    process.on('SIGTERM', async () => {
      logger.info('SIGTERM received, closing server gracefully');
      server.close(async () => {
        // await prisma.$disconnect();
        logger.info('Server closed');
        process.exit(0);
      });
    });
  } catch (err) {
    logger.error('Fatal error during startup', { error: err });
    process.exit(1);
  }
}

main();
