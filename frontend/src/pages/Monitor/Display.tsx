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
  const [ttsSupported] = useState('speechSynthesis' in window);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [voiceConfigLoaded, setVoiceConfigLoaded] = useState(false);
  const [time, setTime] = useState(new Date());
  // audioUnlocked: true dopo il primo click utente — sblocca AudioContext e TTS
  const [audioUnlocked, setAudioUnlocked] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const retryCountRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const femaleVoiceRef = useRef<SpeechSynthesisVoice | null>(null);

  // ── Sblocco audio al click (richiesto dai browser moderni) ───────────────
  const handleUnlockAudio = useCallback(() => {
    // Inizializza AudioContext (richiede gesto utente)
    try {
      if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
        audioCtxRef.current = new AudioContext();
      }
      audioCtxRef.current.resume();
    } catch { /* ignora */ }

    // Pre-carica TTS con utterance silenziosa per sbloccare il browser
    if ('speechSynthesis' in window) {
      const u = new SpeechSynthesisUtterance('');
      u.volume = 0;
      window.speechSynthesis.speak(u);
    }

    setAudioUnlocked(true);

    // Fai un plim di test dopo lo sblocco
    setTimeout(() => {
      try {
        const ctx = audioCtxRef.current!;
        if (ctx.state === 'suspended') ctx.resume();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.type = 'sine'; osc.frequency.value = 880;
        gain.gain.setValueAtTime(0, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
        osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.5);
      } catch { /* ignora */ }
    }, 100);
  }, []);

  // ── Orologio ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // ── Carica configurazione voce dal backend ─────────────────────────────────
  useEffect(() => {
    fetch('/api/monitor/config')
      .then((r) => r.json())
      .then((cfg: { voiceEnabled: boolean }) => {
        setVoiceEnabled(cfg.voiceEnabled);
        setVoiceConfigLoaded(true);
      })
      .catch(() => setVoiceConfigLoaded(true));
  }, []);

  // ── Trova voce femminile italiana ──────────────────────────────────────────
  useEffect(() => {
    if (!('speechSynthesis' in window)) return;
    const findFemale = () => {
      const voices = window.speechSynthesis.getVoices();
      if (voices.length === 0) return;
      // Priorità: voce italiana femminile esplicita, poi italiana, poi prima disponibile
      const itFemale = voices.find((v) =>
        v.lang.startsWith('it') && /female|donna|alice|paola|lisa/i.test(v.name)
      );
      const itAny = voices.find((v) => v.lang.startsWith('it'));
      femaleVoiceRef.current = itFemale ?? itAny ?? voices[0] ?? null;
    };
    findFemale();
    window.speechSynthesis.onvoiceschanged = findFemale;
    return () => { window.speechSynthesis.onvoiceschanged = null; };
  }, []);

  // ── Plim con AudioContext — più lungo e corposo ────────────────────────────
  const playPlim = useCallback(() => {
    if (!audioUnlocked) return; // non suonare finché il browser non è stato sbloccato
    try {
      if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
        audioCtxRef.current = new AudioContext();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') ctx.resume();

      const playTone = (startTime: number, freq: number, dur: number, vol: number = 0.7) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.type = 'sine'; osc.frequency.value = freq;
        gain.gain.setValueAtTime(0, startTime);
        gain.gain.linearRampToValueAtTime(vol, startTime + 0.015);
        // Sustain poi fade out
        gain.gain.setValueAtTime(vol, startTime + dur * 0.6);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + dur);
        osc.start(startTime); osc.stop(startTime + dur + 0.05);
      };

      const now = ctx.currentTime;
      // Primo plim: La5 (880 Hz) — 0.5s
      playTone(now, 880, 0.5, 0.7);
      // Secondo plim: Do6 (1047 Hz) — 0.5s, dopo 0.6s
      playTone(now + 0.6, 1047, 0.5, 0.7);
      // Terzo tono più basso per risonanza — opzionale
      playTone(now + 0.0, 440, 0.5, 0.2); // armonica
    } catch { /* ignora errori audio */ }
  }, [audioUnlocked]);

  // ── Coda TTS serializzata con voce femminile ───────────────────────────────
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
    utterance.pitch = 1.1; // pitch leggermente più alto per voce femminile
    if (femaleVoiceRef.current) utterance.voice = femaleVoiceRef.current;

    utterance.onend = () => { ttsSpeakingRef.current = false; setTimeout(ttsProcessQueue, 400); };
    utterance.onerror = () => { ttsSpeakingRef.current = false; setTimeout(ttsProcessQueue, 400); };

    window.speechSynthesis.speak(utterance);
  }, []);

  const announce = useCallback((entry: ChiamataEntry) => {
    // Plim sempre attivo (se audio sbloccato)
    playPlim();

    // Voce: solo se abilitata E audio sbloccato
    if (voiceEnabled && audioUnlocked && 'speechSynthesis' in window) {
      const numeroSolo = entry.ticket.replace(/[A-Za-z]/g, '');
      const numeroSpaced = numeroSolo.split('').join(' ');
      const text = `Numero ${numeroSpaced}, ${entry.servizio}, postazione ${entry.postazione}`;
      if (ttsQueueRef.current.length < 3) {
        // Aspetta che il plim finisca (2 toni × 0.6s ≈ 1.3s)
        setTimeout(() => {
          ttsQueueRef.current.push(text);
          ttsProcessQueue();
        }, 1300);
      }
    }
  }, [voiceEnabled, audioUnlocked, playPlim, ttsProcessQueue]);

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
          setHistory(ultimi.map((u) => ({ ...u, postazione: String(u.postazione) })).slice(0, 20));
        }
        // Aggiornamento config voce in tempo reale
        if (msg.type === 'MONITOR_CONFIG') {
          const { voiceEnabled: ve } = msg as unknown as { voiceEnabled: boolean };
          setVoiceEnabled(Boolean(ve));
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

  const timeStr = time.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const dateStr = time.toLocaleDateString('it-IT', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });

  return (
    <div style={S.root}>

      {/* ── OVERLAY SBLOCCO AUDIO (finché non cliccato) ── */}
      {!audioUnlocked && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 999,
          background: 'rgba(10,10,20,0.92)',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 24,
          cursor: 'pointer',
        }} onClick={handleUnlockAudio}>
          <div style={{ fontSize: 64 }}>🔊</div>
          <div style={{ fontSize: 28, fontWeight: 900, color: 'white', letterSpacing: 2 }}>
            Tocca per attivare l'audio
          </div>
          <div style={{ fontSize: 14, color: '#94a3b8', textAlign: 'center', maxWidth: 400 }}>
            Il browser richiede un'interazione per abilitare l'audio.<br/>
            Clicca qui una volta, poi il monitor funzionerà automaticamente.
          </div>
          <button style={{
            background: '#e74c3c', color: 'white', border: 'none',
            borderRadius: 12, padding: '16px 48px',
            fontSize: 18, fontWeight: 700, cursor: 'pointer',
            boxShadow: '0 0 30px rgba(231,76,60,0.5)',
          }}>
            Attiva Audio
          </button>
        </div>
      )}

      {/* ── HEADER ── */}
      <div style={S.header}>
        <div style={S.headerLogo}>
          <img src="/logo.svg" alt="Logo" height={36}
            style={{ marginRight: 12, opacity: 0.95 }}
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
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
          <div style={S.currentBox}>
            <div style={S.currentLabel}>NUMERO IN SERVIZIO</div>
            {current ? (
              <>
                <div style={S.currentService}>{current.servizio}</div>
                <div style={S.currentTicket}>{current.ticket}</div>
                <div style={S.currentPost}>Postazione {current.postazione}</div>
              </>
            ) : (
              <div style={S.currentEmpty}>In attesa…</div>
            )}
          </div>

          <div style={S.prevDivider}>PRECEDENTI</div>

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
          <span style={{ width: 10, height: 10, borderRadius: '50%', display: 'inline-block', background: connected ? '#2ecc71' : '#e74c3c', boxShadow: connected ? '0 0 8px #2ecc71' : '0 0 8px #e74c3c' }} />
          <span style={{ fontSize: 13, color: '#aaa' }}>{connected ? 'Connesso' : 'Riconnessione…'}</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {!audioUnlocked ? (
            <button onClick={handleUnlockAudio} style={{
              background: '#e74c3c', color: 'white', border: 'none',
              borderRadius: 6, padding: '4px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
            }}>🔊 Attiva Audio</button>
          ) : (
            <>
              <span style={{ fontSize: 11, color: '#2ecc71' }}>🔔 Plim attivo</span>
              {voiceConfigLoaded && (
                <span style={{
                  fontSize: 11, padding: '2px 8px', borderRadius: 4,
                  background: voiceEnabled ? 'rgba(39,174,96,0.15)' : 'rgba(100,100,100,0.15)',
                  border: `1px solid ${voiceEnabled ? 'rgba(39,174,96,0.3)' : 'rgba(100,100,100,0.2)'}`,
                  color: voiceEnabled ? '#2ecc71' : '#555',
                }}>
                  {voiceEnabled ? '🔊 Voce ON' : '🔇 Voce OFF'}
                </span>
              )}
            </>
          )}
          {!ttsSupported && <span style={{ fontSize: 11, color: '#f59e0b' }}>⚠ TTS non supportato</span>}
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
  root: { display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', background: '#0f0f1a', fontFamily: "'Tahoma','Helvetica Neue',sans-serif", overflow: 'hidden', color: 'white', userSelect: 'none' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 30px', background: 'linear-gradient(90deg,#1a1a2e,#16213e)', borderBottom: '2px solid #e74c3c', flexShrink: 0 },
  headerLogo: { display: 'flex', alignItems: 'center', gap: 4 },
  headerTitle: { fontSize: 26, fontWeight: 900, letterSpacing: 4, color: '#e74c3c' },
  headerSub: { fontSize: 13, color: '#888', marginLeft: 14, letterSpacing: 1, alignSelf: 'flex-end', paddingBottom: 2 },
  headerClock: { textAlign: 'right' },
  clockTime: { fontSize: 32, fontWeight: 900, fontFamily: 'monospace', letterSpacing: 2, color: 'white' },
  clockDate: { fontSize: 13, color: '#888', textTransform: 'capitalize' },
  body: { display: 'flex', flex: 1, overflow: 'hidden' },
  leftPanel: { width: '62%', display: 'flex', flexDirection: 'column', padding: '20px 30px', gap: 12 },
  currentBox: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg,#1a1a2e,#16213e)', border: '2px solid rgba(231,76,60,0.4)', borderRadius: 12, padding: '20px 30px', textAlign: 'center' },
  currentLabel: { fontSize: 14, fontWeight: 700, letterSpacing: 4, color: '#e74c3c', marginBottom: 8, borderBottom: '1px solid rgba(231,76,60,0.3)', paddingBottom: 8, width: '100%' },
  currentService: { fontSize: 28, fontWeight: 600, color: '#94a3b8', marginBottom: 4, lineHeight: 1.2, textTransform: 'uppercase' },
  currentTicket: { fontSize: 140, fontWeight: 900, color: '#e74c3c', lineHeight: 1, letterSpacing: 4, textShadow: '0 0 40px rgba(231,76,60,0.5)' },
  currentPost: { fontSize: 42, color: 'white', marginTop: 8, fontWeight: 800, letterSpacing: 2 },
  currentEmpty: { fontSize: 40, color: '#333', fontStyle: 'italic' },
  prevDivider: { fontSize: 11, fontWeight: 700, letterSpacing: 4, color: '#333', textAlign: 'center' },
  prevRow: { display: 'flex', gap: 16, flexShrink: 0 },
  prevBox: { flex: 1, padding: '12px 16px', borderRadius: 10, border: '2px solid', background: 'rgba(255,255,255,0.03)', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 2 },
  prevService: { fontSize: 14, fontWeight: 600, color: '#888' },
  prevTicket: { fontSize: 48, fontWeight: 900, letterSpacing: 2 },
  prevPost: { fontSize: 16, color: '#888', fontWeight: 700 },
  divider: { width: 2, background: 'rgba(255,255,255,0.06)', flexShrink: 0 },
  rightPanel: { flex: 1, display: 'flex', flexDirection: 'column', padding: '20px 24px', overflow: 'hidden' },
  tableTitle: { fontSize: 12, fontWeight: 700, letterSpacing: 4, color: '#444', marginBottom: 10, textAlign: 'center' },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { fontSize: 12, fontWeight: 700, color: '#555', padding: '6px 10px', textAlign: 'center', borderBottom: '1px solid rgba(255,255,255,0.08)', letterSpacing: 1 },
  td: { fontSize: 20, fontWeight: 600, color: '#ccc', padding: '5px 10px', textAlign: 'center', borderBottom: '1px solid rgba(255,255,255,0.05)' },
  footer: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 30px', background: '#0a0a14', borderTop: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 },
};
