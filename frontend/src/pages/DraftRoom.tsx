import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { connectSocket, disconnectSocket } from '../socket/socketClient';
import { playerApi, leagueApi } from '../api/client';
import { useAuthStore } from '../store/authStore';
import { Player, League, LeagueMember } from '../types';
import Timer from '../components/Timer';
import PlayerCard from '../components/PlayerCard';

interface DraftTurn {
  memberId: string;
  memberName: string;
  round: number;
  pickNum: number;
  timeRemaining?: number;
}

interface DraftPickMade {
  round: number;
  pickNum: number;
  memberId: string;
  memberName: string;
  player: Player;
  isAuto: boolean;
}

export default function DraftRoom() {
  const { id: leagueId } = useParams<{ id: string }>();
  const { user } = useAuthStore();
  const [league, setLeague] = useState<League | null>(null);
  const [myMember, setMyMember] = useState<LeagueMember | null>(null);
  const [currentTurn, setCurrentTurn] = useState<DraftTurn | null>(null);
  const [timeRemaining, setTimeRemaining] = useState(60);
  const [picks, setPicks] = useState<DraftPickMade[]>([]);
  const [pickedIds, setPickedIds] = useState<Set<string>>(new Set());
  const [allPlayers, setAllPlayers] = useState<Player[]>([]);
  const [playerFilter, setPlayerFilter] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [draftStatus, setDraftStatus] = useState<'waiting' | 'active' | 'complete'>('waiting');
  const isCommissioner = league?.commissionerId === user?.id;
  const isMyTurn = currentTurn?.memberId === myMember?.id;

  useEffect(() => {
    if (!leagueId) return;
    leagueApi.get(leagueId).then((r) => {
      setLeague(r.data);
      const me = r.data.members.find((m: LeagueMember) => m.userId === user?.id);
      setMyMember(me || null);
    });
    playerApi.list({ limit: 200 }).then((r) => setAllPlayers(r.data.players));
  }, [leagueId, user?.id]);

  useEffect(() => {
    if (!leagueId) return;
    const socket = connectSocket();
    socket.emit('draft:join', { leagueId });

    socket.on('draft:started', () => {
      setDraftStatus('active');
    });

    socket.on('draft:turn', (data: DraftTurn) => {
      setCurrentTurn(data);
      setTimeRemaining(data.timeRemaining ?? 60);
      setDraftStatus('active');
    });

    socket.on('draft:tick', ({ timeRemaining: t }: { timeRemaining: number }) => {
      setTimeRemaining(t);
    });

    socket.on('draft:pick_made', (data: DraftPickMade) => {
      setPicks((prev) => [...prev, data]);
      setPickedIds((prev) => new Set([...prev, data.player.id]));
      // refresh my squad
      leagueApi.get(leagueId).then((r) => {
        const me = r.data.members.find((m: LeagueMember) => m.userId === user?.id);
        setMyMember(me || null);
      });
    });

    socket.on('draft:complete', () => {
      setDraftStatus('complete');
      setCurrentTurn(null);
    });

    socket.on('error', ({ message }: { message: string }) => {
      alert(message);
    });

    return () => {
      socket.off('draft:started');
      socket.off('draft:turn');
      socket.off('draft:tick');
      socket.off('draft:pick_made');
      socket.off('draft:complete');
      socket.off('error');
      disconnectSocket();
    };
  }, [leagueId, user?.id]);

  const startDraft = () => connectSocket().emit('draft:start', { leagueId });

  const pickPlayer = (playerId: string) => {
    if (!isMyTurn) return;
    connectSocket().emit('draft:pick', { leagueId, playerId });
  };

  const filteredPlayers = allPlayers.filter((p) => {
    const matchesSearch =
      p.name.toLowerCase().includes(playerFilter.toLowerCase()) ||
      p.iplTeam.toLowerCase().includes(playerFilter.toLowerCase());
    const matchesRole = !roleFilter || p.role === roleFilter;
    return matchesSearch && matchesRole && !pickedIds.has(p.id);
  });

  return (
    <div className="flex gap-4 h-[calc(100vh-120px)]">
      {/* Left: Available players */}
      <div className="w-72 flex-shrink-0 flex flex-col gap-2">
        <div className="flex gap-2">
          <input
            value={playerFilter}
            onChange={(e) => setPlayerFilter(e.target.value)}
            placeholder="Search..."
            className="flex-1 bg-gray-800 border border-ipl-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-ipl-gold"
          />
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="bg-gray-800 border border-ipl-border rounded-lg px-2 py-2 text-sm text-white focus:outline-none"
          >
            <option value="">All</option>
            <option value="BATSMAN">BAT</option>
            <option value="BOWLER">BOWL</option>
            <option value="ALL_ROUNDER">AR</option>
            <option value="WICKET_KEEPER">WK</option>
          </select>
        </div>

        <div className="flex-1 overflow-y-auto space-y-1.5">
          {filteredPlayers.map((p) => (
            <PlayerCard
              key={p.id}
              player={p}
              onClick={() => pickPlayer(p.id)}
              selected={false}
              showPrice
            />
          ))}
          {filteredPlayers.length === 0 && (
            <p className="text-center text-gray-500 text-sm py-8">No players available</p>
          )}
        </div>
      </div>

      {/* Center: Draft board */}
      <div className="flex-1 flex flex-col gap-4 overflow-hidden">
        {/* Turn indicator */}
        <div className="bg-ipl-card border border-ipl-border rounded-2xl p-5 flex items-center justify-between">
          {draftStatus === 'waiting' ? (
            <div className="flex-1 flex items-center justify-between">
              <div>
                <h2 className="font-bold text-lg">Draft Room</h2>
                <p className="text-gray-400 text-sm">Waiting for draft to start...</p>
              </div>
              {isCommissioner && (
                <button
                  onClick={startDraft}
                  className="px-6 py-3 bg-ipl-gold text-black font-extrabold rounded-xl hover:bg-yellow-400 transition"
                >
                  Start Draft
                </button>
              )}
            </div>
          ) : draftStatus === 'complete' ? (
            <div className="flex-1 text-center">
              <p className="text-2xl font-extrabold text-ipl-gold">Draft Complete!</p>
              <p className="text-gray-400 text-sm mt-1">All squads are set. Season is about to begin.</p>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-between">
              <div>
                {isMyTurn ? (
                  <>
                    <p className="text-ipl-gold font-bold text-lg">Your Pick!</p>
                    <p className="text-gray-400 text-sm">
                      Round {(currentTurn?.round ?? 0) + 1}, Pick #{(currentTurn?.pickNum ?? 0) + 1}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="font-bold text-lg">{currentTurn?.memberName}'s turn</p>
                    <p className="text-gray-400 text-sm">
                      Round {(currentTurn?.round ?? 0) + 1}, Pick #{(currentTurn?.pickNum ?? 0) + 1}
                    </p>
                  </>
                )}
              </div>
              <Timer seconds={timeRemaining} total={60} />
            </div>
          )}
        </div>

        {/* My squad */}
        <div className="bg-ipl-card border border-ipl-border rounded-2xl p-4 flex-1 overflow-y-auto">
          <p className="text-xs text-gray-400 uppercase tracking-widest mb-3">
            My Squad ({myMember?.teamPlayers?.length ?? 0} / {league?.squadSize ?? 15})
          </p>
          {myMember?.teamPlayers && myMember.teamPlayers.length > 0 ? (
            <div className="grid grid-cols-2 gap-2">
              {myMember.teamPlayers.map((tp) => (
                <PlayerCard
                  key={tp.id}
                  player={tp.player}
                  showPrice
                  draftRound={tp.draftRound}
                />
              ))}
            </div>
          ) : (
            <p className="text-gray-500 text-sm text-center py-8">No players yet</p>
          )}
        </div>
      </div>

      {/* Right: Pick history + teams */}
      <div className="w-56 flex-shrink-0 flex flex-col gap-3">
        <div className="bg-ipl-card border border-ipl-border rounded-2xl p-4 flex-1 overflow-y-auto">
          <p className="text-xs text-gray-400 uppercase tracking-widest mb-3">Draft Board</p>
          <div className="space-y-1.5">
            {[...picks].reverse().map((pick, i) => (
              <div key={i} className="text-xs p-2 bg-gray-800 rounded-lg">
                <p className="font-semibold text-white truncate">{pick.player.name}</p>
                <p className="text-gray-400">{pick.memberName} · R{pick.round + 1}</p>
                {pick.isAuto && <p className="text-yellow-400">Auto-pick</p>}
              </div>
            ))}
            {picks.length === 0 && <p className="text-gray-500 text-sm">No picks yet</p>}
          </div>
        </div>

        <div className="bg-ipl-card border border-ipl-border rounded-2xl p-4">
          <p className="text-xs text-gray-400 uppercase tracking-widest mb-3">Order</p>
          <div className="space-y-1.5">
            {league?.members.map((m, i) => (
              <div
                key={m.id}
                className={`flex items-center gap-2 p-1.5 rounded-lg text-sm ${
                  m.id === currentTurn?.memberId ? 'bg-ipl-gold/20 border border-ipl-gold/50' : ''
                }`}
              >
                <span className="text-gray-500 w-4">{i + 1}</span>
                <span className="truncate font-medium">{m.teamName || m.user.username}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
