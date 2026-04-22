export type PlayerRole = 'BATSMAN' | 'BOWLER' | 'ALL_ROUNDER' | 'WICKET_KEEPER';
export type LeagueMode = 'DRAFT' | 'AUCTION';
export type LeagueStatus = 'SETUP' | 'DRAFTING' | 'AUCTIONING' | 'ACTIVE' | 'COMPLETED';
export type MatchStatus = 'UPCOMING' | 'LIVE' | 'COMPLETED';

export interface User {
  id: string;
  username: string;
  email: string;
}

export interface Player {
  id: string;
  cricApiId?: string;
  name: string;
  iplTeam: string;
  role: PlayerRole;
  basePrice: number;
  imageUrl?: string;
  nationality?: string;
}

export interface PlayerStats {
  id: string;
  playerId: string;
  matchId: string;
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  wickets: number;
  economy: number;
  catches: number;
  points: number;
  match: Match;
}

export interface Match {
  id: string;
  team1: string;
  team2: string;
  venue?: string;
  matchDate: string;
  status: MatchStatus;
  result?: string;
}

export interface TeamPlayer {
  id: string;
  playerId: string;
  memberId: string;
  leagueId: string;
  isCaptain: boolean;
  isViceCaptain: boolean;
  purchasePrice?: number;
  draftRound?: number;
  player: Player;
}

export interface LeagueMember {
  id: string;
  leagueId: string;
  userId: string;
  teamName?: string;
  budgetRemaining: number;
  totalPoints: number;
  draftPosition?: number;
  isReady: boolean;
  user: { id: string; username: string };
  teamPlayers?: TeamPlayer[];
}

export interface AuctionQueueItem {
  id: string;
  leagueId: string;
  playerId: string;
  queueOrder: number;
  status: 'PENDING' | 'ACTIVE' | 'SOLD' | 'UNSOLD';
  soldTo?: string;
  soldPrice?: number;
  player: Player;
}

export interface League {
  id: string;
  name: string;
  mode: LeagueMode;
  status: LeagueStatus;
  maxTeams: number;
  budget: number;
  squadSize: number;
  inviteCode: string;
  commissionerId: string;
  commissioner: { id: string; username: string };
  members: LeagueMember[];
  auctionQueue?: AuctionQueueItem[];
  myMemberId?: string;
  myTeamName?: string;
}
