import { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import apiClient from '../api/client';

/**
 * Pagina cambio password obbligatorio al primo accesso.
 * Mostrata dopo il login quando mustChangePwd = true.
 */
export default function ChangePassword() {
  const { user, token, login, logout } = useAuth();
  const navigate = useNavigate();
  const [current, setCurrent] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    if (newPwd !== confirm) {
      setError('Le password non coincidono.');
      return;
    }

    setLoading(true);
    try {
      await apiClient.post('/utenti/change-password', {
        currentPassword: current,
        newPassword: newPwd,
      });

      // Aggiorna il contesto: mustChangePwd → false, così non viene
      // reindirizzato di nuovo a /change-password
      if (user && token) {
        login({ ...user, mustChangePwd: false }, token);
      }

      // Redirect alla dashboard del ruolo
      const routes: Record<string, string> = {
        SUPERADMIN: '/superadmin',
        ADMIN: '/admin',
        ACCOGLIENZA: '/accoglienza',
        OPERATORE: '/operatore',
      };
      navigate(routes[user?.ruolo ?? ''] ?? '/', { replace: true });
    } catch (err: any) {
      setError(err?.response?.data?.error ?? 'Errore cambio password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: '#f5f5f5' }}>
      <div style={{ background: 'white', borderRadius: 10, padding: 40, width: 380, boxShadow: '0 2px 12px rgba(0,0,0,0.1)' }}>
        <h2 style={{ margin: '0 0 8px', textAlign: 'center' }}>🔐 Cambia Password</h2>
        <p style={{ color: '#888', textAlign: 'center', margin: '0 0 24px', fontSize: 14 }}>
          Per motivi di sicurezza devi cambiare la password temporanea.
        </p>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <label>
            <span style={labelStyle}>Password attuale</span>
            <input type="password" value={current} onChange={(e) => setCurrent(e.target.value)}
              required style={inputStyle} autoComplete="current-password" />
          </label>
          <label>
            <span style={labelStyle}>Nuova password</span>
            <input type="password" value={newPwd} onChange={(e) => setNewPwd(e.target.value)}
              required style={inputStyle} autoComplete="new-password" />
            <span style={{ fontSize: 11, color: '#9ca3af', marginTop: 4, display: 'block' }}>
              Minimo 10 caratteri, 1 maiuscola, 1 carattere speciale
            </span>
          </label>
          <label>
            <span style={labelStyle}>Conferma nuova password</span>
            <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)}
              required style={inputStyle} autoComplete="new-password" />
          </label>

          {error && <p role="alert" style={{ color: '#ef4444', margin: 0, fontSize: 14 }}>{error}</p>}

          <button type="submit" disabled={loading} style={{
            background: '#1a1a2e', color: 'white', border: 'none',
            borderRadius: 6, padding: '10px', fontSize: 15, fontWeight: 600,
            cursor: loading ? 'not-allowed' : 'pointer',
          }}>
            {loading ? 'Salvataggio…' : 'Imposta nuova password'}
          </button>

          <button type="button" onClick={logout} style={{
            background: 'none', border: 'none', color: '#9ca3af',
            cursor: 'pointer', fontSize: 13, textDecoration: 'underline',
          }}>
            Annulla ed esci
          </button>
        </form>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  display: 'block', width: '100%', padding: '8px 10px',
  border: '1px solid #d1d5db', borderRadius: 4, fontSize: 14,
  boxSizing: 'border-box',
};
const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 12, fontWeight: 600,
  color: '#374151', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5,
};
