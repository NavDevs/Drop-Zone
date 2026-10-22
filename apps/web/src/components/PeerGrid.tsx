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
  onOpenDiagnostics?: (deviceId: string) => void;
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

      {pending.length > 0 && onApprove && onDeny && (
        <section
          aria-label="Join requests"
          className="border-2 border-sunsetOrange border-t-2 border-t-sunsetOrange bg-cardBg/95 p-4 shadow-[0_0_20px_rgba(255,153,0,0.25)] backdrop-blur-md"
        >
          <div className="flex items-center justify-between border-b border-sunsetOrange/30 pb-2 mb-3">
            <span className="font-heading text-xs uppercase tracking-widest text-sunsetOrange font-bold flex items-center gap-2">
              <span className="inline-block h-2 w-2 bg-sunsetOrange animate-pulse" />
              JOIN REQUESTS PENDING ({pending.length})
            </span>
          </div>
          <ul className="flex flex-col gap-2.5">
            {pending.map((d) => (
              <li
                key={d.deviceId}
                className="flex items-center justify-between gap-3 border border-retroBorder bg-black/60 p-2.5"
              >
                <div className="min-w-0">
                  <span className="truncate font-heading text-sm font-bold text-white block">
                    {d.name}
                  </span>
                  <span className="font-mono text-[11px] text-chrome/50 block">
                    DEVICE ID: {d.deviceId.slice(0, 8)}
                  </span>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    onClick={() => onApprove(d.deviceId)}
                    className="-skew-x-6 hover:skew-x-0 border border-neonCyan bg-neonCyan/20 hover-vapor-cyan px-3 py-1 font-heading text-xs font-bold uppercase tracking-wider text-neonCyan transition cursor-pointer"
                  >
                    <span className="inline-block skew-x-6 hover:skew-x-0">
                      Approve
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeny(d.deviceId)}
                    className="-skew-x-6 hover:skew-x-0 border border-sunsetOrange/50 bg-black/60 hover-vapor-orange px-3 py-1 font-mono text-xs uppercase tracking-wider text-sunsetOrange transition cursor-pointer font-bold"
                  >
                    <span className="inline-block skew-x-6 hover:skew-x-0">
                      Deny
                    </span>
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
