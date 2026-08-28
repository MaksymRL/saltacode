import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useWebSocket } from '../../hooks/useWebSocket';
import apiClient from '../../api/client';
import RoleSwitcher from '../../components/RoleSwitcher';

interface Servizio {
  id: number;
  nome: string;
  lettera: string;
  attivo: boolean;
  areaId: number;
  area: { id: number; nome: string; prefisso: string };
  _count: { ticket: number };
}

interface CodaState {
  servizioId: number;
  count: number;
}

interface TicketEmesso {
  id: number;
  numero: string;
  emessoPer: string;
  stato: string;
}

export default function AccoglienzaDashboard() {
  const { user, logout } = useAuth();
  const [servizi, setServizi] = useState<Servizio[]>([]);
  const [loading, setLoading] = useState(true);
  const [code, setCode] = useState<CodaState[]>([]);
  const [emitting, setEmitting] = useState<number | null>(null); // servizioId in corso
  const [globalEmitting, setGlobalEmitting] = useState(false); // blocca tutti i pulsanti durante emissione
  const [error, setError] = useState('');
  const [lastTicket, setLastTicket] = useState<TicketEmesso | null>(null);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const printRef = useRef<HTMLIFrameElement | null>(null);

  // Carica servizi
  const loadServizi = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.get<Servizio[]>('/servizi');
      setServizi(res.data.filter((s) => s.attivo));
    } catch {
      setError('Errore nel caricamento servizi.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadServizi();
  }, [loadServizi]);

  // WebSocket — aggiornamento code in real-time
  const handleWsMessage = useCallback((msg: { type: string; [key: string]: unknown }) => {
    if (msg.type === 'INITIAL_STATE') {
      const wsCode = (msg['code'] as CodaState[]) ?? [];
      setCode(wsCode);
    }
    if (msg.type === 'TICKET_EMESSO') {
      const { servizioId, coda } = msg as unknown as { servizioId: number; coda: number };
      setCode((prev) => {
        const existing = prev.find((c) => c.servizioId === servizioId);
        if (existing) return prev.map((c) => c.servizioId === servizioId ? { ...c, count: coda } : c);
        return [...prev, { servizioId, count: coda }];
      });
    }
    if (msg.type === 'NUMERO_CHIAMATO') {
      const { servizioId } = msg as unknown as { servizioId: number };
      setCode((prev) =>
        prev.map((c) => c.servizioId === servizioId ? { ...c, count: Math.max(0, c.count - 1) } : c)
      );
    }
  }, []);

  useWebSocket({ onMessage: handleWsMessage });

  // Emetti ticket e stampa PDF
  const handleEmittiTicket = async (servizioId: number) => {
    if (globalEmitting) return; // blocca doppi click
    setError('');
    setEmitting(servizioId);
    setGlobalEmitting(true);

    // Cancella eventuale auto-dismiss precedente
    if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    setLastTicket(null);

    try {
      const res = await apiClient.post<{ ticket: TicketEmesso; pdf: string }>('/ticket', { servizioId });
      const { ticket, pdf } = res.data;
      setLastTicket(ticket);

      // Auto-dismiss del banner dopo 8 secondi
      dismissTimerRef.current = setTimeout(() => setLastTicket(null), 8000);

      // Stampa automatica PDF senza aprire nuove pagine
      try {
        const pdfBytes = Uint8Array.from(atob(pdf), (c) => c.charCodeAt(0));
        const blob = new Blob([pdfBytes], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        
        // Usa iframe nascosto per stampa diretta
        if (printRef.current) {
          printRef.current.src = url;
          printRef.current.onload = () => {
            try {
              const printWindow = printRef.current?.contentWindow;
              if (printWindow) {
                printWindow.print();
                // Cleanup dopo stampa
                setTimeout(() => {
                  URL.revokeObjectURL(url);
                  if (printRef.current) printRef.current.src = '';
                }, 1000);
              }
            } catch (iframeError) {
              console.warn('Stampa iframe fallita, uso download:', iframeError);
              // Fallback: download automatico senza popup
              const link = document.createElement('a');
              link.href = url;
              link.download = `ticket-${ticket.numero}.pdf`;
              link.style.display = 'none';
              document.body.appendChild(link);
              link.click();
              document.body.removeChild(link);
              URL.revokeObjectURL(url);
            }
          };
        } else {
          // Se iframe non disponibile, download diretto
          const link = document.createElement('a');
          link.href = url;
          link.download = `ticket-${ticket.numero}.pdf`;
          link.style.display = 'none';
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
        }
      } catch (printError) {
        console.error('Errore stampa:', printError);
        setError('Ticket emesso correttamente, ma errore durante la stampa. Riprova o contatta l\'amministratore.');
      }
    } catch (err: any) {
      setError(err?.response?.data?.error ?? 'Errore emissione ticket.');
    } finally {
      setEmitting(null);
      setGlobalEmitting(false);
    }
  };

  const getCoda = (servizioId: number) =>
    code.find((c) => c.servizioId === servizioId)?.count ?? 0;

  return (
    <div style={{ minHeight: '100vh', background: '#f0f4ff', fontFamily: 'system-ui, sans-serif' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 24px', background: '#0f3460', color: 'white' }}>
        <h1 style={{ margin: 0, fontSize: 20 }}>🎫 Saltacode — Accoglienza</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ color: '#aaa', fontSize: 14 }}>{user?.username}</span>
          <RoleSwitcher />
          <button onClick={logout} style={btnStyle('#ef4444')}>Esci</button>
        </div>
      </header>

      <main style={{ padding: 24, maxWidth: 900, margin: '0 auto' }}>
        <h2 style={{ marginTop: 0 }}>Emetti Ticket</h2>

        {error && (
          <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 6, padding: '10px 16px', marginBottom: 16, color: '#991b1b' }}>
            {error}
          </div>
        )}

        {lastTicket && (
          <div style={{ background: '#dcfce7', border: '1px solid #86efac', borderRadius: 6, padding: '12px 16px', marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <strong style={{ fontSize: 16 }}>✅ Ticket emesso:</strong>
              <span style={{ fontSize: 28, fontWeight: 900, marginLeft: 12, color: '#15803d' }}>{lastTicket.numero}</span>
            </div>
            <button onClick={() => {
              if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
              setLastTicket(null);
            }} style={btnStyle('#6b7280', 'small')}>✕</button>
          </div>
        )}

        {loading ? (
          <p>Caricamento servizi…</p>
        ) : servizi.length === 0 ? (
          <div style={{ background: 'white', borderRadius: 8, padding: 32, textAlign: 'center', color: '#888' }}>
            <p style={{ fontSize: 18 }}>Nessun servizio attivo.</p>
            <p>Contatta l'amministratore per abilitare i servizi.</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
            {servizi.map((s) => {
              const coda = getCoda(s.id);
              const isEmitting = emitting === s.id;
              return (
                <div key={s.id} style={{
                  background: 'white', borderRadius: 10,
                  boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                  padding: 20,
                  display: 'flex', flexDirection: 'column', gap: 12,
                  borderTop: '4px solid #0f3460',
                }}>
                  <div>
                    <div style={{ fontSize: 11, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 1 }}>
                      {s.area.prefisso}{s.lettera} · {s.area.nome}
                    </div>
                    <div style={{ fontSize: 17, fontWeight: 700, marginTop: 4 }}>{s.nome}</div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                    <span style={{
                      fontSize: 32, fontWeight: 900,
                      color: coda === 0 ? '#22c55e' : coda < 5 ? '#f59e0b' : '#ef4444',
                    }}>{coda}</span>
                    <span style={{ fontSize: 13, color: '#9ca3af' }}>in attesa</span>
                  </div>

                  <button
                    onClick={() => handleEmittiTicket(s.id)}
                    disabled={isEmitting || globalEmitting}
                    style={{
                      background: isEmitting || globalEmitting ? '#9ca3af' : '#0f3460',
                      color: 'white', border: 'none', borderRadius: 6,
                      padding: '10px 0', fontSize: 15, fontWeight: 700,
                      cursor: isEmitting || globalEmitting ? 'not-allowed' : 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    }}
                  >
                    {isEmitting ? '⏳ Emissione…' : '🖨️ Stampa Ticket'}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* iframe per stampa diretta PDF senza aprire nuove finestre */}
      <iframe ref={printRef} style={{ display: 'none' }} title="print-frame" />
    </div>
  );
}

function btnStyle(bg: string, size: 'normal' | 'small' = 'normal'): React.CSSProperties {
  return {
    background: bg, color: 'white', border: 'none', borderRadius: 4,
    cursor: 'pointer', fontWeight: 600,
    padding: size === 'small' ? '4px 10px' : '8px 16px',
    fontSize: size === 'small' ? 12 : 14,
  };
}
