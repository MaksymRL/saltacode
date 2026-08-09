import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../hooks/useAuth';
import apiClient from '../../api/client';

interface Area {
  id: number;
  nome: string;
  prefisso: string;
  attiva: boolean;
  createdAt: string;
  _count: { servizi: number; utentiAree: number };
}

interface Ruolo {
  id: number;
  nome: string;
}

interface Utente {
  id: number;
  username: string;
  cognome: string;
  nome: string;
  stato: string;
  mustChangePwd: boolean;
  ruolo: { id: number; nome: string };
  utentiAree: { areaId: number }[];
}

type Tab = 'aree' | 'utenti';

export default function SuperAdminDashboard() {
  const { user, logout } = useAuth();
  const [tab, setTab] = useState<Tab>('aree');

  // ── Aree ──────────────────────────────────────────────────────────────────
  const [aree, setAree] = useState<Area[]>([]);
  const [areeLoading, setAreeLoading] = useState(false);
  const [nuovaArea, setNuovaArea] = useState({ nome: '', prefisso: '' });
  const [areaError, setAreaError] = useState('');
  const [areaSuccess, setAreaSuccess] = useState('');

  const loadAree = useCallback(async () => {
    setAreeLoading(true);
    try {
      const res = await apiClient.get<Area[]>('/aree');
      setAree(res.data);
    } catch {
      setAreaError('Errore nel caricamento aree.');
    } finally {
      setAreeLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === 'aree') loadAree();
  }, [tab, loadAree]);

  const handleCreaArea = async (e: React.FormEvent) => {
    e.preventDefault();
    setAreaError('');
    setAreaSuccess('');
    try {
      await apiClient.post('/aree', nuovaArea);
      setNuovaArea({ nome: '', prefisso: '' });
      setAreaSuccess('Area creata con successo.');
      loadAree();
    } catch (err: any) {
      setAreaError(err?.response?.data?.error ?? 'Errore creazione area.');
    }
  };

  const handleToggleArea = async (area: Area) => {
    try {
      await apiClient.patch(`/aree/${area.id}`, { attiva: !area.attiva });
      loadAree();
    } catch (err: any) {
      setAreaError(err?.response?.data?.error ?? 'Errore aggiornamento area.');
    }
  };

  // ── Utenti ────────────────────────────────────────────────────────────────
  const [utenti, setUtenti] = useState<Utente[]>([]);
  const [utentiLoading, setUtentiLoading] = useState(false);
  const [ruoli, setRuoli] = useState<Ruolo[]>([]);
  const [utentiError, setUtentiError] = useState('');
  const [utentiSuccess, setUtentiSuccess] = useState('');
  const [nuovoUtente, setNuovoUtente] = useState({
    cognome: '', nome: '', ruoloId: '', aree: [] as number[],
  });
  const [tempPwd, setTempPwd] = useState<string | null>(null);

  const loadUtenti = useCallback(async () => {
    setUtentiLoading(true);
    try {
      const [uRes, aRes] = await Promise.all([
        apiClient.get<Utente[]>('/utenti'),
        apiClient.get<Area[]>('/aree'),
      ]);
      setUtenti(uRes.data);
      setAree(aRes.data);
      // Carica ruoli dal primo utente o usa default
      const ruoliSet = new Set<string>();
      uRes.data.forEach((u) => ruoliSet.add(u.ruolo.nome));
      // Ruoli hardcoded perché non c'è un endpoint dedicato
      setRuoli([
        { id: 1, nome: 'SUPERADMIN' },
        { id: 2, nome: 'ADMIN' },
        { id: 3, nome: 'ACCOGLIENZA' },
        { id: 4, nome: 'OPERATORE' },
      ]);
    } catch {
      setUtentiError('Errore nel caricamento utenti.');
    } finally {
      setUtentiLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === 'utenti') loadUtenti();
  }, [tab, loadUtenti]);

  const handleCreaUtente = async (e: React.FormEvent) => {
    e.preventDefault();
    setUtentiError('');
    setUtentiSuccess('');
    setTempPwd(null);
    try {
      const res = await apiClient.post<Utente & { tempPassword: string }>('/utenti', {
        cognome: nuovoUtente.cognome,
        nome: nuovoUtente.nome,
        ruoloId: Number(nuovoUtente.ruoloId),
        aree: nuovoUtente.aree,
      });
      setTempPwd(res.data.tempPassword);
      setNuovoUtente({ cognome: '', nome: '', ruoloId: '', aree: [] });
      loadUtenti();
    } catch (err: any) {
      setUtentiError(err?.response?.data?.error ?? 'Errore creazione utente.');
    }
  };

  const handleResetPwd = async (utenteId: number) => {
    setUtentiError('');
    setUtentiSuccess('');
    setTempPwd(null);
    try {
      const res = await apiClient.patch<{ tempPassword: string }>(`/utenti/${utenteId}`, {
        resetPassword: true,
      });
      setTempPwd(res.data.tempPassword);
      setUtentiSuccess('Password resettata.');
    } catch (err: any) {
      setUtentiError(err?.response?.data?.error ?? 'Errore reset password.');
    }
  };

  const handleToggleUtente = async (u: Utente) => {
    const nuovoStato = u.stato === 'DISABILITATO' ? 'ATTIVO' : 'DISABILITATO';
    try {
      await apiClient.patch(`/utenti/${u.id}`, { stato: nuovoStato });
      loadUtenti();
    } catch (err: any) {
      setUtentiError(err?.response?.data?.error ?? 'Errore aggiornamento utente.');
    }
  };

  const toggleAreaUtente = (areaId: number) => {
    setNuovoUtente((prev) => ({
      ...prev,
      aree: prev.aree.includes(areaId)
        ? prev.aree.filter((a) => a !== areaId)
        : [...prev.aree, areaId],
    }));
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: '#f5f5f5', fontFamily: 'system-ui, sans-serif' }}>
      {/* Header */}
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 24px', background: '#1a1a2e', color: 'white' }}>
        <h1 style={{ margin: 0, fontSize: 20 }}>🏢 Saltacode — SuperAdmin</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ color: '#aaa', fontSize: 14 }}>{user?.username}</span>
          <button onClick={logout} style={btnStyle('#ef4444')}>Esci</button>
        </div>
      </header>

      {/* Tabs */}
      <div style={{ background: 'white', borderBottom: '1px solid #e0e0e0', padding: '0 24px', display: 'flex', gap: 0 }}>
        {(['aree', 'utenti'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: '12px 24px',
              border: 'none',
              borderBottom: tab === t ? '3px solid #1a1a2e' : '3px solid transparent',
              background: 'none',
              fontWeight: tab === t ? 700 : 400,
              cursor: 'pointer',
              fontSize: 15,
              textTransform: 'capitalize',
            }}
          >
            {t === 'aree' ? '📍 Aree' : '👤 Utenti'}
          </button>
        ))}
      </div>

      <main style={{ padding: 24, maxWidth: 1000, margin: '0 auto' }}>

        {/* ── TAB AREE ── */}
        {tab === 'aree' && (
          <>
            <h2 style={{ marginTop: 0 }}>Gestione Aree</h2>

            {/* Form nuova area */}
            <div style={cardStyle}>
              <h3 style={{ margin: '0 0 16px' }}>Crea nuova area</h3>
              <form onSubmit={handleCreaArea} style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <div>
                  <label style={labelStyle}>Nome area</label>
                  <input
                    style={inputStyle}
                    value={nuovaArea.nome}
                    onChange={(e) => setNuovaArea((p) => ({ ...p, nome: e.target.value }))}
                    placeholder="es. CAF CISL"
                    required
                  />
                </div>
                <div>
                  <label style={labelStyle}>Prefisso (2 lettere)</label>
                  <input
                    style={{ ...inputStyle, width: 80, textTransform: 'uppercase' }}
                    value={nuovaArea.prefisso}
                    onChange={(e) => setNuovaArea((p) => ({ ...p, prefisso: e.target.value.toUpperCase().slice(0, 2) }))}
                    placeholder="CA"
                    maxLength={2}
                    required
                  />
                </div>
                <button type="submit" style={btnStyle('#1a1a2e')}>Crea Area</button>
              </form>
              {areaError && <p style={errorStyle}>{areaError}</p>}
              {areaSuccess && <p style={successStyle}>{areaSuccess}</p>}
            </div>

            {/* Lista aree */}
            {areeLoading ? (
              <p>Caricamento…</p>
            ) : (
              <div style={cardStyle}>
                <h3 style={{ margin: '0 0 16px' }}>Aree registrate ({aree.length})</h3>
                {aree.length === 0 ? (
                  <p style={{ color: '#888' }}>Nessuna area. Creane una sopra.</p>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: '#f5f5f5' }}>
                        {['Prefisso', 'Nome', 'Servizi', 'Utenti', 'Stato', 'Azioni'].map((h) => (
                          <th key={h} style={thStyle}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {aree.map((a) => (
                        <tr key={a.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                          <td style={tdStyle}><strong>{a.prefisso}</strong></td>
                          <td style={tdStyle}>{a.nome}</td>
                          <td style={tdStyle}>{a._count.servizi}</td>
                          <td style={tdStyle}>{a._count.utentiAree}</td>
                          <td style={tdStyle}>
                            <span style={{
                              display: 'inline-block', padding: '2px 8px', borderRadius: 12,
                              background: a.attiva ? '#dcfce7' : '#fee2e2',
                              color: a.attiva ? '#166534' : '#991b1b',
                              fontSize: 12, fontWeight: 600,
                            }}>
                              {a.attiva ? 'Attiva' : 'Disabilitata'}
                            </span>
                          </td>
                          <td style={tdStyle}>
                            <button
                              onClick={() => handleToggleArea(a)}
                              style={btnStyle(a.attiva ? '#f59e0b' : '#22c55e', 'small')}
                            >
                              {a.attiva ? 'Disabilita' : 'Abilita'}
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

        {/* ── TAB UTENTI ── */}
        {tab === 'utenti' && (
          <>
            <h2 style={{ marginTop: 0 }}>Gestione Utenti</h2>

            {/* Credenziali temporanee */}
            {tempPwd && (
              <div style={{ ...cardStyle, background: '#fffbeb', border: '1px solid #f59e0b' }}>
                <strong>⚠️ Credenziali temporanee (mostra una sola volta):</strong>
                <p style={{ fontFamily: 'monospace', fontSize: 16, margin: '8px 0 0' }}>Password: <strong>{tempPwd}</strong></p>
                <button onClick={() => setTempPwd(null)} style={{ ...btnStyle('#6b7280', 'small'), marginTop: 8 }}>Chiudi</button>
              </div>
            )}

            {/* Form nuovo utente */}
            <div style={cardStyle}>
              <h3 style={{ margin: '0 0 16px' }}>Crea nuovo utente</h3>
              <form onSubmit={handleCreaUtente}>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
                  <div>
                    <label style={labelStyle}>Cognome</label>
                    <input style={inputStyle} value={nuovoUtente.cognome}
                      onChange={(e) => setNuovoUtente((p) => ({ ...p, cognome: e.target.value }))}
                      placeholder="Rossi" required />
                  </div>
                  <div>
                    <label style={labelStyle}>Nome</label>
                    <input style={inputStyle} value={nuovoUtente.nome}
                      onChange={(e) => setNuovoUtente((p) => ({ ...p, nome: e.target.value }))}
                      placeholder="Mario" required />
                  </div>
                  <div>
                    <label style={labelStyle}>Ruolo</label>
                    <select style={inputStyle} value={nuovoUtente.ruoloId}
                      onChange={(e) => setNuovoUtente((p) => ({ ...p, ruoloId: e.target.value }))}
                      required>
                      <option value="">Seleziona…</option>
                      {ruoli.map((r) => (
                        <option key={r.id} value={r.id}>{r.nome}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div style={{ marginBottom: 12 }}>
                  <label style={labelStyle}>Aree assegnate</label>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
                    {aree.map((a) => (
                      <label key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={nuovoUtente.aree.includes(a.id)}
                          onChange={() => toggleAreaUtente(a.id)}
                        />
                        {a.prefisso} — {a.nome}
                      </label>
                    ))}
                  </div>
                </div>
                <button type="submit" style={btnStyle('#1a1a2e')}>Crea Utente</button>
              </form>
              {utentiError && <p style={errorStyle}>{utentiError}</p>}
              {utentiSuccess && <p style={successStyle}>{utentiSuccess}</p>}
            </div>

            {/* Lista utenti */}
            {utentiLoading ? (
              <p>Caricamento…</p>
            ) : (
              <div style={cardStyle}>
                <h3 style={{ margin: '0 0 16px' }}>Utenti ({utenti.length})</h3>
                {utenti.length === 0 ? (
                  <p style={{ color: '#888' }}>Nessun utente.</p>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: '#f5f5f5' }}>
                        {['Username', 'Cognome Nome', 'Ruolo', 'Stato', 'Azioni'].map((h) => (
                          <th key={h} style={thStyle}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {utenti.map((u) => (
                        <tr key={u.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                          <td style={tdStyle}><code>{u.username}</code></td>
                          <td style={tdStyle}>{u.cognome} {u.nome}</td>
                          <td style={tdStyle}>
                            <span style={{ fontSize: 12, fontWeight: 600, color: '#555' }}>{u.ruolo.nome}</span>
                          </td>
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
                          <td style={{ ...tdStyle, display: 'flex', gap: 6 }}>
                            <button onClick={() => handleResetPwd(u.id)} style={btnStyle('#6366f1', 'small')}>
                              Reset pwd
                            </button>
                            <button onClick={() => handleToggleUtente(u)} style={btnStyle(u.stato === 'DISABILITATO' ? '#22c55e' : '#ef4444', 'small')}>
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

// ── Stili condivisi ──────────────────────────────────────────────────────────
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
const successStyle: React.CSSProperties = { color: '#22c55e', margin: '8px 0 0', fontSize: 14 };

function btnStyle(bg: string, size: 'normal' | 'small' = 'normal'): React.CSSProperties {
  return {
    background: bg, color: 'white', border: 'none',
    borderRadius: 4, cursor: 'pointer', fontWeight: 600,
    padding: size === 'small' ? '4px 10px' : '8px 16px',
    fontSize: size === 'small' ? 12 : 14,
  };
}
