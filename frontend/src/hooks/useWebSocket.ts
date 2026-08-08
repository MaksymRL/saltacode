import { useEffect, useRef, useCallback } from 'react';

type WsMessage = {
  type: 'TICKET_EMESSO' | 'NUMERO_CHIAMATO' | 'STATO_POSTAZIONE' | 'INITIAL_STATE';
  [key: string]: unknown;
};

interface UseWebSocketOptions {
  onMessage: (msg: WsMessage) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
}

/**
 * Hook per la connessione WebSocket con reconnect automatico (backoff esponenziale).
 * Si connette a /ws?token=<JWT>.
 * Alla riconnessione il server invia INITIAL_STATE.
 */
export function useWebSocket({ onMessage, onConnect, onDisconnect }: UseWebSocketOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  const retryCountRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  const connect = useCallback(() => {
    const token = localStorage.getItem('saltacode_token');
    if (!token) return;

    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const url = `${protocol}://${window.location.host}/ws?token=${encodeURIComponent(token)}`;

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      retryCountRef.current = 0;
      onConnect?.();
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string) as WsMessage;
        onMessage(msg);
      } catch {
        // messaggio non valido — ignora
      }
    };

    ws.onclose = () => {
      if (!mountedRef.current) return;
      onDisconnect?.();

      // Backoff esponenziale: 1s, 2s, 4s, 8s, 16s, 30s max
      const delay = Math.min(1000 * Math.pow(2, retryCountRef.current), 30_000);
      retryCountRef.current += 1;

      retryTimerRef.current = setTimeout(() => {
        if (mountedRef.current) connect();
      }, delay);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [onMessage, onConnect, onDisconnect]);

  useEffect(() => {
    mountedRef.current = true;
    connect();

    return () => {
      mountedRef.current = false;
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      wsRef.current?.close();
    };
  }, [connect]);

  return wsRef;
}
