import type { IncomingMessage, ServerResponse } from 'node:http';
import app from '../server/app.js';

type VercelRequest = IncomingMessage & {
  query?: Record<string, string | string[]>;
  url?: string;
};

function getPathParam(path: string | string[] | undefined) {
  if (Array.isArray(path)) {
    return path.join('/');
  }

  return path ?? '';
}

export default function handler(req: VercelRequest, res: ServerResponse) {
  const originalUrl = new URL(req.url ?? '/', 'http://localhost');
  const path = getPathParam(req.query?.path);

  originalUrl.searchParams.delete('path');
  req.url = `/api/${path}${originalUrl.search}`;

  return app(req, res);
}
