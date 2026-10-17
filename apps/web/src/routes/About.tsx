export function About() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-16">
      <h1 className="text-3xl font-bold">About DropZone</h1>
      <section className="mt-6 space-y-4 text-gray-600 dark:text-gray-400">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">What the server sees</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>Room code (hashed in logs)</li>
          <li>Auto-generated device name</li>
          <li>SDP/ICE connection metadata</li>
        </ul>
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">What the server never sees</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>File contents</li>
          <li>File names or sizes</li>
          <li>Your identity</li>
        </ul>
        <p>
          Transfers happen over WebRTC DataChannels encrypted with DTLS.
          Even when relayed through a TURN server, file data remains encrypted end-to-end.
        </p>
      </section>
    </main>
  );
}
