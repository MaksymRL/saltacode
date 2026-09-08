import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useWebSocket } from '../../hooks/useWebSocket';
import apiClient from '../../api/client';
import RoleSwitcher from '../../components/RoleSwitcher';
import AccountSettings from '../AccountSettings';
import Logo from '../../components/Logo';

interface OperatoreStato {
  id: number;
  username: string;
  cognome: string;
  nome: string;
  stato: 'ATTIVO' | 'PAUSA' | 'DISABILITATO';
  postazione?: string | null;
  pausaInizio?: string | null;
}

interface Servizio {
  id: number;
  nome: string;
  lettera: string;
  attivo: boolean;
  areaId: number;
  area: { id: number; nome: string; prefisso: string };
  _count: { ticket: number };
}

interface CodaState { servizioId: number; count: number; }
interface TicketEmesso { id: number; numero: string; emessoPer: string; stato: string; }

export default function AccoglienzaDashboard() {
  const { user, logout } = useAuth();
  const [servizi, setServizi] = useState<Servizio[]>([]);
  const [loading, setLoading] = useState(true);
  const [code, setCode] = useState<CodaState[]>([]);
  const [emitting, setEmitting] = useState<number | null>(null);
  const [globalEmitting, setGlobalEmitting] = useState(false);
  const [error, setError] = useState('');
  const [lastTicket, setLastTicket] = useState<TicketEmesso | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleAnnullaTicket = async () => {
    if (!lastTicket) return;
    try {
      await apiClient.delete(`/ticket/${lastTicket.id}`);
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
      setLastTicket(null);
    } catch { /* ignora — il ticket potrebbe essere già stato chiamato */ }
  };

  const loadServizi = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.get<Servizio[]>('/servizi');
      setServizi(res.data.filter((s) => s.attivo));
    } catch { setError('Errore nel caricamento servizi.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadServizi(); }, [loadServizi]);

  // ── Operatori ─────────────────────────────────────────────────────────────
  const [operatori, setOperatori] = useState<OperatoreStato[]>([]);
  // Ticker per i timer di pausa — un solo setInterval nel componente root
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const loadOperatori = useCallback(async () => {
    try {
      const res = await apiClient.get<OperatoreStato[]>('/utenti/operatori');
      setOperatori(res.data);
    } catch { /* non bloccante */ }
  }, []);
  useEffect(() => { loadOperatori(); }, [loadOperatori]);

  // ── WebSocket ─────────────────────────────────────────────────────────────
  const handleWsMessage = useCallback((msg: { type: string; [key: string]: unknown }) => {
    if (msg.type === 'INITIAL_STATE') {
      setCode((msg['code'] as CodaState[]) ?? []);
    }
    if (msg.type === 'TICKET_EMESSO') {
      const { servizioId, coda } = msg as unknown as { servizioId: number; coda: number };
      setCode((prev) => {
        const ex = prev.find((c) => c.servizioId === servizioId);
        if (ex) return prev.map((c) => c.servizioId === servizioId ? { ...c, count: coda } : c);
        return [...prev, { servizioId, count: coda }];
      });
    }
    if (msg.type === 'NUMERO_CHIAMATO') {
      const { servizioId } = msg as unknown as { servizioId: number };
      setCode((prev) => prev.map((c) => c.servizioId === servizioId ? { ...c, count: Math.max(0, c.count - 1) } : c));
    }
    if (msg.type === 'STATO_OPERATORE') {
      const { utenteId, stato, postazione, pausaInizio } = msg as unknown as {
        utenteId: number; stato: 'ATTIVO' | 'PAUSA' | 'DISABILITATO';
        postazione?: string | null; pausaInizio?: string | null;
      };
      setOperatori((prev) => {
        const exists = prev.find((op) => op.id === utenteId);
        if (exists) {
          return prev
            .map((op) => op.id === utenteId
              ? { ...op, stato, postazione: postazione ?? op.postazione, pausaInizio: stato === 'PAUSA' ? (pausaInizio ?? op.pausaInizio) : null }
              : op
            )
            .filter((op) => op && op.id != null);
        }
        return prev.filter((op) => op && op.id != null);
      });
    }
  }, []);
  useWebSocket({ onMessage: handleWsMessage });

  // ── Emetti ticket ─────────────────────────────────────────────────────────
  const handleEmittiTicket = async (servizioId: number) => {
    if (globalEmitting) return;
    setError(''); setEmitting(servizioId); setGlobalEmitting(true);
    if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    setLastTicket(null);
    try {
      const res = await apiClient.post<{ ticket: TicketEmesso; pdf: string }>('/ticket', { servizioId });
      const { ticket, pdf } = res.data;
      setLastTicket(ticket);
      dismissTimerRef.current = setTimeout(() => setLastTicket(null), 8000);
      // Stampa PDF — crea un iframe temporaneo, stampa e rimuove immediatamente
      try {
        const bytes = Uint8Array.from(atob(pdf), (c) => c.charCodeAt(0));
        const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));

        const iframe = document.createElement('iframe');
        iframe.style.display = 'none';
        iframe.style.position = 'fixed';
        iframe.style.top = '-9999px';
        document.body.appendChild(iframe);

        iframe.onload = () => {
          try {
            iframe.contentWindow?.print();
          } catch {
            // Fallback: download diretto
            const a = document.createElement('a');
            a.href = url; a.download = `ticket-${ticket.numero}.pdf`;
            a.style.display = 'none'; document.body.appendChild(a);
            a.click(); document.body.removeChild(a);
          }
          // Rimuovi iframe e revoca URL dopo un breve delay
          setTimeout(() => {
            URL.revokeObjectURL(url);
            if (document.body.contains(iframe)) document.body.removeChild(iframe);
          }, 2000);
        };

        iframe.src = url;
      } catch { setError('Ticket emesso, ma errore durante la stampa.'); }
    } catch (err: any) {
      setError(err?.response?.data?.error ?? 'Errore emissione ticket.');
    } finally { setEmitting(null); setGlobalEmitting(false); }
  };

  const getCoda = (id: number) => code.find((c) => c.servizioId === id)?.count ?? 0;

  // Raggruppa servizi per area
  const areeMap = new Map<number, { area: Servizio['area']; servizi: Servizio[] }>();
  servizi.forEach((s) => {
    if (!areeMap.has(s.areaId)) areeMap.set(s.areaId, { area: s.area, servizi: [] });
    areeMap.get(s.areaId)!.servizi.push(s);
  });
  const areeGruppi = Array.from(areeMap.values());

  return (
    <div style={{ minHeight: '100vh', background: '#f0f4ff', fontFamily: "'Tahoma','Helvetica Neue',sans-serif", display: 'flex', flexDirection: 'column' }}>

      {/* Header */}
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 16px', background: '#0f3460', color: 'white', height: 48, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Logo height={28} style={{ marginRight: 4 }} />
          <span style={{ fontSize: 18, fontWeight: 900, letterSpacing: 2 }}>🎫 ACCOGLIENZA</span>
          {lastTicket && (
            <span style={{ background: '#22c55e', color: 'white', borderRadius: 4, padding: '2px 10px', fontWeight: 700, fontSize: 15, letterSpacing: 1, display: 'flex', alignItems: 'center', gap: 6 }}>
              ✓ {lastTicket.numero}
              <button
                onClick={handleAnnullaTicket}
                title="Annulla ticket (non stampato)"
                style={{ background: 'rgba(0,0,0,0.2)', border: 'none', color: 'white', cursor: 'pointer', fontSize: 11, padding: '1px 6px', borderRadius: 3, fontWeight: 700 }}
              >
                Annulla
              </button>
              <button onClick={() => { if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current); setLastTicket(null); }}
                style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', fontSize: 12, padding: 0 }}>✕</button>
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: '#94a3b8', fontSize: 13 }}>{user?.username}</span>
          <button onClick={() => setShowSettings(true)} style={hdrBtn('#334155')} title="Impostazioni account">⚙</button>
          <RoleSwitcher />
          <button onClick={logout} style={hdrBtn('#dc2626')}>Esci</button>
        </div>
      </header>

      {error && (
        <div style={{ background: '#fee2e2', borderBottom: '2px solid #fca5a5', padding: '6px 16px', color: '#991b1b', fontSize: 13, display: 'flex', justifyContent: 'space-between' }}>
          {error}
          <button onClick={() => setError('')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700, color: '#991b1b' }}>✕</button>
        </div>
      )}

      {/* Corpo principale — tabella servizi */}
      <main style={{ flex: 1, overflowY: 'auto' }}>
        {loading ? (
          <p style={{ padding: 24, color: '#888' }}>Caricamento servizi…</p>
        ) : servizi.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#888' }}>
            <p style={{ fontSize: 18 }}>Nessun servizio attivo.</p>
          </div>
        ) : (
          areeGruppi.map(({ area, servizi: srv }) => (
            <div key={area.id}>
              {/* Intestazione area */}
              <div style={{
                background: '#0f3460', color: 'white',
                padding: '4px 16px', fontSize: 12, fontWeight: 700,
                letterSpacing: 2, textTransform: 'uppercase',
                borderBottom: '1px solid #1e4080',
              }}>
                {area.prefisso} — {area.nome}
              </div>

              {/* Righe servizi */}
              <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                <tbody>
                  {srv.map((s, idx) => {
                    const coda = getCoda(s.id);
                    const isEmitting = emitting === s.id;
                    const codaColor = coda === 0 ? '#16a34a' : coda < 5 ? '#d97706' : '#dc2626';
                    return (
                      <tr key={s.id} style={{ background: idx % 2 === 0 ? 'white' : '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                        {/* Codice */}
                        <td style={{ width: 60, padding: '6px 10px', textAlign: 'center' }}>
                          <span style={{ fontWeight: 900, fontSize: 18, color: '#0f3460', letterSpacing: 1 }}>
                            {area.prefisso}{s.lettera}
                          </span>
                        </td>
                        {/* Nome servizio */}
                        <td style={{ padding: '6px 10px', fontSize: 14, fontWeight: 600, color: '#1e293b' }}>
                          {s.nome}
                        </td>
                        {/* Coda */}
                        <td style={{ width: 70, padding: '6px 8px', textAlign: 'center' }}>
                          <span style={{ fontSize: 22, fontWeight: 900, color: codaColor }}>{coda}</span>
                          <div style={{ fontSize: 9, color: '#94a3b8', lineHeight: 1 }}>in attesa</div>
                        </td>
                        {/* Pulsante */}
                        <td style={{ width: 140, padding: '6px 10px' }}>
                          <button
                            onClick={() => handleEmittiTicket(s.id)}
                            disabled={isEmitting || globalEmitting}
                            style={{
                              width: '100%', padding: '7px 0',
                              background: isEmitting || globalEmitting ? '#94a3b8' : '#0f3460',
                              color: 'white', border: 'none', borderRadius: 4,
                              fontWeight: 700, fontSize: 13,
                              cursor: isEmitting || globalEmitting ? 'not-allowed' : 'pointer',
                            }}
                          >
                            {isEmitting ? '⏳' : '🖨️ Stampa'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ))
        )}
      </main>

      {/* Pannello operatori — barra in fondo */}
      {operatori.length > 0 && (
        <div style={{ background: '#1e293b', borderTop: '2px solid #334155', padding: '6px 16px', display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', flexShrink: 0 }}>
          <span style={{ fontSize: 11, color: '#64748b', fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', marginRight: 4 }}>Operatori:</span>
          {operatori.map((op) => {
            if (!op || op.id == null) return null;
            const pausaSecs = op.stato === 'PAUSA' && op.pausaInizio
              ? Math.floor((now - new Date(op.pausaInizio).getTime()) / 1000)
              : null;
            const pausaStr = pausaSecs != null && pausaSecs >= 0
              ? `${Math.floor(pausaSecs / 60)}:${(pausaSecs % 60).toString().padStart(2, '0')}`
              : null;
            return (
              <div key={op.id} style={{
                display: 'flex', alignItems: 'center', gap: 5,
                background: op.stato === 'ATTIVO' ? 'rgba(34,197,94,0.15)' : 'rgba(245,158,11,0.15)',
                border: `1px solid ${op.stato === 'ATTIVO' ? 'rgba(34,197,94,0.3)' : 'rgba(245,158,11,0.3)'}`,
                borderRadius: 4, padding: '2px 8px',
              }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: op.stato === 'ATTIVO' ? '#22c55e' : '#f59e0b', display: 'inline-block', flexShrink: 0 }} />
                <span style={{ fontSize: 12, color: 'white', fontWeight: 600 }}>
                  {op.cognome} {op.nome}{op.postazione ? ` — ${op.postazione}` : ''}
                  {pausaStr && <span style={{ fontFamily: 'monospace', fontSize: 10, color: '#fde68a', marginLeft: 4 }}>⏸ {pausaStr}</span>}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {showSettings && <AccountSettings onClose={() => setShowSettings(false)} />}
    </div>
  );
}

function hdrBtn(bg: string): React.CSSProperties {
  return { background: bg, color: 'white', border: 'none', borderRadius: 4, padding: '4px 10px', fontSize: 13, fontWeight: 600, cursor: 'pointer' };
}
