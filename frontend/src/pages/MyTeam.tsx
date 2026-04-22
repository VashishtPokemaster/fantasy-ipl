import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { teamApi } from '../api/client';
import { TeamPlayer, LeagueMember } from '../types';
import PlayerCard from '../components/PlayerCard';

export default function MyTeam() {
  const { id: leagueId } = useParams<{ id: string }>();
  const [member, setMember] = useState<LeagueMember | null>(null);
  const [captainId, setCaptainId] = useState<string | null>(null);
  const [vcId, setVcId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    if (!leagueId) return;
    teamApi.get(leagueId).then((r) => {
      setMember(r.data);
      const cap = r.data.teamPlayers?.find((tp: TeamPlayer) => tp.isCaptain);
      const vc = r.data.teamPlayers?.find((tp: TeamPlayer) => tp.isViceCaptain);
      if (cap) setCaptainId(cap.playerId);
      if (vc) setVcId(vc.playerId);
    });
  }, [leagueId]);

  const saveCaptains = async () => {
    if (!leagueId || !captainId || !vcId) return;
    setSaving(true);
    try {
      await teamApi.setCaptain(leagueId, { captainPlayerId: captainId, viceCaptainPlayerId: vcId });
      setMsg('Saved!');
      setTimeout(() => setMsg(''), 2000);
    } finally {
      setSaving(false);
    }
  };

  const handlePlayerClick = (playerId: string) => {
    if (!captainId) {
      setCaptainId(playerId);
    } else if (!vcId && playerId !== captainId) {
      setVcId(playerId);
    } else if (playerId === captainId) {
      setCaptainId(null);
    } else if (playerId === vcId) {
      setVcId(null);
    } else {
      setCaptainId(playerId);
    }
  };

  if (!member) return <div className="text-center py-20 text-gray-500">Loading...</div>;

  const teamPlayers = member.teamPlayers ?? [];
  const totalPoints = teamPlayers.reduce((sum, tp) => {
    const pts = tp.player.stats?.reduce((s: number, st: { points: number }) => s + st.points, 0) ?? 0;
    const mult = tp.isCaptain ? 2 : tp.isViceCaptain ? 1.5 : 1;
    return sum + Math.round(pts * mult);
  }, 0);

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">{member.teamName || 'My Team'}</h1>
          <p className="text-gray-400 text-sm">{teamPlayers.length} players · {totalPoints} points</p>
        </div>
        <div className="flex items-center gap-3">
          {msg && <span className="text-green-400 text-sm">{msg}</span>}
          <p className="text-gray-400 text-sm">Click to set C / VC</p>
          <button
            onClick={saveCaptains}
            disabled={saving || !captainId || !vcId}
            className="px-4 py-2 bg-ipl-gold text-black font-bold rounded-lg hover:bg-yellow-400 disabled:opacity-50 transition"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      <div className="mb-4 flex gap-4 text-sm text-gray-400">
        <span>Budget remaining: <span className="text-ipl-gold font-semibold">₹{member.budgetRemaining}L</span></span>
        <span>Total points: <span className="text-white font-semibold">{member.totalPoints}</span></span>
      </div>

      {teamPlayers.length === 0 ? (
        <p className="text-center text-gray-500 py-16">Your squad is empty. Join an auction or draft to pick players.</p>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {teamPlayers.map((tp) => (
            <PlayerCard
              key={tp.id}
              player={tp.player}
              onClick={() => handlePlayerClick(tp.playerId)}
              isCaptain={tp.playerId === captainId}
              isViceCaptain={tp.playerId === vcId}
              showPrice
              purchasePrice={tp.purchasePrice ?? undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
}
