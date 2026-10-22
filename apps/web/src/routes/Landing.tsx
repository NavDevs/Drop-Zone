import { useState } from 'react';
import { useNavigate } from 'react-router';
import { buildDeviceInfo } from '../lib/device.js';
import { getSignalingClient } from '../lib/signaling/SignalingClient.js';
import { requestNotificationPermission } from '../lib/notifications.js';
import { useRoomStore } from '../state/roomStore.js';
import { useSettingsStore } from '../state/settingsStore.js';
import { ErrorBanner } from '../components/ErrorBanner.js';

export function Landing() {
  const [code, setCode] = useState('');
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
    void requestNotificationPermission();
    if (code.length === 6) navigate(`/r/${code.toUpperCase()}`);
  };

  const handleCreate = async (): Promise<void> => {
    if (creating) return;
    setCreating(true);
    const finalName = nameInput.trim() || deviceName;
    setDeviceName(finalName);
    void requestNotificationPermission();
    const device = { ...buildDeviceInfo(), name: finalName };
    const res = await client.createRoom(device);
    setCreating(false);
    if (res.ok) navigate(`/r/${res.data.code}`);
    // on failure the store error is set; rendered below
  };

  return (
    <main className="flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center gap-6 sm:gap-8 px-3 py-6 sm:p-6 md:p-8">
      {/* Hero Banner */}
      <div className="text-center relative max-w-3xl">
        <div className="inline-block border border-neonCyan/60 bg-neonCyan/10 px-3 py-1 font-mono text-xs uppercase tracking-widest text-neonCyan -skew-x-12 mb-4 shadow-[0_0_15px_rgba(0,255,255,0.3)]">
          &gt; No accounts. No cloud. Files go device-to-device.
        </div>

        <h1 className="font-heading text-4xl sm:text-6xl md:text-7xl font-black uppercase tracking-tight text-white drop-shadow-[0_0_25px_rgba(255,255,255,0.4)]">
          DROP
        </h1>
        <h2 className="sunset-gradient-text font-heading text-4xl sm:text-6xl md:text-7xl font-black uppercase tracking-tight mt-1">
          ZONE
        </h2>

        <p className="mt-4 text-sm sm:text-lg text-chrome/70 font-mono max-w-xl mx-auto px-2">
          Share files instantly with anyone in the same room — encrypted peer-to-peer,
          straight from browser to browser. No upload. No storage. No account needed.
        </p>

        {/* Feature pills */}
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2 sm:gap-3 font-mono text-[11px] sm:text-xs uppercase tracking-wider">
          {[
            { label: '🔒 End-to-End Encrypted', color: 'text-neonCyan border-neonCyan/50' },
            { label: '⚡ Direct WebRTC Transfer', color: 'text-neonMagenta border-neonMagenta/50' },
            { label: '📂 No File Size Limit', color: 'text-sunsetOrange border-sunsetOrange/50' },
            { label: '🛡️ Zero Server Logs', color: 'text-chrome/80 border-chrome/30' },
          ].map(({ label, color }) => (
            <span key={label} className={`border px-2.5 sm:px-3 py-1 bg-black/50 ${color}`}>
              {label}
            </span>
          ))}
        </div>
      </div>

      {error && (
        <div className="w-full max-w-md">
          <ErrorBanner message={error.message} />
        </div>
      )}

      {/* Retro-Futuristic Terminal Control Boxes */}
      <div className="flex w-full max-w-xl flex-col gap-5 sm:gap-6">
        {/* Device Identity Terminal */}
        <section className="border-2 border-retroBorder border-t-2 border-t-neonMagenta bg-cardBg/90 backdrop-blur-md p-4 sm:p-5 shadow-panelGlow relative">
          <div className="flex items-center justify-between border-b border-retroBorder pb-2.5 mb-4">
            <span className="font-mono text-xs text-neonMagenta font-bold tracking-widest uppercase">
              // YOUR CALLSIGN
            </span>
            <div className="flex gap-1.5">
              <span className="h-2 w-2 rounded-full bg-neonMagenta" />
              <span className="h-2 w-2 rounded-full bg-neonCyan" />
              <span className="h-2 w-2 rounded-full bg-sunsetOrange" />
            </div>
          </div>
          
          <label htmlFor="device-name-input" className="block font-heading text-xs uppercase tracking-wider text-chrome/80">
            &gt; Choose a name others will see you as:
          </label>
          <input
            id="device-name-input"
            type="text"
            maxLength={30}
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            placeholder="e.g. Swift Otter, Cyber Deck..."
            className="mt-2 w-full border-b-2 border-neonMagenta bg-black/60 px-3 py-2 font-mono text-base sm:text-lg text-neonCyan placeholder:text-neonMagenta/40 focus:border-neonCyan focus:shadow-[0_0_15px_#00FFFF] focus:outline-none"
          />
        </section>

        {/* Create Room Section */}
        <section className="border-2 border-retroBorder border-t-2 border-t-neonCyan bg-cardBg/90 backdrop-blur-md p-4 sm:p-5 shadow-panelGlow">
          <div className="flex items-center justify-between border-b border-retroBorder pb-2.5 mb-4">
            <span className="font-mono text-xs text-neonCyan font-bold tracking-widest uppercase">
              // CREATE A NEW ROOM
            </span>
            <span className="font-mono text-xs text-chrome/40">[ENCRYPTED]</span>
          </div>

          <button
            type="button"
            aria-label="Create room"
            onClick={() => void handleCreate()}
            disabled={creating}
            className="group mt-2 w-full -skew-x-12 border-2 border-neonCyan bg-black/60 py-3.5 font-heading text-base sm:text-lg font-bold uppercase tracking-widest transition-all duration-200 hover:skew-x-0 hover-vapor-cyan active:scale-95 disabled:opacity-50 cursor-pointer shadow-[0_0_10px_rgba(0,255,255,0.2)]"
          >
            <span className="inline-block skew-x-12 text-neonCyan drop-shadow-[0_0_8px_rgba(0,255,255,0.9)] group-hover:text-white group-hover:skew-x-0 group-hover:drop-shadow-[0_0_16px_#00FFFF] transition-all duration-200">
              {creating ? '> INITIALIZING ROOM...' : 'CREATE ROOM >>'}
            </span>
          </button>
        </section>

        {/* Join Matrix Node Section */}
        <section className="border-2 border-retroBorder border-t-2 border-t-sunsetOrange bg-cardBg/90 backdrop-blur-md p-4 sm:p-5 shadow-panelGlow">
          <div className="flex items-center justify-between border-b border-retroBorder pb-2.5 mb-4">
            <span className="font-mono text-xs text-sunsetOrange font-bold tracking-widest uppercase">
              // CONNECT TO ROOM
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
              className="flex-1 border-b-2 border-sunsetOrange bg-black/60 px-4 py-2.5 text-center font-mono text-lg sm:text-xl tracking-[0.2em] text-sunsetOrange placeholder:text-sunsetOrange/40 focus:border-neonCyan focus:shadow-[0_0_15px_#00FFFF] focus:outline-none"
            />
            <button
              type="button"
              aria-label="Join"
              onClick={handleJoin}
              disabled={code.length !== 6}
              className="w-full sm:w-auto group -skew-x-12 border-2 border-neonMagenta bg-black/60 px-8 py-3 sm:py-2.5 font-heading text-sm font-bold uppercase tracking-widest transition-all duration-200 hover:skew-x-0 hover-vapor-magenta active:scale-95 disabled:opacity-40 cursor-pointer shadow-[0_0_10px_rgba(255,0,255,0.2)] text-center"
            >
              <span className="inline-block skew-x-12 text-neonMagenta drop-shadow-[0_0_6px_#FF00FF] group-hover:text-white group-hover:skew-x-0 group-hover:drop-shadow-[0_0_16px_#FF00FF] transition-all duration-200 font-extrabold">
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
