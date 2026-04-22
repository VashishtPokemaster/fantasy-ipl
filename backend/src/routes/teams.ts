import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authenticate, AuthRequest } from '../middleware/auth';
import { applyMultiplier } from '../services/scoring';

const router = Router();
router.use(authenticate);

// Get my team in a league
router.get('/:leagueId', async (req: AuthRequest, res: Response) => {
  const member = await prisma.leagueMember.findFirst({
    where: { leagueId: req.params.leagueId, userId: req.userId },
    include: {
      teamPlayers: {
        include: {
          player: {
            include: {
              stats: {
                include: { match: true },
                orderBy: { match: { matchDate: 'desc' } },
                take: 5,
              },
            },
          },
        },
      },
    },
  });

  if (!member) {
    res.status(403).json({ error: 'Not a member of this league' });
    return;
  }

  res.json(member);
});

// Set captain / vice captain
router.patch('/:leagueId/captain', async (req: AuthRequest, res: Response) => {
  const { captainPlayerId, viceCaptainPlayerId } = z.object({
    captainPlayerId: z.string(),
    viceCaptainPlayerId: z.string(),
  }).parse(req.body);

  if (captainPlayerId === viceCaptainPlayerId) {
    res.status(400).json({ error: 'Captain and vice captain must be different players' });
    return;
  }

  const member = await prisma.leagueMember.findFirst({
    where: { leagueId: req.params.leagueId, userId: req.userId },
    include: { teamPlayers: true },
  });

  if (!member) {
    res.status(403).json({ error: 'Not a member' });
    return;
  }

  const playerIds = member.teamPlayers.map((tp) => tp.playerId);
  if (!playerIds.includes(captainPlayerId) || !playerIds.includes(viceCaptainPlayerId)) {
    res.status(400).json({ error: 'Players not in your squad' });
    return;
  }

  await prisma.$transaction([
    prisma.teamPlayer.updateMany({ where: { memberId: member.id }, data: { isCaptain: false, isViceCaptain: false } }),
    prisma.teamPlayer.updateMany({ where: { memberId: member.id, playerId: captainPlayerId }, data: { isCaptain: true } }),
    prisma.teamPlayer.updateMany({ where: { memberId: member.id, playerId: viceCaptainPlayerId }, data: { isViceCaptain: true } }),
  ]);

  res.json({ ok: true });
});

// Leaderboard for a league
router.get('/:leagueId/leaderboard', async (req: AuthRequest, res: Response) => {
  const members = await prisma.leagueMember.findMany({
    where: { leagueId: req.params.leagueId },
    include: { user: { select: { id: true, username: true } } },
    orderBy: { totalPoints: 'desc' },
  });
  res.json(members);
});

// Recalculate total points for a member (triggered after stats update)
export async function recalcMemberPoints(memberId: string) {
  const teamPlayers = await prisma.teamPlayer.findMany({
    where: { memberId },
    include: {
      player: {
        include: { stats: true },
      },
    },
  });

  let total = 0;
  for (const tp of teamPlayers) {
    const playerTotal = tp.player.stats.reduce((sum, s) => sum + s.points, 0);
    total += applyMultiplier(playerTotal, tp.isCaptain, tp.isViceCaptain);
  }

  await prisma.leagueMember.update({ where: { id: memberId }, data: { totalPoints: total } });
}

export default router;
