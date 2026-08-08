import { Router, Request, Response, NextFunction } from 'express';
import { authenticate, authorize } from '../middleware/auth.js';

const router = Router();

// Tutte le route richiedono autenticazione
router.use(authenticate);

/**
 * GET /api/aree
 * Roles: SUPERADMIN
 * Lista tutte le aree con statistiche (servizi attivi, operatori attivi, ticket oggi)
 */
router.get('/', authorize('SUPERADMIN'), async (_req: Request, res: Response, next: NextFunction) => {
  try {
    // TODO: implement areeService.findAll()
    res.status(501).json({ error: 'Not implemented yet.' });
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

    // TODO: implement areeService.create(nome, prefisso)
    res.status(501).json({ error: 'Not implemented yet.' });
  } catch (err) {
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

    // TODO: implement areeService.update(id, req.body)
    res.status(501).json({ error: 'Not implemented yet.' });
  } catch (err) {
    next(err);
  }
});

export default router;
