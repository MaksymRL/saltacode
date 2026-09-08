import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{
          padding: 32, fontFamily: 'monospace', background: '#1e293b',
          color: '#f87171', minHeight: '100vh',
        }}>
          <h2 style={{ color: '#ef4444' }}>⚠ Errore applicazione</h2>
          <p style={{ color: '#fca5a5', fontWeight: 700 }}>{this.state.error.message}</p>
          <pre style={{ background: '#0f172a', padding: 16, borderRadius: 8, fontSize: 12, color: '#94a3b8', overflowX: 'auto' }}>
            {this.state.error.stack}
          </pre>
          <button
            onClick={() => window.location.reload()}
            style={{ marginTop: 16, padding: '8px 20px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 14 }}
          >
            Ricarica pagina
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
