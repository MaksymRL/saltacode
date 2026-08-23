import { Router, Request, Response, NextFunction } from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import { prisma } from '../prisma/client.js';
import * as authService from '../services/authService.js';

const router = Router();

router.use(authenticate);

// ── Helper: includi sempre ruoli e aree ──────────────────────────────────────
const INCLUDE_UTENTE = {
  utentiRuoli: { include: { ruolo: { select: { id: true, nome: true } } } },
  utentiAree: { select: { areaId: true } },
} as const;

function sanitize(u: any) {
  const { passwordHash: _p, ...rest } = u;
  return rest;
}

/**
 * GET /api/utenti
 * SUPERADMIN → tutti; ADMIN → solo utenti nella propria area
 */
router.get('/', authorize('SUPERADMIN', 'ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { ruolo, aree } = req.user!;
    const isSuperAdmin = ruolo === 'SUPERADMIN';

    const utenti = await prisma.utente.findMany({
      where: isSuperAdmin
        ? {}
        : { utentiAree: { some: { areaId: { in: aree } } } },
      include: INCLUDE_UTENTE,
      orderBy: [{ cognome: 'asc' }, { nome: 'asc' }],
    });

    res.json(utenti.map(sanitize));
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/utenti
 * SUPERADMIN → può creare qualsiasi ruolo
 * ADMIN → solo OPERATORE nella propria area
 *
 * Body: { cognome, nome, ruoli: string[], aree: number[] }
 * Response: { ...utente, tempPassword: string }
 */
router.post('/', authorize('SUPERADMIN', 'ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { cognome, nome, ruoli: ruoliRichiesti, aree } = req.body as {
      cognome?: string;
      nome?: string;
      ruoli?: string[];
      aree?: number[];
    };

    const missing: string[] = [];
    if (!cognome) missing.push('cognome');
    if (!nome) missing.push('nome');
    if (!ruoliRichiesti || ruoliRichiesti.length === 0) missing.push('ruoli');
    if (!aree || aree.length === 0) missing.push('aree');
    if (missing.length > 0) {
      res.status(400).json({ error: 'Campi obbligatori mancanti.', fields: missing });
      return;
    }

    const requester = req.user!;

    // ADMIN: può creare ADMIN, ACCOGLIENZA e OPERATORE solo nella propria area
    if (requester.ruolo === 'ADMIN') {
      const ruoliNonConsentiti = ruoliRichiesti!.filter(
        (r) => !['ADMIN', 'ACCOGLIENZA', 'OPERATORE'].includes(r)
      );
      if (ruoliNonConsentiti.length > 0) {
        res.status(403).json({ error: "L'Admin può assegnare solo i ruoli ADMIN, ACCOGLIENZA e OPERATORE." });
        return;
      }
      const areeNonAutorizzate = aree!.filter((a) => !requester.aree.includes(Number(a)));
      if (areeNonAutorizzate.length > 0) {
        res.status(403).json({ error: 'Non autorizzato a creare utenti in queste aree.' });
        return;
      }
    }

    // Verifica che i ruoli richiesti esistano
    const ruoliDB = await prisma.ruolo.findMany({
      where: { nome: { in: ruoliRichiesti } },
    });
    if (ruoliDB.length !== ruoliRichiesti!.length) {
      res.status(400).json({ error: 'Uno o più ruoli non validi.' });
      return;
    }

    // Genera username univoco
    const baseUsername = authService.generateUsername(nome!, cognome!);
    let username = baseUsername;
    let suffix = 2;
    while (await prisma.utente.findUnique({ where: { username } })) {
      username = `${baseUsername}${suffix++}`;
      if (suffix > 999) {
        res.status(409).json({ error: 'Impossibile generare username univoco.' });
        return;
      }
    }

    const tempPassword = authService.generateTempPassword();
    const passwordHash = await authService.hashPassword(tempPassword);

    const utente = await prisma.utente.create({
      data: {
        username,
        cognome: cognome!.trim(),
        nome: nome!.trim(),
        passwordHash,
        mustChangePwd: true,
        stato: 'ATTIVO',
        utentiRuoli: {
          create: ruoliDB.map((r) => ({ ruoloId: r.id })),
        },
        utentiAree: {
          create: aree!.map((areaId) => ({ areaId: Number(areaId) })),
        },
      },
      include: INCLUDE_UTENTE,
    });

    res.status(201).json({ ...sanitize(utente), tempPassword });
  } catch (err: any) {
    if (err?.code === 'P2002') {
      res.status(409).json({ error: 'Username già in uso.' });
      return;
    }
    next(err);
  }
});

