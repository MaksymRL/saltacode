import { IncomingMessage, Server } from 'http';
import WebSocket, { WebSocketServer } from 'ws';
import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';
import { JwtPayload } from '../middleware/auth.js';
import * as wsService from '../services/wsService.js';
import { logger } from '../utils/logger.js';

/**
 * Attacca il WebSocket server all'HTTP server esistente.
 * Percorso: /ws?token=<JWT>
 *
 * Al momento della connessione:
 * 1. Valida il token JWT
 * 2. Iscrive il client alle room dell'area
 * 3. Invia INITIAL_STATE
 * 4. Avvia il heartbeat (ping ogni 30s, chiude se no pong entro 10s)
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
      payload = jwt.verify(token, config.jwt.secret) as JwtPayload;
    } catch {
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

    // Invia stato iniziale
    sendInitialState(ws, payload.aree);

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
 * Invia lo stato iniziale al client appena connesso.
 * TODO: recuperare lo stato reale da DB tramite Prisma
 */
async function sendInitialState(ws: WebSocket, _aree: number[]): Promise<void> {
  // TODO: recuperare da DB
  // const postazioni = await operatoriService.getPostazioni(aree);
  // const code = await queueService.getCode(aree);
  // const ultimiChiamati = await monitorService.getUltimiChiamati(10);

  const initialState = {
    type: 'INITIAL_STATE' as const,
    postazioni: [],
    code: [],
    ultimiChiamati: [],
  };

  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(initialState));
  }
}
