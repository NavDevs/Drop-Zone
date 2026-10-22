import { formatBytes, formatSpeed, formatEta } from '../lib/transfer/format.js';
import type { TransferRecord } from '../state/transfersStore.js';

interface TransferRowProps {
  transfer: TransferRecord;
  onCancel: (id: number) => void;
}

export function TransferRow({ transfer, onCancel }: TransferRowProps) {
  const percent = Math.round(transfer.progress * 100);
  const isSend = transfer.direction === 'send';
  const isActive = transfer.status === 'active';
  const isOffering = transfer.status === 'offering';
  const isDone = transfer.status === 'done';

  const statusBadge = () => {
    switch (transfer.status) {
      case 'active':
        return <span className="border border-neonCyan bg-neonCyan/10 px-2 py-0.5 text-xs font-mono font-bold text-neonCyan shadow-[0_0_8px_#00FFFF]">TRANSFERRING</span>;
      case 'offering':
        return <span className="border border-sunsetOrange bg-sunsetOrange/10 px-2 py-0.5 text-xs font-mono font-bold text-sunsetOrange">HANDSHAKE…</span>;
      case 'done':
        return (
          <span className="border border-neonMagenta bg-neonMagenta/10 px-2 py-0.5 text-xs font-mono font-bold text-neonMagenta shadow-[0_0_8px_#FF00FF]">
            {transfer.verified ? 'VERIFIED_SHA256 ✓' : 'COMPLETE'}
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
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {statusBadge()}

          {(isActive || isOffering) && (
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
                SAVE_DATA
              </span>
            </a>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div className="relative h-2 w-full overflow-hidden border border-retroBorder bg-black">
        <div
          role="progressbar"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
          style={{ width: `${percent}%` }}
          className={`h-full transition-all duration-150 ${
            transfer.status === 'error'
              ? 'bg-neonMagenta shadow-[0_0_10px_#FF00FF]'
              : transfer.status === 'done'
              ? 'bg-neonCyan shadow-[0_0_10px_#00FFFF]'
              : 'bg-gradient-to-r from-neonMagenta to-neonCyan shadow-[0_0_10px_#00FFFF]'
          }`}
        />
      </div>

      <div className="flex items-center justify-between font-mono text-xs text-chrome/60 uppercase">
        <span>PROGRESS: {percent}%</span>
        {isActive && (
          <div className="flex gap-4">
            <span>BITRATE: {formatSpeed(transfer.speed)}</span>
            <span>REMAINING: {formatEta(transfer.eta ?? null)}</span>
          </div>
        )}
        {transfer.error && <span className="text-neonMagenta font-bold truncate">[!] {transfer.error}</span>}
      </div>
    </li>
  );
}
