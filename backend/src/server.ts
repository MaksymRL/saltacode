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

    // Reset ticket di giorni precedenti ancora in ATTESA
    await resetTicketVecchi();
    // Pianifica reset automatico ogni giorno a mezzanotte
    scheduleDailyReset();

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

/**
/**
 * A fine giornata marca come SERVITO tutti i ticket rimasti in ATTESA o CHIAMATO.
 * "SERVITO" = la giornata è finita, il ticket è considerato gestito.
 * Viene eseguito all'avvio e a mezzanotte.
 */
async function resetTicketVecchi(): Promise<void> {
  const result = await prisma.$executeRaw`
    UPDATE ticket
    SET stato = 'SERVITO'
    WHERE stato IN ('ATTESA', 'CHIAMATO')
    AND DATE("emessoPer") < CURRENT_DATE
  `;
  if ((result as number) > 0) {
    logger.info(`Reset giornaliero: ${result} ticket chiusi come SERVITO.`);
  }
}

/**
 * Schedula il reset giornaliero a mezzanotte.
 */
function scheduleDailyReset(): void {
  const ora = new Date();
  const mezzanotte = new Date();
  mezzanotte.setHours(24, 0, 30, 0); // 00:00:30 del giorno dopo
  const msAllaReset = mezzanotte.getTime() - ora.getTime();

  setTimeout(async () => {
    await resetTicketVecchi();
    // Ripianifica ogni 24h
    setInterval(resetTicketVecchi, 24 * 60 * 60 * 1000);
  }, msAllaReset);

  logger.info(`Reset giornaliero pianificato tra ${Math.round(msAllaReset / 60000)} minuti.`);
}
