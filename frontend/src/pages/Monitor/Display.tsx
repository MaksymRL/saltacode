import { useState, useCallback, useEffect, useRef } from 'react';

interface ChiamataEntry {
  ticket: string;
  servizio: string;
  postazione: number;
  timestamp: string;
}

/**
 * Monitor pubblico (pagina non autenticata) — ottimizzata per grandi schermi/TV
 *
 * Layout:
 * - Sinistra: cronologia ultimi 10 numeri chiamati
 * - Centro: numero corrente in grande
 * - Indicatore connessione WebSocket in basso a destra
 *
 * TTS: annuncia il numero chiamato tramite Web Speech API
 */
export default function MonitorDisplay() {
  const [current, setCurrent] = useState<ChiamataEntry | null>(null);
  const [history, setHistory] = useState<ChiamataEntry[]>([]);
  const [connected, setConnected] = useState(false);
  const [ttsSupported] = useState('speechSynthesis' in window);

  const wsRef = useRef<WebSocket | null>(null);
  const retryCountRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  const announce = useCallback((entry: ChiamataEntry) => {
    if (!('speechSynthesis' in window)) return;
    const text = `Servizio ${entry.servizio}, numero ${entry.ticket.split('').join(' ')}, postazione ${entry.postazione}`;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'it-IT';
    utterance.rate = 0.9;
    window.speechSynthesis.speak(utterance);
  }, []);

  const connect = useCallback(async () => {
    if (!mountedRef.current) return;

    // Ottieni token monitor dal server
    let token: string;
    try {
      const res = await fetch('/api/monitor/token');
      const data = await res.json() as { token: string };
      token = data.token;
    } catch {
      // Riprova dopo un po'
      retryTimerRef.current = setTimeout(() => connect(), 5000);
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const url = `${protocol}://${window.location.host}/ws?token=${encodeURIComponent(token)}`;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      retryCountRef.current = 0;
      setConnected(true);
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string) as { type: string; [key: string]: unknown };

        if (msg.type === 'NUMERO_CHIAMATO') {
          const entry: ChiamataEntry = {
            ticket: msg['ticket'] as string,
            servizio: msg['servizio'] as string,
            postazione: msg['postazione'] as number,
            timestamp: msg['timestamp'] as string,
          };
          setCurrent(entry);
          setHistory((prev) => [entry, ...prev].slice(0, 10));
          announce(entry);
        }

        if (msg.type === 'INITIAL_STATE') {
          const ultimi = (msg['ultimiChiamati'] as ChiamataEntry[] | undefined) ?? [];
          setHistory(ultimi);
          if (ultimi.length > 0) setCurrent(ultimi[0] ?? null);
        }
      } catch {
        // messaggio malformato — ignora
      }
    };

    ws.onclose = () => {
      if (!mountedRef.current) return;
      setConnected(false);
      // Backoff esponenziale: 2s, 4s, 8s … 30s max
      const delay = Math.min(2000 * Math.pow(2, retryCountRef.current), 30_000);
      retryCountRef.current += 1;
      retryTimerRef.current = setTimeout(() => connect(), delay);
    };

    ws.onerror = () => ws.close();
  }, [announce]);

  useEffect(() => {
    mountedRef.current = true;
    connect();
    return () => {
      mountedRef.current = false;
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      wsRef.current?.close();
    };
  }, [connect]);

  return (
    <div style={{ display: 'flex', height: '100vh', background: '#0a0a0a', color: 'white', fontFamily: 'sans-serif', overflow: 'hidden' }}>

      {/* Pannello sinistro — cronologia */}
      <aside style={{ width: 280, background: '#111', padding: 16, overflowY: 'auto', borderRight: '1px solid #1f1f1f', flexShrink: 0 }}>
        <h3 style={{ margin: '0 0 16px', fontSize: 12, textTransform: 'uppercase', letterSpacing: 2, color: '#555' }}>
          Ultimi chiamati
        </h3>
        {history.length === 0 && (
          <p style={{ color: '#333', fontSize: 13 }}>Nessuna chiamata oggi.</p>
        )}
        {history.map((h, i) => (
          <div
            key={i}
            style={{
              padding: '10px 12px',
              marginBottom: 8,
              background: i === 0 ? '#1a1a2e' : '#161616',
              borderRadius: 6,
              borderLeft: `3px solid ${i === 0 ? '#6c63ff' : '#2a2a2a'}`,
              transition: 'background 0.3s',
            }}
          >
            <div style={{ fontSize: 24, fontWeight: 'bold', letterSpacing: 2 }}>{h.ticket}</div>
            <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>{h.servizio}</div>
            <div style={{ fontSize: 11, color: '#555', marginTop: 2 }}>
              Post. {h.postazione} · {new Date(h.timestamp).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </div>
          </div>
        ))}
      </aside>

      {/* Area centrale — numero corrente */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: 32 }}>
        {current ? (
          <>
            <div style={{ fontSize: 13, textTransform: 'uppercase', letterSpacing: 6, color: '#555', marginBottom: 12 }}>
              {current.servizio}
            </div>
            <div style={{
              fontSize: 'clamp(6rem, 22vw, 16rem)',
              fontWeight: 900,
              letterSpacing: '0.05em',
              color: '#6c63ff',
              lineHeight: 1,
              textShadow: '0 0 80px rgba(108,99,255,0.3)',
            }}>
              {current.ticket}
            </div>
            <div style={{ fontSize: 20, color: '#666', marginTop: 20 }}>
              Postazione <strong style={{ color: '#ccc', fontSize: 28 }}>{current.postazione}</strong>
            </div>
          </>
        ) : (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 64, marginBottom: 16 }}>🎫</div>
            <div style={{ fontSize: 20, color: '#333' }}>In attesa di chiamate…</div>
          </div>
        )}
      </main>

      {/* Orologio in alto a destra */}
      <Clock />

      {/* Indicatori stato in basso a destra */}
      <div style={{ position: 'fixed', bottom: 16, right: 16, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
        {!ttsSupported && (
          <div style={{ background: '#f59e0b', color: '#000', padding: '4px 10px', borderRadius: 4, fontSize: 11, fontWeight: 600 }}>
            ⚠ Audio non disponibile
          </div>
        )}
        <div style={{ fontSize: 11, color: connected ? '#22c55e' : '#ef4444', letterSpacing: 1 }}>
          {connected ? '● CONNESSO' : '● RICONNESSIONE…'}
        </div>
      </div>
    </div>
  );
}

/** Orologio in tempo reale in alto a destra */
function Clock() {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div style={{
      position: 'fixed', top: 16, right: 20,
      fontFamily: 'monospace', fontSize: 22, color: '#444', letterSpacing: 2,
    }}>
      {time.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
    </div>
  );
}
