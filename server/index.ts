import crypto from 'node:crypto';
import cors from 'cors';
import express, { type ErrorRequestHandler } from 'express';
import { sendError, sendSuccess } from './core/http.js';
import { assertServerEnv, env } from './env.js';
import { prisma } from './prisma.js';
import { accountRouter } from './accounts/account-routes.js';
import { vaultRouter } from './vaults/vault-routes.js';

assertServerEnv();

const app = express();

app.use(
  cors({
    origin: env.clientOrigin,
  }),
);
app.use(express.json({ limit: '1mb' }));
app.use((_, res, next) => {
  res.locals.traceId = crypto.randomUUID();
  next();
});

app.get('/api/v1/health', async (_, res) => {
  try {
    await prisma.vault.count();

    return sendSuccess(res, {
      status: 'ok',
      storage: 'supabase-postgres',
      orm: 'prisma',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Database health check failed.';
    return sendError(res, 500, 'TG_CORE_500', message);
  }
});

app.use('/api/v1/vaults', vaultRouter);
app.use('/api/v1/accounts', accountRouter);

app.use((_, res) => {
  return sendError(res, 404, 'TG_CORE_404', 'Route not found.');
});

const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  const isSyntaxError = error instanceof SyntaxError;
  const status = isSyntaxError ? 400 : 500;
  const code = isSyntaxError ? 'TG_CORE_400' : 'TG_CORE_500';
  const message = error instanceof Error ? error.message : 'Unexpected server error.';

  return sendError(res, status, code, message);
};

app.use(errorHandler);

app.listen(env.port, '127.0.0.1', () => {
  console.log(`API ready on http://127.0.0.1:${env.port}`);
});
