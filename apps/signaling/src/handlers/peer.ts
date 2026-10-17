import type { AppContext, AppSocket } from './context.js';
import { leaveCurrentRoom, hashCode } from './room.js';
import { refreshDelaySec } from '../ice.js';

/** Schedules a one-shot ice:refresh before the issued TURN credentials expire. */
export function scheduleIceRefresh(ctx: AppContext, socket: AppSocket, deviceId: string): void {
  if (socket.data.iceTimer) clearTimeout(socket.data.iceTimer);
  const issued = ctx.ice.issue(deviceId);
  const delaySec = refreshDelaySec(issued.turnExpiresAt);
  if (delaySec === undefined) return;
  socket.data.iceTimer = setTimeout(() => {
    if (socket.connected && socket.data.deviceId === deviceId) {
      const refreshed = ctx.ice.issue(deviceId);
      socket.emit('ice:refresh', { iceServers: refreshed.iceServers });
      ctx.logger.debug({ deviceId, code: socket.data.roomId ? hashCode(socket.data.roomId) : undefined }, 'ICE credentials refreshed');
      scheduleIceRefresh(ctx, socket, deviceId);
    }
  }, delaySec * 1000);
  socket.data.iceTimer.unref?.();
}

export function handlePeerEvents(ctx: AppContext, socket: AppSocket): void {
  socket.on('disconnect', () => {
    if (socket.data.iceTimer) clearTimeout(socket.data.iceTimer);
    const deviceId = socket.data.deviceId;
    if (!deviceId) return;
    leaveCurrentRoom(ctx, socket);
    ctx.logger.info({ deviceId }, 'Peer disconnected');
  });
}
