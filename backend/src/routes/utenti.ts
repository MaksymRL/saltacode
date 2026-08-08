import { Router, Request, Response, NextFunction } from 'express';
import { authenticate, authorize } from '../middleware/auth.js';

const router = Router();

router.use(authenticate);

/**
 * GET /api/utenti
 * Roles: SUPERADMIN (tutti), ADMIN (solo della propria area)
 */
router.get('/', authorize('SUPERADMIN', 'ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    // TODO: implement utentiService.findAll(req.user)
    res.status(501).json({ error: 'Not implemented yet.' });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/utenti
 * Roles: SUPERADMIN (Admin, Accoglienza), ADMIN (Operatori della propria area)
 * Body: { cognome, nome, ruoloId, aree: number[] }
 */
router.post('/', authorize('SUPERADMIN', 'ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { cognome, nome, ruoloId, aree } = req.body as {
      cognome?: string;
      nome?: string;
      ruoloId?: number;
      aree?: number[];
    };

    const missing: string[] = [];
    if (!cognome) missing.push('cognome');
    if (!nome) missing.push('nome');
    if (!ruoloId) missing.push('ruoloId');
    if (!aree || aree.length === 0) missing.push('aree');

    if (missing.length > 0) {
      res.status(400).json({ error: 'Campi obbligatori mancanti.', fields: missing });
      return;
    }

    // TODO: implement utentiService.create({ cognome, nome, ruoloId, aree }, req.user)
    res.status(501).json({ error: 'Not implemented yet.' });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/utenti/:id
 * Roles: SUPERADMIN, ADMIN
 * Body: { cognome?, nome?, stato?, aree?, resetPassword?: true }
 */
router.patch('/:id', authorize('SUPERADMIN', 'ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params['id'] ?? '', 10);
    if (isNaN(id)) {
      res.status(400).json({ error: 'ID non valido.' });
      return;
    }

    // TODO: implement utentiService.update(id, req.body, req.user)
    res.status(501).json({ error: 'Not implemented yet.' });
  } catch (err) {
    next(err);
  }
});

export default router;
