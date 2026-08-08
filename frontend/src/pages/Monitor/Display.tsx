import { useState, useCallback } from 'react';
import { useWebSocket } from '../../hooks/useWebSocket';

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
 * - Centro: numero corrente in grande (min 5rem)
 * - Indicatore connessione WebSocket in basso a destra
 *
 * TTS: annuncia il numero chiamato tramite Web Speech API
 */
export default function MonitorDisplay() {
  const [current, setCurrent] = useState<ChiamataEntry | null>(null);
  const [history, setHistory] = useState<ChiamataEntry[]>([]);
  const [connected, setConnected] = useState(false);
  const [ttsSupported] = useState('speechSynthesis' in window);

  const announce = (entry: ChiamataEntry) => {
    if (!('speechSynthesis' in window)) return;
    const text = `Servizio ${entry.servizio}, numero ${entry.ticket.split('').join(' ')}, postazione ${entry.postazione}`;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'it-IT';
    utterance.rate = 0.9;
    window.speechSynthesis.speak(utterance);
  };

  const handleMessage = useCallback((msg: { type: string; [key: string]: unknown }) => {
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
  }, []);

  useWebSocket({
    onMessage: handleMessage,
    onConnect: () => setConnected(true),
    onDisconnect: () => setConnected(false),
  });

  return (
    <div style={{ display: 'flex', height: '100vh', background: '#0a0a0a', color: 'white', fontFamily: 'sans-serif' }}>
      {/* Pannello sinistro — cronologia */}
      <aside style={{ width: 300, background: '#111', padding: 16, overflowY: 'auto', borderRight: '1px solid #333' }}>
        <h3 style={{ margin: '0 0 16px', fontSize: 14, textTransform: 'uppercase', letterSpacing: 2, color: '#888' }}>
          Ultimi chiamati
        </h3>
        {history.map((h, i) => (
          <div
            key={i}
            style={{
              padding: '10px 12px',
              marginBottom: 8,
              background: i === 0 ? '#1a1a2e' : '#1a1a1a',
              borderRadius: 6,
              borderLeft: `3px solid ${i === 0 ? '#6c63ff' : '#333'}`,
            }}
          >
            <div style={{ fontSize: 22, fontWeight: 'bold' }}>{h.ticket}</div>
            <div style={{ fontSize: 12, color: '#aaa' }}>{h.servizio}</div>
            <div style={{ fontSize: 11, color: '#666' }}>
              Postazione {h.postazione} — {new Date(h.timestamp).toLocaleTimeString('it-IT')}
            </div>
          </div>
        ))}
      </aside>

      {/* Area centrale — numero corrente */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
        {current ? (
          <>
            <div style={{ fontSize: 14, textTransform: 'uppercase', letterSpacing: 4, color: '#888', marginBottom: 16 }}>
              {current.servizio}
            </div>
            <div style={{ fontSize: 'clamp(5rem, 20vw, 14rem)', fontWeight: 900, letterSpacing: '0.05em', color: '#6c63ff' }}>
              {current.ticket}
            </div>
            <div style={{ fontSize: 18, color: '#aaa', marginTop: 16 }}>
              Postazione <strong style={{ color: 'white' }}>{current.postazione}</strong>
            </div>
          </>
        ) : (
          <div style={{ fontSize: 24, color: '#444' }}>In attesa di chiamate…</div>
        )}
      </main>

      {/* Indicatori in basso a destra */}
      <div style={{ position: 'fixed', bottom: 16, right: 16, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
        {!ttsSupported && (
          <div style={{ background: '#f59e0b', color: '#000', padding: '6px 12px', borderRadius: 4, fontSize: 12 }}>
            ⚠ Audio non disponibile in questo browser
          </div>
        )}
        <div style={{ fontSize: 12, color: connected ? '#22c55e' : '#ef4444' }}>
          {connected ? '● Connesso' : '● Disconnesso — riconnessione in corso…'}
        </div>
      </div>
    </div>
  );
}
