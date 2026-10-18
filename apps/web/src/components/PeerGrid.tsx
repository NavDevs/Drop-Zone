import type { DeviceInfo } from '@dropzone/protocol';
import type { PeerRecord } from '../state/peersStore.js';
import type { ConnectionClass } from '../lib/rtc/stats.js';
import { PeerCard } from './PeerCard.js';

interface Props {
  self: DeviceInfo;
  peers: PeerRecord[];
  pending?: DeviceInfo[];
  onApprove?: (deviceId: string) => void;
  onDeny?: (deviceId: string) => void;
  rtts?: Record<string, number | null | undefined>;
  linkClasses?: Record<string, ConnectionClass | null | undefined>;
  onPing?: (deviceId: string) => void;
  onSendFiles?: (deviceId: string, files: File[]) => void;
}

/** Roster: self + peers (FR-05). Host also sees join requests with approve/deny (FR-06). */
export function PeerGrid({
  self,
  peers,
  pending = [],
  onApprove,
  onDeny,
  rtts,
  linkClasses,
  onPing,
  onSendFiles,
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
          />
        ))}
      </ul>

      {pending.length > 0 && onApprove && onDeny && (
        <section aria-label="Join requests" className="rounded-2xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/30">
          <h2 className="text-sm font-semibold text-amber-900 dark:text-amber-100">
            Join requests ({pending.length})
          </h2>
          <ul className="mt-2 flex flex-col gap-2">
            {pending.map((d) => (
              <li key={d.deviceId} className="flex items-center justify-between gap-2">
                <span className="truncate text-sm text-amber-900 dark:text-amber-100">{d.name}</span>
                <span className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    onClick={() => onApprove(d.deviceId)}
                    className="rounded-lg bg-emerald-600 px-3 py-1 text-xs font-semibold text-white hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeny(d.deviceId)}
                    className="rounded-lg bg-gray-300 px-3 py-1 text-xs font-semibold text-gray-800 hover:bg-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-500 dark:bg-gray-700 dark:text-gray-100 dark:hover:bg-gray-600"
                  >
                    Deny
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
