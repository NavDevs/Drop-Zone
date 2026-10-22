import { useEffect, useId, useRef, useState } from 'react';

interface Props {
  initialName: string;
  onSave: (name: string) => void;
  onClose: () => void;
}

const MAX_LEN = 32;

/** Modal rename dialog (FR-04). Focus-trapped, Esc to close, label bound to input. */
export function RenameDialog({ initialName, onSave, onClose }: Props) {
  const [name, setName] = useState(initialName);
  const inputRef = useRef<HTMLInputElement>(null);
  const titleId = useId();

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const submit = (): void => {
    const trimmed = name.trim();
    if (trimmed.length > 0) onSave(trimmed.slice(0, MAX_LEN));
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md border-2 border-neonCyan border-t-4 border-t-neonMagenta bg-void/95 p-5 sm:p-6 shadow-[0_0_30px_rgba(0,255,255,0.25)] relative"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-retroBorder pb-3">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5 items-center justify-center flex-shrink-0">
              <span className="absolute inline-flex h-full w-full bg-neonMagenta opacity-80 shadow-[0_0_10px_#FF00FF]" />
              <span className="relative inline-flex h-1.5 w-1.5 bg-white" />
            </span>
            <h2 id={titleId} className="font-heading text-base sm:text-lg font-black tracking-widest text-white uppercase neon-glow-magenta">
              Rename this device
            </h2>
          </div>
          <div className="flex gap-1.5">
            <span className="h-2 w-2 rounded-full bg-neonMagenta" />
            <span className="h-2 w-2 rounded-full bg-neonCyan" />
          </div>
        </div>

        <p className="mt-2 text-xs font-mono uppercase tracking-wider text-chrome/60">
          // CONFIGURE NODE CALLSIGN VISIBLE TO OTHERS IN THE ROOM
        </p>

        <label htmlFor="rename-input" className="mt-4 block font-heading text-xs uppercase tracking-wider text-chrome/80">
          &gt; Device name:
        </label>
        <input
          id="rename-input"
          ref={inputRef}
          value={name}
          maxLength={MAX_LEN}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          className="mt-2 w-full border-b-2 border-neonMagenta bg-black/70 px-3.5 py-2.5 font-mono text-base text-neonCyan placeholder:text-neonMagenta/40 focus:border-neonCyan focus:shadow-[0_0_15px_#00FFFF] focus:outline-none"
        />
        <div className="mt-1 flex justify-between font-mono text-[11px] text-chrome/50">
          <span>alphanumeric &amp; spaces allowed</span>
          <span>{name.length} / {MAX_LEN}</span>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="-skew-x-6 hover:skew-x-0 border border-retroBorder bg-black/60 px-4 py-2 font-mono text-xs uppercase tracking-wider text-chrome/70 hover-vapor-magenta transition cursor-pointer font-bold"
          >
            <span className="inline-block skew-x-6 hover:skew-x-0">
              Cancel
            </span>
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={name.trim().length === 0}
            className="-skew-x-12 hover:skew-x-0 border-2 border-neonCyan vapor-button-cyan hover-vapor-cyan px-6 py-2 font-heading text-xs font-black uppercase tracking-widest text-white disabled:opacity-40 transition cursor-pointer"
          >
            <span className="inline-block skew-x-12 hover:skew-x-0">
              Save
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
