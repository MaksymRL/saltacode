import { Router, Request, Response, NextFunction } from 'express';
import { loginRateLimiter, recordFailedAttempt, resetAttempts } from '../middleware/rateLimiter.js';
import { authenticate } from '../middleware/auth.js';
import * as authService from '../services/authService.js';

const router = Router();

/**
 * POST /api/auth/login
 * Fase 1: verifica credenziali, restituisce pending token + lista ruoli.
 *
 * Body:  { username: string, password: string }
 * Response (ruolo singolo o multiplo):
 *   {
 *     pendingToken: string,
 *     user: { id, username, cognome, nome, ruoli: string[], aree, mustChangePwd }
 *   }
 *
 * Se l'utente ha un solo ruolo il client può chiamare direttamente /select-role
 * senza mostrare la schermata di selezione.
 */
router.post('/login', loginRateLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { username, password } = req.body as { username?: string; password?: string };

    if (!username || !password) {
      res.status(400).json({ error: 'Credenziali mancanti.', fields: ['username', 'password'] });
      return;
    }

    const result = await authService.login(username, password);
    if (!result) {
      recordFailedAttempt(username);
      res.status(401).json({ error: 'Credenziali non valide.' });
      return;
    }

    resetAttempts(username);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/auth/select-role
 * Fase 2: riceve il pending token e il ruolo scelto, emette il JWT definitivo.
 *
 * Body:  { pendingToken: string, ruolo: string }
 * Response: { token: string, user: { id, username, ruolo, aree, mustChangePwd } }
 */
router.post('/select-role', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { pendingToken, ruolo } = req.body as { pendingToken?: string; ruolo?: string };

    if (!pendingToken || !ruolo) {
      res.status(400).json({ error: 'Campi obbligatori mancanti.', fields: ['pendingToken', 'ruolo'] });
      return;
    }

    const result = await authService.selectRole(pendingToken, ruolo);
    if (!result) {
      res.status(401).json({ error: 'Token non valido o ruolo non disponibile.' });
      return;
    }

    res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/auth/logout
 * Invalida la sessione lato client.
 * (In produzione multi-server usare una blacklist Redis)
 */
router.post('/logout', authenticate, (_req: Request, res: Response) => {
  res.json({ message: 'Logout effettuato.' });
});

export default router;
