import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useWebSocket } from '../../hooks/useWebSocket';
import apiClient from '../../api/client';

interface Area {
  id: number;
  nome: string;
  prefisso: string;
  attiva: boolean;
  createdAt: string;
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

interface CodaState {
  servizioId: number;
  nomeServizio: string;
  count: number;
}

type Tab = 'code' | 'servizi' | 'utenti';

// Ruoli che un Admin può assegnare agli utenti della propria area
const RUOLI_ADMIN = ['ACCOGLIENZA', 'OPERATORE'];

export default function AdminDashboard() {
  const { user, login, logout } = useAuth();
  const [tab, setTab] = useState<Tab>('code');

  // ── Switch ruolo ──────────────────────────────────────────────────────────
  const [ruoliDisponibili, setRuoliDisponibili] = useState<string[]>(['ADMIN']);
  const [switchingRole, setSwitchingRole] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem('saltacode_ruoli');
    if (stored) {
      try { setRuoliDisponibili(JSON.parse(stored)); } catch { /* ignore */ }
    }
  }, []);

  const handleSwitchRole = async (ruolo: string) => {
    if (ruolo === user?.ruolo) return;
    setSwitchingRole(true);
    try {
      const res = await apiClient.post<{ token: string; user: typeof user }>('/auth/switch-role', { ruolo });
      if (res.data.user && res.data.token) {
        login(res.data.user as any, res.data.token);
      }
    } catch { /* ignore */ } finally {
      setSwitchingRole(false);
    }
  };

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

  // ── Utenti dell'area ──────────────────────────────────────────────────────
  const [utenti, setUtenti] = useState<Utente[]>([]);
  const [aree, setAree] = useState<Area[]>([]);
  const [utentiLoading, setUtentiLoading] = useState(false);
  const [utentiError, setUtentiError] = useState('');
  const [utentiSuccess, setUtentiSuccess] = useState('');
  const [tempPwd, setTempPwd] = useState<{ username: string; pwd: string } | null>(null);

  // Nuovo utente
  const [nuovoUtente, setNuovoUtente] = useState({
    cognome: '', nome: '', ruoliSelezionati: ['OPERATORE'] as string[], password: '',
  });

  // Editing ruoli utente esistente
  const [editingRuoli, setEditingRuoli] = useState<{ utenteId: number; ruoli: string[] } | null>(null);
  
  // Editing aree utente
  const [editingAree, setEditingAree] = useState<{ utenteId: number; aree: number[] } | null>(null);
  
  // Cambio password utente
  const [changingPassword, setChangingPassword] = useState<{ utenteId: number; username: string } | null>(null);
  const [newPasswordInput, setNewPasswordInput] = useState('');

  const loadUtenti = useCallback(async () => {
    setUtentiLoading(true);
    try {
      const [uRes, aRes] = await Promise.all([
        apiClient.get<Utente[]>('/utenti'),
        apiClient.get<Area[]>('/aree'),
      ]);
      // Mostra tutti gli utenti dell'area (non solo operatori)
      setUtenti(uRes.data);
      setAree(aRes.data);
    } catch (err: any) {
      setUtentiError(err?.response?.data?.error ?? 'Errore nel caricamento utenti.');
    } finally {
      setUtentiLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === 'utenti') loadUtenti();
  }, [tab, loadUtenti]);

  const handleCreaUtente = async (e: React.FormEvent) => {
    e.preventDefault();
    setUtentiError(''); setUtentiSuccess(''); setTempPwd(null);
    try {
      const areaId = user?.aree[0];
      if (!areaId) { setUtentiError('Nessuna area assegnata.'); return; }
      const res = await apiClient.post<Utente & { tempPassword: string | null }>('/utenti', {
        cognome: nuovoUtente.cognome,
        nome: nuovoUtente.nome,
        ruoli: nuovoUtente.ruoliSelezionati,
        aree: [areaId],
        ...(nuovoUtente.password.trim() ? { password: nuovoUtente.password.trim() } : {}),
      });
      if (res.data.tempPassword) {
        setTempPwd({ username: res.data.username, pwd: res.data.tempPassword });
      } else {
        setUtentiSuccess('Utente creato con la password impostata. Può accedere subito.');
      }
      setNuovoUtente({ cognome: '', nome: '', ruoliSelezionati: ['OPERATORE'], password: '' });
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
    const nuovoStato = u.stato === 'DISABILITATO' ? 'ATTIVO' : 'DISABILITATO';
    try {
      await apiClient.patch(`/utenti/${u.id}`, { stato: nuovoStato });
      loadUtenti();
    } catch (err: any) {
      setUtentiError(err?.response?.data?.error ?? 'Errore.');
    }
  };

  const handleEliminaUtente = async (u: Utente) => {
    if (!window.confirm(`Eliminare definitivamente ${u.cognome} ${u.nome} (${u.username})?`)) return;
    setUtentiError('');
    try {
      await apiClient.delete(`/utenti/${u.id}`);
      setUtentiSuccess(`Utente ${u.username} eliminato.`);
      loadUtenti();
    } catch (err: any) {
      setUtentiError(err?.response?.data?.error ?? 'Errore eliminazione utente.');
    }
  };

  const handleSalvaRuoli = async () => {
    if (!editingRuoli) return;
    setUtentiError('');
    try {
      await apiClient.patch(`/utenti/${editingRuoli.utenteId}`, { ruoli: editingRuoli.ruoli });
      setEditingRuoli(null);
      setUtentiSuccess('Ruoli aggiornati.');
      loadUtenti();
    } catch (err: any) {
      setUtentiError(err?.response?.data?.error ?? 'Errore aggiornamento ruoli.');
    }
  };

  const handleSalvaAree = async () => {
    if (!editingAree) return;
    setUtentiError('');
    try {
      await apiClient.patch(`/utenti/${editingAree.utenteId}`, { aree: editingAree.aree });
      setEditingAree(null);
      setUtentiSuccess('Aree aggiornate.');
      loadUtenti();
    } catch (err: any) {
      setUtentiError(err?.response?.data?.error ?? 'Errore aggiornamento aree.');
    }
  };

  const handleChangePassword = async () => {
    if (!changingPassword || !newPasswordInput.trim()) return;
    setUtentiError('');
    try {
      await apiClient.patch(`/utenti/${changingPassword.utenteId}`, { newPassword: newPasswordInput });
      setChangingPassword(null);
      setNewPasswordInput('');
      setUtentiSuccess('Password cambiata.');
      loadUtenti();
    } catch (err: any) {
      setUtentiError(err?.response?.data?.error ?? 'Errore cambio password.');
    }
  };

  const toggleRuoloNuovo = (ruolo: string) =>
    setNuovoUtente((prev) => ({
      ...prev,
      ruoliSelezionati: prev.ruoliSelezionati.includes(ruolo)
        ? prev.ruoliSelezionati.filter((r) => r !== ruolo)
        : [...prev.ruoliSelezionati, ruolo],
    }));

  const toggleRuoloEditing = (ruolo: string) => {
    if (!editingRuoli) return;
    setEditingRuoli((prev) => ({
      ...prev!,
      ruoli: prev!.ruoli.includes(ruolo)
        ? prev!.ruoli.filter((r) => r !== ruolo)
        : [...prev!.ruoli, ruolo],
    }));
  };

  const toggleAreaEditing = (areaId: number) => {
    if (!editingAree) return;
    setEditingAree((prev) => ({
      ...prev!,
      aree: prev!.aree.includes(areaId)
        ? prev!.aree.filter((a) => a !== areaId)
        : [...prev!.aree, areaId],
    }));
  };

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
        if (existing) return prev.map((c) => c.servizioId === servizioId ? { ...c, count: coda } : c);
        const s = servizi.find((sv) => sv.id === servizioId);
        return [...prev, { servizioId, nomeServizio: s?.nome ?? '?', count: coda }];
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
        const s = servizi.find((sv) => sv.id === servizioId);
        return [...prev, { servizioId, nomeServizio: s?.nome ?? '?', count }];
      });
    }
  }, [servizi]);

  useWebSocket({ onMessage: handleWsMessage });

  // ── Render ────────────────────────────────────────────────────────────────
  const tabs: { id: Tab; label: string }[] = [
    { id: 'code', label: '📊 Code in tempo reale' },
    { id: 'servizi', label: '🔧 Servizi' },
    { id: 'utenti', label: '👥 Utenti area' },
  ];

  const areaNome = servizi[0]?.area.nome ?? '';

  return (
    <div style={{ minHeight: '100vh', background: '#f5f5f5', fontFamily: 'system-ui, sans-serif' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 24px', background: '#16213e', color: 'white' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 20 }}>📋 Saltacode — Admin</h1>
          {areaNome && <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>Area: {areaNome}</div>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {ruoliDisponibili.length > 1 && (
            <select
              value={user?.ruolo ?? ''}
              onChange={(e) => handleSwitchRole(e.target.value)}
              disabled={switchingRole}
              style={{ padding: '4px 8px', borderRadius: 4, fontSize: 13, border: '1px solid #334155', background: '#1e293b', color: 'white', cursor: 'pointer' }}
              title="Cambia ruolo attivo"
            >
              {ruoliDisponibili.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          )}
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
                          <span style={badgeStyle(s.attivo ? 'green' : 'red')}>
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

        {/* ── TAB UTENTI ── */}
        {tab === 'utenti' && (
          <>
            <h2 style={{ marginTop: 0 }}>Utenti della tua area</h2>

            {tempPwd && (
              <div style={{ ...cardStyle, background: '#fffbeb', border: '1px solid #f59e0b' }}>
                <strong>⚠️ Credenziali temporanee (mostra una sola volta):</strong>
                {tempPwd.username && (
                  <p style={{ fontFamily: 'monospace', fontSize: 15, margin: '8px 0 4px' }}>
                    Username: <strong>{tempPwd.username}</strong>
                  </p>
                )}
                <p style={{ fontFamily: 'monospace', fontSize: 15, margin: '0 0 8px' }}>
                  Password: <strong>{tempPwd.pwd}</strong>
                </p>
                <button onClick={() => setTempPwd(null)} style={btnStyle('#6b7280', 'small')}>Chiudi</button>
              </div>
            )}

            <div style={cardStyle}>
              <h3 style={{ margin: '0 0 16px' }}>Nuovo utente</h3>
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
                    <label style={labelStyle}>Password <span style={{ color: '#9ca3af', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(opzionale)</span></label>
                    <input
                      type="password"
                      style={inputStyle}
                      value={nuovoUtente.password}
                      onChange={(e) => setNuovoUtente((p) => ({ ...p, password: e.target.value }))}
                      placeholder="Lascia vuoto per generarla"
                      autoComplete="new-password"
                    />
                  </div>
                </div>
                <div style={{ marginBottom: 12 }}>
                  <label style={labelStyle}>Ruolo</label>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
                    {RUOLI_ADMIN.map((r) => (
                      <label key={r} style={chipStyle(nuovoUtente.ruoliSelezionati.includes(r))}>
                        <input type="checkbox" checked={nuovoUtente.ruoliSelezionati.includes(r)}
                          onChange={() => toggleRuoloNuovo(r)} style={{ display: 'none' }} />
                        {r}
                      </label>
                    ))}
                  </div>
                </div>
                <button type="submit" style={btnStyle('#16213e')}>Crea Utente</button>
              </form>
              {utentiError && <p style={errorStyle}>{utentiError}</p>}
              {utentiSuccess && <p style={successStyle}>{utentiSuccess}</p>}
            </div>

            {utentiLoading ? <p>Caricamento…</p> : (
              <div style={cardStyle}>
                <h3 style={{ margin: '0 0 16px' }}>Utenti ({utenti.length})</h3>
                {utenti.length === 0 ? (
                  <p style={{ color: '#888' }}>Nessun utente.</p>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: '#f5f5f5' }}>
                        {['Username', 'Nome', 'Ruoli', 'Aree', 'Stato', 'Azioni'].map((h) => (
                          <th key={h} style={thStyle}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {utenti.map((u) => {
                        const hasAdminRoles = u.utentiRuoli.some((ur) => ['ADMIN', 'SUPERADMIN'].includes(ur.ruolo.nome));
                        return (
                          <tr key={u.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                            <td style={tdStyle}><code>{u.username}</code></td>
                            <td style={tdStyle}>{u.cognome} {u.nome}</td>
                            
                            {/* Colonna Ruoli */}
                            <td style={tdStyle}>
                              {editingRuoli?.utenteId === u.id ? (
                                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                  {RUOLI_ADMIN.map((r) => (
                                    <label key={r} style={chipStyle(editingRuoli.ruoli.includes(r))}>
                                      <input type="checkbox" checked={editingRuoli.ruoli.includes(r)}
                                        onChange={() => toggleRuoloEditing(r)} style={{ display: 'none' }} />
                                      {r}
                                    </label>
                                  ))}
                                </div>
                              ) : (
                                <span style={{ fontSize: 12, fontWeight: 600, color: '#555' }}>
                                  {u.utentiRuoli.map((ur) => ur.ruolo.nome).join(', ')}
                                </span>
                              )}
                            </td>
                            
                            {/* Colonna Aree */}
                            <td style={tdStyle}>
                              {editingAree?.utenteId === u.id ? (
                                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                  {aree.filter((a) => user?.aree.includes(a.id)).map((a) => (
                                    <label key={a.id} style={chipStyle(editingAree.aree.includes(a.id))}>
                                      <input type="checkbox" checked={editingAree.aree.includes(a.id)}
                                        onChange={() => toggleAreaEditing(a.id)} style={{ display: 'none' }} />
                                      {a.prefisso}
                                    </label>
                                  ))}
                                </div>
                              ) : (
                                <span style={{ fontSize: 12, fontWeight: 600, color: '#555' }}>
                                  {u.utentiAree.map((ua) => {
                                    const area = aree.find((a) => a.id === ua.areaId);
                                    return area?.prefisso;
                                  }).filter(Boolean).join(', ')}
                                </span>
                              )}
                            </td>
                            
                            <td style={tdStyle}>
                              <span style={badgeStyle(u.stato === 'ATTIVO' ? 'green' : u.stato === 'PAUSA' ? 'yellow' : 'red')}>
                                {u.stato}
                              </span>
                            </td>
                            
                            <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>
                              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                
                                {!hasAdminRoles && (
                                  <>
                                    {/* Bottoni Ruoli - Solo per utenti non Admin/SuperAdmin */}
                                    {editingRuoli?.utenteId === u.id ? (
                                      <>
                                        <button onClick={handleSalvaRuoli} style={btnStyle('#22c55e', 'small')}>Salva</button>
                                        <button onClick={() => setEditingRuoli(null)} style={btnStyle('#6b7280', 'small')}>Annulla</button>
                                      </>
                                    ) : (
                                      <button
                                        onClick={() => setEditingRuoli({ utenteId: u.id, ruoli: u.utentiRuoli.map((ur) => ur.ruolo.nome) })}
                                        style={btnStyle('#8b5cf6', 'small')}
                                      >
                                        Ruoli
                                      </button>
                                    )}
                                    
                                    {/* Bottoni Aree - Solo per utenti non Admin/SuperAdmin */}
                                    {editingAree?.utenteId === u.id ? (
                                      <>
                                        <button onClick={handleSalvaAree} style={btnStyle('#22c55e', 'small')}>Salva</button>
                                        <button onClick={() => setEditingAree(null)} style={btnStyle('#6b7280', 'small')}>Annulla</button>
                                      </>
                                    ) : (
                                      <button
                                        onClick={() => setEditingAree({ utenteId: u.id, aree: u.utentiAree.map((ua) => ua.areaId) })}
                                        style={btnStyle('#f59e0b', 'small')}
                                      >
                                        Aree
                                      </button>
                                    )}
                                    
                                    {/* Password change - Solo per utenti non Admin/SuperAdmin */}
                                    {changingPassword?.utenteId === u.id ? (
                                      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                                        <input
                                          type="password"
                                          value={newPasswordInput}
                                          onChange={(e) => setNewPasswordInput(e.target.value)}
                                          placeholder="Nuova password..."
                                          style={{ padding: '2px 6px', fontSize: 11, width: 120 }}
                                        />
                                        <button onClick={handleChangePassword} style={btnStyle('#22c55e', 'small')}>OK</button>
                                        <button onClick={() => { setChangingPassword(null); setNewPasswordInput(''); }} style={btnStyle('#6b7280', 'small')}>✕</button>
                                      </div>
                                    ) : (
                                      <button
                                        onClick={() => setChangingPassword({ utenteId: u.id, username: u.username })}
                                        style={btnStyle('#3b82f6', 'small')}
                                      >
                                        Cambia pwd
                                      </button>
                                    )}
                                    
                                    <button onClick={() => handleResetPwd(u.id)} style={btnStyle('#6366f1', 'small')}>
                                      Reset pwd
                                    </button>
                                    <button onClick={() => handleToggleUtente(u)}
                                      style={btnStyle(u.stato === 'DISABILITATO' ? '#22c55e' : '#ef4444', 'small')}>
                                      {u.stato === 'DISABILITATO' ? 'Abilita' : 'Disabilita'}
                                    </button>
                                    <button onClick={() => handleEliminaUtente(u)}
                                      style={btnStyle('#7f1d1d', 'small')}
                                      title="Elimina definitivamente">
                                      🗑
                                    </button>
                                  </>
                                )}
                                
                                {hasAdminRoles && (
                                  <span style={{ fontSize: 12, color: '#6b7280', fontStyle: 'italic' }}>
                                    Non modificabile
                                  </span>
                                )}
                              </div>
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
    </div>
  );
}

// ── Stili ────────────────────────────────────────────────────────────────────
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
    background: bg, color: 'white', border: 'none', borderRadius: 4,
    cursor: 'pointer', fontWeight: 600,
    padding: size === 'small' ? '4px 10px' : '8px 16px',
    fontSize: size === 'small' ? 12 : 14,
  };
}

function chipStyle(selected: boolean): React.CSSProperties {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 4,
    cursor: 'pointer', padding: '4px 10px',
    border: `1px solid ${selected ? '#16213e' : '#d1d5db'}`,
    borderRadius: 4,
    background: selected ? '#16213e' : 'white',
    color: selected ? 'white' : '#374151',
    fontSize: 12, fontWeight: 600, userSelect: 'none',
  };
}

function badgeStyle(color: 'green' | 'yellow' | 'red'): React.CSSProperties {
  const map = {
    green: { bg: '#dcfce7', text: '#166534' },
    yellow: { bg: '#fef9c3', text: '#854d0e' },
    red: { bg: '#fee2e2', text: '#991b1b' },
  };
  return {
    display: 'inline-block', padding: '2px 8px', borderRadius: 12,
    background: map[color].bg, color: map[color].text,
    fontSize: 12, fontWeight: 600,
  };
}
