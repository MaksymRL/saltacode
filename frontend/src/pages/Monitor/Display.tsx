import { useState, useCallback, useEffect, useRef } from 'react';

interface ChiamataEntry {
  ticket: string;
  servizio: string;
  postazione: string;
  timestamp: string;
}

export default function MonitorDisplay() {
  const [history, setHistory] = useState<ChiamataEntry[]>([]);
  const [connected, setConnected] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [ttsSupported] = useState('speechSynthesis' in window);
  const [time, setTime] = useState(new Date());

  const wsRef = useRef<WebSocket | null>(null);
  const retryCountRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const audioCtxRef = useRef<AudioContext | null>(null);

  // ── Orologio ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // ── Plim con AudioContext (non disabilitabile) ─────────────────────────────
  const playPlim = useCallback(() => {
    try {
      if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
        audioCtxRef.current = new AudioContext();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') ctx.resume();

      // Due toni brevi (plim plim)
      const playTone = (startTime: number, freq: number, duration: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0, startTime);
        gain.gain.linearRampToValueAtTime(0.6, startTime + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
        osc.start(startTime);
        osc.stop(startTime + duration);
      };

      const now = ctx.currentTime;
      playTone(now,        880, 0.18); // primo plim (La5)
      playTone(now + 0.22, 1047, 0.18); // secondo plim (Do6)
    } catch { /* ignora errori audio */ }
  }, []);

  // ── Coda TTS serializzata ─────────────────────────────────────────────────
  const ttsQueueRef = useRef<string[]>([]);
  const ttsSpeakingRef = useRef(false);

  const ttsProcessQueue = useCallback(() => {
    if (ttsSpeakingRef.current || ttsQueueRef.current.length === 0) return;
    if (!('speechSynthesis' in window)) return;

    const text = ttsQueueRef.current.shift()!;
    ttsSpeakingRef.current = true;

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'it-IT';
    utterance.rate = 0.82;
    utterance.volume = 1.0;
    utterance.pitch = 1.0;

    utterance.onend = () => { ttsSpeakingRef.current = false; setTimeout(ttsProcessQueue, 400); };
    utterance.onerror = () => { ttsSpeakingRef.current = false; setTimeout(ttsProcessQueue, 400); };

    window.speechSynthesis.speak(utterance);
  }, []);

  const announce = useCallback((entry: ChiamataEntry) => {
    // Plim sempre attivo
    playPlim();

    // Voce opzionale (ritardata di 500ms per far suonare il plim prima)
    if (voiceEnabled && 'speechSynthesis' in window) {
      const numeroSolo = entry.ticket.replace(/[A-Za-z]/g, '');
      const numeroSpaced = numeroSolo.split('').join(' ');
      const text = `Numero ${numeroSpaced}, ${entry.servizio}, postazione ${entry.postazione}`;
      if (ttsQueueRef.current.length < 3) {
        // Piccolo delay per far finire il plim
        setTimeout(() => {
          ttsQueueRef.current.push(text);
          ttsProcessQueue();
        }, 500);
      }
    }
  }, [voiceEnabled, playPlim, ttsProcessQueue]);

  // ── WebSocket ─────────────────────────────────────────────────────────────
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
    const ws = new WebSocket(`${protocol}://${window.location.host}/ws?token=${encodeURIComponent(token)}`);
    wsRef.current = ws;

    ws.onopen = () => { retryCountRef.current = 0; setConnected(true); };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string) as { type: string; [key: string]: unknown };
        if (msg.type === 'NUMERO_CHIAMATO' || msg.type === 'NUMERO_RICHIAMATO') {
          const entry: ChiamataEntry = {
            ticket: msg['ticket'] as string,
            servizio: msg['servizio'] as string,
            postazione: String(msg['postazione']),
            timestamp: msg['timestamp'] as string,
          };
          setHistory((prev) => [entry, ...prev].slice(0, 20));
          announce(entry);
        }
        if (msg.type === 'INITIAL_STATE') {
          const ultimi = (msg['ultimiChiamati'] as ChiamataEntry[] | undefined) ?? [];
          setHistory(ultimi.map(u => ({ ...u, postazione: String(u.postazione) })).slice(0, 20));
        }
      } catch { /* ignora */ }
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
      audioCtxRef.current?.close();
    };
  }, [connect]);

  const current = history[0] ?? null;
  const prev1 = history[1] ?? null;
  const prev2 = history[2] ?? null;

  // Data e ora corrette con toLocaleString (usa il locale del browser)
  const timeStr = time.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const dateStr = time.toLocaleDateString('it-IT', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });

  return (
    <div style={S.root}>

      {/* ── HEADER ── */}
      <div style={S.header}>
        <div style={S.headerLogo}>
          <span style={{ fontSize: 24, marginRight: 8 }}>🎫</span>
          <span style={S.headerTitle}>SALTACODE</span>
          <span style={S.headerSub}>Sistema Gestione Code</span>
        </div>
        <div style={S.headerClock}>
          <div style={S.clockTime}>{timeStr}</div>
          <div style={S.clockDate}>{dateStr}</div>
        </div>
      </div>

      {/* ── BODY ── */}
      <div style={S.body}>

        {/* ── SINISTRA ── */}
        <div style={S.leftPanel}>

          {/* Box numero corrente */}
          <div style={S.currentBox}>
            <div style={S.currentLabel}>NUMERO IN SERVIZIO</div>
            {current ? (
              <>
                {/* Servizio: piccolo */}
                <div style={S.currentService}>{current.servizio}</div>
                {/* Ticket: enorme */}
                <div style={S.currentTicket}>{current.ticket}</div>
                {/* Postazione: grande */}
                <div style={S.currentPost}>Postazione {current.postazione}</div>
              </>
            ) : (
              <div style={S.currentEmpty}>In attesa…</div>
            )}
          </div>

          <div style={S.prevDivider}>PRECEDENTI</div>

          {/* Ultimi 2 */}
          <div style={S.prevRow}>
            {[prev1, prev2].map((entry, i) => (
              <div key={i} style={{ ...S.prevBox, opacity: entry ? 1 : 0.2, borderColor: i === 0 ? '#2ecc71' : '#3498db' }}>
                {entry ? (
                  <>
                    <div style={{ ...S.prevService, color: i === 0 ? '#2ecc71' : '#3498db' }}>{entry.servizio}</div>
                    <div style={{ ...S.prevTicket, color: i === 0 ? '#2ecc71' : '#3498db' }}>{entry.ticket}</div>
                    <div style={S.prevPost}>Post. {entry.postazione}</div>
                  </>
                ) : <div style={{ color: '#555', fontSize: 24 }}>—</div>}
              </div>
            ))}
          </div>
        </div>

        <div style={S.divider} />

        {/* ── DESTRA: cronologia ── */}
        <div style={S.rightPanel}>
          <div style={S.tableTitle}>CRONOLOGIA CHIAMATE</div>
          <table style={S.table}>
            <thead>
              <tr>
                <th style={{ ...S.th, textAlign: 'left' }}>SERVIZIO</th>
                <th style={S.th}>N°</th>
                <th style={S.th}>POST.</th>
                <th style={{ ...S.th, textAlign: 'right' }}>ORA</th>
              </tr>
            </thead>
            <tbody>
              {history.slice(0, 15).map((entry, i) => (
                <tr key={i} style={{ background: i === 0 ? 'rgba(231,76,60,0.12)' : i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.04)' }}>
                  <td style={{ ...S.td, textAlign: 'left', color: rowColor(i) }}>{entry.servizio}</td>
                  <td style={{ ...S.td, fontWeight: 800, color: rowColor(i) }}>{entry.ticket}</td>
                  <td style={{ ...S.td, color: '#aaa' }}>{entry.postazione}</td>
                  <td style={{ ...S.td, textAlign: 'right', color: '#888', fontSize: 16 }}>
                    {new Date(entry.timestamp).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}
                  </td>
                </tr>
              ))}
              {Array.from({ length: Math.max(0, 15 - history.length) }, (_, i) => (
                <tr key={`e${i}`} style={{ background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.04)' }}>
                  <td style={S.td}>&nbsp;</td><td style={S.td}>&nbsp;</td>
                  <td style={S.td}>&nbsp;</td><td style={S.td}>&nbsp;</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── FOOTER ── */}
      <div style={S.footer}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            width: 10, height: 10, borderRadius: '50%', display: 'inline-block',
            background: connected ? '#2ecc71' : '#e74c3c',
            boxShadow: connected ? '0 0 8px #2ecc71' : '0 0 8px #e74c3c',
          }} />
          <span style={{ fontSize: 13, color: '#aaa' }}>{connected ? 'Connesso' : 'Riconnessione…'}</span>
        </div>

        {/* Controllo voce — il plim è sempre attivo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {!ttsSupported && (
            <span style={{ fontSize: 12, color: '#f59e0b' }}>⚠ TTS non supportato</span>
          )}
          {ttsSupported && (
            <button
              onClick={() => setVoiceEnabled((v) => !v)}
              style={{
                background: voiceEnabled ? 'rgba(39,174,96,0.2)' : 'rgba(231,76,60,0.2)',
                border: `1px solid ${voiceEnabled ? '#27ae60' : '#e74c3c'}`,
                color: voiceEnabled ? '#2ecc71' : '#e74c3c',
                borderRadius: 6, padding: '4px 12px',
                fontSize: 12, fontWeight: 700, cursor: 'pointer',
              }}
              title="Il plim è sempre attivo. Questo pulsante controlla solo l'annuncio vocale."
            >
              {voiceEnabled ? '🔊 Voce ON' : '🔇 Voce OFF'}
            </button>
          )}
          <span style={{ fontSize: 11, color: '#444' }}>🔔 Plim sempre attivo</span>
        </div>

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

const S: Record<string, React.CSSProperties> = {
  root: {
    display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw',
    background: '#0f0f1a', fontFamily: "'Tahoma','Helvetica Neue',sans-serif",
    overflow: 'hidden', color: 'white', userSelect: 'none',
  },
  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '10px 30px',
    background: 'linear-gradient(90deg,#1a1a2e,#16213e)',
    borderBottom: '2px solid #e74c3c', flexShrink: 0,
  },
  headerLogo: { display: 'flex', alignItems: 'center', gap: 4 },
  headerTitle: { fontSize: 26, fontWeight: 900, letterSpacing: 4, color: '#e74c3c' },
  headerSub: { fontSize: 13, color: '#888', marginLeft: 14, letterSpacing: 1, alignSelf: 'flex-end', paddingBottom: 2 },
  headerClock: { textAlign: 'right' },
  clockTime: { fontSize: 32, fontWeight: 900, fontFamily: 'monospace', letterSpacing: 2, color: 'white' },
  clockDate: { fontSize: 13, color: '#888', textTransform: 'capitalize' },
  body: { display: 'flex', flex: 1, overflow: 'hidden' },
  leftPanel: {
    width: '62%', display: 'flex', flexDirection: 'column',
    padding: '20px 30px', gap: 12,
  },
  currentBox: {
    flex: 1, display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center',
    background: 'linear-gradient(135deg,#1a1a2e,#16213e)',
    border: '2px solid rgba(231,76,60,0.4)', borderRadius: 12,
    padding: '20px 30px', textAlign: 'center',
  },
  currentLabel: {
    fontSize: 14, fontWeight: 700, letterSpacing: 4, color: '#e74c3c',
    marginBottom: 8, borderBottom: '1px solid rgba(231,76,60,0.3)',
    paddingBottom: 8, width: '100%',
  },
  // Servizio: più piccolo
  currentService: {
    fontSize: 28, fontWeight: 600, color: '#94a3b8',
    marginBottom: 4, lineHeight: 1.2, textTransform: 'uppercase',
  },
  // Ticket: enorme rosso
  currentTicket: {
    fontSize: 140, fontWeight: 900, color: '#e74c3c',
    lineHeight: 1, letterSpacing: 4,
    textShadow: '0 0 40px rgba(231,76,60,0.5)',
  },
  // Postazione: grande bianca
  currentPost: {
    fontSize: 42, color: 'white', marginTop: 8, fontWeight: 800, letterSpacing: 2,
  },
  currentEmpty: { fontSize: 40, color: '#333', fontStyle: 'italic' },
  prevDivider: { fontSize: 11, fontWeight: 700, letterSpacing: 4, color: '#333', textAlign: 'center' },
  prevRow: { display: 'flex', gap: 16, flexShrink: 0 },
  prevBox: {
    flex: 1, padding: '12px 16px', borderRadius: 10, border: '2px solid',
    background: 'rgba(255,255,255,0.03)', textAlign: 'center',
    display: 'flex', flexDirection: 'column', gap: 2,
  },
  prevService: { fontSize: 14, fontWeight: 600, color: '#888' },
  prevTicket: { fontSize: 48, fontWeight: 900, letterSpacing: 2 },
  prevPost: { fontSize: 16, color: '#888', fontWeight: 700 },
  divider: { width: 2, background: 'rgba(255,255,255,0.06)', flexShrink: 0 },
  rightPanel: { flex: 1, display: 'flex', flexDirection: 'column', padding: '20px 24px', overflow: 'hidden' },
  tableTitle: { fontSize: 12, fontWeight: 700, letterSpacing: 4, color: '#444', marginBottom: 10, textAlign: 'center' },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: {
    fontSize: 12, fontWeight: 700, color: '#555', padding: '6px 10px', textAlign: 'center',
    borderBottom: '1px solid rgba(255,255,255,0.08)', letterSpacing: 1,
  },
  td: {
    fontSize: 20, fontWeight: 600, color: '#ccc', padding: '5px 10px', textAlign: 'center',
    borderBottom: '1px solid rgba(255,255,255,0.05)',
  },
  footer: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '8px 30px', background: '#0a0a14',
    borderTop: '1px solid rgba(255,255,255,0.06)', flexShrink: 0,
  },
};
