import { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { leagueApi } from '../api/client';

export default function JoinLeague() {
  const [inviteCode, setInviteCode] = useState('');
  const [teamName, setTeamName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await leagueApi.join({ inviteCode, teamName });
      navigate(`/league/${res.data.leagueId}`);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg || 'Failed to join league');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto">
      <h1 className="text-2xl font-bold mb-6">Join a League</h1>

      <form onSubmit={handleSubmit} className="bg-ipl-card border border-ipl-border rounded-2xl p-6 space-y-4">
        {error && <p className="text-red-400 text-sm bg-red-900/20 border border-red-800 rounded-lg p-3">{error}</p>}

        <div>
          <label className="block text-sm text-gray-400 mb-1">Invite Code</label>
          <input
            type="text"
            value={inviteCode}
            onChange={(e) => setInviteCode(e.target.value)}
            required
            className="w-full bg-gray-800 border border-ipl-border rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-ipl-gold font-mono"
            placeholder="Paste invite code here"
          />
        </div>

        <div>
          <label className="block text-sm text-gray-400 mb-1">Your Team Name</label>
          <input
            type="text"
            value={teamName}
            onChange={(e) => setTeamName(e.target.value)}
            required
            className="w-full bg-gray-800 border border-ipl-border rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-ipl-gold"
            placeholder="Thunder Hawks"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-ipl-gold text-black font-bold py-2.5 rounded-lg hover:bg-yellow-400 transition disabled:opacity-50"
        >
          {loading ? 'Joining...' : 'Join League'}
        </button>
      </form>
    </div>
  );
}
