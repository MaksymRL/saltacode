import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useWebSocket } from '../../hooks/useWebSocket';
import apiClient from '../../api/client';
import '../../styles/classic.css';

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
  servizioId: number;
}

interface RecentCall {
  ticketNumero: string;
  servizioNome: string;
  timestamp: Date;
  servizioId: number;
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

  // ── Stato operatore ───────────────────────────────────────────────────────
  const [isPausa, setIsPausa] = useState(false);
  const [stateLoading, setStateLoading] = useState(false);
  const [pausaStartTime, setPausaStartTime] = useState<Date | null>(null);
  const [pausaDuration, setPausaDuration] = useState(0); // in secondi

  const handleTogglePausa = async () => {
    if (!user) return;
    setStateLoading(true);
    const nuovoStato = isPausa ? 'ATTIVO' : 'PAUSA';
    try {
      await apiClient.patch('/utenti/me/stato', { stato: nuovoStato });
      setIsPausa(!isPausa);
      
      if (!isPausa) {
        // Entra in pausa
        setPausaStartTime(new Date());
        setPausaDuration(0);
      } else {
        // Esce dalla pausa
        setPausaStartTime(null);
        setPausaDuration(0);
      }
    } catch (err: any) {
      // Mostra l'errore all'utente invece di ignorarlo silenziosamente
      setError(err?.response?.data?.error ?? 'Errore cambio stato.');
    } finally {
      setStateLoading(false);
    }
  };

