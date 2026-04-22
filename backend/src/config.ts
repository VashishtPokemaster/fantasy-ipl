import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '4000'),
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-in-production',
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  cricApiKey: process.env.CRICAPI_KEY || '',
  rapidApiKey: process.env.RAPIDAPI_KEY || '',
  cricApiBase: 'https://api.cricapi.com/v1',
  cricbuzzBase: 'https://cricbuzz-cricket.p.rapidapi.com',
};
