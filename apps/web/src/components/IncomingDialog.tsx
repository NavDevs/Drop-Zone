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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
    >
      <div
        style={{ borderRadius: '255px 15px 225px 15px / 15px 225px 15px 255px' }}
        className="w-full max-w-md border-[3px] border-lead bg-paper p-6 shadow-sketch-lg rotate-[0.5deg]"
      >
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full bg-markerRed border border-lead"></span>
          <h2 id="incoming-title" className="font-heading text-2xl font-bold text-lead">
            Incoming File{offers.length > 1 ? 's' : ''} 📦
          </h2>
        </div>
        <p className="mt-1 text-base text-lead/70">
          A peer wants to send you a file. Click Accept to receive and save it.
        </p>

        <div className="mt-4 max-h-64 space-y-3 overflow-y-auto">
          {offers.map((offer) => (
            <div
              key={offer.transferId}
              style={{ borderRadius: '185px 25px 195px 20px / 20px 195px 25px 185px' }}
              className="border-2 border-lead bg-white p-3.5 shadow-sketch-sm -rotate-[0.3deg]"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-heading text-base font-bold text-lead" title={offer.name}>
                    {offer.name}
                  </p>
                  <p className="text-sm text-lead/70">
                    From <span className="font-bold text-lead">{offer.senderName}</span> • {formatBytes(offer.size)}
                  </p>
                </div>
              </div>

              {offer.dangerous && (
                <div className="mt-2 rounded border-2 border-dashed border-amber-600 bg-amber-50 p-2 text-xs font-semibold text-amber-900">
                  ⚠️ <strong>Warning:</strong> Executable file. Never run untrusted scripts!
                </div>
              )}

              {offer.lowSpaceWarning && (
                <div className="mt-2 rounded border-2 border-dashed border-markerRed bg-red-50 p-2 text-xs font-semibold text-markerRed">
                  ⚠️ <strong>Storage Warning:</strong> Device disk space may be low.
                </div>
              )}

              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  data-testid={`accept-transfer-${offer.transferId}`}
                  onClick={() => onAccept(offer.transferId)}
                  style={{ borderRadius: '255px 25px 225px 25px / 25px 225px 25px 255px' }}
                  className="flex-1 border-2 border-lead bg-markerRed py-2 text-base font-heading font-bold text-white shadow-sketch-sm hover:shadow-none hover:translate-x-0.5 hover:translate-y-0.5 transition cursor-pointer"
                >
                  Accept & Save
                </button>
                <button
                  type="button"
                  data-testid={`decline-transfer-${offer.transferId}`}
                  onClick={() => onDecline(offer.transferId)}
                  style={{ borderRadius: '255px 25px 225px 25px / 25px 225px 25px 255px' }}
                  className="border-2 border-lead bg-paper px-4 py-2 text-base font-heading font-bold text-lead shadow-sketch-sm hover:bg-mutedPaper transition cursor-pointer"
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
