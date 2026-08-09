import { Router, Request, Response, NextFunction } from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import * as queueService from '../services/queueService.js';
import { prisma } from '../prisma/client.js';

const router = Router();

router.use(authenticate);

/**
 * POST /api/chiamate
 * Roles: OPERATORE
 * Body: { servizioId: number, postazione: number }
 * Response: { chiamata: { id, ticketNumero, postazione, timestamp } }
 *
 * Logica:
 * 1. Verifica che la postazione sia valida (1-99)
 * 2. Estrae il primo ticket ATTESA dalla coda (ordinato per emessoPer ASC)
 * 3. Salva la Chiamata nel DB
 * 4. Aggiorna lo stato del Ticket a CHIAMATO
 * 5. Invia evento WebSocket NUMERO_CHIAMATO a tutti i client dell'area + Monitor
 */
router.post('/', authorize('OPERATORE'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { servizioId, postazione } = req.body as { servizioId?: number; postazione?: number };

    if (!servizioId || !postazione) {
      res.status(400).json({ error: 'Campi obbligatori mancanti.', fields: ['servizioId', 'postazione'] });
      return;
    }

    const posNum = Number(postazione);
    if (posNum < 1 || posNum > 99) {
      res.status(400).json({ error: 'La postazione deve essere un numero tra 1 e 99.' });
      return;
    }

    const result = await queueService.callNext(Number(servizioId), posNum, req.user!.sub);

    if (!result) {
      res.status(204).json({ message: 'Nessun ticket in attesa per questo servizio.' });
      return;
    }

    res.status(201).json({
      chiamata: {
        id: result.chiamataId,
        ticketNumero: result.ticketNumero,
        postazione: result.postazione,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (err: any) {
    if (err?.message === 'Non autorizzato.') {
      res.status(403).json({ error: err.message });
      return;
    }
    next(err);
  }
});

/**
 * DELETE /api/chiamate/:id
 * Roles: OPERATORE
 * Annulla l'ultima chiamata, rimette il ticket in testa alla coda (stato ATTESA)
 */
router.delete('/:id', authorize('OPERATORE'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params['id'] ?? '', 10);
    if (isNaN(id)) {
      res.status(400).json({ error: 'ID non valido.' });
      return;
    }

    await queueService.cancelCall(id, req.user!.sub);
    res.status(204).send();
  } catch (err: any) {
    if (err?.message === 'Non autorizzato.') {
      res.status(403).json({ error: err.message });
      return;
    }
    if (err?.code === 'P2025') {
      res.status(404).json({ error: 'Chiamata non trovata.' });
      return;
    }
    next(err);
  }
});

/**
 * GET /api/chiamate
 * Roles: ADMIN, OPERATORE
 * Query: ?servizioId=&limit=50
 * Storico chiamate recenti
 */
router.get('/', authorize('SUPERADMIN', 'ADMIN', 'OPERATORE'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const servizioId = req.query['servizioId'] ? parseInt(req.query['servizioId'] as string, 10) : undefined;
    const limit = Math.min(parseInt(req.query['limit'] as string ?? '50', 10), 200);

    const where: Record<string, unknown> = {};
    if (servizioId && !isNaN(servizioId)) where['servizioId'] = servizioId;

    const chiamate = await prisma.chiamata.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      take: limit,
      include: {
        utente: { select: { id: true, username: true, cognome: true, nome: true } },
        servizio: { select: { id: true, nome: true, lettera: true } },
      },
    });

    res.json(chiamate);
  } catch (err) {
    next(err);
  }
});

export default router;
