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
    <header className="flex flex-col gap-4 border-2 border-retroBorder border-t-2 border-t-neonCyan bg-cardBg/90 backdrop-blur-md p-5 shadow-panelGlow">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-widest text-neonCyan font-bold">
            // ACTIVE_PORTAL_SESSION
          </p>
          <p
            className="font-mono text-3xl sm:text-5xl font-black tracking-[0.25em] text-white drop-shadow-[0_0_15px_#00FFFF]"
            aria-label={`Room code ${code.split('').join(' ')}`}
            data-testid="room-code"
          >
            {code}
          </p>
          <p className="mt-1 font-mono text-xs uppercase tracking-wider text-chrome/60" aria-live="polite">
            {seconds > 0 ? `[ TIME_TO_EXPIRY: ${formatCountdown(seconds)} ]` : '[ SESSION_EXPIRED ]'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <button
            type="button"
            onClick={() => void copy()}
            className="-skew-x-12 border-2 border-neonCyan bg-transparent px-4 py-1.5 font-heading text-xs font-bold uppercase tracking-wider text-neonCyan hover:skew-x-0 hover:bg-neonCyan hover:text-black hover:shadow-[0_0_15px_#00FFFF] transition cursor-pointer"
          >
            <span className="inline-block skew-x-12 hover:skew-x-0">
              {copied ? 'LINK_COPIED ✓' : 'COPY_COORDINATES'}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setShowQr((v) => !v)}
            aria-expanded={showQr}
            className="-skew-x-12 border-2 border-neonMagenta bg-transparent px-4 py-1.5 font-heading text-xs font-bold uppercase tracking-wider text-neonMagenta hover:skew-x-0 hover:bg-neonMagenta hover:text-black hover:shadow-[0_0_15px_#FF00FF] transition cursor-pointer"
          >
            <span className="inline-block skew-x-12 hover:skew-x-0">
              {showQr ? 'HIDE_OPTICS' : 'OPTICAL_QR ▲'}
            </span>
          </button>
          {onRename && (
            <button
              type="button"
              onClick={onRename}
              className="-skew-x-12 border border-retroBorder bg-black/40 px-3 py-1.5 font-mono text-xs uppercase tracking-wider text-chrome/80 hover:border-chrome transition cursor-pointer"
            >
              <span className="inline-block skew-x-12 hover:skew-x-0">
                RENAME
              </span>
            </button>
          )}
        </div>
      </div>

      {showQr && (
        <div className="flex justify-center my-3 p-4 border border-retroBorder bg-black/80">
          <QrCard code={code} />
        </div>
      )}

      <div className="flex flex-wrap gap-2.5 border-t border-retroBorder pt-3.5">
        {isHost && onRegenerate && (
          <button
            type="button"
            aria-label="New code"
            onClick={onRegenerate}
            className="border border-neonCyan/40 bg-black/50 px-3 py-1 font-mono text-xs uppercase tracking-wider text-neonCyan hover:border-neonCyan hover:bg-neonCyan/10 cursor-pointer"
          >
            CYCLE_CODE
          </button>
        )}
        {isHost && onCloseRoom && (
          <button
            type="button"
            aria-label="Close room"
            onClick={onCloseRoom}
            className="border border-sunsetOrange/50 bg-black/50 px-3 py-1 font-mono text-xs uppercase tracking-wider text-sunsetOrange hover:border-sunsetOrange hover:bg-sunsetOrange/10 cursor-pointer"
          >
            TERMINATE_SESSION
          </button>
        )}
        {onLeave && (
          <button
            type="button"
            aria-label="Leave"
            onClick={onLeave}
            className="ml-auto border border-retroBorder bg-black/40 px-4 py-1 font-mono text-xs uppercase tracking-wider text-chrome/60 hover:text-white cursor-pointer"
          >
            DISCONNECT
          </button>
        )}
      </div>
    </header>
  );
}
