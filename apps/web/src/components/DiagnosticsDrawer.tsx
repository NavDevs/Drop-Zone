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
      className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-sm transition-opacity"
      aria-modal="true"
      role="dialog"
      data-testid="diagnostics-drawer"
    >
      <div className="flex h-full w-full max-w-md flex-col bg-white p-6 shadow-2xl dark:bg-gray-900">
        <div className="flex items-center justify-between border-b pb-4 dark:border-gray-800">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300">
              <DeviceIcon type={peer.type} />
            </span>
            <div>
              <h2 className="font-semibold text-gray-900 dark:text-gray-100">{peer.name}</h2>
              <p className="text-xs text-gray-500 font-mono">{peer.deviceId.slice(0, 8)}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-primary-500"
            aria-label="Close diagnostics"
          >
            ✕
          </button>
        </div>

        <div className="mt-6 flex-1 space-y-6 overflow-y-auto">
          {/* Short Authentication String (SAS) Section (FR-33) */}
          <section className="rounded-xl border border-sky-200 bg-sky-50/50 p-4 dark:border-sky-900/50 dark:bg-sky-950/20">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-sky-800 dark:text-sky-300">
              Security Verification (SAS)
            </h3>
            <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">
              Compare this code with the one on the peer&apos;s screen to verify end-to-end security:
            </p>
            <div
              className="mt-3 flex items-center justify-center rounded-lg bg-white py-3 font-mono text-2xl font-bold tracking-widest text-primary-600 shadow-sm dark:bg-gray-800 dark:text-primary-400"
              data-testid="sas-code"
            >
              {stats?.sas ?? 'Generating…'}
            </div>
          </section>

          {/* Transport Diagnostics Table (FR-31) */}
          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              WebRTC Transport Diagnostics
            </h3>
            <dl className="divide-y divide-gray-100 rounded-xl border border-gray-200 text-sm dark:divide-gray-800 dark:border-gray-800">
              <div className="flex justify-between px-4 py-2.5">
                <dt className="text-gray-500 dark:text-gray-400">Connection Class</dt>
                <dd className="font-medium text-gray-900 dark:text-gray-100">
                  {stats?.connectionClass ?? 'Connecting…'}
                </dd>
              </div>

              <div className="flex justify-between px-4 py-2.5">
                <dt className="text-gray-500 dark:text-gray-400">Candidate Pair</dt>
                <dd className="font-mono text-xs text-gray-900 dark:text-gray-100">
                  {stats?.localCandidateType ?? 'unknown'} ↔ {stats?.remoteCandidateType ?? 'unknown'}
                </dd>
              </div>

              <div className="flex justify-between px-4 py-2.5">
                <dt className="text-gray-500 dark:text-gray-400">Protocol</dt>
                <dd className="uppercase font-mono text-xs text-gray-900 dark:text-gray-100">
                  {stats?.protocol ?? 'udp'}
                </dd>
              </div>

              <div className="flex justify-between px-4 py-2.5">
                <dt className="text-gray-500 dark:text-gray-400">Round Trip Time (RTT)</dt>
                <dd className="font-mono text-gray-900 dark:text-gray-100">
                  {typeof stats?.rttMs === 'number' ? `${Math.round(stats.rttMs)} ms` : 'N/A'}
                </dd>
              </div>

              <div className="flex justify-between px-4 py-2.5">
                <dt className="text-gray-500 dark:text-gray-400">Available Outgoing Bitrate</dt>
                <dd className="font-mono text-gray-900 dark:text-gray-100">
                  {formatBitrate(stats?.availableOutgoingBitrate)}
                </dd>
              </div>

              <div className="flex justify-between px-4 py-2.5">
                <dt className="text-gray-500 dark:text-gray-400">SCTP Buffered Amount</dt>
                <dd className="font-mono text-gray-900 dark:text-gray-100">
                  {formatBytes(stats?.bufferedAmount)}
                </dd>
              </div>
            </dl>
          </section>
        </div>

        <div className="mt-4 border-t pt-4 dark:border-gray-800">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-xl bg-gray-100 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
