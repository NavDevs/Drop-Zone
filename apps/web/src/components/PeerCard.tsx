import { useRef, useState } from 'react';
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
  onSendFiles?: (deviceId: string, files: File[]) => void;
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

/** One device tile: icon, name, presence dot + text (FR-04, FR-05) + file drop target (FR-10). */
export function PeerCard({
  device,
  presence,
  isSelf = false,
  rtt,
  linkClass,
  onPing,
  onSendFiles,
}: Props) {
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const style = PRESENCE_STYLE[presence];
  const connected = presence === 'direct' || presence === 'relayed';
  const showRtt = connected && typeof rtt === 'number';
  const label = connected && linkClass ? LINK_LABEL[linkClass] : style.label;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onSendFiles?.(device.deviceId, Array.from(e.target.files));
      e.target.value = '';
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    if (isSelf) return;
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    if (isSelf) return;
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onSendFiles?.(device.deviceId, Array.from(e.dataTransfer.files));
    }
  };

  return (
    <li
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`relative flex items-center gap-3 rounded-2xl border px-4 py-3 transition-colors ${
        isDragOver
          ? 'border-primary-500 bg-primary-50/80 dark:border-primary-400 dark:bg-primary-950/50 ring-2 ring-primary-500'
          : isSelf
          ? 'border-primary-300 bg-primary-50 dark:border-primary-800 dark:bg-primary-950/30'
          : 'border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900'
      }`}
      data-testid="peer-card"
      data-device-id={device.deviceId}
    >
      {!isSelf && (
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          data-testid={`file-input-${device.deviceId}`}
          onChange={handleFileChange}
        />
      )}

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

      {!isSelf && (
        <div className="flex shrink-0 items-center gap-1.5">
          {onPing && connected && (
            <button
              type="button"
              onClick={() => onPing(device.deviceId)}
              className="rounded-lg border border-gray-200 px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              Ping
            </button>
          )}

          {onSendFiles && (
            <button
              type="button"
              data-testid={`send-file-button-${device.deviceId}`}
              onClick={() => fileInputRef.current?.click()}
              className="rounded-lg bg-primary-600 px-3 py-1 text-xs font-semibold text-white hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              Send file
            </button>
          )}
        </div>
      )}
    </li>
  );
}
