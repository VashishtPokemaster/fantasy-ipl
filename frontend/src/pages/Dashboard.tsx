import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { leagueApi, playerApi } from '../api/client';
import { League } from '../types';
import { useAuthStore } from '../store/authStore';

const statusColors: Record<string, string> = {
  SETUP: 'bg-gray-600',
  DRAFTING: 'bg-blue-600',
  AUCTIONING: 'bg-purple-600',
  ACTIVE: 'bg-green-600',
  COMPLETED: 'bg-gray-500',
};

export default function Dashboard() {
  const [leagues, setLeagues] = useState<League[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuthStore();

  useEffect(() => {
    leagueApi.list()
      .then((r) => setLeagues(r.data))
      .catch(() => {}) // server sleeping — leagues just won't show until retry
      .finally(() => setLoading(false));
  }, []);

  const [seeding, setSeeding] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const seedPlayers = async () => {
    setSeeding(true);
    try {
      const res = await playerApi.seed();
      alert(`✅ ${res.data.message}`);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      alert(`❌ Seed failed: ${msg || 'Could not reach server. Make sure Render is awake and try again in 30 seconds.'}`);
    } finally {
      setSeeding(false);
    }
  };

  const syncPlayerIds = async () => {
    setSyncing(true);
    try {
      const res = await playerApi.syncIds();
      const { message, stillUnsynced, failedNames } = res.data;
      let msg = `✅ ${message}`;
      if (stillUnsynced > 0 && failedNames?.length) {
        msg += `\n\nCouldn't match these players (name matching will still work for them):\n• ${failedNames.slice(0, 10).join('\n• ')}`;
        if (failedNames.length > 10) msg += `\n...and ${failedNames.length - 10} more`;
      }
      alert(msg);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      alert(`❌ Sync failed: ${msg || 'Could not reach server. Try again in 30 seconds.'}`);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Welcome back, {user?.username}</h1>
          <p className="text-gray-400 text-sm mt-0.5">Manage your Fantasy IPL leagues</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={seedPlayers}
            disabled={seeding}
            className="text-sm px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition disabled:opacity-50"
          >
            {seeding ? 'Seeding...' : '① Seed Players'}
          </button>
          <button
            onClick={syncPlayerIds}
            disabled={syncing}
            className="text-sm px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition disabled:opacity-50"
          >
            {syncing ? 'Syncing...' : '② Sync Player IDs'}
          </button>
          <Link
            to="/league/join"
            className="text-sm px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition"
          >
            Join League
          </Link>
          <Link
            to="/league/create"
            className="text-sm px-4 py-2 bg-ipl-gold text-black font-semibold rounded-lg hover:bg-yellow-400 transition"
          >
            + Create League
          </Link>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-20 text-gray-500">Loading...</div>
      ) : leagues.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-gray-400 text-lg">You're not in any leagues yet.</p>
          <p className="text-gray-500 text-sm mt-1">Create one or join with an invite code.</p>
          <Link
            to="/league/create"
            className="inline-block mt-4 px-6 py-3 bg-ipl-gold text-black font-bold rounded-xl hover:bg-yellow-400 transition"
          >
            Create Your First League
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {leagues.map((league) => (
            <Link
              key={league.id}
              to={`/league/${league.id}`}
              className="bg-ipl-card border border-ipl-border rounded-2xl p-5 hover:border-gray-500 transition"
            >
              <div className="flex items-start justify-between mb-3">
                <h2 className="font-bold text-lg">{league.name}</h2>
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full text-white ${statusColors[league.status]}`}>
                  {league.status}
                </span>
              </div>

              <div className="flex gap-3 mb-4">
                <span className={`text-xs px-2 py-0.5 rounded font-semibold ${league.mode === 'AUCTION' ? 'bg-purple-900 text-purple-300' : 'bg-blue-900 text-blue-300'}`}>
                  {league.mode}
                </span>
                <span className="text-xs text-gray-400">{league.members.length}/{league.maxTeams} teams</span>
              </div>

              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-400">
                  Commissioner: <span className="text-white">{league.commissioner.username}</span>
                </span>
                <span className="text-ipl-gold font-semibold">₹{league.budget}L budget</span>
              </div>

              {league.myTeamName && (
                <p className="mt-2 text-xs text-gray-500">Your team: <span className="text-gray-300">{league.myTeamName}</span></p>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
