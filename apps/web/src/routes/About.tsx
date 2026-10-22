export function About() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12 relative z-10">
      {/* Header */}
      <div className="border-b-2 border-retroBorder pb-4 mb-8">
        <div className="flex items-center gap-2 text-neonMagenta font-mono text-xs uppercase tracking-widest mb-1">
          <span>// PROTOCOL_ARCHITECTURE</span>
          <span className="text-chrome/40">•</span>
          <span className="text-neonCyan">SECURE_MESH_NETWORK</span>
        </div>
        <h1 className="font-heading text-3xl sm:text-4xl font-black uppercase tracking-wider text-white neon-glow-magenta">
          About DropZone
        </h1>
        <p className="mt-2 text-sm font-mono text-chrome/70">
          Zero-knowledge, direct peer-to-peer file transfer engine with end-to-end DTLS encryption.
        </p>
      </div>

      <div className="space-y-6">
        {/* Card: What the server sees */}
        <section className="border-2 border-retroBorder border-l-4 border-l-neonCyan bg-cardBg/90 backdrop-blur-md p-6 shadow-panelGlow">
          <h2 className="font-heading text-lg font-bold uppercase tracking-wider text-neonCyan mb-3">
            &gt; WHAT_THE_SERVER_SEES
          </h2>
          <ul className="space-y-2 font-mono text-sm text-chrome/90">
            <li className="flex items-center gap-2">
              <span className="text-neonCyan">▪</span> Temporary ephemeral room codes (auto-expires)
            </li>
            <li className="flex items-center gap-2">
              <span className="text-neonCyan">▪</span> Client-provided callsign or auto-generated device name
            </li>
            <li className="flex items-center gap-2">
              <span className="text-neonCyan">▪</span> Encrypted SDP / ICE connection candidates to bridge peer handshakes
            </li>
          </ul>
        </section>

        {/* Card: What the server never sees */}
        <section className="border-2 border-retroBorder border-l-4 border-l-neonMagenta bg-cardBg/90 backdrop-blur-md p-6 shadow-panelGlow">
          <h2 className="font-heading text-lg font-bold uppercase tracking-wider text-neonMagenta mb-3">
            &gt; WHAT_THE_SERVER_NEVER_SEES
          </h2>
          <ul className="space-y-2 font-mono text-sm text-chrome/90">
            <li className="flex items-center gap-2">
              <span className="text-neonMagenta">▪</span> File content, chunks, or binary streams (never touches any server)
            </li>
            <li className="flex items-center gap-2">
              <span className="text-neonMagenta">▪</span> File names, MIME types, or payload byte lengths
            </li>
            <li className="flex items-center gap-2">
              <span className="text-neonMagenta">▪</span> User identity, accounts, or persistent personal identifiers
            </li>
          </ul>
        </section>

        {/* Card: Technical specs */}
        <section className="border-2 border-retroBorder bg-black/60 p-6 font-mono text-xs text-chrome/70">
          <p className="leading-relaxed">
            All data channels are negotiated directly between browsers over WebRTC SCTP connections encrypted with DTLS 1.2+.
            Even in cases where network firewalls necessitate TURN relaying, payload chunks remain cryptographically shielded from the relay server end-to-end.
          </p>
        </section>
      </div>
    </main>
  );
}
