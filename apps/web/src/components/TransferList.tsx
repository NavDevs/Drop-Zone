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
    <section aria-label="File transfers" className="mt-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
          Transfers ({transferList.length})
        </h2>
        {hasFinished && (
          <button
            type="button"
            onClick={handleClearFinished}
            className="text-xs font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            Clear finished
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
