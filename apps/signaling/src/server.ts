import { createSignalingServer } from './createServer.js';
import { env } from './config.js';

const server = createSignalingServer();

server.httpServer.listen(env.PORT, () => {
  server.logger.info({ port: env.PORT }, 'Signaling server listening');
});

export const app = server.app;
export const io = server.io;
export const httpServer = server.httpServer;
export const logger = server.logger;
