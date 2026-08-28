import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import apiClient from '../api/client';

/**
 * Menu a tendina per cambiare ruolo attivo senza logout.
 * Appare solo se l'utente ha più di un ruolo disponibile.
 */
export default function RoleSwitcher() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [ruoliDisponibili, setRuoliDisponibili] = useState<string[]>([]);
  const [switching, setSwitching] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem('saltacode_ruoli');
    if (stored) {
      try { setRuoliDisponibili(JSON.parse(stored)); } catch { /* ignore */ }
    }
  }, []);

  if (ruoliDisponibili.length <= 1) return null;

  const handleSwitch = async (ruolo: string) => {
    if (ruolo === user?.ruolo || switching) return;
    setSwitching(true);
    try {
      const res = await apiClient.post<{ token: string; user: typeof user }>('/auth/switch-role', { ruolo });
      if (res.data.user && res.data.token) {
        login(res.data.user as any, res.data.token);
        const routes: Record<string, string> = {
          SUPERADMIN: '/superadmin',
          ADMIN: '/admin',
          ACCOGLIENZA: '/accoglienza',
          OPERATORE: '/operatore',
        };
        navigate(routes[ruolo] ?? '/', { replace: true });
      }
    } catch { /* ignore */ } finally {
      setSwitching(false);
    }
  };

  return (
    <select
      value={user?.ruolo ?? ''}
      onChange={(e) => handleSwitch(e.target.value)}
      disabled={switching}
      title="Cambia ruolo attivo"
      style={{
        padding: '5px 10px',
        borderRadius: 6,
        fontSize: 13,
        fontWeight: 600,
        border: '1px solid rgba(255,255,255,0.25)',
        background: 'rgba(255,255,255,0.12)',
        color: 'white',
        cursor: switching ? 'not-allowed' : 'pointer',
        outline: 'none',
        appearance: 'none',
        paddingRight: 24,
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='white' d='M6 8L1 3h10z'/%3E%3C/svg%3E")`,
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'right 8px center',
      }}
    >
      {ruoliDisponibili.map((r) => (
        <option key={r} value={r} style={{ background: '#1e293b', color: 'white' }}>
          {switching && r === user?.ruolo ? '⏳ ' : ''}{r}
        </option>
      ))}
    </select>
  );
}
