import { IncomingMessage, Server } from 'http';
import WebSocket, { WebSocketServer } from 'ws';
import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';
import { JwtPayload } from '../middleware/auth.js';
import * as wsService from '../services/wsService.js';
import { logger } from '../utils/logger.js';
import { prisma } from '../prisma/client.js';

/**
 * Attacca il WebSocket server all'HTTP server esistente.
 * Percorso: /ws?token=<JWT>
 *
 * Al momento della connessione:
 * 1. Valida il token JWT
 * 2. Iscrive il client alle room dell'area
 * 3. Invia INITIAL_STATE con dati reali dal DB
 * 4. Avvia il heartbeat (ping ogni pingIntervalMs, chiude se no pong)
 */
export function attachWebSocketServer(server: Server): void {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    // Estrai token dalla query string
    const url = new URL(req.url ?? '', 'http://localhost');
    const token = url.searchParams.get('token');

    if (!token) {
      ws.close(4401, 'Token assente');
      return;
    }

    let payload: JwtPayload;
    try {
      payload = jwt.verify(token, config.jwt.secret) as unknown as JwtPayload;
    } catch {
      ws.close(4401, 'Token non valido');
      return;
    }

    // Blocca i pending token — non sono validi per WebSocket
    if (payload.ruolo === '__PENDING__') {
      ws.close(4401, 'Token non valido');
      return;
    }

    // Iscrizione alle room
    const isMonitor = payload.ruolo === 'MONITOR';
    if (isMonitor) {
      wsService.joinMonitor(ws);
    } else {
      payload.aree.forEach((areaId) => wsService.joinRoom(areaId, ws));
    }

    logger.info(`WS connected: user=${payload.username} ruolo=${payload.ruolo}`);

    // Invia stato iniziale dal DB
    sendInitialState(ws, payload.aree, isMonitor).catch((err) => {
      logger.error('Errore invio INITIAL_STATE', { error: err });
    });

    // Heartbeat
    let isAlive = true;
    ws.on('pong', () => { isAlive = true; });

    const heartbeat = setInterval(() => {
      if (!isAlive) {
        clearInterval(heartbeat);
        ws.terminate();
        return;
      }
      isAlive = false;
      ws.ping();
    }, config.ws.pingIntervalMs);

    // Cleanup alla disconnessione
    ws.on('close', () => {
      clearInterval(heartbeat);
      wsService.leaveAll(ws);
      logger.info(`WS disconnected: user=${payload.username}`);
    });

    ws.on('error', (err) => {
      logger.error('WebSocket error', { error: err.message, user: payload.username });
    });
  });
}

/**
 * Invia lo stato iniziale al client appena connesso con dati reali dal DB.
 * - postazioni: operatori attivi con la loro postazione e stato
 * - code: lunghezza coda per ogni servizio dell'area
 * - ultimiChiamati: ultimi 10 numeri chiamati (globali per il monitor, per area per gli altri)
 */
async function sendInitialState(ws: WebSocket, aree: number[], isMonitor: boolean): Promise<void> {
  // Ultimi 10 chiamati (per area se non monitor, globali se monitor)
  const ultimiChiamati = await prisma.chiamata.findMany({
    where: isMonitor ? {} : { servizio: { areaId: { in: aree } } },
    orderBy: { timestamp: 'desc' },
    take: 10,
    include: {
      servizio: { select: { nome: true } },
    },
  });

  // Code per area
  const codeRaw = await prisma.ticket.groupBy({
    by: ['servizioId'],
    where: {
      stato: 'ATTESA',
      ...(isMonitor ? {} : { servizio: { areaId: { in: aree } } }),
    },
    _count: { _all: true },
  });

  // Arricchisci con nome servizio
  const serviziIds = codeRaw.map((c) => c.servizioId);
  const servizi = await prisma.servizio.findMany({
    where: { id: { in: serviziIds } },
    select: { id: true, nome: true },
  });
  const serviziMap = new Map(servizi.map((s) => [s.id, s]));

  const code = codeRaw.map((c) => ({
    servizioId: c.servizioId,
    nomeServizio: serviziMap.get(c.servizioId)?.nome ?? '',
    count: c._count._all,
  }));

  const initialState = {
    type: 'INITIAL_STATE' as const,
    postazioni: [], // operatori attivi — esteso in futuro con tabella sessioni
    code,
    ultimiChiamati: ultimiChiamati.map((ch) => ({
      ticket: `#${ch.id}`, // il numero del ticket è nel ticket correlato — usiamo l'id come fallback
      postazione: ch.postazione,
      servizio: ch.servizio.nome,
      timestamp: ch.timestamp.toISOString(),
    })),
  };

  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(initialState));
  }
}
