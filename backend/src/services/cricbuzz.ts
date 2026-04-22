import axios from 'axios';
import { config } from '../config';

const api = axios.create({
  baseURL: config.cricbuzzBase,
  headers: {
    'X-RapidAPI-Key': config.rapidApiKey,
    'X-RapidAPI-Host': 'cricbuzz-cricket.p.rapidapi.com',
  },
});

export interface CricbuzzMatch {
  matchId: number;
  seriesId: number;
  seriesName: string;
  matchDesc: string;
  team1: { teamId: number; teamName: string; teamSName: string };
  team2: { teamId: number; teamName: string; teamSName: string };
  status: string;
  matchFormat: string;
  startDate: string;
  venue: { id: number; name: string; city: string };
}

export interface CricbuzzPlayerStats {
  batting?: {
    innings: number;
    runs: number;
    avg: number;
    strikeRate: number;
    hundreds: number;
    fifties: number;
  };
  bowling?: {
    innings: number;
    wickets: number;
    economy: number;
    avg: number;
    bestInnings: string;
  };
}

export async function getIPLSeriesMatches(seriesId: number): Promise<CricbuzzMatch[]> {
  try {
    const res = await api.get(`/series/v1/${seriesId}/matches`);
    const types = res.data?.matchDetails || [];
    const matches: CricbuzzMatch[] = [];
    for (const type of types) {
      for (const item of type.matchDetailsMap?.match || []) {
        matches.push(item.matchInfo);
      }
    }
    return matches;
  } catch (err) {
    console.error('[Cricbuzz] getIPLSeriesMatches error:', err);
    return [];
  }
}

export async function getLiveMatches(): Promise<CricbuzzMatch[]> {
  try {
    const res = await api.get('/matches/v1/live');
    const types = res.data?.typeMatches || [];
    const matches: CricbuzzMatch[] = [];
    for (const type of types) {
      for (const series of type.seriesMatches || []) {
        for (const match of series.seriesAdWrapper?.matches || []) {
          if (match.matchInfo.seriesName?.toLowerCase().includes('ipl')) {
            matches.push(match.matchInfo);
          }
        }
      }
    }
    return matches;
  } catch (err) {
    console.error('[Cricbuzz] getLiveMatches error:', err);
    return [];
  }
}

export async function getMatchScorecard(matchId: number): Promise<Record<string, unknown> | null> {
  try {
    const res = await api.get(`/mcenter/v1/${matchId}/scorecard`);
    return res.data || null;
  } catch (err) {
    console.error('[Cricbuzz] getMatchScorecard error:', err);
    return null;
  }
}

export async function getPlayerStats(playerId: number): Promise<CricbuzzPlayerStats | null> {
  try {
    const res = await api.get(`/stats/v1/player/${playerId}`);
    return res.data || null;
  } catch (err) {
    console.error('[Cricbuzz] getPlayerStats error:', err);
    return null;
  }
}

export async function searchPlayers(name: string): Promise<Array<{ id: number; name: string; teamName: string }>> {
  try {
    const res = await api.get('/players/v1/search', { params: { plrN: name } });
    return res.data?.player || [];
  } catch (err) {
    console.error('[Cricbuzz] searchPlayers error:', err);
    return [];
  }
}
