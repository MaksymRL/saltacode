import { Router, Request, Response, NextFunction } from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import { prisma } from '../prisma/client.js';

const router = Router();

// Tutte le route richiedono autenticazione
router.use(authenticate);

/**
 * GET /api/aree
 * SUPERADMIN → tutte le aree (attive e non)
 * ADMIN/ACCOGLIENZA/OPERATORE → solo aree attive a cui sono assegnati
 */
router.get('/', authorize('SUPERADMIN', 'ADMIN', 'ACCOGLIENZA', 'OPERATORE'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { ruolo, aree: areeUtente } = req.user!;
    const isSuperAdmin = ruolo === 'SUPERADMIN';

    const aree = await prisma.area.findMany({
      where: isSuperAdmin
        ? {}
        : { attiva: true, id: { in: areeUtente } },
      orderBy: { nome: 'asc' },
      include: {
        _count: { select: { servizi: true, utentiAree: true } },
      },
    });
    res.json(aree);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/aree
 * Roles: SUPERADMIN
 * Body: { nome: string, prefisso: string }
 */
router.post('/', authorize('SUPERADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { nome, prefisso } = req.body as { nome?: string; prefisso?: string };

    if (!nome || !prefisso) {
      res.status(400).json({ error: 'Campi obbligatori mancanti.', fields: ['nome', 'prefisso'] });
      return;
    }

    if (!/^[A-Z]{2}$/.test(prefisso.toUpperCase())) {
      res.status(400).json({ error: 'Il prefisso deve essere esattamente 2 lettere maiuscole.' });
      return;
    }

    const area = await prisma.area.create({
      data: { nome: nome.trim(), prefisso: prefisso.toUpperCase() },
    });

    res.status(201).json(area);
  } catch (err: any) {
    if (err?.code === 'P2002') {
      res.status(409).json({ error: 'Prefisso già in uso.' });
      return;
    }
    next(err);
  }
});

/**
 * PATCH /api/aree/:id
 * Roles: SUPERADMIN
 * Body: { nome?: string, attiva?: boolean }
 */
router.patch('/:id', authorize('SUPERADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params['id'] ?? '', 10);
    if (isNaN(id)) {
      res.status(400).json({ error: 'ID non valido.' });
      return;
    }

    const { nome, attiva } = req.body as { nome?: string; attiva?: boolean };
    const data: Record<string, unknown> = {};
    if (nome !== undefined) data['nome'] = nome.trim();
    if (attiva !== undefined) data['attiva'] = Boolean(attiva);

    const area = await prisma.area.update({ where: { id }, data });
    res.json(area);
  } catch (err: any) {
    if (err?.code === 'P2025') {
      res.status(404).json({ error: 'Area non trovata.' });
      return;
    }
    next(err);
  }
});

export default router;
