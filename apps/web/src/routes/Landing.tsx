import { useState } from 'react';
import { useNavigate } from 'react-router';
import type { RoomCreatePayload } from '@dropzone/protocol';
import { buildDeviceInfo } from '../lib/device.js';
import { getSignalingClient } from '../lib/signaling/SignalingClient.js';
import { useRoomStore } from '../state/roomStore.js';
import { useSettingsStore } from '../state/settingsStore.js';
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
  const deviceName = useSettingsStore((s) => s.deviceName);
  const setDeviceName = useSettingsStore((s) => s.setDeviceName);
  const [nameInput, setNameInput] = useState(deviceName);
  const navigate = useNavigate();
  const error = useRoomStore((s) => s.error);

  const client = getSignalingClient();

  const handleJoin = (): void => {
    const finalName = nameInput.trim() || deviceName;
    setDeviceName(finalName);
    if (code.length === 6) navigate(`/r/${code.toUpperCase()}`);
  };

  const handleCreate = async (): Promise<void> => {
    if (creating) return;
    setCreating(true);
    const finalName = nameInput.trim() || deviceName;
    setDeviceName(finalName);
    const device = { ...buildDeviceInfo(), name: finalName };
    const res = await client.createRoom(device, { ttlSec, requireApproval });
    setCreating(false);
    if (res.ok) navigate(`/r/${res.data.code}`);
    // on failure the store error is set; rendered below
  };

  return (
    <main className="flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center gap-8 p-4 md:p-8">
      {/* Vaporwave Hero Banner (Matching ACME.SYS screenshot) */}
      <div className="text-center relative max-w-3xl">
        <div className="inline-block border border-neonCyan/60 bg-neonCyan/10 px-3 py-1 font-mono text-xs uppercase tracking-widest text-neonCyan -skew-x-12 mb-4 shadow-[0_0_15px_rgba(0,255,255,0.3)]">
          &gt; v2.0 SYSTEM ONLINE // P2P DATA PROTOCOL
        </div>

        <h1 className="font-heading text-4xl sm:text-6xl md:text-7xl font-black uppercase tracking-tight text-white drop-shadow-[0_0_25px_rgba(255,255,255,0.4)]">
          TRANSFORM
        </h1>
        <h2 className="sunset-gradient-text font-heading text-4xl sm:text-6xl md:text-7xl font-black uppercase tracking-tight mt-1">
          THE WAY YOU SHARE
        </h2>

        <p className="mt-4 text-base sm:text-lg md:text-xl text-chrome/70 font-mono max-w-xl mx-auto">
          High-velocity peer-to-peer data transport directly over WebRTC. Zero cloud storage. No file limits.
        </p>
      </div>

      {error && (
        <div className="w-full max-w-md">
          <ErrorBanner message={error.message} />
        </div>
      )}

      {/* Retro-Futuristic Terminal Control Boxes */}
      <div className="flex w-full max-w-xl flex-col gap-6">
        {/* Device Identity Terminal */}
        <section className="border-2 border-retroBorder border-t-2 border-t-neonMagenta bg-cardBg/90 backdrop-blur-md p-5 shadow-panelGlow relative">
          <div className="flex items-center justify-between border-b border-retroBorder pb-2.5 mb-4">
            <span className="font-mono text-xs text-neonMagenta font-bold tracking-widest uppercase">
              // TERMINAL_NODE_ID
            </span>
            <div className="flex gap-1.5">
              <span className="h-2 w-2 rounded-full bg-neonMagenta" />
              <span className="h-2 w-2 rounded-full bg-neonCyan" />
              <span className="h-2 w-2 rounded-full bg-sunsetOrange" />
            </div>
          </div>
          
          <label htmlFor="device-name-input" className="block font-heading text-xs uppercase tracking-wider text-chrome/80">
            &gt; ENTER_CALLSIGN:
          </label>
          <input
            id="device-name-input"
            type="text"
            maxLength={30}
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            placeholder="e.g. CYBER_DECK_01"
            className="mt-2 w-full border-b-2 border-neonMagenta bg-black/60 px-3 py-2 font-mono text-lg text-neonCyan placeholder:text-neonMagenta/40 focus:border-neonCyan focus:shadow-[0_0_15px_#00FFFF] focus:outline-none"
          />
        </section>

        {/* Create / Initialize Matrix Section */}
        <section className="border-2 border-retroBorder border-t-2 border-t-neonCyan bg-cardBg/90 backdrop-blur-md p-5 shadow-panelGlow">
          <div className="flex items-center justify-between border-b border-retroBorder pb-2.5 mb-4">
            <span className="font-mono text-xs text-neonCyan font-bold tracking-widest uppercase">
              // INITIALIZE_SESSION_POD
            </span>
            <span className="font-mono text-xs text-chrome/40">[SECURE_DTLS]</span>
          </div>

          <p className="text-xs uppercase font-mono tracking-wider text-chrome/70 mb-3">
            &gt; CODE_EXPIRY_THRESHOLD:
          </p>
          <div className="flex flex-wrap gap-2.5" role="group" aria-label="Room lifetime">
            {TTL_CHOICES.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => setTtlSec(t.value)}
                aria-pressed={ttlSec === t.value}
                className={`font-mono text-xs uppercase tracking-wider px-3.5 py-1.5 border transition-all cursor-pointer ${
                  ttlSec === t.value
                    ? 'border-neonCyan bg-neonCyan text-black font-extrabold shadow-[0_0_15px_rgba(0,255,255,0.7)]'
                    : 'border-retroBorder bg-black/50 text-chrome/80 hover:border-neonCyan hover:text-neonCyan'
                }`}
              >
                [{t.label}]
              </button>
            ))}
          </div>

          <label className="mt-4 flex items-center gap-2 text-xs uppercase font-mono text-chrome/80 select-none cursor-pointer">
            <input
              type="checkbox"
              checked={requireApproval}
              onChange={(e) => setRequireApproval(e.target.checked)}
              className="h-4 w-4 rounded-none border border-neonMagenta bg-black text-neonMagenta accent-neonMagenta focus:ring-0 cursor-pointer"
            />
            REQUIRE_HOST_CLEARANCE_APPROVAL
          </label>

          <button
            type="button"
            aria-label="Create room"
            onClick={() => void handleCreate()}
            disabled={creating}
            className="mt-6 w-full -skew-x-12 border-2 border-neonCyan bg-transparent py-3.5 font-heading text-lg font-bold uppercase tracking-widest text-neonCyan hover:skew-x-0 hover:bg-neonCyan hover:text-black hover:shadow-[0_0_25px_#00FFFF] active:scale-95 disabled:opacity-50 transition-all cursor-pointer"
          >
            <span className="inline-block skew-x-12 hover:skew-x-0">
              {creating ? '> INITIALIZING_PORTAL…' : 'CREATE ROOM >>'}
            </span>
          </button>
        </section>

        {/* Join Matrix Node Section */}
        <section className="border-2 border-retroBorder border-t-2 border-t-sunsetOrange bg-cardBg/90 backdrop-blur-md p-5 shadow-panelGlow">
          <div className="flex items-center justify-between border-b border-retroBorder pb-2.5 mb-4">
            <span className="font-mono text-xs text-sunsetOrange font-bold tracking-widest uppercase">
              // CONNECT_TO_PORTAL
            </span>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <label className="sr-only" htmlFor="join-code">Room code</label>
            <input
              id="join-code"
              type="text"
              maxLength={6}
              placeholder="ENTER 6-CHAR CODE"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
              className="flex-1 border-b-2 border-sunsetOrange bg-black/60 px-4 py-2 text-center font-mono text-xl tracking-[0.2em] text-sunsetOrange placeholder:text-sunsetOrange/40 focus:border-neonCyan focus:shadow-[0_0_15px_#00FFFF] focus:outline-none"
            />
            <button
              type="button"
              aria-label="Join"
              onClick={handleJoin}
              disabled={code.length !== 6}
              className="-skew-x-12 border-2 border-neonMagenta bg-neonMagenta px-8 py-2.5 font-heading text-sm font-bold uppercase tracking-widest text-white hover:skew-x-0 hover:bg-transparent hover:text-neonMagenta hover:shadow-[0_0_20px_#FF00FF] disabled:opacity-40 transition-all cursor-pointer"
            >
              <span className="inline-block skew-x-12 hover:skew-x-0">
                JOIN
              </span>
            </button>
          </div>
        </section>
      </div>

      <p className="max-w-md text-center font-mono text-xs text-chrome/50 uppercase tracking-widest">
        // ENCRYPTED DIRECT STREAMING · ZERO SERVER LOGS //
      </p>
    </main>
  );
}
