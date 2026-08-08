import { useState } from 'react';
import { useAuth } from '../../hooks/useAuth';

/**
 * Dashboard Operatore
 * - Inserimento numero postazione al login
 * - Tabella servizi con pulsanti Chiama (+) e Annulla (-)
 * - Pannello operatori attivi/in pausa dell'area
 * - Bottone pausa/riattiva postazione
 */
export default function OperatoreDashboard() {
  const { user, logout } = useAuth();
  const [postazione, setPostazione] = useState<number | null>(null);
  const [postazioneInput, setPostazioneInput] = useState('');
  const [postazioneError, setPostazioneError] = useState('');
  const [isPausa, setIsPausa] = useState(false);

  const handlePostazioneSubmit = () => {
    const num = parseInt(postazioneInput, 10);
    if (isNaN(num) || num < 1 || num > 99) {
      setPostazioneError('Inserire un numero tra 1 e 99.');
      return;
    }
    setPostazioneError('');
    setPostazione(num);
    // TODO: notificare il backend del cambio stato ATTIVO via WebSocket/API
  };

  if (postazione === null) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
        <div style={{ textAlign: 'center' }}>
          <h2>Inserisci numero postazione</h2>
          <input
            type="number"
            min={1}
            max={99}
            value={postazioneInput}
            onChange={(e) => setPostazioneInput(e.target.value)}
            style={{ padding: 8, fontSize: 18, width: 100, textAlign: 'center' }}
          />
          {postazioneError && <p style={{ color: 'red' }}>{postazioneError}</p>}
          <br />
          <button onClick={handlePostazioneSubmit} style={{ marginTop: 12, padding: '8px 24px' }}>
            Conferma
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <header style={{ display: 'flex', justifyContent: 'space-between', padding: '16px', background: '#533483', color: 'white' }}>
        <h1 style={{ margin: 0, fontSize: 20 }}>
          Saltacode — Operatore | Postazione {postazione}
        </h1>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            onClick={() => {
              setIsPausa((p) => !p);
              // TODO: API PATCH /api/utenti/:id stato PAUSA/ATTIVO
            }}
            style={{
              padding: '6px 16px',
              background: isPausa ? '#f59e0b' : '#22c55e',
              color: 'white',
              border: 'none',
              borderRadius: 4,
              cursor: 'pointer',
            }}
          >
            {isPausa ? '🟡 In Pausa' : '🟢 Attivo'}
          </button>
          <span>{user?.username}</span>
          <button onClick={logout}>Esci</button>
        </div>
      </header>

      <main style={{ padding: 24 }}>
        <section>
          <h2>Servizi</h2>
          <p>Tabella con pulsanti Chiama (+) e Annulla (–) — TODO</p>
          {/*
            Tabella: servizio | in coda | serviti oggi | [+] [-]
            [+] = POST /api/chiamate
            [-] = DELETE /api/chiamate/:lastId
          */}
        </section>

        <section style={{ marginTop: 32 }}>
          <h2>Colleghi della tua area</h2>
          <p>Lista operatori attivi/in pausa — TODO</p>
        </section>
      </main>
    </div>
  );
}
