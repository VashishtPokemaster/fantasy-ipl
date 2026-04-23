import { Server, Socket } from 'socket.io';
import { prisma } from '../lib/prisma';

interface AuctionState {
  leagueId: string;
  queueIndex: number;
  currentPlayerId: string | null;
  currentBid: number;
  currentBidderId: string | null;
  timer: ReturnType<typeof setTimeout> | null;
  timeRemaining: number;
  status: 'waiting' | 'active' | 'sold' | 'unsold' | 'complete';
}

const states = new Map<string, AuctionState>();
const TICK_MS = 1000;
const BID_TIME = 30;
const ANTI_SNIPE_THRESHOLD = 5;
const ANTI_SNIPE_RESET = 8;

function getState(leagueId: string): AuctionState {
  if (!states.has(leagueId)) {
    states.set(leagueId, {
      leagueId,
      queueIndex: 0,
      currentPlayerId: null,
      currentBid: 0,
      currentBidderId: null,
      timer: null,
      timeRemaining: BID_TIME,
      status: 'waiting',
    });
  }
  return states.get(leagueId)!;
}

async function broadcastState(io: Server, leagueId: string) {
  const state = getState(leagueId);
  let player = null;
  if (state.currentPlayerId) {
    player = await prisma.player.findUnique({ where: { id: state.currentPlayerId } });
  }
  io.to(`league:${leagueId}`).emit('auction:state', { ...state, timer: null, player });
}

async function advanceQueue(io: Server, leagueId: string) {
  try {
    const state = getState(leagueId);
    const queue = await prisma.auctionQueue.findMany({
      where: { leagueId },
      orderBy: { queueOrder: 'asc' },
      include: { player: true },
    });

    // Find next pending item
    const next = queue.find((q) => q.queueOrder >= state.queueIndex && q.status === 'PENDING');
    if (!next) {
      state.status = 'complete';
      state.currentPlayerId = null;
      await prisma.league.update({ where: { id: leagueId }, data: { status: 'ACTIVE' } });
      io.to(`league:${leagueId}`).emit('auction:complete');
      states.delete(leagueId);
      return;
    }

    await prisma.auctionQueue.update({ where: { id: next.id }, data: { status: 'ACTIVE' } });

    state.queueIndex = next.queueOrder + 1;
    state.currentPlayerId = next.playerId;
    state.currentBid = next.player.basePrice;
    state.currentBidderId = null;
    state.status = 'active';
    state.timeRemaining = BID_TIME;

    io.to(`league:${leagueId}`).emit('auction:next_player', {
      player: next.player,
      basePrice: next.player.basePrice,
    });

    // Also broadcast full state so any late joiners / reconnects are in sync
    await broadcastState(io, leagueId);

    startTimer(io, leagueId);
  } catch (err) {
    console.error('[Auction] advanceQueue error:', err);
    io.to(`league:${leagueId}`).emit('error', { message: 'Auction error advancing to next player. Please try resuming.' });
  }
}

function startTimer(io: Server, leagueId: string) {
  const state = getState(leagueId);
  if (state.timer) clearInterval(state.timer);

  state.timer = setInterval(async () => {
    state.timeRemaining -= 1;
    io.to(`league:${leagueId}`).emit('auction:tick', { timeRemaining: state.timeRemaining });

    if (state.timeRemaining <= 0) {
      clearInterval(state.timer!);
      state.timer = null;
      await resolveCurrentPlayer(io, leagueId);
    }
  }, TICK_MS);
}

