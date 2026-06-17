import { Routes, Route, Navigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { supabase } from './lib/supabaseClient';
import Landing from './pages/Landing';
import Auth from './pages/Auth';
import Dashboard from './pages/Dashboard';
import TripWizard from './pages/TripWizard';
import TripDetail from './pages/TripDetail';

// Protected Route wrapper component
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data: { session } }: any) => {
      if (mounted) {
        setSession(session);
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event: any, session: any) => {
      if (mounted) {
        setSession(session);
        setLoading(false);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-brand-bg flex justify-center items-center font-label">
        <div className="text-center space-y-3">
          <div className="w-8 h-8 rounded-full border-2 border-brand-primary/20 border-t-brand-primary animate-spin mx-auto" />
          <p className="text-xs text-brand-textSoft font-semibold">Đang xác thực thông tin...</p>
        </div>
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/dang-nhap" replace />;
  }

  return <>{children}</>;
}

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/dang-nhap" element={<Auth />} />
      <Route path="/dang-ky" element={<Auth />} />
      
      {/* Protected Routes */}
      <Route
        path="/chuyen-di"
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/chuyen-di/moi"
        element={
          <ProtectedRoute>
            <TripWizard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/chuyen-di/:id"
        element={
          <ProtectedRoute>
            <TripDetail />
          </ProtectedRoute>
        }
      />

      {/* Fallback redirect */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
