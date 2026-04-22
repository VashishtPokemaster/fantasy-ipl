import { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { leagueApi } from '../api/client';

export default function CreateLeague() {
  const [name, setName] = useState('');
  const [mode, setMode] = useState<'DRAFT' | 'AUCTION'>('AUCTION');
  const [teamName, setTeamName] = useState('');
  const [maxTeams, setMaxTeams] = useState(10);
  const [budget, setBudget] = useState(10000);
  const [squadSize, setSquadSize] = useState(15);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await leagueApi.create({ name, mode, teamName, maxTeams, budget, squadSize });
      navigate(`/league/${res.data.id}`);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg || 'Failed to create league');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-lg mx-auto">
      <h1 className="text-2xl font-bold mb-6">Create a League</h1>

      <form onSubmit={handleSubmit} className="bg-ipl-card border border-ipl-border rounded-2xl p-6 space-y-5">
        {error && <p className="text-red-400 text-sm bg-red-900/20 border border-red-800 rounded-lg p-3">{error}</p>}

        <div>
          <label className="block text-sm text-gray-400 mb-1">League Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            minLength={3}
            maxLength={50}
            className="w-full bg-gray-800 border border-ipl-border rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-ipl-gold"
            placeholder="Premier Fantasy League"
          />
        </div>

        <div>
          <label className="block text-sm text-gray-400 mb-2">Mode</label>
          <div className="grid grid-cols-2 gap-3">
            {(['AUCTION', 'DRAFT'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`
                  p-4 rounded-xl border-2 text-left transition
                  ${mode === m ? 'border-ipl-gold bg-ipl-gold/10' : 'border-ipl-border bg-gray-800 hover:border-gray-500'}
                `}
              >
                <p className="font-bold text-sm">{m}</p>
                <p className="text-xs text-gray-400 mt-1">
                  {m === 'AUCTION'
                    ? 'Real-time bidding with a timer. Highest bid wins.'
                    : 'Snake draft — take turns picking players.'}
                </p>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm text-gray-400 mb-1">Your Team Name</label>
          <input
            type="text"
            value={teamName}
            onChange={(e) => setTeamName(e.target.value)}
            required
            className="w-full bg-gray-800 border border-ipl-border rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-ipl-gold"
            placeholder="Super Strikers"
          />
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Max Teams</label>
            <input
              type="number"
              value={maxTeams}
              onChange={(e) => setMaxTeams(parseInt(e.target.value))}
              min={2}
              max={20}
              className="w-full bg-gray-800 border border-ipl-border rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-ipl-gold"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Budget (L)</label>
            <input
              type="number"
              value={budget}
              onChange={(e) => setBudget(parseInt(e.target.value))}
              min={1000}
              step={500}
              className="w-full bg-gray-800 border border-ipl-border rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-ipl-gold"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Squad Size</label>
            <input
              type="number"
              value={squadSize}
              onChange={(e) => setSquadSize(parseInt(e.target.value))}
              min={11}
              max={25}
              className="w-full bg-gray-800 border border-ipl-border rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-ipl-gold"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-ipl-gold text-black font-bold py-2.5 rounded-lg hover:bg-yellow-400 transition disabled:opacity-50"
        >
          {loading ? 'Creating...' : 'Create League'}
        </button>
      </form>
    </div>
  );
}
