import axios from 'axios';

const BASE = import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/api` : '/api';
export const api = axios.create({ baseURL: BASE });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

// Auth
export const authApi = {
  register: (data: { username: string; email: string; password: string }) =>
    api.post('/auth/register', data),
  login: (data: { email: string; password: string }) =>
    api.post('/auth/login', data),
  me: () => api.get('/auth/me'),
};

// Leagues
export const leagueApi = {
  create: (data: object) => api.post('/leagues', data),
  join: (data: { inviteCode: string; teamName: string }) => api.post('/leagues/join', data),
  list: () => api.get('/leagues'),
  get: (id: string) => api.get(`/leagues/${id}`),
  ready: (id: string) => api.post(`/leagues/${id}/ready`),
  setAuctionQueue: (id: string, playerIds: string[]) =>
    api.post(`/leagues/${id}/set-auction-queue`, { playerIds }),
  randomizeDraftOrder: (id: string) => api.post(`/leagues/${id}/set-draft-order`),
};

// Players
export const playerApi = {
  list: (params?: object) => api.get('/players', { params }),
  get: (id: string) => api.get(`/players/${id}`),
  seed: () => api.post('/players/seed'),
  syncIds: () => api.post('/players/sync-ids'),
};

// Teams
export const teamApi = {
  get: (leagueId: string) => api.get(`/teams/${leagueId}`),
  setCaptain: (leagueId: string, data: { captainPlayerId: string; viceCaptainPlayerId: string }) =>
    api.patch(`/teams/${leagueId}/captain`, data),
  leaderboard: (leagueId: string) => api.get(`/teams/${leagueId}/leaderboard`),
};

// Stats
export const statsApi = {
  live: () => api.get('/stats/live'),
  player: (id: string) => api.get(`/stats/player/${id}`),
};
