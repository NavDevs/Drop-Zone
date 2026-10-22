import type { PeerLinkStats } from '../lib/rtc/PeerSession.js';
import type { DeviceInfo } from '@dropzone/protocol';
import { DeviceIcon } from './DeviceIcon.js';

interface Props {
  peer: DeviceInfo;
  stats: PeerLinkStats | null;
  isOpen: boolean;
  onClose: () => void;
}

export function DiagnosticsDrawer({ peer, stats, isOpen, onClose }: Props) {
  if (!isOpen) return null;

  const formatBitrate = (bps: number | null | undefined): string => {
    if (bps === undefined || bps === null) return 'N/A';
    if (bps >= 1_000_000_000) return `${(bps / 1_000_000_000).toFixed(2)} Gbps`;
    if (bps >= 1_000_000) return `${(bps / 1_000_000).toFixed(2)} Mbps`;
    if (bps >= 1_000) return `${(bps / 1_000).toFixed(1)} kbps`;
    return `${bps} bps`;
  };

  const formatBytes = (bytes: number | null | undefined): string => {
    if (bytes === undefined || bytes === null) return 'N/A';
    if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(2)} GiB`;
    if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MiB`;
    if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
    return `${bytes} B`;
  };

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/70 backdrop-blur-sm transition-opacity"
      aria-modal="true"
      role="dialog"
      data-testid="diagnostics-drawer"
    >
      <div className="flex h-full w-full max-w-md flex-col border-l-2 border-neonCyan border-t-4 border-t-neonMagenta bg-void/95 p-5 sm:p-6 shadow-[0_0_35px_rgba(0,255,255,0.25)] text-chrome">
        <div className="flex items-center justify-between border-b border-retroBorder pb-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center border border-neonCyan/50 bg-black/60 text-neonCyan -skew-x-6">
              <DeviceIcon type={peer.type} />
            </span>
            <div>
              <h2 className="font-heading text-sm sm:text-base font-bold text-white uppercase">{peer.name}</h2>
              <p className="text-xs text-neonCyan/70 font-mono">NODE ID: {peer.deviceId.slice(0, 8)}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="-skew-x-6 hover:skew-x-0 border border-retroBorder bg-black/60 p-2 text-chrome/70 hover-vapor-magenta transition cursor-pointer font-bold"
            aria-label="Close diagnostics"
          >
            <span className="inline-block skew-x-6 hover:skew-x-0">[✕]</span>
          </button>
        </div>

        <div className="mt-5 flex-1 space-y-5 overflow-y-auto pr-1">
          {/* Short Authentication String (SAS) Section (FR-33) */}
          <section className="border border-neonCyan/40 bg-cardBg/90 p-4 shadow-panelGlow">
            <h3 className="font-heading text-xs font-bold uppercase tracking-wider text-neonCyan">
              // Security Verification (SAS)
            </h3>
            <p className="mt-1 text-xs font-mono text-chrome/70">
              Compare this code with the one on the peer&apos;s screen to verify end-to-end security:
            </p>
            <div
              className="mt-3 flex items-center justify-center border-2 border-neonCyan bg-black/80 py-3 font-mono text-2xl font-bold tracking-widest text-neonCyan shadow-[0_0_15px_rgba(0,255,255,0.4)]"
              data-testid="sas-code"
            >
              {stats?.sas ?? 'Generating…'}
            </div>
          </section>

          {/* Transport Diagnostics Table (FR-31) */}
          <section className="space-y-2.5">
            <h3 className="font-heading text-xs font-bold uppercase tracking-wider text-neonMagenta">
              // WebRTC Transport Diagnostics
            </h3>
            <dl className="divide-y divide-retroBorder border border-retroBorder bg-cardBg/70 text-xs font-mono">
              <div className="flex justify-between px-3.5 py-2.5">
                <dt className="text-chrome/60 uppercase">Connection Class</dt>
                <dd className="font-bold text-neonCyan uppercase">
                  {stats?.connectionClass ?? 'Connecting…'}
                </dd>
              </div>

              <div className="flex justify-between px-3.5 py-2.5">
                <dt className="text-chrome/60 uppercase">Candidate Pair</dt>
                <dd className="text-chrome/90 uppercase">
                  {stats?.localCandidateType ?? 'unknown'} ↔ {stats?.remoteCandidateType ?? 'unknown'}
                </dd>
              </div>

              <div className="flex justify-between px-3.5 py-2.5">
                <dt className="text-chrome/60 uppercase">Protocol</dt>
                <dd className="uppercase font-bold text-neonMagenta">
                  {stats?.protocol ?? 'udp'}
                </dd>
              </div>

              <div className="flex justify-between px-3.5 py-2.5">
                <dt className="text-chrome/60 uppercase">Round Trip Time (RTT)</dt>
                <dd className="text-neonCyan font-bold">
                  {typeof stats?.rttMs === 'number' ? `${Math.round(stats.rttMs)} ms` : 'N/A'}
                </dd>
              </div>

              <div className="flex justify-between px-3.5 py-2.5">
                <dt className="text-chrome/60 uppercase">Available Outgoing Bitrate</dt>
                <dd className="text-sunsetOrange font-bold">
                  {formatBitrate(stats?.availableOutgoingBitrate)}
                </dd>
              </div>

              <div className="flex justify-between px-3.5 py-2.5">
                <dt className="text-chrome/60 uppercase">SCTP Buffered Amount</dt>
                <dd className="text-chrome/90">
                  {formatBytes(stats?.bufferedAmount)}
                </dd>
              </div>
            </dl>
          </section>
        </div>

        <div className="mt-4 border-t border-retroBorder pt-4">
          <button
            type="button"
            onClick={onClose}
            className="w-full -skew-x-6 hover:skew-x-0 border border-retroBorder bg-black/60 py-2.5 font-mono text-xs uppercase tracking-wider text-chrome/80 hover-vapor-magenta transition cursor-pointer font-bold"
          >
            <span className="inline-block skew-x-6 hover:skew-x-0">
              Close
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
