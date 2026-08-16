import { Router } from 'express';
import { prisma } from '../prisma/client.js';
import { logger } from '../utils/logger.js';

const router = Router();

interface HealthResponse {
  status: 'ok' | 'error';
  timestamp: string;
  uptime: number;
  db: 'connected' | 'unreachable' | 'error';
  version?: string;
  memory?: {
    used: string;
    total: string;
  };
}

/**
 * GET /health
 * 
 * Health check endpoint che verifica:
 * - Stato del server (sempre OK se risponde)
 * - Connettività database
 * - Informazioni di sistema (uptime, memoria)
 * 
 * Risponde entro 2 secondi come richiesto dalle specifiche.
 */
router.get('/', async (req, res) => {
  const startTime = Date.now();
  let dbStatus: 'connected' | 'unreachable' | 'error' = 'unreachable';
  
  try {
    // Test connessione database con timeout di 1.5 secondi
    const dbPromise = prisma.$queryRaw`SELECT 1 as test`;
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Database timeout')), 1500);
    });
    
    await Promise.race([dbPromise, timeoutPromise]);
    dbStatus = 'connected';
  } catch (error) {
    dbStatus = 'unreachable';
    logger.warn('Health check: database unreachable', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
  
  const memoryUsage = process.memoryUsage();
  const response: HealthResponse = {
    status: dbStatus === 'connected' ? 'ok' : 'error',
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
    db: dbStatus,
    version: process.env.npm_package_version || '1.0.0',
    memory: {
      used: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`,
      total: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)}MB`,
    },
  };
  
  const duration = Date.now() - startTime;
  
  // Log health check per monitoraggio
  logger.info('Health check executed', {
    duration,
    dbStatus,
    memoryUsedMB: Math.round(memoryUsage.heapUsed / 1024 / 1024),
    uptimeSeconds: response.uptime,
  });
  
  // Restituisce 503 se database non raggiungibile, altrimenti 200
  const statusCode = dbStatus === 'connected' ? 200 : 503;
  res.status(statusCode).json(response);
});

/**
 * GET /health/ready
 * 
 * Readiness probe per Kubernetes/Docker.
 * Verifica che il servizio sia pronto ad accettare traffic.
 */
router.get('/ready', async (req, res) => {
  try {
    // Verifica connessione database
    await prisma.$queryRaw`SELECT 1`;
    
    res.status(200).json({
      status: 'ready',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(503).json({
      status: 'not ready',
      error: 'Database not available',
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * GET /health/live
 * 
 * Liveness probe per Kubernetes/Docker.
 * Verifica che il processo sia vivo (non controlla dipendenze esterne).
 */
router.get('/live', (req, res) => {
  res.status(200).json({
    status: 'alive',
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
  });
});

export { router as healthRouter };