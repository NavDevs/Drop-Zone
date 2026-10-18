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
        return <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">Transferring</span>;
      case 'offering':
        return <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300">Offering…</span>;
      case 'done':
        return <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/40 dark:text-green-300">Complete</span>;
      case 'declined':
        return <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-300">Declined</span>;
      case 'cancelled':
        return <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-300">Cancelled</span>;
      case 'error':
        return <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900/40 dark:text-red-300">Failed</span>;
      default:
        return null;
    }
  };

  return (
    <li
      data-testid={`transfer-row-${transfer.id}`}
      className="flex flex-col gap-2 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900 shadow-sm"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <span
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300"
            aria-hidden="true"
          >
            {isSend ? '↑' : '↓'}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100" title={transfer.name}>
              {transfer.name}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {formatBytes(transfer.transferred)} of {formatBytes(transfer.size)}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {statusBadge()}

          {(isActive || isOffering) && (
            <button
              type="button"
              onClick={() => onCancel(transfer.id)}
              className="rounded-lg border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              Cancel
            </button>
          )}

          {isDone && transfer.downloadUrl && (
            <a
              href={transfer.downloadUrl}
              download={transfer.name}
              data-testid={`download-link-${transfer.id}`}
              className="rounded-lg bg-primary-600 px-3 py-1 text-xs font-semibold text-white hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              Save File
            </a>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div className="relative h-2 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
        <div
          role="progressbar"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
          style={{ width: `${percent}%` }}
          className={`h-full transition-all duration-200 ${
            transfer.status === 'error'
              ? 'bg-red-500'
              : transfer.status === 'done'
              ? 'bg-green-500'
              : 'bg-primary-600'
          }`}
        />
      </div>

      <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
        <span>{percent}%</span>
        {isActive && (
          <div className="flex gap-3">
            <span>Speed: {formatSpeed(transfer.speed)}</span>
            <span>ETA: {formatEta(transfer.eta ?? null)}</span>
          </div>
        )}
        {transfer.error && <span className="text-red-500 truncate">{transfer.error}</span>}
      </div>
    </li>
  );
}
