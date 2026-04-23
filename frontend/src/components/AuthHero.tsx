import { useState } from 'react';

const PLAYERS = [
  {
    name: 'MS Dhoni',
    team: 'CSK',
    role: 'WK · Batter',
    initials: 'MSD',
    ring: '#F9C12E',
    bg: 'from-yellow-500/20 to-yellow-900/30',
    img: '/players/dhoni.jpg',
  },
  {
    name: 'Virat Kohli',
    team: 'RCB',
    role: 'Batter',
    initials: 'VK',
    ring: '#E03131',
    bg: 'from-red-600/20 to-red-900/30',
    img: 'https://en.wikipedia.org/wiki/Special:FilePath/Virat_Kohli.jpg',
  },
  {
    name: 'Rohit Sharma',
    team: 'MI',
    role: 'Batter',
    initials: 'RS',
    ring: '#1971C2',
    bg: 'from-blue-500/20 to-blue-900/30',
    img: 'https://en.wikipedia.org/wiki/Special:FilePath/Rohit_Sharma.jpg',
  },
  {
    name: 'Shreyas Iyer',
    team: 'PBKS',
    role: 'Batter',
    initials: 'SI',
    ring: '#DD1F26',
    bg: 'from-red-500/20 to-orange-900/30',
    img: '/players/shreyas.jpg',
  },
];

function PlayerCard({ player }: { player: typeof PLAYERS[number] }) {
  const [imgFailed, setImgFailed] = useState(false);

  return (
    <div className={`relative flex flex-col items-center gap-2 p-4 rounded-2xl bg-gradient-to-b ${player.bg} border border-white/10 backdrop-blur-sm hover:scale-105 transition-transform duration-300`}>
      {/* Circular photo */}
      <div
        className="w-24 h-24 rounded-full flex items-center justify-center overflow-hidden flex-shrink-0"
        style={{ boxShadow: `0 0 0 3px ${player.ring}, 0 0 20px ${player.ring}55` }}
      >
        {imgFailed ? (
          <div
            className="w-full h-full flex items-center justify-center text-white font-extrabold text-lg"
            style={{ background: `linear-gradient(135deg, ${player.ring}88, ${player.ring}33)` }}
          >
            {player.initials}
          </div>
        ) : (
          <img
            src={player.img}
            alt={player.name}
            className="w-full h-full object-cover object-top"
            onError={() => setImgFailed(true)}
          />
        )}
      </div>

      {/* Info */}
      <div className="text-center">
        <p className="text-white font-bold text-sm leading-tight">{player.name}</p>
        <span
          className="inline-block mt-1 text-xs font-bold px-2 py-0.5 rounded-full"
          style={{ background: `${player.ring}33`, color: player.ring, border: `1px solid ${player.ring}66` }}
        >
          {player.team}
        </span>
        <p className="text-gray-400 text-xs mt-0.5">{player.role}</p>
      </div>
    </div>
  );
}

export default function AuthHero() {
  return (
    <div className="hidden lg:flex flex-col justify-between h-full p-10 relative overflow-hidden">
      {/* Background glow orbs */}
      <div className="absolute top-0 left-0 w-72 h-72 bg-ipl-gold/5 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2 pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl translate-x-1/3 translate-y-1/3 pointer-events-none" />

      {/* Top: Branding */}
      <div>
        {/* IPL-style logo */}
        <div className="flex items-center gap-3 mb-2">
          {/* Cricket ball SVG */}
          <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="24" cy="24" r="22" fill="url(#ballGrad)" />
            <path d="M8 24C8 24 14 18 24 18S40 24 40 24" stroke="white" strokeWidth="1.5" strokeLinecap="round" opacity="0.5"/>
            <path d="M8 24C8 24 14 30 24 30S40 24 40 24" stroke="white" strokeWidth="1.5" strokeLinecap="round" opacity="0.5"/>
            <path d="M24 2C24 2 18 10 18 24S24 46 24 46" stroke="white" strokeWidth="1.5" strokeLinecap="round" opacity="0.5"/>
            <path d="M24 2C24 2 30 10 30 24S24 46 24 46" stroke="white" strokeWidth="1.5" strokeLinecap="round" opacity="0.5"/>
            <defs>
              <radialGradient id="ballGrad" cx="35%" cy="30%" r="70%">
                <stop offset="0%" stopColor="#F9C12E" />
                <stop offset="100%" stopColor="#B7791F" />
              </radialGradient>
            </defs>
          </svg>

          <div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-3xl font-black tracking-tight text-white">FANTASY</span>
              <span
                className="text-3xl font-black tracking-tight"
                style={{ background: 'linear-gradient(90deg, #F9C12E, #F97316)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}
              >
                IPL
              </span>
            </div>
            <p className="text-xs text-gray-400 tracking-[0.2em] uppercase">Season 2025</p>
          </div>
        </div>

        <h2 className="text-4xl font-extrabold text-white mt-6 leading-tight">
          Pick. Bid.<br />
          <span style={{ background: 'linear-gradient(90deg, #F9C12E, #F97316)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            Dominate.
          </span>
        </h2>
        <p className="text-gray-400 mt-3 text-sm leading-relaxed max-w-xs">
          Build your dream IPL squad through live auctions or snake drafts.
          Compete with friends on real match performance.
        </p>
      </div>

      {/* Middle: Player cards */}
      <div className="grid grid-cols-2 gap-3 my-6">
        {PLAYERS.map((player) => (
          <PlayerCard key={player.name} player={player} />
        ))}
      </div>

      {/* Bottom: Stats strip */}
      <div className="flex gap-6">
        {[
          { value: '220+', label: 'IPL Players' },
          { value: '10', label: 'IPL Teams' },
          { value: 'Live', label: 'Scoring' },
        ].map((stat) => (
          <div key={stat.label}>
            <p className="text-xl font-extrabold text-ipl-gold">{stat.value}</p>
            <p className="text-xs text-gray-500 mt-0.5">{stat.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
