import { QRCodeSVG } from 'qrcode.react';
import { useMemo } from 'react';

interface Props {
  code: string;
  origin?: string;
}

/** QR code encoding the join URL (FR-03). Scanning opens /r/<code> on the device. */
export function QrCard({ code, origin }: Props) {
  const url = useMemo(() => {
    const base = origin ?? (typeof window !== 'undefined' ? window.location.origin : '');
    return `${base}/r/${code}`;
  }, [code, origin]);

  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
      <div className="rounded-xl bg-white p-2" data-testid="qr-code">
        <QRCodeSVG value={url} size={128} marginSize={0} />
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400">Scan to join on another device</p>
      <p className="max-w-[10rem] truncate font-mono text-[11px] text-gray-400 dark:text-gray-500" title={url}>
        {url}
      </p>
    </div>
  );
}
