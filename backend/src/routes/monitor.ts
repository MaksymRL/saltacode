import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../prisma/client.js';
import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';

const router = Router();

/**
 * GET /api/monitor/token
 * Pubblico — restituisce un JWT con ruolo MONITOR per la connessione WebSocket
 * del display pubblico (TV/schermo). Il token non ha scadenza e viene rigenerato
 * ad ogni chiamata (non serve gestione logout).
 */
router.get('/token', (_req: Request, res: Response) => {
  const token = jwt.sign(
    { sub: 0, username: 'monitor', ruolo: 'MONITOR', aree: [] },
    config.jwt.secret,
    { expiresIn: '24h' }
  );
  res.json({ token });
});

/**
 * GET /api/monitor/stato
 * Pubblico (nessuna autenticazione richiesta)
 * Response: {
 *   ultimiChiamati: [{ ticket, postazione, servizio, timestamp }],
 *   code: [{ servizioId, nomeServizio, areaId, nomeArea, count }]
 * }
 */
router.get('/stato', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    // Ultimi 10 numeri chiamati
    const ultimiChiamati = await prisma.chiamata.findMany({
      orderBy: { timestamp: 'desc' },
      take: 10,
      include: {
        servizio: { select: { nome: true } },
      },
    });

    // Lunghezza corrente di ogni coda
    const code = await prisma.ticket.groupBy({
      by: ['servizioId'],
      where: { stato: 'ATTESA' },
      _count: { _all: true },
    });

    // Arricchisci i dati della coda con nome servizio e area
    const serviziIds = code.map((c) => c.servizioId);
    const servizi = await prisma.servizio.findMany({
      where: { id: { in: serviziIds } },
      include: { area: { select: { id: true, nome: true } } },
    });
    const serviziMap = new Map(servizi.map((s) => [s.id, s]));

    const codeConDettagli = code.map((c) => {
      const s = serviziMap.get(c.servizioId);
      return {
        servizioId: c.servizioId,
        nomeServizio: s?.nome ?? '',
        areaId: s?.areaId ?? null,
        nomeArea: s?.area?.nome ?? '',
        count: c._count._all,
      };
    });

    res.json({
      ultimiChiamati: ultimiChiamati.map((ch) => ({
        id: ch.id,
        postazione: ch.postazione,
        servizio: ch.servizio.nome,
        timestamp: ch.timestamp.toISOString(),
      })),
      code: codeConDettagli,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/monitor/aree
 * Pubblico
 * Lista delle aree attive con i loro servizi (per il monitor display)
 */
router.get('/aree', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const aree = await prisma.area.findMany({
      where: { attiva: true },
      include: {
        servizi: {
          where: { attivo: true },
          select: { id: true, nome: true, lettera: true },
        },
      },
      orderBy: { nome: 'asc' },
    });
    res.json(aree);
  } catch (err) {
    next(err);
  }
});

export default router;
