import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(authenticate);

const createSchema = z.object({
  name: z.string().min(3).max(50),
  mode: z.enum(['DRAFT', 'AUCTION']),
  maxTeams: z.number().int().min(2).max(20).default(10),
  budget: z.number().int().min(1000).default(10000),
  squadSize: z.number().int().min(11).max(25).default(15),
  teamName: z.string().min(1).max(40),
});

router.post('/', async (req: AuthRequest, res: Response) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const { name, mode, maxTeams, budget, squadSize, teamName } = parsed.data;

  const league = await prisma.league.create({
    data: {
      name,
      mode,
      maxTeams,
      budget,
      squadSize,
      commissionerId: req.userId!,
      members: {
        create: {
          userId: req.userId!,
          teamName,
          budgetRemaining: budget,
        },
      },
    },
    include: { members: { include: { user: { select: { id: true, username: true } } } } },
  });

  res.status(201).json(league);
});

router.post('/join', async (req: AuthRequest, res: Response) => {
  const { inviteCode, teamName } = z.object({
    inviteCode: z.string(),
    teamName: z.string().min(1).max(40),
  }).parse(req.body);

  const league = await prisma.league.findUnique({ where: { inviteCode }, include: { members: true } });
  if (!league) {
    res.status(404).json({ error: 'League not found' });
    return;
  }
  if (league.status !== 'SETUP') {
    res.status(400).json({ error: 'League already started' });
    return;
  }
  if (league.members.length >= league.maxTeams) {
    res.status(400).json({ error: 'League is full' });
    return;
  }

  const already = league.members.find((m) => m.userId === req.userId);
  if (already) {
    res.status(409).json({ error: 'Already in this league' });
    return;
  }

  const member = await prisma.leagueMember.create({
    data: {
      leagueId: league.id,
      userId: req.userId!,
      teamName,
      budgetRemaining: league.budget,
    },
    include: { user: { select: { id: true, username: true } } },
  });

  res.status(201).json(member);
});

router.get('/', async (req: AuthRequest, res: Response) => {
  const memberships = await prisma.leagueMember.findMany({
    where: { userId: req.userId },
    include: {
      league: {
        include: {
          commissioner: { select: { id: true, username: true } },
          members: { include: { user: { select: { id: true, username: true } } } },
        },
      },
    },
  });
  res.json(memberships.map((m) => ({ ...m.league, myMemberId: m.id, myTeamName: m.teamName })));
});

router.get('/:id', async (req: AuthRequest, res: Response) => {
  const league = await prisma.league.findUnique({
    where: { id: req.params.id },
    include: {
      commissioner: { select: { id: true, username: true } },
      members: {
        include: {
          user: { select: { id: true, username: true } },
          teamPlayers: { include: { player: true } },
        },
        orderBy: { totalPoints: 'desc' },
      },
      auctionQueue: { include: { player: true }, orderBy: { queueOrder: 'asc' } },
      draftOrders: true,
    },
  });

  if (!league) {
    res.status(404).json({ error: 'League not found' });
    return;
  }

  const isMember = league.members.some((m) => m.userId === req.userId);
  if (!isMember) {
    res.status(403).json({ error: 'Not a member of this league' });
    return;
  }

  res.json(league);
});

router.post('/:id/ready', async (req: AuthRequest, res: Response) => {
  const member = await prisma.leagueMember.findFirst({
    where: { leagueId: req.params.id, userId: req.userId },
  });
  if (!member) {
    res.status(403).json({ error: 'Not a member' });
    return;
  }

  await prisma.leagueMember.update({
    where: { id: member.id },
    data: { isReady: true },
  });

  res.json({ ok: true });
});

router.post('/:id/set-auction-queue', async (req: AuthRequest, res: Response) => {
  const league = await prisma.league.findUnique({ where: { id: req.params.id } });
  if (!league || league.commissionerId !== req.userId) {
    res.status(403).json({ error: 'Only the commissioner can set the auction queue' });
    return;
  }

  const { playerIds } = z.object({ playerIds: z.array(z.string()) }).parse(req.body);

  await prisma.auctionQueue.deleteMany({ where: { leagueId: req.params.id } });
  await prisma.auctionQueue.createMany({
    data: playerIds.map((playerId, i) => ({
      leagueId: req.params.id,
      playerId,
      queueOrder: i,
    })),
  });

  res.json({ ok: true });
});

router.post('/:id/set-draft-order', async (req: AuthRequest, res: Response) => {
  const league = await prisma.league.findUnique({ where: { id: req.params.id }, include: { members: true } });
  if (!league || league.commissionerId !== req.userId) {
    res.status(403).json({ error: 'Only the commissioner can set the draft order' });
    return;
  }

  const memberIds = league.members.map((m) => m.id);
  const shuffled = [...memberIds].sort(() => Math.random() - 0.5);

  await prisma.draftOrder.deleteMany({ where: { leagueId: req.params.id } });
  await prisma.draftOrder.createMany({
    data: shuffled.map((memberId, i) => ({
      leagueId: req.params.id,
      memberId,
      position: i,
    })),
  });

  res.json({ order: shuffled });
});

export default router;
