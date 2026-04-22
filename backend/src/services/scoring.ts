export interface RawStats {
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  wickets: number;
  economy: number;
  catches: number;
  runOuts: number;
  stumpings: number;
  maidens: number;
  lbwBowled: number;
  didPlay: boolean;
  dismissed: boolean;
}

export function calculatePoints(stats: RawStats): number {
  let pts = 0;

  if (stats.didPlay) pts += 4;

  // Batting
  pts += stats.runs;
  pts += stats.fours;
  pts += stats.sixes * 2;
  if (stats.runs >= 100) pts += 16;
  else if (stats.runs >= 50) pts += 8;
  else if (stats.runs >= 30) pts += 4;
  if (stats.dismissed && stats.runs === 0) pts -= 2;

  // Bowling
  pts += stats.wickets * 25;
  if (stats.wickets >= 5) pts += 16;
  else if (stats.wickets >= 4) pts += 8;
  pts += stats.maidens * 12;
  pts += stats.lbwBowled * 8;

  // Fielding
  pts += stats.catches * 8;
  if (stats.catches >= 3) pts += 4;
  pts += stats.stumpings * 12;
  pts += stats.runOuts * 6;

  return pts;
}

export function applyMultiplier(points: number, isCaptain: boolean, isViceCaptain: boolean): number {
  if (isCaptain) return Math.round(points * 2);
  if (isViceCaptain) return Math.round(points * 1.5);
  return points;
}
