import { useEffect, useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { connectSocket, disconnectSocket } from '../socket/socketClient';
import { playerApi, leagueApi } from '../api/client';
import { useAuthStore } from '../store/authStore';
import { Player, League, LeagueMember } from '../types';
import Timer from '../components/Timer';
import PlayerCard from '../components/PlayerCard';

interface AuctionStateUpdate {
  currentPlayerId: string | null;
  currentBid: number;
  currentBidderId: string | null;
  timeRemaining: number;
  status: string;
  queueIndex: number;
  player?: Player;
}

interface BidUpdate {
  amount: number;
  bidderId: string;
  bidderName: string;
}

interface SoldEvent {
  playerId: string;
  soldTo: string;
  winnerName: string;
  price: number;
}

interface LogEntry {
  type: 'bid' | 'sold' | 'unsold' | 'info';
  text: string;
  ts: number;
}

const BID_INCREMENTS = [100, 250, 500, 1000];

export default function AuctionRoom() {
  const { id: leagueId } = useParams<{ id: string }>();
  const { user } = useAuthStore();
  const [league, setLeague] = useState<League | null>(null);
  const [myMember, setMyMember] = useState<LeagueMember | null>(null);
  const [currentPlayer, setCurrentPlayer] = useState<Player | null>(null);
  const [currentBid, setCurrentBid] = useState(0);
  const [currentBidderId, setCurrentBidderId] = useState<string | null>(null);
  const [currentBidderName, setCurrentBidderName] = useState<string | null>(null);
  const [timeRemaining, setTimeRemaining] = useState(30);
  const [auctionStatus, setAuctionStatus] = useState<string>('waiting');
  const [log, setLog] = useState<LogEntry[]>([]);
  const [allPlayers, setAllPlayers] = useState<Player[]>([]);
  const [playerFilter, setPlayerFilter] = useState('');
  const [customBid, setCustomBid] = useState('');
  const logRef = useRef<HTMLDivElement>(null);
  const isCommissioner = league?.commissionerId === user?.id;

  const addLog = (type: LogEntry['type'], text: string) => {
    setLog((prev) => [...prev.slice(-99), { type, text, ts: Date.now() }]);
  };

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
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [log]);

  useEffect(() => {
    if (!leagueId) return;
    const socket = connectSocket();

    socket.emit('auction:join', { leagueId });

    socket.on('auction:state', (state: AuctionStateUpdate) => {
      setCurrentBid(state.currentBid);
      setCurrentBidderId(state.currentBidderId);
      setTimeRemaining(state.timeRemaining);
      setAuctionStatus(state.status);
      if (state.player) setCurrentPlayer(state.player);
    });

    socket.on('auction:started', () => {
      setAuctionStatus('active');
      addLog('info', 'Auction has started!');
    });

    socket.on('auction:next_player', ({ player, basePrice }: { player: Player; basePrice: number }) => {
      setCurrentPlayer(player);
      setCurrentBid(basePrice);
      setCurrentBidderId(null);
      setCurrentBidderName(null);
      setTimeRemaining(30);
      setAuctionStatus('active');
      addLog('info', `Up for auction: ${player.name} (${player.iplTeam}) — Base ₹${basePrice}L`);
    });

    socket.on('auction:tick', ({ timeRemaining: t }: { timeRemaining: number }) => {
      setTimeRemaining(t);
    });

    socket.on('auction:bid_update', (data: BidUpdate) => {
      setCurrentBid(data.amount);
      setCurrentBidderId(data.bidderId);
      setCurrentBidderName(data.bidderName);
      addLog('bid', `${data.bidderName} bid ₹${data.amount}L`);
      // Update local member budget optimistically if it's me
      if (myMember?.id === data.bidderId) {
        setMyMember((prev) => prev ? { ...prev } : prev);
      }
    });

    socket.on('auction:sold', (data: SoldEvent) => {
      setAuctionStatus('sold');
      addLog('sold', `SOLD! ${currentPlayer?.name ?? ''} to ${data.winnerName} for ₹${data.price}L`);
      // Refresh member budgets
      leagueApi.get(leagueId).then((r) => {
        const me = r.data.members.find((m: LeagueMember) => m.userId === user?.id);
        setMyMember(me || null);
        setLeague(r.data);
      });
    });

    socket.on('auction:unsold', () => {
      setAuctionStatus('unsold');
      addLog('unsold', `${currentPlayer?.name ?? ''} went unsold`);
    });

    socket.on('auction:paused', () => {
      setAuctionStatus('waiting');
      addLog('info', 'Auction paused');
    });

    socket.on('auction:resumed', () => {
      setAuctionStatus('active');
      addLog('info', 'Auction resumed');
    });

    socket.on('auction:complete', () => {
      setAuctionStatus('complete');
      addLog('info', 'Auction complete! All players sold.');
    });

    socket.on('error', ({ message }: { message: string }) => {
      addLog('info', `Error: ${message}`);
    });

    return () => {
      socket.off('auction:state');
      socket.off('auction:started');
      socket.off('auction:next_player');
      socket.off('auction:tick');
      socket.off('auction:bid_update');
      socket.off('auction:sold');
      socket.off('auction:unsold');
      socket.off('auction:paused');
      socket.off('auction:resumed');
      socket.off('auction:complete');
      socket.off('error');
      disconnectSocket();
    };
  }, [leagueId, myMember?.id]);

  const startAuction = () => {
    const socket = connectSocket();
    socket.emit('auction:start', { leagueId });
  };

  const placeBid = (amount: number) => {
    const socket = connectSocket();
    socket.emit('auction:bid', { leagueId, amount });
  };

  const pause = () => connectSocket().emit('auction:pause', { leagueId });
  const resume = () => connectSocket().emit('auction:resume', { leagueId });

  const filteredPlayers = allPlayers.filter((p) =>
    p.name.toLowerCase().includes(playerFilter.toLowerCase()) ||
    p.iplTeam.toLowerCase().includes(playerFilter.toLowerCase())
  );

  const soldPlayerIds = new Set(league?.auctionQueue?.filter((q) => q.status === 'SOLD').map((q) => q.playerId) ?? []);

  return (
    <div className="flex gap-4 h-[calc(100vh-120px)]">
      {/* Left: Player pool */}
      <div className="w-64 flex-shrink-0 flex flex-col gap-2">
        <input
          value={playerFilter}
          onChange={(e) => setPlayerFilter(e.target.value)}
          placeholder="Search players..."
          className="bg-gray-800 border border-ipl-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-ipl-gold"
        />
        <div className="flex-1 overflow-y-auto space-y-1.5">
          {filteredPlayers.map((p) => (
            <PlayerCard
              key={p.id}
              player={p}
              owned={soldPlayerIds.has(p.id)}
              showPrice
            />
          ))}
        </div>
      </div>

      {/* Center: Auction stage */}
      <div className="flex-1 flex flex-col gap-4">
        {/* Current player on block */}
        <div className="bg-ipl-card border border-ipl-border rounded-2xl p-6 flex flex-col items-center text-center gap-4">
          {currentPlayer ? (
            <>
              <p className="text-xs text-gray-400 uppercase tracking-widest">Now Bidding</p>
              <div className="w-20 h-20 rounded-full bg-ipl-blue flex items-center justify-center text-3xl font-extrabold">
                {currentPlayer.name.charAt(0)}
              </div>
              <div>
                <h2 className="text-2xl font-extrabold">{currentPlayer.name}</h2>
                <p className="text-gray-400 text-sm">{currentPlayer.iplTeam} · {currentPlayer.role.replace('_', ' ')}</p>
              </div>

              {auctionStatus === 'active' && <Timer seconds={timeRemaining} total={30} />}

              <div className="flex items-center gap-4">
                <div className="text-center">
                  <p className="text-3xl font-extrabold text-ipl-gold">₹{currentBid}L</p>
                  <p className="text-xs text-gray-400">Current Bid</p>
                </div>
                {currentBidderName && (
                  <div className="text-center">
                    <p className="font-semibold">{currentBidderName}</p>
                    <p className="text-xs text-gray-400">Leading</p>
                  </div>
                )}
              </div>

              {/* Bid buttons */}
              {auctionStatus === 'active' && myMember && (
                <div className="space-y-3 w-full max-w-sm">
                  <div className="flex gap-2 justify-center flex-wrap">
                    {BID_INCREMENTS.map((inc) => (
                      <button
                        key={inc}
                        onClick={() => placeBid(currentBid + inc)}
                        disabled={myMember.budgetRemaining < currentBid + inc}
                        className="px-4 py-2 bg-ipl-blue hover:bg-blue-600 disabled:opacity-30 rounded-lg text-sm font-semibold transition"
                      >
                        +{inc}L
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      value={customBid}
                      onChange={(e) => setCustomBid(e.target.value)}
                      placeholder="Custom amount"
                      className="flex-1 bg-gray-800 border border-ipl-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-ipl-gold"
                    />
                    <button
                      onClick={() => { placeBid(parseInt(customBid)); setCustomBid(''); }}
                      disabled={!customBid || parseInt(customBid) <= currentBid}
                      className="px-4 py-2 bg-ipl-gold text-black font-bold rounded-lg hover:bg-yellow-400 disabled:opacity-30 transition"
                    >
                      Bid
                    </button>
                  </div>
                </div>
              )}

              {(auctionStatus === 'sold' || auctionStatus === 'unsold') && (
                <div className={`px-6 py-3 rounded-xl font-bold text-lg ${auctionStatus === 'sold' ? 'bg-green-700' : 'bg-gray-600'}`}>
                  {auctionStatus === 'sold' ? 'SOLD!' : 'UNSOLD'}
                </div>
              )}

              {auctionStatus === 'complete' && (
                <div className="bg-ipl-gold text-black px-6 py-3 rounded-xl font-bold text-lg">
                  Auction Complete!
                </div>
              )}
            </>
          ) : (
            <div className="py-8">
              {auctionStatus === 'waiting' && isCommissioner ? (
                <button
                  onClick={startAuction}
                  className="px-8 py-4 bg-ipl-gold text-black font-extrabold text-lg rounded-xl hover:bg-yellow-400 transition"
                >
                  Start Auction
                </button>
              ) : (
                <p className="text-gray-400">Waiting for auction to start...</p>
              )}
            </div>
          )}
        </div>

        {/* Commissioner controls */}
        {isCommissioner && auctionStatus === 'active' && (
          <div className="flex gap-2 justify-center">
            <button onClick={pause} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm transition">
              Pause
            </button>
          </div>
        )}
        {isCommissioner && auctionStatus === 'waiting' && currentPlayer && (
          <div className="flex gap-2 justify-center">
            <button onClick={resume} className="px-4 py-2 bg-green-600 hover:bg-green-500 rounded-lg text-sm transition">
              Resume
            </button>
          </div>
        )}

        {/* Bid log */}
        <div className="bg-ipl-card border border-ipl-border rounded-2xl p-4 flex-1 flex flex-col">
          <p className="text-xs text-gray-400 uppercase tracking-widest mb-2">Bid Log</p>
          <div ref={logRef} className="flex-1 overflow-y-auto space-y-1">
            {log.map((entry) => (
              <p
                key={entry.ts}
                className={`text-sm ${
                  entry.type === 'bid' ? 'text-blue-300' :
                  entry.type === 'sold' ? 'text-green-300 font-semibold' :
                  entry.type === 'unsold' ? 'text-gray-400' :
                  'text-gray-300'
                }`}
              >
                {entry.text}
              </p>
            ))}
          </div>
        </div>
      </div>

      {/* Right: Teams & budgets */}
      <div className="w-56 flex-shrink-0">
        <div className="bg-ipl-card border border-ipl-border rounded-2xl p-4">
          <p className="text-xs text-gray-400 uppercase tracking-widest mb-3">Teams</p>
          <div className="space-y-2">
            {league?.members.map((m) => (
              <div key={m.id} className={`flex items-center justify-between p-2 rounded-lg ${m.id === currentBidderId ? 'bg-ipl-blue/30 border border-ipl-blue' : ''}`}>
                <div>
                  <p className="text-sm font-semibold truncate w-28">{m.teamName || m.user.username}</p>
                  <p className="text-xs text-gray-400">{m.teamPlayers?.length ?? 0} players</p>
                </div>
                <p className="text-xs text-ipl-gold font-bold">₹{m.budgetRemaining}L</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
