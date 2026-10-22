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
    <div className="flex flex-col items-center gap-3 border-2 border-retroBorder border-t-2 border-t-neonMagenta bg-cardBg/95 p-4 sm:p-5 shadow-panelGlow max-w-xs w-full">
      <div className="flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-neonMagenta font-bold">
        <span>// DEVICE HANDSHAKE QR</span>
      </div>
      <div className="border-2 border-neonCyan bg-white p-3 shadow-[0_0_15px_rgba(0,255,255,0.4)]" data-testid="qr-code">
        <QRCodeSVG value={url} size={140} marginSize={0} />
      </div>
      <p className="font-mono text-xs uppercase tracking-wider text-chrome/80 text-center">
        Scan with camera to join instantly
      </p>
      <p className="max-w-[14rem] truncate font-mono text-[11px] text-neonCyan/80 bg-black/60 px-3 py-1 border border-retroBorder text-center" title={url}>
        {url}
      </p>
    </div>
  );
}