async function resolveCurrentPlayer(io: Server, leagueId: string) {
  try {
    const state = getState(leagueId);
    if (!state.currentPlayerId) return;

    const queueItem = await prisma.auctionQueue.findFirst({
      where: { leagueId, playerId: state.currentPlayerId, status: 'ACTIVE' },
    });
    if (!queueItem) return;

    if (state.currentBidderId) {
      // Player sold
      const member = await prisma.leagueMember.findUnique({ where: { id: state.currentBidderId } });
      if (!member || member.budgetRemaining < state.currentBid) {
        // Budget issue — mark unsold
        await prisma.auctionQueue.update({ where: { id: queueItem.id }, data: { status: 'UNSOLD' } });
        io.to(`league:${leagueId}`).emit('auction:unsold', { playerId: state.currentPlayerId });
      } else {
        await Promise.all([
          prisma.auctionQueue.update({
            where: { id: queueItem.id },
            data: { status: 'SOLD', soldTo: state.currentBidderId, soldPrice: state.currentBid },
          }),
          prisma.leagueMember.update({
            where: { id: state.currentBidderId },
            data: { budgetRemaining: { decrement: state.currentBid } },
          }),
          prisma.teamPlayer.create({
            data: {
              memberId: state.currentBidderId,
              playerId: state.currentPlayerId,
              leagueId,
              purchasePrice: state.currentBid,
            },
          }),
          prisma.auctionBid.updateMany({
            where: { leagueId, playerId: state.currentPlayerId, memberId: state.currentBidderId },
            data: { won: true },
          }),
        ]);

        const winner = await prisma.leagueMember.findUnique({
          where: { id: state.currentBidderId },
          include: { user: { select: { username: true } } },
        });

        io.to(`league:${leagueId}`).emit('auction:sold', {
          playerId: state.currentPlayerId,
          soldTo: state.currentBidderId,
          winnerName: winner?.user.username,
          price: state.currentBid,
        });
      }
    } else {
      await prisma.auctionQueue.update({ where: { id: queueItem.id }, data: { status: 'UNSOLD' } });
      io.to(`league:${leagueId}`).emit('auction:unsold', { playerId: state.currentPlayerId });
    }

    // Short pause then advance
    setTimeout(() => advanceQueue(io, leagueId), 3000);
  } catch (err) {
    console.error('[Auction] resolveCurrentPlayer error:', err);
    io.to(`league:${leagueId}`).emit('error', { message: 'Auction error resolving player. Advancing to next...' });
    setTimeout(() => advanceQueue(io, leagueId), 3000);
  }
}

