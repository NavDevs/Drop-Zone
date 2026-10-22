import { useState } from 'react';
import { formatCountdown, useCountdown } from '../hooks/useCountdown.js';
import { QrCard } from './QrCard.js';

interface Props {
  code: string;
  codeExpiresAt: number | null;
  isHost: boolean;
  onRegenerate?: () => void;
  onCloseRoom?: () => void;
  onLeave?: () => void;
  onRename?: () => void;
}

/** Room bar: big code, live expiry countdown (aria-live), copy/QR, host actions (FR-03, FR-06). */
export function RoomHeader({ code, codeExpiresAt, isHost, onRegenerate, onCloseRoom, onLeave, onRename }: Props) {
  const seconds = useCountdown(codeExpiresAt);
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);

  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/r/${code}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable (insecure context) — QR remains
    }
  };

  return (
    <header
      style={{ borderRadius: '255px 15px 225px 15px / 15px 225px 15px 255px' }}
      className="flex flex-col gap-4 border-[3px] border-lead bg-white p-5 shadow-sketch -rotate-[0.3deg]"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-heading text-xs font-bold uppercase tracking-wider text-lead/60">Room code</p>
          <p
            className="font-mono text-3xl font-bold tracking-[0.3em] text-lead sm:text-4xl"
            aria-label={`Room code ${code.split('').join(' ')}`}
            data-testid="room-code"
          >
            {code}
          </p>
          <p className="mt-1 text-base text-lead/70" aria-live="polite">
            {seconds > 0 ? `⏱️ Code expires in ${formatCountdown(seconds)}` : '⚠️ Code expired'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void copy()}
            style={{ borderRadius: '255px 25px 225px 25px / 25px 225px 25px 255px' }}
            className="border-2 border-lead bg-paper px-4 py-1.5 text-base font-bold text-lead shadow-sketch-sm hover:bg-markerRed hover:text-white transition-all cursor-pointer"
          >
            {copied ? 'Copied! ✓' : 'Copy link'}
          </button>
          <button
            type="button"
            onClick={() => setShowQr((v) => !v)}
            aria-expanded={showQr}
            style={{ borderRadius: '255px 25px 225px 25px / 25px 225px 25px 255px' }}
            className="border-2 border-lead bg-paper px-4 py-1.5 text-base font-bold text-lead shadow-sketch-sm hover:bg-mutedPaper transition-all cursor-pointer"
          >
            {showQr ? 'Hide QR' : 'Show QR 📱'}
          </button>
          {onRename && (
            <button
              type="button"
              onClick={onRename}
              style={{ borderRadius: '255px 25px 225px 25px / 25px 225px 25px 255px' }}
              className="border-2 border-lead bg-paper px-4 py-1.5 text-base font-bold text-lead shadow-sketch-sm hover:bg-mutedPaper transition-all cursor-pointer"
            >
              Rename
            </button>
          )}
        </div>
      </div>

      {showQr && (
        <div className="flex justify-center my-2">
          <QrCard code={code} />
        </div>
      )}

      <div className="flex flex-wrap gap-2 border-t-2 border-dashed border-lead/30 pt-3">
        {isHost && onRegenerate && (
          <button
            type="button"
            onClick={onRegenerate}
            style={{ borderRadius: '255px 25px 225px 25px / 25px 225px 25px 255px' }}
            className="border-2 border-lead bg-paper px-3 py-1 text-sm font-semibold text-lead shadow-sketch-sm hover:bg-mutedPaper cursor-pointer"
          >
            New code
          </button>
        )}
        {isHost && onCloseRoom && (
          <button
            type="button"
            onClick={onCloseRoom}
            style={{ borderRadius: '255px 25px 225px 25px / 25px 225px 25px 255px' }}
            className="border-2 border-markerRed bg-white px-3 py-1 text-sm font-semibold text-markerRed shadow-sketch-sm hover:bg-markerRed hover:text-white cursor-pointer"
          >
            Close room
          </button>
        )}
        {onLeave && (
          <button
            type="button"
            onClick={onLeave}
            style={{ borderRadius: '255px 25px 225px 25px / 25px 225px 25px 255px' }}
            className="ml-auto border-2 border-lead bg-paper px-3 py-1 text-sm font-semibold text-lead shadow-sketch-sm hover:bg-mutedPaper cursor-pointer"
          >
            Leave
          </button>
        )}
      </div>
    </header>
  );
}
