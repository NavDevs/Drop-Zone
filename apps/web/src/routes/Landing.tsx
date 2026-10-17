import { useState } from 'react';
import { useNavigate } from 'react-router';
import type { RoomCreatePayload } from '@dropzone/protocol';
import { buildDeviceInfo } from '../lib/device.js';
import { getSignalingClient } from '../lib/signaling/SignalingClient.js';
import { useRoomStore } from '../state/roomStore.js';
import { ErrorBanner } from '../components/ErrorBanner.js';

type TtlSec = NonNullable<RoomCreatePayload['ttlSec']>;

const TTL_CHOICES: { label: string; value: TtlSec }[] = [
  { label: '5 min', value: 300 },
  { label: '10 min', value: 600 },
  { label: '30 min', value: 1800 },
  { label: '1 hour', value: 3600 },
];

export function Landing() {
  const [code, setCode] = useState('');
  const [ttlSec, setTtlSec] = useState<TtlSec>(300);
  const [requireApproval, setRequireApproval] = useState(false);
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();
  const error = useRoomStore((s) => s.error);

  const client = getSignalingClient();

  const handleJoin = (): void => {
    if (code.length === 6) navigate(`/r/${code.toUpperCase()}`);
  };

  const handleCreate = async (): Promise<void> => {
    if (creating) return;
    setCreating(true);
    const res = await client.createRoom(buildDeviceInfo(), { ttlSec, requireApproval });
    setCreating(false);
    if (res.ok) navigate(`/r/${res.data.code}`);
    // on failure the store error is set; rendered below
  };

  return (
    <main className="flex min-h-[calc(100vh-3.5rem)] flex-col items-center justify-center gap-8 p-4">
      <div className="text-center">
        <h1 className="text-5xl font-bold tracking-tight">DropZone</h1>
        <p className="mt-3 text-lg text-gray-500 dark:text-gray-400">
          Peer-to-peer file transfer. No cloud. No accounts.
        </p>
      </div>

      {error && <div className="w-full max-w-md"><ErrorBanner message={error.message} /></div>}

      <div className="flex w-full max-w-md flex-col gap-4">
        <section className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Create a room</h2>
          <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Room lifetime">
            {TTL_CHOICES.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => setTtlSec(t.value)}
                aria-pressed={ttlSec === t.value}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary-500 ${
                  ttlSec === t.value
                    ? 'bg-primary-600 text-white'
                    : 'border border-gray-300 text-gray-700 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <label className="mt-3 flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input
              type="checkbox"
              checked={requireApproval}
              onChange={(e) => setRequireApproval(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
            />
            Require me to approve each device
          </label>
          <button
            type="button"
            onClick={() => void handleCreate()}
            disabled={creating}
            className="mt-4 w-full rounded-xl bg-primary-600 px-6 py-3 text-base font-semibold text-white shadow transition hover:bg-primary-700 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
          >
            {creating ? 'Creating…' : 'Create Room'}
          </button>
        </section>

        <section className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Join a room</h2>
          <div className="mt-3 flex gap-2">
            <label className="sr-only" htmlFor="join-code">Room code</label>
            <input
              id="join-code"
              type="text"
              maxLength={6}
              placeholder="Enter code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
              className="w-full rounded-xl border border-gray-300 px-4 py-3 text-center font-mono text-lg tracking-widest dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
            <button
              type="button"
              onClick={handleJoin}
              disabled={code.length !== 6}
              className="rounded-xl bg-gray-800 px-5 py-3 text-base font-semibold text-white transition hover:bg-gray-700 disabled:opacity-40 dark:bg-gray-200 dark:text-gray-900 dark:hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-500"
            >
              Join
            </button>
          </div>
        </section>
      </div>

      <p className="max-w-md text-center text-sm text-gray-400 dark:text-gray-500">
        Files travel directly between devices over an encrypted connection.
        The server only helps devices find each other — it never sees your files.
      </p>
    </main>
  );
}
