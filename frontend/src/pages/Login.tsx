import { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import apiClient from '../api/client';
import type { AuthUser } from '../context/AuthContext';

export default function Login() {
  const { login } = useAuth();
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
      const res = await apiClient.post<{ token: string; user: AuthUser }>('/auth/login', {
        username,
        password,
      });

      const { token, user } = res.data;
      login(user, token);

      // Redirect in base al ruolo
      const routes: Record<string, string> = {
        SUPERADMIN: '/superadmin',
        ADMIN: '/admin',
        ACCOGLIENZA: '/accoglienza',
        OPERATORE: '/operatore',
      };
      navigate(routes[user.ruolo] ?? '/');
    } catch {
      setError('Credenziali non valide. Riprova.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
      <form onSubmit={handleSubmit} style={{ width: 320, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h1 style={{ textAlign: 'center', marginBottom: 8 }}>Saltacode</h1>
        <h2 style={{ textAlign: 'center', fontWeight: 'normal', fontSize: 16, marginBottom: 16 }}>
          Gestione Code CISL
        </h2>

        <label>
          Username
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            required
            style={{ display: 'block', width: '100%', padding: '8px', marginTop: 4 }}
          />
        </label>

        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
            style={{ display: 'block', width: '100%', padding: '8px', marginTop: 4 }}
          />
        </label>

        {error && (
          <p role="alert" style={{ color: 'red', margin: 0 }}>
            {error}
          </p>
        )}

        <button type="submit" disabled={loading} style={{ padding: '10px', marginTop: 8 }}>
          {loading ? 'Accesso in corso…' : 'Accedi'}
        </button>
      </form>
    </div>
  );
}
