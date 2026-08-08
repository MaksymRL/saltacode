import { useAuth } from '../../hooks/useAuth';

/**
 * Dashboard Accoglienza
 * - Tabella servizi con code + pulsante stampa ticket
 * - Tabella operatori attivi/in pausa per area
 * - Aggiornamenti real-time via WebSocket
 */
export default function AccoglienzaDashboard() {
  const { user, logout } = useAuth();

  return (
    <div>
      <header style={{ display: 'flex', justifyContent: 'space-between', padding: '16px', background: '#0f3460', color: 'white' }}>
        <h1 style={{ margin: 0, fontSize: 20 }}>Saltacode — Accoglienza</h1>
        <div>
          <span style={{ marginRight: 16 }}>{user?.username}</span>
          <button onClick={logout}>Esci</button>
        </div>
      </header>

      <main style={{ padding: 24 }}>
        <section>
          <h2>Emetti Ticket</h2>
          <p>Tabella servizi con pulsante stampa — TODO</p>
          {/* Tabella: servizio | in coda | prossimo numero | [Stampa ticket] */}
        </section>

        <section style={{ marginTop: 32 }}>
          <h2>Stato Postazioni</h2>
          <p>Pannello operatori attivi/in pausa — TODO</p>
        </section>
      </main>
    </div>
  );
}
