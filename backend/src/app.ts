import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import { errorHandler } from './middleware/errorHandler.js';
import { logger } from './utils/logger.js';
import { prisma } from './prisma/client.js';

// Routes
import authRoutes from './routes/auth.js';
import areeRoutes from './routes/aree.js';
import utentiRoutes from './routes/utenti.js';
import serviziRoutes from './routes/servizi.js';
import ticketRoutes from './routes/ticket.js';
import chiamateRoutes from './routes/chiamate.js';
import monitorRoutes from './routes/monitor.js';

export function createApp() {
  const app = express();

  // Security middleware
  app.use(helmet());
  app.use(cors({ origin: process.env['CORS_ORIGIN'] ?? '*', credentials: true }));
  app.use(compression());

  // Body parsing
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  // Request logging middleware
  app.use((req, res, next) => {
    const start = Date.now();
    const requestId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    res.setHeader('X-Request-Id', requestId);

    res.on('finish', () => {
      const duration = Date.now() - start;
      logger.info({
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        durationMs: duration,
        requestId,
      });
    });

    next();
  });

  // Health check endpoint (pubblico)
  app.get('/health', async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.status(200).json({ status: 'ok', db: 'connected' });
    } catch (err) {
      logger.error('Health check failed', { error: err });
      res.status(503).json({ status: 'error', db: 'unreachable' });
    }
  });

  // API routes
  app.use('/api/auth', authRoutes);
  app.use('/api/aree', areeRoutes);
  app.use('/api/utenti', utentiRoutes);
  app.use('/api/servizi', serviziRoutes);
  app.use('/api/ticket', ticketRoutes);
  app.use('/api/chiamate', chiamateRoutes);
  app.use('/api/monitor', monitorRoutes);

  // Error handler (deve essere l'ultimo middleware)
  app.use(errorHandler);

  return app;
}
