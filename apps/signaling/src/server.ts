import { createSignalingServer } from './createServer.js';
import { env } from './config.js';

const server = createSignalingServer();

server.httpServer.listen(env.PORT, '0.0.0.0', () => {
  server.logger.info({ port: env.PORT, host: '0.0.0.0' }, 'Signaling server listening');
});

export const app = server.app;
export const io = server.io;
export const httpServer = server.httpServer;
export const logger = server.logger;
