# Fantasy IPL — Setup Guide

## Prerequisites
- Node.js 18+
- Docker (for PostgreSQL) OR a PostgreSQL instance
- CricAPI key: https://cricapi.com (free tier: 100 req/day)
- Cricbuzz via RapidAPI: https://rapidapi.com/cricbuzz/api/cricbuzz-cricket

---

## 1. Install Dependencies

```bash
npm install
```

---

## 2. Start PostgreSQL

```bash
docker-compose up -d
```

Or point `DATABASE_URL` at your own Postgres instance.

---

## 3. Configure Environment

```bash
cp backend/.env.example backend/.env
```

Edit `backend/.env`:
```
DATABASE_URL="postgresql://fantasy:fantasy123@localhost:5432/fantasy_ipl"
JWT_SECRET="your-long-random-secret"
CRICAPI_KEY="your-cricapi-key"
RAPIDAPI_KEY="your-rapidapi-key"
CLIENT_URL="http://localhost:5173"
```

---

## 4. Run Database Migrations

```bash
cd backend
npm run db:generate
npm run db:migrate
```

---

## 5. Start the App

```bash
# From root
npm run dev
```

- Backend: http://localhost:4000
- Frontend: http://localhost:5173

---

## 6. Seed Players

After registering an account, click **"Seed Players"** on the Dashboard.
This populates the DB with IPL 2025 squads (no API key needed).

---

## How It Works

### Auction Mode
1. Commissioner creates league → shares invite code
2. Everyone joins and sets their team name
3. Commissioner sets up the auction queue (or it auto-queues all players)
4. Commissioner clicks **Start Auction**
5. Each player gets 30s of bidding — anti-snipe resets to 8s on late bids
6. Highest bidder wins, budget deducted automatically

### Draft Mode
1. Commissioner creates league → shares invite code
2. Commissioner randomizes draft order
3. Commissioner clicks **Start Draft**
4. Snake draft — each person has 60s to pick
5. Auto-pick selects best available if timer expires

### Scoring (Standard IPL Fantasy)
| Action | Points |
|---|---|
| Playing XI | +4 |
| Run | +1 |
| Four | +1 bonus |
| Six | +2 bonus |
| 30 runs | +4 |
| 50 runs | +8 |
| 100 runs | +16 |
| Duck | -2 |
| Wicket | +25 |
| 4 wickets | +8 bonus |
| 5+ wickets | +16 bonus |
| Maiden | +12 |
| LBW/Bowled | +8 bonus |
| Catch | +8 |
| 3+ catches | +4 bonus |
| Stumping | +12 |
| Run out | +6 |
| Captain | 2× multiplier |
| Vice Captain | 1.5× multiplier |

---

## API Data Sources
- **CricAPI**: Live match scores, upcoming matches, player search
- **Cricbuzz (RapidAPI)**: Live scores, detailed scorecards, player stats
- Stats sync: Automatic every hour via cron, or trigger manually via `POST /api/stats/sync/:matchId`
