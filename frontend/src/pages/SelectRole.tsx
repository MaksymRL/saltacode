import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, type AuthUser } from '../context/AuthContext';
import apiClient from '../api/client';

interface SelectRoleResponse {
  token: string;
  user: AuthUser;
}

/** Icona e colore per ogni ruolo */
const RUOLO_META: Record<string, { icon: string; color: string; bg: string; desc: string }> = {
  SUPERADMIN: {
    icon: '👑', color: '#7c3aed', bg: '#f5f3ff',
    desc: 'Gestione globale: aree, utenti Admin e Accoglienza',
  },
  ADMIN: {
    icon: '📋', color: '#1d4ed8', bg: '#eff6ff',
    desc: 'Gestione area: servizi, operatori e statistiche',
  },
  ACCOGLIENZA: {
    icon: '🎫', color: '#0f766e', bg: '#f0fdfa',
    desc: 'Emissione ticket e stampa per i clienti',
  },
  OPERATORE: {
    icon: '🖥️', color: '#7c2d12', bg: '#fff7ed',
    desc: 'Chiamata numeri dalla postazione',
  },
};

export default function SelectRole() {
  const { pending, login, logout } = useAuth();
  const navigate = useNavigate();
  const [selecting, setSelecting] = useState<string | null>(null);
  const [error, setError] = useState('');

  // Se non c'è uno stato pending (es. ricarica pagina) → torna al login
  useEffect(() => {
    if (!pending) navigate('/login', { replace: true });
  }, [pending, navigate]);

  if (!pending) return null;

  const { pendingToken, user } = pending;

  const handleSelect = async (ruolo: string) => {
    setError('');
    setSelecting(ruolo);
    try {
      const res = await apiClient.post<SelectRoleResponse>('/auth/select-role', {
        pendingToken,
        ruolo,
      });
      const { token, user: loggedUser } = res.data;
      login(loggedUser, token);

      // Redirect in base al ruolo scelto
      if (loggedUser.mustChangePwd) {
        navigate('/change-password', { replace: true });
        return;
      }

      const routes: Record<string, string> = {
        SUPERADMIN: '/superadmin',
        ADMIN: '/admin',
        ACCOGLIENZA: '/accoglienza',
        OPERATORE: '/operatore',
      };
      navigate(routes[loggedUser.ruolo] ?? '/', { replace: true });
    } catch (err: any) {
      setError(err?.response?.data?.error ?? 'Errore durante la selezione del ruolo.');
      setSelecting(null);
    }
  };

  return (
    <div style={{
      display: 'flex', justifyContent: 'center', alignItems: 'center',
      minHeight: '100vh', background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
    }}>
      <div style={{
        background: 'white', borderRadius: 12, padding: 40, width: 420,
        boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
      }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>👤</div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: '#1a1a2e' }}>
            Benvenuto, {user.nome}
          </h2>
          <p style={{ margin: '6px 0 0', color: '#6b7280', fontSize: 14 }}>
            Scegli con quale ruolo vuoi accedere
          </p>
        </div>

        {error && (
          <div style={{
            background: '#fee2e2', border: '1px solid #fca5a5',
            borderRadius: 6, padding: '8px 12px', color: '#991b1b',
            fontSize: 13, marginBottom: 16,
          }}>
            {error}
          </div>
        )}

        {/* Lista ruoli */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {user.ruoli.map((ruolo) => {
            const meta = RUOLO_META[ruolo] ?? { icon: '🔧', color: '#374151', bg: '#f9fafb', desc: ruolo };
            const isSelecting = selecting === ruolo;

            return (
              <button
                key={ruolo}
                onClick={() => handleSelect(ruolo)}
                disabled={selecting !== null}
                style={{
                  display: 'flex', alignItems: 'center', gap: 14,
                  padding: '14px 16px',
                  background: isSelecting ? meta.bg : 'white',
                  border: `2px solid ${isSelecting ? meta.color : '#e5e7eb'}`,
                  borderRadius: 8,
                  cursor: selecting !== null ? 'not-allowed' : 'pointer',
                  transition: 'all 0.15s',
                  textAlign: 'left',
                  opacity: selecting !== null && !isSelecting ? 0.5 : 1,
                }}
                onMouseEnter={(e) => {
                  if (selecting === null) {
                    (e.currentTarget as HTMLButtonElement).style.borderColor = meta.color;
                    (e.currentTarget as HTMLButtonElement).style.background = meta.bg;
                  }
                }}
                onMouseLeave={(e) => {
                  if (selecting !== ruolo) {
                    (e.currentTarget as HTMLButtonElement).style.borderColor = '#e5e7eb';
                    (e.currentTarget as HTMLButtonElement).style.background = 'white';
                  }
                }}
              >
                <span style={{ fontSize: 28, lineHeight: 1 }}>{meta.icon}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 15, color: meta.color }}>
                    {ruolo}
                  </div>
                  <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
                    {meta.desc}
                  </div>
                </div>
                {isSelecting && (
                  <span style={{ fontSize: 18, animation: 'spin 1s linear infinite' }}>⏳</span>
                )}
              </button>
            );
          })}
        </div>

        {/* Footer */}
        <div style={{ marginTop: 24, textAlign: 'center' }}>
          <button
            onClick={logout}
            style={{
              background: 'none', border: 'none', color: '#9ca3af',
              cursor: 'pointer', fontSize: 13, textDecoration: 'underline',
            }}
          >
            ← Torna al login
          </button>
        </div>
      </div>
    </div>
  );
}
