import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useWebSocket } from '../../hooks/useWebSocket';
import apiClient from '../../api/client';
import RoleSwitcher from '../../components/RoleSwitcher';
import AccountSettings from '../AccountSettings';

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

interface LastCall { chiamataId: number; ticketNumero: string; }

interface OperatoreStato {
  id: number;
  username: string;
  cognome: string;
  nome: string;
  stato: 'ATTIVO' | 'PAUSA' | 'DISABILITATO';
  postazione?: string | null;
}

export default function OperatoreDashboard() {
  const { user, logout } = useAuth();
  const [showSettings, setShowSettings] = useState(false);

  // ── Postazione ────────────────────────────────────────────────────────────
  const [postazione, setPostazione] = useState<string | null>(null);
  const [postazioneInput, setPostazioneInput] = useState('');
  const [postazioneError, setPostazioneError] = useState('');

  const handlePostazioneSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const val = postazioneInput.toUpperCase().trim();
    if (!/^\d{1,2}[A-Z]?$/.test(val)) {
      setPostazioneError('Formato non valido. Esempi: 1, 12, 3A, 12B');
      return;
    }
    setPostazioneError('');
    setPostazione(val);
  };

  // ── Pausa ─────────────────────────────────────────────────────────────────
  const [isPausa, setIsPausa] = useState(false);
  const [stateLoading, setStateLoading] = useState(false);
  const [pausaStart, setPausaStart] = useState<Date | null>(null);
  const [pausaSecs, setPausaSecs] = useState(0);

  useEffect(() => {
    if (!isPausa || !pausaStart) return;
    const t = setInterval(() => setPausaSecs(Math.floor((Date.now() - pausaStart.getTime()) / 1000)), 1000);
    return () => clearInterval(t);
  }, [isPausa, pausaStart]);

  const handleTogglePausa = async () => {
    setStateLoading(true);
    try {
      await apiClient.patch('/utenti/me/stato', { stato: isPausa ? 'ATTIVO' : 'PAUSA' });
      if (!isPausa) { setPausaStart(new Date()); setPausaSecs(0); }
      else { setPausaStart(null); setPausaSecs(0); }
      setIsPausa(!isPausa);
    } catch (err: any) { setError(err?.response?.data?.error ?? 'Errore cambio stato.'); }
    finally { setStateLoading(false); }
  };

  const fmt = (s: number) =>
    `${Math.floor(s/3600).toString().padStart(2,'0')}:${Math.floor((s%3600)/60).toString().padStart(2,'0')}:${(s%60).toString().padStart(2,'0')}`;

  // ── Servizi ───────────────────────────────────────────────────────────────
  const [servizi, setServizi] = useState<Servizio[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [code, setCode] = useState<CodaState[]>([]);
  const [lastCalls, setLastCalls] = useState<Map<number, LastCall>>(new Map());
  const [calling, setCalling] = useState<number | null>(null);
  const [recalling, setRecalling] = useState<number | null>(null);
  const [spotlight, setSpotlight] = useState<{ numero: string; servizio: string; post: string } | null>(null);

  const loadServizi = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.get<Servizio[]>('/servizi');
      setServizi(res.data.filter((s) => s.attivo));
    } catch { setError('Errore nel caricamento servizi.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { if (postazione !== null) loadServizi(); }, [postazione, loadServizi]);

  // ── Colleghi ──────────────────────────────────────────────────────────────
  const [colleghi, setColleghi] = useState<OperatoreStato[]>([]);
  const loadColleghi = useCallback(async () => {
    try { const r = await apiClient.get<OperatoreStato[]>('/utenti/operatori'); setColleghi(r.data); }
    catch { /* non bloccante */ }
  }, []);
  useEffect(() => { if (postazione !== null) loadColleghi(); }, [postazione, loadColleghi]);

  // ── WebSocket ─────────────────────────────────────────────────────────────
  const handleWsMessage = useCallback((msg: { type: string; [key: string]: unknown }) => {
    if (msg.type === 'INITIAL_STATE') setCode((msg['code'] as CodaState[]) ?? []);
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
      const { utenteId, stato, postazione: p } = msg as unknown as { utenteId: number; stato: 'ATTIVO' | 'PAUSA' | 'DISABILITATO'; postazione?: string | null };
      setColleghi((prev) => prev.map((c) => c.id === utenteId ? { ...c, stato, postazione: p ?? c.postazione } : c));
    }
  }, []);
  useWebSocket({ onMessage: handleWsMessage });

  const getCoda = (id: number) => code.find((c) => c.servizioId === id)?.count ?? 0;

  // ── Azioni ────────────────────────────────────────────────────────────────
  const handleChiama = async (s: Servizio) => {
    if (!postazione || isPausa) return;
    setError(''); setCalling(s.id);
    try {
      const res = await apiClient.post<{ chiamata: { id: number; ticketNumero: string; postazione: string } }>('/chiamate', { servizioId: s.id, postazione });
      const { chiamata } = res.data;
      setLastCalls((prev) => new Map(prev).set(s.id, { chiamataId: chiamata.id, ticketNumero: chiamata.ticketNumero }));
      setSpotlight({ numero: chiamata.ticketNumero, servizio: s.nome, post: String(chiamata.postazione) });
    } catch (err: any) {
      setError(err?.response?.status === 204 ? `Nessun ticket per ${s.nome}.` : (err?.response?.data?.error ?? 'Errore.'));
    } finally { setCalling(null); }
  };

  const handleRichiama = async (s: Servizio) => {
    const last = lastCalls.get(s.id);
    if (!last || !postazione || isPausa) return;
    setError(''); setRecalling(s.id);
    try {
      await apiClient.post('/chiamate/recall', { ticketNumero: last.ticketNumero, postazione });
      setSpotlight({ numero: last.ticketNumero, servizio: s.nome, post: postazione });
    } catch (err: any) { setError(err?.response?.data?.error ?? 'Errore richiamo.'); }
    finally { setRecalling(null); }
  };

  const handleAnnulla = async (servizioId: number) => {
    const last = lastCalls.get(servizioId);
    if (!last) return;
    setError('');
    try {
      await apiClient.delete(`/chiamate/${last.chiamataId}`);
      setLastCalls((prev) => { const n = new Map(prev); n.delete(servizioId); return n; });
      if (spotlight?.numero === last.ticketNumero) setSpotlight(null);
    } catch (err: any) { setError(err?.response?.data?.error ?? 'Errore annullamento.'); }
  };

  // ── Schermata selezione postazione ────────────────────────────────────────
  if (postazione === null) {
    return (
      <div style={{ minHeight: '100vh', background: '#1e293b', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Tahoma','Helvetica Neue',sans-serif" }}>
        <div style={{ background: 'white', borderRadius: 8, padding: 40, width: 320, boxShadow: '0 8px 32px rgba(0,0,0,0.4)' }}>
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <div style={{ fontSize: 40 }}>🖥️</div>
            <h2 style={{ margin: '8px 0 4px', fontSize: 20 }}>Saltacode</h2>
            <p style={{ margin: 0, color: '#6b7280', fontSize: 13 }}>Postazione Operatore</p>
          </div>
          <form onSubmit={handlePostazioneSubmit}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#374151', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Numero postazione
            </label>
            <input
              type="text" maxLength={3} value={postazioneInput}
              onChange={(e) => setPostazioneInput(e.target.value.toUpperCase())}
              style={{ display: 'block', width: '100%', padding: '10px', border: '2px solid #d1d5db', borderRadius: 6, fontSize: 32, textAlign: 'center', letterSpacing: 4, textTransform: 'uppercase', boxSizing: 'border-box' }}
              placeholder="1A" autoFocus
            />
            <p style={{ fontSize: 11, color: '#9ca3af', margin: '4px 0 16px', textAlign: 'center' }}>
              Es: 1 · 12 · 3A · 12B
            </p>
            {postazioneError && <p style={{ color: '#ef4444', fontSize: 12, margin: '-8px 0 12px' }}>{postazioneError}</p>}
            <button type="submit" style={{ width: '100%', padding: '10px', background: '#1e293b', color: 'white', border: 'none', borderRadius: 6, fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>
              Inizia turno
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ── Dashboard principale ──────────────────────────────────────────────────
  const altriOperatori = colleghi.filter((c) => c.id !== user?.id);

  // Raggruppa servizi per area
  const areeMap = new Map<number, { area: Servizio['area']; servizi: Servizio[] }>();
  servizi.forEach((s) => {
    if (!areeMap.has(s.areaId)) areeMap.set(s.areaId, { area: s.area, servizi: [] });
    areeMap.get(s.areaId)!.servizi.push(s);
  });
  const areeGruppi = Array.from(areeMap.values());

  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9', fontFamily: "'Tahoma','Helvetica Neue',sans-serif", display: 'flex', flexDirection: 'column' }}>

      {/* Header */}
      <header style={{
        background: isPausa ? 'linear-gradient(90deg,#b45309,#d97706)' : 'linear-gradient(90deg,#1e293b,#334155)',
        color: 'white', padding: '0 16px', height: 48,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexShrink: 0, transition: 'background 0.3s',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ background: isPausa ? '#f59e0b' : '#533483', borderRadius: 4, padding: '3px 10px', fontWeight: 900, fontSize: 16, letterSpacing: 1 }}>
            {isPausa ? '⏸' : '🖥️'} Post. {postazione}
          </span>
          {isPausa && (
            <span style={{ fontFamily: 'monospace', fontSize: 16, fontWeight: 700, color: '#fef9c3', letterSpacing: 2 }}>
              {fmt(pausaSecs)}
            </span>
          )}
          {spotlight && (
            <span style={{ background: '#533483', color: 'white', borderRadius: 4, padding: '2px 10px', fontWeight: 700, fontSize: 15, letterSpacing: 1 }}>
              ▶ {spotlight.numero} — {spotlight.servizio}
              <button onClick={() => setSpotlight(null)} style={{ background: 'none', border: 'none', color: 'white', marginLeft: 6, cursor: 'pointer', fontSize: 12 }}>✕</button>
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13 }}>{user?.username}</span>
          <button onClick={handleTogglePausa} disabled={stateLoading} style={hdrBtn(isPausa ? '#16a34a' : '#d97706')}>
            {stateLoading ? '⏳' : isPausa ? '▶ Riprendi' : '⏸ Pausa'}
          </button>
          <button onClick={() => setShowSettings(true)} style={hdrBtn('#475569')} title="Impostazioni account">⚙</button>
          <RoleSwitcher />
          <button onClick={logout} style={hdrBtn('#dc2626')}>Esci</button>
        </div>
      </header>

      {/* Banner pausa */}
      {isPausa && (
        <div style={{ background: '#fffbeb', borderBottom: '2px solid #f59e0b', padding: '6px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <span style={{ color: '#92400e', fontSize: 13, fontWeight: 600 }}>
            ⏸ Postazione in pausa da {pausaStart?.toLocaleTimeString('it-IT')} — {fmt(pausaSecs)}
          </span>
          <button onClick={handleTogglePausa} disabled={stateLoading} style={{ background: '#16a34a', color: 'white', border: 'none', borderRadius: 4, padding: '5px 14px', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
            ▶ Riprendi
          </button>
        </div>
      )}

      {error && (
        <div style={{ background: '#fee2e2', borderBottom: '1px solid #fca5a5', padding: '6px 16px', color: '#991b1b', fontSize: 13, display: 'flex', justifyContent: 'space-between', flexShrink: 0 }}>
          {error}
          <button onClick={() => setError('')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700, color: '#991b1b' }}>✕</button>
        </div>
      )}

      {/* Tabella servizi */}
      <main style={{ flex: 1, overflowY: 'auto' }}>
        {loading ? (
          <p style={{ padding: 24, color: '#888' }}>Caricamento servizi…</p>
        ) : servizi.length === 0 ? (
          <p style={{ padding: 24, color: '#888', textAlign: 'center' }}>Nessun servizio attivo assegnato.</p>
        ) : (
          areeGruppi.map(({ area, servizi: srv }) => (
            <div key={area.id}>
              {/* Intestazione area */}
              <div style={{ background: '#1e293b', color: 'white', padding: '4px 14px', fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', borderBottom: '1px solid #334155' }}>
                {area.prefisso} — {area.nome}
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                <colgroup>
                  <col style={{ width: 60 }} />
                  <col />
                  <col style={{ width: 64 }} />
                  <col style={{ width: 90 }} />
                  <col style={{ width: 100 }} />
                  <col style={{ width: 44 }} />
                </colgroup>
                <tbody>
                  {srv.map((s, idx) => {
                    const coda = getCoda(s.id);
                    const last = lastCalls.get(s.id);
                    const isCalling = calling === s.id;
                    const isRecalling = recalling === s.id;
                    const canCall = !isPausa && !isCalling && coda > 0;
                    const canRecall = !isPausa && !isRecalling && !!last;
                    const codaColor = coda === 0 ? '#64748b' : coda < 5 ? '#d97706' : '#dc2626';

                    return (
                      <tr key={s.id} style={{ background: idx % 2 === 0 ? 'white' : '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                        {/* Codice */}
                        <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                          <span style={{ fontWeight: 900, fontSize: 17, color: '#1e293b', letterSpacing: 1 }}>
                            {area.prefisso}{s.lettera}
                          </span>
                        </td>
                        {/* Nome + ultimo chiamato */}
                        <td style={{ padding: '6px 8px' }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b', lineHeight: 1.2 }}>{s.nome}</div>
                          {last && (
                            <div style={{ fontSize: 10, color: '#16a34a', fontFamily: 'monospace', marginTop: 1 }}>
                              ↳ {last.ticketNumero}
                            </div>
                          )}
                        </td>
                        {/* Coda */}
                        <td style={{ padding: '6px 4px', textAlign: 'center' }}>
                          <span style={{ fontSize: 24, fontWeight: 900, color: codaColor, lineHeight: 1 }}>{coda}</span>
                          <div style={{ fontSize: 9, color: '#94a3b8' }}>attesa</div>
                        </td>
                        {/* Chiama */}
                        <td style={{ padding: '5px 4px' }}>
                          <button
                            onClick={() => handleChiama(s)}
                            disabled={!canCall}
                            style={{ width: '100%', padding: '6px 0', background: canCall ? '#533483' : '#e2e8f0', color: canCall ? 'white' : '#94a3b8', border: 'none', borderRadius: 4, fontWeight: 700, fontSize: 12, cursor: canCall ? 'pointer' : 'not-allowed' }}
                          >
                            {isCalling ? '⏳' : '▶ Chiama'}
                          </button>
                        </td>
                        {/* Richiama */}
                        <td style={{ padding: '5px 4px' }}>
                          <button
                            onClick={() => handleRichiama(s)}
                            disabled={!canRecall}
                            title={last ? `Richiama ${last.ticketNumero}` : '—'}
                            style={{ width: '100%', padding: '6px 2px', background: canRecall ? '#0ea5e9' : '#e2e8f0', color: canRecall ? 'white' : '#94a3b8', border: 'none', borderRadius: 4, fontWeight: 700, fontSize: 11, cursor: canRecall ? 'pointer' : 'not-allowed', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                          >
                            {isRecalling ? '⏳' : `🔁 ${last?.ticketNumero ?? '—'}`}
                          </button>
                        </td>
                        {/* Annulla */}
                        <td style={{ padding: '5px 4px' }}>
                          <button
                            onClick={() => handleAnnulla(s.id)}
                            disabled={!last}
                            title="Annulla ultima chiamata"
                            style={{ width: '100%', padding: '6px 0', background: last ? '#fee2e2' : '#e2e8f0', color: last ? '#ef4444' : '#94a3b8', border: 'none', borderRadius: 4, fontWeight: 700, fontSize: 14, cursor: last ? 'pointer' : 'not-allowed' }}
                          >
                            ✕
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

      {/* Barra colleghi in fondo */}
      {altriOperatori.length > 0 && (
        <div style={{ background: '#1e293b', borderTop: '2px solid #334155', padding: '5px 16px', display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', flexShrink: 0 }}>
          <span style={{ fontSize: 10, color: '#64748b', fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', marginRight: 4 }}>Colleghi:</span>
          {altriOperatori.map((op) => (
            <div key={op.id} style={{
              display: 'flex', alignItems: 'center', gap: 4,
              background: op.stato === 'ATTIVO' ? 'rgba(34,197,94,0.12)' : 'rgba(245,158,11,0.12)',
              border: `1px solid ${op.stato === 'ATTIVO' ? 'rgba(34,197,94,0.25)' : 'rgba(245,158,11,0.25)'}`,
              borderRadius: 3, padding: '2px 7px',
            }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: op.stato === 'ATTIVO' ? '#22c55e' : '#f59e0b', display: 'inline-block', flexShrink: 0 }} />
              <span style={{ fontSize: 11, color: 'white', fontWeight: 600 }}>
                {op.cognome} {op.nome}{op.postazione ? ` — ${op.postazione}` : ''}
              </span>
            </div>
          ))}
        </div>
      )}

      {showSettings && <AccountSettings onClose={() => setShowSettings(false)} />}
    </div>
  );
}

function hdrBtn(bg: string): React.CSSProperties {
  return { background: bg, color: 'white', border: 'none', borderRadius: 4, padding: '4px 10px', fontSize: 13, fontWeight: 600, cursor: 'pointer' };
}
