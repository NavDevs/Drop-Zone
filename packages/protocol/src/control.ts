import { z } from 'zod';

export const HelloCapsSchema = z.object({
  maxMessageSize: z.number().int().positive(),
  fsAccess: z.boolean(),
  opfs: z.boolean(),
  channels: z.number().int().positive(),
});
export type HelloCaps = z.infer<typeof HelloCapsSchema>;

export const HelloMessageSchema = z.object({
  t: z.literal('hello'),
  v: z.literal(1),
  deviceId: z.string().uuid(),
  name: z.string().min(1).max(50),
  caps: HelloCapsSchema,
});
export type HelloMessage = z.infer<typeof HelloMessageSchema>;

export const PingMessageSchema = z.object({
  t: z.literal('ping'),
  ts: z.number(),
});
export type PingMessage = z.infer<typeof PingMessageSchema>;

export const PongMessageSchema = z.object({
  t: z.literal('pong'),
  ts: z.number(),
});
export type PongMessage = z.infer<typeof PongMessageSchema>;

export const OfferMessageSchema = z.object({
  t: z.literal('offer'),
  transferId: z.number().int(),
  name: z.string(),
  size: z.number(),
  mime: z.string(),
  lastModified: z.number(),
  chunkSize: z.number().int(),
  totalChunks: z.number().int(),
  channels: z.number().int(),
});
export type OfferMessage = z.infer<typeof OfferMessageSchema>;

export const AcceptMessageSchema = z.object({
  t: z.literal('accept'),
  transferId: z.number().int(),
});
export type AcceptMessage = z.infer<typeof AcceptMessageSchema>;

export const RejectReason = z.enum(['declined', 'no-space', 'too-large', 'busy']);
export const RejectReasonSchema = RejectReason;
export type RejectReason = z.infer<typeof RejectReason>;

export const RejectMessageSchema = z.object({
  t: z.literal('reject'),
  transferId: z.number().int(),
  reason: RejectReason,
});
export type RejectMessage = z.infer<typeof RejectMessageSchema>;

export const AckMessageSchema = z.object({
  t: z.literal('ack'),
  transferId: z.number().int(),
  received: z.number().int(),
});
export type AckMessage = z.infer<typeof AckMessageSchema>;

export const ResumeMessageSchema = z.object({
  t: z.literal('resume'),
  transferId: z.number().int(),
  bitmap: z.string(),
  received: z.number().int(),
});
export type ResumeMessage = z.infer<typeof ResumeMessageSchema>;

export const PauseMessageSchema = z.object({
  t: z.literal('pause'),
  transferId: z.number().int(),
});
export type PauseMessage = z.infer<typeof PauseMessageSchema>;

export const ContinueMessageSchema = z.object({
  t: z.literal('continue'),
  transferId: z.number().int(),
});
export type ContinueMessage = z.infer<typeof ContinueMessageSchema>;

export const CancelMessageSchema = z.object({
  t: z.literal('cancel'),
  transferId: z.number().int(),
  reason: z.string().optional(),
});
export type CancelMessage = z.infer<typeof CancelMessageSchema>;

export const SentAllMessageSchema = z.object({
  t: z.literal('sent-all'),
  transferId: z.number().int(),
});
export type SentAllMessage = z.infer<typeof SentAllMessageSchema>;

export const HashMessageSchema = z.object({
  t: z.literal('hash'),
  transferId: z.number().int(),
  algo: z.literal('sha256'),
  hex: z.string(),
});
export type HashMessage = z.infer<typeof HashMessageSchema>;

export const VerifiedMessageSchema = z.object({
  t: z.literal('verified'),
  transferId: z.number().int(),
  ok: z.boolean(),
  hex: z.string().optional(),
});
export type VerifiedMessage = z.infer<typeof VerifiedMessageSchema>;

export const TextMessageSchema = z.object({
  t: z.literal('text'),
  id: z.string(),
  text: z.string(),
});
export type TextMessage = z.infer<typeof TextMessageSchema>;

export const ControlMessageSchema = z.discriminatedUnion('t', [
  HelloMessageSchema,
  PingMessageSchema,
  PongMessageSchema,
  OfferMessageSchema,
  AcceptMessageSchema,
  RejectMessageSchema,
  AckMessageSchema,
  ResumeMessageSchema,
  PauseMessageSchema,
  ContinueMessageSchema,
  CancelMessageSchema,
  SentAllMessageSchema,
  HashMessageSchema,
  VerifiedMessageSchema,
  TextMessageSchema,
]);
export type ControlMessage = z.infer<typeof ControlMessageSchema>;
