import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuthStore } from './store/authStore';
import { authApi } from './api/client';

import Layout from './components/Layout';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import CreateLeague from './pages/CreateLeague';
import JoinLeague from './pages/JoinLeague';
import LeagueHome from './pages/LeagueHome';
import AuctionRoom from './pages/AuctionRoom';
import DraftRoom from './pages/DraftRoom';
import MyTeam from './pages/MyTeam';
import Leaderboard from './pages/Leaderboard';

const queryClient = new QueryClient();

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore();
  return isAuthenticated() ? <>{children}</> : <Navigate to="/login" replace />;
}

export default function App() {
  const { token, setAuth, logout } = useAuthStore();

  // Rehydrate user from token on first load
  useEffect(() => {
    if (!token) return;
    authApi.me()
      .then((r) => setAuth(r.data, token))
      .catch(() => logout());
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />

          <Route element={<AuthGuard><Layout /></AuthGuard>}>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/league/create" element={<CreateLeague />} />
            <Route path="/league/join" element={<JoinLeague />} />
            <Route path="/league/:id" element={<LeagueHome />} />
            <Route path="/league/:id/auction" element={<AuctionRoom />} />
            <Route path="/league/:id/draft" element={<DraftRoom />} />
            <Route path="/league/:id/team" element={<MyTeam />} />
            <Route path="/league/:id/leaderboard" element={<Leaderboard />} />
          </Route>

          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
