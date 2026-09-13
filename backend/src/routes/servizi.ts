import { Router, Request, Response, NextFunction } from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import { prisma } from '../prisma/client.js';

const router = Router();

router.use(authenticate);

/**
 * GET /api/servizi
 * Roles: ADMIN, ACCOGLIENZA, OPERATORE
 * Filtrati per area dell'utente autenticato
 */
router.get('/', authorize('SUPERADMIN', 'ADMIN', 'ACCOGLIENZA', 'OPERATORE'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user!;
    const isSuperAdmin = user.ruolo === 'SUPERADMIN';

    // Inizio di oggi (mezzanotte locale → UTC)
    const oggi = new Date();
    oggi.setHours(0, 0, 0, 0);
    const domani = new Date(oggi);
    domani.setDate(domani.getDate() + 1);

    const servizi = await prisma.servizio.findMany({
      where: isSuperAdmin ? {} : { areaId: { in: user.aree } },
      include: {
        area: { select: { id: true, nome: true, prefisso: true } },
        _count: {
          select: {
            ticket: { where: { stato: 'ATTESA' } },
            chiamate: { where: { timestamp: { gte: oggi, lt: domani } } },
          },
        },
      },
      orderBy: [{ area: { nome: 'asc' } }, { nome: 'asc' }],
    });

    res.json(servizi);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/servizi
 * Roles: ADMIN, SUPERADMIN
 * Body: { nome: string, lettera: string, areaId: number }
 */
router.post('/', authorize('SUPERADMIN', 'ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { nome, lettera, areaId } = req.body as {
      nome?: string;
      lettera?: string;
      areaId?: number;
    };

    const missing: string[] = [];
    if (!nome) missing.push('nome');
    if (!lettera) missing.push('lettera');
    if (!areaId) missing.push('areaId');

    if (missing.length > 0) {
      res.status(400).json({ error: 'Campi obbligatori mancanti.', fields: missing });
      return;
    }

    const lettUpper = lettera!.toUpperCase();
    if (!/^[A-Z]$/.test(lettUpper)) {
      res.status(400).json({ error: 'La lettera deve essere un singolo carattere A-Z.' });
      return;
    }

    // ADMIN può creare servizi solo nella propria area
    const user = req.user!;
    if (user.ruolo === 'ADMIN' && !user.aree.includes(Number(areaId))) {
      res.status(403).json({ error: 'Non autorizzato a creare servizi in questa area.' });
      return;
    }

    const servizio = await prisma.servizio.create({
      data: { nome: nome!.trim(), lettera: lettUpper, areaId: Number(areaId) },
      include: { area: { select: { id: true, nome: true, prefisso: true } } },
    });

    res.status(201).json(servizio);
  } catch (err: any) {
    if (err?.code === 'P2002') {
      res.status(409).json({ error: 'Lettera già in uso per questa area.' });
      return;
    }
    if (err?.code === 'P2003') {
      res.status(400).json({ error: 'Area non trovata.' });
      return;
    }
    next(err);
  }
});

/**
 * PATCH /api/servizi/:id
 * Roles: ADMIN, SUPERADMIN
 * Body: { nome?, lettera?, attivo? }
 */
router.patch('/:id', authorize('SUPERADMIN', 'ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params['id'] ?? '', 10);
    if (isNaN(id)) {
      res.status(400).json({ error: 'ID non valido.' });
      return;
    }

    const { nome, lettera, attivo, areaId } = req.body as { nome?: string; lettera?: string; attivo?: boolean; areaId?: number };

    // Verifica permessi area corrente
    const servizioAttuale = await prisma.servizio.findUnique({ where: { id } });
    if (!servizioAttuale) { res.status(404).json({ error: 'Servizio non trovato.' }); return; }

    const user = req.user!;
    if (user.ruolo === 'ADMIN' && !user.aree.includes(servizioAttuale.areaId)) {
      res.status(403).json({ error: 'Non autorizzato a modificare servizi di questa area.' });
      return;
    }

    const data: Record<string, unknown> = {};
    if (nome !== undefined) data['nome'] = nome.trim();
    if (attivo !== undefined) data['attivo'] = Boolean(attivo);
    if (lettera !== undefined) {
      const lettUpper = lettera.toUpperCase();
      if (!/^[A-Z]$/.test(lettUpper)) {
        res.status(400).json({ error: 'La lettera deve essere un singolo carattere A-Z.' });
        return;
      }
      data['lettera'] = lettUpper;
    }
    if (areaId !== undefined) {
      // ADMIN può spostare il servizio solo verso una propria area
      if (user.ruolo === 'ADMIN' && !user.aree.includes(Number(areaId))) {
        res.status(403).json({ error: 'Non autorizzato a spostare il servizio in questa area.' });
        return;
      }
      data['areaId'] = Number(areaId);
    }

    const servizio = await prisma.servizio.update({
      where: { id },
      data,
      include: { area: { select: { id: true, nome: true, prefisso: true } } },
    });

    res.json(servizio);
  } catch (err: any) {
    if (err?.code === 'P2025') {
      res.status(404).json({ error: 'Servizio non trovato.' });
      return;
    }
    if (err?.code === 'P2002') {
      res.status(409).json({ error: 'Lettera già in uso per questa area.' });
      return;
    }
    next(err);
  }
});

/**
 * DELETE /api/servizi/:id
 * Roles: SUPERADMIN, ADMIN
 * ADMIN può eliminare solo servizi della propria area.
 * Elimina anche i ticket ATTESA associati (gli altri stati vengono preservati per storico).
 */
router.delete('/:id', authorize('SUPERADMIN', 'ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params['id'] ?? '', 10);
    if (isNaN(id)) { res.status(400).json({ error: 'ID non valido.' }); return; }

    const servizio = await prisma.servizio.findUnique({ where: { id } });
    if (!servizio) { res.status(404).json({ error: 'Servizio non trovato.' }); return; }

    const user = req.user!;
    if (user.ruolo === 'ADMIN' && !user.aree.includes(servizio.areaId)) {
      res.status(403).json({ error: 'Non autorizzato a eliminare servizi di questa area.' });
      return;
    }

    // Elimina prima i ticket in ATTESA, poi il servizio
    await prisma.$transaction([
      prisma.ticket.deleteMany({ where: { servizioId: id, stato: 'ATTESA' } }),
      prisma.servizio.delete({ where: { id } }),
    ]);

    res.status(204).send();
  } catch (err: any) {
    if (err?.code === 'P2025') { res.status(404).json({ error: 'Servizio non trovato.' }); return; }
    next(err);
  }
});

export default router;
