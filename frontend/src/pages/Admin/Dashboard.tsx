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
  _count: { ticket: number }; // ticket in ATTESA
}

interface Utente {
  id: number;
  username: string;
  cognome: string;
  nome: string;
  stato: string;
  ruolo: { id: number; nome: string };
  utentiAree: { areaId: number }[];
}

interface CodaState {
  servizioId: number;
  nomeServizio: string;
  count: number;
}

type Tab = 'code' | 'servizi' | 'operatori';

export default function AdminDashboard() {
  const { user, logout } = useAuth();
  const [tab, setTab] = useState<Tab>('code');

  // ── Servizi ───────────────────────────────────────────────────────────────
  const [servizi, setServizi] = useState<Servizio[]>([]);
  const [serviziLoading, setServiziLoading] = useState(false);
  const [serviziError, setServiziError] = useState('');
  const [nuovoServizio, setNuovoServizio] = useState({ nome: '', lettera: '' });

  const loadServizi = useCallback(async () => {
    setServiziLoading(true);
    try {
      const res = await apiClient.get<Servizio[]>('/servizi');
      setServizi(res.data);
    } catch {
      setServiziError('Errore nel caricamento servizi.');
    } finally {
      setServiziLoading(false);
    }
  }, []);

  useEffect(() => {
    loadServizi();
  }, [loadServizi]);

  // ── Operatori ─────────────────────────────────────────────────────────────
  const [operatori, setOperatori] = useState<Utente[]>([]);
  const [operatoriLoading, setOperatoriLoading] = useState(false);
  const [operatoriError, setOperatoriError] = useState('');
  const [nuovoOp, setNuovoOp] = useState({ cognome: '', nome: '' });
  const [tempPwd, setTempPwd] = useState<{ username: string; pwd: string } | null>(null);

  const loadOperatori = useCallback(async () => {
    setOperatoriLoading(true);
    try {
      const res = await apiClient.get<Utente[]>('/utenti');
      setOperatori(res.data.filter((u) => u.ruolo.nome === 'OPERATORE'));
    } catch {
      setOperatoriError('Errore nel caricamento operatori.');
    } finally {
      setOperatoriLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === 'operatori') loadOperatori();
  }, [tab, loadOperatori]);

  // ── Code real-time via WebSocket ──────────────────────────────────────────
  const [code, setCode] = useState<CodaState[]>([]);

  const handleWsMessage = useCallback((msg: { type: string; [key: string]: unknown }) => {
    if (msg.type === 'INITIAL_STATE') {
      setCode((msg['code'] as CodaState[]) ?? []);
    }
    if (msg.type === 'TICKET_EMESSO') {
      const { servizioId, coda } = msg as unknown as { servizioId: number; coda: number };
      setCode((prev) => {
        const existing = prev.find((c) => c.servizioId === servizioId);
        if (existing) {
          return prev.map((c) => c.servizioId === servizioId ? { ...c, count: coda } : c);
        }
        const s = servizi.find((s) => s.id === servizioId);
        return [...prev, { servizioId, nomeServizio: s?.nome ?? '?', count: coda }];
      });
    }
    if (msg.type === 'NUMERO_CHIAMATO') {
      const { servizioId } = msg as unknown as { servizioId: number };
      setCode((prev) =>
        prev.map((c) => c.servizioId === servizioId ? { ...c, count: Math.max(0, c.count - 1) } : c)
      );
    }
  }, [servizi]);

  useWebSocket({ onMessage: handleWsMessage });

  // ── Crea Servizio ─────────────────────────────────────────────────────────
  const handleCreaServizio = async (e: React.FormEvent) => {
    e.preventDefault();
    setServiziError('');
    try {
      const areaId = user?.aree[0];
      if (!areaId) { setServiziError('Nessuna area assegnata.'); return; }
      await apiClient.post('/servizi', {
        nome: nuovoServizio.nome,
        lettera: nuovoServizio.lettera.toUpperCase(),
        areaId,
      });
      setNuovoServizio({ nome: '', lettera: '' });
      loadServizi();
    } catch (err: any) {
      setServiziError(err?.response?.data?.error ?? 'Errore creazione servizio.');
    }
  };

  const handleToggleServizio = async (s: Servizio) => {
    try {
      await apiClient.patch(`/servizi/${s.id}`, { attivo: !s.attivo });
      loadServizi();
    } catch (err: any) {
      setServiziError(err?.response?.data?.error ?? 'Errore aggiornamento servizio.');
    }
  };

  // ── Crea Operatore ────────────────────────────────────────────────────────
  const handleCreaOperatore = async (e: React.FormEvent) => {
    e.preventDefault();
    setOperatoriError('');
    setTempPwd(null);
    try {
      const areaId = user?.aree[0];
      if (!areaId) { setOperatoriError('Nessuna area assegnata.'); return; }
      const res = await apiClient.post<Utente & { tempPassword: string }>('/utenti', {
        cognome: nuovoOp.cognome,
        nome: nuovoOp.nome,
        ruoloId: 4, // OPERATORE
        aree: [areaId],
      });
      setTempPwd({ username: res.data.username, pwd: res.data.tempPassword });
      setNuovoOp({ cognome: '', nome: '' });
      loadOperatori();
    } catch (err: any) {
      setOperatoriError(err?.response?.data?.error ?? 'Errore creazione operatore.');
    }
  };

  const handleToggleOperatore = async (u: Utente) => {
    const nuovoStato = u.stato === 'DISABILITATO' ? 'ATTIVO' : 'DISABILITATO';
    try {
      await apiClient.patch(`/utenti/${u.id}`, { stato: nuovoStato });
      loadOperatori();
    } catch (err: any) {
      setOperatoriError(err?.response?.data?.error ?? 'Errore.');
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  const tabs: { id: Tab; label: string }[] = [
    { id: 'code', label: '📊 Code in tempo reale' },
    { id: 'servizi', label: '🔧 Servizi' },
    { id: 'operatori', label: '👥 Operatori' },
  ];

  return (
    <div style={{ minHeight: '100vh', background: '#f5f5f5', fontFamily: 'system-ui, sans-serif' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 24px', background: '#16213e', color: 'white' }}>
        <h1 style={{ margin: 0, fontSize: 20 }}>📋 Saltacode — Admin</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ color: '#aaa', fontSize: 14 }}>{user?.username}</span>
          <button onClick={logout} style={btnStyle('#ef4444')}>Esci</button>
        </div>
      </header>

      <div style={{ background: 'white', borderBottom: '1px solid #e0e0e0', padding: '0 24px', display: 'flex' }}>
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: '12px 20px', border: 'none',
            borderBottom: tab === t.id ? '3px solid #16213e' : '3px solid transparent',
            background: 'none', fontWeight: tab === t.id ? 700 : 400,
            cursor: 'pointer', fontSize: 14,
          }}>
            {t.label}
          </button>
        ))}
      </div>

      <main style={{ padding: 24, maxWidth: 1000, margin: '0 auto' }}>

        {/* ── TAB CODE ── */}
        {tab === 'code' && (
          <>
            <h2 style={{ marginTop: 0 }}>Code per servizio — aggiornamento automatico</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16 }}>
              {servizi.filter((s) => s.attivo).map((s) => {
                const coda = code.find((c) => c.servizioId === s.id);
                const count = coda?.count ?? 0;
                return (
                  <div key={s.id} style={{
                    ...cardStyle,
                    borderLeft: `5px solid ${count > 10 ? '#ef4444' : count > 5 ? '#f59e0b' : '#22c55e'}`,
                    marginBottom: 0,
                  }}>
                    <div style={{ fontSize: 12, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>
                      {s.area.prefisso}{s.lettera}
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>{s.nome}</div>
                    <div style={{ fontSize: 36, fontWeight: 900, color: count > 10 ? '#ef4444' : count > 5 ? '#f59e0b' : '#22c55e' }}>
                      {count}
                    </div>
                    <div style={{ fontSize: 12, color: '#9ca3af' }}>in attesa</div>
                  </div>
                );
              })}
              {servizi.filter((s) => s.attivo).length === 0 && (
                <p style={{ color: '#888' }}>Nessun servizio attivo.</p>
              )}
            </div>
          </>
        )}

        {/* ── TAB SERVIZI ── */}
        {tab === 'servizi' && (
          <>
            <h2 style={{ marginTop: 0 }}>Gestione Servizi</h2>
            <div style={cardStyle}>
              <h3 style={{ margin: '0 0 16px' }}>Nuovo servizio</h3>
              <form onSubmit={handleCreaServizio} style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <div>
                  <label style={labelStyle}>Nome servizio</label>
                  <input style={inputStyle} value={nuovoServizio.nome}
                    onChange={(e) => setNuovoServizio((p) => ({ ...p, nome: e.target.value }))}
                    placeholder="es. Dichiarazione dei Redditi" required />
                </div>
                <div>
                  <label style={labelStyle}>Lettera (1 char)</label>
                  <input style={{ ...inputStyle, width: 60, textTransform: 'uppercase' }}
                    value={nuovoServizio.lettera}
                    onChange={(e) => setNuovoServizio((p) => ({ ...p, lettera: e.target.value.toUpperCase().slice(0, 1) }))}
                    placeholder="A" maxLength={1} required />
                </div>
                <button type="submit" style={btnStyle('#16213e')}>Crea Servizio</button>
              </form>
              {serviziError && <p style={errorStyle}>{serviziError}</p>}
            </div>
            {serviziLoading ? <p>Caricamento…</p> : (
              <div style={cardStyle}>
                <h3 style={{ margin: '0 0 16px' }}>Servizi ({servizi.length})</h3>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: '#f5f5f5' }}>
                      {['Codice', 'Nome', 'Area', 'In coda', 'Stato', 'Azioni'].map((h) => (
                        <th key={h} style={thStyle}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {servizi.map((s) => (
                      <tr key={s.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                        <td style={tdStyle}><strong>{s.area.prefisso}{s.lettera}</strong></td>
                        <td style={tdStyle}>{s.nome}</td>
                        <td style={tdStyle}>{s.area.nome}</td>
                        <td style={tdStyle}>{s._count.ticket}</td>
                        <td style={tdStyle}>
                          <span style={{
                            display: 'inline-block', padding: '2px 8px', borderRadius: 12,
                            background: s.attivo ? '#dcfce7' : '#fee2e2',
                            color: s.attivo ? '#166534' : '#991b1b',
                            fontSize: 12, fontWeight: 600,
                          }}>
                            {s.attivo ? 'Attivo' : 'Disabilitato'}
                          </span>
                        </td>
                        <td style={tdStyle}>
                          <button onClick={() => handleToggleServizio(s)}
                            style={btnStyle(s.attivo ? '#f59e0b' : '#22c55e', 'small')}>
                            {s.attivo ? 'Disabilita' : 'Abilita'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {/* ── TAB OPERATORI ── */}
        {tab === 'operatori' && (
          <>
            <h2 style={{ marginTop: 0 }}>Gestione Operatori</h2>

            {tempPwd && (
              <div style={{ ...cardStyle, background: '#fffbeb', border: '1px solid #f59e0b' }}>
                <strong>⚠️ Credenziali temporanee:</strong>
                <p style={{ fontFamily: 'monospace', fontSize: 15, margin: '8px 0 4px' }}>
                  Username: <strong>{tempPwd.username}</strong>
                </p>
                <p style={{ fontFamily: 'monospace', fontSize: 15, margin: '0 0 8px' }}>
                  Password: <strong>{tempPwd.pwd}</strong>
                </p>
                <button onClick={() => setTempPwd(null)} style={btnStyle('#6b7280', 'small')}>Chiudi</button>
              </div>
            )}

            <div style={cardStyle}>
              <h3 style={{ margin: '0 0 16px' }}>Nuovo operatore</h3>
              <form onSubmit={handleCreaOperatore} style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <div>
                  <label style={labelStyle}>Cognome</label>
                  <input style={inputStyle} value={nuovoOp.cognome}
                    onChange={(e) => setNuovoOp((p) => ({ ...p, cognome: e.target.value }))}
                    placeholder="Rossi" required />
                </div>
                <div>
                  <label style={labelStyle}>Nome</label>
                  <input style={inputStyle} value={nuovoOp.nome}
                    onChange={(e) => setNuovoOp((p) => ({ ...p, nome: e.target.value }))}
                    placeholder="Mario" required />
                </div>
                <button type="submit" style={btnStyle('#16213e')}>Crea Operatore</button>
              </form>
              {operatoriError && <p style={errorStyle}>{operatoriError}</p>}
            </div>

            {operatoriLoading ? <p>Caricamento…</p> : (
              <div style={cardStyle}>
                <h3 style={{ margin: '0 0 16px' }}>Operatori ({operatori.length})</h3>
                {operatori.length === 0 ? (
                  <p style={{ color: '#888' }}>Nessun operatore.</p>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: '#f5f5f5' }}>
                        {['Username', 'Nome', 'Stato', 'Azioni'].map((h) => (
                          <th key={h} style={thStyle}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {operatori.map((u) => (
                        <tr key={u.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                          <td style={tdStyle}><code>{u.username}</code></td>
                          <td style={tdStyle}>{u.cognome} {u.nome}</td>
                          <td style={tdStyle}>
                            <span style={{
                              display: 'inline-block', padding: '2px 8px', borderRadius: 12,
                              background: u.stato === 'ATTIVO' ? '#dcfce7' : u.stato === 'PAUSA' ? '#fef9c3' : '#fee2e2',
                              color: u.stato === 'ATTIVO' ? '#166534' : u.stato === 'PAUSA' ? '#854d0e' : '#991b1b',
                              fontSize: 12, fontWeight: 600,
                            }}>
                              {u.stato}
                            </span>
                          </td>
                          <td style={tdStyle}>
                            <button onClick={() => handleToggleOperatore(u)}
                              style={btnStyle(u.stato === 'DISABILITATO' ? '#22c55e' : '#ef4444', 'small')}>
                              {u.stato === 'DISABILITATO' ? 'Abilita' : 'Disabilita'}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  background: 'white', borderRadius: 8, padding: 20,
  boxShadow: '0 1px 3px rgba(0,0,0,0.1)', marginBottom: 20,
};
const inputStyle: React.CSSProperties = {
  display: 'block', padding: '7px 10px', border: '1px solid #d1d5db',
  borderRadius: 4, fontSize: 14, minWidth: 180,
};
const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 12, fontWeight: 600,
  color: '#374151', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5,
};
const thStyle: React.CSSProperties = {
  textAlign: 'left', padding: '8px 12px', fontSize: 12,
  fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5,
};
const tdStyle: React.CSSProperties = {
  padding: '10px 12px', fontSize: 14, verticalAlign: 'middle',
};
const errorStyle: React.CSSProperties = { color: '#ef4444', margin: '8px 0 0', fontSize: 14 };
function btnStyle(bg: string, size: 'normal' | 'small' = 'normal'): React.CSSProperties {
  return {
    background: bg, color: 'white', border: 'none', borderRadius: 4,
    cursor: 'pointer', fontWeight: 600,
    padding: size === 'small' ? '4px 10px' : '8px 16px',
    fontSize: size === 'small' ? 12 : 14,
  };
}
