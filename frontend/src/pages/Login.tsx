import { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import apiClient from '../api/client';
import type { PendingAuth } from '../context/AuthContext';

interface LoginResponse {
  pendingToken: string;
  user: PendingAuth['user'];
}

interface ChangePwdStep {
  pendingToken: string;
  user: PendingAuth['user'];
}

export default function Login() {
  const { setPending } = useAuth();
  const navigate = useNavigate();

  // Step 1: credenziali
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Step 2: cambio password obbligatorio (prima di scegliere il ruolo)
  const [changePwdStep, setChangePwdStep] = useState<ChangePwdStep | null>(null);
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [changePwdLoading, setChangePwdLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await apiClient.post<LoginResponse>('/auth/login', { username, password });
      const { pendingToken, user } = res.data;

      if (user.mustChangePwd) {
        // Mostra il form cambio password inline prima di andare avanti
        setChangePwdStep({ pendingToken, user });
      } else {
        setPending({ pendingToken, user });
        navigate('/select-role', { replace: true });
      }
    } catch (err: any) {
      if (err?.response?.status === 429) {
        const retryAfter = err.response.headers['retry-after'];
        const secs = retryAfter ? parseInt(retryAfter, 10) : null;
        setError(
          secs
            ? `Troppi tentativi. Riprova tra ${secs} secondi.`
            : 'Troppi tentativi. Riprova tra qualche minuto.'
        );
      } else {
        setError('Credenziali non valide. Riprova.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleChangePwd = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    if (newPwd !== confirmPwd) {
      setError('Le password non coincidono.');
      return;
    }

    if (!changePwdStep) return;
    setChangePwdLoading(true);

    try {
      // Prima selezioniamo un ruolo temporaneo per ottenere il JWT e poter chiamare change-password
      const ruoloTemp = changePwdStep.user.ruoli[0]!;
      const selRes = await apiClient.post<{ token: string; user: { mustChangePwd: boolean } }>(
        '/auth/select-role',
        { pendingToken: changePwdStep.pendingToken, ruolo: ruoloTemp }
      );
      const tempToken = selRes.data.token;

      // Cambio password usando il JWT temporaneo
      await apiClient.post(
        '/utenti/change-password',
        { currentPassword: password, newPassword: newPwd },
        { headers: { Authorization: `Bearer ${tempToken}` } }
      );

      // Ora facciamo un nuovo login con la nuova password per ottenere un pendingToken fresco
      const loginRes = await apiClient.post<LoginResponse>('/auth/login', {
        username,
        password: newPwd,
      });
      setPending({ pendingToken: loginRes.data.pendingToken, user: { ...loginRes.data.user, mustChangePwd: false } });
      navigate('/select-role', { replace: true });
    } catch (err: any) {
      setError(err?.response?.data?.error ?? 'Errore durante il cambio password.');
    } finally {
      setChangePwdLoading(false);
    }
  };

  // ── Step 2: form cambio password ─────────────────────────────────────────
  if (changePwdStep) {
    return (
      <div style={outerStyle}>
        <div style={cardStyle}>
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <div style={{ fontSize: 36, marginBottom: 8 }}>🔐</div>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: '#1a1a2e' }}>
              Cambia Password
            </h2>
            <p style={{ margin: '6px 0 0', color: '#6b7280', fontSize: 13 }}>
              Benvenuto {changePwdStep.user.nome}! Devi impostare una nuova password prima di accedere.
            </p>
          </div>

          <form onSubmit={handleChangePwd} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <label>
              <span style={labelStyle}>Nuova password</span>
              <input
                type="password"
                value={newPwd}
                onChange={(e) => setNewPwd(e.target.value)}
                required
                autoFocus
                style={inputStyle}
                autoComplete="new-password"
              />
              <span style={{ fontSize: 11, color: '#9ca3af', marginTop: 3, display: 'block' }}>
                Min. 10 caratteri, 1 maiuscola, 1 carattere speciale
              </span>
            </label>
            <label>
              <span style={labelStyle}>Conferma nuova password</span>
              <input
                type="password"
                value={confirmPwd}
                onChange={(e) => setConfirmPwd(e.target.value)}
                required
                style={inputStyle}
                autoComplete="new-password"
              />
            </label>

            {error && <div role="alert" style={errorBoxStyle}>{error}</div>}

            <button type="submit" disabled={changePwdLoading} style={submitBtnStyle(changePwdLoading)}>
              {changePwdLoading ? 'Salvataggio…' : 'Imposta password e continua'}
            </button>
            <button
              type="button"
              onClick={() => { setChangePwdStep(null); setError(''); setNewPwd(''); setConfirmPwd(''); }}
              style={linkBtnStyle}
            >
              ← Torna al login
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ── Step 1: form login ────────────────────────────────────────────────────
  return (
    <div style={outerStyle}>
      <div style={cardStyle}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>🎫</div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: '#1a1a2e' }}>Saltacode</h1>
          <p style={{ margin: '4px 0 0', color: '#6b7280', fontSize: 14 }}>Gestione Code CISL</p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <label>
            <span style={labelStyle}>Username</span>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              required
              autoFocus
              style={inputStyle}
            />
          </label>

          <label>
            <span style={labelStyle}>Password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
              style={inputStyle}
            />
          </label>

          {error && <div role="alert" style={errorBoxStyle}>{error}</div>}

          <button type="submit" disabled={loading} style={submitBtnStyle(loading)}>
            {loading ? 'Accesso in corso…' : 'Accedi'}
          </button>
        </form>
      </div>
    </div>
  );
}

const outerStyle: React.CSSProperties = {
  display: 'flex', justifyContent: 'center', alignItems: 'center',
  minHeight: '100vh', background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
};
const cardStyle: React.CSSProperties = {
  background: 'white', borderRadius: 12, padding: 40, width: 360,
  boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
};
const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 12, fontWeight: 600,
  color: '#374151', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5,
};
const inputStyle: React.CSSProperties = {
  display: 'block', width: '100%', padding: '9px 12px',
  border: '1.5px solid #d1d5db', borderRadius: 6, fontSize: 14,
  boxSizing: 'border-box', outline: 'none',
};
const errorBoxStyle: React.CSSProperties = {
  background: '#fee2e2', border: '1px solid #fca5a5',
  borderRadius: 6, padding: '8px 12px', color: '#991b1b', fontSize: 13,
};
const submitBtnStyle = (disabled: boolean): React.CSSProperties => ({
  background: disabled ? '#9ca3af' : '#1a1a2e',
  color: 'white', border: 'none', borderRadius: 6,
  padding: '11px', fontSize: 15, fontWeight: 700,
  cursor: disabled ? 'not-allowed' : 'pointer',
  marginTop: 4,
});
const linkBtnStyle: React.CSSProperties = {
  background: 'none', border: 'none', color: '#9ca3af',
  cursor: 'pointer', fontSize: 13, textDecoration: 'underline',
};
