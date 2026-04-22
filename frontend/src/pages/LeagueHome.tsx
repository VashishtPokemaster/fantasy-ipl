import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { leagueApi } from '../api/client';
import { League } from '../types';
import { useAuthStore } from '../store/authStore';

export default function LeagueHome() {
  const { id } = useParams<{ id: string }>();
  const [league, setLeague] = useState<League | null>(null);
  const [loading, setLoading] = useState(true);
  const [copying, setCopying] = useState(false);
  const { user } = useAuthStore();
  const navigate = useNavigate();

  useEffect(() => {
    if (!id) return;
    leagueApi.get(id).then((r) => setLeague(r.data)).finally(() => setLoading(false));
  }, [id]);

  const copyInviteCode = () => {
    if (!league) return;
    navigator.clipboard.writeText(league.inviteCode);
    setCopying(true);
    setTimeout(() => setCopying(false), 1500);
  };

  const randomizeDraftOrder = async () => {
    if (!id) return;
    await leagueApi.randomizeDraftOrder(id);
    const r = await leagueApi.get(id);
    setLeague(r.data);
  };

  const goToRoom = () => {
    if (!league || !id) return;
    if (league.mode === 'AUCTION') navigate(`/league/${id}/auction`);
    else navigate(`/league/${id}/draft`);
  };

  if (loading) return <div className="text-center py-20 text-gray-500">Loading...</div>;
  if (!league) return <div className="text-center py-20 text-red-400">League not found</div>;

  const isCommissioner = league.commissionerId === user?.id;
  const canStart = league.status === 'SETUP' && isCommissioner && league.members.length >= 2;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="bg-ipl-card border border-ipl-border rounded-2xl p-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold">{league.name}</h1>
            <div className="flex gap-2 mt-2">
              <span className={`text-xs px-2 py-0.5 rounded font-semibold ${league.mode === 'AUCTION' ? 'bg-purple-900 text-purple-300' : 'bg-blue-900 text-blue-300'}`}>
                {league.mode}
              </span>
              <span className="text-xs bg-gray-700 text-gray-300 px-2 py-0.5 rounded">
                {league.status}
              </span>
              <span className="text-xs text-gray-400 px-2 py-0.5">
                {league.members.length}/{league.maxTeams} teams
              </span>
            </div>
          </div>

          <div className="flex gap-2">
            <Link to={`/league/${id}/leaderboard`} className="text-sm px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded-lg transition">
              Leaderboard
            </Link>
            <Link to={`/league/${id}/team`} className="text-sm px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded-lg transition">
              My Team
            </Link>
            {(league.status === 'DRAFTING' || league.status === 'AUCTIONING') && (
              <button onClick={goToRoom} className="text-sm px-3 py-1.5 bg-ipl-gold text-black font-bold rounded-lg hover:bg-yellow-400 transition">
                Enter Room
              </button>
            )}
          </div>
        </div>

        {/* Invite Code */}
        {league.status === 'SETUP' && (
          <div className="mt-4 flex items-center gap-3 bg-gray-800 rounded-xl p-3">
            <div className="flex-1">
              <p className="text-xs text-gray-400">Invite Code</p>
              <p className="font-mono text-sm text-white mt-0.5">{league.inviteCode}</p>
            </div>
            <button
              onClick={copyInviteCode}
              className="text-xs px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded-lg transition"
            >
              {copying ? 'Copied!' : 'Copy'}
            </button>
          </div>
        )}
      </div>

      {/* Commissioner Controls */}
      {isCommissioner && league.status === 'SETUP' && (
        <div className="bg-ipl-card border border-ipl-border rounded-2xl p-5">
          <h2 className="font-bold mb-4">Commissioner Controls</h2>
          <div className="flex flex-wrap gap-3">
            {league.mode === 'DRAFT' && (
              <button
                onClick={randomizeDraftOrder}
                className="text-sm px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg transition"
              >
                Randomize Draft Order
              </button>
            )}
            {league.mode === 'AUCTION' && (
              <Link
                to={`/league/${id}/auction`}
                className="text-sm px-4 py-2 bg-purple-600 hover:bg-purple-500 rounded-lg transition"
              >
                Setup Auction Queue
              </Link>
            )}
            {canStart && (
              <button
                onClick={goToRoom}
                className="text-sm px-4 py-2 bg-ipl-gold text-black font-bold rounded-lg hover:bg-yellow-400 transition"
              >
                Start {league.mode === 'AUCTION' ? 'Auction' : 'Draft'}
              </button>
            )}
          </div>
          {!canStart && league.members.length < 2 && (
            <p className="text-xs text-gray-500 mt-2">Need at least 2 members to start.</p>
          )}
        </div>
      )}

      {/* Members */}
      <div className="bg-ipl-card border border-ipl-border rounded-2xl p-5">
        <h2 className="font-bold mb-4">Teams ({league.members.length})</h2>
        <div className="space-y-2">
          {league.members.map((member, i) => (
            <div key={member.id} className="flex items-center justify-between py-2 border-b border-ipl-border last:border-0">
              <div className="flex items-center gap-3">
                <span className="text-gray-500 text-sm w-5">{i + 1}</span>
                <div>
                  <p className="font-semibold text-sm">
                    {member.teamName || member.user.username}
                    {member.userId === league.commissionerId && (
                      <span className="ml-2 text-xs bg-ipl-gold text-black px-1.5 py-0.5 rounded font-bold">C</span>
                    )}
                  </p>
                  <p className="text-xs text-gray-400">{member.user.username}</p>
                </div>
              </div>
              <div className="flex items-center gap-4 text-sm">
                <span className="text-gray-400">₹{member.budgetRemaining}L</span>
                <span className="text-ipl-gold font-semibold">{member.totalPoints} pts</span>
                {member.isReady && <span className="text-green-400 text-xs">Ready</span>}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Budget info */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-ipl-card border border-ipl-border rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-ipl-gold">₹{league.budget}L</p>
          <p className="text-xs text-gray-400 mt-1">Starting Budget</p>
        </div>
        <div className="bg-ipl-card border border-ipl-border rounded-xl p-4 text-center">
          <p className="text-2xl font-bold">{league.squadSize}</p>
          <p className="text-xs text-gray-400 mt-1">Squad Size</p>
        </div>
        <div className="bg-ipl-card border border-ipl-border rounded-xl p-4 text-center">
          <p className="text-2xl font-bold">{league.maxTeams}</p>
          <p className="text-xs text-gray-400 mt-1">Max Teams</p>
        </div>
      </div>
    </div>
  );
}
