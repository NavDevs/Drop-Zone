import { useState } from 'react';
import { useNavigate } from 'react-router';

export function Landing() {
  const [code, setCode] = useState('');
  const navigate = useNavigate();

  const handleJoin = () => {
    if (code.length === 6) {
      navigate(`/r/${code.toUpperCase()}`);
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 p-4">
      <div className="text-center">
        <h1 className="text-5xl font-bold tracking-tight">DropZone</h1>
        <p className="mt-3 text-lg text-gray-500 dark:text-gray-400">
          Peer-to-peer file transfer. No cloud. No accounts.
        </p>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row">
        <button
          className="rounded-xl bg-primary-600 px-8 py-4 text-lg font-semibold text-white shadow-lg transition hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
          onClick={() => navigate('/r/new')}
        >
          Create Room
        </button>

        <div className="flex gap-2">
          <label className="sr-only" htmlFor="join-code">Room code</label>
          <input
            id="join-code"
            type="text"
            maxLength={6}
            placeholder="Enter code"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
            className="w-40 rounded-xl border border-gray-300 px-4 py-4 text-center text-lg font-mono tracking-widest dark:border-gray-700 dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
          <button
            onClick={handleJoin}
            disabled={code.length !== 6}
            className="rounded-xl bg-gray-800 px-6 py-4 text-lg font-semibold text-white transition hover:bg-gray-700 disabled:opacity-40 dark:bg-gray-200 dark:text-gray-900 dark:hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-500"
          >
            Join
          </button>
        </div>
      </div>

      <p className="max-w-md text-center text-sm text-gray-400 dark:text-gray-500">
        Files travel directly between devices over an encrypted connection.
        Our server only helps devices find each other — it never sees your files.
      </p>
    </main>
  );
}
