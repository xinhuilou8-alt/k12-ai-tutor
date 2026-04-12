import http from 'http';
import WebSocket from 'ws';
import express from 'express';
import { createWsServer } from '../ws/ws-server';
import { ConnectionManager } from '../ws/connection-manager';
import { signToken } from '../middleware/auth';

let server: http.Server;
let connections: ConnectionManager;
let wss: WebSocket.Server;
const openSockets: WebSocket[] = [];

function getPort(): number {
  const addr = server.address();
  return typeof addr === 'object' && addr ? addr.port : 0;
}

/** Connect and collect the first message (if any) that arrives before or right after open. */
function connectAndWaitFirst(query = ''): Promise<{ ws: WebSocket; firstMsg: any }> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${getPort()}/ws${query}`);
    openSockets.push(ws);
    let firstMsg: any = null;
    let opened = false;

    ws.on('message', (data) => {
      if (!firstMsg) {
        firstMsg = JSON.parse(data.toString());
        if (opened) resolve({ ws, firstMsg });
      }
    });

    ws.on('open', () => {
      opened = true;
      // If we already got a message, resolve immediately
      if (firstMsg) {
        resolve({ ws, firstMsg });
      }
      // Otherwise wait for the message listener above
    });

    ws.on('error', reject);

    // Safety timeout
    setTimeout(() => {
      if (opened && !firstMsg) {
        resolve({ ws, firstMsg: null });
      }
    }, 2000);
  });
}

function connectWs(query = ''): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${getPort()}/ws${query}`);
    openSockets.push(ws);
    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
  });
}

function waitForMessage(ws: WebSocket): Promise<any> {
  return new Promise((resolve) => {
    ws.once('message', (data) => resolve(JSON.parse(data.toString())));
  });
}

function closeWs(ws: WebSocket): Promise<void> {
  return new Promise((resolve) => {
    if (ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) {
      resolve();
      return;
    }
    ws.on('close', () => resolve());
    ws.close();
  });
}

beforeAll((done) => {
  const app = express();
  server = http.createServer(app);
  const result = createWsServer(server);
  wss = result.wss;
  connections = result.connections;
  server.listen(0, done);
});

afterEach(async () => {
  const promises = openSockets.map((ws) => closeWs(ws));
  await Promise.all(promises);
  openSockets.length = 0;
  await new Promise((r) => setTimeout(r, 20));
});

afterAll((done) => {
  connections.shutdown();
  wss.close(() => {
    server.close(done);
  });
});

