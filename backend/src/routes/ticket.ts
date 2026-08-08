import { Router, Request, Response, NextFunction } from 'express';
import { authenticate, authorize } from '../middleware/auth.js';

const router = Router();

router.use(authenticate);

/**
 * POST /api/ticket
 * Roles: ACCOGLIENZA
 * Body: { servizioId: number }
 * Response: { ticket: { id, numero, emessoPer, stato }, pdfUrl: string }
 *
 * Logica:
 * 1. Verifica che il servizio esista, sia attivo e la sua area sia attiva
 * 2. Incrementa atomicamente il ContatoreGiornaliero (SELECT FOR UPDATE in transazione)
 * 3. Genera il numero nel formato prefisso+lettera+progressivo (es. AA001)
 * 4. Salva il Ticket nel DB
 * 5. Genera il PDF A5 e restituisce l'URL per la stampa
 * 6. Invia evento WebSocket TICKET_EMESSO a tutti i client dell'area
 */
router.post('/', authorize('ACCOGLIENZA'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { servizioId } = req.body as { servizioId?: number };

    if (!servizioId) {
      res.status(400).json({ error: 'Campo obbligatorio mancante.', fields: ['servizioId'] });
      return;
    }

    // TODO: implement ticketService.emit(servizioId, req.user)
    res.status(501).json({ error: 'Not implemented yet.' });
  } catch (err) {
    next(err);
  }
});

export default router;
