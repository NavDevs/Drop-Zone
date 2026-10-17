import type { DeviceInfo } from '@dropzone/protocol';
import type { PeerPresence } from '../state/peersStore.js';
import { DeviceIcon } from './DeviceIcon.js';

interface Props {
  device: DeviceInfo;
  presence: PeerPresence;
  isSelf?: boolean;
}

const PRESENCE_STYLE: Record<PeerPresence, { dot: string; label: string }> = {
  online: { dot: 'bg-emerald-500', label: 'Online' },
  connecting: { dot: 'bg-amber-400', label: 'Connecting' },
  direct: { dot: 'bg-sky-500', label: 'Connected (direct)' },
  relayed: { dot: 'bg-violet-500', label: 'Connected (relayed)' },
  offline: { dot: 'bg-gray-400', label: 'Offline' },
};

/** One device tile: icon, name, presence dot + text (FR-04, FR-05). */
export function PeerCard({ device, presence, isSelf = false }: Props) {
  const style = PRESENCE_STYLE[presence];
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
          {style.label}
        </span>
      </span>
    </li>
  );
}
