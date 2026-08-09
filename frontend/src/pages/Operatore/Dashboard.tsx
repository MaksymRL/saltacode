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

  const handleTogglePausa = async () => {
    if (!user) return;
    setStateLoading(true);
    const nuovoStato = isPausa ? 'ATTIVO' : 'PAUSA';
    try {
      await apiClient.patch(`/utenti/${user.id}`, { stato: nuovoStato });
      setIsPausa(!isPausa);
    } catch {
      // ignora — UI torna allo stato precedente
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
  }, []);

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

  // ── Annulla ultima chiamata ───────────────────────────────────────────────
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

  // ── Schermata selezione postazione ────────────────────────────────────────
  if (postazione === null) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: '#f5f0ff' }}>
        <div style={{ background: 'white', borderRadius: 12, padding: 40, textAlign: 'center', boxShadow: '0 4px 16px rgba(0,0,0,0.1)', minWidth: 300 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🖥️</div>
          <h2 style={{ margin: '0 0 8px' }}>Numero Postazione</h2>
          <p style={{ color: '#888', marginBottom: 24 }}>Inserisci il numero della tua postazione per iniziare</p>
          <form onSubmit={handlePostazioneSubmit}>
            <input
              type="number" min={1} max={99}
              value={postazioneInput}
              onChange={(e) => setPostazioneInput(e.target.value)}
              style={{ padding: '10px 16px', fontSize: 24, width: 100, textAlign: 'center', borderRadius: 6, border: '2px solid #533483', outline: 'none' }}
              autoFocus
            />
            {postazioneError && <p style={{ color: '#ef4444', margin: '8px 0' }}>{postazioneError}</p>}
            <br />
            <button type="submit" style={{ ...btnStyle('#533483'), marginTop: 16, padding: '10px 32px', fontSize: 16 }}>
              Conferma
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ── Dashboard principale ──────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: '#f5f0ff', fontFamily: 'system-ui, sans-serif' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 24px', background: '#533483', color: 'white' }}>
        <h1 style={{ margin: 0, fontSize: 20 }}>
          🖥️ Postazione <strong>{postazione}</strong>
        </h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            onClick={handleTogglePausa}
            disabled={stateLoading}
            style={{
              background: isPausa ? '#f59e0b' : '#22c55e',
              color: 'white', border: 'none', borderRadius: 20,
              padding: '6px 16px', fontWeight: 700, cursor: 'pointer',
            }}
          >
            {isPausa ? '🟡 In Pausa' : '🟢 Attivo'}
          </button>
          <span style={{ color: '#ddd', fontSize: 14 }}>{user?.username}</span>
          <button onClick={logout} style={btnStyle('#ef4444')}>Esci</button>
        </div>
      </header>

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
          <div style={{ background: '#fef9c3', border: '1px solid #fde047', borderRadius: 8, padding: '12px 16px', marginBottom: 20, color: '#854d0e' }}>
            ⚠️ Sei in pausa. Riattiva la postazione per chiamare nuovi clienti.
          </div>
        )}

        {error && (
          <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 6, padding: '10px 16px', marginBottom: 16, color: '#991b1b' }}>
            {error}
            <button onClick={() => setError('')} style={{ float: 'right', background: 'none', border: 'none', cursor: 'pointer', color: '#991b1b', fontWeight: 700 }}>✕</button>
          </div>
        )}

        <h2 style={{ marginTop: 0 }}>Servizi</h2>

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
    </div>
  );
}

function btnStyle(bg: string): React.CSSProperties {
  return {
    background: bg, color: 'white', border: 'none',
    borderRadius: 4, cursor: 'pointer', fontWeight: 600,
    padding: '8px 16px', fontSize: 14,
  };
}