export function registerAuctionHandlers(io: Server, socket: Socket) {
  const userId = (socket as unknown as { userId: string }).userId;

  socket.on('auction:join', async ({ leagueId }: { leagueId: string }) => {
    try {
      socket.join(`league:${leagueId}`);
      console.log(`[Auction] ${userId} joined room league:${leagueId}`);
      await broadcastState(io, leagueId);
    } catch (err) {
      console.error('[Auction] join error:', err);
    }
  });

  socket.on('auction:start', async ({ leagueId }: { leagueId: string }) => {
    try {
      const league = await prisma.league.findUnique({ where: { id: leagueId } });
      if (!league || league.commissionerId !== userId) {
        socket.emit('error', { message: 'Only the commissioner can start the auction' });
        return;
      }

      // Allow restart if league got stuck in ACTIVE due to empty queue, or is in SETUP
      const allowedStatuses = ['SETUP', 'ACTIVE', 'AUCTIONING'];
      if (!allowedStatuses.includes(league.status)) {
        socket.emit('error', { message: 'Cannot start auction in current league state' });
        return;
      }

      // If there's already an active in-memory state with a current player, don't restart
      const existingState = states.get(leagueId);
      if (existingState && existingState.status === 'active' && existingState.currentPlayerId) {
        // Just broadcast current state to the requester — they probably lost connection
        await broadcastState(io, leagueId);
        return;
      }

      // Check if queue has pending items; if not, auto-populate with all players
      const pendingCount = await prisma.auctionQueue.count({
        where: { leagueId, status: 'PENDING' },
      });

      if (pendingCount === 0) {
        // Auto-populate: all players sorted by basePrice descending (highest value first)
        const allPlayers = await prisma.player.findMany({
          orderBy: { basePrice: 'desc' },
          select: { id: true },
        });

        if (allPlayers.length === 0) {
          socket.emit('error', { message: 'No players found — please seed players first (Dashboard → ① Seed Players).' });
          return;
        }

        // Clear any stale queue entries and rebuild
        await prisma.auctionQueue.deleteMany({ where: { leagueId } });
        await prisma.auctionQueue.createMany({
          data: allPlayers.map((p, i) => ({
            leagueId,
            playerId: p.id,
            queueOrder: i,
          })),
        });

        console.log(`[Auction] Auto-populated queue with ${allPlayers.length} players for league ${leagueId}`);
      }

      // Reset in-memory state for this league
      states.delete(leagueId);

      await prisma.league.update({ where: { id: leagueId }, data: { status: 'AUCTIONING' } });
      io.to(`league:${leagueId}`).emit('auction:started');

      console.log(`[Auction] Started for league ${leagueId}, advancing queue...`);
      await advanceQueue(io, leagueId);
    } catch (err) {
      console.error('[Auction] start error:', err);
      socket.emit('error', { message: `Failed to start auction: ${err instanceof Error ? err.message : 'Unknown error'}` });
    }
  });

  socket.on('auction:bid', async ({ leagueId, amount }: { leagueId: string; amount: number }) => {
    try {
      const state = getState(leagueId);
      if (state.status !== 'active' || !state.currentPlayerId) {
        socket.emit('error', { message: 'No active auction' });
        return;
      }

      if (amount <= state.currentBid) {
        socket.emit('error', { message: `Bid must exceed current bid of ${state.currentBid}` });
        return;
      }

      const member = await prisma.leagueMember.findFirst({ where: { leagueId, userId } });
      if (!member) {
        socket.emit('error', { message: 'Not a member of this league' });
        return;
      }
      if (member.budgetRemaining < amount) {
        socket.emit('error', { message: 'Insufficient budget' });
        return;
      }

      // Check squad size cap
      const squadCount = await prisma.teamPlayer.count({ where: { memberId: member.id } });
      const league = await prisma.league.findUnique({ where: { id: leagueId } });
      if (league && squadCount >= league.squadSize) {
        socket.emit('error', { message: 'Squad is full' });
        return;
      }

      state.currentBid = amount;
      state.currentBidderId = member.id;

      // Anti-snipe: reset timer if bid in last threshold seconds
      if (state.timeRemaining <= ANTI_SNIPE_THRESHOLD) {
        state.timeRemaining = ANTI_SNIPE_RESET;
      }

      await prisma.auctionBid.create({
        data: { playerId: state.currentPlayerId, memberId: member.id, leagueId, amount },
      });

      const bidderName = (await prisma.user.findUnique({
        where: { id: userId },
        select: { username: true },
      }))?.username;

      io.to(`league:${leagueId}`).emit('auction:bid_update', {
        amount,
        bidderId: member.id,
        bidderName,
      });
    } catch (err) {
      console.error('[Auction] bid error:', err);
      socket.emit('error', { message: 'Failed to place bid' });
    }
  });

  socket.on('auction:pause', async ({ leagueId }: { leagueId: string }) => {
    try {
      const league = await prisma.league.findUnique({ where: { id: leagueId } });
      if (!league || league.commissionerId !== userId) return;
      const state = getState(leagueId);
      if (state.timer) { clearInterval(state.timer); state.timer = null; }
      state.status = 'waiting';
      io.to(`league:${leagueId}`).emit('auction:paused');
    } catch (err) {
      console.error('[Auction] pause error:', err);
    }
  });

  socket.on('auction:resume', async ({ leagueId }: { leagueId: string }) => {
    try {
      const league = await prisma.league.findUnique({ where: { id: leagueId } });
      if (!league || league.commissionerId !== userId) return;
      const state = getState(leagueId);
      state.status = 'active';
      startTimer(io, leagueId);
      io.to(`league:${leagueId}`).emit('auction:resumed');
    } catch (err) {
      console.error('[Auction] resume error:', err);
    }
  });
}
