import { Router, Request, Response, NextFunction } from 'express';
import { authenticate, authorize } from '../middleware/auth.js';

const router = Router();

router.use(authenticate);

/**
 * GET /api/servizi
 * Roles: ADMIN, ACCOGLIENZA, OPERATORE
 * Filtrati per area dell'utente autenticato
 */
router.get('/', authorize('ADMIN', 'ACCOGLIENZA', 'OPERATORE'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    // TODO: implement serviziService.findByArea(req.user.aree)
    res.status(501).json({ error: 'Not implemented yet.' });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/servizi
 * Roles: ADMIN
 * Body: { nome: string, lettera: string, areaId: number }
 */
router.post('/', authorize('ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
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

    // TODO: implement serviziService.create({ nome, lettera, areaId }, req.user)
    res.status(501).json({ error: 'Not implemented yet.' });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/servizi/:id
 * Roles: ADMIN
 * Body: { nome?, lettera?, attivo? }
 */
router.patch('/:id', authorize('ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params['id'] ?? '', 10);
    if (isNaN(id)) {
      res.status(400).json({ error: 'ID non valido.' });
      return;
    }

    // TODO: implement serviziService.update(id, req.body, req.user)
    res.status(501).json({ error: 'Not implemented yet.' });
  } catch (err) {
    next(err);
  }
});

export default router;
