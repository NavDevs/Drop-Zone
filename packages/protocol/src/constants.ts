export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_LENGTH = 6;

export const DEFAULT_CHUNK_SIZE = 16384; // 16 KiB
export const BUFFER_LOW = 1 * 1024 * 1024; // 1 MiB
export const BUFFER_HIGH = 4 * 1024 * 1024; // 4 MiB
export const ACK_WINDOW_BYTES = 16 * 1024 * 1024; // 16 MiB
export const ACK_INTERVAL_CHUNKS = 64;
export const ACK_INTERVAL_MS = 250;
export const PREFETCH_QUEUE_SIZE = 8;

export const FRAME_HEADER_SIZE = 12;
export const FRAME_VERSION = 1;
export const FRAME_TYPE_DATA = 1;

export const MAX_PEERS_PER_ROOM = 8;
export const ROOM_TTL_CHOICES = [300, 600, 1800, 3600] as const;
export type RoomTtlChoice = (typeof ROOM_TTL_CHOICES)[number];
export const ROOM_TTL_DEFAULT = 600;
export const ROOM_IDLE_TIMEOUT = 30 * 60; // 30 min in seconds (1800 s)
export const ROOM_HARD_MAX = 6 * 60 * 60; // 6 hours in seconds (21600 s)

export const MAX_SIGNAL_PAYLOAD_SIZE = 16 * 1024; // 16 KB
export const MAX_CONCURRENT_TRANSFERS_PER_PEER = 3;
export const MEMORY_WRITER_MAX_SIZE = 500 * 1024 * 1024; // 500 MB

// Signaling server rate limits (TRD §5)
export const ROOM_CREATE_RATE_LIMIT = 10; // per IP
export const ROOM_CREATE_RATE_WINDOW_SEC = 3600; // 1 hour
export const ROOM_JOIN_RATE_LIMIT = 10; // per IP
export const ROOM_JOIN_RATE_WINDOW_SEC = 60; // 1 minute
export const JOIN_FAIL_LOCKOUT_THRESHOLD = 5; // failed joins
export const JOIN_FAIL_LOCKOUT_SEC = 900; // 15 minutes
export const SIGNAL_RATE_LIMIT = 100; // per socket
export const SIGNAL_RATE_WINDOW_SEC = 10; // 10 seconds

// Room code lifecycle
export const ROOM_CODE_FREED_RETENTION_SEC = 3600; // freed codes unusable for 1 h
export const ROOM_SWEEP_INTERVAL_SEC = 30; // expiry sweeper cadence

// ICE credential refresh
export const ICE_REFRESH_MARGIN_SEC = 60; // reissue TURN creds this long before expiry

export const DANGEROUS_EXTENSIONS = [
  '.exe',
  '.msi',
  '.bat',
  '.cmd',
  '.ps1',
  '.sh',
  '.apk',
  '.scr',
  '.jar',
  '.dmg',
] as const;
export type DangerousExtension = (typeof DANGEROUS_EXTENSIONS)[number];

export const PROGRESS_THROTTLE_MS = 250;
export const STATS_POLL_INTERVAL_MS = 1000;
export const ICE_RECONNECT_DELAY_MS = 3000;
export const ICE_MAX_RECONNECT_ATTEMPTS = 5;
export const RESUME_RECORD_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
