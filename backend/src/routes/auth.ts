import { Router, Request, Response, NextFunction } from 'express';
import { loginRateLimiter, recordFailedAttempt, resetAttempts } from '../middleware/rateLimiter.js';
import { authenticate } from '../middleware/auth.js';
// import { authService } from '../services/authService.js';

const router = Router();

/**
 * POST /api/auth/login
 * Body: { username: string, password: string }
 * Response: { token: string, user: { id, username, ruolo, aree } }
 */
router.post('/login', loginRateLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { username, password } = req.body as { username?: string; password?: string };

    if (!username || !password) {
      res.status(400).json({ error: 'Credenziali mancanti.', fields: ['username', 'password'] });
      return;
    }

    // TODO: implement
    // const result = await authService.login(username, password);
    // if (!result) {
    //   recordFailedAttempt(username);
    //   res.status(401).json({ error: 'Credenziali non valide.' });
    //   return;
    // }
    // resetAttempts(username);
    // res.json(result);

    res.status(501).json({ error: 'Not implemented yet.' });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/auth/logout
 * Invalida la sessione JWT lato client (il token rimane valido fino a scadenza —
 * in produzione usare una blacklist Redis).
 */
router.post('/logout', authenticate, (_req: Request, res: Response) => {
  // TODO: aggiungere token a blacklist Redis
  res.json({ message: 'Logout effettuato.' });
});

export default router;
