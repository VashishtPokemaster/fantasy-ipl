import { Server, Socket } from 'socket.io';
import { prisma } from '../lib/prisma';

interface DraftState {
  leagueId: string;
  order: string[];        // member IDs in snake-draft order for current round
  round: number;
  pickInRound: number;
  totalPicks: number;
  maxPicks: number;       // squadSize * numMembers
  timer: ReturnType<typeof setTimeout> | null;
  timeRemaining: number;
  status: 'waiting' | 'active' | 'complete';
}

const states = new Map<string, DraftState>();
const PICK_TIME = 60;
const TICK_MS = 1000;

function getState(leagueId: string): DraftState | undefined {
  return states.get(leagueId);
}

function snakeIndex(state: DraftState): string {
  const { order, round, pickInRound } = state;
  if (round % 2 === 0) {
    return order[pickInRound];
  } else {
    return order[order.length - 1 - pickInRound];
  }
}

function startTimer(io: Server, leagueId: string) {
  const state = states.get(leagueId);
  if (!state) return;
  if (state.timer) clearInterval(state.timer);

  state.timer = setInterval(async () => {
    state.timeRemaining -= 1;
    io.to(`league:${leagueId}`).emit('draft:tick', { timeRemaining: state.timeRemaining });

    if (state.timeRemaining <= 0) {
      clearInterval(state.timer!);
      state.timer = null;
      await autoPickPlayer(io, leagueId);
    }
  }, TICK_MS);
}

async function autoPickPlayer(io: Server, leagueId: string) {
  const state = states.get(leagueId);
  if (!state) return;

  const currentMemberId = snakeIndex(state);
  const owned = await prisma.teamPlayer.findMany({ where: { leagueId }, select: { playerId: true } });
  const ownedIds = owned.map((t) => t.playerId);

  const available = await prisma.player.findFirst({
    where: { id: { notIn: ownedIds } },
    orderBy: { basePrice: 'desc' },
  });

  if (!available) {
    await completeDraft(io, leagueId);
    return;
  }

  await executePick(io, leagueId, currentMemberId, available.id, true);
}

async function executePick(io: Server, leagueId: string, memberId: string, playerId: string, isAuto: boolean) {
  const state = states.get(leagueId);
  if (!state) return;

  const round = state.round;
  const pickNum = state.totalPicks;

  await Promise.all([
    prisma.teamPlayer.create({ data: { memberId, playerId, leagueId, draftRound: round } }),
    prisma.draftPick.create({ data: { leagueId, memberId, playerId, round, pickNum } }),
  ]);

  const [player, member] = await Promise.all([
    prisma.player.findUnique({ where: { id: playerId } }),
    prisma.leagueMember.findUnique({ where: { id: memberId }, include: { user: { select: { username: true } } } }),
  ]);

  io.to(`league:${leagueId}`).emit('draft:pick_made', {
    round,
    pickNum,
    memberId,
    memberName: member?.user.username,
    player,
    isAuto,
  });

  state.totalPicks += 1;
  state.pickInRound += 1;

  if (state.pickInRound >= state.order.length) {
    state.pickInRound = 0;
    state.round += 1;
  }

  if (state.totalPicks >= state.maxPicks) {
    await completeDraft(io, leagueId);
    return;
  }

  const nextMemberId = snakeIndex(state);
  state.timeRemaining = PICK_TIME;

  const nextMember = await prisma.leagueMember.findUnique({
    where: { id: nextMemberId },
    include: { user: { select: { username: true } } },
  });

  io.to(`league:${leagueId}`).emit('draft:turn', {
    memberId: nextMemberId,
    memberName: nextMember?.user.username,
    round: state.round,
    pickNum: state.totalPicks,
  });

  startTimer(io, leagueId);
}

async function completeDraft(io: Server, leagueId: string) {
  await prisma.league.update({ where: { id: leagueId }, data: { status: 'ACTIVE' } });
  io.to(`league:${leagueId}`).emit('draft:complete');
  const state = states.get(leagueId);
  if (state?.timer) clearInterval(state.timer);
  states.delete(leagueId);
}

export function registerDraftHandlers(io: Server, socket: Socket) {
  const userId = (socket as unknown as { userId: string }).userId;

  socket.on('draft:join', async ({ leagueId }: { leagueId: string }) => {
    socket.join(`league:${leagueId}`);
    const state = getState(leagueId);
    if (state) {
      const currentMemberId = snakeIndex(state);
      const member = await prisma.leagueMember.findUnique({
        where: { id: currentMemberId },
        include: { user: { select: { username: true } } },
      });
      socket.emit('draft:turn', {
        memberId: currentMemberId,
        memberName: member?.user.username,
        round: state.round,
        pickNum: state.totalPicks,
        timeRemaining: state.timeRemaining,
      });
    }
  });

  socket.on('draft:start', async ({ leagueId }: { leagueId: string }) => {
    const league = await prisma.league.findUnique({
      where: { id: leagueId },
      include: { draftOrders: { orderBy: { position: 'asc' } }, members: true },
    });

    if (!league || league.commissionerId !== userId) {
      socket.emit('error', { message: 'Only commissioner can start the draft' });
      return;
    }
    if (league.status !== 'SETUP') {
      socket.emit('error', { message: 'Draft already started' });
      return;
    }
    if (league.draftOrders.length === 0) {
      socket.emit('error', { message: 'Set draft order first' });
      return;
    }

    await prisma.league.update({ where: { id: leagueId }, data: { status: 'DRAFTING' } });

    const order = league.draftOrders.map((d) => d.memberId);
    const state: DraftState = {
      leagueId,
      order,
      round: 0,
      pickInRound: 0,
      totalPicks: 0,
      maxPicks: league.squadSize * league.members.length,
      timer: null,
      timeRemaining: PICK_TIME,
      status: 'active',
    };
    states.set(leagueId, state);

    const firstMemberId = snakeIndex(state);
    const firstMember = await prisma.leagueMember.findUnique({
      where: { id: firstMemberId },
      include: { user: { select: { username: true } } },
    });

    io.to(`league:${leagueId}`).emit('draft:started', { order });
    io.to(`league:${leagueId}`).emit('draft:turn', {
      memberId: firstMemberId,
      memberName: firstMember?.user.username,
      round: 0,
      pickNum: 0,
    });

    startTimer(io, leagueId);
  });

  socket.on('draft:pick', async ({ leagueId, playerId }: { leagueId: string; playerId: string }) => {
    const state = getState(leagueId);
    if (!state || state.status !== 'active') {
      socket.emit('error', { message: 'Draft not active' });
      return;
    }

    const currentMemberId = snakeIndex(state);
    const member = await prisma.leagueMember.findFirst({ where: { leagueId, userId } });
    if (!member || member.id !== currentMemberId) {
      socket.emit('error', { message: 'Not your turn' });
      return;
    }

    // Check player not already taken
    const alreadyPicked = await prisma.teamPlayer.findFirst({ where: { leagueId, playerId } });
    if (alreadyPicked) {
      socket.emit('error', { message: 'Player already picked' });
      return;
    }

    // Check squad size
    const squadCount = await prisma.teamPlayer.count({ where: { memberId: member.id } });
    const league = await prisma.league.findUnique({ where: { id: leagueId } });
    if (league && squadCount >= league.squadSize) {
      socket.emit('error', { message: 'Squad full' });
      return;
    }

    if (state.timer) clearInterval(state.timer);
    await executePick(io, leagueId, member.id, playerId, false);
  });
}
