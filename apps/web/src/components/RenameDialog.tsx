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
      className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl dark:bg-gray-900"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id={titleId} className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Rename this device
        </h2>
        <label htmlFor="rename-input" className="mt-3 block text-sm font-medium text-gray-700 dark:text-gray-300">
          Device name
        </label>
        <input
          id="rename-input"
          ref={inputRef}
          value={name}
          maxLength={MAX_LEN}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
        />
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={name.trim().length === 0}
            className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
