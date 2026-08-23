import 'dotenv/config';
// dotenv è caricato qui — questo file deve essere importato prima di tutto il resto

function required(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required environment variable: ${key}`);
  return val;
}

export const config = {
  port: parseInt(process.env['PORT'] ?? '3000', 10),
  nodeEnv: process.env['NODE_ENV'] ?? 'development',

  db: {
    url: required('DATABASE_URL'),
  },

  // Legacy alias for backward compatibility
  database: {
    url: required('DATABASE_URL'),
  },

  jwt: {
    secret: required('JWT_SECRET'),
    expiresIn: '60m' as const,
    refreshThresholdMinutes: 10,
  },

  bcrypt: {
    costFactor: parseInt(process.env['BCRYPT_COST_FACTOR'] ?? '12', 10),
  },

  rateLimiter: {
    maxAttempts: 5,
    windowMinutes: 5,
    blockMinutes: 3,
  },

  ws: {
    pingIntervalMs: 30_000,
    pongTimeoutMs: 10_000,
  },
};
