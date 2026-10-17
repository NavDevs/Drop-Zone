import { createHash } from 'node:crypto';
import {
  ErrorCode,
  RoomCreatePayloadSchema,
  RoomJoinPayloadSchema,
  RoomApprovePayloadSchema,
  DeviceUpdatePayloadSchema,
  MAX_PEERS_PER_ROOM,
  type ProtocolError,
} from '@dropzone/protocol';
import type { AppContext, AppSocket, ServerToClientEvents } from './context.js';
import { CLOSE_REASON_TEXT, type Room, type RoomCloseReason } from '../rooms/RoomStore.js';

function ackError(code: ProtocolError['code'], message: string): { error: ProtocolError } {
  return { error: { code, message } };
}

function hashCode(code: string): string {
  // non-reversible log fingerprint per TRD §13: sha256, first 8 hex chars
  return createHash('sha256').update(code).digest('hex').slice(0, 8);
}

function broadcastRoom<E extends keyof ServerToClientEvents>(
  ctx: AppContext,
  room: Room,
  event: E,
  payload: Parameters<ServerToClientEvents[E]>[0],
  exceptSocketId?: string,
): void {
  type Emit = (e: E, p: Parameters<ServerToClientEvents[E]>[0]) => void;
  for (const peer of room.peers.values()) {
    if (peer.socketId !== exceptSocketId) {
      (ctx.io.to(peer.socketId).emit as Emit)(event, payload);
    }
  }
}

/**
 * Clears room membership state on a live socket so it can join/create again,
 * and drops its Socket.IO room channel membership.
 */
export function releaseSocket(io: AppContext['io'], roomCode: string, socketId: string): void {
  const s = io.sockets.sockets.get(socketId);
  if (!s) return;
  s.data.deviceId = undefined;
  s.data.deviceName = undefined;
  s.data.roomId = undefined;
  if (s.data.iceTimer) {
    clearTimeout(s.data.iceTimer);
    s.data.iceTimer = undefined;
  }
  void s.leave(roomCode);
}

/** Notifies every member (peers + pending) that the room closed and releases their sockets. */
export function notifyRoomClosed(io: AppContext['io'], room: Room, reason: RoomCloseReason): void {
  const reasonText = CLOSE_REASON_TEXT[reason];
  const targets = [...room.peers.values(), ...room.pending.values()];
  for (const target of targets) {
    io.to(target.socketId).emit('room:closed', { reason: reasonText });
    releaseSocket(io, room.code, target.socketId);
  }
}

function roomClosed(ctx: AppContext, room: Room, reason: RoomCloseReason): void {
  notifyRoomClosed(ctx.io, room, reason);
  ctx.logger.info({ code: hashCode(room.code), reason }, 'Room closed');
}

export function closeAndNotify(ctx: AppContext, room: Room, reason: RoomCloseReason): void {
  roomClosed(ctx, room, reason);
  ctx.store.closeRoom(room, reason);
  ctx.metrics.roomsActive.set(ctx.store.size);
}

function leaveCurrentRoom(ctx: AppContext, socket: AppSocket, reason: RoomCloseReason = 'empty'): void {
  const deviceId = socket.data.deviceId;
  if (!deviceId) return;
  const room = ctx.store.getByDevice(deviceId);
  if (!room) {
    socket.data.roomId = undefined;
    socket.data.deviceId = undefined;
    socket.data.deviceName = undefined;
    return;
  }
  const { peer } = ctx.store.removePeer(room, deviceId);
  socket.data.roomId = undefined;
  socket.data.deviceId = undefined;
  socket.data.deviceName = undefined;
  void socket.leave(room.code);
  if (socket.data.iceTimer) {
    clearTimeout(socket.data.iceTimer);
    socket.data.iceTimer = undefined;
  }
  if (peer) {
    broadcastRoom(ctx, room, 'peer:left', { deviceId });
    ctx.logger.info({ deviceId, code: hashCode(room.code) }, 'Peer left');
  }
  if (room.peers.size === 0) {
    closeAndNotify(ctx, room, reason === 'empty' ? 'empty' : reason);
  }
}

