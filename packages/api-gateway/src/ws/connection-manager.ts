import WebSocket from 'ws';

export interface TrackedConnection {
  ws: WebSocket;
  childId: string;
  connectedAt: number;
  lastPong: number;
}

const HEARTBEAT_INTERVAL_MS = 30_000;
const HEARTBEAT_TIMEOUT_MS = 10_000;

/**
 * Manages active WebSocket connections.
 * Tracks connections by childId, runs ping/pong heartbeat,
 * and cleans up stale connections.
 */
export class ConnectionManager {
  private connections = new Map<string, TrackedConnection>();
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  /** Register a new authenticated connection. Closes any existing connection for the same childId. */
  add(childId: string, ws: WebSocket): TrackedConnection {
    const existing = this.connections.get(childId);
    if (existing && existing.ws.readyState === WebSocket.OPEN) {
      existing.ws.close(4001, 'Replaced by new connection');
    }

    const tracked: TrackedConnection = {
      ws,
      childId,
      connectedAt: Date.now(),
      lastPong: Date.now(),
    };

    this.connections.set(childId, tracked);
    return tracked;
  }

  /** Remove a connection by childId. */
  remove(childId: string): void {
    this.connections.delete(childId);
  }

  /** Get a tracked connection by childId. */
  get(childId: string): TrackedConnection | undefined {
    return this.connections.get(childId);
  }

  /** Number of active connections. */
  get size(): number {
    return this.connections.size;
  }

  /** Start the heartbeat interval that pings all connections and terminates stale ones. */
  startHeartbeat(): void {
    if (this.heartbeatTimer) return;

    this.heartbeatTimer = setInterval(() => {
      const now = Date.now();
      for (const [childId, conn] of this.connections) {
        if (now - conn.lastPong > HEARTBEAT_INTERVAL_MS + HEARTBEAT_TIMEOUT_MS) {
          conn.ws.terminate();
          this.connections.delete(childId);
          continue;
        }
        if (conn.ws.readyState === WebSocket.OPEN) {
          conn.ws.ping();
        }
      }
    }, HEARTBEAT_INTERVAL_MS);
  }

  /** Stop the heartbeat interval. */
  stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /** Close all connections and stop heartbeat. */
  shutdown(): void {
    this.stopHeartbeat();
    for (const [, conn] of this.connections) {
      conn.ws.close(1001, 'Server shutting down');
    }
    this.connections.clear();
  }
}
