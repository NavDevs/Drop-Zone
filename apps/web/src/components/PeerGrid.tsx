import type { DeviceInfo } from '@dropzone/protocol';
import type { PeerRecord } from '../state/peersStore.js';
import type { ConnectionClass } from '../lib/rtc/stats.js';
import { PeerCard } from './PeerCard.js';

interface Props {
  self: DeviceInfo;
  peers: PeerRecord[];
  rtts?: Record<string, number | null | undefined>;
  linkClasses?: Record<string, ConnectionClass | null | undefined>;
  onPing?: (deviceId: string) => void;
  onSendFiles?: (deviceId: string, files: File[]) => void;
  onOpenDiagnostics?: (deviceId: string) => void;
}

/** Roster: self + peers (FR-05). */
export function PeerGrid({
  self,
  peers,
  rtts,
  linkClasses,
  onPing,
  onSendFiles,
  onOpenDiagnostics,
}: Props) {
  return (
    <div className="flex flex-col gap-4">
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <PeerCard device={self} presence="online" isSelf />
        {peers.map((p) => (
          <PeerCard
            key={p.device.deviceId}
            device={p.device}
            presence={p.presence}
            rtt={rtts?.[p.device.deviceId]}
            linkClass={linkClasses?.[p.device.deviceId]}
            onPing={onPing}
            onSendFiles={onSendFiles}
            onOpenDiagnostics={onOpenDiagnostics}
          />
        ))}
      </ul>
    </div>
  );
}
