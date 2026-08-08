import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';

export interface JwtPayload {
  sub: number;       // utenteId
  username: string;
  ruolo: string;
  aree: number[];    // areaId[] associati all'utente
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
 * Attach req.user se il token è valido; altrimenti 401.
 * Se la scadenza residua è < refreshThresholdMinutes, aggiunge un nuovo token
 * nell'header X-Renewed-Token.
 */
export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers['authorization'];

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Token assente' });
    return;
  }

  const token = authHeader.slice(7);

  try {
    const payload = jwt.verify(token, config.jwt.secret) as JwtPayload;
    req.user = payload;

    // Auto-refresh: se scade tra meno di refreshThresholdMinutes
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
