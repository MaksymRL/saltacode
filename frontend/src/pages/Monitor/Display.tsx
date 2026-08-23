import { useState, useCallback, useEffect, useRef } from 'react';

interface ChiamataEntry {
  ticket: string;
  servizio: string;
  postazione: number;
  timestamp: string;
}

/**
 * Monitor pubblico — ottimizzato per TV/schermo grande.
 *
 * Layout:
 * - Header: logo + orologio
 * - Sinistra (65%): numero corrente in enorme + i 2 precedenti
 * - Destra (35%): tabella cronologia ultimi 15
 * - Footer: barra colore con stato connessione
 */
export default function MonitorDisplay() {
  const [history, setHistory] = useState<ChiamataEntry[]>([]);
  const [connected, setConnected] = useState(false);
  const [ttsSupported] = useState('speechSynthesis' in window);
  const [time, setTime] = useState(new Date());

  const wsRef = useRef<WebSocket | null>(null);
  const retryCountRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  // Orologio
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const announce = useCallback((entry: ChiamataEntry) => {
    if (!('speechSynthesis' in window)) return;
    const text = `Servizio ${entry.servizio}, numero ${entry.ticket.split('').join(' ')}, postazione ${entry.postazione}`;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'it-IT';
    utterance.rate = 0.85;
    utterance.pitch = 1;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  }, []);

  const connect = useCallback(async () => {
    if (!mountedRef.current) return;
    let token: string;
    try {
      const res = await fetch('/api/monitor/token');
      const data = await res.json() as { token: string };
      token = data.token;
    } catch {
      retryTimerRef.current = setTimeout(() => connect(), 5000);
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const url = `${protocol}://${window.location.host}/ws?token=${encodeURIComponent(token)}`;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => { retryCountRef.current = 0; setConnected(true); };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string) as { type: string; [key: string]: unknown };
        if (msg.type === 'NUMERO_CHIAMATO' || msg.type === 'NUMERO_RICHIAMATO') {
          const entry: ChiamataEntry = {
            ticket: msg['ticket'] as string,
            servizio: msg['servizio'] as string,
            postazione: msg['postazione'] as number,
            timestamp: msg['timestamp'] as string,
          };
          setHistory((prev) => [entry, ...prev].slice(0, 20));
          if (msg.type === 'NUMERO_CHIAMATO') announce(entry);
        }
        if (msg.type === 'INITIAL_STATE') {
          const ultimi = (msg['ultimiChiamati'] as ChiamataEntry[] | undefined) ?? [];
          setHistory(ultimi.slice(0, 20));
        }
      } catch { /* ignora messaggi malformati */ }
    };

    ws.onclose = () => {
      if (!mountedRef.current) return;
      setConnected(false);
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

  const current = history[0] ?? null;
  const prev1   = history[1] ?? null;
  const prev2   = history[2] ?? null;
  const tableRows = history.slice(0, 15);

  const timeStr = time.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const dateStr = time.toLocaleDateString('it-IT', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });

  return (
    <div style={styles.root}>

      {/* ── HEADER ── */}
      <div style={styles.header}>
        <div style={styles.headerLogo}>
          <span style={{ fontSize: 28, marginRight: 10 }}>🎫</span>
          <span style={styles.headerTitle}>SALTACODE</span>
          <span style={styles.headerSub}>Sistema Gestione Code</span>
        </div>
        <div style={styles.headerClock}>
          <div style={styles.clockTime}>{timeStr}</div>
          <div style={styles.clockDate}>{dateStr}</div>
        </div>
      </div>

      {/* ── BODY ── */}
      <div style={styles.body}>

        {/* ── SINISTRA: numeri chiamati ── */}
        <div style={styles.leftPanel}>

          {/* Numero corrente */}
          <div style={styles.currentBox}>
            <div style={styles.currentLabel}>NUMERO IN SERVIZIO</div>
            {current ? (
              <>
                <div style={styles.currentService}>{current.servizio}</div>
                <div style={styles.currentTicket}>{current.ticket}</div>
                <div style={styles.currentPost}>Postazione {current.postazione}</div>
              </>
            ) : (
              <div style={styles.currentEmpty}>In attesa…</div>
            )}
          </div>

          {/* Divider */}
          <div style={styles.prevDivider}>PRECEDENTI</div>

          {/* Ultimi 2 numeri */}
          <div style={styles.prevRow}>
            {[prev1, prev2].map((entry, i) => (
              <div key={i} style={{
                ...styles.prevBox,
                opacity: entry ? 1 : 0.2,
                borderColor: i === 0 ? '#2ecc71' : '#3498db',
              }}>
                {entry ? (
                  <>
                    <div style={{ ...styles.prevService, color: i === 0 ? '#2ecc71' : '#3498db' }}>{entry.servizio}</div>
                    <div style={{ ...styles.prevTicket, color: i === 0 ? '#2ecc71' : '#3498db' }}>{entry.ticket}</div>
                    <div style={styles.prevPost}>Post. {entry.postazione}</div>
                  </>
                ) : (
                  <div style={{ color: '#555', fontSize: 24 }}>—</div>
                )}
              </div>
            ))}
          </div>

        </div>

        {/* Separatore verticale */}
        <div style={styles.divider} />

        {/* ── DESTRA: cronologia ── */}
        <div style={styles.rightPanel}>
          <div style={styles.tableTitle}>CRONOLOGIA CHIAMATE</div>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={{ ...styles.th, textAlign: 'left' }}>SERVIZIO</th>
                <th style={styles.th}>N°</th>
                <th style={styles.th}>POST.</th>
                <th style={{ ...styles.th, textAlign: 'right' }}>ORA</th>
              </tr>
            </thead>
            <tbody>
              {tableRows.map((entry, i) => (
                <tr key={i} style={{
                  background: i === 0
                    ? 'rgba(231,76,60,0.12)'
                    : i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.04)',
                }}>
                  <td style={{ ...styles.td, textAlign: 'left', color: rowColor(i) }}>{entry.servizio}</td>
                  <td style={{ ...styles.td, fontWeight: 800, color: rowColor(i) }}>{entry.ticket}</td>
                  <td style={{ ...styles.td, color: '#aaa' }}>{entry.postazione}</td>
                  <td style={{ ...styles.td, textAlign: 'right', color: '#888', fontSize: 16 }}>
                    {new Date(entry.timestamp).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}
                  </td>
                </tr>
              ))}
              {/* righe vuote per riempire */}
              {Array.from({ length: Math.max(0, 15 - tableRows.length) }, (_, i) => (
                <tr key={`e${i}`} style={{ background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.04)' }}>
                  <td style={styles.td}>&nbsp;</td>
                  <td style={styles.td}>&nbsp;</td>
                  <td style={styles.td}>&nbsp;</td>
                  <td style={styles.td}>&nbsp;</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

      </div>

      {/* ── FOOTER ── */}
      <div style={styles.footer}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            width: 10, height: 10, borderRadius: '50%',
            background: connected ? '#2ecc71' : '#e74c3c',
            display: 'inline-block',
            boxShadow: connected ? '0 0 8px #2ecc71' : '0 0 8px #e74c3c',
          }} />
          <span style={{ fontSize: 13, color: '#aaa' }}>
            {connected ? 'Connesso' : 'Riconnessione in corso…'}
          </span>
        </div>
        {!ttsSupported && (
          <span style={{ fontSize: 12, color: '#f59e0b' }}>⚠ Annunci audio non disponibili</span>
        )}
        <span style={{ fontSize: 12, color: '#555' }}>Saltacode Queue Management</span>
      </div>

    </div>
  );
}

function rowColor(i: number): string {
  if (i === 0) return '#e74c3c';
  if (i === 1) return '#2ecc71';
  if (i === 2) return '#3498db';
  return '#ccc';
}

// ── Stili inline ─────────────────────────────────────────────────────────────
const styles: Record<string, React.CSSProperties> = {
  root: {
    display: 'flex', flexDirection: 'column',
    height: '100vh', width: '100vw',
    background: '#0f0f1a',
    fontFamily: "'Tahoma', 'Helvetica Neue', sans-serif",
    overflow: 'hidden', color: 'white',
    userSelect: 'none',
  },

  // Header
  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '10px 30px',
    background: 'linear-gradient(90deg, #1a1a2e 0%, #16213e 100%)',
    borderBottom: '2px solid #e74c3c',
    flexShrink: 0,
  },
  headerLogo: { display: 'flex', alignItems: 'center', gap: 4 },
  headerTitle: { fontSize: 26, fontWeight: 900, letterSpacing: 4, color: '#e74c3c' },
  headerSub: { fontSize: 13, color: '#888', marginLeft: 14, letterSpacing: 1, alignSelf: 'flex-end', paddingBottom: 2 },
  headerClock: { textAlign: 'right' },
  clockTime: { fontSize: 32, fontWeight: 900, fontFamily: 'monospace', letterSpacing: 2, color: 'white' },
  clockDate: { fontSize: 13, color: '#888', textTransform: 'capitalize' },

  // Body
  body: {
    display: 'flex', flex: 1, overflow: 'hidden',
  },

  // Pannello sinistro
  leftPanel: {
    width: '62%', display: 'flex', flexDirection: 'column',
    padding: '20px 30px', gap: 12,
  },
  currentBox: {
    flex: 1, display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center',
    background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
    border: '2px solid rgba(231,76,60,0.4)',
    borderRadius: 12,
    padding: '20px 30px',
    textAlign: 'center',
  },
  currentLabel: {
    fontSize: 16, fontWeight: 700, letterSpacing: 4,
    color: '#e74c3c', marginBottom: 12,
    borderBottom: '1px solid rgba(231,76,60,0.3)',
    paddingBottom: 10, width: '100%',
  },
  currentService: {
    fontSize: 52, fontWeight: 700, color: '#fff',
    marginBottom: 4, lineHeight: 1.1,
    textTransform: 'uppercase',
  },
  currentTicket: {
    fontSize: 140, fontWeight: 900, color: '#e74c3c',
    lineHeight: 1, letterSpacing: 4,
    textShadow: '0 0 40px rgba(231,76,60,0.5)',
  },
  currentPost: {
    fontSize: 28, color: '#aaa', marginTop: 8, fontWeight: 600,
  },
  currentEmpty: {
    fontSize: 40, color: '#333', fontStyle: 'italic',
  },

  prevDivider: {
    fontSize: 12, fontWeight: 700, letterSpacing: 4,
    color: '#444', textAlign: 'center',
  },

  prevRow: {
    display: 'flex', gap: 16, flexShrink: 0,
  },
  prevBox: {
    flex: 1, padding: '14px 20px', borderRadius: 10,
    border: '2px solid',
    background: 'rgba(255,255,255,0.03)',
    textAlign: 'center',
    display: 'flex', flexDirection: 'column', gap: 2,
  },
  prevService: { fontSize: 18, fontWeight: 600 },
  prevTicket: { fontSize: 52, fontWeight: 900, letterSpacing: 2 },
  prevPost: { fontSize: 14, color: '#666' },

  // Divisore
  divider: {
    width: 2, background: 'rgba(255,255,255,0.06)', flexShrink: 0,
  },

  // Pannello destro
  rightPanel: {
    flex: 1, display: 'flex', flexDirection: 'column',
    padding: '20px 24px',
    overflow: 'hidden',
  },
  tableTitle: {
    fontSize: 13, fontWeight: 700, letterSpacing: 4,
    color: '#555', marginBottom: 10, textAlign: 'center',
  },
  table: {
    width: '100%', borderCollapse: 'collapse', flex: 1,
  },
  th: {
    fontSize: 14, fontWeight: 700, color: '#555',
    padding: '6px 10px', textAlign: 'center',
    borderBottom: '1px solid rgba(255,255,255,0.08)',
    letterSpacing: 1,
  },
  td: {
    fontSize: 22, fontWeight: 600, color: '#ccc',
    padding: '5px 10px', textAlign: 'center',
    borderBottom: '1px solid rgba(255,255,255,0.05)',
  },

  // Footer
  footer: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '8px 30px',
    background: '#0a0a14',
    borderTop: '1px solid rgba(255,255,255,0.06)',
    flexShrink: 0,
  },
};
