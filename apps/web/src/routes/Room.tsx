import { useRef, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { detectDeviceType, getDeviceId } from '../lib/device.js';
import { getSignalingClient } from '../lib/signaling/SignalingClient.js';
import { getPeerManager } from '../lib/rtc/PeerManager.js';
import type { ConnectionClass } from '../lib/rtc/stats.js';
import { getTransferHub, type IncomingOffer } from '../lib/transfer/TransferHub.js';
import { useRoomStore } from '../state/roomStore.js';
import { usePeersStore } from '../state/peersStore.js';
import { useSettingsStore } from '../state/settingsStore.js';
import { ErrorBanner } from '../components/ErrorBanner.js';
import { RoomHeader } from '../components/RoomHeader.js';
import { PeerGrid } from '../components/PeerGrid.js';
import { RenameDialog } from '../components/RenameDialog.js';
import { IncomingDialog } from '../components/IncomingDialog.js';
import { TransferList } from '../components/TransferList.js';
import { DiagnosticsDrawer } from '../components/DiagnosticsDrawer.js';
import type { PeerLinkStats } from '../lib/rtc/PeerSession.js';

export function Room() {
  const { code: urlCode } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const client = getSignalingClient();

  const status = useRoomStore((s) => s.status);
  const storeCode = useRoomStore((s) => s.code);
  const isHost = useRoomStore((s) => s.isHost);
  const codeExpiresAt = useRoomStore((s) => s.codeExpiresAt);
  const error = useRoomStore((s) => s.error);

  const peers = usePeersStore((s) => s.peers);
  const pending = usePeersStore((s) => s.pending);
  const selfId = usePeersStore((s) => s.selfId);
  const notifications = usePeersStore((s) => s.notifications);
  const dismissNotification = usePeersStore((s) => s.dismissNotification);

  const deviceName = useSettingsStore((s) => s.deviceName);
  const [renaming, setRenaming] = useState(false);
  const [rtts, setRtts] = useState<Record<string, number | null>>({});
  const [linkClasses, setLinkClasses] = useState<Record<string, ConnectionClass | null>>({});
  const [peerStats, setPeerStats] = useState<Record<string, PeerLinkStats>>({});
  const [diagnosticsPeerId, setDiagnosticsPeerId] = useState<string | null>(null);
  const [roundTrip, setRoundTrip] = useState<string | null>(null);
  const [incomingOffers, setIncomingOffers] = useState<IncomingOffer[]>([]);
  const groupFileInputRef = useRef<HTMLInputElement>(null);
  const peerManager = getPeerManager();
  const transferHub = getTransferHub();

  // Track per-peer RTT + FR-30 connection class (throttled to ~1 frame/s).
  useEffect(() => {
    let frame = 0;
    const unsubscribe = peerManager.subscribeStats((deviceId, stats) => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        setRtts((prev) => {
          if (prev[deviceId] === stats.rttMs) return prev;
          return { ...prev, [deviceId]: stats.rttMs };
        });
        setLinkClasses((prev) => {
          if (prev[deviceId] === stats.connectionClass) return prev;
          return { ...prev, [deviceId]: stats.connectionClass };
        });
        setPeerStats((prev) => ({ ...prev, [deviceId]: stats }));
      });
    });
    return () => {
      if (frame) cancelAnimationFrame(frame);
      unsubscribe();
    };
  }, [peerManager]);

  // Subscribe to incoming file transfer offers (FR-11).
  useEffect(() => {
    return transferHub.subscribeIncomingOffers((offers) => {
      setIncomingOffers(offers);
    });
  }, [transferHub]);

  // Tear down all RTCPeerConnections when leaving the room route.
  useEffect(() => {
    return () => {
      peerManager.destroyAll();
    };
  }, [peerManager]);

  // Round-trip probe (FR-30): send a control-channel text and measure until echoed.
  const handlePing = (deviceId: string): void => {
    const started = performance.now();
    const unsubscribe = peerManager.subscribeText((fromDeviceId, text) => {
      if (fromDeviceId !== deviceId || !text.startsWith('ping:')) return;
      unsubscribe();
      const rtt = performance.now() - started;
      setRoundTrip(`${deviceId.slice(0, 8)} echoed in ${Math.round(rtt)} ms`);
    });
    const sent = peerManager.sendText(deviceId, `ping:${Date.now()}`);
    if (!sent) {
      unsubscribe();
      setRoundTrip(`${deviceId.slice(0, 8)} not connected`);
    }
  };

  // Echo any received ping so the remote probe can complete its round trip.
  useEffect(
    () =>
      peerManager.subscribeText((fromDeviceId, text) => {
        if (text.startsWith('ping:')) void peerManager.sendText(fromDeviceId, text);
      }),
    [peerManager],
  );

  // Join when the URL carries a code we're not already in.
  useEffect(() => {
    if (!urlCode) return;
    usePeersStore.getState().setSelfId(getDeviceId());
    const state = useRoomStore.getState();
    if (state.code === urlCode && (state.status === 'joined' || state.status === 'pending')) return;
    void client.joinRoom(urlCode);
  }, [urlCode, client]);

  // Follow server-driven code changes (host regenerated / expiry rollover).
  useEffect(() => {
    if (storeCode && urlCode && storeCode !== urlCode) {
      navigate(`/r/${storeCode}`, { replace: true });
    }
  }, [storeCode, urlCode, navigate]);

  const handleLeave = (): void => {
    void client.leaveRoom().then(() => navigate('/'));
  };

  const handleClose = (): void => {
    void client.closeRoom().then(() => navigate('/'));
  };

  const handleRegenerate = (): void => {
    void client.regenerateCode();
  };

  const handleRename = (name: string): void => {
    useSettingsStore.getState().setDeviceName(name);
    void client.updateDeviceName(name);
  };

  const handleSendFiles = (deviceId: string, files: File[]): void => {
    void transferHub.sendFiles(deviceId, files);
  };

  const handleSendToAll = (files: File[]): void => {
    const peerIds = Object.keys(peers);
    if (peerIds.length === 0) return;
    for (const peerId of peerIds) {
      void transferHub.sendFiles(peerId, files);
    }
  };

  const handleGroupFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleSendToAll(Array.from(e.target.files));
      e.target.value = '';
    }
  };

  const selfDevice = selfId
    ? { deviceId: selfId, name: deviceName, type: detectDeviceType() }
    : null;

  if (status === 'error' && error) {
    return (
      <main className="mx-auto flex min-h-[calc(100vh-3.5rem)] max-w-md flex-col items-center justify-center gap-4 p-4">
        <ErrorBanner message={error.message} />
        <button
          type="button"
          onClick={() => navigate('/')}
          className="rounded-xl bg-primary-600 px-6 py-3 font-semibold text-white hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500"
        >
          Back home
        </button>
      </main>
    );
  }

  if (status === 'pending' && urlCode) {
    return (
      <main className="mx-auto flex min-h-[calc(100vh-3.5rem)] max-w-md flex-col items-center justify-center gap-4 p-4 text-center">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Waiting for approval…</h1>
        <p className="text-gray-500 dark:text-gray-400">
          The host must let you in before you can see other devices.
        </p>
        <button
          type="button"
          onClick={handleLeave}
          className="rounded-xl border border-gray-300 px-5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
        >
          Cancel
        </button>
      </main>
    );
  }

  if (status !== 'joined' || !urlCode || !selfDevice) {
    return (
      <main className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center p-4">
        <p className="text-gray-500 dark:text-gray-400" aria-live="polite">Connecting…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-5 p-4 relative">
      {/* Hand-drawn Floating Activity Toasts (xyz joined / abc left) */}
      <div className="fixed top-16 right-4 z-40 flex flex-col gap-2 max-w-xs w-full pointer-events-none">
        {notifications.slice(-4).map((n) => (
          <div
            key={n.id}
            style={{ borderRadius: '255px 15px 225px 15px / 15px 225px 15px 255px' }}
            className={`pointer-events-auto flex items-center justify-between gap-2 border-2 border-lead p-3 shadow-sketch text-base font-heading font-bold transition-all ${
              n.type === 'join'
                ? 'bg-postit text-lead rotate-1'
                : 'bg-mutedPaper text-lead/80 -rotate-1'
            }`}
          >
            <span>
              {n.type === 'join' ? '👋 ' : '🏃 '}
              <strong className="underline decoration-wavy decoration-markerRed">{n.name}</strong> {n.type === 'join' ? 'joined the room!' : 'left the room'}
            </span>
            <button
              type="button"
              onClick={() => dismissNotification(n.id)}
              className="text-lead/50 hover:text-lead px-1 font-mono text-sm"
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      {error && <ErrorBanner message={error.message} onDismiss={() => useRoomStore.getState().setError(null)} />}

      <RoomHeader
        code={urlCode}
        codeExpiresAt={codeExpiresAt}
        isHost={isHost}
        onRegenerate={handleRegenerate}
        onCloseRoom={handleClose}
        onLeave={handleLeave}
        onRename={() => setRenaming(true)}
      />

      <section aria-label="Devices in this room">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-heading text-lg font-bold uppercase tracking-wide text-lead">
            Devices ({Object.keys(peers).length + 1})
          </h2>

          <input
            ref={groupFileInputRef}
            type="file"
            multiple
            className="hidden"
            data-testid="send-to-all-input"
            onChange={handleGroupFileInput}
          />
          <button
            type="button"
            data-testid="send-to-all-button"
            onClick={() => groupFileInputRef.current?.click()}
            disabled={Object.keys(peers).length === 0}
            style={{ borderRadius: '255px 25px 225px 25px / 25px 225px 25px 255px' }}
            className="flex items-center gap-2 border-[2.5px] border-lead bg-markerRed px-5 py-2.5 font-heading text-lg font-bold text-white shadow-sketch hover:shadow-sketch-sm hover:translate-x-0.5 hover:translate-y-0.5 disabled:opacity-40 transition-all cursor-pointer"
          >
            <span>Send to Everyone 📁</span>
            <span className="rounded-full border border-white bg-lead px-2 py-0.2 text-sm font-bold text-white">
              {Object.keys(peers).length}
            </span>
          </button>
        </div>

        <PeerGrid
          self={selfDevice}
          peers={Object.values(peers)}
          pending={isHost ? Object.values(pending) : []}
          onApprove={(id) => void client.approveJoiner(id, true)}
          onDeny={(id) => void client.approveJoiner(id, false)}
          rtts={rtts}
          linkClasses={linkClasses}
          onPing={handlePing}
          onSendFiles={handleSendFiles}
          onOpenDiagnostics={(id) => setDiagnosticsPeerId(id)}
        />
        <p data-testid="round-trip" className="mt-2 text-sm text-gray-500 dark:text-gray-400" aria-live="polite">
          {roundTrip ?? (Object.keys(peers).length > 0 ? 'Click "Send to Everyone" or drop files to transfer.' : 'Waiting for peers to join...')}
        </p>
      </section>

      {/* Transfer List (FR-10, FR-15) */}
      <TransferList />

      {/* Incoming Offer Consent Dialog (FR-11) */}
      <IncomingDialog
        offers={incomingOffers}
        onAccept={(id) => void transferHub.acceptOffer(id)}
        onDecline={(id) => transferHub.declineOffer(id)}
      />

      {renaming && (
        <RenameDialog
          initialName={deviceName}
          onSave={handleRename}
          onClose={() => setRenaming(false)}
        />
      )}

      {diagnosticsPeerId && peers[diagnosticsPeerId] && (
        <DiagnosticsDrawer
          peer={peers[diagnosticsPeerId].device}
          stats={peerStats[diagnosticsPeerId] ?? null}
          isOpen={true}
          onClose={() => setDiagnosticsPeerId(null)}
        />
      )}
    </main>
  );
}
