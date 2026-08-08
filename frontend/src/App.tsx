import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Login from './pages/Login';
import SuperAdminDashboard from './pages/SuperAdmin/Dashboard';
import AdminDashboard from './pages/Admin/Dashboard';
import AccoglienzaDashboard from './pages/Accoglienza/Dashboard';
import OperatoreDashboard from './pages/Operatore/Dashboard';
import MonitorDisplay from './pages/Monitor/Display';

/** Guard: reindirizza al login se non autenticato. */
function PrivateRoute({ children, ruoli }: { children: React.ReactNode; ruoli?: string[] }) {
  const { isAuthenticated, user } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (ruoli && user && !ruoli.includes(user.ruolo)) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function AppRoutes() {
  const { isAuthenticated } = useAuth();

  return (
    <Routes>
      {/* Redirect dalla root in base allo stato di autenticazione */}
      <Route path="/" element={isAuthenticated ? <Navigate to="/login" replace /> : <Navigate to="/login" replace />} />

      {/* Pagina pubblica login */}
      <Route path="/login" element={<Login />} />

      {/* Monitor pubblico (nessuna autenticazione) */}
      <Route path="/monitor" element={<MonitorDisplay />} />

      {/* Route protette per ruolo */}
      <Route
        path="/superadmin/*"
        element={
          <PrivateRoute ruoli={['SUPERADMIN']}>
            <SuperAdminDashboard />
          </PrivateRoute>
        }
      />
      <Route
        path="/admin/*"
        element={
          <PrivateRoute ruoli={['ADMIN']}>
            <AdminDashboard />
          </PrivateRoute>
        }
      />
      <Route
        path="/accoglienza/*"
        element={
          <PrivateRoute ruoli={['ACCOGLIENZA']}>
            <AccoglienzaDashboard />
          </PrivateRoute>
        }
      />
      <Route
        path="/operatore/*"
        element={
          <PrivateRoute ruoli={['OPERATORE']}>
            <OperatoreDashboard />
          </PrivateRoute>
        }
      />

      {/* Catch-all */}
      <Route path="*" element={<Navigate to="/login" replace />} />
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
