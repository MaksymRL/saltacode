import { useAuth } from '../../hooks/useAuth';

/**
 * Dashboard SuperAdmin
 * - Gestione aree (crea, abilita/disabilita)
 * - Gestione utenti Admin e Accoglienza
 * - Statistiche globali per area
 */
export default function SuperAdminDashboard() {
  const { user, logout } = useAuth();

  return (
    <div>
      <header style={{ display: 'flex', justifyContent: 'space-between', padding: '16px', background: '#1a1a2e', color: 'white' }}>
        <h1 style={{ margin: 0, fontSize: 20 }}>Saltacode — SuperAdmin</h1>
        <div>
          <span style={{ marginRight: 16 }}>{user?.username}</span>
          <button onClick={logout}>Esci</button>
        </div>
      </header>

      <main style={{ padding: 24 }}>
        {/* TODO: implementare sezioni */}
        <section>
          <h2>Aree</h2>
          <p>Gestione aree — TODO</p>
          {/* <AreeManager /> */}
        </section>

        <section style={{ marginTop: 32 }}>
          <h2>Utenti Admin e Accoglienza</h2>
          <p>Gestione utenti — TODO</p>
          {/* <UtentiManager ruoli={['ADMIN', 'ACCOGLIENZA']} /> */}
        </section>
      </main>
    </div>
  );
}
