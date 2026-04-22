import axios from 'axios';
import { config } from '../config';

const api = axios.create({ baseURL: config.cricApiBase });

function params(extra: Record<string, string | number> = {}) {
  return { apikey: config.cricApiKey, ...extra };
}

export interface CricApiMatch {
  id: string;
  name: string;
  status: string;
  venue: string;
  date: string;
  dateTimeGMT: string;
  teams: string[];
  teamInfo?: Array<{ name: string; shortname: string; img: string }>;
  score?: Array<{ r: number; w: number; o: number; inning: string }>;
  series_id?: string;
  matchType: string;
}

export interface CricApiPlayer {
  id: string;
  name: string;
  country: string;
  playerRole: string;
}

export async function getIPLMatches(): Promise<CricApiMatch[]> {
  try {
    const res = await api.get('/currentMatches', { params: params({ offset: 0 }) });
    const all: CricApiMatch[] = res.data?.data || [];
    return all.filter(
      (m) => m.matchType === 'T20' && (m.name.toLowerCase().includes('ipl') || m.series_id === process.env.IPL_SERIES_ID)
    );
  } catch (err) {
    console.error('[CricAPI] getIPLMatches error:', err);
    return [];
  }
}

export async function getMatchScorecard(matchId: string): Promise<Record<string, unknown> | null> {
  try {
    const res = await api.get('/match_scorecard', { params: params({ id: matchId }) });
    return res.data?.data || null;
  } catch (err) {
    console.error('[CricAPI] getMatchScorecard error:', err);
    return null;
  }
}

export async function searchPlayer(name: string): Promise<CricApiPlayer[]> {
  try {
    const res = await api.get('/players', { params: params({ search: name, offset: 0 }) });
    return res.data?.data || [];
  } catch (err) {
    console.error('[CricAPI] searchPlayer error:', err);
    return [];
  }
}

export async function getPlayerStats(cricApiId: string): Promise<Record<string, unknown> | null> {
  try {
    const res = await api.get('/players_info', { params: params({ id: cricApiId }) });
    return res.data?.data || null;
  } catch (err) {
    console.error('[CricAPI] getPlayerStats error:', err);
    return null;
  }
}

export async function getLiveScores(): Promise<CricApiMatch[]> {
  try {
    const res = await api.get('/cricScore', { params: params() });
    return res.data?.data || [];
  } catch (err) {
    console.error('[CricAPI] getLiveScores error:', err);
    return [];
  }
}
