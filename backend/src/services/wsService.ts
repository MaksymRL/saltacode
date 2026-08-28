import WebSocket from 'ws';

type WsMessage =
  | { type: 'TICKET_EMESSO'; servizioId: number; coda: number }
  | { type: 'NUMERO_CHIAMATO'; ticket: string; postazione: number; servizio: string; timestamp: string }
  | { type: 'NUMERO_RICHIAMATO'; ticket: string; postazione: number; servizio: string; timestamp: string }
  | { type: 'STATO_OPERATORE'; utenteId: number; username: string; stato: 'ATTIVO' | 'PAUSA' | 'DISABILITATO'; postazione?: number | null }
  | { type: 'CODA_AGGIORNATA'; servizioId: number; count: number }
  | { type: 'INITIAL_STATE'; postazioni: PostazioneState[]; code: CodaState[]; ultimiChiamati: ChiamataState[] };

interface PostazioneState {
  utenteId: number;
  username: string;
  postazione: number;
  stato: 'ATTIVO' | 'PAUSA';
}

interface CodaState {
  servizioId: number;
  nomeServizio: string;
  count: number;
}

interface ChiamataState {
  ticket: string;
  postazione: number;
  servizio: string;
  timestamp: string;
}

// Mappa areaId → Set di WebSocket connessi
const rooms = new Map<number, Set<WebSocket>>();

// Set separato per il monitor (nessuna area specifica)
const monitorClients = new Set<WebSocket>();

/** Registra un client in una o più room di area. */
export function joinRoom(areaId: number, ws: WebSocket): void {
  if (!rooms.has(areaId)) rooms.set(areaId, new Set());
  rooms.get(areaId)!.add(ws);
}

/** Registra un client come monitor. */
export function joinMonitor(ws: WebSocket): void {
  monitorClients.add(ws);
}

/** Rimuove un client da tutte le room. */
export function leaveAll(ws: WebSocket): void {
  rooms.forEach((clients) => clients.delete(ws));
  monitorClients.delete(ws);
}

/** Invia un messaggio a tutti i client di una room di area. */
export function broadcast(areaId: number, message: WsMessage): void {
  const clients = rooms.get(areaId);
  if (!clients) return;
  const payload = JSON.stringify(message);
  clients.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(payload);
    }
  });
}

/** Invia un messaggio a tutti i monitor. */
export function broadcastMonitor(message: WsMessage): void {
  const payload = JSON.stringify(message);
  monitorClients.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(payload);
    }
  });
}

/** Invia un messaggio a tutti i client di un'area E ai monitor. */
export function broadcastAll(areaId: number, message: WsMessage): void {
  broadcast(areaId, message);
  broadcastMonitor(message);
}
