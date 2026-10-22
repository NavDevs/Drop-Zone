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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-md"
    >
      <div className="w-full max-w-md border-2 border-neonCyan border-t-4 border-t-neonMagenta bg-void/95 p-6 shadow-neonCyan">
        <div className="flex items-center justify-between border-b border-retroBorder pb-3">
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 bg-neonMagenta shadow-[0_0_8px_#FF00FF]" />
            <h2 id="incoming-title" className="font-heading text-lg font-black tracking-widest text-white uppercase">
              INBOUND_DATA_TRANSMISSION
            </h2>
          </div>
          <div className="flex gap-1.5">
            <span className="h-2 w-2 rounded-full bg-neonMagenta" />
            <span className="h-2 w-2 rounded-full bg-neonCyan" />
          </div>
        </div>

        <p className="mt-2 text-xs font-mono uppercase tracking-wider text-chrome/60">
          // CONSENT_REQUIRED: AUTHORIZE RECEPTION TO WRITE LOCALLY
        </p>

        <div className="mt-4 max-h-64 space-y-3 overflow-y-auto">
          {offers.map((offer) => (
            <div
              key={offer.transferId}
              className="border border-retroBorder bg-cardBg/80 p-3.5"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-heading text-sm font-bold text-neonCyan" title={offer.name}>
                    &gt; {offer.name}
                  </p>
                  <p className="text-xs font-mono text-chrome/70 mt-1 uppercase">
                    ORIGIN: <span className="text-white font-bold">{offer.senderName}</span> · SIZE: {formatBytes(offer.size)}
                  </p>
                </div>
              </div>

              {offer.dangerous && (
                <div className="mt-2 border border-sunsetOrange bg-sunsetOrange/10 p-2 text-xs font-mono text-sunsetOrange">
                  [!] ALERT: EXECUTABLE CODE DETECTED. PROCEED WITH CAUTION.
                </div>
              )}

              {offer.lowSpaceWarning && (
                <div className="mt-2 border border-neonMagenta bg-neonMagenta/10 p-2 text-xs font-mono text-neonMagenta">
                  [!] STORAGE WARNING: LOCAL CAPACITY CRITICAL.
                </div>
              )}

              <div className="mt-3.5 flex gap-2.5">
                <button
                  type="button"
                  data-testid={`accept-transfer-${offer.transferId}`}
                  onClick={() => onAccept(offer.transferId)}
                  className="flex-1 -skew-x-12 border-2 border-neonCyan vapor-button-cyan hover-vapor-cyan py-2 font-heading text-xs font-bold uppercase tracking-wider text-white hover:skew-x-0 transition cursor-pointer font-extrabold"
                >
                  <span className="inline-block skew-x-12 hover:skew-x-0">
                    ACCEPT_STREAM &gt;&gt;
                  </span>
                </button>
                <button
                  type="button"
                  data-testid={`decline-transfer-${offer.transferId}`}
                  onClick={() => onDecline(offer.transferId)}
                  className="-skew-x-12 border border-retroBorder bg-black/60 hover-vapor-magenta px-5 py-2 font-mono text-xs uppercase tracking-wider text-chrome/70 hover:skew-x-0 transition cursor-pointer font-bold"
                >
                  <span className="inline-block skew-x-12 hover:skew-x-0">
                    DECLINE
                  </span>
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
