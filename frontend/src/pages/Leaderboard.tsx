import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { teamApi, leagueApi } from '../api/client';
import { LeagueMember, League } from '../types';
import { useAuthStore } from '../store/authStore';

export default function Leaderboard() {
  const { id: leagueId } = useParams<{ id: string }>();
  const { user } = useAuthStore();
  const [members, setMembers] = useState<LeagueMember[]>([]);
  const [league, setLeague] = useState<League | null>(null);

  useEffect(() => {
    if (!leagueId) return;
    Promise.all([
      teamApi.leaderboard(leagueId),
      leagueApi.get(leagueId),
    ]).then(([lb, lg]) => {
      setMembers(lb.data);
      setLeague(lg.data);
    });
  }, [leagueId]);

  const myRank = members.findIndex((m) => m.userId === user?.id) + 1;

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">{league?.name} — Standings</h1>
        {myRank > 0 && <span className="text-gray-400 text-sm">Your rank: <span className="text-ipl-gold font-bold">#{myRank}</span></span>}
      </div>

      <div className="bg-ipl-card border border-ipl-border rounded-2xl overflow-hidden">
        {members.map((m, i) => (
          <div
            key={m.id}
            className={`flex items-center gap-4 px-5 py-4 border-b border-ipl-border last:border-0 ${m.userId === user?.id ? 'bg-ipl-gold/5' : ''}`}
          >
            <div className={`w-8 h-8 rounded-full flex items-center justify-center font-extrabold text-sm ${
              i === 0 ? 'bg-yellow-500 text-black' :
              i === 1 ? 'bg-gray-400 text-black' :
              i === 2 ? 'bg-amber-700 text-white' :
              'bg-gray-700 text-gray-300'
            }`}>
              {i + 1}
            </div>

            <div className="flex-1">
              <p className="font-semibold">
                {m.teamName || m.user.username}
                {m.userId === user?.id && <span className="ml-2 text-xs text-ipl-gold">(You)</span>}
              </p>
              <p className="text-xs text-gray-400">{m.user.username}</p>
            </div>

            <div className="text-right">
              <p className="text-xl font-extrabold text-ipl-gold">{m.totalPoints}</p>
              <p className="text-xs text-gray-400">points</p>
            </div>
          </div>
        ))}

        {members.length === 0 && (
          <p className="text-center text-gray-500 py-10">No data yet</p>
        )}
      </div>
    </div>
  );
}
