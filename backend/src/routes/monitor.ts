import { Router, Request, Response, NextFunction } from 'express';

const router = Router();

/**
 * GET /api/monitor/stato
 * Pubblico (nessuna autenticazione richiesta)
 * Response: Array degli ultimi 10 numeri chiamati, ordinati per timestamp DESC
 * [{ ticket: string, postazione: number, servizio: string, timestamp: string }]
 */
router.get('/stato', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    // TODO: implement monitorService.getUltimiChiamati(10)
    res.status(501).json({ error: 'Not implemented yet.' });
  } catch (err) {
    next(err);
  }
});

export default router;