export function handleRoomEvents(ctx: AppContext, socket: AppSocket): void {
  const ip = socket.handshake.address ?? 'unknown';

  socket.on('room:create', async (payload: unknown, ack: (res: unknown) => void) => {
    try {
      const parsed = RoomCreatePayloadSchema.safeParse(payload);
      if (!parsed.success) {
        ack(ackError(ErrorCode.INVALID_PAYLOAD, 'Invalid room:create payload'));
        return;
      }
      if (socket.data.deviceId) {
        ack(ackError(ErrorCode.INVALID_PAYLOAD, 'Socket already in a room'));
        return;
      }
      const limit = await ctx.limits.tryRoomCreate(ip);
      if (!limit.allowed) {
        ctx.metrics.rateLimitedTotal.inc({ limiter: limit.limiter ?? 'unknown' });
        ack(ackError(ErrorCode.RATE_LIMITED, 'Too many rooms created; try again later'));
        return;
      }
      const { device, ttlSec, requireApproval } = parsed.data;
      const room = ctx.store.createRoom(device, socket.id, { ttlSec, requireApproval });
      socket.data.deviceId = device.deviceId;
      socket.data.deviceName = device.name;
      socket.data.roomId = room.code;
      socket.join(room.code);
      const issued = ctx.ice.issue(device.deviceId);
      if (issued.turnExpiresAt !== undefined) ctx.metrics.turnCredentialsIssuedTotal.inc();
      ctx.metrics.roomsActive.set(ctx.store.size);
      ctx.admit(socket, device.deviceId);
      ctx.logger.info({ deviceId: device.deviceId, code: hashCode(room.code) }, 'Room created');
      ack({
        code: room.code,
        codeExpiresAt: room.codeExpiresAt,
        iceServers: issued.iceServers,
        peers: [],
      });
    } catch (err) {
      ctx.logger.error({ err }, 'room:create failed');
      ack(ackError(ErrorCode.INTERNAL, 'Internal error'));
    }
  });

  socket.on('room:join', async (payload: unknown, ack: (res: unknown) => void) => {
    try {
      const parsed = RoomJoinPayloadSchema.safeParse(payload);
      if (!parsed.success) {
        ack(ackError(ErrorCode.INVALID_PAYLOAD, 'Invalid room:join payload'));
        ctx.metrics.joinsTotal.inc({ result: 'invalid' });
        return;
      }
      if (socket.data.deviceId) {
        ack(ackError(ErrorCode.INVALID_PAYLOAD, 'Socket already in a room'));
        return;
      }
      const limit = await ctx.limits.tryRoomJoin(ip);
      if (!limit.allowed) {
        ctx.metrics.rateLimitedTotal.inc({ limiter: limit.limiter ?? 'unknown' });
        ctx.metrics.joinsTotal.inc({ result: 'rate-limited' });
        ack(ackError(ErrorCode.RATE_LIMITED, 'Too many join attempts; try again later'));
        return;
      }
      const { code, device } = parsed.data;
      const room = ctx.store.getByCode(code);
      if (!room) {
        await ctx.limits.recordJoinFailure(ip);
        ctx.metrics.joinsTotal.inc({ result: 'not-found' });
        ack(ackError(ErrorCode.ROOM_NOT_FOUND, 'Room not found'));
        return;
      }
      if (!ctx.store.isJoinable(room)) {
        await ctx.limits.recordJoinFailure(ip);
        ctx.metrics.joinsTotal.inc({ result: 'expired' });
        ack(ackError(ErrorCode.ROOM_EXPIRED, 'Room code has expired'));
        return;
      }
      if (!ctx.store.canAcceptPeer(room)) {
        ctx.metrics.joinsTotal.inc({ result: 'full' });
        ack(ackError(ErrorCode.ROOM_FULL, `Room is full (max ${MAX_PEERS_PER_ROOM})`));
        return;
      }

      if (room.requireApproval) {
        ctx.store.addPending(room, device, socket.id);
        socket.data.deviceId = device.deviceId;
        socket.data.deviceName = device.name;
        socket.data.roomId = room.code;
        socket.join(room.code);
        const hostPeer = room.peers.get(room.hostDeviceId);
        if (hostPeer) {
          ctx.io.to(hostPeer.socketId).emit('join:request', { device });
        }
        ctx.metrics.joinsTotal.inc({ result: 'pending' });
        ack({ pending: true as const });
        return;
      }

      ctx.store.addPeer(room, device, socket.id);
      socket.data.deviceId = device.deviceId;
      socket.data.deviceName = device.name;
      socket.data.roomId = room.code;
      socket.join(room.code);
      broadcastRoom(ctx, room, 'peer:joined', { device }, socket.id);
      const issued = ctx.ice.issue(device.deviceId);
      if (issued.turnExpiresAt !== undefined) ctx.metrics.turnCredentialsIssuedTotal.inc();
      ctx.admit(socket, device.deviceId);
      ctx.metrics.joinsTotal.inc({ result: 'ok' });
      ctx.logger.info({ deviceId: device.deviceId, code: hashCode(room.code) }, 'Peer joined');
      ack({
        code: room.code,
        codeExpiresAt: room.codeExpiresAt,
        iceServers: issued.iceServers,
        peers: [...room.peers.values()]
          .filter((p) => p.info.deviceId !== device.deviceId)
          .map((p) => ({ device: p.info, joinedAt: p.joinedAt })),
      });
    } catch (err) {
      ctx.logger.error({ err }, 'room:join failed');
      ack(ackError(ErrorCode.INTERNAL, 'Internal error'));
    }
  });

  socket.on('room:leave', (_payload: unknown, ack: (res: unknown) => void) => {
    try {
      if (!socket.data.deviceId || !socket.data.roomId) {
        ack(ackError(ErrorCode.NOT_IN_ROOM, 'Not in a room'));
        return;
      }
      leaveCurrentRoom(ctx, socket);
      ack({});
    } catch (err) {
      ctx.logger.error({ err }, 'room:leave failed');
      ack(ackError(ErrorCode.INTERNAL, 'Internal error'));
    }
  });

  socket.on('room:close', (_payload: unknown, ack: (res: unknown) => void) => {
    try {
      const deviceId = socket.data.deviceId;
      if (!deviceId) {
        ack(ackError(ErrorCode.NOT_IN_ROOM, 'Not in a room'));
        return;
      }
      const room = ctx.store.getByDevice(deviceId);
      if (!room) {
        ack(ackError(ErrorCode.NOT_IN_ROOM, 'Not in a room'));
        return;
      }
      if (room.hostDeviceId !== deviceId) {
        ack(ackError(ErrorCode.NOT_HOST, 'Only the host can close the room'));
        return;
      }
      closeAndNotify(ctx, room, 'host-closed');
      ack({});
    } catch (err) {
      ctx.logger.error({ err }, 'room:close failed');
      ack(ackError(ErrorCode.INTERNAL, 'Internal error'));
    }
  });

  socket.on('room:regenerate', (_payload: unknown, ack: (res: unknown) => void) => {
    try {
      const deviceId = socket.data.deviceId;
      if (!deviceId) {
        ack(ackError(ErrorCode.NOT_IN_ROOM, 'Not in a room'));
        return;
      }
      const room = ctx.store.getByDevice(deviceId);
      if (!room) {
        ack(ackError(ErrorCode.NOT_IN_ROOM, 'Not in a room'));
        return;
      }
      if (room.hostDeviceId !== deviceId) {
        ack(ackError(ErrorCode.NOT_HOST, 'Only the host can regenerate the code'));
        return;
      }
      const { code, codeExpiresAt } = ctx.store.regenerateCode(room);
      socket.data.roomId = code;
      socket.leave(room.code);
      socket.join(code);
      broadcastRoom(ctx, room, 'room:codeChanged', { code, codeExpiresAt }, socket.id);
      ctx.logger.info({ deviceId, code: hashCode(code) }, 'Room code regenerated');
      ack({ code, codeExpiresAt });
    } catch (err) {
      ctx.logger.error({ err }, 'room:regenerate failed');
      ack(ackError(ErrorCode.INTERNAL, 'Internal error'));
    }
  });

  socket.on('room:approve', async (payload: unknown, ack: (res: unknown) => void) => {
    try {
      const deviceId = socket.data.deviceId;
      if (!deviceId) {
        ack(ackError(ErrorCode.NOT_IN_ROOM, 'Not in a room'));
        return;
      }
      const room = ctx.store.getByDevice(deviceId);
      if (!room) {
        ack(ackError(ErrorCode.NOT_IN_ROOM, 'Not in a room'));
        return;
      }
      if (room.hostDeviceId !== deviceId) {
        ack(ackError(ErrorCode.NOT_HOST, 'Only the host can approve joiners'));
        return;
      }
      const parsed = RoomApprovePayloadSchema.safeParse(payload);
      if (!parsed.success) {
        ack(ackError(ErrorCode.INVALID_PAYLOAD, 'Invalid room:approve payload'));
        return;
      }
      const { deviceId: targetId, allow } = parsed.data;
      if (allow) {
        if (!ctx.store.canAcceptPeer(room)) {
          ack(ackError(ErrorCode.ROOM_FULL, 'Room is full'));
          return;
        }
        const approved = ctx.store.approvePending(room, targetId);
        if (!approved) {
          ack(ackError(ErrorCode.PEER_NOT_FOUND, 'No pending joiner with that deviceId'));
          return;
        }
        // tell the approved socket it is in (self peer:joined), replay roster, send ICE
        ctx.io.to(approved.joiner.socketId).emit('peer:joined', { device: approved.peer.info });
        for (const peer of room.peers.values()) {
          if (peer.info.deviceId !== approved.peer.info.deviceId) {
            ctx.io.to(approved.joiner.socketId).emit('peer:joined', { device: peer.info });
          }
        }
        const issued = ctx.ice.issue(approved.peer.info.deviceId);
        if (issued.turnExpiresAt !== undefined) ctx.metrics.turnCredentialsIssuedTotal.inc();
        ctx.io.to(approved.joiner.socketId).emit('ice:refresh', { iceServers: issued.iceServers });
        const approvedSocket = ctx.io.sockets.sockets.get(approved.joiner.socketId);
        if (approvedSocket) {
          ctx.admit(approvedSocket, approved.peer.info.deviceId);
        }
        broadcastRoom(ctx, room, 'peer:joined', { device: approved.peer.info }, approved.joiner.socketId);
        ctx.metrics.joinsTotal.inc({ result: 'approved' });
      } else {
        const denied = ctx.store.denyPending(room, targetId);
        if (!denied) {
          ack(ackError(ErrorCode.PEER_NOT_FOUND, 'No pending joiner with that deviceId'));
          return;
        }
        ctx.io.to(denied.socketId).emit('room:closed', { reason: 'JOIN_DENIED' });
        releaseSocket(ctx.io, room.code, denied.socketId);
        ctx.metrics.joinsTotal.inc({ result: 'denied' });
      }
      ack({});
    } catch (err) {
      ctx.logger.error({ err }, 'room:approve failed');
      ack(ackError(ErrorCode.INTERNAL, 'Internal error'));
    }
  });

  socket.on('device:update', (payload: unknown, ack: (res: unknown) => void) => {
    try {
      const deviceId = socket.data.deviceId;
      if (!deviceId) {
        ack(ackError(ErrorCode.NOT_IN_ROOM, 'Not in a room'));
        return;
      }
      const room = ctx.store.getByDevice(deviceId);
      const parsed = DeviceUpdatePayloadSchema.safeParse(payload);
      if (!room || !parsed.success) {
        ack(ackError(parsed.success ? ErrorCode.NOT_IN_ROOM : ErrorCode.INVALID_PAYLOAD, parsed.success ? 'Not in a room' : 'Invalid device:update payload'));
        return;
      }
      const peer = room.peers.get(deviceId);
      if (!peer) {
        ack(ackError(ErrorCode.NOT_IN_ROOM, 'Not in a room'));
        return;
      }
      peer.info = { ...peer.info, name: parsed.data.name };
      socket.data.deviceName = parsed.data.name;
      ctx.store.touch(room);
      broadcastRoom(ctx, room, 'peer:updated', { device: peer.info }, socket.id);
      ack({});
    } catch (err) {
      ctx.logger.error({ err }, 'device:update failed');
      ack(ackError(ErrorCode.INTERNAL, 'Internal error'));
    }
  });
}

export { leaveCurrentRoom, hashCode, broadcastRoom };
