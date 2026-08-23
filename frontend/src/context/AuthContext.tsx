import React, { createContext, useContext, useState, useCallback } from 'react';

export type Ruolo = 'SUPERADMIN' | 'ADMIN' | 'ACCOGLIENZA' | 'OPERATORE';

export interface AuthUser {
  id: number;
  username: string;
  ruolo: Ruolo;       // ruolo ATTIVO in questa sessione
  aree: number[];
  mustChangePwd: boolean;
}

/** Dati intermedi dopo login ma prima della selezione ruolo */
export interface PendingAuth {
  pendingToken: string;
  user: {
    id: number;
    username: string;
    cognome: string;
    nome: string;
    ruoli: Ruolo[];   // tutti i ruoli disponibili
    aree: number[];
    mustChangePwd: boolean;
  };
}

interface AuthState {
  user: AuthUser | null;
  token: string | null;
  pending: PendingAuth | null;  // fase intermedia selezione ruolo
}

interface AuthContextValue extends AuthState {
  /** Chiamato dopo il login: salva il pending token e la lista ruoli */
  setPending: (pending: PendingAuth) => void;
  /** Chiamato dopo la selezione ruolo: salva token definitivo e utente */
  login: (user: AuthUser, token: string) => void;
  logout: () => void;
  updateToken: (token: string) => void;
  isAuthenticated: boolean;
  /** True se in attesa di selezione ruolo */
  isPending: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>(() => {
    const token = localStorage.getItem('saltacode_token');
    const userJson = localStorage.getItem('saltacode_user');
    if (token && userJson) {
      try {
        return { token, user: JSON.parse(userJson) as AuthUser, pending: null };
      } catch { /* dati corrotti */ }
    }
    return { token: null, user: null, pending: null };
  });

  const setPending = useCallback((pending: PendingAuth) => {
    // Non salvare il pending token in localStorage — è temporaneo
    setState({ token: null, user: null, pending });
  }, []);

  const login = useCallback((user: AuthUser, token: string) => {
    localStorage.setItem('saltacode_token', token);
    localStorage.setItem('saltacode_user', JSON.stringify(user));
    setState({ user, token, pending: null });
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('saltacode_token');
    localStorage.removeItem('saltacode_user');
    localStorage.removeItem('saltacode_ruoli');
    setState({ user: null, token: null, pending: null });
  }, []);

  const updateToken = useCallback((token: string) => {
    localStorage.setItem('saltacode_token', token);
    setState((prev) => ({ ...prev, token }));
  }, []);

  return (
    <AuthContext.Provider value={{
      ...state,
      setPending,
      login,
      logout,
      updateToken,
      isAuthenticated: state.user !== null && state.token !== null,
      isPending: state.pending !== null,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
