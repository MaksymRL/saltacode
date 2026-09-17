import { Router, Request, Response, NextFunction } from 'express';
import { loginRateLimiter, recordFailedAttempt, resetAttempts } from '../middleware/rateLimiter.js';
import { authenticate } from '../middleware/auth.js';
import * as authService from '../services/authService.js';
import { prisma } from '../prisma/client.js';
import * as wsService from '../services/wsService.js';
import { config } from '../config/index.js';
import jwt from 'jsonwebtoken';

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

    // Imposta stato ATTIVO al momento dell'accesso effettivo
    await prisma.utente.update({
      where: { id: result.user.id },
      data: { stato: 'ATTIVO' },
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/auth/logout
 * Imposta lo stato utente a OFFLINE nel DB.
 */
router.post('/logout', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const utenteId = req.user!.sub;

    // Libera le postazioni occupate dall'operatore
    wsService.liberaPostazioniUtente(utenteId);

    // Recupera le aree dell'utente per il broadcast STATO_OPERATORE OFFLINE
    const utente = await prisma.utente.findUnique({
      where: { id: utenteId },
      include: {
        utentiAree: true,
        utentiRuoli: { include: { ruolo: true } },
      },
    });

    await prisma.utente.update({
      where: { id: utenteId },
      data: { stato: 'OFFLINE' },
    });

    // Broadcast STATO_OPERATORE se era un operatore — aggiorna pannello colleghi in real-time
    if (utente) {
      const isOperatore = utente.utentiRuoli.some((ur) => ur.ruolo.nome === 'OPERATORE');
      if (isOperatore) {
        utente.utentiAree.forEach(({ areaId }) => {
          wsService.broadcastAll(areaId, {
            type: 'STATO_OPERATORE',
            utenteId,
            username: utente.username,
            stato: 'DISABILITATO', // usa DISABILITATO come segnale di offline per il frontend
            postazione: null,
            pausaInizio: null,
          });
        });
      }
    }

    res.json({ message: 'Logout effettuato.' });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/auth/switch-role
 * Cambia il ruolo attivo nella sessione corrente senza re-login.
 * Richiede un JWT valido. Il ruolo scelto deve essere tra quelli
 * assegnati all'utente nel DB.
 *
 * Body:  { ruolo: string }
 * Response: { token: string, user: SessionResult['user'] }
 */
router.post('/switch-role', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { ruolo } = req.body as { ruolo?: string };
    if (!ruolo) {
      res.status(400).json({ error: 'Campo ruolo obbligatorio.' });
      return;
    }

    // Usa l'import statico (già importato in cima al file — niente dynamic import)
    const utente = await prisma.utente.findUnique({
      where: { id: req.user!.sub },
      include: {
        utentiAree: true,
        utentiRuoli: { include: { ruolo: true } },
      },
    });

    if (!utente || utente.stato === 'DISABILITATO') {
      res.status(401).json({ error: 'Utente non trovato o disabilitato.' });
      return;
    }

    const ruoliDisponibili = utente.utentiRuoli.map((ur) => ur.ruolo.nome);
    if (!ruoliDisponibili.includes(ruolo)) {
      res.status(403).json({ error: 'Ruolo non disponibile per questo utente.' });
      return;
    }

    const aree = utente.utentiAree.map((ua) => ua.areaId);

    // Libera le postazioni del ruolo precedente (potrebbe cambiare da OPERATORE ad ADMIN)
    wsService.liberaPostazioniUtente(utente.id);

    const token = jwt.sign(
      { sub: utente.id, username: utente.username, ruolo, aree },
      config.jwt.secret,
      { expiresIn: config.jwt.expiresIn }
    );

    res.json({
      token,
      user: {
        id: utente.id,
        username: utente.username,
        cognome: utente.cognome,
        nome: utente.nome,
        ruolo,
        aree,
        mustChangePwd: utente.mustChangePwd,
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
