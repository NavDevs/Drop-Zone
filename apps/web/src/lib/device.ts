import type { DeviceInfo, DeviceType } from '@dropzone/protocol';

const DEVICE_ID_KEY = 'dz:deviceId';
const DEVICE_NAME_KEY = 'dz:deviceName';

const ADJECTIVES = [
  'Swift', 'Clever', 'Bright', 'Silent', 'Brave', 'Lucky', 'Happy', 'Cosmic',
  'Mighty', 'Gentle', 'Witty', 'Zesty', 'Rapid', 'Dapper', 'Sunny', 'Nimble',
  'Plucky', 'Jolly', 'Keen', 'Merry', 'Peppy', 'Quirky', 'Vivid', 'Zesty',
] as const;

const ANIMALS = [
  'Otter', 'Falcon', 'Panda', 'Fox', 'Lynx', 'Heron', 'Badger', 'Koala',
  'Wolf', 'Finch', 'Gecko', 'Moose', 'Raven', 'Tiger', 'Whale', 'Llama',
  'Civet', 'Ocelot', 'Tapir', 'Quokka', 'Hedgehog', 'Manatee', 'Bison',
] as const;

/** Deterministic-from-rng "Adjective + Animal" name, e.g. "Swift Otter". */
export function generateDeviceName(rand: () => number = Math.random): string {
  const adj = ADJECTIVES[Math.floor(rand() * ADJECTIVES.length)] ?? 'Swift';
  const animal = ANIMALS[Math.floor(rand() * ANIMALS.length)] ?? 'Otter';
  return `${adj} ${animal}`;
}

/** Fallback-safe UUID v4. */
export function randomId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // fallback: RFC4122-ish v4 from getRandomValues
  const bytes = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes);
  } else {
    // total fallback for ancient or extremely restricted environments
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Per-tab device id (sessionStorage) — unique per tab eases two-tab testing. */
export function getDeviceId(): string {
  let id = sessionStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = randomId();
    sessionStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

/** Per-tab device name, generated once and persisted. */
export function getDeviceName(): string {
  let name = sessionStorage.getItem(DEVICE_NAME_KEY);
  if (!name) {
    name = generateDeviceName();
    sessionStorage.setItem(DEVICE_NAME_KEY, name);
  }
  return name;
}

export function setDeviceName(name: string): void {
  sessionStorage.setItem(DEVICE_NAME_KEY, name);
}

export function detectDeviceType(
  ua: string = typeof navigator !== 'undefined' ? navigator.userAgent : '',
  maxTouchPoints: number = typeof navigator !== 'undefined' ? navigator.maxTouchPoints : 0,
): DeviceType {
  if (/iPhone|iPod/.test(ua)) return 'phone';
  if (/iPad/.test(ua)) return 'tablet';
  if (/Android/.test(ua)) return /Mobile/.test(ua) ? 'phone' : 'tablet';
  if (/Windows Phone/.test(ua)) return 'phone';
  // iPadOS masquerades as macOS but reports touch
  if (/Mac OS X/.test(ua) && maxTouchPoints > 1) return 'tablet';
  if (/Macintosh|Mac OS X|ChromeOS/.test(ua)) return 'laptop';
  if (/Windows/.test(ua) || /Linux/.test(ua)) return 'desktop';
  return 'unknown';
}

export function buildDeviceInfo(): DeviceInfo {
  return {
    deviceId: getDeviceId(),
    name: getDeviceName(),
    type: detectDeviceType(),
  };
}
