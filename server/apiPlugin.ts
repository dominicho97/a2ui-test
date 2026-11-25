import type { IncomingMessage, ServerResponse } from 'node:http';

import type { Plugin } from 'vite';

import { handleInvestigate, type ServerEnv } from './investigate';

const ROUTE = '/api/investigate';
const MAX_BODY_BYTES = 6 * 1024 * 1024;

function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('payload too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new Error('invalid json'));
      }
    });
    req.on('error', reject);
  });
}

function send(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

/**
 * Mounts POST /api/investigate on the Vite dev and preview servers.
 * `env` is resolved in vite.config.ts on the server and is never passed to `define`,
 * so the key cannot end up in the client bundle.
 */
export function investigateApiPlugin(env: ServerEnv): Plugin {
  const middleware = (req: IncomingMessage, res: ServerResponse, next: () => void): void => {
    if (!req.url || req.url.split('?')[0] !== ROUTE) {
      next();
      return;
    }
    if (req.method !== 'POST') {
      send(res, 405, { error: 'Method not allowed.' });
      return;
    }
    readJsonBody(req)
      .then((body) => handleInvestigate(body, env))
      .then((result) => send(res, result.status, result.body))
      .catch((e: unknown) => {
        const tooLarge = e instanceof Error && e.message === 'payload too large';
        send(res, tooLarge ? 413 : 400, { error: tooLarge ? 'Payload too large.' : 'Invalid request body.' });
      });
  };

  return {
    name: 'a2ui-test-investigate-api',
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    }
  };
}
