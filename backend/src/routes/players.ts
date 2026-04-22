import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate, AuthRequest } from '../middleware/auth';
import { searchPlayer } from '../services/cricapi';
import { searchPlayers as cricbuzzSearch } from '../services/cricbuzz';

const router = Router();

// Public: get all players (paginated + filtered)
router.get('/', async (req: Request, res: Response) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 50;
  const role = req.query.role as string | undefined;
  const team = req.query.team as string | undefined;
  const search = req.query.search as string | undefined;

  const where = {
    ...(role ? { role: role as 'BATSMAN' | 'BOWLER' | 'ALL_ROUNDER' | 'WICKET_KEEPER' } : {}),
    ...(team ? { iplTeam: team } : {}),
    ...(search ? { name: { contains: search, mode: 'insensitive' as const } } : {}),
  };

  const [players, total] = await Promise.all([
    prisma.player.findMany({ where, skip: (page - 1) * limit, take: limit, orderBy: { name: 'asc' } }),
    prisma.player.count({ where }),
  ]);

  res.json({ players, total, page, pages: Math.ceil(total / limit) });
});

router.get('/:id', async (req: Request, res: Response) => {
  const player = await prisma.player.findUnique({
    where: { id: req.params.id },
    include: {
      stats: { include: { match: true }, orderBy: { match: { matchDate: 'desc' } }, take: 10 },
    },
  });
  if (!player) { res.status(404).json({ error: 'Player not found' }); return; }
  res.json(player);
});

// Search CricAPI + Cricbuzz
router.get('/external/search', authenticate, async (req: AuthRequest, res: Response) => {
  const name = req.query.name as string;
  if (!name) { res.status(400).json({ error: 'name query required' }); return; }
  const [cricApiResults, cricbuzzResults] = await Promise.all([searchPlayer(name), cricbuzzSearch(name)]);
  res.json({ cricApi: cricApiResults, cricbuzz: cricbuzzResults });
});

// Seed all IPL 2025 players
router.post('/seed', authenticate, async (_req: AuthRequest, res: Response) => {
  const players = getIPL2025Players();
  let created = 0;
  for (const p of players) {
    await prisma.player.upsert({
      where: { cricApiId: p.cricApiId },
      update: { name: p.name, iplTeam: p.iplTeam, role: p.role, basePrice: p.basePrice, nationality: p.nationality },
      create: p,
    });
    created++;
  }
  res.json({ seeded: created, message: `${created} players seeded. Run /players/sync-ids next to link CricAPI IDs.` });
});

// Sync player IDs using Cricbuzz (RapidAPI — 100 req/min, not 100/day like CricAPI)
// Run once after seeding. Safe to re-run — skips already-synced players.
router.post('/sync-ids', authenticate, async (_req: AuthRequest, res: Response) => {
  const needsSync = await prisma.player.findMany({
    where: {
      cricbuzzId: null,          // no Cricbuzz ID yet
      cricApiId: { startsWith: 'manual-' }, // still using placeholder
    },
  });

  if (needsSync.length === 0) {
    res.json({ synced: 0, stillUnsynced: 0, message: 'All players already synced!' });
    return;
  }

  let synced = 0;
  let failed = 0;
  const failures: string[] = [];

  for (const player of needsSync) {
    try {
      const results = await cricbuzzSearch(player.name);

      if (results.length > 0) {
        const best = findBestCricbuzzMatch(player.name, results);
        if (best) {
          const cricbuzzIdStr = String(best.id);
          // Make sure no other player already has this cricbuzzId
          const conflict = await prisma.player.findUnique({ where: { cricbuzzId: cricbuzzIdStr } });
          if (!conflict) {
            await prisma.player.update({
              where: { id: player.id },
              data: { cricbuzzId: cricbuzzIdStr },
            });
            synced++;
          } else {
            failed++;
            failures.push(`${player.name} (ID conflict)`);
          }
        } else {
          failed++;
          failures.push(`${player.name} (no name match in results)`);
        }
      } else {
        failed++;
        failures.push(`${player.name} (no results from API)`);
      }

      // Cricbuzz RapidAPI basic plan: ~100 req/min — 100ms gap is plenty
      await new Promise((r) => setTimeout(r, 120));
    } catch (err) {
      failed++;
      failures.push(`${player.name} (error: ${err})`);
    }
  }

  const stillUnsynced = await prisma.player.count({
    where: { cricbuzzId: null, cricApiId: { startsWith: 'manual-' } },
  });

  console.log('[Sync] Failed players:', failures);

  res.json({
    synced,
    failed,
    stillUnsynced,
    failedNames: failures,
    message: stillUnsynced === 0
      ? `All players synced! ${synced} IDs linked.`
      : `${synced} synced, ${failed} couldn't be matched (see failedNames). Safe to run again.`,
  });
});

