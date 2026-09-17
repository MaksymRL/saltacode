/**
 * Dialog di conferma personalizzato — sostituisce window.confirm().
 * Uso:
 *   const { confirm, ConfirmDialog } = useConfirm();
 *   ...
 *   if (await confirm('Eliminare Mario Rossi?')) { ... }
 *   ...
 *   return <> ... <ConfirmDialog /> </>
 */
import { useState, useCallback } from 'react';

interface ConfirmOptions {
  message: string;
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

export function useConfirm() {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const [resolve, setResolve] = useState<((v: boolean) => void) | null>(null);

  const confirm = useCallback((message: string, options?: Partial<ConfirmOptions>): Promise<boolean> => {
    return new Promise((res) => {
      setOpts({ message, title: 'Conferma', confirmLabel: 'Conferma', cancelLabel: 'Annulla', danger: false, ...options });
      setResolve(() => res);
    });
  }, []);

  const handleChoice = (choice: boolean) => {
    resolve?.(choice);
    setOpts(null);
    setResolve(null);
  };

  const ConfirmDialog = () => {
    if (!opts) return null;
    return (
      <div style={{
        position: 'fixed', inset: 0, zIndex: 2000,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{
          background: 'white', borderRadius: 10, padding: 28,
          width: 360, maxWidth: '92vw',
          boxShadow: '0 8px 32px rgba(0,0,0,0.22)',
        }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#1e293b', marginBottom: 10 }}>
            {opts.title}
          </div>
          <div style={{ fontSize: 14, color: '#475569', marginBottom: 24, lineHeight: 1.5 }}>
            {opts.message}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button
              onClick={() => handleChoice(false)}
              style={{
                padding: '8px 18px', borderRadius: 6, border: '1px solid #d1d5db',
                background: 'white', color: '#374151', fontSize: 14,
                fontWeight: 600, cursor: 'pointer',
              }}
            >
              {opts.cancelLabel}
            </button>
            <button
              onClick={() => handleChoice(true)}
              style={{
                padding: '8px 18px', borderRadius: 6, border: 'none',
                background: opts.danger ? '#dc2626' : '#1e293b',
                color: 'white', fontSize: 14, fontWeight: 600, cursor: 'pointer',
              }}
            >
              {opts.confirmLabel}
            </button>
          </div>
        </div>
      </div>
    );
  };

  return { confirm, ConfirmDialog };
}
