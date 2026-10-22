import { formatBytes, formatSpeed, formatEta } from '../lib/transfer/format.js';
import type { TransferRecord } from '../state/transfersStore.js';
import { getTransferHub } from '../lib/transfer/TransferHub.js';

interface TransferRowProps {
  transfer: TransferRecord;
  onCancel: (id: number) => void;
}

export function TransferRow({ transfer, onCancel }: TransferRowProps) {
  const percent = Math.round(transfer.progress * 100);
  const isSend = transfer.direction === 'send';
  const isActive = transfer.status === 'active';
  const isOffering = transfer.status === 'offering';
  const isQueued = transfer.status === 'queued';
  const isDone = transfer.status === 'done';

  const statusBadge = () => {
    switch (transfer.status) {
      case 'queued':
        return <span className="border border-sunsetOrange bg-sunsetOrange/10 px-2 py-0.5 text-xs font-mono font-bold text-sunsetOrange">WAITING FOR PEER…</span>;
      case 'active':
        return <span className="border border-neonCyan bg-neonCyan/10 px-2 py-0.5 text-xs font-mono font-bold text-neonCyan shadow-[0_0_8px_#00FFFF]">TRANSFERRING</span>;
      case 'offering':
        return <span className="border border-sunsetOrange bg-sunsetOrange/10 px-2 py-0.5 text-xs font-mono font-bold text-sunsetOrange">HANDSHAKE…</span>;
      case 'done':
        return (
          <span className="border border-neonMagenta bg-neonMagenta/10 px-2 py-0.5 text-xs font-mono font-bold text-neonMagenta shadow-[0_0_8px_#FF00FF]">
            {transfer.verified ? 'VERIFIED SHA-256 ✓' : 'COMPLETE'}
          </span>
        );
      case 'declined':
        return <span className="border border-retroBorder bg-black/40 px-2 py-0.5 text-xs font-mono text-chrome/50">DECLINED</span>;
      case 'cancelled':
        return <span className="border border-retroBorder bg-black/40 px-2 py-0.5 text-xs font-mono text-chrome/50">ABORTED</span>;
      case 'error':
        return <span className="border border-neonMagenta bg-neonMagenta/20 px-2 py-0.5 text-xs font-mono font-bold text-neonMagenta">FAILED</span>;
      default:
        return null;
    }
  };

  return (
    <li
      data-testid={`transfer-row-${transfer.id}`}
      className="flex flex-col gap-2.5 border border-retroBorder bg-cardBg/90 p-4 shadow-panelGlow"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <span
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center border border-neonCyan/50 bg-black/60 text-neonCyan font-bold font-mono text-sm"
            aria-hidden="true"
          >
            {isSend ? '▲' : '▼'}
          </span>
          <div className="min-w-0">
            <p className="truncate font-heading text-sm font-bold text-white tracking-wide" title={transfer.name}>
              {transfer.name}
            </p>
            <p className="text-xs font-mono text-chrome/60 uppercase">
              {formatBytes(transfer.transferred)} / {formatBytes(transfer.size)}
              {transfer.senderName && <span className="text-neonCyan ml-2">· {transfer.senderName}</span>}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {statusBadge()}

          {(isActive || isOffering || isQueued) && (
            <button
              type="button"
              onClick={() => onCancel(transfer.id)}
              className="border border-retroBorder bg-black/50 px-2.5 py-1 text-xs font-mono uppercase text-chrome/60 hover:text-white"
            >
              CANCEL
            </button>
          )}

          {isDone && transfer.downloadUrl && (
            <a
              href={transfer.downloadUrl}
              download={transfer.name}
              data-testid={`download-link-${transfer.id}`}
              className="-skew-x-12 hover:skew-x-0 border-2 border-neonCyan vapor-button-cyan hover-vapor-cyan px-3 py-1 text-xs font-heading font-extrabold uppercase text-white transition cursor-pointer"
            >
              <span className="inline-block skew-x-12 hover:skew-x-0">
                SAVE FILE
              </span>
            </a>
          )}

          {isDone && !transfer.downloadUrl && transfer.peerId && (
            <button
              type="button"
              onClick={() => getTransferHub().requestFile(transfer.peerId, transfer.name, transfer.size)}
              className="-skew-x-12 hover:skew-x-0 border-2 border-neonMagenta vapor-button-magenta hover-vapor-magenta px-3 py-1 text-xs font-heading font-extrabold uppercase text-white transition cursor-pointer"
            >
              <span className="inline-block skew-x-12 hover:skew-x-0">
                REQUEST FILE
              </span>
            </button>
          )}
        </div>
      </div>

      {/* High-Visibility Glowing Outrun Progress Bar */}
      <div className="relative h-3.5 w-full border border-neonCyan/60 bg-black/90 shadow-[0_0_15px_rgba(0,255,255,0.35)] p-0.5">
        <div
          role="progressbar"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
          style={{ width: `${Math.max(percent, percent > 0 ? 1 : 0)}%` }}
          className={`relative h-full transition-all duration-150 synth-progress-bar ${
            transfer.status === 'error'
              ? 'bg-neonMagenta shadow-[0_0_15px_#FF00FF,0_0_30px_#FF00FF]'
              : transfer.status === 'done'
              ? 'bg-neonCyan shadow-[0_0_15px_#00FFFF,0_0_30px_#00FFFF]'
              : 'bg-gradient-to-r from-neonMagenta via-sunsetOrange to-neonCyan shadow-[0_0_18px_#00FFFF,0_0_32px_#00FFFF]'
          }`}
        >
          {/* Laser beam leading edge */}
          {percent > 0 && percent < 100 && (
            <span className="absolute right-0 top-0 bottom-0 w-1.5 bg-white shadow-[0_0_10px_#FFFFFF,0_0_18px_#00FFFF]" />
          )}
        </div>
      </div>

      <div className="flex items-center justify-between font-mono text-xs text-chrome/70 uppercase">
        <span>
          PROGRESS: <strong className="text-white drop-shadow-[0_0_6px_#00FFFF] font-bold">{percent}%</strong>
        </span>
        {isActive && (
          <div className="flex gap-4">
            <span>
              BITRATE: <strong className="text-neonCyan font-bold">{formatSpeed(transfer.speed)}</strong>
            </span>
            <span>
              REMAINING: <strong className="text-sunsetOrange font-bold">{formatEta(transfer.eta ?? null)}</strong>
            </span>
          </div>
        )}
        {transfer.error && <span className="text-neonMagenta font-bold truncate">[!] {transfer.error}</span>}
      </div>
    </li>
  );
}
