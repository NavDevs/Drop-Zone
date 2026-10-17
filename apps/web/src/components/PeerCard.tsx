import type { DeviceInfo } from '@dropzone/protocol';
import type { PeerPresence } from '../state/peersStore.js';
import type { ConnectionClass } from '../lib/rtc/stats.js';
import { DeviceIcon } from './DeviceIcon.js';

interface Props {
  device: DeviceInfo;
  presence: PeerPresence;
  isSelf?: boolean;
  rtt?: number | null;
  linkClass?: ConnectionClass | null;
  onPing?: (deviceId: string) => void;
}

const PRESENCE_STYLE: Record<PeerPresence, { dot: string; label: string }> = {
  online: { dot: 'bg-emerald-500', label: 'Online' },
  connecting: { dot: 'bg-amber-400', label: 'Connecting' },
  direct: { dot: 'bg-sky-500', label: 'Connected (direct)' },
  relayed: { dot: 'bg-violet-500', label: 'Relayed (TURN)' },
  offline: { dot: 'bg-gray-400', label: 'Offline' },
};

/** FR-30 exact badge labels, shown once getStats() classifies the pair. */
const LINK_LABEL: Record<ConnectionClass, string> = {
  'direct-local': 'Direct (local network)',
  'direct-internet': 'Direct (internet)',
  relayed: 'Relayed (TURN)',
};

/** One device tile: icon, name, presence dot + text (FR-04, FR-05). */
export function PeerCard({ device, presence, isSelf = false, rtt, linkClass, onPing }: Props) {
  const style = PRESENCE_STYLE[presence];
  const connected = presence === 'direct' || presence === 'relayed';
  const showRtt = connected && typeof rtt === 'number';
  const label = connected && linkClass ? LINK_LABEL[linkClass] : style.label;
  return (
    <li
      className={`flex items-center gap-3 rounded-2xl border px-4 py-3 ${
        isSelf
          ? 'border-primary-300 bg-primary-50 dark:border-primary-800 dark:bg-primary-950/30'
          : 'border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900'
      }`}
      data-testid="peer-card"
      data-device-id={device.deviceId}
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300">
        <DeviceIcon type={device.type} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium text-gray-900 dark:text-gray-100">
          {device.name}
          {isSelf && <span className="ml-1 text-xs font-normal text-gray-400">(you)</span>}
        </span>
        <span className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
          <span className={`h-2 w-2 rounded-full ${style.dot}`} aria-hidden="true" />
          {label}
          {showRtt && <span className="text-gray-400 dark:text-gray-500"> · {Math.round(rtt)} ms</span>}
        </span>
      </span>
      {!isSelf && onPing && (presence === 'direct' || presence === 'relayed') && (
        <button
          type="button"
          onClick={() => onPing(device.deviceId)}
          className="shrink-0 rounded-lg border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
        >
          Ping
        </button>
      )}
    </li>
  );
}