export default router;

// ─── Name matching helper ────────────────────────────────────────────────────
// Cricbuzz returns names like "V Kohli" or "Virat Kohli" — we need to match
// against our stored names which are always full names.

function normalize(s: string) {
  return s.toLowerCase().replace(/[^a-z\s]/g, '').trim();
}

function nameParts(s: string) {
  return normalize(s).split(/\s+/).filter((w) => w.length > 1);
}

function findBestCricbuzzMatch(
  dbName: string,
  results: Array<{ id: number; name: string; teamName?: string }>
): { id: number; name: string } | null {
  const db = nameParts(dbName);
  const dbLast = db[db.length - 1];
  const dbFirst = db[0];

  // Score each result
  const scored = results.map((r) => {
    const api = nameParts(r.name);
    const apiLast = api[api.length - 1];
    let score = 0;

    // Last name exact match is the strongest signal in cricket
    if (apiLast === dbLast) score += 10;
    // First name or initial match
    if (api[0] === dbFirst) score += 5;
    else if (api[0]?.[0] === dbFirst?.[0]) score += 2; // initial match
    // All db words present in api name
    if (db.every((w) => api.some((a) => a.startsWith(w[0]) && (a === w || w.startsWith(a))))) score += 3;
    // Full normalize match
    if (normalize(r.name) === normalize(dbName)) score += 20;

    return { r, score };
  });

  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];

  // Only accept if score is meaningful (last name must match at minimum)
  if (best && best.score >= 10) return best.r;
  return null;
}

// ─── Full IPL 2025 Squads ───────────────────────────────────────────────────
// cricApiId prefixed with "manual-" = needs sync via /players/sync-ids
// basePrice in Lakhs (₹)

function p(
  id: string, name: string, team: string,
  role: 'BATSMAN' | 'BOWLER' | 'ALL_ROUNDER' | 'WICKET_KEEPER',
  basePrice: number, nationality: string
) {
  return { cricApiId: `manual-${id}`, name, iplTeam: team, role, basePrice, nationality };
}

