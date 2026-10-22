interface Props {
  message: string;
  onDismiss?: () => void;
}

/** Inline error banner. `role=alert` so screen readers announce it. */
export function ErrorBanner({ message, onDismiss }: Props) {
  return (
    <div
      role="alert"
      className="flex items-start justify-between gap-3 border-2 border-sunsetOrange border-l-4 border-l-sunsetOrange bg-cardBg/95 p-3.5 sm:p-4 shadow-[0_0_20px_rgba(255,153,0,0.25)] backdrop-blur-md"
    >
      <div className="flex items-start gap-2.5">
        <span className="font-mono text-sunsetOrange font-bold text-sm leading-tight flex-shrink-0">
          [!]
        </span>
        <p className="font-mono text-xs sm:text-sm text-sunsetOrange uppercase tracking-wide leading-relaxed">
          {message}
        </p>
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss error"
          className="-skew-x-6 hover:skew-x-0 border border-sunsetOrange/50 bg-black/60 px-2.5 py-1 font-mono text-xs text-sunsetOrange hover-vapor-orange transition cursor-pointer shrink-0 font-bold"
        >
          <span className="inline-block skew-x-6 hover:skew-x-0">[X]</span>
        </button>
      )}
    </div>
  );
}
