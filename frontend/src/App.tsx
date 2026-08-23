import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { useEffect } from 'react';
import Login from './pages/Login';
import SelectRole from './pages/SelectRole';
import ChangePassword from './pages/ChangePassword';
import SuperAdminDashboard from './pages/SuperAdmin/Dashboard';
import AdminDashboard from './pages/Admin/Dashboard';
import AccoglienzaDashboard from './pages/Accoglienza/Dashboard';
import OperatoreDashboard from './pages/Operatore/Dashboard';
import MonitorDisplay from './pages/Monitor/Display';

/**
 * Guard per route che richiedono autenticazione completa (ruolo scelto).
 * Se l'utente ha solo il pending token → rimanda a /select-role.
 * Se non è autenticato → rimanda al login.
 * Se il ruolo non corrisponde → rimanda alla propria dashboard.
 */
function PrivateRoute({ children, ruoli }: { children: React.ReactNode; ruoli?: string[] }) {
  const { isAuthenticated, isPending, user } = useAuth();

  if (isPending) return <Navigate to="/select-role" replace />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;

  if (ruoli && user && !ruoli.includes(user.ruolo)) {
    const dashboardByRole: Record<string, string> = {
      SUPERADMIN: '/superadmin',
      ADMIN: '/admin',
      ACCOGLIENZA: '/accoglienza',
      OPERATORE: '/operatore',
    };
    return <Navigate to={dashboardByRole[user.ruolo] ?? '/login'} replace />;
  }

  return <>{children}</>;
}

function AppRoutes() {
  const { isAuthenticated, isPending, user } = useAuth();
  const navigate = useNavigate();

  const dashboardByRole: Record<string, string> = {
    SUPERADMIN: '/superadmin',
    ADMIN: '/admin',
    ACCOGLIENZA: '/accoglienza',
    OPERATORE: '/operatore',
  };

  // Quando il ruolo cambia (switch-role), reindirizza alla dashboard corretta
  useEffect(() => {
    if (isAuthenticated && user && !user.mustChangePwd) {
      const target = dashboardByRole[user.ruolo];
      if (target && !window.location.pathname.startsWith(target)) {
        navigate(target, { replace: true });
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.ruolo]);

  // Calcola dove mandare l'utente dalla root
  const homePath = (() => {
    if (isPending) return '/select-role';
    if (!isAuthenticated || !user) return '/login';
    if (user.mustChangePwd) return '/change-password';
    return dashboardByRole[user.ruolo] ?? '/login';
  })();

  return (
    <Routes>
      {/* Root redirect */}
      <Route path="/" element={<Navigate to={homePath} replace />} />

      {/* Login — se già autenticato, vai alla dashboard */}
      <Route
        path="/login"
        element={isAuthenticated || isPending ? <Navigate to={homePath} replace /> : <Login />}
      />

      {/* Selezione ruolo (dopo login) */}
      <Route
        path="/select-role"
        element={isPending ? <SelectRole /> : <Navigate to={homePath} replace />}
      />

      {/* Cambio password obbligatorio */}
      <Route
        path="/change-password"
        element={isAuthenticated ? <ChangePassword /> : <Navigate to="/login" replace />}
      />

      {/* Monitor pubblico — nessuna autenticazione */}
      <Route path="/monitor" element={<MonitorDisplay />} />

      {/* Dashboard per ruolo */}
      <Route
        path="/superadmin/*"
        element={<PrivateRoute ruoli={['SUPERADMIN']}><SuperAdminDashboard /></PrivateRoute>}
      />
      <Route
        path="/admin/*"
        element={<PrivateRoute ruoli={['ADMIN']}><AdminDashboard /></PrivateRoute>}
      />
      <Route
        path="/accoglienza/*"
        element={<PrivateRoute ruoli={['ACCOGLIENZA']}><AccoglienzaDashboard /></PrivateRoute>}
      />
      <Route
        path="/operatore/*"
        element={<PrivateRoute ruoli={['OPERATORE']}><OperatoreDashboard /></PrivateRoute>}
      />

      {/* Catch-all */}
      <Route path="*" element={<Navigate to={homePath} replace />} />
    </Routes>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
