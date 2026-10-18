import { useEffect, useState } from 'react';
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

  const deviceName = useSettingsStore((s) => s.deviceName);
  const [renaming, setRenaming] = useState(false);
  const [rtts, setRtts] = useState<Record<string, number | null>>({});
  const [linkClasses, setLinkClasses] = useState<Record<string, ConnectionClass | null>>({});
  const [roundTrip, setRoundTrip] = useState<string | null>(null);
  const [incomingOffers, setIncomingOffers] = useState<IncomingOffer[]>([]);
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
    <main className="mx-auto flex max-w-3xl flex-col gap-5 p-4">
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
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
          Devices ({Object.keys(peers).length + 1})
        </h2>
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
        />
        <p data-testid="round-trip" className="mt-2 text-sm text-gray-500 dark:text-gray-400" aria-live="polite">
          {roundTrip ?? 'Ping a connected peer or drop a file to transfer.'}
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
    </main>
  );
}