describe('WebSocket Server - query param auth', () => {
  it('should authenticate via query param token', async () => {
    const token = signToken({ userId: 'child-1', role: 'child' });
    const { ws, firstMsg } = await connectAndWaitFirst(`?token=${token}`);
    expect(firstMsg).not.toBeNull();
    expect(firstMsg.type).toBe('connected');
    expect(firstMsg.payload.childId).toBe('child-1');
  });

  it('should reject invalid query param token', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${getPort()}/ws?token=bad-token`);
    openSockets.push(ws);
    const result = await new Promise<string>((resolve) => {
      ws.on('close', () => resolve('closed'));
      ws.on('error', () => resolve('error'));
    });
    expect(['closed', 'error']).toContain(result);
  });

  it('should handle heartbeat messages after auth', async () => {
    const token = signToken({ userId: 'child-hb', role: 'child' });
    const { ws } = await connectAndWaitFirst(`?token=${token}`);

    ws.send(JSON.stringify({ type: 'heartbeat' }));
    const msg = await waitForMessage(ws);
    expect(msg.type).toBe('heartbeat');
    expect(msg.payload.ts).toBeDefined();
  });

  it('should acknowledge audio_stream messages', async () => {
    const token = signToken({ userId: 'child-audio', role: 'child' });
    const { ws } = await connectAndWaitFirst(`?token=${token}`);

    ws.send(JSON.stringify({ type: 'audio_stream', payload: { data: 'base64...' } }));
    const msg = await waitForMessage(ws);
    expect(msg.type).toBe('audio_stream_ack');
    expect(msg.payload.childId).toBe('child-audio');
  });

  it('should acknowledge dialogue messages', async () => {
    const token = signToken({ userId: 'child-dlg', role: 'child' });
    const { ws } = await connectAndWaitFirst(`?token=${token}`);

    ws.send(JSON.stringify({ type: 'dialogue', payload: { text: 'hello' } }));
    const msg = await waitForMessage(ws);
    expect(msg.type).toBe('dialogue_ack');
  });

  it('should reject unknown message types', async () => {
    const token = signToken({ userId: 'child-unk', role: 'child' });
    const { ws } = await connectAndWaitFirst(`?token=${token}`);

    ws.send(JSON.stringify({ type: 'unknown_type' }));
    const msg = await waitForMessage(ws);
    expect(msg.type).toBe('error');
    expect(msg.error).toContain('Unknown message type');
  });

  it('should reject invalid JSON after auth', async () => {
    const token = signToken({ userId: 'child-json', role: 'child' });
    const { ws } = await connectAndWaitFirst(`?token=${token}`);

    ws.send('not-json');
    const msg = await waitForMessage(ws);
    expect(msg.type).toBe('error');
    expect(msg.error).toContain('Invalid JSON');
  });

  it('should track connections by childId', async () => {
    const token = signToken({ userId: 'child-track', role: 'child' });
    const { ws } = await connectAndWaitFirst(`?token=${token}`);

    const tracked = connections.get('child-track');
    expect(tracked).toBeDefined();
    expect(tracked!.childId).toBe('child-track');
  });

  it('should replace existing connection for same childId', async () => {
    const token = signToken({ userId: 'child-replace', role: 'child' });
    const { ws: ws1 } = await connectAndWaitFirst(`?token=${token}`);

    const ws1ClosePromise = new Promise<void>((resolve) => {
      ws1.on('close', () => resolve());
    });

    const { ws: ws2 } = await connectAndWaitFirst(`?token=${token}`);
    await ws1ClosePromise;
    expect(ws1.readyState).toBe(WebSocket.CLOSED);
  });
});

describe('WebSocket Server - first message auth', () => {
  it('should authenticate via first message token', async () => {
    const ws = await connectWs();
    const token = signToken({ userId: 'child-fm', role: 'child' });
    ws.send(JSON.stringify({ type: 'heartbeat', token }));
    const msg = await waitForMessage(ws);
    expect(msg.type).toBe('connected');
  });

  it('should reject missing token in first message', async () => {
    const ws = await connectWs();
    const closePromise = new Promise<number>((resolve) => {
      ws.on('close', (code) => resolve(code));
    });
    ws.send(JSON.stringify({ type: 'heartbeat' }));
    const code = await closePromise;
    expect(code).toBe(4000);
  });

  it('should reject invalid token in first message', async () => {
    const ws = await connectWs();
    const closePromise = new Promise<number>((resolve) => {
      ws.on('close', (code) => resolve(code));
    });
    ws.send(JSON.stringify({ type: 'heartbeat', token: 'bad-token' }));
    const code = await closePromise;
    expect(code).toBe(4003);
  });
});

describe('ConnectionManager', () => {
  it('should track size correctly', () => {
    const mgr = new ConnectionManager();
    expect(mgr.size).toBe(0);
  });

  it('should add and remove connections', () => {
    const mgr = new ConnectionManager();
    const fakeWs = { readyState: WebSocket.OPEN, close: jest.fn(), on: jest.fn(), ping: jest.fn() } as any;
    mgr.add('c1', fakeWs);
    expect(mgr.size).toBe(1);
    expect(mgr.get('c1')).toBeDefined();
    mgr.remove('c1');
    expect(mgr.size).toBe(0);
  });

  it('should close existing connection when adding duplicate childId', () => {
    const mgr = new ConnectionManager();
    const ws1 = { readyState: WebSocket.OPEN, close: jest.fn(), on: jest.fn(), ping: jest.fn() } as any;
    const ws2 = { readyState: WebSocket.OPEN, close: jest.fn(), on: jest.fn(), ping: jest.fn() } as any;
    mgr.add('c1', ws1);
    mgr.add('c1', ws2);
    expect(ws1.close).toHaveBeenCalledWith(4001, 'Replaced by new connection');
    expect(mgr.size).toBe(1);
    mgr.shutdown();
  });

  it('should start and stop heartbeat', () => {
    const mgr = new ConnectionManager();
    mgr.startHeartbeat();
    mgr.stopHeartbeat();
    // No error means success
    expect(mgr.size).toBe(0);
  });

  it('should shutdown and clear all connections', () => {
    const mgr = new ConnectionManager();
    const fakeWs = { readyState: WebSocket.OPEN, close: jest.fn(), on: jest.fn(), ping: jest.fn() } as any;
    mgr.add('c1', fakeWs);
    mgr.startHeartbeat();
    mgr.shutdown();
    expect(mgr.size).toBe(0);
    expect(fakeWs.close).toHaveBeenCalledWith(1001, 'Server shutting down');
  });
});
