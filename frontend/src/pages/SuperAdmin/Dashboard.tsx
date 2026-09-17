import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useWebSocket } from '../../hooks/useWebSocket';
import apiClient from '../../api/client';
import Logo from '../../components/Logo';
import { useConfirm } from '../../components/ConfirmDialog';

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
  _count: { ticket: number; chiamate: number };
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

type Tab = 'code' | 'aree' | 'servizi' | 'utenti';

const ALL_RUOLI = ['SUPERADMIN', 'ADMIN', 'ACCOGLIENZA', 'OPERATORE'];

export default function SuperAdminDashboard() {
  const { user, login, logout } = useAuth();
  const [tab, setTab] = useState<Tab>('code');
  const { confirm, ConfirmDialog } = useConfirm();

  // ── Code real-time via WebSocket ──────────────────────────────────────────
  interface CodaState { servizioId: number; nomeServizio: string; count: number; }
  const [code, setCode] = useState<CodaState[]>([]);

  const handleWsMessage = useCallback((msg: { type: string; [key: string]: unknown }) => {
    if (msg.type === 'INITIAL_STATE') {
      setCode((msg['code'] as CodaState[]) ?? []);
    }
    if (msg.type === 'TICKET_EMESSO') {
      const { servizioId, coda } = msg as unknown as { servizioId: number; coda: number };
      setCode((prev) => {
        const exists = prev.find((c) => c.servizioId === servizioId);
        if (exists) return prev.map((c) => c.servizioId === servizioId ? { ...c, count: coda } : c);
        return [...prev, { servizioId, nomeServizio: '?', count: coda }];
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

  // ── Config monitor voce ───────────────────────────────────────────────────
  const [monitorVoice, setMonitorVoice] = useState<boolean | null>(null);
  const [monitorVoiceLoading, setMonitorVoiceLoading] = useState(false);

  useEffect(() => {
    apiClient.get<{ voiceEnabled: boolean }>('/monitor/config')
      .then((r) => setMonitorVoice(r.data.voiceEnabled))
      .catch(() => { /* non bloccante */ });
  }, []);

  const handleToggleVoice = async () => {
    setMonitorVoiceLoading(true);
    try {
      const res = await apiClient.patch<{ voiceEnabled: boolean }>('/monitor/config', {
        voiceEnabled: !monitorVoice,
      });
      setMonitorVoice(res.data.voiceEnabled);
    } catch { /* ignora */ }
    finally { setMonitorVoiceLoading(false); }
  };

  // ── Switch ruolo ──────────────────────────────────────────────────────────
  // Carica i ruoli disponibili dal localStorage (salvati al login)
  const [ruoliDisponibili, setRuoliDisponibili] = useState<string[]>(['SUPERADMIN']);
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
    setAreaError(''); setAreaSuccess('');
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
    setAreaError('');
    try {
      await apiClient.patch(`/aree/${area.id}`, { attiva: !area.attiva });
      loadAree();
    } catch (err: any) {
      setAreaError(err?.response?.data?.error ?? 'Errore aggiornamento area.');
    }
  };

  // ── Servizi ───────────────────────────────────────────────────────────────
  const [servizi, setServizi] = useState<Servizio[]>([]);
  const [serviziLoading, setServiziLoading] = useState(false);
  const [serviziError, setServiziError] = useState('');
  const [nuovoServizio, setNuovoServizio] = useState({ nome: '', lettera: '', areaId: 0 });

  const loadServizi = useCallback(async () => {
    setServiziLoading(true);
    try {
      const [sRes, aRes] = await Promise.all([
        apiClient.get<Servizio[]>('/servizi'),
        apiClient.get<Area[]>('/aree'),
      ]);
      setServizi(sRes.data);
      setAree(aRes.data);
    } catch {
      setServiziError('Errore nel caricamento servizi.');
    } finally {
      setServiziLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === 'servizi') loadServizi();
  }, [tab, loadServizi]);

  const handleCreaServizio = async (e: React.FormEvent) => {
    e.preventDefault();
    setServiziError('');
    try {
      await apiClient.post('/servizi', {
        nome: nuovoServizio.nome,
        lettera: nuovoServizio.lettera.toUpperCase(),
        areaId: nuovoServizio.areaId,
      });
      setNuovoServizio({ nome: '', lettera: '', areaId: nuovoServizio.areaId });
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

  // ── Utenti ────────────────────────────────────────────────────────────────
  const [utenti, setUtenti] = useState<Utente[]>([]);
  const [utentiLoading, setUtentiLoading] = useState(false);
  const [utentiError, setUtentiError] = useState('');
  const [utentiSuccess, setUtentiSuccess] = useState('');
  const [nuovoUtente, setNuovoUtente] = useState({
    cognome: '', nome: '', ruoliSelezionati: [] as string[], aree: [] as number[], password: '',
  });
  const [tempPwd, setTempPwd] = useState<string | null>(null);

  // Editing ruoli utente esistente
  const [editingRuoli, setEditingRuoli] = useState<{ utenteId: number; ruoli: string[] } | null>(null);
  const [editingNome, setEditingNome] = useState<{ utenteId: number; cognome: string; nome: string } | null>(null);
  
  // Editing aree utente
  const [editingAree, setEditingAree] = useState<{ utenteId: number; aree: number[] } | null>(null);
  
  // Cambio password utente
  const [changingPassword, setChangingPassword] = useState<{ utenteId: number; username: string } | null>(null);
  const [newPasswordInput, setNewPasswordInput] = useState('');
  const [pwdError, setPwdError] = useState('');

  const loadUtenti = useCallback(async () => {
    setUtentiLoading(true);
    try {
      const [uRes, aRes] = await Promise.all([
        apiClient.get<Utente[]>('/utenti'),
        apiClient.get<Area[]>('/aree'),
      ]);
      setUtenti(uRes.data);
      setAree(aRes.data);
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
    setUtentiError(''); setUtentiSuccess(''); setTempPwd(null);
    try {
      const res = await apiClient.post<Utente & { tempPassword: string | null }>('/utenti', {
        cognome: nuovoUtente.cognome,
        nome: nuovoUtente.nome,
        ruoli: nuovoUtente.ruoliSelezionati,
        aree: nuovoUtente.aree,
        ...(nuovoUtente.password.trim() ? { password: nuovoUtente.password.trim() } : {}),
      });
      setTempPwd(res.data.tempPassword ?? null);
      if (!nuovoUtente.password.trim()) {
        setUtentiSuccess('');  // il banner tempPwd già mostra il messaggio
      } else {
        setUtentiSuccess('Utente creato con la password impostata. Può accedere subito.');
      }
      setNuovoUtente({ cognome: '', nome: '', ruoliSelezionati: [], aree: [], password: '' });
      loadUtenti();
    } catch (err: any) {
      setUtentiError(err?.response?.data?.error ?? 'Errore creazione utente.');
    }
  };

  const handleResetPwd = async (utenteId: number) => {
    setUtentiError(''); setUtentiSuccess(''); setTempPwd(null);
    try {
      const res = await apiClient.patch<{ tempPassword: string }>(`/utenti/${utenteId}`, { resetPassword: true });
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

  const handleEliminaUtente = async (u: Utente) => {
    const ok = await confirm(
      `Eliminare definitivamente ${u.cognome} ${u.nome} (${u.username})?`,
      { title: 'Elimina utente', confirmLabel: 'Elimina', danger: true }
    );
    if (!ok) return;
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

  const handleSalvaNome = async () => {
    if (!editingNome) return;
    setUtentiError('');
    try {
      await apiClient.patch(`/utenti/${editingNome.utenteId}`, {
        cognome: editingNome.cognome,
        nome: editingNome.nome,
      });
      setEditingNome(null);
      setUtentiSuccess('Nome aggiornato.');
      loadUtenti();
    } catch (err: any) {
      setUtentiError(err?.response?.data?.error ?? 'Errore aggiornamento nome.');
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
    setPwdError('');
    setUtentiError('');
    try {
      await apiClient.patch(`/utenti/${changingPassword.utenteId}`, { newPassword: newPasswordInput });
      setChangingPassword(null);
      setNewPasswordInput('');
      setPwdError('');
      setUtentiSuccess('Password cambiata.');
      loadUtenti();
    } catch (err: any) {
      setPwdError(err?.response?.data?.error ?? 'Errore cambio password.');
    }
  };

  const toggleRuoloNuovo = (ruolo: string) =>
    setNuovoUtente((prev) => ({
      ...prev,
      ruoliSelezionati: prev.ruoliSelezionati.includes(ruolo)
        ? prev.ruoliSelezionati.filter((r) => r !== ruolo)
        : [...prev.ruoliSelezionati, ruolo],
    }));

  const toggleAreaNuovo = (areaId: number) =>
    setNuovoUtente((prev) => ({
      ...prev,
      aree: prev.aree.includes(areaId)
        ? prev.aree.filter((a) => a !== areaId)
        : [...prev.aree, areaId],
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

  // Aree attive (per form creazione utente)
  const areeAttive = aree.filter((a) => a.attiva);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: '#f5f5f5', fontFamily: 'system-ui, sans-serif' }}>
      {/* Header */}
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 24px', background: '#1a1a2e', color: 'white' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Logo height={32} />
          <h1 style={{ margin: 0, fontSize: 20 }}>🏢 Saltacode — SuperAdmin</h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* Switch ruolo se disponibile */}
          {ruoliDisponibili.length > 1 && (
            <select
              value={user?.ruolo ?? ''}
              onChange={(e) => handleSwitchRole(e.target.value)}
              disabled={switchingRole}
              style={{ padding: '4px 8px', borderRadius: 4, fontSize: 13, border: '1px solid #444', background: '#2a2a4e', color: 'white', cursor: 'pointer' }}
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

      {/* Tabs */}
      <div style={{ background: 'white', borderBottom: '1px solid #e0e0e0', padding: '0 24px', display: 'flex', gap: 0 }}>
        {([
          { id: 'code', label: '📊 Code live' },
          { id: 'aree', label: '📍 Aree' },
          { id: 'servizi', label: '🔧 Servizi' },
          { id: 'utenti', label: '👤 Utenti' },
        ] as { id: Tab; label: string }[]).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              padding: '12px 24px', border: 'none',
              borderBottom: tab === t.id ? '3px solid #1a1a2e' : '3px solid transparent',
              background: 'none', fontWeight: tab === t.id ? 700 : 400,
              cursor: 'pointer', fontSize: 15,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <main style={{ padding: 24, maxWidth: 1100, margin: '0 auto' }}>

        {/* ── TAB CODE ── */}
        {tab === 'code' && (
          <>
            <h2 style={{ marginTop: 0 }}>Code in tempo reale — tutte le aree</h2>

            {/* Impostazioni monitor */}
            <div style={{ ...cardStyle, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', marginBottom: 20, background: '#1e293b', color: 'white' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>🔊 Voce annunci monitor</div>
                <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
                  Il plim è sempre attivo. La voce è opzionale e si applica a tutti i monitor.
                </div>
              </div>
              <button
                onClick={handleToggleVoice}
                disabled={monitorVoiceLoading || monitorVoice === null}
                style={{
                  background: monitorVoice ? '#22c55e' : '#475569',
                  color: 'white', border: 'none', borderRadius: 8,
                  padding: '8px 20px', fontWeight: 700, fontSize: 14,
                  cursor: monitorVoiceLoading ? 'not-allowed' : 'pointer',
                  minWidth: 120,
                }}
              >
                {monitorVoiceLoading ? '…' : monitorVoice ? '🔊 Voce ON' : '🔇 Voce OFF'}
              </button>
            </div>
            {code.length === 0 ? (
              <p style={{ color: '#888' }}>Nessun servizio con ticket in attesa.</p>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16 }}>
                {code.map((c) => {
                  // Trova il servizio per nome area
                  const servizio = servizi.find((s) => s.id === c.servizioId);
                  const color = c.count === 0 ? '#94a3b8' : c.count < 5 ? '#f59e0b' : '#ef4444';
                  return (
                    <div key={c.servizioId} style={{
                      ...cardStyle,
                      borderLeft: `5px solid ${color}`,
                      marginBottom: 0,
                    }}>
                      <div style={{ fontSize: 11, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
                        {servizio ? `${servizio.area.prefisso}${servizio.lettera}` : `#${c.servizioId}`}
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8, color: '#1e293b' }}>
                        {c.nomeServizio || servizio?.nome || '—'}
                      </div>
                      {servizio && (
                        <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 8 }}>
                          {servizio.area.nome}
                        </div>
                      )}
                      <div style={{ fontSize: 40, fontWeight: 900, color, lineHeight: 1 }}>
                        {c.count}
                      </div>
                      <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>in attesa</div>
                      {servizio && servizio._count.chiamate > 0 && (
                        <div style={{ fontSize: 11, color: '#60a5fa', marginTop: 4, fontWeight: 600 }}>
                          📞 {servizio._count.chiamate} oggi
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* ── TAB AREE ── */}
        {tab === 'aree' && (
          <>
            <h2 style={{ marginTop: 0 }}>Gestione Aree</h2>
            <div style={cardStyle}>
              <h3 style={{ margin: '0 0 16px' }}>Crea nuova area</h3>
              <form onSubmit={handleCreaArea} style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <div>
                  <label style={labelStyle}>Nome area</label>
                  <input style={inputStyle} value={nuovaArea.nome}
                    onChange={(e) => setNuovaArea((p) => ({ ...p, nome: e.target.value }))}
                    placeholder="es. CAF CISL" required />
                </div>
                <div>
                  <label style={labelStyle}>Prefisso (2 lettere)</label>
                  <input style={{ ...inputStyle, width: 80, textTransform: 'uppercase' }}
                    value={nuovaArea.prefisso}
                    onChange={(e) => setNuovaArea((p) => ({ ...p, prefisso: e.target.value.toUpperCase().slice(0, 2) }))}
                    placeholder="CA" maxLength={2} required />
                </div>
                <button type="submit" style={btnStyle('#1a1a2e')}>Crea Area</button>
              </form>
              {areaError && <p style={errorStyle}>{areaError}</p>}
              {areaSuccess && <p style={successStyle}>{areaSuccess}</p>}
            </div>

            {areeLoading ? <p>Caricamento…</p> : (
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
                            <span style={badgeStyle(a.attiva ? 'green' : 'red')}>
                              {a.attiva ? 'Attiva' : 'Disabilitata'}
                            </span>
                          </td>
                          <td style={tdStyle}>
                            <button onClick={() => handleToggleArea(a)}
                              style={btnStyle(a.attiva ? '#f59e0b' : '#22c55e', 'small')}>
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

        {/* ── TAB SERVIZI ── */}
        {tab === 'servizi' && (
          <>
            <h2 style={{ marginTop: 0 }}>Gestione Servizi — tutte le aree</h2>
            <div style={cardStyle}>
              <h3 style={{ margin: '0 0 16px' }}>Nuovo servizio</h3>
              <form onSubmit={handleCreaServizio} style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <div>
                  <label style={labelStyle}>Area</label>
                  <select
                    style={{ ...inputStyle, minWidth: 160 }}
                    value={nuovoServizio.areaId || ''}
                    onChange={(e) => setNuovoServizio((p) => ({ ...p, areaId: Number(e.target.value) }))}
                    required
                  >
                    <option value="">Seleziona area…</option>
                    {aree.map((a) => (
                      <option key={a.id} value={a.id}>{a.prefisso} — {a.nome}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Nome servizio</label>
                  <input style={inputStyle} value={nuovoServizio.nome}
                    onChange={(e) => setNuovoServizio((p) => ({ ...p, nome: e.target.value }))}
                    placeholder="es. Dichiarazione Redditi" required />
                </div>
                <div>
                  <label style={labelStyle}>Lettera</label>
                  <input style={{ ...inputStyle, width: 60, textTransform: 'uppercase' }}
                    value={nuovoServizio.lettera}
                    onChange={(e) => setNuovoServizio((p) => ({ ...p, lettera: e.target.value.toUpperCase().slice(0, 1) }))}
                    placeholder="A" maxLength={1} required />
                </div>
                <button type="submit" style={btnStyle('#1a1a2e')}>Crea Servizio</button>
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
            <h2 style={{ marginTop: 0 }}>Gestione Utenti</h2>

            {tempPwd && (
              <div style={{ ...cardStyle, background: '#fffbeb', border: '1px solid #f59e0b' }}>
                <strong>⚠️ Password temporanea generata (mostra una sola volta):</strong>
                <p style={{ fontFamily: 'monospace', fontSize: 16, margin: '8px 0 0' }}>
                  Password: <strong>{tempPwd}</strong>
                </p>
                <p style={{ fontSize: 12, color: '#92400e', margin: '4px 0 0' }}>
                  L'utente dovrà cambiarla al primo accesso.
                </p>
                <button onClick={() => setTempPwd(null)} style={{ ...btnStyle('#6b7280', 'small'), marginTop: 8 }}>
                  Chiudi
                </button>
              </div>
            )}
            {utentiSuccess && !tempPwd && (
              <div style={{ ...cardStyle, background: '#f0fdf4', border: '1px solid #86efac' }}>
                <strong style={{ color: '#166534' }}>✅ {utentiSuccess}</strong>
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
                    <label style={labelStyle}>Password <span style={{ color: '#9ca3af', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(opzionale — lascia vuoto per generarla)</span></label>
                    <input
                      type="password"
                      style={inputStyle}
                      value={nuovoUtente.password}
                      onChange={(e) => setNuovoUtente((p) => ({ ...p, password: e.target.value }))}
                      placeholder="Min. 10 car., 1 maiuscola, 1 speciale"
                      autoComplete="new-password"
                    />
                  </div>
                </div>
                <div style={{ marginBottom: 12 }}>
                  <label style={labelStyle}>Ruoli (uno o più)</label>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
                    {ALL_RUOLI.map((r) => (
                      <label key={r} style={chipStyle(nuovoUtente.ruoliSelezionati.includes(r))}>
                        <input type="checkbox" checked={nuovoUtente.ruoliSelezionati.includes(r)}
                          onChange={() => toggleRuoloNuovo(r)} style={{ display: 'none' }} />
                        {r}
                      </label>
                    ))}
                  </div>
                </div>
                <div style={{ marginBottom: 12 }}>
                  <label style={labelStyle}>Aree assegnate (solo aree attive)</label>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
                    {areeAttive.length === 0 && <span style={{ color: '#9ca3af', fontSize: 13 }}>Nessuna area attiva.</span>}
                    {areeAttive.map((a) => (
                      <label key={a.id} style={chipStyle(nuovoUtente.aree.includes(a.id))}>
                        <input type="checkbox" checked={nuovoUtente.aree.includes(a.id)}
                          onChange={() => toggleAreaNuovo(a.id)} style={{ display: 'none' }} />
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
            {utentiLoading ? <p>Caricamento…</p> : (
              <div style={cardStyle}>
                <h3 style={{ margin: '0 0 16px' }}>Utenti ({utenti.length})</h3>
                {utenti.length === 0 ? (
                  <p style={{ color: '#888' }}>Nessun utente.</p>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: '#f5f5f5' }}>
                        {['Username', 'Cognome Nome', 'Ruoli', 'Aree', 'Stato', 'Azioni'].map((h) => (
                          <th key={h} style={thStyle}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {utenti.map((u) => (
                        <tr key={u.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                          <td style={tdStyle}><code>{u.username}</code></td>
                          <td style={tdStyle}>
                            {editingNome?.utenteId === u.id ? (
                              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                                <input
                                  style={{ padding: '3px 6px', fontSize: 12, border: '1px solid #d1d5db', borderRadius: 4, width: 90 }}
                                  value={editingNome.cognome}
                                  onChange={(e) => setEditingNome((p) => p ? { ...p, cognome: e.target.value } : p)}
                                  placeholder="Cognome"
                                />
                                <input
                                  style={{ padding: '3px 6px', fontSize: 12, border: '1px solid #d1d5db', borderRadius: 4, width: 80 }}
                                  value={editingNome.nome}
                                  onChange={(e) => setEditingNome((p) => p ? { ...p, nome: e.target.value } : p)}
                                  placeholder="Nome"
                                />
                                <button onClick={handleSalvaNome} style={btnStyle('#22c55e', 'small')}>✓</button>
                                <button onClick={() => setEditingNome(null)} style={btnStyle('#6b7280', 'small')}>✕</button>
                              </div>
                            ) : (
                              <span
                                onClick={() => setEditingNome({ utenteId: u.id, cognome: u.cognome, nome: u.nome })}
                                title="Click per modificare"
                                style={{ cursor: 'pointer' }}
                              >
                                {u.cognome} {u.nome} <span style={{ fontSize: 10, color: '#94a3b8' }}>✏</span>
                              </span>
                            )}
                          </td>
                          
                          {/* Colonna Ruoli */}
                          <td style={tdStyle}>
                            {editingRuoli?.utenteId === u.id ? (
                              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                {ALL_RUOLI.map((r) => (
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
                                {aree.map((a) => (
                                  <label key={a.id} style={chipStyle(editingAree.aree.includes(a.id))}>
                                    <input type="checkbox" checked={editingAree.aree.includes(a.id)}
                                      onChange={() => toggleAreaEditing(a.id)} style={{ display: 'none' }} />
                                    {a.prefisso} — {a.nome}
                                  </label>
                                ))}
                              </div>
                            ) : (
                              <span style={{ fontSize: 12, fontWeight: 600, color: '#555' }}>
                                {u.utentiAree.map((ua) => {
                                  const area = aree.find((a) => a.id === ua.areaId);
                                  return area ? `${area.prefisso} — ${area.nome}` : null;
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
                              
                              {/* Bottoni Ruoli */}
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
                              
                              {/* Bottoni Aree */}
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
                              
                              {/* Password change */}
                              {changingPassword?.utenteId === u.id ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                  <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                                    <input
                                      type="password"
                                      value={newPasswordInput}
                                      onChange={(e) => { setNewPasswordInput(e.target.value); setPwdError(''); }}
                                      placeholder="Nuova password..."
                                      style={{ padding: '2px 6px', fontSize: 11, width: 140 }}
                                    />
                                    <button onClick={handleChangePassword} style={btnStyle('#22c55e', 'small')}>OK</button>
                                    <button onClick={() => { setChangingPassword(null); setNewPasswordInput(''); setPwdError(''); }} style={btnStyle('#6b7280', 'small')}>✕</button>
                                  </div>
                                  {changingPassword?.utenteId === u.id && pwdError && (
                                    <span style={{ fontSize: 11, color: '#ef4444', maxWidth: 240 }}>{pwdError}</span>
                                  )}
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
                            </div>
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
      <ConfirmDialog />
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
    border: `1px solid ${selected ? '#1a1a2e' : '#d1d5db'}`,
    borderRadius: 4,
    background: selected ? '#1a1a2e' : 'white',
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
