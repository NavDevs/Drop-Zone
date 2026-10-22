import { useTransfersStore } from '../state/transfersStore.js';
import { getTransferHub } from '../lib/transfer/TransferHub.js';
import { TransferRow } from './TransferRow.js';

export function TransferList() {
  const transfers = useTransfersStore((s) => s.transfers);
  const remove = useTransfersStore((s) => s.remove);
  const transferList = Object.values(transfers);

  if (transferList.length === 0) return null;

  const handleCancel = (id: number): void => {
    getTransferHub().cancelTransfer(id);
  };

  const handleClearFinished = (): void => {
    for (const t of transferList) {
      if (t.status === 'done' || t.status === 'cancelled' || t.status === 'declined' || t.status === 'error') {
        remove(t.id);
      }
    }
  };

  const hasFinished = transferList.some(
    (t) => t.status === 'done' || t.status === 'cancelled' || t.status === 'declined' || t.status === 'error',
  );

  return (
    <section aria-label="File transfers" className="flex flex-col gap-3 border-2 border-retroBorder bg-cardBg/90 backdrop-blur-md p-4 sm:p-5 shadow-panelGlow">
      <div className="flex items-center justify-between border-b border-retroBorder pb-3">
        <div className="flex items-center gap-2.5">
          <span className="relative flex h-3 w-3 items-center justify-center flex-shrink-0">
            <span className="absolute inline-flex h-full w-full bg-sunsetOrange opacity-80 shadow-[0_0_12px_#FF9900,0_0_24px_#FF9900]" />
            <span className="relative inline-flex h-1.5 w-1.5 bg-white shadow-[0_0_6px_#FFFFFF]" />
          </span>
          <h2 className="font-heading text-sm font-bold uppercase tracking-wider text-sunsetOrange">
            TRANSFERS ({transferList.length})
          </h2>
        </div>
        {hasFinished && (
          <button
            type="button"
            onClick={handleClearFinished}
            className="-skew-x-6 hover:skew-x-0 border border-retroBorder bg-black/40 px-3 py-1 font-mono text-xs uppercase tracking-wider text-chrome/60 hover:text-white hover-vapor-magenta transition cursor-pointer font-bold"
          >
            <span className="inline-block skew-x-6 hover:skew-x-0">CLEAR DONE</span>
          </button>
        )}
      </div>

      <ul className="flex flex-col gap-3">
        {transferList.map((t) => (
          <TransferRow key={t.id} transfer={t} onCancel={handleCancel} />
        ))}
      </ul>
    </section>
  );
}