function getIPL2025Players() {
  return [
    // ── MUMBAI INDIANS ──────────────────────────────────────────────────────
    p('mi-rohit',       'Rohit Sharma',       'MI', 'BATSMAN',       1600, 'India'),
    p('mi-surya',       'Suryakumar Yadav',   'MI', 'BATSMAN',       1200, 'India'),
    p('mi-tilak',       'Tilak Varma',        'MI', 'BATSMAN',       1900, 'India'),
    p('mi-naman',       'Naman Dhir',         'MI', 'ALL_ROUNDER',    575, 'India'),
    p('mi-willjacks',   'Will Jacks',         'MI', 'ALL_ROUNDER',   230, 'England'),
    p('mi-hardik',      'Hardik Pandya',      'MI', 'ALL_ROUNDER',   1500, 'India'),
    p('mi-karn',        'Karn Sharma',        'MI', 'BOWLER',         225, 'India'),
    p('mi-bumrah',      'Jasprit Bumrah',     'MI', 'BOWLER',        1400, 'India'),
    p('mi-dcharhar',    'Deepak Chahar',      'MI', 'BOWLER',         225, 'India'),
    p('mi-topley',      'Reece Topley',       'MI', 'BOWLER',         250, 'England'),
    p('mi-robin',       'Robin Minz',         'MI', 'WICKET_KEEPER',  475, 'India'),
    p('mi-ryan',        'Ryan Rickelton',     'MI', 'WICKET_KEEPER',  100, 'South Africa'),
    p('mi-santner',     'Mitchell Santner',   'MI', 'ALL_ROUNDER',    600, 'New Zealand'),
    p('mi-allah',       'Allah Ghazanfar',    'MI', 'BOWLER',         450, 'Afghanistan'),
    p('mi-raj',         'Raj Angad Bawa',     'MI', 'ALL_ROUNDER',    300, 'India'),
    p('mi-vignesh',     'Vignesh Puthur',     'MI', 'BOWLER',         100, 'India'),
    p('mi-bevon',       'Bevon Jacobs',       'MI', 'ALL_ROUNDER',    100, 'West Indies'),
    p('mi-corbin',      'Corbin Bosch',       'MI', 'ALL_ROUNDER',    500, 'South Africa'),
    p('mi-shrijith',    'Krishnan Shrijith',  'MI', 'WICKET_KEEPER',  100, 'India'),
    p('mi-arjun',       'Arjun Tendulkar',    'MI', 'BOWLER',         300, 'India'),
    p('mi-ashwani',     'Ashwani Kumar',      'MI', 'BOWLER',         100, 'India'),
    p('mi-mujeeb',      'Mujeeb Ur Rahman',   'MI', 'BOWLER',         100, 'Afghanistan'),
    p('mi-trent',       'Trent Boult',        'MI', 'BOWLER',         100, 'New Zealand'),

    // ── CHENNAI SUPER KINGS ─────────────────────────────────────────────────
    p('csk-dhoni',      'MS Dhoni',           'CSK', 'WICKET_KEEPER', 500, 'India'),
    p('csk-ruturaj',    'Ruturaj Gaikwad',    'CSK', 'BATSMAN',      2200, 'India'),
    p('csk-devon',      'Devon Conway',       'CSK', 'WICKET_KEEPER', 100, 'New Zealand'),
    p('csk-shivam',     'Shivam Dube',        'CSK', 'ALL_ROUNDER',   750, 'India'),
    p('csk-jadeja',     'Ravindra Jadeja',    'CSK', 'ALL_ROUNDER',  1800, 'India'),
    p('csk-matheesha',  'Matheesha Pathirana','CSK', 'BOWLER',       1325, 'Sri Lanka'),
    p('csk-rachin',     'Rachin Ravindra',    'CSK', 'ALL_ROUNDER',  175, 'New Zealand'),
    p('csk-vijay',      'Vijay Shankar',      'CSK', 'ALL_ROUNDER',   120, 'India'),
    p('csk-shardul',    'Shardul Thakur',     'CSK', 'ALL_ROUNDER',  1025, 'India'),
    p('csk-noor',       'Noor Ahmad',         'CSK', 'BOWLER',        100, 'Afghanistan'),
    p('csk-anshul',     'Anshul Kamboj',      'CSK', 'BOWLER',        325, 'India'),
    p('csk-gurjap',     'Gurjapneet Singh',   'CSK', 'BOWLER',        100, 'India'),
    p('csk-jamie',      'Jamie Overton',      'CSK', 'ALL_ROUNDER',   100, 'England'),
    p('csk-khaleel',    'Khaleel Ahmed',      'CSK', 'BOWLER',       1325, 'India'),
    p('csk-rahul-t',    'Rahul Tripathi',     'CSK', 'BATSMAN',       325, 'India'),
    p('csk-kamlesh',    'Kamlesh Nagarkoti',  'CSK', 'BOWLER',        100, 'India'),
    p('csk-nathan',     'Nathan Ellis',       'CSK', 'BOWLER',        100, 'Australia'),
    p('csk-samcurran',  'Sam Curran',         'CSK', 'ALL_ROUNDER',  1850, 'England'),
    p('csk-ravindra-a', 'Ravichandran Ashwin','CSK', 'ALL_ROUNDER',   975, 'India'),
    p('csk-andre',      'Andre Siddarth',     'CSK', 'BATSMAN',       100, 'India'),
    p('csk-mukesh',     'Mukesh Choudhary',   'CSK', 'BOWLER',        100, 'India'),

    // ── ROYAL CHALLENGERS BENGALURU ─────────────────────────────────────────
    p('rcb-virat',      'Virat Kohli',        'RCB', 'BATSMAN',      2100, 'India'),
    p('rcb-rajat',      'Rajat Patidar',      'RCB', 'BATSMAN',      1100, 'India'),
    p('rcb-faf',        'Faf du Plessis',     'RCB', 'BATSMAN',       700, 'South Africa'),
    p('rcb-liam',       'Liam Livingstone',   'RCB', 'ALL_ROUNDER',   100, 'England'),
    p('rcb-maxwell',    'Glenn Maxwell',      'RCB', 'ALL_ROUNDER',   100, 'Australia'),
    p('rcb-tim-david',  'Tim David',          'RCB', 'BATSMAN',       325, 'Singapore'),
    p('rcb-siraj',      'Mohammed Siraj',     'RCB', 'BOWLER',        700, 'India'),
    p('rcb-hazlewood',  'Josh Hazlewood',     'RCB', 'BOWLER',       1200, 'Australia'),
    p('rcb-yash',       'Yash Dayal',         'RCB', 'BOWLER',        500, 'India'),
    p('rcb-philsalt',   'Phil Salt',          'RCB', 'WICKET_KEEPER', 100, 'England'),
    p('rcb-jitesh',     'Jitesh Sharma',      'RCB', 'WICKET_KEEPER',1100, 'India'),
    p('rcb-krunal',     'Krunal Pandya',      'RCB', 'ALL_ROUNDER',   675, 'India'),
    p('rcb-romario',    'Romario Shepherd',   'RCB', 'ALL_ROUNDER',   100, 'West Indies'),
    p('rcb-swapnil',    'Swapnil Singh',      'RCB', 'ALL_ROUNDER',   100, 'India'),
    p('rcb-bhuvi',      'Bhuvneshwar Kumar',  'RCB', 'BOWLER',       1000, 'India'),
    p('rcb-manoj',      'Manoj Bhandage',     'RCB', 'ALL_ROUNDER',   100, 'India'),
    p('rcb-rasikh',     'Rasikh Dar Salam',   'RCB', 'BOWLER',        100, 'India'),
    p('rcb-nuwan',      'Nuwan Thushara',     'RCB', 'BOWLER',        250, 'Sri Lanka'),
    p('rcb-jacob',      'Jacob Bethell',      'RCB', 'ALL_ROUNDER',   200, 'England'),
    p('rcb-suyash',     'Suyash Prabhudessai','RCB', 'BATSMAN',       100, 'India'),
    p('rcb-akash',      'Akash Deep',         'RCB', 'BOWLER',        100, 'India'),
    p('rcb-swastik',    'Swastik Chikara',    'RCB', 'BOWLER',        100, 'India'),

    // ── KOLKATA KNIGHT RIDERS ───────────────────────────────────────────────
    p('kkr-venkatesh',  'Venkatesh Iyer',     'KKR', 'ALL_ROUNDER',  2375, 'India'),
    p('kkr-ajinkya',    'Ajinkya Rahane',     'KKR', 'BATSMAN',       100, 'India'),
    p('kkr-quinton',    'Quinton de Kock',    'KKR', 'WICKET_KEEPER', 300, 'South Africa'),
    p('kkr-rinku',      'Rinku Singh',        'KKR', 'BATSMAN',       100, 'India'),
    p('kkr-narine',     'Sunil Narine',       'KKR', 'ALL_ROUNDER',  1300, 'West Indies'),
    p('kkr-andre-r',    'Andre Russell',      'KKR', 'ALL_ROUNDER',  1200, 'West Indies'),
    p('kkr-varun',      'Varun Chakaravarthy','KKR', 'BOWLER',       1400, 'India'),
    p('kkr-anrich',     'Anrich Nortje',      'KKR', 'BOWLER',        650, 'South Africa'),
    p('kkr-rahul-t2',   'Rahmanullah Gurbaz', 'KKR', 'WICKET_KEEPER', 200, 'Afghanistan'),
    p('kkr-rovman',     'Rovman Powell',      'KKR', 'BATSMAN',       100, 'West Indies'),
    p('kkr-moeen',      'Moeen Ali',          'KKR', 'ALL_ROUNDER',   100, 'England'),
    p('kkr-harshit',    'Harshit Rana',       'KKR', 'BOWLER',       1800, 'India'),
    p('kkr-ramandeep',  'Ramandeep Singh',    'KKR', 'ALL_ROUNDER',   100, 'India'),
    p('kkr-manish',     'Manish Pandey',      'KKR', 'BATSMAN',       100, 'India'),
    p('kkr-mayank',     'Mayank Markande',    'KKR', 'BOWLER',        100, 'India'),
    p('kkr-luvnith',    'Luvnith Sisodia',    'KKR', 'WICKET_KEEPER', 100, 'India'),
    p('kkr-angkrish',   'Angkrish Raghuvanshi','KKR','BATSMAN',       300, 'India'),

    // ── DELHI CAPITALS ──────────────────────────────────────────────────────
    p('dc-pant',        'Rishabh Pant',       'DC', 'WICKET_KEEPER', 1600, 'India'),
    p('dc-axar',        'Axar Patel',         'DC', 'ALL_ROUNDER',    900, 'India'),
    p('dc-kuldeep',     'Kuldeep Yadav',      'DC', 'BOWLER',         200, 'India'),
    p('dc-kl',          'KL Rahul',           'DC', 'WICKET_KEEPER', 1400, 'India'),
    p('dc-jake',        'Jake Fraser-McGurk', 'DC', 'BATSMAN',        900, 'Australia'),
    p('dc-faf2',        'Faf du Plessis',     'DC', 'BATSMAN',        100, 'South Africa'), // might have moved
    p('dc-tristan',     'Tristan Stubbs',     'DC', 'BATSMAN',        225, 'South Africa'),
    p('dc-ashutosh',    'Ashutosh Sharma',    'DC', 'ALL_ROUNDER',    325, 'India'),
    p('dc-mohit',       'Mohit Sharma',       'DC', 'BOWLER',         200, 'India'),
    p('dc-mukesh-k',    'Mukesh Kumar',       'DC', 'BOWLER',         200, 'India'),
    p('dc-sameer',      'Sameer Rizvi',       'DC', 'BATSMAN',        950, 'India'),
    p('dc-vipraj',      'Vipraj Nigam',       'DC', 'BOWLER',         100, 'India'),
    p('dc-donovan',     'Donovan Ferreira',   'DC', 'BATSMAN',        100, 'South Africa'),
    p('dc-darshan',     'Darshan Nalkande',   'DC', 'BOWLER',         100, 'India'),
    p('dc-madhav',      'Madhav Tiwari',      'DC', 'BOWLER',         100, 'India'),
    p('dc-karun',       'Karun Nair',         'DC', 'BATSMAN',       1350, 'India'),
    p('dc-harry',       'Harry Brook',        'DC', 'BATSMAN',        675, 'England'),
    p('dc-t-stubbs',    'T Natarajan',        'DC', 'BOWLER',         100, 'India'),

    // ── PUNJAB KINGS ────────────────────────────────────────────────────────
    p('pbks-shreyas',   'Shreyas Iyer',       'PBKS', 'BATSMAN',     2675, 'India'),
    p('pbks-shashank',  'Shashank Singh',     'PBKS', 'ALL_ROUNDER',  100, 'India'),
    p('pbks-prabhsimran','Prabhsimran Singh', 'PBKS', 'WICKET_KEEPER',1175, 'India'),
    p('pbks-arshdeep',  'Arshdeep Singh',     'PBKS', 'BOWLER',      1800, 'India'),
    p('pbks-yuzvendra', 'Yuzvendra Chahal',   'PBKS', 'BOWLER',      1800, 'India'),
    p('pbks-kagiso',    'Kagiso Rabada',      'PBKS', 'BOWLER',       975, 'South Africa'),
    p('pbks-marco',     'Marco Jansen',       'PBKS', 'ALL_ROUNDER',  575, 'South Africa'),
    p('pbks-nehal',     'Nehal Wadhera',      'PBKS', 'BATSMAN',      100, 'India'),
    p('pbks-azm-khan',  'Azmatullah Omarzai', 'PBKS', 'ALL_ROUNDER',  325, 'Afghanistan'),
    p('pbks-harnoor',   'Harnoor Pannu',      'PBKS', 'BATSMAN',      100, 'India'),
    p('pbks-vishnu',    'Vishnu Vinod',       'PBKS', 'WICKET_KEEPER', 100, 'India'),
    p('pbks-suryansh',  'Suryansh Shedge',    'PBKS', 'BATSMAN',      100, 'India'),
    p('pbks-lockie',    'Lockie Ferguson',    'PBKS', 'BOWLER',        100, 'New Zealand'),
    p('pbks-xavier',    'Xavier Bartlett',    'PBKS', 'BOWLER',        100, 'Australia'),
    p('pbks-priyanshu', 'Priyanshu Moliya',   'PBKS', 'ALL_ROUNDER',  100, 'India'),
    p('pbks-praveen',   'Praveen Dubey',      'PBKS', 'BOWLER',       100, 'India'),
    p('pbks-harpreet',  'Harpreet Brar',      'PBKS', 'ALL_ROUNDER',  100, 'India'),
    p('pbks-glenn',     'Glenn Maxwell',      'PBKS', 'ALL_ROUNDER',   100, 'Australia'),

    // ── RAJASTHAN ROYALS ────────────────────────────────────────────────────
    p('rr-sanju',       'Sanju Samson',       'RR', 'WICKET_KEEPER', 1400, 'India'),
    p('rr-yashasvi',    'Yashasvi Jaiswal',   'RR', 'BATSMAN',        600, 'India'),
    p('rr-dhruv',       'Dhruv Jurel',        'RR', 'WICKET_KEEPER', 1400, 'India'),
    p('rr-riyan',       'Riyan Parag',        'RR', 'ALL_ROUNDER',  1475, 'India'),
    p('rr-shimron',     'Shimron Hetmyer',    'RR', 'BATSMAN',        100, 'West Indies'),
    p('rr-jos',         'Jos Buttler',        'RR', 'WICKET_KEEPER', 1000, 'England'),
    p('rr-wanindu',     'Wanindu Hasaranga',  'RR', 'ALL_ROUNDER',   150, 'Sri Lanka'),
    p('rr-maheesh',     'Maheesh Theekshana', 'RR', 'BOWLER',        775, 'Sri Lanka'),
    p('rr-sandeep',     'Sandeep Sharma',     'RR', 'BOWLER',         100, 'India'),
    p('rr-akash-S',     'Akash Madhwal',      'RR', 'BOWLER',         100, 'India'),
    p('rr-tom',         'Tom Kohler-Cadmore', 'RR', 'BATSMAN',        100, 'England'),
    p('rr-kunal',       'Kunal Rathore',      'RR', 'WICKET_KEEPER',  100, 'India'),
    p('rr-fazalhaq',    'Fazalhaq Farooqi',   'RR', 'BOWLER',         100, 'Afghanistan'),
    p('rr-nitish',      'Nitish Rana',        'RR', 'BATSMAN',        400, 'India'),
    p('rr-shubham',     'Shubham Dubey',      'RR', 'ALL_ROUNDER',    100, 'India'),
    p('rr-tushar',      'Tushar Deshpande',   'RR', 'BOWLER',         100, 'India'),
    p('rr-jofra',       'Jofra Archer',       'RR', 'BOWLER',        1700, 'England'),

    // ── SUNRISERS HYDERABAD ─────────────────────────────────────────────────
    p('srh-travis',     'Travis Head',        'SRH', 'BATSMAN',      1400, 'Australia'),
    p('srh-abhishek',   'Abhishek Sharma',    'SRH', 'ALL_ROUNDER',  1400, 'India'),
    p('srh-hein',       'Heinrich Klaasen',   'SRH', 'WICKET_KEEPER', 230, 'South Africa'),
    p('srh-ishan',      'Ishan Kishan',       'SRH', 'WICKET_KEEPER', 1600, 'India'),
    p('srh-pat',        'Pat Cummins',        'SRH', 'BOWLER',       1800, 'Australia'),
    p('srh-jaydev',     'Jaydev Unadkat',     'SRH', 'BOWLER',        100, 'India'),
    p('srh-harshal',    'Harshal Patel',      'SRH', 'BOWLER',        100, 'India'),
    p('srh-adam-zampa', 'Adam Zampa',         'SRH', 'BOWLER',        100, 'Australia'),
    p('srh-zeeshan',    'Zeeshan Ansari',     'SRH', 'BOWLER',        100, 'India'),
    p('srh-kamindu',    'Kamindu Mendis',     'SRH', 'ALL_ROUNDER',   550, 'Sri Lanka'),
    p('srh-atharva',    'Atharva Taide',      'SRH', 'BATSMAN',       100, 'India'),
    p('srh-aniket',     'Aniket Verma',       'SRH', 'BATSMAN',       100, 'India'),
    p('srh-simarjeet',  'Simarjeet Singh',    'SRH', 'BOWLER',        100, 'India'),
    p('srh-rahul-c',    'Rahul Chahar',       'SRH', 'BOWLER',        375, 'India'),
    p('srh-sachin',     'Sachin Baby',        'SRH', 'BATSMAN',       100, 'India'),
    p('srh-eshan',      'Eshan Malinga',      'SRH', 'BOWLER',        100, 'Sri Lanka'),
    p('srh-hathawar',   'Brydon Carse',       'SRH', 'ALL_ROUNDER',   500, 'England'),

    // ── GUJARAT TITANS ──────────────────────────────────────────────────────
    p('gt-shubman',     'Shubman Gill',       'GT', 'BATSMAN',       1925, 'India'),
    p('gt-rashid',      'Rashid Khan',        'GT', 'BOWLER',        1500, 'Afghanistan'),
    p('gt-david',       'David Miller',       'GT', 'BATSMAN',        100, 'South Africa'),
    p('gt-jos2',        'Jos Buttler',        'GT', 'WICKET_KEEPER',  100, 'England'), // check team
    p('gt-sai-sudharsan','Sai Sudharsan',     'GT', 'BATSMAN',        100, 'India'),
    p('gt-shahrukh',    'Shahrukh Khan',      'GT', 'BATSMAN',        100, 'India'),
    p('gt-wriddhiman',  'Wriddhiman Saha',    'GT', 'WICKET_KEEPER',  100, 'India'),
    p('gt-mohit2',      'Mohit Sharma',       'GT', 'BOWLER',         200, 'India'),
    p('gt-jayant',      'Jayant Yadav',       'GT', 'ALL_ROUNDER',    100, 'India'),
    p('gt-alzarri',     'Alzarri Joseph',     'GT', 'BOWLER',         200, 'West Indies'),
    p('gt-kumar-k',     'Kumar Kushagra',     'GT', 'WICKET_KEEPER',  200, 'India'),
    p('gt-dasun',       'Dasun Shanaka',      'GT', 'ALL_ROUNDER',    100, 'Sri Lanka'),
    p('gt-nishant',     'Nishant Sindhu',     'GT', 'ALL_ROUNDER',    100, 'India'),
    p('gt-manav',       'Manav Suthar',       'GT', 'BOWLER',         100, 'India'),
    p('gt-ish-sodhi',   'Ish Sodhi',          'GT', 'BOWLER',         100, 'New Zealand'),
    p('gt-rahul-tewatia','Rahul Tewatia',     'GT', 'ALL_ROUNDER',   1500, 'India'),
    p('gt-anuj',        'Anuj Rawat',         'GT', 'WICKET_KEEPER',  100, 'India'),
    p('gt-kagiso2',     'Gerald Coetzee',     'GT', 'BOWLER',         100, 'South Africa'),

    // ── LUCKNOW SUPER GIANTS ────────────────────────────────────────────────
    p('lsg-rishabh2',   'Rishabh Pant',       'LSG', 'WICKET_KEEPER',2700, 'India'),
    p('lsg-nicholas',   'Nicholas Pooran',    'LSG', 'WICKET_KEEPER', 1600, 'West Indies'),
    p('lsg-david-m',    'David Miller',       'LSG', 'BATSMAN',        100, 'South Africa'),
    p('lsg-aiden',      'Aiden Markram',      'LSG', 'ALL_ROUNDER',    100, 'South Africa'),
    p('lsg-rishi',      'Rishi Dhawan',       'LSG', 'ALL_ROUNDER',    100, 'India'),
    p('lsg-mitchell-m', 'Mitchell Marsh',     'LSG', 'ALL_ROUNDER',   100, 'Australia'),
    p('lsg-avesh',      'Avesh Khan',         'LSG', 'BOWLER',         225, 'India'),
    p('lsg-yash-thakur','Yash Thakur',        'LSG', 'BOWLER',         100, 'India'),
    p('lsg-shamar',     'Shamar Joseph',      'LSG', 'BOWLER',         900, 'West Indies'),
    p('lsg-aryan-juyal','Aryan Juyal',        'LSG', 'WICKET_KEEPER',  100, 'India'),
    p('lsg-mayank-yadav','Mayank Yadav',      'LSG', 'BOWLER',        1100, 'India'),
    p('lsg-m-ali2',     'Moeen Ali',          'LSG', 'ALL_ROUNDER',    100, 'England'),
    p('lsg-akash-deep2','Akash Deep',         'LSG', 'BOWLER',         100, 'India'),
    p('lsg-himmat',     'Himmat Singh',       'LSG', 'BATSMAN',        100, 'India'),
    p('lsg-digvijay',   'Digvijay Deshmukh',  'LSG', 'BOWLER',         100, 'India'),
    p('lsg-arshin',     'Arshin Kulkarni',    'LSG', 'ALL_ROUNDER',    100, 'India'),
    p('lsg-prince',     'Prince Yadav',       'LSG', 'BATSMAN',        100, 'India'),
    p('lsg-shahbaz',    'Shahbaz Ahmed',      'LSG', 'ALL_ROUNDER',    100, 'India'),
  ];
}
