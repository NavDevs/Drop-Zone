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
    <main className="flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center gap-6 p-4 md:p-8">
      {/* Playful Header */}
      <div className="text-center relative">
        <span className="absolute -top-3 -right-4 -rotate-6 rounded bg-postit px-2 py-0.5 text-xs font-bold border-2 border-lead shadow-sketch-sm hidden sm:inline-block">
          P2P · No Cloud!
        </span>
        <h1 className="font-heading text-5xl md:text-6xl font-bold tracking-tight text-lead -rotate-1">
          DropZone
        </h1>
        <p className="mt-2 text-xl md:text-2xl text-lead/80">
          Direct device-to-device file transfer. Hand-delivered over WebRTC.
        </p>
      </div>

      {error && (
        <div className="w-full max-w-md">
          <ErrorBanner message={error.message} />
        </div>
      )}

      <div className="flex w-full max-w-md flex-col gap-5">
        {/* Your Name Box */}
        <section
          style={{ borderRadius: '255px 15px 225px 15px / 15px 225px 15px 255px' }}
          className="border-[3px] border-lead bg-white p-5 shadow-sketch rotate-[0.5deg]"
        >
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full bg-markerRed border border-lead"></span>
            <label htmlFor="device-name-input" className="font-heading text-lg font-bold text-lead">
              Your Device Name
            </label>
          </div>
          <p className="mt-0.5 text-base text-lead/70">
            Visible to everyone in the room:
          </p>
          <input
            id="device-name-input"
            type="text"
            maxLength={30}
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            placeholder="e.g. My Phone"
            style={{ borderRadius: '185px 25px 195px 20px / 20px 195px 25px 185px' }}
            className="mt-3 w-full border-[2.5px] border-lead bg-paper px-4 py-2.5 text-lg font-medium text-lead placeholder:text-lead/40 focus:border-ballpointBlue focus:outline-none focus:ring-2 focus:ring-ballpointBlue/20"
          />
        </section>

        {/* Create Room Box */}
        <section
          style={{ borderRadius: '195px 25px 225px 20px / 20px 225px 25px 195px' }}
          className="border-[3px] border-lead bg-white p-5 shadow-sketch -rotate-[0.5deg]"
        >
          <h2 className="font-heading text-lg font-bold text-lead">Create a Room</h2>
          <p className="text-sm text-lead/70">Choose how long your room link lasts:</p>
          
          <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Room lifetime">
            {TTL_CHOICES.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => setTtlSec(t.value)}
                aria-pressed={ttlSec === t.value}
                style={{ borderRadius: '255px 25px 225px 25px / 25px 225px 25px 255px' }}
                className={`border-2 border-lead px-3 py-1 text-base font-semibold transition-all ${
                  ttlSec === t.value
                    ? 'bg-markerRed text-white shadow-sketch-sm -translate-y-0.5'
                    : 'bg-paper text-lead hover:bg-mutedPaper'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <label className="mt-3 flex items-center gap-2 text-base text-lead select-none cursor-pointer">
            <input
              type="checkbox"
              checked={requireApproval}
              onChange={(e) => setRequireApproval(e.target.checked)}
              className="h-4 w-4 rounded border-2 border-lead text-markerRed focus:ring-markerRed"
            />
            Require me to approve each joining device
          </label>

          <button
            type="button"
            onClick={() => void handleCreate()}
            disabled={creating}
            style={{ borderRadius: '255px 25px 225px 25px / 25px 225px 25px 255px' }}
            className="mt-4 w-full border-[3px] border-lead bg-white py-3 text-xl font-heading font-bold text-lead shadow-sketch hover:bg-markerRed hover:text-white hover:shadow-sketch-sm hover:translate-x-[2px] hover:translate-y-[2px] active:shadow-none active:translate-x-[4px] active:translate-y-[4px] disabled:opacity-50 transition-all cursor-pointer"
          >
            {creating ? 'Sketching room…' : 'Create Room 🚀'}
          </button>
        </section>

        {/* Join Room Box */}
        <section
          style={{ borderRadius: '225px 20px 205px 25px / 25px 205px 20px 225px' }}
          className="border-[3px] border-lead bg-white p-5 shadow-sketch rotate-[0.3deg]"
        >
          <h2 className="font-heading text-lg font-bold text-lead">Join a Room</h2>
          <div className="mt-3 flex gap-2">
            <label className="sr-only" htmlFor="join-code">Room code</label>
            <input
              id="join-code"
              type="text"
              maxLength={6}
              placeholder="CODE"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
              style={{ borderRadius: '185px 25px 195px 20px / 20px 195px 25px 185px' }}
              className="w-full border-[2.5px] border-lead bg-paper px-4 py-2 text-center font-mono text-xl tracking-widest text-lead focus:border-ballpointBlue focus:outline-none"
            />
            <button
              type="button"
              onClick={handleJoin}
              disabled={code.length !== 6}
              style={{ borderRadius: '255px 25px 225px 25px / 25px 225px 25px 255px' }}
              className="border-[3px] border-lead bg-lead px-6 py-2 font-heading text-lg font-bold text-white shadow-sketch hover:bg-ballpointBlue disabled:opacity-40 transition-all cursor-pointer"
            >
              Join
            </button>
          </div>
        </section>
      </div>

      <p className="max-w-md text-center text-base text-lead/60 italic">
        🔒 Files flow directly between devices over encrypted WebRTC. The server never touches or stores your files.
      </p>
    </main>
  );
}
