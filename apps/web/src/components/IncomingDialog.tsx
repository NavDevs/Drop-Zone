import { formatBytes } from '../lib/transfer/format.js';
import type { IncomingOffer } from '../lib/transfer/TransferHub.js';

interface IncomingDialogProps {
  offers: IncomingOffer[];
  onAccept: (transferId: number) => void;
  onDecline: (transferId: number) => void;
}

export function IncomingDialog({ offers, onAccept, onDecline }: IncomingDialogProps) {
  if (offers.length === 0) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="incoming-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
    >
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl dark:bg-gray-900 border border-gray-200 dark:border-gray-800">
        <h2 id="incoming-title" className="text-xl font-bold text-gray-900 dark:text-gray-100">
          Incoming File{offers.length > 1 ? 's' : ''}
        </h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          No files will be written to disk until you explicitly accept.
        </p>

        <div className="mt-4 max-h-64 space-y-3 overflow-y-auto">
          {offers.map((offer) => (
            <div
              key={offer.transferId}
              className="rounded-xl border border-gray-200 p-3.5 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100" title={offer.name}>
                    {offer.name}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    From <span className="font-medium text-gray-700 dark:text-gray-300">{offer.senderName}</span> • {formatBytes(offer.size)}
                  </p>
                </div>
              </div>

              {offer.dangerous && (
                <div className="mt-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60">
                  ⚠️ <strong>Warning:</strong> This file is an executable or script. Never run files from untrusted peers.
                </div>
              )}

              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  data-testid={`accept-transfer-${offer.transferId}`}
                  onClick={() => onAccept(offer.transferId)}
                  className="flex-1 rounded-lg bg-primary-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  Accept
                </button>
                <button
                  type="button"
                  data-testid={`decline-transfer-${offer.transferId}`}
                  onClick={() => onDecline(offer.transferId)}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                >
                  Decline
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
