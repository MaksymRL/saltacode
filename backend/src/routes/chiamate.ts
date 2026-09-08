import { Router, Request, Response, NextFunction } from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import * as queueService from '../services/queueService.js';
import * as wsService from '../services/wsService.js';
import { prisma } from '../prisma/client.js';

const router = Router();

router.use(authenticate);

/**
 * POST /api/chiamate
 * Roles: OPERATORE
 * Body: { servizioId: number, postazione: string }
 * Postazione: 1-2 cifre + lettera opzionale (es. "1", "12", "3A", "12B")
 */
router.post('/', authorize('OPERATORE', 'ADMIN', 'SUPERADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { servizioId, postazione } = req.body as { servizioId?: number; postazione?: string };

    if (!servizioId || !postazione) {
      res.status(400).json({ error: 'Campi obbligatori mancanti.', fields: ['servizioId', 'postazione'] });
      return;
    }

    const posStr = String(postazione).toUpperCase().trim();
    if (!/^\d{1,2}[A-Z]?$/.test(posStr)) {
      res.status(400).json({ error: 'Postazione non valida. Formato: 1-2 cifre + lettera opzionale (es. 1, 12, 3A).' });
      return;
    }

    const result = await queueService.callNext(Number(servizioId), posStr, req.user!.sub);

    if (!result) {
      res.status(200).json({ chiamata: null, message: 'Nessun ticket in attesa per questo servizio.' });
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
 * POST /api/chiamate/recall
 * Roles: OPERATORE
 * Body: { ticketNumero: string, postazione: number }
 * Response: { chiamata: { id, ticketNumero, postazione, timestamp } }
 *
 * Richiama un numero specifico già chiamato in precedenza.
 * Utile per richiamare clienti che non si sono presentati.
 */
router.post('/recall', authorize('OPERATORE', 'ADMIN', 'SUPERADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { ticketNumero, postazione } = req.body as { ticketNumero?: string; postazione?: string };

    if (!ticketNumero || !postazione) {
      res.status(400).json({ error: 'Campi obbligatori mancanti.', fields: ['ticketNumero', 'postazione'] });
      return;
    }

    const posStr = String(postazione).toUpperCase().trim();
    if (!/^\d{1,2}[A-Z]?$/.test(posStr)) {
      res.status(400).json({ error: 'Postazione non valida. Formato: 1-2 cifre + lettera opzionale.' });
      return;
    }

    // Trova il ticket con questo numero
    const ticket = await prisma.ticket.findFirst({
      where: { 
        numero: ticketNumero,
        stato: { in: ['CHIAMATO', 'SERVITO'] } // Solo ticket già chiamati
      },
      include: { 
        servizio: { include: { area: true } }
      },
      orderBy: { emessoPer: 'desc' } // Il più recente se ci sono duplicati
    });

    if (!ticket) {
      res.status(404).json({ error: 'Ticket non trovato o non ancora chiamato.' });
      return;
    }

    // Crea una nuova chiamata per questo ticket
    const chiamata = await prisma.chiamata.create({
      data: { 
        utenteId: req.user!.sub, 
        servizioId: ticket.servizioId, 
        ticketId: ticket.id, 
        postazione: posStr,
      },
    });

    // Broadcast WebSocket per il richiamo
    wsService.broadcastAll(ticket.servizio.areaId, {
      type: 'NUMERO_RICHIAMATO',
      ticket: ticket.numero,
      postazione: posStr,
      servizio: ticket.servizio.nome,
      timestamp: new Date().toISOString(),
    });

    res.status(201).json({
      chiamata: {
        id: chiamata.id,
        ticketNumero: ticket.numero,
        postazione: posStr,
        timestamp: chiamata.timestamp.toISOString(),
      },
    });
  } catch (err: any) {
    next(err);
  }
});

/**
 * DELETE /api/chiamate/:id
 * Roles: OPERATORE
 * Annulla l'ultima chiamata, rimette il ticket in testa alla coda (stato ATTESA)
 */
router.delete('/:id', authorize('OPERATORE', 'ADMIN', 'SUPERADMIN'), async (req: Request, res: Response, next: NextFunction) => {
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
