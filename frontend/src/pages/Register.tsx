import { useState, FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { authApi } from '../api/client';
import { useAuthStore } from '../store/authStore';
import AuthHero from '../components/AuthHero';

export default function Register() {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { setAuth } = useAuthStore();
  const navigate = useNavigate();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await authApi.register({ username, email, password });
      setAuth(res.data.user, res.data.token);
      navigate('/dashboard');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-ipl-dark flex">
      {/* Left hero panel */}
      <div className="lg:w-[55%] lg:border-r lg:border-ipl-border bg-[#080C18]">
        <AuthHero />
      </div>

      {/* Right: Form panel */}
      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          {/* Mobile-only logo */}
          <div className="lg:hidden text-center mb-8">
            <div className="flex items-center justify-center gap-2 mb-1">
              <span className="text-3xl font-black text-white">FANTASY</span>
              <span className="text-3xl font-black text-ipl-gold">IPL</span>
            </div>
            <p className="text-gray-400 text-sm">Season 2025</p>
          </div>

          <div className="mb-8">
            <h1 className="text-2xl font-extrabold text-white">Create your account</h1>
            <p className="text-gray-400 text-sm mt-1">Join Fantasy IPL and start building your dream team</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <p className="text-red-400 text-sm bg-red-900/20 border border-red-800 rounded-xl p-3">
                {error}
              </p>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                minLength={3}
                maxLength={20}
                className="w-full bg-gray-800/80 border border-ipl-border rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-ipl-gold focus:ring-1 focus:ring-ipl-gold/30 transition placeholder-gray-600"
                placeholder="cooluser99"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full bg-gray-800/80 border border-ipl-border rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-ipl-gold focus:ring-1 focus:ring-ipl-gold/30 transition placeholder-gray-600"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="w-full bg-gray-800/80 border border-ipl-border rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-ipl-gold focus:ring-1 focus:ring-ipl-gold/30 transition placeholder-gray-600"
                placeholder="Min 6 characters"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full font-bold py-3 rounded-xl transition disabled:opacity-50 text-sm mt-2"
              style={{
                background: loading ? '#7a6010' : 'linear-gradient(135deg, #F9C12E, #F97316)',
                color: '#000',
              }}
            >
              {loading ? 'Creating account...' : 'Create Account'}
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-sm text-gray-500">
              Already have an account?{' '}
              <Link to="/login" className="text-ipl-gold hover:underline font-semibold">
                Sign in
              </Link>
            </p>
          </div>

          {/* Decorative divider */}
          <div className="mt-8 flex items-center gap-3">
            <div className="flex-1 h-px bg-ipl-border" />
            <span className="text-xs text-gray-600">Fantasy IPL 2025</span>
            <div className="flex-1 h-px bg-ipl-border" />
          </div>
        </div>
      </div>
    </div>
  );
}
