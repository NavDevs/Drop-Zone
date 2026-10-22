import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router';

const { clientMock } = vi.hoisted(() => ({
  clientMock: {
    connect: vi.fn(),
    createRoom: vi.fn(),
    joinRoom: vi.fn(),
    leaveRoom: vi.fn().mockResolvedValue(undefined),
    closeRoom: vi.fn(),
    regenerateCode: vi.fn(),
    approveJoiner: vi.fn(),
    updateDeviceName: vi.fn(),
    onSignal: vi.fn(),
  },
}));

vi.mock('../lib/signaling/SignalingClient.js', () => ({
  getSignalingClient: () => clientMock,
}));

const { Landing } = await import('../routes/Landing.js');
const { Room } = await import('../routes/Room.js');
const { useRoomStore } = await import('../state/roomStore.js');
const { usePeersStore } = await import('../state/peersStore.js');

describe('Landing', () => {
  afterEach(cleanup);

  beforeEach(() => {
    vi.clearAllMocks();
    useRoomStore.getState().clear();
    usePeersStore.getState().reset();
  });

  it('renders create + join controls', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<Landing />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByRole('button', { name: /create room/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/room code/i)).toBeInTheDocument();
  });

  it('navigates to /r/<code> after a successful create', async () => {
    clientMock.createRoom.mockResolvedValue({
      ok: true,
      data: { code: 'ABC234', codeExpiresAt: Date.now() + 1000, iceServers: [] },
    });
    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/r/:code" element={<div data-testid="room-route" />} />
        </Routes>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: /create room/i }));
    await waitFor(() => expect(screen.getByTestId('room-route')).toBeInTheDocument());
    expect(clientMock.createRoom).toHaveBeenCalled();
  });

  it('Join stays disabled until a 6-char code is entered', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<Landing />} />
        </Routes>
      </MemoryRouter>,
    );
    const join = screen.getByRole('button', { name: /^join$/i });
    expect(join).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/room code/i), { target: { value: 'ABC234' } });
    expect(join).toBeEnabled();
  });
});

describe('Room', () => {
  afterEach(cleanup);

  beforeEach(() => {
    vi.clearAllMocks();
    useRoomStore.getState().clear();
    usePeersStore.getState().reset();
  });

  it('shows Connecting… before join resolves', () => {
    clientMock.joinRoom.mockReturnValue(new Promise(() => {}));
    render(
      <MemoryRouter initialEntries={['/r/ABC234']}>
        <Routes>
          <Route path="/r/:code" element={<Room />} />
        </Routes>
      </MemoryRouter>,
    );
    // aria-live status paragraph shows a "connecting / mesh connection" message while pending
    const statusEl = document.querySelector('[aria-live]');
    expect(statusEl).toBeTruthy();
    expect(statusEl!.textContent).toMatch(/connect/i);
    expect(clientMock.joinRoom).toHaveBeenCalledWith('ABC234');
  });

  it('renders the room code once joined', () => {
    usePeersStore.getState().setSelfId('self-1');
    useRoomStore.getState().setJoined({
      code: 'ABC234',
      isHost: true,
      codeExpiresAt: Date.now() + 60_000,
      iceServers: [],
    });
    render(
      <MemoryRouter initialEntries={['/r/ABC234']}>
        <Routes>
          <Route path="/r/:code" element={<Room />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByTestId('room-code')).toHaveTextContent('ABC234');
    expect(screen.getByRole('button', { name: /close room/i })).toBeInTheDocument();
  });

  it('shows the error screen when the room closed', () => {
    useRoomStore.getState().setError({ code: 'ROOM_CLOSED', message: 'The host closed the room.' });
    render(
      <MemoryRouter initialEntries={['/r/ABC234']}>
        <Routes>
          <Route path="/r/:code" element={<Room />} />
          <Route path="/" element={<div data-testid="home" />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent(/host closed/i);
    expect(screen.getByRole('button', { name: /back home/i })).toBeInTheDocument();
  });
});
