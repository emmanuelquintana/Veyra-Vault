import dotenv from 'dotenv';

dotenv.config();

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 8787),
  clientOrigin: process.env.CLIENT_ORIGIN ?? 'http://127.0.0.1:5173',
  databaseUrl: process.env.DATABASE_URL ?? '',
  directUrl: process.env.DIRECT_URL ?? '',
};

export function assertServerEnv() {
  const missing = Object.entries({
    DATABASE_URL: env.databaseUrl,
  })
    .filter(([, value]) => !value)
    .map(([key]) => key);

  if (missing.length) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}
