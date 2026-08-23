import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useWebSocket } from '../../hooks/useWebSocket';
import apiClient from '../../api/client';

interface Servizio {
  id: number;
  nome: string;
  lettera: string;
  attivo: boolean;
  areaId: number;
  area: { id: number; nome: string; prefisso: string };
  _count: { ticket: number };
}

interface CodaState {
  servizioId: number;
  count: number;
}

interface LastCall {
  chiamataId: number;
  ticketNumero: string;
}

interface OperatoreStato {
  id: number;
  username: string;
  cognome: string;
  nome: string;
  stato: 'ATTIVO' | 'PAUSA' | 'DISABILITATO';
}

export default function OperatoreDashboard() {
  const { user, logout } = useAuth();

  // ── Step 1: scegli postazione ─────────────────────────────────────────────
  const [postazione, setPostazione] = useState<number | null>(null);
  const [postazioneInput, setPostazioneInput] = useState('');
  const [postazioneError, setPostazioneError] = useState('');

  const handlePostazioneSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const num = parseInt(postazioneInput, 10);
    if (isNaN(num) || num < 1 || num > 99) {
      setPostazioneError('Inserire un numero tra 1 e 99.');
      return;
    }
    setPostazioneError('');
    setPostazione(num);
  };

  // ── Stato pausa ───────────────────────────────────────────────────────────
  const [isPausa, setIsPausa] = useState(false);
  const [stateLoading, setStateLoading] = useState(false);
  const [pausaStart, setPausaStart] = useState<Date | null>(null);
  const [pausaSecs, setPausaSecs] = useState(0);

  useEffect(() => {
    if (!isPausa || !pausaStart) return;
    const t = setInterval(() => {
      setPausaSecs(Math.floor((Date.now() - pausaStart.getTime()) / 1000));
    }, 1000);
    return () => clearInterval(t);
  }, [isPausa, pausaStart]);

  const handleTogglePausa = async () => {
    setStateLoading(true);
    try {
      const nuovoStato = isPausa ? 'ATTIVO' : 'PAUSA';
      await apiClient.patch('/utenti/me/stato', { stato: nuovoStato });
      if (!isPausa) {
        setPausaStart(new Date());
        setPausaSecs(0);
      } else {
        setPausaStart(null);
        setPausaSecs(0);
      }
      setIsPausa(!isPausa);
    } catch (err: any) {
      setError(err?.response?.data?.error ?? 'Errore cambio stato.');
    } finally {
      setStateLoading(false);
    }
  };

  const formatTime = (s: number) => {
    const h = Math.floor(s / 3600).toString().padStart(2, '0');
    const m = Math.floor((s % 3600) / 60).toString().padStart(2, '0');
    const sec = (s % 60).toString().padStart(2, '0');
    return `${h}:${m}:${sec}`;
  };

  // ── Servizi ───────────────────────────────────────────────────────────────
  const [servizi, setServizi] = useState<Servizio[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [code, setCode] = useState<CodaState[]>([]);
  const [lastCalls, setLastCalls] = useState<Map<number, LastCall>>(new Map());
  const [calling, setCalling] = useState<number | null>(null);
  const [recalling, setRecalling] = useState<number | null>(null);
  const [spotlight, setSpotlight] = useState<{ numero: string; servizio: string; post: number } | null>(null);

  const loadServizi = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.get<Servizio[]>('/servizi');
      setServizi(res.data.filter((s) => s.attivo));
    } catch {
      setError('Errore nel caricamento servizi.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (postazione !== null) loadServizi();
  }, [postazione, loadServizi]);

  // ── Colleghi operatori ────────────────────────────────────────────────────
  const [colleghi, setColleghi] = useState<OperatoreStato[]>([]);

  const loadColleghi = useCallback(async () => {
    try {
      const res = await apiClient.get<OperatoreStato[]>('/utenti/operatori');
      setColleghi(res.data);
    } catch { /* non bloccante */ }
  }, []);

  useEffect(() => {
    if (postazione !== null) loadColleghi();
  }, [postazione, loadColleghi]);

  // ── WebSocket ─────────────────────────────────────────────────────────────
  const handleWsMessage = useCallback((msg: { type: string; [key: string]: unknown }) => {
    if (msg.type === 'INITIAL_STATE') {
      setCode((msg['code'] as CodaState[]) ?? []);
    }
    if (msg.type === 'TICKET_EMESSO') {
      const { servizioId, coda } = msg as unknown as { servizioId: number; coda: number };
      setCode((prev) => {
        const exists = prev.find((c) => c.servizioId === servizioId);
        if (exists) return prev.map((c) => c.servizioId === servizioId ? { ...c, count: coda } : c);
        return [...prev, { servizioId, count: coda }];
      });
    }
    if (msg.type === 'NUMERO_CHIAMATO') {
      const { servizioId } = msg as unknown as { servizioId: number };
      setCode((prev) =>
        prev.map((c) => c.servizioId === servizioId ? { ...c, count: Math.max(0, c.count - 1) } : c)
      );
    }
    // Aggiorna lo stato dei colleghi in tempo reale
    if (msg.type === 'STATO_OPERATORE') {
      const { utenteId, stato } = msg as unknown as { utenteId: number; stato: 'ATTIVO' | 'PAUSA' | 'DISABILITATO' };
      setColleghi((prev) =>
        prev.map((c) => c.id === utenteId ? { ...c, stato } : c)
      );
    }
  }, []);

  useWebSocket({ onMessage: handleWsMessage });

  const getCoda = (id: number) => code.find((c) => c.servizioId === id)?.count ?? 0;

  // ── Chiama prossimo ───────────────────────────────────────────────────────
  const handleChiama = async (s: Servizio) => {
    if (!postazione || isPausa) return;
    setError('');
    setCalling(s.id);
    try {
      const res = await apiClient.post<{
        chiamata: { id: number; ticketNumero: string; postazione: number };
      }>('/chiamate', { servizioId: s.id, postazione });
      const { chiamata } = res.data;
      setLastCalls((prev) => new Map(prev).set(s.id, { chiamataId: chiamata.id, ticketNumero: chiamata.ticketNumero }));
      setSpotlight({ numero: chiamata.ticketNumero, servizio: s.nome, post: chiamata.postazione });
    } catch (err: any) {
      setError(err?.response?.status === 204
        ? `Nessun ticket in attesa per ${s.nome}.`
        : (err?.response?.data?.error ?? 'Errore chiamata.'));
    } finally {
      setCalling(null);
    }
  };

  // ── Richiama numero precedente ────────────────────────────────────────────
  const handleRichiama = async (s: Servizio) => {
    const last = lastCalls.get(s.id);
    if (!last || !postazione || isPausa) return;
    setError('');
    setRecalling(s.id);
    try {
      await apiClient.post('/chiamate/recall', { ticketNumero: last.ticketNumero, postazione });
      setSpotlight({ numero: last.ticketNumero, servizio: s.nome, post: postazione });
    } catch (err: any) {
      setError(err?.response?.data?.error ?? 'Errore richiamo.');
    } finally {
      setRecalling(null);
    }
  };

  // ── Annulla ultima chiamata ───────────────────────────────────────────────
  const handleAnnulla = async (servizioId: number) => {
    const last = lastCalls.get(servizioId);
    if (!last) return;
    setError('');
    try {
      await apiClient.delete(`/chiamate/${last.chiamataId}`);
      setLastCalls((prev) => { const n = new Map(prev); n.delete(servizioId); return n; });
      if (spotlight?.numero === last.ticketNumero) setSpotlight(null);
    } catch (err: any) {
      setError(err?.response?.data?.error ?? 'Errore annullamento.');
    }
  };

  // ── Schermata selezione postazione ────────────────────────────────────────
  if (postazione === null) {
    return (
      <div style={S.page}>
        <div style={S.centerBox}>
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <div style={{ fontSize: 48, marginBottom: 8 }}>🖥️</div>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800 }}>Saltacode</h1>
            <p style={{ margin: '6px 0 0', color: '#6b7280', fontSize: 14 }}>Postazione Operatore</p>
          </div>
          <form onSubmit={handlePostazioneSubmit}>
            <label style={S.label}>Numero postazione</label>
            <input
              type="number" min={1} max={99}
              value={postazioneInput}
              onChange={(e) => setPostazioneInput(e.target.value)}
              style={{ ...S.input, fontSize: 28, textAlign: 'center', width: '100%' }}
              autoFocus
            />
            {postazioneError && <p style={S.errText}>{postazioneError}</p>}
            <button type="submit" style={{ ...S.btn('#1a1a2e'), width: '100%', marginTop: 16, fontSize: 16, padding: '12px' }}>
              Inizia turno
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ── Dashboard principale ──────────────────────────────────────────────────
  const altriOperatori = colleghi.filter((c) => c.id !== user?.id);

  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9', fontFamily: 'system-ui, sans-serif', display: 'flex', flexDirection: 'column' }}>

      {/* ── HEADER ── */}
      <header style={{
        background: isPausa
          ? 'linear-gradient(90deg, #b45309, #d97706)'
          : 'linear-gradient(90deg, #1e293b, #334155)',
        color: 'white', padding: '0 24px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        height: 64, flexShrink: 0,
        transition: 'background 0.4s',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{
            background: isPausa ? '#f59e0b' : '#533483',
            borderRadius: 8, padding: '6px 14px',
            fontSize: 20, fontWeight: 900, letterSpacing: 1,
          }}>
            {isPausa ? '⏸' : '🖥️'} Postazione {postazione}
          </div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>{user?.username}</div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {isPausa && (
            <div style={{
              background: 'rgba(0,0,0,0.25)', borderRadius: 6,
              padding: '4px 12px', fontFamily: 'monospace',
              fontSize: 20, fontWeight: 700, letterSpacing: 2,
            }}>
              {formatTime(pausaSecs)}
            </div>
          )}
          <button
            onClick={handleTogglePausa}
            disabled={stateLoading}
            style={{
              background: isPausa ? '#22c55e' : '#f59e0b',
              color: 'white', border: 'none', borderRadius: 8,
              padding: '8px 20px', fontWeight: 700, fontSize: 14,
              cursor: stateLoading ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', gap: 6,
              transition: 'background 0.2s',
            }}
          >
            {stateLoading ? '⏳' : isPausa ? '▶ Riprendi' : '⏸ Pausa'}
          </button>
          <button onClick={logout} style={{
            background: 'rgba(239,68,68,0.15)', color: '#fca5a5',
            border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8,
            padding: '8px 16px', fontWeight: 600, fontSize: 13, cursor: 'pointer',
          }}>
            Esci
          </button>
        </div>
      </header>

      {/* ── BANNER PAUSA ── */}
      {isPausa && (
        <div style={{
          background: 'linear-gradient(90deg, #fffbeb, #fef3c7)',
          borderBottom: '2px solid #f59e0b',
          padding: '10px 24px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: '#92400e' }}>
            <span style={{ fontSize: 22 }}>⏸️</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>Postazione in pausa</div>
              <div style={{ fontSize: 13 }}>
                Inizio: {pausaStart?.toLocaleTimeString('it-IT')} — Trascorso: <strong style={{ fontFamily: 'monospace' }}>{formatTime(pausaSecs)}</strong>
              </div>
            </div>
          </div>
          <button onClick={handleTogglePausa} disabled={stateLoading} style={{
            background: '#22c55e', color: 'white', border: 'none',
            borderRadius: 8, padding: '10px 24px', fontWeight: 700,
            fontSize: 15, cursor: 'pointer',
          }}>
            ▶ Riprendi servizio
          </button>
        </div>
      )}

      <main style={{ flex: 1, padding: '20px 24px', maxWidth: 1100, margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>

        {/* ── SPOTLIGHT ── */}
        {spotlight && (
          <div style={{
            background: 'linear-gradient(135deg, #533483, #7c3aed)',
            color: 'white', borderRadius: 12,
            padding: '16px 24px', marginBottom: 20,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            boxShadow: '0 4px 20px rgba(83,52,131,0.4)',
          }}>
            <div>
              <div style={{ fontSize: 12, opacity: 0.7, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 4 }}>
                Numero chiamato — {spotlight.servizio} → Post. {spotlight.post}
              </div>
              <div style={{ fontSize: 56, fontWeight: 900, lineHeight: 1, letterSpacing: 3 }}>
                {spotlight.numero}
              </div>
            </div>
            <button onClick={() => setSpotlight(null)} style={{
              background: 'rgba(255,255,255,0.15)', border: 'none',
              color: 'white', borderRadius: 6, padding: '6px 12px',
              cursor: 'pointer', fontSize: 18,
            }}>✕</button>
          </div>
        )}

        {/* ── ERRORE ── */}
        {error && (
          <div style={{
            background: '#fee2e2', border: '1px solid #fca5a5',
            borderRadius: 8, padding: '10px 16px', marginBottom: 16,
            color: '#991b1b', display: 'flex', justifyContent: 'space-between',
          }}>
            <span>{error}</span>
            <button onClick={() => setError('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#991b1b', fontWeight: 700, fontSize: 16 }}>✕</button>
          </div>
        )}

        {/* ── SERVIZI ── */}
        {loading ? (
          <p style={{ color: '#888', textAlign: 'center', marginTop: 60 }}>Caricamento servizi…</p>
        ) : servizi.length === 0 ? (
          <p style={{ color: '#888', textAlign: 'center', marginTop: 60 }}>Nessun servizio attivo assegnato.</p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
            {servizi.map((s) => {
              const coda = getCoda(s.id);
              const last = lastCalls.get(s.id);
              const isCalling = calling === s.id;
              const isRecalling = recalling === s.id;
              const canCall = !isPausa && !isCalling && coda > 0;
              const canRecall = !isPausa && !isRecalling && !!last;

              return (
                <div key={s.id} style={{
                  background: 'white', borderRadius: 12,
                  boxShadow: '0 2px 8px rgba(0,0,0,0.07)',
                  overflow: 'hidden', border: '1px solid #e2e8f0',
                  opacity: isPausa ? 0.75 : 1, transition: 'opacity 0.3s',
                }}>
                  <div style={{
                    background: 'linear-gradient(135deg, #1e293b, #334155)',
                    padding: '12px 16px',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  }}>
                    <div>
                      <div style={{ fontSize: 11, color: '#94a3b8', letterSpacing: 2, textTransform: 'uppercase' }}>
                        {s.area.prefisso}{s.lettera}
                      </div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: 'white', marginTop: 2 }}>{s.nome}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{
                        fontSize: 42, fontWeight: 900, lineHeight: 1,
                        color: coda === 0 ? '#475569' : coda < 5 ? '#f59e0b' : '#ef4444',
                      }}>{coda}</div>
                      <div style={{ fontSize: 11, color: '#64748b' }}>in attesa</div>
                    </div>
                  </div>
                  <div style={{
                    padding: '8px 16px', background: last ? '#f0fdf4' : '#f8fafc',
                    borderBottom: '1px solid #e2e8f0', fontSize: 13,
                    minHeight: 36, display: 'flex', alignItems: 'center',
                  }}>
                    {last ? (
                      <span style={{ color: '#166534' }}>
                        Ultimo: <strong style={{ fontFamily: 'monospace', fontSize: 15 }}>{last.ticketNumero}</strong>
                      </span>
                    ) : (
                      <span style={{ color: '#94a3b8' }}>Nessuna chiamata ancora</span>
                    )}
                  </div>
                  <div style={{ padding: '12px 16px', display: 'flex', gap: 8 }}>
                    <button onClick={() => handleChiama(s)} disabled={!canCall} style={{
                      flex: 2, padding: '12px 0',
                      background: canCall ? '#533483' : '#e2e8f0',
                      color: canCall ? 'white' : '#94a3b8',
                      border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 16,
                      cursor: canCall ? 'pointer' : 'not-allowed', transition: 'background 0.15s',
                    }}>
                      {isCalling ? '⏳' : '▶ Chiama'}
                    </button>
                    <button onClick={() => handleRichiama(s)} disabled={!canRecall}
                      title={last ? `Richiama ${last.ticketNumero}` : 'Nessun numero precedente'}
                      style={{
                        flex: 1, padding: '12px 0',
                        background: canRecall ? '#0ea5e9' : '#e2e8f0',
                        color: canRecall ? 'white' : '#94a3b8',
                        border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 14,
                        cursor: canRecall ? 'pointer' : 'not-allowed', transition: 'background 0.15s',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                      }}>
                      {isRecalling ? '⏳' : <><span style={{ fontSize: 16 }}>🔁</span> {last?.ticketNumero ?? '—'}</>}
                    </button>
                    <button onClick={() => handleAnnulla(s.id)} disabled={!last}
                      title="Annulla ultima chiamata"
                      style={{
                        padding: '12px 14px',
                        background: last ? '#fee2e2' : '#e2e8f0',
                        color: last ? '#ef4444' : '#94a3b8',
                        border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 16,
                        cursor: last ? 'pointer' : 'not-allowed', transition: 'background 0.15s',
                      }}>✕</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── COLLEGHI ONLINE ── */}
        {altriOperatori.length > 0 && (
          <div style={{
            marginTop: 28,
            background: 'white', borderRadius: 12,
            border: '1px solid #e2e8f0',
            boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
            overflow: 'hidden',
          }}>
            <div style={{
              padding: '12px 20px',
              background: '#f8fafc',
              borderBottom: '1px solid #e2e8f0',
              fontSize: 13, fontWeight: 700, color: '#475569',
              letterSpacing: 1, textTransform: 'uppercase',
            }}>
              👥 Colleghi ({altriOperatori.length})
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 0 }}>
              {altriOperatori.map((op, i) => (
                <div key={op.id} style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '12px 20px', flex: '1 1 200px',
                  borderRight: i % 2 === 0 ? '1px solid #f1f5f9' : 'none',
                  borderBottom: '1px solid #f1f5f9',
                }}>
                  {/* Indicatore stato */}
                  <div style={{
                    width: 12, height: 12, borderRadius: '50%', flexShrink: 0,
                    background: op.stato === 'ATTIVO' ? '#22c55e' : '#f59e0b',
                    boxShadow: op.stato === 'ATTIVO'
                      ? '0 0 6px rgba(34,197,94,0.6)'
                      : '0 0 6px rgba(245,158,11,0.6)',
                  }} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {op.cognome} {op.nome}
                    </div>
                    <div style={{ fontSize: 12, color: op.stato === 'ATTIVO' ? '#16a34a' : '#d97706', fontWeight: 600 }}>
                      {op.stato === 'ATTIVO' ? '● Attivo' : '⏸ In pausa'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

      </main>

      <footer style={{
        padding: '8px 24px', background: '#1e293b',
        color: '#475569', fontSize: 12, textAlign: 'center',
      }}>
        Saltacode Queue Management System
      </footer>
    </div>
  );
}

// ── Stili helper ─────────────────────────────────────────────────────────────
const S = {
  page: {
    minHeight: '100vh', background: 'linear-gradient(135deg, #1a1a2e, #16213e)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontFamily: 'system-ui, sans-serif',
  } as React.CSSProperties,
  centerBox: {
    background: 'white', borderRadius: 12, padding: 40, width: 340,
    boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
  } as React.CSSProperties,
  label: {
    display: 'block', fontSize: 12, fontWeight: 600,
    color: '#374151', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5,
  } as React.CSSProperties,
  input: {
    display: 'block', padding: '8px 12px', border: '1.5px solid #d1d5db',
    borderRadius: 6, fontSize: 14, boxSizing: 'border-box', outline: 'none',
  } as React.CSSProperties,
  errText: { color: '#ef4444', fontSize: 13, margin: '6px 0 0' } as React.CSSProperties,
  btn: (bg: string) => ({
    background: bg, color: 'white', border: 'none', borderRadius: 8,
    padding: '10px 20px', fontWeight: 700, fontSize: 14, cursor: 'pointer',
  } as React.CSSProperties),
};
