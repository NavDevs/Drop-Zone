import { describe, it, expect } from 'vitest';
import { extractFingerprint, computeSas } from '../lib/rtc/sas.js';

describe('sas', () => {
  const localSdp = `v=0
o=- 12345 2 IN IP4 127.0.0.1
s=-
t=0 0
a=fingerprint:sha-256 AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99
m=application 9 UDP/DTLS/SCTP webrtc-datachannel
`;

  const remoteSdp = `v=0
o=- 67890 2 IN IP4 127.0.0.1
s=-
t=0 0
a=fingerprint:sha-256 11:22:33:44:55:66:77:88:99:00:AA:BB:CC:DD:EE:FF:11:22:33:44:55:66:77:88:99:00:AA:BB:CC:DD:EE:FF
m=application 9 UDP/DTLS/SCTP webrtc-datachannel
`;

  it('extracts fingerprint from SDP', () => {
    const fp = extractFingerprint(localSdp);
    expect(fp).toBe('AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99');
  });

  it('returns null if fingerprint is missing', () => {
    expect(extractFingerprint('v=0\r\no=-\r\n')).toBeNull();
  });

  it('computes identical SAS regardless of order of local and remote SDP', async () => {
    const sas1 = await computeSas(localSdp, remoteSdp);
    const sas2 = await computeSas(remoteSdp, localSdp);

    expect(sas1).not.toBeNull();
    expect(sas1).toMatch(/^\d{3} \d{3}$/);
    expect(sas1).toBe(sas2);
  });
});
