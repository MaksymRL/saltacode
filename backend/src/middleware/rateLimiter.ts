import { Request, Response, NextFunction } from 'express';
import { config } from '../config/index.js';

interface AttemptRecord {
  count: number;
  firstAttemptAt: number;
  blockedUntil?: number;
}

// In-memory store (da sostituire con Redis in produzione multi-processo)
const attempts = new Map<string, AttemptRecord>();

/**
 * Rate limiter per il login.
 * Blocca l'utente per 15 minuti dopo 5 tentativi falliti in 10 minuti.
 * Resetta il contatore al primo tentativo riuscito (chiamare resetAttempts()).
 */
export function loginRateLimiter(req: Request, res: Response, next: NextFunction): void {
  const username = (req.body as { username?: string }).username ?? req.ip ?? 'unknown';
  const now = Date.now();
  const { maxAttempts, windowMinutes, blockMinutes } = config.rateLimiter;
  const windowMs = windowMinutes * 60 * 1000;
  const blockMs = blockMinutes * 60 * 1000;

  const record = attempts.get(username);

  if (record?.blockedUntil) {
    if (now < record.blockedUntil) {
      const retryAfterSec = Math.ceil((record.blockedUntil - now) / 1000);
      res
        .status(429)
        .setHeader('Retry-After', String(retryAfterSec))
        .json({ error: `Troppi tentativi. Riprova tra ${retryAfterSec} secondi.` });
      return;
    }
    // Blocco scaduto: reset
    attempts.delete(username);
  }

  next();
}

/** Incrementa il contatore falliti. Da chiamare dopo un login fallito. */
export function recordFailedAttempt(username: string): void {
  const now = Date.now();
  const { maxAttempts, windowMinutes, blockMinutes } = config.rateLimiter;

  // Se blockMinutes è 0, non bloccare mai
  if (blockMinutes === 0) return;

  const windowMs = windowMinutes * 60 * 1000;
  const blockMs = blockMinutes * 60 * 1000;

  const record = attempts.get(username);

  if (!record || now - record.firstAttemptAt > windowMs) {
    attempts.set(username, { count: 1, firstAttemptAt: now });
    return;
  }

  record.count += 1;

  if (record.count >= maxAttempts) {
    record.blockedUntil = now + blockMs;
  }

  attempts.set(username, record);
}

/** Resetta il contatore dopo un login riuscito. */
export function resetAttempts(username: string): void {
  attempts.delete(username);
}
