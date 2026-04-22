import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { getIPLMatches, getMatchScorecard } from '../services/cricapi';
import { getLiveMatches } from '../services/cricbuzz';
import { calculatePoints, RawStats } from '../services/scoring';
import { recalcMemberPoints } from './teams';

const router = Router();

// Get live matches from both APIs
router.get('/live', async (_req: Request, res: Response) => {
  const [cricApiLive, cricbuzzLive] = await Promise.all([getIPLMatches(), getLiveMatches()]);
  res.json({ cricApi: cricApiLive, cricbuzz: cricbuzzLive });
});

// Get player stats
router.get('/player/:id', async (req: Request, res: Response) => {
  const stats = await prisma.playerStats.findMany({
    where: { playerId: req.params.id },
    include: { match: true },
    orderBy: { match: { matchDate: 'desc' } },
  });
  res.json(stats);
});

// Sync stats for a single match — called manually or by the cron job
router.post('/sync/:matchId', async (req: Request, res: Response) => {
  const result = await syncMatchStats(req.params.matchId);
  res.json(result);
});

// ─── Core sync function (also exported for use by cron) ──────────────────────
export async function syncMatchStats(matchId: string): Promise<{ synced: number; error?: string }> {
  const dbMatch = await prisma.match.findUnique({ where: { id: matchId } });
  if (!dbMatch?.cricApiId) return { synced: 0, error: 'No CricAPI ID on match' };

  const scorecard = await getMatchScorecard(dbMatch.cricApiId) as Record<string, unknown> | null;
  if (!scorecard) return { synced: 0, error: 'Could not fetch scorecard from CricAPI' };

  const innings = scorecard.scorecard as Array<Record<string, unknown>> | undefined;
  if (!innings?.length) return { synced: 0, error: 'No innings data in scorecard' };

  // Load all players with all IDs for matching
  const allPlayers = await prisma.player.findMany({
    select: { id: true, cricApiId: true, cricbuzzId: true, name: true },
  });

  // Three-tier lookup:
  // 1. Exact CricAPI ID  (from scorecard player.id)
  // 2. Exact Cricbuzz ID (from scorecard player.id if using Cricbuzz scorecard)
  // 3. Smart name fallback — last name + first initial
  function findPlayer(apiPlayerId?: string, name?: string) {
    if (apiPlayerId) {
      const byApiId = allPlayers.find(
        (p) => p.cricApiId === apiPlayerId || p.cricbuzzId === apiPlayerId
      );
      if (byApiId) return byApiId;
    }

    if (name) {
      const apiNorm = name.toLowerCase().replace(/[^a-z\s]/g, '').trim();
      const apiWords = apiNorm.split(/\s+/).filter((w) => w.length > 1);
      const apiLast  = apiWords[apiWords.length - 1];
      const apiFirst = apiWords[0];

      // Collect candidates whose last name matches
      const byLastName = allPlayers.filter(
        (p) => p.name.toLowerCase().split(' ').pop() === apiLast
      );

      if (byLastName.length === 1) return byLastName[0]; // unique last name → done

      if (byLastName.length > 1) {
        // Disambiguate by first name / initial
        const byFull = byLastName.find(
          (p) => p.name.toLowerCase().startsWith(apiFirst)
        );
        if (byFull) return byFull;

        const byInitial = byLastName.find(
          (p) => p.name.toLowerCase()[0] === apiFirst[0]
        );
        if (byInitial) return byInitial;
      }

      // Broader contains fallback
      return allPlayers.find(
        (p) => p.name.toLowerCase().includes(apiLast) || apiNorm.includes(
          p.name.toLowerCase().split(' ').pop() || ''
        )
      ) || null;
    }
    return null;
  }

  // When we match a player by name, opportunistically store the API ID
  async function maybeSaveApiId(dbPlayerId: string, apiPlayerId?: string) {
    if (!apiPlayerId) return;
    const player = allPlayers.find((p) => p.id === dbPlayerId);
    if (!player) return;
    // Only save if the player still has a manual placeholder cricApiId
    if (player.cricApiId?.startsWith('manual-')) {
      await prisma.player.update({
        where: { id: dbPlayerId },
        data: { cricApiId: apiPlayerId },
      }).catch(() => {}); // ignore conflicts
    }
  }

  // Track per-player stats across innings (a player might bat in one inning and bowl in another)
  const statsMap = new Map<string, RawStats & { playerId: string }>();

  for (const inning of innings) {
    // ── Batting ──────────────────────────────────────────────────────────────
    const batsmen = inning.batsman as Array<Record<string, unknown>> | undefined || [];
    for (const bat of batsmen) {
      const apiId = bat.id as string | undefined;
      const name = bat.name as string | undefined;
      const player = findPlayer(apiId, name);
      if (!player) continue;
      await maybeSaveApiId(player.id, apiId); // opportunistically store API ID

      const runs = parseInt(bat.r as string) || 0;
      const balls = parseInt(bat.b as string) || 0;
      const fours = parseInt(bat['4s'] as string) || 0;
      const sixes = parseInt(bat['6s'] as string) || 0;
      const dismissal = bat.dismissal as string | undefined;
      const dismissed = !!dismissal && dismissal !== 'not out' && dismissal.trim() !== '';

      const existing = statsMap.get(player.id) || makeEmpty(player.id);
      existing.runs += runs;
      existing.balls += balls;
      existing.fours += fours;
      existing.sixes += sixes;
      existing.dismissed = dismissed;
      existing.didPlay = true;
      statsMap.set(player.id, existing);
    }

    // ── Bowling ──────────────────────────────────────────────────────────────
    const bowlers = inning.bowler as Array<Record<string, unknown>> | undefined || [];
    for (const bowl of bowlers) {
      const apiId = bowl.id as string | undefined;
      const name = bowl.name as string | undefined;
      const player = findPlayer(apiId, name);
      if (!player) continue;
      await maybeSaveApiId(player.id, apiId); // opportunistically store API ID

      const wickets = parseInt(bowl.w as string) || 0;
      const economy = parseFloat(bowl.eco as string) || 0;
      const maidens = parseInt(bowl.m as string) || 0;

      // LBW / Bowled count — parse from wickets breakdown if available
      const lbwBowled = parseInt(bowl.lbwBowled as string) || 0;

      const existing = statsMap.get(player.id) || makeEmpty(player.id);
      existing.wickets += wickets;
      existing.economy = economy; // use latest inning value
      existing.maidens += maidens;
      existing.lbwBowled += lbwBowled;
      existing.didPlay = true;
      statsMap.set(player.id, existing);
    }

    // ── Fielding (from fall of wickets / extras if available) ────────────────
    // CricAPI doesn't always expose fielding stats — skip for now, handle manually
  }

  // Write to DB and compute points
  let synced = 0;
  for (const [playerId, raw] of statsMap) {
    const points = calculatePoints(raw);
    await prisma.playerStats.upsert({
      where: { playerId_matchId: { playerId, matchId: dbMatch.id } },
      update: {
        runs: raw.runs, balls: raw.balls, fours: raw.fours, sixes: raw.sixes,
        wickets: raw.wickets, economy: raw.economy, maidens: raw.maidens,
        lbwBowled: raw.lbwBowled, points,
      },
      create: {
        playerId, matchId: dbMatch.id,
        runs: raw.runs, balls: raw.balls, fours: raw.fours, sixes: raw.sixes,
        wickets: raw.wickets, economy: raw.economy, maidens: raw.maidens,
        lbwBowled: raw.lbwBowled, points,
      },
    });
    synced++;
  }

  // Mark match completed and refresh all member points
  await prisma.match.update({ where: { id: dbMatch.id }, data: { status: 'COMPLETED' } });

  const affectedMembers = await prisma.teamPlayer.findMany({
    where: { playerId: { in: [...statsMap.keys()] } },
    select: { memberId: true },
    distinct: ['memberId'],
  });
  await Promise.all(affectedMembers.map((m) => recalcMemberPoints(m.memberId)));

  console.log(`[Stats] Synced ${synced} player stats for match ${dbMatch.id}`);
  return { synced };
}

function makeEmpty(playerId: string): RawStats & { playerId: string } {
  return {
    playerId, runs: 0, balls: 0, fours: 0, sixes: 0,
    wickets: 0, economy: 0, catches: 0, runOuts: 0,
    stumpings: 0, maidens: 0, lbwBowled: 0,
    didPlay: true, dismissed: false,
  };
}

export default router;
