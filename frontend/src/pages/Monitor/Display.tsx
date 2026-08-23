import { useState, useCallback, useEffect, useRef } from 'react';
import '../../styles/classic.css';

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
  const [_current, setCurrent] = useState<ChiamataEntry | null>(null);
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

        if (msg.type === 'NUMERO_CHIAMATO' || msg.type === 'NUMERO_RICHIAMATO') {
          const entry: ChiamataEntry = {
            ticket: msg['ticket'] as string,
            servizio: msg['servizio'] as string,
            postazione: msg['postazione'] as number,
            timestamp: msg['timestamp'] as string,
          };
          setCurrent(entry);
          setHistory((prev) => [entry, ...prev].slice(0, 20)); // Mantieni fino a 20 elementi
          if (msg.type === 'NUMERO_CHIAMATO') {
            announce(entry);
          }
        }

        if (msg.type === 'INITIAL_STATE') {
          const ultimi = (msg['ultimiChiamati'] as ChiamataEntry[] | undefined) ?? [];
          setHistory(ultimi.slice(0, 20)); // Mantieni fino a 20 elementi
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
    <div style={{ 
      display: 'flex', 
      height: '100vh', 
      background: 'white',
      fontFamily: 'Tahoma, Helvetica, sans-serif',
      overflow: 'hidden' 
    }}>

      {/* Pannello sinistro — primi 3 numeri in grande (70%) */}
      <div style={{ 
        width: '70%', 
        borderRight: '2px solid black',
        display: 'flex',
        flexDirection: 'column'
      }}>
        <table style={{ width: '100%', height: '100%', borderCollapse: 'collapse' }}>
          <tbody>
            {/* Posizione 0 - Numero corrente (rosso, più grande) */}
            <tr style={{ height: '140px' }}>
              <td className="posCommon pos0Service" style={{ textAlign: 'center', borderBottom: '1px solid black' }}>
                {history[0]?.servizio || ''}
              </td>
            </tr>
            <tr style={{ height: '140px' }}>
              <td className="posCommon pos0Number" style={{ textAlign: 'center', borderBottom: '1px solid black' }}>
                {history[0]?.ticket || ''}
              </td>
            </tr>
            <tr style={{ height: '80px', borderBottom: '3px solid black' }}>
              <td className="posCommon pos0Post" style={{ textAlign: 'center' }}>
                {history[0] ? `Postazione ${history[0].postazione}` : ''}
              </td>
            </tr>

            {/* Posizione 1 - Secondo numero (verde, medio) */}
            <tr style={{ height: '80px' }}>
              <td className="posCommon pos2Service" style={{ textAlign: 'center' }}>
                {history[1]?.servizio || ''}
              </td>
            </tr>
            <tr style={{ height: '80px' }}>
              <td className="posCommon pos2Number" style={{ textAlign: 'center' }}>
                {history[1]?.ticket || ''}
              </td>
            </tr>
            <tr style={{ height: '80px', borderBottom: '1px solid black' }}>
              <td className="posCommon pos2Post" style={{ textAlign: 'center' }}>
                {history[1] ? `Postazione ${history[1].postazione}` : ''}
              </td>
            </tr>

            {/* Posizione 2 - Terzo numero (blu, medio-piccolo) */}
            <tr style={{ height: '70px' }}>
              <td className="posCommon pos3Service" style={{ textAlign: 'center' }}>
                {history[2]?.servizio || ''}
              </td>
            </tr>
            <tr style={{ height: '70px' }}>
              <td className="posCommon pos3Number" style={{ textAlign: 'center' }}>
                {history[2]?.ticket || ''}
              </td>
            </tr>
            <tr style={{ height: '70px' }}>
              <td className="posCommon pos3Post" style={{ textAlign: 'center' }}>
                {history[2] ? `Postazione ${history[2].postazione}` : ''}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Pannello destro — tabella cronologia (30%) */}
      <div style={{ width: '30%', padding: '20px 0' }}>
        <table style={{ 
          width: '100%', 
          borderCollapse: 'collapse',
          marginTop: '15px'
        }}>
          <thead>
            <tr>
              <th className="posCommon posHeaderService" style={{ textAlign: 'left' }}>SERVIZIO</th>
              <th className="posCommon posHeaderNumber" style={{ textAlign: 'center' }}>NUMERO</th>  
              <th className="posCommon posHeaderPost" style={{ textAlign: 'center' }}>POST</th>
              <th className="posCommon posHeaderPost" style={{ textAlign: 'right' }}>ORA</th>
            </tr>
          </thead>
          <tbody>
            {/* Prime 3 chiamate con colori speciali */}
            {history.slice(0, 3).map((entry, index) => (
              <tr key={index}>
                <td 
                  className="posCommon pos4Service" 
                  style={{ 
                    textAlign: 'left',
                    color: index === 0 ? 'red' : index === 1 ? 'green' : 'blue'
                  }}
                >
                  {entry.servizio}
                </td>
                <td 
                  className="posCommon pos4Number" 
                  style={{ 
                    textAlign: 'center',
                    color: index === 0 ? 'red' : index === 1 ? 'green' : 'blue'
                  }}
                >
                  {entry.ticket}
                </td>
                <td 
                  className="posCommon pos4Post" 
                  style={{ 
                    textAlign: 'center',
                    color: index === 0 ? 'red' : index === 1 ? 'green' : 'blue'
                  }}
                >
                  {entry.postazione}
                </td>
                <td 
                  className="posDate" 
                  style={{ 
                    textAlign: 'right',
                    color: index === 0 ? 'red' : index === 1 ? 'green' : 'blue'
                  }}
                >
                  {new Date(entry.timestamp).toLocaleTimeString('it-IT', { 
                    hour: '2-digit', 
                    minute: '2-digit' 
                  })}
                </td>
              </tr>
            ))}

            {/* Resto della cronologia (fino a 20 totali) */}
            {history.slice(3, 20).map((entry, index) => (
              <tr key={index + 3} className={index % 2 === 1 ? 'posAlternativeColor' : ''}>
                <td className="posCommon pos4Service" style={{ textAlign: 'left' }}>
                  {entry.servizio}
                </td>
                <td className="posCommon pos4Number" style={{ textAlign: 'center' }}>
                  {entry.ticket}
                </td>
                <td className="posCommon pos4Post" style={{ textAlign: 'center' }}>
                  {entry.postazione}
                </td>
                <td className="posDate" style={{ textAlign: 'right' }}>
                  {new Date(entry.timestamp).toLocaleTimeString('it-IT', { 
                    hour: '2-digit', 
                    minute: '2-digit' 
                  })}
                </td>
              </tr>
            ))}

            {/* Righe vuote per completare la tabella se necessario */}
            {Array.from({ length: Math.max(0, 17 - history.length) }, (_, index) => (
              <tr key={`empty-${index}`} className={index % 2 === 1 ? 'posAlternativeColor' : ''}>
                <td className="posCommon pos4Service" style={{ textAlign: 'left' }}>&nbsp;</td>
                <td className="posCommon pos4Number" style={{ textAlign: 'center' }}>&nbsp;</td>
                <td className="posCommon pos4Post" style={{ textAlign: 'center' }}>&nbsp;</td>
                <td className="posDate" style={{ textAlign: 'right' }}>&nbsp;</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Indicatori stato in basso */}
        <div style={{ 
          position: 'fixed', 
          bottom: '10px', 
          right: '10px', 
          fontSize: '11px',
          color: connected ? '#22c55e' : '#ef4444'
        }}>
          {connected ? '● CONNESSO' : '● RICONNESSIONE…'}
        </div>

        {/* Avviso audio se non supportato */}
        {!ttsSupported && (
          <div style={{ 
            position: 'fixed', 
            bottom: '30px', 
            right: '10px',
            background: '#f59e0b',
            color: '#000',
            padding: '4px 8px',
            fontSize: '11px',
            fontWeight: 'bold'
          }}>
            ⚠ Audio non disponibile
          </div>
        )}
      </div>

      {/* Orologio in alto a destra */}
      <Clock />
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
      position: 'fixed', 
      top: '16px', 
      right: '20px',
      fontFamily: 'monospace', 
      fontSize: '22px', 
      color: '#000',  // Nero per il background bianco
      letterSpacing: '2px',
      fontWeight: 'bold'
    }}>
      {time.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
    </div>
  );
}
