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
    <header className="flex flex-col gap-4 rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">Room code</p>
          <p
            className="font-mono text-3xl font-bold tracking-[0.3em] text-gray-900 sm:text-4xl dark:text-gray-100"
            aria-label={`Room code ${code.split('').join(' ')}`}
            data-testid="room-code"
          >
            {code}
          </p>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400" aria-live="polite">
            {seconds > 0 ? `Code expires in ${formatCountdown(seconds)}` : 'Code expired'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void copy()}
            className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            {copied ? 'Copied!' : 'Copy link'}
          </button>
          <button
            type="button"
            onClick={() => setShowQr((v) => !v)}
            aria-expanded={showQr}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
          >
            {showQr ? 'Hide QR' : 'Show QR'}
          </button>
          {onRename && (
            <button
              type="button"
              onClick={onRename}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
            >
              Rename
            </button>
          )}
        </div>
      </div>

      {showQr && (
        <div className="flex justify-center">
          <QrCard code={code} />
        </div>
      )}

      <div className="flex flex-wrap gap-2 border-t border-gray-100 pt-3 dark:border-gray-800">
        {isHost && onRegenerate && (
          <button
            type="button"
            onClick={onRegenerate}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
          >
            New code
          </button>
        )}
        {isHost && onCloseRoom && (
          <button
            type="button"
            onClick={onCloseRoom}
            className="rounded-lg border border-red-300 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950/40"
          >
            Close room
          </button>
        )}
        {onLeave && (
          <button
            type="button"
            onClick={onLeave}
            className="ml-auto rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
          >
            Leave
          </button>
        )}
      </div>
    </header>
  );
}
