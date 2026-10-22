import { z } from 'zod';

export const DeviceType = z.enum(['phone', 'tablet', 'laptop', 'desktop', 'unknown']);
export const DeviceTypeSchema = DeviceType;
export type DeviceType = z.infer<typeof DeviceType>;

export const DeviceInfoSchema = z.object({
  deviceId: z.string().uuid(),
  name: z.string().min(1).max(50),
  type: DeviceType,
});
export type DeviceInfo = z.infer<typeof DeviceInfoSchema>;

export const RoomCreatePayloadSchema = z.object({
  device: DeviceInfoSchema,
  ttlSec: z.union([z.literal(300), z.literal(600), z.literal(1800), z.literal(3600)]).optional(),
});
export type RoomCreatePayload = z.infer<typeof RoomCreatePayloadSchema>;

export const RoomJoinPayloadSchema = z.object({
  code: z.string().length(6),
  device: DeviceInfoSchema,
});
export type RoomJoinPayload = z.infer<typeof RoomJoinPayloadSchema>;

export const RoomLeavePayloadSchema = z.object({});
export type RoomLeavePayload = z.infer<typeof RoomLeavePayloadSchema>;

export const RoomClosePayloadSchema = z.object({});
export type RoomClosePayload = z.infer<typeof RoomClosePayloadSchema>;

export const DeviceUpdatePayloadSchema = z.object({
  name: z.string().min(1).max(50),
});
export type DeviceUpdatePayload = z.infer<typeof DeviceUpdatePayloadSchema>;

export const SignalKind = z.enum(['description', 'candidate']);
export const SignalKindSchema = SignalKind;
export type SignalKind = z.infer<typeof SignalKind>;

export const SignalPayloadSchema = z.object({
  to: z.string().uuid(),
  kind: SignalKind,
  data: z.unknown(),
});
export type SignalPayload = z.infer<typeof SignalPayloadSchema>;

export const RelayedSignalPayloadSchema = z.object({
  from: z.string().uuid(),
  kind: SignalKind,
  data: z.unknown(),
});
export type RelayedSignalPayload = z.infer<typeof RelayedSignalPayloadSchema>;

export const PeerInfoSchema = z.object({
  device: DeviceInfoSchema,
  joinedAt: z.number(),
});
export type PeerInfo = z.infer<typeof PeerInfoSchema>;

export const RoomCreateAckSchema = z.object({
  code: z.string(),
  codeExpiresAt: z.number(),
  iceServers: z.array(z.unknown()),
  peers: z.array(PeerInfoSchema),
});
export type RoomCreateAck = z.infer<typeof RoomCreateAckSchema>;

export const RoomJoinAckSchema = z.object({
  code: z.string(),
  codeExpiresAt: z.number(),
  iceServers: z.array(z.unknown()),
  peers: z.array(PeerInfoSchema),
});
export type RoomJoinAck = z.infer<typeof RoomJoinAckSchema>;

export const RoomRegenerateAckSchema = z.object({
  code: z.string(),
  codeExpiresAt: z.number(),
});
export type RoomRegenerateAck = z.infer<typeof RoomRegenerateAckSchema>;

export const PeerJoinedPayloadSchema = z.object({
  device: DeviceInfoSchema,
});
export type PeerJoinedPayload = z.infer<typeof PeerJoinedPayloadSchema>;

export const PeerLeftPayloadSchema = z.object({
  deviceId: z.string().uuid(),
});
export type PeerLeftPayload = z.infer<typeof PeerLeftPayloadSchema>;

export const PeerUpdatedPayloadSchema = z.object({
  device: DeviceInfoSchema,
});
export type PeerUpdatedPayload = z.infer<typeof PeerUpdatedPayloadSchema>;

export const RoomClosedPayloadSchema = z.object({
  reason: z.string(),
});
export type RoomClosedPayload = z.infer<typeof RoomClosedPayloadSchema>;

export const RoomCodeChangedPayloadSchema = z.object({
  code: z.string(),
  codeExpiresAt: z.number(),
});
export type RoomCodeChangedPayload = z.infer<typeof RoomCodeChangedPayloadSchema>;

export const IceRefreshPayloadSchema = z.object({
  iceServers: z.array(z.unknown()),
});
export type IceRefreshPayload = z.infer<typeof IceRefreshPayloadSchema>;
