import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';

export interface JwtPayload {
  sub: number;
  username: string;
  ruolo: string;        // ruolo attivo in questa sessione
  aree: number[];
  ruoli?: string[];     // solo nel pending token (fase 1 login)
  iat?: number;
  exp?: number;
}

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

/**
 * Middleware di verifica JWT.
 * - Blocca i pending token (ruolo='__PENDING__') — non sono validi per le route normali.
 * - Attacca req.user se il token è definitivo e valido.
 * - Se scade tra meno di refreshThresholdMinutes, aggiunge X-Renewed-Token.
 */
export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers['authorization'];

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Token assente' });
    return;
  }

  const token = authHeader.slice(7);

  try {
    const payload = jwt.verify(token, config.jwt.secret) as unknown as JwtPayload;

    // Blocca i pending token: non sono validi per le route normali
    if (payload.ruolo === '__PENDING__') {
      res.status(401).json({ error: 'Sessione non completata: seleziona un ruolo.' });
      return;
    }

    req.user = payload;

    // Auto-refresh
    if (payload.exp) {
      const remainingMin = (payload.exp - Math.floor(Date.now() / 1000)) / 60;
      if (remainingMin < config.jwt.refreshThresholdMinutes) {
        const renewed = jwt.sign(
          { sub: payload.sub, username: payload.username, ruolo: payload.ruolo, aree: payload.aree },
          config.jwt.secret,
          { expiresIn: config.jwt.expiresIn }
        );
        res.setHeader('X-Renewed-Token', renewed);
      }
    }

    next();
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      res.status(401).json({ error: 'Token scaduto' });
    } else {
      res.status(401).json({ error: 'Token non valido' });
    }
  }
}

/** Middleware di autorizzazione per ruolo. */
export function authorize(...ruoli: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user || !ruoli.includes(req.user.ruolo)) {
      res.status(403).json({ error: 'Accesso non autorizzato' });
      return;
    }
    next();
  };
}
