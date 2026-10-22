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
      onClick={() => {
        if (!isSelf) fileInputRef.current?.click();
      }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`relative flex items-center gap-3 border-2 p-3.5 transition-all ${
        isDragOver
          ? 'border-neonCyan bg-neonCyan/20 shadow-[0_0_20px_#00FFFF] scale-[1.02]'
          : isSelf
          ? 'border-retroBorder border-t-2 border-t-neonMagenta bg-cardBg/90 shadow-panelGlow'
          : 'border-retroBorder border-t-2 border-t-neonCyan bg-cardBg/80 hover:border-neonCyan hover:shadow-[0_0_15px_rgba(0,255,255,0.3)] cursor-pointer'
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

      <span className="flex h-10 w-10 items-center justify-center border border-neonCyan/50 bg-black/60 text-neonCyan -skew-x-6 flex-shrink-0">
        <DeviceIcon type={device.type} />
      </span>

      <span className="min-w-0 flex-1">
        <span className="block truncate font-heading text-sm font-bold tracking-wider text-white">
          {device.name}
          {isSelf && <span className="ml-2 font-mono text-xs font-normal text-neonMagenta">&lt;YOU&gt;</span>}
        </span>
        <span className="flex items-center gap-2 font-mono text-xs text-chrome/60 uppercase">
          <span className={`h-2 w-2 rounded-full ${style.dot} shadow-[0_0_8px_currentColor]`} aria-hidden="true" />
          [{label}]
        </span>
      </span>

      {!isSelf && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            fileInputRef.current?.click();
          }}
          className="-skew-x-6 border border-neonCyan/40 bg-black/60 px-3 py-1 font-mono text-xs font-bold uppercase tracking-wider text-neonCyan hover-vapor-cyan transition cursor-pointer flex-shrink-0"
        >
          <span className="inline-block skew-x-6">SEND</span>
        </button>
      )}
    </li>
  );
}
