import { Router, Request, Response, NextFunction } from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import * as ticketService from '../services/ticketService.js';
import * as pdfService from '../services/pdfService.js';
import { prisma } from '../prisma/client.js';

const router = Router();

router.use(authenticate);

/**
 * POST /api/ticket
 * Roles: ACCOGLIENZA
 * Body: { servizioId: number }
 * Response: { ticket: { id, numero, emessoPer, stato }, pdf: base64 string }
 *
 * Logica:
 * 1. Verifica che il servizio esista, sia attivo e la sua area sia attiva
 * 2. Incrementa atomicamente il ContatoreGiornaliero (transazione)
 * 3. Genera il numero nel formato prefisso+lettera+progressivo (es. AAA001)
 * 4. Salva il Ticket nel DB
 * 5. Genera il PDF A5 come base64
 * 6. Invia evento WebSocket TICKET_EMESSO a tutti i client dell'area
 */
router.post('/', authorize('ACCOGLIENZA'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { servizioId } = req.body as { servizioId?: number };

    if (!servizioId) {
      res.status(400).json({ error: 'Campo obbligatorio mancante.', fields: ['servizioId'] });
      return;
    }

    const operatoreId = req.user!.sub;
    const ticket = await ticketService.emitTicket(Number(servizioId), operatoreId);

    // Recupera il nome del servizio per il PDF
    const servizio = await prisma.servizio.findUnique({
      where: { id: Number(servizioId) },
      select: { nome: true },
    });

    // Genera PDF A5 con il numero del ticket
    const pdfBuffer = await pdfService.generateTicketPdf({
      numero: ticket.numero,
      nomeServizio: servizio?.nome ?? 'Servizio',
      dataOra: ticket.emessoPer,
    });

    res.json({
      ticket: {
        id: ticket.id,
        numero: ticket.numero,
        emessoPer: ticket.emessoPer,
        stato: ticket.stato,
      },
      pdf: pdfBuffer.toString('base64'),
    });
  } catch (err: any) {
    if (err?.message?.includes('non disponibile') || err?.message?.includes('non attiva') || err?.message?.includes('Limite')) {
      res.status(400).json({ error: err.message });
      return;
    }
    next(err);
  }
});

/**
 * GET /api/ticket
 * Roles: ADMIN, ACCOGLIENZA, OPERATORE
 * Query: ?servizioId=&stato=ATTESA|CHIAMATO|SERVITO&limit=50
 * Restituisce la coda attuale per un servizio
 */
router.get('/', authorize('SUPERADMIN', 'ADMIN', 'ACCOGLIENZA', 'OPERATORE'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const servizioId = req.query['servizioId'] ? parseInt(req.query['servizioId'] as string, 10) : undefined;
    const stato = req.query['stato'] as string | undefined;
    const limit = Math.min(parseInt(req.query['limit'] as string ?? '100', 10), 200);

    const where: Record<string, unknown> = {};
    if (servizioId && !isNaN(servizioId)) where['servizioId'] = servizioId;
    if (stato) where['stato'] = stato;

    const ticket = await prisma.ticket.findMany({
      where,
      orderBy: { emessoPer: 'asc' },
      take: limit,
      include: {
        servizio: { select: { id: true, nome: true, lettera: true } },
      },
    });

    res.json(ticket);
  } catch (err) {
    next(err);
  }
});

export default router;
