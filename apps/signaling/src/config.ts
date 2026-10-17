import { config } from 'dotenv';
import { z } from 'zod';

config();

const envSchema = z.object({
  PORT: z.coerce.number().default(3001),
  CORS_ORIGINS: z.string().default('http://localhost:5173'),
  STUN_URLS: z.string().default('stun:stun.l.google.com:19302'),
  TURN_URLS: z.string().default(''),
  TURN_SECRET: z.string().default(''),
  TURN_TTL_SECONDS: z.coerce.number().default(3600),
  ICE_SERVERS_JSON: z.string().default(''),
  ROOM_TTL_DEFAULT_SEC: z.coerce.number().default(600),
  MAX_PEERS: z.coerce.number().default(8),
  METRICS_TOKEN: z.string().default(''),
  LOG_LEVEL: z.string().default('info'),
  REDIS_URL: z.string().default(''),
});

export const env = envSchema.parse(process.env);
export type EnvConfig = typeof env;
