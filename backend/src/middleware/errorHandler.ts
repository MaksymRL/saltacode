import { Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { logger } from '../utils/logger.js';

/**
 * Global error handler middleware.
 * Converte gli errori Prisma e generici in risposte HTTP semantiche.
 * Non espone mai stack trace, nomi di tabelle, percorsi o versioni di librerie.
 */
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  // Log interno completo
  logger.error({
    message: 'Unhandled error',
    error: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
    method: req.method,
    path: req.path,
    requestId: res.getHeader('X-Request-Id'),
  });

  // Errori Prisma → HTTP semantici (senza esporre dettagli DB)
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      // Unique constraint violation
      res.status(409).json({ error: 'Risorsa già esistente.' });
      return;
    }
    if (err.code === 'P2025') {
      // Record not found
      res.status(404).json({ error: 'Risorsa non trovata.' });
      return;
    }
  }

  if (err instanceof Prisma.PrismaClientValidationError) {
    res.status(400).json({ error: 'Dati non validi.' });
    return;
  }

  // Errori HTTP espliciti con statusCode
  if (typeof err === 'object' && err !== null && 'statusCode' in err) {
    const e = err as { statusCode: number; message: string; fields?: string[] };
    res.status(e.statusCode).json({ error: e.message, ...(e.fields ? { fields: e.fields } : {}) });
    return;
  }

  // Fallback generico — nessun dettaglio interno
  res.status(500).json({ error: 'Errore interno del server.' });
}

/** Crea un errore HTTP tipizzato con statusCode. */
export function httpError(statusCode: number, message: string, fields?: string[]): Error & { statusCode: number; fields?: string[] } {
  const err = new Error(message) as Error & { statusCode: number; fields?: string[] };
  err.statusCode = statusCode;
  if (fields) err.fields = fields;
  return err;
}
