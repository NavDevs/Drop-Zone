import type { ControlMessage } from '@dropzone/protocol';

/**
 * What the transfer engine needs from a peer connection (TRD §10).
 * Implemented over a PeerSession by PeerManager.
 */
export interface TransferTransport {
  sendControl(message: ControlMessage): boolean;
  sendData(frame: ArrayBuffer, channelIndex: number): boolean;
  getBufferedAmount(channelIndex: number): number;
  whenBufferedAmountLow(channelIndex: number): Promise<void>;
  dataChannelCount(): number;
  getRemoteMaxMessageSize(): number | null;
}
