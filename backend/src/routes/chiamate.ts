import { Router, Request, Response, NextFunction } from 'express';
import { authenticate, authorize } from '../middleware/auth.js';

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
 * 2. Verifica che la postazione non sia in pausa
 * 3. Estrae il primo ticket ATTESA dalla coda (ordinato per emessoPer ASC)
 * 4. Salva la Chiamata nel DB
 * 5. Aggiorna lo stato del Ticket a CHIAMATO
 * 6. Invia evento WebSocket NUMERO_CHIAMATO a tutti i client dell'area + Monitor
 */
router.post('/', authorize('OPERATORE'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { servizioId, postazione } = req.body as { servizioId?: number; postazione?: number };

    if (!servizioId || !postazione) {
      res.status(400).json({ error: 'Campi obbligatori mancanti.', fields: ['servizioId', 'postazione'] });
      return;
    }

    // TODO: implement queueService.callNext(servizioId, postazione, req.user)
    res.status(501).json({ error: 'Not implemented yet.' });
  } catch (err) {
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

    // TODO: implement queueService.cancelCall(id, req.user)
    res.status(501).json({ error: 'Not implemented yet.' });
  } catch (err) {
    next(err);
  }
});

export default router;
