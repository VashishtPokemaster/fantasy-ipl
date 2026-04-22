import { Player } from '../types';

const roleColors: Record<string, string> = {
  BATSMAN: 'bg-blue-600',
  BOWLER: 'bg-green-600',
  ALL_ROUNDER: 'bg-purple-600',
  WICKET_KEEPER: 'bg-yellow-600',
};

const roleLabels: Record<string, string> = {
  BATSMAN: 'BAT',
  BOWLER: 'BOWL',
  ALL_ROUNDER: 'AR',
  WICKET_KEEPER: 'WK',
};

interface Props {
  player: Player;
  onClick?: () => void;
  selected?: boolean;
  owned?: boolean;
  showPrice?: boolean;
  purchasePrice?: number;
  isCaptain?: boolean;
  isViceCaptain?: boolean;
}

export default function PlayerCard({
  player,
  onClick,
  selected,
  owned,
  showPrice,
  purchasePrice,
  isCaptain,
  isViceCaptain,
}: Props) {
  return (
    <div
      onClick={onClick}
      className={`
        relative rounded-xl border p-4 transition-all cursor-pointer
        ${selected ? 'border-ipl-gold bg-ipl-gold/10' : 'border-ipl-border bg-ipl-card hover:border-gray-500'}
        ${owned ? 'opacity-50 cursor-not-allowed' : ''}
      `}
    >
      {(isCaptain || isViceCaptain) && (
        <span className={`absolute top-2 right-2 text-xs font-bold px-1.5 py-0.5 rounded ${isCaptain ? 'bg-ipl-gold text-black' : 'bg-gray-500 text-white'}`}>
          {isCaptain ? 'C' : 'VC'}
        </span>
      )}

      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-ipl-blue flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
          {player.name.charAt(0)}
        </div>

        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm truncate">{player.name}</p>
          <p className="text-xs text-gray-400">{player.iplTeam}</p>
        </div>

        <div className="flex flex-col items-end gap-1">
          <span className={`text-xs font-bold px-1.5 py-0.5 rounded text-white ${roleColors[player.role]}`}>
            {roleLabels[player.role]}
          </span>
          {showPrice && (
            <span className="text-xs text-ipl-gold font-semibold">
              {purchasePrice ? `₹${purchasePrice}L` : `Base: ₹${player.basePrice}L`}
            </span>
          )}
        </div>
      </div>

      {owned && (
        <div className="absolute inset-0 rounded-xl flex items-center justify-center bg-black/30">
          <span className="text-xs font-bold text-gray-300">Taken</span>
        </div>
      )}
    </div>
  );
}
