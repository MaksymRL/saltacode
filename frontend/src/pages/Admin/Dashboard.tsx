import { useAuth } from '../../hooks/useAuth';

/**
 * Dashboard Admin (per area)
 * - Gestione operatori della propria area
 * - Gestione servizi (crea, abilita/disabilita, assegna)
 * - Pannello postazioni attive/in pausa (real-time via WebSocket)
 * - Tabella riepilogativa code per servizio
 */
export default function AdminDashboard() {
  const { user, logout } = useAuth();

  return (
    <div>
      <header style={{ display: 'flex', justifyContent: 'space-between', padding: '16px', background: '#16213e', color: 'white' }}>
        <h1 style={{ margin: 0, fontSize: 20 }}>Saltacode — Admin</h1>
        <div>
          <span style={{ marginRight: 16 }}>{user?.username}</span>
          <button onClick={logout}>Esci</button>
        </div>
      </header>

      <main style={{ padding: 24 }}>
        <section>
          <h2>Operatori</h2>
          <p>Gestione operatori — TODO</p>
        </section>

        <section style={{ marginTop: 32 }}>
          <h2>Servizi</h2>
          <p>Gestione servizi — TODO</p>
        </section>

        <section style={{ marginTop: 32 }}>
          <h2>Postazioni attive</h2>
          <p>Pannello postazioni real-time — TODO</p>
        </section>

        <section style={{ marginTop: 32 }}>
          <h2>Code per servizio</h2>
          <p>Tabella riepilogativa — TODO</p>
        </section>
      </main>
    </div>
  );
}
