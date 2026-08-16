import { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import apiClient from '../api/client';
import type { PendingAuth } from '../context/AuthContext';

interface LoginResponse {
  pendingToken: string;
  user: PendingAuth['user'];
}

export default function Login() {
  const { setPending } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await apiClient.post<LoginResponse>('/auth/login', { username, password });
      const { pendingToken, user } = res.data;

      // Salva lo stato pending nel context
      setPending({ pendingToken, user });

      // Se l'utente ha un solo ruolo → selezione automatica, salta la schermata
      if (user.ruoli.length === 1) {
        navigate('/select-role', { replace: true });
      } else {
        navigate('/select-role', { replace: true });
      }
    } catch (err: any) {
      const msg = err?.response?.data?.error;
      if (err?.response?.status === 429) {
        setError(msg ?? 'Troppi tentativi. Riprova tra qualche minuto.');
      } else {
        setError('Credenziali non valide. Riprova.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      display: 'flex', justifyContent: 'center', alignItems: 'center',
      minHeight: '100vh', background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
    }}>
      <div style={{
        background: 'white', borderRadius: 12, padding: 40, width: 360,
        boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
      }}>
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

          {error && (
            <div role="alert" style={{
              background: '#fee2e2', border: '1px solid #fca5a5',
              borderRadius: 6, padding: '8px 12px', color: '#991b1b', fontSize: 13,
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              background: loading ? '#9ca3af' : '#1a1a2e',
              color: 'white', border: 'none', borderRadius: 6,
              padding: '11px', fontSize: 15, fontWeight: 700,
              cursor: loading ? 'not-allowed' : 'pointer',
              marginTop: 4,
            }}
          >
            {loading ? 'Accesso in corso…' : 'Accedi'}
          </button>
        </form>
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 12, fontWeight: 600,
  color: '#374151', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5,
};
const inputStyle: React.CSSProperties = {
  display: 'block', width: '100%', padding: '9px 12px',
  border: '1.5px solid #d1d5db', borderRadius: 6, fontSize: 14,
  boxSizing: 'border-box', outline: 'none',
};
