import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import cron from 'node-cron';

import { config } from './config';
import { initSocket } from './socket';
import authRoutes from './routes/auth';
import leagueRoutes from './routes/leagues';
import playerRoutes from './routes/players';
import teamRoutes from './routes/teams';
import statsRoutes, { syncMatchStats } from './routes/stats';
import { getIPLMatches } from './services/cricapi';
import { prisma } from './lib/prisma';

const app = express();
const httpServer = createServer(app);

const corsOptions = {
  origin: (origin: string | undefined, cb: (err: null, allow: boolean) => void) => {
    // Allow: no origin (curl/Postman), any Vercel deploy, localhost dev
    if (!origin || origin.includes('vercel.app') || origin.includes('localhost')) {
      cb(null, true);
    } else {
      cb(null, false);
    }
  },
  credentials: true,
};

const io = new Server(httpServer, { cors: corsOptions });

app.use(helmet());
app.use(cors(corsOptions));
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/leagues', leagueRoutes);
app.use('/api/players', playerRoutes);
app.use('/api/teams', teamRoutes);
app.use('/api/stats', statsRoutes);

app.get('/health', (_req, res) => res.json({ ok: true }));

initSocket(io);

// ─── Cron: Sync upcoming IPL matches every hour ──────────────────────────────
cron.schedule('0 * * * *', async () => {
  if (!config.cricApiKey) return;
  console.log('[Cron] Syncing IPL match list...');
  try {
    const matches = await getIPLMatches();
    for (const m of matches) {
      const status = m.status?.toLowerCase().includes('won') || m.status?.toLowerCase().includes('tied')
        ? 'COMPLETED'
        : m.status === 'Match not started'
        ? 'UPCOMING'
        : 'LIVE';

      await prisma.match.upsert({
        where: { cricApiId: m.id },
        update: { status },
        create: {
          cricApiId: m.id,
          team1: m.teams[0] || '',
          team2: m.teams[1] || '',
          venue: m.venue,
          matchDate: new Date(m.dateTimeGMT),
          status,
        },
      });
    }
    console.log(`[Cron] Synced ${matches.length} IPL matches`);
  } catch (err) {
    console.error('[Cron] Match sync error:', err);
  }
});

// ─── Cron: Auto-sync stats for matches that just completed ───────────────────
// Runs every 15 minutes — checks for LIVE matches that CricAPI now says are done
cron.schedule('*/15 * * * *', async () => {
  if (!config.cricApiKey) return;
  try {
    // Find matches we track as LIVE
    const liveMatches = await prisma.match.findMany({
      where: { status: 'LIVE', cricApiId: { not: null } },
    });

    if (liveMatches.length === 0) return;

    // Re-fetch from CricAPI to see if any have finished
    const apiMatches = await getIPLMatches();
    const completedOnApi = new Set(
      apiMatches
        .filter((m) => m.status?.toLowerCase().includes('won') || m.status?.toLowerCase().includes('tied'))
        .map((m) => m.id)
    );

    for (const match of liveMatches) {
      if (completedOnApi.has(match.cricApiId!)) {
        console.log(`[Cron] Match ${match.id} just completed — syncing stats...`);
        const result = await syncMatchStats(match.id);
        console.log(`[Cron] Stats synced: ${result.synced} players updated`);
      }
    }
  } catch (err) {
    console.error('[Cron] Auto stat sync error:', err);
  }
});

// ─── Cron: Mark matches as LIVE when they are due to start ───────────────────
// Runs every 5 minutes
cron.schedule('*/5 * * * *', async () => {
  try {
    const now = new Date();
    const startWindow = new Date(now.getTime() - 30 * 60 * 1000); // 30 min ago (matches start ±)
    const endWindow = new Date(now.getTime() + 10 * 60 * 1000);   // 10 min from now

    await prisma.match.updateMany({
      where: {
        status: 'UPCOMING',
        matchDate: { gte: startWindow, lte: endWindow },
      },
      data: { status: 'LIVE' },
    });
  } catch (err) {
    console.error('[Cron] Mark-live error:', err);
  }
});

httpServer.listen(config.port, () => {
  console.log(`\n✅ Fantasy IPL server running on http://localhost:${config.port}`);
  console.log(`   API keys: CricAPI=${config.cricApiKey ? '✓' : '✗ MISSING'}, RapidAPI=${config.rapidApiKey ? '✓' : '✗ MISSING'}\n`);
});
