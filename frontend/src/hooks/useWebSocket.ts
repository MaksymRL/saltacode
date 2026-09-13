import { useEffect, useRef } from 'react';

type WsMessage = {
  type: string;
  [key: string]: unknown;
};

interface UseWebSocketOptions {
  onMessage: (msg: WsMessage) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
}

/**
 * Hook per la connessione WebSocket con reconnect automatico (backoff esponenziale).
 *
 * IMPORTANTE: onMessage viene tenuto in un ref — la connessione NON viene
 * riaperta quando la callback cambia. Questo evita connessioni multiple.
 */
export function useWebSocket({ onMessage, onConnect, onDisconnect }: UseWebSocketOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  const retryCountRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  // Tieni le callback in ref così non causano riconnessioni
  const onMessageRef = useRef(onMessage);
  const onConnectRef = useRef(onConnect);
  const onDisconnectRef = useRef(onDisconnect);

  // Aggiorna i ref ad ogni render senza riconnettere
  onMessageRef.current = onMessage;
  onConnectRef.current = onConnect;
  onDisconnectRef.current = onDisconnect;

  useEffect(() => {
    mountedRef.current = true;

    function connect() {
      const token = localStorage.getItem('saltacode_token');
      if (!token) return;

      const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
      const url = `${protocol}://${window.location.host}/ws?token=${encodeURIComponent(token)}`;

      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        retryCountRef.current = 0;
        onConnectRef.current?.();
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data as string) as WsMessage;
          onMessageRef.current(msg);
        } catch {
          // messaggio non valido — ignora
        }
      };

      ws.onclose = () => {
        if (!mountedRef.current) return;
        onDisconnectRef.current?.();
        const delay = Math.min(1000 * Math.pow(2, retryCountRef.current), 30_000);
        retryCountRef.current += 1;
        retryTimerRef.current = setTimeout(() => {
          if (mountedRef.current) connect();
        }, delay);
      };

      ws.onerror = () => ws.close();
    }

    connect();

    return () => {
      mountedRef.current = false;
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      wsRef.current?.close();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // ← deps vuote: connessione aperta una sola volta per mount

  return wsRef;
}
