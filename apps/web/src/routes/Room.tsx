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
import { useTransfersStore } from '../state/transfersStore.js';
import { getRoomHistory } from '../lib/transfer/resumeStore.js';
import { acquireWakeLock, releaseWakeLock } from '../lib/transfer/wakeLock.js';
import { requestNotificationPermission } from '../lib/notifications.js';

export function Room() {
  const { code: urlCode } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const client = getSignalingClient();

  const status = useRoomStore((s) => s.status);
  const storeCode = useRoomStore((s) => s.code);
  const isHost = useRoomStore((s) => s.isHost);
  const error = useRoomStore((s) => s.error);

  const peers = usePeersStore((s) => s.peers);
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

  // Bind current roomCode to TransferHub and load stored room transfer history from IndexedDB
  useEffect(() => {
    if (!urlCode) return;
    transferHub.setRoomCode(urlCode);
    
    // FR-15: Ensure the local store only contains records for the current room session.
    // Resetting before loading ensures no history leakage from previous rooms in the same tab.
    useTransfersStore.getState().reset();

    void getRoomHistory(urlCode).then((records) => {
      if (records.length > 0) {
        const store = useTransfersStore.getState();
        for (const record of records) {
          if (!store.transfers[record.id]) {
            store.add(record);
          }
        }
      }
    });
    return () => {
      transferHub.setRoomCode(null);
    };
  }, [urlCode, transferHub]);

  // Auto-dismiss member join/leave notifications after 4.5 seconds
  useEffect(() => {
    if (notifications.length === 0) return;
    
    // Set timers for any notifications that don't have one yet.
    // We use a local set to track which ones we've already scheduled in this effect instance.
    const timers: number[] = [];
    
    notifications.forEach((n) => {
      const timer = window.setTimeout(() => {
        dismissNotification(n.id);
      }, 4500);
      timers.push(timer);
    });

    return () => {
      timers.forEach((t) => clearTimeout(t));
    };
  }, [notifications, dismissNotification]);

  // Tear down all RTCPeerConnections when leaving the room route.
  useEffect(() => {
    return () => {
      peerManager.destroyAll();
    };
  }, [peerManager]);

  // Keep the screen awake while in a room and recover the session when the tab
  // is foregrounded after a mobile suspend (the OS drops the socket otherwise).
  // The wake lock itself is re-requested on visibility by wakeLock.ts.
  useEffect(() => {
    if (status !== 'joined') return;
    void acquireWakeLock();
    const onVisible = (): void => {
      if (document.visibilityState !== 'visible') return;
      client.resumeFromBackground();
      peerManager.resumeAll();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      void releaseWakeLock();
    };
  }, [status, client, peerManager]);

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
    if (state.code === urlCode && state.status === 'joined') return;
    void requestNotificationPermission();
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
      <main className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-lg flex-col items-center justify-center gap-6 p-4 text-center relative z-10">
        <div className="w-full">
          <ErrorBanner message={error.message} />
        </div>
        <button
          type="button"
          onClick={() => navigate('/')}
          className="-skew-x-12 hover:skew-x-0 border-2 border-neonCyan vapor-button-cyan hover-vapor-cyan px-8 py-3.5 font-heading text-xs sm:text-sm font-black uppercase tracking-widest text-white shadow-neonCyan transition-all duration-200 cursor-pointer"
        >
          <span className="inline-block skew-x-12 hover:skew-x-0">
            &lt;&lt; Back home
          </span>
        </button>
      </main>
    );
  }

  if (status !== 'joined' || !urlCode || !selfDevice) {
    return (
      <main className="flex min-h-[calc(100vh-4rem)] items-center justify-center p-4 relative z-10">
        <div className="border border-retroBorder bg-cardBg/90 px-6 py-4 flex items-center gap-3 backdrop-blur-md shadow-panelGlow">
          <span className="relative flex h-2.5 w-2.5 items-center justify-center">
            <span className="absolute inline-flex h-full w-full animate-ping bg-neonCyan opacity-80" />
            <span className="relative inline-flex h-1.5 w-1.5 bg-white" />
          </span>
          <p className="font-mono text-xs sm:text-sm uppercase tracking-widest text-neonCyan" aria-live="polite">
            Establishing secure mesh connection…
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-5 sm:gap-6 px-3 py-4 sm:p-6 relative z-10">
      {/* Vaporwave Neon Member Activity Notifications */}
      <div className="fixed top-16 sm:top-20 left-3 sm:left-auto right-3 sm:right-4 z-50 flex flex-col gap-2 max-w-md sm:max-w-xs w-auto sm:w-full pointer-events-none">
        {notifications.slice(-4).map((n) => (
          <div
            key={n.id}
            className={`pointer-events-auto flex items-center justify-between gap-3 border-2 p-3 font-mono text-xs uppercase tracking-wider backdrop-blur-md shadow-panelGlow ${
              n.type === 'join'
                ? 'border-neonCyan bg-black/90 text-neonCyan shadow-[0_0_15px_rgba(0,255,255,0.4)]'
                : 'border-neonMagenta bg-black/90 text-neonMagenta shadow-[0_0_15px_rgba(255,0,255,0.4)]'
            }`}
          >
            <span>
              {n.type === 'join' ? '▲ NODE ONLINE: ' : '▼ NODE OFFLINE: '}
              <strong className="underline decoration-1">{n.name}</strong>
            </span>
            <button
              type="button"
              onClick={() => dismissNotification(n.id)}
              className="text-chrome/50 hover:text-white px-1 font-mono text-sm"
            >
              [X]
            </button>
          </div>
        ))}
      </div>

      {error && <ErrorBanner message={error.message} onDismiss={() => useRoomStore.getState().setError(null)} />}

      <RoomHeader
        code={urlCode}
        isHost={isHost}
        onRegenerate={handleRegenerate}
        onCloseRoom={handleClose}
        onLeave={handleLeave}
        onRename={() => setRenaming(true)}
      />

      <section aria-label="Devices in this room" className="border-2 border-retroBorder bg-cardBg/90 backdrop-blur-md p-4 sm:p-5 shadow-panelGlow">
        <div className="mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-retroBorder pb-3">
          <div className="flex items-center gap-2.5">
            <span className="relative flex h-3 w-3 items-center justify-center flex-shrink-0">
              <span className="absolute inline-flex h-full w-full bg-neonCyan opacity-80 shadow-[0_0_12px_#00FFFF,0_0_24px_#00FFFF]" />
              <span className="relative inline-flex h-1.5 w-1.5 bg-white shadow-[0_0_6px_#FFFFFF]" />
            </span>
            <h2 className="font-heading text-sm font-bold uppercase tracking-wider text-neonCyan">
              CONNECTED DEVICES ({Object.keys(peers).length + 1})
            </h2>
          </div>

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
            className="w-full sm:w-auto -skew-x-12 hover:skew-x-0 border-2 border-neonMagenta vapor-button-magenta hover-vapor-magenta px-5 py-2.5 font-heading text-xs font-bold uppercase tracking-widest text-white disabled:opacity-30 transition-all duration-200 cursor-pointer text-center"
          >
            <span className="inline-block skew-x-12 hover:skew-x-0 font-extrabold">
              BROADCAST DATA TO ALL ({Object.keys(peers).length}) &gt;&gt;
            </span>
          </button>
        </div>

        <PeerGrid
          self={selfDevice}
          peers={Object.values(peers)}
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
