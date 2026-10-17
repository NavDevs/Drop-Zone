import {
  ErrorCode,
  SignalPayloadSchema,
  MAX_SIGNAL_PAYLOAD_SIZE,
} from '@dropzone/protocol';
import type { AppContext, AppSocket } from './context.js';
import { hashCode } from './room.js';

export function handleSignalEvents(ctx: AppContext, socket: AppSocket): void {
  socket.on('signal', async (payload: unknown, ack: (res: unknown) => void) => {
    const fail = (code: (typeof ErrorCode)[keyof typeof ErrorCode], message: string): void => {
      ack({ error: { code, message } });
    };
    try {
      const deviceId = socket.data.deviceId;
      const roomCode = socket.data.roomId;
      if (!deviceId || !roomCode) {
        fail(ErrorCode.NOT_IN_ROOM, 'Not in a room');
        return;
      }
      const parsed = SignalPayloadSchema.safeParse(payload);
      if (!parsed.success) {
        fail(ErrorCode.INVALID_PAYLOAD, 'Invalid signal payload');
        return;
      }
      const { to, kind, data } = parsed.data;
      // enforce 16 KB payload cap on the serialized relayed data
      let serialized: string;
      try {
        serialized = JSON.stringify(data ?? null);
      } catch {
        fail(ErrorCode.INVALID_PAYLOAD, 'Signal data is not serializable');
        return;
      }
      if (serialized.length > MAX_SIGNAL_PAYLOAD_SIZE) {
        fail(ErrorCode.INVALID_PAYLOAD, `Signal payload exceeds ${MAX_SIGNAL_PAYLOAD_SIZE} bytes`);
        return;
      }
      const limit = await ctx.limits.trySignal(socket.id);
      if (!limit.allowed) {
        ctx.metrics.rateLimitedTotal.inc({ limiter: limit.limiter ?? 'signal' });
        fail(ErrorCode.RATE_LIMITED, 'Too many signals; slow down');
        return;
      }
      const room = ctx.store.getByCode(roomCode);
      if (!room) {
        fail(ErrorCode.NOT_IN_ROOM, 'Room no longer exists');
        return;
      }
      ctx.store.touch(room);
      const target = room.peers.get(to);
      if (!target || target.info.deviceId === deviceId) {
        fail(ErrorCode.PEER_NOT_FOUND, 'Recipient is not in this room');
        return;
      }
      ctx.io.to(target.socketId).emit('signal', { from: deviceId, kind, data });
      ctx.metrics.signalsRelayedTotal.inc();
      ack({});
    } catch (err) {
      ctx.logger.error({ err, code: socket.data.roomId ? hashCode(socket.data.roomId) : undefined }, 'signal failed');
      fail(ErrorCode.INTERNAL, 'Internal error');
    }
  });
}
