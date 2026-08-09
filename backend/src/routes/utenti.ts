import { Router, Request, Response, NextFunction } from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import { prisma } from '../prisma/client.js';
import * as authService from '../services/authService.js';

const router = Router();

router.use(authenticate);

/**
 * GET /api/utenti
 * Roles: SUPERADMIN (tutti), ADMIN (solo della propria area)
 */
router.get('/', authorize('SUPERADMIN', 'ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user!;
    const isSuperAdmin = user.ruolo === 'SUPERADMIN';

    const utenti = await prisma.utente.findMany({
      where: isSuperAdmin
        ? {}
        : { utentiAree: { some: { areaId: { in: user.aree } } } },
      include: {
        ruolo: { select: { id: true, nome: true } },
        utentiAree: { select: { areaId: true } },
      },
      orderBy: [{ cognome: 'asc' }, { nome: 'asc' }],
    });

    // Non esporre l'hash della password
    const sanitized = utenti.map(({ passwordHash: _p, ...u }) => u);
    res.json(sanitized);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/utenti
 * Roles: SUPERADMIN (Admin, Accoglienza), ADMIN (Operatori della propria area)
 * Body: { cognome, nome, ruoloId, aree: number[] }
 * Response: { ...utente, tempPassword: string }
 */
router.post('/', authorize('SUPERADMIN', 'ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { cognome, nome, ruoloId, aree } = req.body as {
      cognome?: string;
      nome?: string;
      ruoloId?: number;
      aree?: number[];
    };

    const missing: string[] = [];
    if (!cognome) missing.push('cognome');
    if (!nome) missing.push('nome');
    if (!ruoloId) missing.push('ruoloId');
    if (!aree || aree.length === 0) missing.push('aree');

    if (missing.length > 0) {
      res.status(400).json({ error: 'Campi obbligatori mancanti.', fields: missing });
      return;
    }

    // Genera username base
    const baseUsername = authService.generateUsername(nome!, cognome!);

    // Controlla unicità username con suffissi numerici se necessario
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
        ruoloId: Number(ruoloId),
        mustChangePwd: true,
        utentiAree: {
          create: aree!.map((areaId) => ({ areaId: Number(areaId) })),
        },
      },
      include: {
        ruolo: { select: { id: true, nome: true } },
        utentiAree: { select: { areaId: true } },
      },
    });

    const { passwordHash: _p, ...sanitized } = utente;
    res.status(201).json({ ...sanitized, tempPassword });
  } catch (err: any) {
    if (err?.code === 'P2002') {
      res.status(409).json({ error: 'Username già in uso.' });
      return;
    }
    if (err?.code === 'P2003') {
      res.status(400).json({ error: 'Ruolo o area non valido.' });
      return;
    }
    next(err);
  }
});

/**
 * PATCH /api/utenti/:id
 * Roles: SUPERADMIN, ADMIN
 * Body: { cognome?, nome?, stato?, aree?, resetPassword?: true }
 */
router.patch('/:id', authorize('SUPERADMIN', 'ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params['id'] ?? '', 10);
    if (isNaN(id)) {
      res.status(400).json({ error: 'ID non valido.' });
      return;
    }

    const { cognome, nome, stato, aree, resetPassword } = req.body as {
      cognome?: string;
      nome?: string;
      stato?: string;
      aree?: number[];
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

    // Update in transazione se bisogna anche aggiornare le aree
    const utente = await prisma.$transaction(async (tx) => {
      if (aree !== undefined) {
        await tx.utenteArea.deleteMany({ where: { utenteId: id } });
        await tx.utenteArea.createMany({
          data: aree.map((areaId) => ({ utenteId: id, areaId: Number(areaId) })),
        });
      }

      return tx.utente.update({
        where: { id },
        data,
        include: {
          ruolo: { select: { id: true, nome: true } },
          utentiAree: { select: { areaId: true } },
        },
      });
    });

    const { passwordHash: _p, ...sanitized } = utente;
    res.json(tempPassword ? { ...sanitized, tempPassword } : sanitized);
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
 * Roles: tutti (utente autenticato che vuole cambiare la propria password)
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

    const match = await import('bcrypt').then((bc) => bc.compare(currentPassword, utente.passwordHash));
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
