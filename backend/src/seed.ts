import { prisma } from './lib/prisma';
import axios from 'axios';

// Run: npm run db:seed
// Seeds IPL 2025 players via the /players/seed endpoint (no API key needed)
async function main() {
  const res = await axios.post('http://localhost:4000/api/players/seed', {}, {
    headers: { Authorization: `Bearer ${process.env.SEED_TOKEN}` },
  });
  console.log('Seeded:', res.data);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
