import express from 'express';
import { router } from './routes';
import { defaultLimiter } from './middleware/rate-limiter';

export function createApp() {
  const app = express();

  app.use(express.json());
  app.use(defaultLimiter);
  app.use(router);

  return app;
}

export { authenticate, authorize, parentReadOnly, signToken, verifyToken } from './middleware/auth';
export type { JwtPayload, UserRole } from './middleware/auth';
export { defaultLimiter, authLimiter } from './middleware/rate-limiter';
export { createWsServer } from './ws/ws-server';
export type { WsMessageType, WsIncomingMessage, WsOutgoingMessage, WsServerOptions } from './ws/ws-server';
export { ConnectionManager } from './ws/connection-manager';
export type { TrackedConnection } from './ws/connection-manager';

// Start server when run directly
if (require.main === module) {
  const port = process.env.PORT || 3000;
  const app = createApp();
  app.listen(port, () => {
    console.log(`API Gateway listening on port ${port}`);
  });
}
