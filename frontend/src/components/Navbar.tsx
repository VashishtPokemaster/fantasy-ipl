import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';

export default function Navbar() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <nav className="bg-ipl-card border-b border-ipl-border px-6 py-3 flex items-center justify-between">
      <Link to="/dashboard" className="flex items-center gap-2">
        <span className="text-ipl-gold font-extrabold text-xl tracking-tight">Fantasy IPL</span>
        <span className="bg-ipl-blue text-white text-xs font-bold px-2 py-0.5 rounded">2025</span>
      </Link>

      <div className="flex items-center gap-4">
        {user && (
          <>
            <span className="text-gray-400 text-sm">
              {user.username}
            </span>
            <Link to="/league/create" className="text-sm text-ipl-gold hover:underline">
              + New League
            </Link>
            <button
              onClick={handleLogout}
              className="text-sm text-gray-400 hover:text-white transition"
            >
              Logout
            </button>
          </>
        )}
      </div>
    </nav>
  );
}
