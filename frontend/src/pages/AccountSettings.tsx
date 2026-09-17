import { useState, FormEvent } from 'react';
import { useAuth } from '../hooks/useAuth';
import apiClient from '../api/client';

/**
 * Modale impostazioni account:
 * - Cambio nome, cognome e username
 * - Cambio password
 */
export default function AccountSettings({ onClose }: { onClose: () => void }) {
  const { user, login, token } = useAuth();

  // Ruoli disponibili per questo utente (salvati al login)
  const ruoliDisponibili: string[] = (() => {
    try { return JSON.parse(localStorage.getItem('saltacode_ruoli') ?? '[]'); }
    catch { return [user?.ruolo ?? '']; }
  })();

  // La sezione profilo (nome/cognome) è visibile se l'utente ha almeno ADMIN o SUPERADMIN
  const canEditProfile = ruoliDisponibili.some((r) => ['ADMIN', 'SUPERADMIN'].includes(r));

  // ── Dati profilo ────────────────────────────────────────────────
  const [nome, setNome] = useState('');
  const [cognome, setCognome] = useState('');
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileMsg, setProfileMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const handleProfile = async (e: FormEvent) => {
    e.preventDefault();
    setProfileMsg(null);

    const body: Record<string, string> = {};
    if (nome.trim()) body['nome'] = nome.trim();
    if (cognome.trim()) body['cognome'] = cognome.trim();

    if (Object.keys(body).length === 0) {
      setProfileMsg({ type: 'err', text: 'Inserisci almeno un campo da aggiornare.' });
      return;
    }

    setProfileLoading(true);
    try {
      const res = await apiClient.patch<{ message: string; username: string; nome: string; cognome: string }>('/utenti/me', body);
      setProfileMsg({ type: 'ok', text: `Profilo aggiornato. Nuovo username: ${res.data.username}` });
      setNome(''); setCognome('');
      // Aggiorna il contesto con il nuovo username
      if (user && token) {
        login({ ...user, username: res.data.username }, token);
      }
    } catch (err: any) {
      setProfileMsg({ type: 'err', text: err?.response?.data?.error ?? 'Errore.' });
    } finally {
      setProfileLoading(false);
    }
  };

  // ── Cambio password ─────────────────────────────────────────────
  const [currentPwd, setCurrentPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [pwdLoading, setPwdLoading] = useState(false);
  const [pwdMsg, setPwdMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const handlePassword = async (e: FormEvent) => {
    e.preventDefault();
    setPwdMsg(null);
    if (newPwd !== confirmPwd) { setPwdMsg({ type: 'err', text: 'Le password non coincidono.' }); return; }
    setPwdLoading(true);
    try {
      await apiClient.patch('/utenti/me', { currentPassword: currentPwd, newPassword: newPwd });
      setPwdMsg({ type: 'ok', text: 'Password aggiornata con successo.' });
      setCurrentPwd(''); setNewPwd(''); setConfirmPwd('');
    } catch (err: any) {
      setPwdMsg({ type: 'err', text: err?.response?.data?.error ?? 'Errore.' });
    } finally {
      setPwdLoading(false);
    }
  };

  return (
    <div style={S.overlay} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={S.modal}>

        {/* Header */}
        <div style={S.header}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>⚙ Impostazioni Account</div>
            <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
              Utente: <strong>{user?.username}</strong>
            </div>
          </div>
          <button onClick={onClose} style={S.closeBtn}>✕</button>
        </div>

        <div style={S.body}>

          {/* ── Profilo — solo chi ha ADMIN o SUPERADMIN tra i propri ruoli ── */}
          {canEditProfile && (
            <>
              <section>
                <h3 style={S.sectionTitle}>Modifica profilo</h3>
                <form onSubmit={handleProfile} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <div style={{ flex: 1 }}>
                      <label style={S.label}>Cognome</label>
                      <input type="text" value={cognome} onChange={(e) => setCognome(e.target.value)}
                        placeholder="Nuovo cognome" style={S.input} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={S.label}>Nome</label>
                      <input type="text" value={nome} onChange={(e) => setNome(e.target.value)}
                        placeholder="Nuovo nome" style={S.input} />
                    </div>
                  </div>
                  <span style={S.hint}>Lo username verrà aggiornato automaticamente (es. mrossi → anomi)</span>
                  {profileMsg && <div style={msgStyle(profileMsg.type)}>{profileMsg.text}</div>}
                  <button type="submit" disabled={profileLoading} style={S.btn(profileLoading)}>
                    {profileLoading ? 'Salvataggio…' : 'Aggiorna profilo'}
                  </button>
                </form>
              </section>
              <div style={S.divider} />
            </>
          )}

          {/* ── Password ── */}
          <section>
            <h3 style={S.sectionTitle}>Cambia password</h3>
            <form onSubmit={handlePassword} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <label style={S.label}>Password attuale</label>
                <input type="password" value={currentPwd} onChange={(e) => setCurrentPwd(e.target.value)}
                  required style={S.input} autoComplete="current-password" />
              </div>
              <div>
                <label style={S.label}>Nuova password</label>
                <input type="password" value={newPwd} onChange={(e) => setNewPwd(e.target.value)}
                  required style={S.input} autoComplete="new-password" />
                <span style={S.hint}>Min. 10 caratteri, 1 maiuscola, 1 carattere speciale</span>
              </div>
              <div>
                <label style={S.label}>Conferma nuova password</label>
                <input type="password" value={confirmPwd} onChange={(e) => setConfirmPwd(e.target.value)}
                  required style={S.input} autoComplete="new-password" />
              </div>
              <button type="submit" disabled={pwdLoading} style={S.btn(pwdLoading)}>
                {pwdLoading ? 'Salvataggio…' : 'Cambia password'}
              </button>
              {pwdMsg && <div style={msgStyle(pwdMsg.type)}>{pwdMsg.text}</div>}
            </form>
          </section>

        </div>
      </div>
    </div>
  );
}

function msgStyle(type: 'ok' | 'err'): React.CSSProperties {
  return {
    padding: '7px 12px', borderRadius: 6, fontSize: 13,
    background: type === 'ok' ? '#f0fdf4' : '#fee2e2',
    color: type === 'ok' ? '#166534' : '#991b1b',
    border: `1px solid ${type === 'ok' ? '#86efac' : '#fca5a5'}`,
  };
}

const S = {
  overlay: { position: 'fixed' as const, inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
  modal: { background: 'white', borderRadius: 12, width: 440, maxWidth: '95vw', maxHeight: '90vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '16px 20px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc' },
  body: { padding: '20px' },
  closeBtn: { background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: '#94a3b8', padding: '2px 6px', borderRadius: 4, lineHeight: 1 } as React.CSSProperties,
  sectionTitle: { margin: '0 0 12px', fontSize: 13, fontWeight: 700, color: '#1e293b', textTransform: 'uppercase' as const, letterSpacing: 0.5 },
  divider: { height: 1, background: '#e2e8f0', margin: '20px 0' },
  label: { display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4 } as React.CSSProperties,
  input: { display: 'block', width: '100%', padding: '8px 10px', border: '1.5px solid #d1d5db', borderRadius: 6, fontSize: 14, boxSizing: 'border-box' as const },
  hint: { fontSize: 11, color: '#94a3b8', marginTop: 3, display: 'block' } as React.CSSProperties,
  btn: (disabled: boolean): React.CSSProperties => ({ background: disabled ? '#9ca3af' : '#1e293b', color: 'white', border: 'none', borderRadius: 6, padding: '9px 16px', fontWeight: 600, fontSize: 14, cursor: disabled ? 'not-allowed' : 'pointer' }),
};