/**
 * PATCH /api/utenti/:id
 * SUPERADMIN → qualsiasi utente
 * ADMIN → solo utenti della propria area
 *
 * Body: { cognome?, nome?, stato?, aree?, ruoli?: string[], resetPassword?: true }
 */
router.patch('/:id', authorize('SUPERADMIN', 'ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params['id'] ?? '', 10);
    if (isNaN(id)) {
      res.status(400).json({ error: 'ID non valido.' });
      return;
    }

    const requester = req.user!;

    // ADMIN: solo utenti della propria area
    if (requester.ruolo === 'ADMIN') {
      const target = await prisma.utente.findUnique({
        where: { id },
        include: { utentiAree: true },
      });
      if (!target) {
        res.status(404).json({ error: 'Utente non trovato.' });
        return;
      }
      const targetAree = target.utentiAree.map((ua) => ua.areaId);
      if (!targetAree.some((a) => requester.aree.includes(a))) {
        res.status(403).json({ error: 'Non autorizzato a modificare questo utente.' });
        return;
      }
    }

    const { cognome, nome, stato, aree, ruoli: nuoviRuoli, resetPassword } = req.body as {
      cognome?: string;
      nome?: string;
      stato?: string;
      aree?: number[];
      ruoli?: string[];
      resetPassword?: boolean;
    };

    const data: Record<string, unknown> = {};
    if (cognome !== undefined) data['cognome'] = cognome.trim();
    if (nome !== undefined) data['nome'] = nome.trim();
    if (stato !== undefined) {
      const valid = ['ATTIVO', 'PAUSA', 'DISABILITATO'];
      if (!valid.includes(stato)) {
        res.status(400).json({ error: `Stato non valido. Valori ammessi: ${valid.join(', ')}` });
        return;
      }
      data['stato'] = stato;
    }

    let tempPassword: string | undefined;
    if (resetPassword) {
      tempPassword = authService.generateTempPassword();
      data['passwordHash'] = await authService.hashPassword(tempPassword);
      data['mustChangePwd'] = true;
    }

    const utente = await prisma.$transaction(async (tx) => {
      // Aggiorna aree se fornite
      if (aree !== undefined) {
        await tx.utenteArea.deleteMany({ where: { utenteId: id } });
        await tx.utenteArea.createMany({
          data: aree.map((areaId) => ({ utenteId: id, areaId: Number(areaId) })),
        });
      }

      // Aggiorna ruoli se forniti
      if (nuoviRuoli !== undefined) {
        const ruoliDB = await tx.ruolo.findMany({ where: { nome: { in: nuoviRuoli } } });
        await tx.utenteRuolo.deleteMany({ where: { utenteId: id } });
        await tx.utenteRuolo.createMany({
          data: ruoliDB.map((r) => ({ utenteId: id, ruoloId: r.id })),
        });
      }

      return tx.utente.update({
        where: { id },
        data,
        include: INCLUDE_UTENTE,
      });
    });

    res.json(tempPassword ? { ...sanitize(utente), tempPassword } : sanitize(utente));
  } catch (err: any) {
    if (err?.code === 'P2025') {
      res.status(404).json({ error: 'Utente non trovato.' });
      return;
    }
    next(err);
  }
});

/**
 * POST /api/utenti/change-password
 * Body: { currentPassword: string, newPassword: string }
 */
router.post('/change-password', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user!;
    const { currentPassword, newPassword } = req.body as {
      currentPassword?: string;
      newPassword?: string;
    };

    if (!currentPassword || !newPassword) {
      res.status(400).json({ error: 'Campi obbligatori mancanti.', fields: ['currentPassword', 'newPassword'] });
      return;
    }

    if (!authService.validatePassword(newPassword)) {
      res.status(400).json({
        error: 'La nuova password non rispetta la policy: minimo 10 caratteri, 1 maiuscola, 1 carattere speciale.',
      });
      return;
    }

    const utente = await prisma.utente.findUnique({ where: { id: user.sub } });
    if (!utente) {
      res.status(404).json({ error: 'Utente non trovato.' });
      return;
    }

    const bc = await import('bcrypt');
    const match = await bc.compare(currentPassword, utente.passwordHash);
    if (!match) {
      res.status(401).json({ error: 'Password attuale non corretta.' });
      return;
    }

    const passwordHash = await authService.hashPassword(newPassword);
    await prisma.utente.update({ where: { id: user.sub }, data: { passwordHash, mustChangePwd: false } });

    res.json({ message: 'Password aggiornata con successo.' });
  } catch (err) {
    next(err);
  }
});

export default router;
