import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useWebSocket } from '../../hooks/useWebSocket';
import apiClient from '../../api/client';
import AccountSettings from '../AccountSettings';

interface Area {
  id: number;
  nome: string;
  prefisso: string;
  attiva: boolean;
  _count: { servizi: number; utentiAree: number };
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

interface Utente {
  id: number;
  username: string;
  cognome: string;
  nome: string;
  stato: string;
  mustChangePwd: boolean;
  utentiRuoli: { ruolo: { id: number; nome: string } }[];
  utentiAree: { areaId: number }[];
}

interface CodaState { servizioId: number; nomeServizio: string; count: number; }

type Tab = 'code' | 'servizi' | 'utenti';

const RUOLI_ADMIN = ['ADMIN', 'ACCOGLIENZA', 'OPERATORE'];

export default function AdminDashboard() {
  const { user, login, logout } = useAuth();
  const [tab, setTab] = useState<Tab>('code');
  const [showSettings, setShowSettings] = useState(false);

  // ── Switch ruolo ──────────────────────────────────────────────────────────
  const [ruoliDisponibili, setRuoliDisponibili] = useState<string[]>(['ADMIN']);
  const [switchingRole, setSwitchingRole] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem('saltacode_ruoli');
    if (stored) { try { setRuoliDisponibili(JSON.parse(stored)); } catch { /* ignore */ } }
  }, []);

  const handleSwitchRole = async (ruolo: string) => {
    if (ruolo === user?.ruolo) return;
    setSwitchingRole(true);
    try {
      const res = await apiClient.post<{ token: string; user: typeof user }>('/auth/switch-role', { ruolo });
      if (res.data.user && res.data.token) login(res.data.user as any, res.data.token);
    } catch { /* ignore */ } finally { setSwitchingRole(false); }
  };

  // ── Aree dell'admin ───────────────────────────────────────────────────────
  const [aree, setAree] = useState<Area[]>([]);
  const loadAree = useCallback(async () => {
    try {
      const res = await apiClient.get<Area[]>('/aree');
      setAree(res.data);
    } catch { /* non bloccante */ }
  }, []);
  useEffect(() => { loadAree(); }, [loadAree]);

  // ── Servizi ───────────────────────────────────────────────────────────────
  const [servizi, setServizi] = useState<Servizio[]>([]);
  const [serviziLoading, setServiziLoading] = useState(false);
  const [serviziError, setServiziError] = useState('');
  const [serviziSuccess, setServiziSuccess] = useState('');

  // Form nuovo servizio — area selezionabile tra quelle dell'admin
  const [nuovoServizio, setNuovoServizio] = useState({
    nome: '', lettera: '', areaId: user?.aree[0] ?? 0,
  });

  // Modifica inline servizio esistente
  const [editingServizio, setEditingServizio] = useState<{
    id: number; nome: string; lettera: string;
  } | null>(null);

  const loadServizi = useCallback(async () => {
    setServiziLoading(true);
    try {
      const res = await apiClient.get<Servizio[]>('/servizi');
      setServizi(res.data);
    } catch { setServiziError('Errore nel caricamento servizi.'); }
    finally { setServiziLoading(false); }
  }, []);

  useEffect(() => { loadServizi(); }, [loadServizi]);

  const handleCreaServizio = async (e: React.FormEvent) => {
    e.preventDefault();
    setServiziError(''); setServiziSuccess('');
    try {
      await apiClient.post('/servizi', {
        nome: nuovoServizio.nome,
        lettera: nuovoServizio.lettera.toUpperCase(),
        areaId: nuovoServizio.areaId,
      });
      setNuovoServizio((p) => ({ ...p, nome: '', lettera: '' }));
      setServiziSuccess('Servizio creato.');
      loadServizi();
    } catch (err: any) {
      setServiziError(err?.response?.data?.error ?? 'Errore creazione servizio.');
    }
  };

  const handleToggleServizio = async (s: Servizio) => {
    setServiziError('');
    try {
      await apiClient.patch(`/servizi/${s.id}`, { attivo: !s.attivo });
      loadServizi();
    } catch (err: any) {
      setServiziError(err?.response?.data?.error ?? 'Errore.');
    }
  };

  const handleSalvaServizio = async () => {
    if (!editingServizio) return;
    setServiziError('');
    try {
      await apiClient.patch(`/servizi/${editingServizio.id}`, {
        nome: editingServizio.nome,
        lettera: editingServizio.lettera.toUpperCase(),
      });
      setEditingServizio(null);
      setServiziSuccess('Servizio aggiornato.');
      loadServizi();
    } catch (err: any) {
      setServiziError(err?.response?.data?.error ?? 'Errore modifica servizio.');
    }
  };

  const handleEliminaServizio = async (s: Servizio) => {
    if (!window.confirm(`Eliminare il servizio "${s.nome}" (${s.area.prefisso}${s.lettera})?\nI ticket in attesa verranno eliminati.`)) return;
    setServiziError('');
    try {
      await apiClient.delete(`/servizi/${s.id}`);
      setServiziSuccess(`Servizio "${s.nome}" eliminato.`);
      loadServizi();
    } catch (err: any) {
      setServiziError(err?.response?.data?.error ?? 'Errore eliminazione servizio.');
    }
  };

  // ── Utenti ────────────────────────────────────────────────────────────────
  const [utenti, setUtenti] = useState<Utente[]>([]);
  const [utentiLoading, setUtentiLoading] = useState(false);
  const [utentiError, setUtentiError] = useState('');
  const [utentiSuccess, setUtentiSuccess] = useState('');
  const [tempPwd, setTempPwd] = useState<{ username: string; pwd: string } | null>(null);

  const [nuovoUtente, setNuovoUtente] = useState({
    cognome: '', nome: '',
    ruoliSelezionati: ['OPERATORE'] as string[],
    areaId: user?.aree[0] ?? 0,
    password: '',
  });

  const [editingRuoli, setEditingRuoli] = useState<{ utenteId: number; ruoli: string[] } | null>(null);
  const [editingAree, setEditingAree] = useState<{ utenteId: number; aree: number[] } | null>(null);
  const [changingPassword, setChangingPassword] = useState<{ utenteId: number; username: string } | null>(null);
  const [newPasswordInput, setNewPasswordInput] = useState('');

  const loadUtenti = useCallback(async () => {
    setUtentiLoading(true);
    try {
      const [uRes, aRes] = await Promise.all([
        apiClient.get<Utente[]>('/utenti'),
        apiClient.get<Area[]>('/aree'),
      ]);
      setUtenti(uRes.data);
      setAree(aRes.data);
    } catch (err: any) {
      setUtentiError(err?.response?.data?.error ?? 'Errore nel caricamento utenti.');
    } finally { setUtentiLoading(false); }
  }, []);

  useEffect(() => { if (tab === 'utenti') loadUtenti(); }, [tab, loadUtenti]);

  const handleCreaUtente = async (e: React.FormEvent) => {
    e.preventDefault();
    setUtentiError(''); setUtentiSuccess(''); setTempPwd(null);
    try {
      if (!nuovoUtente.areaId) { setUtentiError('Seleziona un\'area.'); return; }
      const res = await apiClient.post<Utente & { tempPassword: string | null }>('/utenti', {
        cognome: nuovoUtente.cognome,
        nome: nuovoUtente.nome,
        ruoli: nuovoUtente.ruoliSelezionati,
        aree: [nuovoUtente.areaId],
        ...(nuovoUtente.password.trim() ? { password: nuovoUtente.password.trim() } : {}),
      });
      if (res.data.tempPassword) {
        setTempPwd({ username: res.data.username, pwd: res.data.tempPassword });
      } else {
        setUtentiSuccess('Utente creato con la password impostata.');
      }
      setNuovoUtente((p) => ({ ...p, cognome: '', nome: '', password: '' }));
      loadUtenti();
    } catch (err: any) {
      setUtentiError(err?.response?.data?.error ?? 'Errore creazione utente.');
    }
  };

  const handleResetPwd = async (utenteId: number) => {
    setUtentiError(''); setUtentiSuccess(''); setTempPwd(null);
    try {
      const res = await apiClient.patch<Utente & { tempPassword: string }>(`/utenti/${utenteId}`, { resetPassword: true });
      setTempPwd({ username: '', pwd: res.data.tempPassword });
      setUtentiSuccess('Password resettata.');
    } catch (err: any) {
      setUtentiError(err?.response?.data?.error ?? 'Errore reset password.');
    }
  };

  const handleToggleUtente = async (u: Utente) => {
    try {
      await apiClient.patch(`/utenti/${u.id}`, { stato: u.stato === 'DISABILITATO' ? 'ATTIVO' : 'DISABILITATO' });
      loadUtenti();
    } catch (err: any) { setUtentiError(err?.response?.data?.error ?? 'Errore.'); }
  };

  const handleEliminaUtente = async (u: Utente) => {
    if (!window.confirm(`Eliminare definitivamente ${u.cognome} ${u.nome} (${u.username})?`)) return;
    try {
      await apiClient.delete(`/utenti/${u.id}`);
      setUtentiSuccess(`Utente ${u.username} eliminato.`);
      loadUtenti();
    } catch (err: any) { setUtentiError(err?.response?.data?.error ?? 'Errore eliminazione.'); }
  };

  const handleSalvaRuoli = async () => {
    if (!editingRuoli) return;
    try {
      await apiClient.patch(`/utenti/${editingRuoli.utenteId}`, { ruoli: editingRuoli.ruoli });
      setEditingRuoli(null); setUtentiSuccess('Ruoli aggiornati.'); loadUtenti();
    } catch (err: any) { setUtentiError(err?.response?.data?.error ?? 'Errore aggiornamento ruoli.'); }
  };

  const handleSalvaAree = async () => {
    if (!editingAree) return;
    try {
      await apiClient.patch(`/utenti/${editingAree.utenteId}`, { aree: editingAree.aree });
      setEditingAree(null); setUtentiSuccess('Aree aggiornate.'); loadUtenti();
    } catch (err: any) { setUtentiError(err?.response?.data?.error ?? 'Errore aggiornamento aree.'); }
  };

  const handleChangePassword = async () => {
    if (!changingPassword || !newPasswordInput.trim()) return;
    try {
      await apiClient.patch(`/utenti/${changingPassword.utenteId}`, { newPassword: newPasswordInput });
      setChangingPassword(null); setNewPasswordInput(''); setUtentiSuccess('Password cambiata.');
    } catch (err: any) { setUtentiError(err?.response?.data?.error ?? 'Errore cambio password.'); }
  };

  // ── Code real-time via WebSocket ──────────────────────────────────────────
  const [code, setCode] = useState<CodaState[]>([]);

  const handleWsMessage = useCallback((msg: { type: string; [key: string]: unknown }) => {
    if (msg.type === 'INITIAL_STATE') setCode((msg['code'] as CodaState[]) ?? []);
    if (msg.type === 'TICKET_EMESSO') {
      const { servizioId, coda } = msg as unknown as { servizioId: number; coda: number };
      setCode((prev) => {
        const ex = prev.find((c) => c.servizioId === servizioId);
        if (ex) return prev.map((c) => c.servizioId === servizioId ? { ...c, count: coda } : c);
        const s = servizi.find((sv) => sv.id === servizioId);
        return [...prev, { servizioId, nomeServizio: s?.nome ?? '?', count: coda }];
      });
    }
    if (msg.type === 'NUMERO_CHIAMATO') {
      const { servizioId } = msg as unknown as { servizioId: number };
      setCode((prev) => prev.map((c) => c.servizioId === servizioId ? { ...c, count: Math.max(0, c.count - 1) } : c));
    }
    if (msg.type === 'CODA_AGGIORNATA') {
      const { servizioId, count } = msg as unknown as { servizioId: number; count: number };
      setCode((prev) => {
        const ex = prev.find((c) => c.servizioId === servizioId);
        if (ex) return prev.map((c) => c.servizioId === servizioId ? { ...c, count } : c);
        const s = servizi.find((sv) => sv.id === servizioId);
        return [...prev, { servizioId, nomeServizio: s?.nome ?? '?', count }];
      });
    }
  }, [servizi]);

  useWebSocket({ onMessage: handleWsMessage });

  // ── Helpers ───────────────────────────────────────────────────────────────
  const areeAdmin = aree.filter((a) => user?.aree.includes(a.id));
  const areaNomi = areeAdmin.map((a) => `${a.prefisso} — ${a.nome}`).join(', ');

  const tabs: { id: Tab; label: string }[] = [
    { id: 'code', label: '📊 Code live' },
    { id: 'servizi', label: '🔧 Servizi' },
    { id: 'utenti', label: '👥 Utenti' },
  ];

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: '#f5f5f5', fontFamily: 'system-ui, sans-serif' }}>

      {/* Header */}
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 24px', background: '#16213e', color: 'white' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 20 }}>📋 Saltacode — Admin</h1>
          {areaNomi && <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>Aree: {areaNomi}</div>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {ruoliDisponibili.length > 1 && (
            <select value={user?.ruolo ?? ''} onChange={(e) => handleSwitchRole(e.target.value)}
              disabled={switchingRole}
              style={{ padding: '4px 8px', borderRadius: 4, fontSize: 13, border: '1px solid #334155', background: '#1e293b', color: 'white', cursor: 'pointer' }}>
              {ruoliDisponibili.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          )}
          <span style={{ color: '#aaa', fontSize: 14 }}>{user?.username}</span>
          <button onClick={() => setShowSettings(true)} style={btn('#334155')} title="Impostazioni account">⚙</button>
          <button onClick={logout} style={btn('#ef4444')}>Esci</button>
        </div>
      </header>

      {/* Tabs */}
      <div style={{ background: 'white', borderBottom: '1px solid #e0e0e0', padding: '0 24px', display: 'flex' }}>
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: '12px 20px', border: 'none',
            borderBottom: tab === t.id ? '3px solid #16213e' : '3px solid transparent',
            background: 'none', fontWeight: tab === t.id ? 700 : 400, cursor: 'pointer', fontSize: 14,
          }}>{t.label}</button>
        ))}
      </div>

      <main style={{ padding: 24, maxWidth: 1100, margin: '0 auto' }}>

        {/* ── TAB CODE ── */}
        {tab === 'code' && (
          <>
            <h2 style={{ marginTop: 0 }}>Code in tempo reale</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16 }}>
              {servizi.filter((s) => s.attivo).map((s) => {
                const count = code.find((c) => c.servizioId === s.id)?.count ?? 0;
                const color = count > 10 ? '#ef4444' : count > 5 ? '#f59e0b' : '#22c55e';
                return (
                  <div key={s.id} style={{ ...card, borderLeft: `5px solid ${color}`, marginBottom: 0 }}>
                    <div style={{ fontSize: 11, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>{s.area.prefisso}{s.lettera}</div>
                    <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{s.nome}</div>
                    <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 8 }}>{s.area.nome}</div>
                    <div style={{ fontSize: 36, fontWeight: 900, color }}>{count}</div>
                    <div style={{ fontSize: 12, color: '#9ca3af' }}>in attesa</div>
                  </div>
                );
              })}
              {servizi.filter((s) => s.attivo).length === 0 && <p style={{ color: '#888' }}>Nessun servizio attivo.</p>}
            </div>
          </>
        )}

        {/* ── TAB SERVIZI ── */}
        {tab === 'servizi' && (
          <>
            <h2 style={{ marginTop: 0 }}>Gestione Servizi</h2>

            {/* Form nuovo servizio */}
            <div style={card}>
              <h3 style={{ margin: '0 0 14px' }}>Nuovo servizio</h3>
              <form onSubmit={handleCreaServizio} style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <div>
                  <label style={lbl}>Area</label>
                  <select style={inp}
                    value={nuovoServizio.areaId}
                    onChange={(e) => setNuovoServizio((p) => ({ ...p, areaId: Number(e.target.value) }))}
                    required>
                    <option value="">Seleziona…</option>
                    {areeAdmin.map((a) => <option key={a.id} value={a.id}>{a.prefisso} — {a.nome}</option>)}
                  </select>
                </div>
                <div>
                  <label style={lbl}>Nome servizio</label>
                  <input style={inp} value={nuovoServizio.nome}
                    onChange={(e) => setNuovoServizio((p) => ({ ...p, nome: e.target.value }))}
                    placeholder="es. Dichiarazione Redditi" required />
                </div>
                <div>
                  <label style={lbl}>Lettera</label>
                  <input style={{ ...inp, width: 60, textTransform: 'uppercase' }}
                    value={nuovoServizio.lettera}
                    onChange={(e) => setNuovoServizio((p) => ({ ...p, lettera: e.target.value.toUpperCase().slice(0, 1) }))}
                    placeholder="A" maxLength={1} required />
                </div>
                <button type="submit" style={btn('#16213e')}>Crea</button>
              </form>
              {serviziError && <p style={errTxt}>{serviziError}</p>}
              {serviziSuccess && <p style={okTxt}>{serviziSuccess}</p>}
            </div>

            {/* Tabella servizi */}
            {serviziLoading ? <p>Caricamento…</p> : (
              <div style={card}>
                <h3 style={{ margin: '0 0 14px' }}>Servizi ({servizi.length})</h3>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: '#f5f5f5' }}>
                      {['Codice', 'Nome', 'Area', 'In coda', 'Stato', 'Azioni'].map((h) => (
                        <th key={h} style={th}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {servizi.map((s) => (
                      <tr key={s.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                        <td style={td}><strong>{s.area.prefisso}{s.lettera}</strong></td>

                        {/* Nome + lettera editabili inline */}
                        <td style={td}>
                          {editingServizio?.id === s.id ? (
                            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                              <input
                                style={{ ...inp, minWidth: 140, padding: '4px 8px', fontSize: 13 }}
                                value={editingServizio.nome}
                                onChange={(e) => setEditingServizio((p) => p ? { ...p, nome: e.target.value } : p)}
                              />
                              <input
                                style={{ ...inp, width: 44, padding: '4px 6px', fontSize: 13, textTransform: 'uppercase' }}
                                value={editingServizio.lettera}
                                onChange={(e) => setEditingServizio((p) => p ? { ...p, lettera: e.target.value.toUpperCase().slice(0, 1) } : p)}
                                maxLength={1}
                              />
                            </div>
                          ) : s.nome}
                        </td>

                        <td style={td}>{s.area.nome}</td>
                        <td style={td}>{s._count.ticket}</td>
                        <td style={td}>
                          <span style={badge(s.attivo ? 'green' : 'red')}>{s.attivo ? 'Attivo' : 'Disabilitato'}</span>
                        </td>
                        <td style={{ ...td, whiteSpace: 'nowrap' }}>
                          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                            {editingServizio?.id === s.id ? (
                              <>
                                <button onClick={handleSalvaServizio} style={btn('#22c55e', 'sm')}>Salva</button>
                                <button onClick={() => setEditingServizio(null)} style={btn('#6b7280', 'sm')}>Annulla</button>
                              </>
                            ) : (
                              <button onClick={() => setEditingServizio({ id: s.id, nome: s.nome, lettera: s.lettera })}
                                style={btn('#3b82f6', 'sm')}>Modifica</button>
                            )}
                            <button onClick={() => handleToggleServizio(s)}
                              style={btn(s.attivo ? '#f59e0b' : '#22c55e', 'sm')}>
                              {s.attivo ? 'Disabilita' : 'Abilita'}
                            </button>
                            <button onClick={() => handleEliminaServizio(s)}
                              style={btn('#7f1d1d', 'sm')} title="Elimina servizio">🗑</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {/* ── TAB UTENTI ── */}
        {tab === 'utenti' && (
          <>
            <h2 style={{ marginTop: 0 }}>Utenti delle tue aree</h2>

            {tempPwd && (
              <div style={{ ...card, background: '#fffbeb', border: '1px solid #f59e0b' }}>
                <strong>⚠️ Credenziali temporanee (mostra una sola volta):</strong>
                {tempPwd.username && <p style={{ fontFamily: 'monospace', fontSize: 14, margin: '6px 0 2px' }}>Username: <strong>{tempPwd.username}</strong></p>}
                <p style={{ fontFamily: 'monospace', fontSize: 14, margin: '2px 0 8px' }}>Password: <strong>{tempPwd.pwd}</strong></p>
                <button onClick={() => setTempPwd(null)} style={btn('#6b7280', 'sm')}>Chiudi</button>
              </div>
            )}

            {/* Form nuovo utente */}
            <div style={card}>
              <h3 style={{ margin: '0 0 14px' }}>Nuovo utente</h3>
              <form onSubmit={handleCreaUtente}>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
                  <div>
                    <label style={lbl}>Cognome</label>
                    <input style={inp} value={nuovoUtente.cognome}
                      onChange={(e) => setNuovoUtente((p) => ({ ...p, cognome: e.target.value }))}
                      placeholder="Rossi" required />
                  </div>
                  <div>
                    <label style={lbl}>Nome</label>
                    <input style={inp} value={nuovoUtente.nome}
                      onChange={(e) => setNuovoUtente((p) => ({ ...p, nome: e.target.value }))}
                      placeholder="Mario" required />
                  </div>
                  <div>
                    <label style={lbl}>Area</label>
                    <select style={inp} value={nuovoUtente.areaId}
                      onChange={(e) => setNuovoUtente((p) => ({ ...p, areaId: Number(e.target.value) }))}
                      required>
                      <option value="">Seleziona…</option>
                      {areeAdmin.map((a) => <option key={a.id} value={a.id}>{a.prefisso} — {a.nome}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={lbl}>Password <span style={{ color: '#9ca3af', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(opzionale)</span></label>
                    <input type="password" style={inp} value={nuovoUtente.password}
                      onChange={(e) => setNuovoUtente((p) => ({ ...p, password: e.target.value }))}
                      placeholder="Lascia vuoto per generarla" autoComplete="new-password" />
                  </div>
                </div>
                <div style={{ marginBottom: 12 }}>
                  <label style={lbl}>Ruoli</label>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
                    {RUOLI_ADMIN.map((r) => (
                      <label key={r} style={chip(nuovoUtente.ruoliSelezionati.includes(r))}>
                        <input type="checkbox" checked={nuovoUtente.ruoliSelezionati.includes(r)}
                          onChange={() => setNuovoUtente((p) => ({
                            ...p,
                            ruoliSelezionati: p.ruoliSelezionati.includes(r)
                              ? p.ruoliSelezionati.filter((x) => x !== r)
                              : [...p.ruoliSelezionati, r],
                          }))} style={{ display: 'none' }} />
                        {r}
                      </label>
                    ))}
                  </div>
                </div>
                <button type="submit" style={btn('#16213e')}>Crea Utente</button>
              </form>
              {utentiError && <p style={errTxt}>{utentiError}</p>}
              {utentiSuccess && !tempPwd && <p style={okTxt}>{utentiSuccess}</p>}
            </div>

            {/* Tabella utenti */}
            {utentiLoading ? <p>Caricamento…</p> : (
              <div style={card}>
                <h3 style={{ margin: '0 0 14px' }}>Utenti ({utenti.length})</h3>
                {utenti.length === 0 ? <p style={{ color: '#888' }}>Nessun utente.</p> : (
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: '#f5f5f5' }}>
                        {['Username', 'Nome', 'Ruoli', 'Aree', 'Stato', 'Azioni'].map((h) => (
                          <th key={h} style={th}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {utenti.map((u) => {
                        const isAdmin = u.utentiRuoli.some((ur) => ['ADMIN', 'SUPERADMIN'].includes(ur.ruolo.nome));
                        return (
                          <tr key={u.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                            <td style={td}><code>{u.username}</code></td>
                            <td style={td}>{u.cognome} {u.nome}</td>

                            {/* Ruoli */}
                            <td style={td}>
                              {editingRuoli?.utenteId === u.id ? (
                                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                  {RUOLI_ADMIN.map((r) => (
                                    <label key={r} style={chip(editingRuoli.ruoli.includes(r))}>
                                      <input type="checkbox" checked={editingRuoli.ruoli.includes(r)}
                                        onChange={() => setEditingRuoli((p) => p ? ({
                                          ...p, ruoli: p.ruoli.includes(r) ? p.ruoli.filter((x) => x !== r) : [...p.ruoli, r],
                                        }) : p)} style={{ display: 'none' }} />
                                      {r}
                                    </label>
                                  ))}
                                </div>
                              ) : (
                                <span style={{ fontSize: 12, color: '#555' }}>
                                  {u.utentiRuoli.map((ur) => ur.ruolo.nome).join(', ')}
                                </span>
                              )}
                            </td>

                            {/* Aree */}
                            <td style={td}>
                              {editingAree?.utenteId === u.id ? (
                                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                  {areeAdmin.map((a) => (
                                    <label key={a.id} style={chip(editingAree.aree.includes(a.id))}>
                                      <input type="checkbox" checked={editingAree.aree.includes(a.id)}
                                        onChange={() => setEditingAree((p) => p ? ({
                                          ...p, aree: p.aree.includes(a.id) ? p.aree.filter((x) => x !== a.id) : [...p.aree, a.id],
                                        }) : p)} style={{ display: 'none' }} />
                                      {a.prefisso} — {a.nome}
                                    </label>
                                  ))}
                                </div>
                              ) : (
                                <span style={{ fontSize: 12, color: '#555' }}>
                                  {u.utentiAree.map((ua) => {
                                    const a = aree.find((x) => x.id === ua.areaId);
                                    return a ? `${a.prefisso} — ${a.nome}` : null;
                                  }).filter(Boolean).join(', ')}
                                </span>
                              )}
                            </td>

                            <td style={td}>
                              <span style={badge(u.stato === 'ATTIVO' ? 'green' : u.stato === 'PAUSA' ? 'yellow' : 'red')}>
                                {u.stato}
                              </span>
                            </td>

                            <td style={{ ...td, whiteSpace: 'nowrap' }}>
                              {isAdmin ? (
                                <span style={{ fontSize: 12, color: '#9ca3af', fontStyle: 'italic' }}>Non modificabile</span>
                              ) : (
                                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                  {/* Ruoli */}
                                  {editingRuoli?.utenteId === u.id ? (
                                    <>
                                      <button onClick={handleSalvaRuoli} style={btn('#22c55e', 'sm')}>Salva</button>
                                      <button onClick={() => setEditingRuoli(null)} style={btn('#6b7280', 'sm')}>✕</button>
                                    </>
                                  ) : (
                                    <button onClick={() => setEditingRuoli({ utenteId: u.id, ruoli: u.utentiRuoli.map((ur) => ur.ruolo.nome) })}
                                      style={btn('#8b5cf6', 'sm')}>Ruoli</button>
                                  )}

                                  {/* Aree */}
                                  {editingAree?.utenteId === u.id ? (
                                    <>
                                      <button onClick={handleSalvaAree} style={btn('#22c55e', 'sm')}>Salva</button>
                                      <button onClick={() => setEditingAree(null)} style={btn('#6b7280', 'sm')}>✕</button>
                                    </>
                                  ) : (
                                    <button onClick={() => setEditingAree({ utenteId: u.id, aree: u.utentiAree.map((ua) => ua.areaId) })}
                                      style={btn('#f59e0b', 'sm')}>Aree</button>
                                  )}

                                  {/* Password */}
                                  {changingPassword?.utenteId === u.id ? (
                                    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                                      <input type="password" value={newPasswordInput}
                                        onChange={(e) => setNewPasswordInput(e.target.value)}
                                        placeholder="Nuova pwd…"
                                        style={{ padding: '3px 6px', fontSize: 12, width: 110, border: '1px solid #d1d5db', borderRadius: 4 }} />
                                      <button onClick={handleChangePassword} style={btn('#22c55e', 'sm')}>OK</button>
                                      <button onClick={() => { setChangingPassword(null); setNewPasswordInput(''); }} style={btn('#6b7280', 'sm')}>✕</button>
                                    </div>
                                  ) : (
                                    <button onClick={() => setChangingPassword({ utenteId: u.id, username: u.username })}
                                      style={btn('#3b82f6', 'sm')}>Pwd</button>
                                  )}

                                  <button onClick={() => handleResetPwd(u.id)} style={btn('#6366f1', 'sm')}>Reset</button>
                                  <button onClick={() => handleToggleUtente(u)}
                                    style={btn(u.stato === 'DISABILITATO' ? '#22c55e' : '#ef4444', 'sm')}>
                                    {u.stato === 'DISABILITATO' ? 'Abilita' : 'Disabilita'}
                                  </button>
                                  <button onClick={() => handleEliminaUtente(u)} style={btn('#7f1d1d', 'sm')} title="Elimina">🗑</button>
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </>
        )}
      </main>

      {showSettings && <AccountSettings onClose={() => setShowSettings(false)} />}
    </div>
  );
}

// ── Stili ────────────────────────────────────────────────────────────────────
const card: React.CSSProperties = {
  background: 'white', borderRadius: 8, padding: 20,
  boxShadow: '0 1px 3px rgba(0,0,0,0.1)', marginBottom: 20,
};
const inp: React.CSSProperties = {
  display: 'block', padding: '7px 10px', border: '1px solid #d1d5db',
  borderRadius: 4, fontSize: 14, minWidth: 180,
};
const lbl: React.CSSProperties = {
  display: 'block', fontSize: 12, fontWeight: 600,
  color: '#374151', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5,
};
const th: React.CSSProperties = {
  textAlign: 'left', padding: '8px 12px', fontSize: 12,
  fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5,
};
const td: React.CSSProperties = { padding: '10px 12px', fontSize: 14, verticalAlign: 'middle' };
const errTxt: React.CSSProperties = { color: '#ef4444', margin: '8px 0 0', fontSize: 14 };
const okTxt: React.CSSProperties = { color: '#22c55e', margin: '8px 0 0', fontSize: 14 };

function btn(bg: string, size: 'normal' | 'sm' = 'normal'): React.CSSProperties {
  return {
    background: bg, color: 'white', border: 'none', borderRadius: 4,
    cursor: 'pointer', fontWeight: 600,
    padding: size === 'sm' ? '3px 8px' : '8px 16px',
    fontSize: size === 'sm' ? 12 : 14,
  };
}

function chip(selected: boolean): React.CSSProperties {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer',
    padding: '3px 9px',
    border: `1px solid ${selected ? '#16213e' : '#d1d5db'}`,
    borderRadius: 4,
    background: selected ? '#16213e' : 'white',
    color: selected ? 'white' : '#374151',
    fontSize: 12, fontWeight: 600, userSelect: 'none',
  };
}

function badge(color: 'green' | 'yellow' | 'red'): React.CSSProperties {
  const m = { green: ['#dcfce7', '#166534'], yellow: ['#fef9c3', '#854d0e'], red: ['#fee2e2', '#991b1b'] };
  return {
    display: 'inline-block', padding: '2px 8px', borderRadius: 12,
    background: m[color][0], color: m[color][1], fontSize: 12, fontWeight: 600,
  };
}