  // ── Servizi ───────────────────────────────────────────────────────────────
  const [servizi, setServizi] = useState<Servizio[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [code, setCode] = useState<CodaState[]>([]);
  const [calling, setCalling] = useState<number | null>(null); // servizioId in chiamata
  const [lastCalls, setLastCalls] = useState<Map<number, LastCall>>(new Map()); // per annullare
  const [lastCalledTicket, setLastCalledTicket] = useState<{ numero: string; servizio: string } | null>(null);
  const [recentCalls, setRecentCalls] = useState<RecentCall[]>([]); // storico chiamate recenti
  
  // Trigger per refresh automatico
  const [refreshTrigger, setRefreshTrigger] = useState(0);

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
  }, [postazione, loadServizi, refreshTrigger]);

  // Timer per la pausa
  useEffect(() => {
    if (!isPausa || !pausaStartTime) return;

    const interval = setInterval(() => {
      const now = new Date();
      const elapsed = Math.floor((now.getTime() - pausaStartTime.getTime()) / 1000);
      setPausaDuration(elapsed);
    }, 1000);

    return () => clearInterval(interval);
  }, [isPausa, pausaStartTime]);

  // Pulisce le chiamate recenti quando si cambia postazione
  useEffect(() => {
    if (postazione === null) {
      setRecentCalls([]);
    }
  }, [postazione]);

  // WebSocket
  const handleWsMessage = useCallback((msg: { type: string; [key: string]: unknown }) => {
    if (msg.type === 'INITIAL_STATE') {
      setCode((msg['code'] as CodaState[]) ?? []);
    }
    if (msg.type === 'TICKET_EMESSO') {
      const { servizioId, coda } = msg as unknown as { servizioId: number; coda: number };
      setCode((prev) => {
        const existing = prev.find((c) => c.servizioId === servizioId);
        if (existing) return prev.map((c) => c.servizioId === servizioId ? { ...c, count: coda } : c);
        return [...prev, { servizioId, count: coda }];
      });
    }
    if (msg.type === 'NUMERO_CHIAMATO') {
      const { servizioId } = msg as unknown as { servizioId: number };
      setCode((prev) =>
        prev.map((c) => c.servizioId === servizioId ? { ...c, count: Math.max(0, c.count - 1) } : c)
      );
    }
    // Nuovo handler per aggiornamenti coda più precisi
    if (msg.type === 'CODA_AGGIORNATA') {
      const { servizioId, count } = msg as unknown as { servizioId: number; count: number };
      setCode((prev) => {
        const existing = prev.find((c) => c.servizioId === servizioId);
        if (existing) return prev.map((c) => c.servizioId === servizioId ? { ...c, count } : c);
        return [...prev, { servizioId, count }];
      });
    }
    // Handler per stato operatori - aggiorna automaticamente lo stato pausa
    if (msg.type === 'STATO_OPERATORE') {
      const { utenteId, stato } = msg as unknown as { utenteId: number; stato: string };
      if (utenteId === user?.id) {
        const wasInPausa = isPausa;
        const nowInPausa = stato === 'PAUSA';
        
        setIsPausa(nowInPausa);
        
        if (!wasInPausa && nowInPausa) {
          // Entra in pausa
          setPausaStartTime(new Date());
          setPausaDuration(0);
        } else if (wasInPausa && !nowInPausa) {
          // Esce dalla pausa
          setPausaStartTime(null);
          setPausaDuration(0);
        }
        
        // Trigger refresh per aggiornare la lista servizi se necessario
        setRefreshTrigger(prev => prev + 1);
      }
    }
    // Handler per richiami
    if (msg.type === 'NUMERO_RICHIAMATO') {
      const { ticket, servizio } = msg as unknown as { ticket: string; servizio: string };
      setLastCalledTicket({ numero: ticket, servizio });
    }
  }, [user?.id, isPausa]);

  useWebSocket({ onMessage: handleWsMessage });

  // ── Chiama prossimo ───────────────────────────────────────────────────────
  const handleChiama = async (servizioId: number, nomeServizio: string) => {
    if (!postazione || isPausa) return;
    setError('');
    setCalling(servizioId);
    try {
      const res = await apiClient.post<{
        chiamata: { id: number; ticketNumero: string; postazione: number; timestamp: string };
      }>('/chiamate', { servizioId, postazione });

      const { chiamata } = res.data;
      setLastCalls((prev) => {
        const next = new Map(prev);
        next.set(servizioId, { chiamataId: chiamata.id, ticketNumero: chiamata.ticketNumero, servizioId });
        return next;
      });
      setLastCalledTicket({ numero: chiamata.ticketNumero, servizio: nomeServizio });
      
      // Aggiungi alla cronologia delle chiamate recenti (max 10)
      setRecentCalls((prev) => {
        const newCall: RecentCall = {
          ticketNumero: chiamata.ticketNumero,
          servizioNome: nomeServizio,
          timestamp: new Date(),
          servizioId
        };
        return [newCall, ...prev.slice(0, 9)]; // Keep only last 10
      });
    } catch (err: any) {
      if (err?.response?.status === 204) {
        setError(`Nessun ticket in attesa per ${nomeServizio}.`);
      } else {
        setError(err?.response?.data?.error ?? 'Errore chiamata.');
      }
    } finally {
      setCalling(null);
    }
  };

  // ── Richiama numero precedente ──────────────────────────────────────────
  const handleRichiama = async (ticketNumero: string, servizioNome: string) => {
    if (!postazione || isPausa) return;
    setError('');
    try {
      const res = await apiClient.post<{
        chiamata: { id: number; ticketNumero: string; postazione: number; timestamp: string };
      }>('/chiamate/recall', { ticketNumero, postazione });

      const { chiamata } = res.data;
      setLastCalledTicket({ numero: chiamata.ticketNumero, servizio: servizioNome });
    } catch (err: any) {
      if (err?.response?.status === 404) {
        setError(`Numero ${ticketNumero} non trovato o non ancora chiamato.`);
      } else {
        setError(err?.response?.data?.error ?? 'Errore richiamo.');
      }
    }
  };
  const handleAnnulla = async (servizioId: number) => {
    const last = lastCalls.get(servizioId);
    if (!last) return;
    setError('');
    try {
      await apiClient.delete(`/chiamate/${last.chiamataId}`);
      setLastCalls((prev) => {
        const next = new Map(prev);
        next.delete(servizioId);
        return next;
      });
      if (lastCalledTicket?.numero === last.ticketNumero) {
        setLastCalledTicket(null);
      }
    } catch (err: any) {
      setError(err?.response?.data?.error ?? 'Errore annullamento.');
    }
  };

  const getCoda = (servizioId: number) =>
    code.find((c) => c.servizioId === servizioId)?.count ?? 0;

  // Formatta il tempo di pausa in HH:MM:SS
  const formatPausaDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // ── Schermata selezione postazione ────────────────────────────────────────
  if (postazione === null) {
    return (
      <div className="classic-layout">
        <div className="classic-header">
          <h1>🖥️ Saltacode - Postazione Operatore</h1>
        </div>
        <div className="classic-main" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <div className="classic-section" style={{ maxWidth: 400, textAlign: 'center' }}>
            <div className="classic-section-header">
              Numero Postazione
            </div>
            <div className="classic-section-content">
              <p style={{ marginBottom: 20 }}>Inserisci il numero della tua postazione per iniziare</p>
              <form onSubmit={handlePostazioneSubmit}>
                <input
                  type="number" min={1} max={99}
                  value={postazioneInput}
                  onChange={(e) => setPostazioneInput(e.target.value)}
                  className="classic-input"
                  style={{ fontSize: 18, textAlign: 'center', width: 80, marginBottom: 15 }}
                  autoFocus
                />
                {postazioneError && <p style={{ color: 'red', margin: '8px 0', fontSize: 14 }}>{postazioneError}</p>}
                <br />
                <button type="submit" className="classic-btn classic-btn-primary" style={{ fontSize: 16, padding: '10px 32px' }}>
                  Conferma
                </button>
              </form>
            </div>
          </div>
        </div>
        <div className="classic-footer">
          Saltacode Queue Management System
        </div>
      </div>
    );
  }

  // ── Schermata di pausa dedicata ──────────────────────────────────────────
  if (isPausa && postazione !== null) {
    return (
      <div className="classic-layout">
        <div className="classic-header" style={{ background: '#f59e0b', borderBottomColor: '#d97706' }}>
          <h1 style={{ color: 'white' }}>🖥️ Postazione {postazione} - IN PAUSA</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 15 }}>
            <span style={{ color: 'white', fontSize: 14 }}>{user?.username}</span>
            <button onClick={logout} className="classic-btn classic-btn-danger">Esci</button>
          </div>
        </div>

        <div className="classic-main" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
          <div className="classic-section" style={{ maxWidth: 600, marginBottom: 30 }}>
            <div className="classic-section-header" style={{ background: '#fbbf24', fontSize: 20, textAlign: 'center' }}>
              ⏸️ POSTAZIONE IN PAUSA
            </div>
            <div className="classic-section-content">
              <div style={{ fontSize: 48, fontFamily: 'monospace', fontWeight: 'bold', color: '#dc2626', marginBottom: 20, letterSpacing: 2 }}>
                {formatPausaDuration(pausaDuration)}
              </div>
              <p style={{ fontSize: 16, marginBottom: 15, color: '#374151' }}>
                Tempo di pausa trascorso
              </p>
              {pausaStartTime && (
                <p style={{ fontSize: 14, color: '#6b7280', marginBottom: 20 }}>
                  Pausa iniziata alle {pausaStartTime.toLocaleTimeString()}
                </p>
              )}
              <button
                onClick={handleTogglePausa}
                disabled={stateLoading}
                className="classic-btn classic-btn-success"
                style={{ fontSize: 18, padding: '15px 40px', marginTop: 10 }}
              >
                {stateLoading ? '⏳ Attendi...' : '▶ Riprendi Servizio'}
              </button>
            </div>
          </div>
          
          <div style={{ fontSize: 14, color: '#6b7280', textAlign: 'center', maxWidth: 400 }}>
            <p>Sei attualmente in pausa. I clienti non possono essere chiamati.</p>
            <p>Premi "Riprendi Servizio" quando sei pronto a continuare.</p>
          </div>
        </div>

        <div className="classic-footer">
          Saltacode Queue Management System
        </div>
      </div>
    );
  }

  // ── Dashboard principale ──────────────────────────────────────────────────
  return (
    <div className="classic-layout">
      <div className="classic-header">
        <div>
          <h1>🖥️ Postazione {postazione}</h1>
          <div style={{ fontSize: 12, color: '#666', marginTop: 2 }}>Operatore: {user?.username}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={handleTogglePausa}
            disabled={stateLoading}
            className={`classic-btn ${isPausa ? 'classic-btn-danger' : 'classic-btn-success'}`}
            style={{ fontSize: 14 }}
          >
            {isPausa ? '🟡 In Pausa' : '🟢 Attivo'}
          </button>
          <button onClick={logout} className="classic-btn classic-btn-danger">Esci</button>
        </div>
      </div>

      <main style={{ padding: 24, maxWidth: 1000, margin: '0 auto' }}>

        {/* Ultimo numero chiamato */}
        {lastCalledTicket && (
          <div style={{
            background: '#533483', color: 'white', borderRadius: 10,
            padding: '16px 24px', marginBottom: 24,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <div>
              <div style={{ fontSize: 13, opacity: 0.7, marginBottom: 4 }}>NUMERO CHIAMATO</div>
              <div style={{ fontSize: 40, fontWeight: 900 }}>{lastCalledTicket.numero}</div>
              <div style={{ fontSize: 14, opacity: 0.8 }}>{lastCalledTicket.servizio} → Postazione {postazione}</div>
            </div>
            <button onClick={() => setLastCalledTicket(null)} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: 'white', borderRadius: 4, padding: '4px 10px', cursor: 'pointer' }}>✕</button>
          </div>
        )}

        {isPausa && (
          <div style={{ 
            background: 'linear-gradient(135deg, #fef9c3 0%, #fde047 100%)', 
            border: '2px solid #f59e0b', 
            borderRadius: 12, 
            padding: '16px 20px', 
            marginBottom: 20, 
            color: '#854d0e',
            boxShadow: '0 4px 8px rgba(245, 158, 11, 0.2)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 24 }}>⏸️</span>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 16 }}>Postazione in pausa</div>
                  <div style={{ fontSize: 14, opacity: 0.8 }}>
                    Tempo di pausa: <strong style={{ fontFamily: 'monospace' }}>{formatPausaDuration(pausaDuration)}</strong>
                    {pausaStartTime && ` (dalle ${pausaStartTime.toLocaleTimeString()})`}
                  </div>
                </div>
              </div>
              <button 
                onClick={handleTogglePausa}
                disabled={stateLoading}
                style={{
                  background: '#22c55e',
                  color: 'white',
                  border: 'none',
                  borderRadius: 8,
                  padding: '10px 20px',
                  fontWeight: 700,
                  cursor: stateLoading ? 'not-allowed' : 'pointer',
                  opacity: stateLoading ? 0.7 : 1
                }}
              >
                {stateLoading ? '⏳' : '▶ Riprendi'}
              </button>
            </div>
          </div>
        )}

        {error && (
          <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 6, padding: '10px 16px', marginBottom: 16, color: '#991b1b' }}>
            {error}
            <button onClick={() => setError('')} style={{ float: 'right', background: 'none', border: 'none', cursor: 'pointer', color: '#991b1b', fontWeight: 700 }}>✕</button>
          </div>
        )}

        <h2 style={{ marginTop: 0 }}>Servizi</h2>

        {/* Sezione chiamate recenti */}
        {recentCalls.length > 0 && (
          <div style={{ 
            background: 'white', 
            borderRadius: 10, 
            boxShadow: '0 2px 8px rgba(0,0,0,0.08)', 
            padding: 16, 
            marginBottom: 20,
            borderTop: '3px solid #8b5cf6'
          }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 16, color: '#8b5cf6' }}>📞 Chiamate Recenti</h3>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {recentCalls.slice(0, 5).map((call, index) => (
                <button
                  key={`${call.ticketNumero}-${index}`}
                  onClick={() => handleRichiama(call.ticketNumero, call.servizioNome)}
                  disabled={isPausa}
                  style={{
                    background: isPausa ? '#f3f4f6' : '#8b5cf6',
                    color: isPausa ? '#9ca3af' : 'white',
                    border: 'none',
                    borderRadius: 6,
                    padding: '6px 12px',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: isPausa ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    minWidth: 80
                  }}
                  title={`Richiama ${call.ticketNumero} (${call.servizioNome}) - ${call.timestamp.toLocaleTimeString()}`}
                >
                  <span>{call.ticketNumero}</span>
                  <span style={{ fontSize: 10, opacity: 0.8 }}>{call.timestamp.toLocaleTimeString()}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {loading ? (
          <p>Caricamento servizi…</p>
        ) : servizi.length === 0 ? (
          <p style={{ color: '#888' }}>Nessun servizio attivo assegnato.</p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
            {servizi.map((s) => {
              const coda = getCoda(s.id);
              const lastCall = lastCalls.get(s.id);
              const isCalling = calling === s.id;

              return (
                <div key={s.id} style={{
                  background: 'white', borderRadius: 10,
                  boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                  padding: 20, borderTop: '4px solid #533483',
                }}>
                  <div style={{ fontSize: 11, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 1 }}>
                    {s.area.prefisso}{s.lettera}
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 700, margin: '4px 0 12px' }}>{s.nome}</div>

                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 16 }}>
                    <span style={{
                      fontSize: 36, fontWeight: 900,
                      color: coda === 0 ? '#9ca3af' : coda < 5 ? '#f59e0b' : '#ef4444',
                    }}>{coda}</span>
                    <span style={{ fontSize: 13, color: '#9ca3af' }}>in attesa</span>
                  </div>

                  {lastCall && (
                    <div style={{ background: '#f0fdf4', borderRadius: 6, padding: '6px 10px', marginBottom: 10, fontSize: 13 }}>
                      Ultimo chiamato: <strong>{lastCall.ticketNumero}</strong>
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={() => handleChiama(s.id, s.nome)}
                      disabled={isCalling || isPausa || coda === 0}
                      style={{
                        flex: 1, padding: '10px 0', fontWeight: 700, fontSize: 16,
                        background: isCalling || isPausa || coda === 0 ? '#e5e7eb' : '#533483',
                        color: isCalling || isPausa || coda === 0 ? '#9ca3af' : 'white',
                        border: 'none', borderRadius: 6, cursor: isCalling || isPausa || coda === 0 ? 'not-allowed' : 'pointer',
                      }}
                      title="Chiama prossimo"
                    >
                      {isCalling ? '⏳' : '▶ Chiama'}
                    </button>
                    <button
                      onClick={() => handleAnnulla(s.id)}
                      disabled={!lastCall}
                      title="Annulla ultima chiamata"
                      style={{
                        padding: '10px 14px', fontWeight: 700, fontSize: 16,
                        background: lastCall ? '#fee2e2' : '#f3f4f6',
                        color: lastCall ? '#ef4444' : '#9ca3af',
                        border: 'none', borderRadius: 6, cursor: lastCall ? 'pointer' : 'not-allowed',
                      }}
                    >
                      ✕
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      <div className="classic-footer">
        Saltacode Queue Management System
      </div>
    </div>
  );
}
