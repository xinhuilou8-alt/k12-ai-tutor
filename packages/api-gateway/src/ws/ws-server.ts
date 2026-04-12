import { Server as HttpServer } from 'http';
import WebSocket, { WebSocketServer, RawData } from 'ws';
import { URL } from 'url';
import { verifyToken, JwtPayload } from '../middleware/auth';
import { ConnectionManager } from './connection-manager';

export type WsMessageType = 'audio_stream' | 'dialogue' | 'heartbeat';

export interface WsIncomingMessage {
  type: WsMessageType;
  payload?: unknown;
  /** JWT token — used for auth-via-first-message when query param is absent. */
  token?: string;
}

export interface WsOutgoingMessage {
  type: string;
  payload?: unknown;
  error?: string;
}

export interface WsServerOptions {
  /** Path the WebSocket server listens on. Default: /ws */
  path?: string;
}

/**
 * Creates a WebSocket server attached to an existing HTTP server.
 *
 * Authentication: clients provide a JWT either as `?token=<jwt>` query param
 * on the upgrade URL, or in the `token` field of the first JSON message.
 *
 * Supported message types: audio_stream, dialogue, heartbeat.
 */
export function createWsServer(
  httpServer: HttpServer,
  options: WsServerOptions = {},
): { wss: WebSocketServer; connections: ConnectionManager } {
  const wsPath = options.path ?? '/ws';
  const connections = new ConnectionManager();

  const wss = new WebSocketServer({ noServer: true });

  // --- Upgrade handling (auth via query param) ---
  httpServer.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url ?? '', `http://${req.headers.host ?? 'localhost'}`);

    if (url.pathname !== wsPath) {
      socket.destroy();
      return;
    }

    const token = url.searchParams.get('token');
    if (token) {
      try {
        const user = verifyToken(token);
        (req as any).__user = user;
      } catch {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req);
    });
  });

  // --- Connection handling ---
  wss.on('connection', (ws: WebSocket, req: any) => {
    const user: JwtPayload | undefined = req.__user;

    if (user) {
      setupAuthenticatedConnection(ws, user, connections);
    } else {
      // Auth via first message — give client 5s to authenticate
      setupPendingAuth(ws, connections);
    }
  });

  connections.startHeartbeat();

  return { wss, connections };
}

// ---- Internal helpers ----

function setupAuthenticatedConnection(
  ws: WebSocket,
  user: JwtPayload,
  connections: ConnectionManager,
): void {
  const tracked = connections.add(user.userId, ws);

  ws.on('pong', () => {
    tracked.lastPong = Date.now();
  });

  ws.on('message', (raw) => {
    handleMessage(ws, raw, user);
  });

  ws.on('close', () => {
    connections.remove(user.userId);
  });

  sendJson(ws, { type: 'connected', payload: { childId: user.userId } });
}

function setupPendingAuth(ws: WebSocket, connections: ConnectionManager): void {
  const authTimeout = setTimeout(() => {
    sendJson(ws, { type: 'error', error: 'Authentication timeout' });
    ws.close(4000, 'Authentication timeout');
  }, 5_000);

  const onFirstMessage = (raw: RawData) => {
    clearTimeout(authTimeout);
    ws.off('message', onFirstMessage);

    let msg: WsIncomingMessage;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      sendJson(ws, { type: 'error', error: 'Invalid JSON' });
      ws.close(4002, 'Invalid JSON');
      return;
    }

    if (!msg.token) {
      sendJson(ws, { type: 'error', error: 'Missing token in first message' });
      ws.close(4000, 'Missing token');
      return;
    }

    let user: JwtPayload;
    try {
      user = verifyToken(msg.token);
    } catch {
      sendJson(ws, { type: 'error', error: 'Invalid or expired token' });
      ws.close(4003, 'Invalid token');
      return;
    }

    setupAuthenticatedConnection(ws, user, connections);

    // Process the first message payload if it has a type beyond auth
    if (msg.type) {
      handleMessage(ws, raw, user);
    }
  };

  ws.on('message', onFirstMessage);
}

const VALID_TYPES: Set<WsMessageType> = new Set(['audio_stream', 'dialogue', 'heartbeat']);

function handleMessage(ws: WebSocket, raw: RawData, user: JwtPayload): void {
  let msg: WsIncomingMessage;
  try {
    msg = JSON.parse(raw.toString());
  } catch {
    sendJson(ws, { type: 'error', error: 'Invalid JSON' });
    return;
  }

  if (!msg.type || !VALID_TYPES.has(msg.type)) {
    sendJson(ws, { type: 'error', error: `Unknown message type: ${msg.type}` });
    return;
  }

  if (msg.type === 'heartbeat') {
    sendJson(ws, { type: 'heartbeat', payload: { ts: Date.now() } });
    return;
  }

  // audio_stream and dialogue are acknowledged; actual processing is delegated upstream.
  sendJson(ws, { type: `${msg.type}_ack`, payload: { childId: user.userId, received: Date.now() } });
}

function sendJson(ws: WebSocket, msg: WsOutgoingMessage): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}
