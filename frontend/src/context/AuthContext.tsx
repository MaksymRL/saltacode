import React, { createContext, useContext, useState, useCallback } from 'react';

export type Ruolo = 'SUPERADMIN' | 'ADMIN' | 'ACCOGLIENZA' | 'OPERATORE';

export interface AuthUser {
  id: number;
  username: string;
  ruolo: Ruolo;
  aree: number[];
  mustChangePwd: boolean;
}

interface AuthState {
  user: AuthUser | null;
  token: string | null;
}

interface AuthContextValue extends AuthState {
  login: (user: AuthUser, token: string) => void;
  logout: () => void;
  updateToken: (token: string) => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>(() => {
    // Ripristina sessione da localStorage al reload
    const token = localStorage.getItem('saltacode_token');
    const userJson = localStorage.getItem('saltacode_user');
    if (token && userJson) {
      try {
        return { token, user: JSON.parse(userJson) as AuthUser };
      } catch {
        // dati corrotti — reset
      }
    }
    return { token: null, user: null };
  });

  const login = useCallback((user: AuthUser, token: string) => {
    localStorage.setItem('saltacode_token', token);
    localStorage.setItem('saltacode_user', JSON.stringify(user));
    setState({ user, token });
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('saltacode_token');
    localStorage.removeItem('saltacode_user');
    setState({ user: null, token: null });
  }, []);

  const updateToken = useCallback((token: string) => {
    localStorage.setItem('saltacode_token', token);
    setState((prev) => ({ ...prev, token }));
  }, []);

  return (
    <AuthContext.Provider
      value={{
        ...state,
        login,
        logout,
        updateToken,
        isAuthenticated: state.user !== null && state.token !== null,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
