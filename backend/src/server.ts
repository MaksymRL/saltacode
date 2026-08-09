import './config/index.js'; // carica dotenv prima di tutto
import http from 'http';
import { createApp } from './app.js';
import { config } from './config/index.js';
import { logger } from './utils/logger.js';
import { prisma } from './prisma/client.js';
import { attachWebSocketServer } from './websocket/wsServer.js';

async function main() {
  try {
    // Verifica connessione DB all'avvio (max 30s gestiti da Prisma timeout)
    await prisma.$connect();
    logger.info('Database connected');

    const app = createApp();
    const server = http.createServer(app);

    // Attach WebSocket server
    attachWebSocketServer(server);

    server.listen(config.port, () => {
      logger.info(`Saltacode backend listening on port ${config.port}`);
      logger.info(`Environment: ${config.nodeEnv}`);
      logger.info(`Health check: http://localhost:${config.port}/health`);
    });

    // Graceful shutdown
    process.on('SIGTERM', async () => {
      logger.info('SIGTERM received, closing server gracefully');
      server.close(async () => {
        await prisma.$disconnect();
        logger.info('Server closed');
        process.exit(0);
      });
    });

    process.on('SIGINT', async () => {
      logger.info('SIGINT received, closing server gracefully');
      server.close(async () => {
        await prisma.$disconnect();
        process.exit(0);
      });
    });

  } catch (err) {
    logger.error('Fatal error during startup', { error: err });
    process.exit(1);
  }
}

main();
