import express from 'express';
import { router } from '../routes';
import { signToken } from '../middleware/auth';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(router);
  return app;
}

// Inline supertest-like helper using node http
import http from 'http';

function request(app: express.Express) {
  const server = http.createServer(app);

  function makeRequest(method: string, path: string, token?: string) {
    return new Promise<{ status: number; body: Record<string, unknown> }>((resolve, reject) => {
      server.listen(0, () => {
        const addr = server.address() as { port: number };
        const options: http.RequestOptions = {
          hostname: '127.0.0.1',
          port: addr.port,
          path,
          method,
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        };
        const req = http.request(options, (res) => {
          let data = '';
          res.on('data', (chunk) => (data += chunk));
          res.on('end', () => {
            server.close();
            try {
              resolve({ status: res.statusCode!, body: JSON.parse(data) });
            } catch {
              resolve({ status: res.statusCode!, body: {} });
            }
          });
        });
        req.on('error', (err) => { server.close(); reject(err); });
        req.end();
      });
    });
  }

  return {
    get: (path: string, token?: string) => makeRequest('GET', path, token),
    post: (path: string, token?: string) => makeRequest('POST', path, token),
    put: (path: string, token?: string) => makeRequest('PUT', path, token),
  };
}

const childToken = signToken({ userId: 'child-1', role: 'child' });
const parentToken = signToken({ userId: 'parent-1', role: 'parent' });

describe('API Gateway Routes', () => {
  it('GET /health should return ok without auth', async () => {
    const res = await request(buildApp()).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('POST /api/homework/sessions should require auth', async () => {
    const res = await request(buildApp()).post('/api/homework/sessions');
    expect(res.status).toBe(401);
  });

  it('POST /api/homework/sessions should allow child', async () => {
    const res = await request(buildApp()).post('/api/homework/sessions', childToken);
    expect(res.status).toBe(200);
  });

  it('POST /api/homework/sessions should deny parent', async () => {
    const res = await request(buildApp()).post('/api/homework/sessions', parentToken);
    expect(res.status).toBe(403);
  });

  it('GET /api/profiles/:childId should allow parent (read-only)', async () => {
    const res = await request(buildApp()).get('/api/profiles/child-1', parentToken);
    expect(res.status).toBe(200);
  });

  it('GET /api/profiles/:childId should allow child', async () => {
    const res = await request(buildApp()).get('/api/profiles/child-1', childToken);
    expect(res.status).toBe(200);
  });

  it('GET /api/notifications should allow parent', async () => {
    const res = await request(buildApp()).get('/api/notifications', parentToken);
    expect(res.status).toBe(200);
  });

  it('GET /api/notifications should deny child', async () => {
    const res = await request(buildApp()).get('/api/notifications', childToken);
    expect(res.status).toBe(403);
  });

  it('GET /api/reports/:childId should allow parent', async () => {
    const res = await request(buildApp()).get('/api/reports/child-1', parentToken);
    expect(res.status).toBe(200);
  });

  it('PUT /api/settings/:childId should allow parent', async () => {
    const res = await request(buildApp()).put('/api/settings/child-1', parentToken);
    expect(res.status).toBe(200);
  });
});
