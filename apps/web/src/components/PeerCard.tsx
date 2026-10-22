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
  onOpenDiagnostics?: (deviceId: string) => void;
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
  linkClass,
  onSendFiles,
}: Props) {
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const style = PRESENCE_STYLE[presence];
  const connected = presence === 'direct' || presence === 'relayed';
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
      style={{ borderRadius: isSelf ? '225px 25px 195px 25px / 25px 195px 25px 225px' : '195px 25px 225px 20px / 20px 225px 25px 195px' }}
      className={`relative flex items-center gap-3 border-[2.5px] border-lead px-4 py-3 transition-all ${
        isDragOver
          ? 'bg-postit scale-[1.02] shadow-sketch rotate-1'
          : isSelf
          ? 'bg-paper shadow-sketch -rotate-[0.5deg]'
          : 'bg-white shadow-sketch hover:rotate-[0.5deg]'
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

      <span className="flex h-10 w-10 items-center justify-center border-2 border-lead bg-mutedPaper text-lead shadow-sketch-sm" style={{ borderRadius: '255px 15px 225px 15px / 15px 225px 15px 255px' }}>
        <DeviceIcon type={device.type} />
      </span>

      <span className="min-w-0 flex-1">
        <span className="block truncate font-heading text-lg font-bold text-lead">
          {device.name}
          {isSelf && <span className="ml-1.5 font-body text-sm font-normal text-lead/60">(you)</span>}
        </span>
        <span className="flex items-center gap-1.5 text-sm font-medium text-lead/70">
          <span className={`h-2.5 w-2.5 rounded-full border border-lead ${style.dot}`} aria-hidden="true" />
          {label}
        </span>
      </span>
    </li>
  );
}
