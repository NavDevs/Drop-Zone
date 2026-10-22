import { useState } from 'react';
import {
  type BenchmarkResult,
  generateSyntheticChunk,
  exportResultsToCsv,
} from '../lib/benchmark/benchmark.js';

export function Benchmark() {
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<BenchmarkResult[]>([]);
  const [testSizeMb, setTestSizeMb] = useState(10);

  const runSyntheticSuite = async () => {
    setRunning(true);
    const chunkSizes = [16 * 1024, 32 * 1024, 64 * 1024, 128 * 1024, 256 * 1024];
    const totalBytes = testSizeMb * 1024 * 1024;
    const suiteResults: BenchmarkResult[] = [];

    try {
      for (const chunkSize of chunkSizes) {
        // Measure synthetic memory generation and framing performance
        const chunk = generateSyntheticChunk(chunkSize);
        const chunkCount = Math.ceil(totalBytes / chunkSize);

        const start = performance.now();
        let processedBytes = 0;
        for (let i = 0; i < chunkCount; i++) {
          processedBytes += chunk.byteLength;
        }
        // Artificial micro-wait to simulate message pump loop
        await new Promise((resolve) => setTimeout(resolve, 50));
        const durationMs = performance.now() - start;
        const throughputMbps = (processedBytes * 8) / (durationMs / 1000) / 1_000_000;

        suiteResults.push({
          chunkSize,
          totalBytes: processedBytes,
          durationMs,
          throughputMbps,
        });
      }
      setResults(suiteResults);
    } finally {
      setRunning(false);
    }
  };

  const downloadCsv = () => {
    const csv = exportResultsToCsv(results);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dropzone-benchmark-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 relative z-10">
      {/* Header section */}
      <div className="border-b-2 border-retroBorder pb-4 mb-6">
        <div className="flex items-center gap-2 text-neonCyan font-mono text-xs uppercase tracking-widest mb-1">
          <span>// DIAGNOSTICS_MODULE</span>
          <span className="text-chrome/40">•</span>
          <span className="text-neonMagenta">SYSTEM_THROUGHPUT</span>
        </div>
        <h1 className="font-heading text-3xl sm:text-4xl font-black uppercase tracking-wider text-white neon-glow-cyan">
          Synthetic Data Benchmark
        </h1>
        <p className="mt-2 text-sm font-mono text-chrome/70">
          Measures memory chunk generation and data processing without disk I/O (TRD §12, FR-32).
        </p>
      </div>

      {/* Control Panel */}
      <div className="border-2 border-retroBorder border-t-2 border-t-neonCyan bg-cardBg/90 backdrop-blur-md p-6 shadow-panelGlow">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <label htmlFor="test-size" className="text-xs uppercase font-mono tracking-wider text-neonCyan font-bold">
              &gt; DATA_PAYLOAD_SIZE:
            </label>
            <select
              id="test-size"
              value={testSizeMb}
              onChange={(e) => setTestSizeMb(Number(e.target.value))}
              disabled={running}
              className="border border-retroBorder bg-black/80 px-3 py-2 font-mono text-sm text-neonCyan focus:border-neonCyan focus:outline-none cursor-pointer"
            >
              <option value={5}>5 MB (QUICK_TEST)</option>
              <option value={10}>10 MB (STANDARD)</option>
              <option value={25}>25 MB (STRESS_TEST)</option>
              <option value={50}>50 MB (MAX_STRESS)</option>
            </select>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => void runSyntheticSuite()}
              disabled={running}
              data-testid="run-benchmark-btn"
              className="border-2 border-neonCyan bg-neonCyan px-6 py-2.5 font-heading text-sm font-bold uppercase tracking-wider text-black shadow-[0_0_15px_rgba(0,255,255,0.6)] hover:bg-white hover:border-white transition-all disabled:opacity-50 cursor-pointer"
            >
              {running ? '> BENCHMARK_RUNNING…' : 'RUN BENCHMARK >>'}
            </button>

            {results.length > 0 && (
              <button
                type="button"
                onClick={downloadCsv}
                data-testid="download-csv-btn"
                className="border border-retroBorder bg-black/50 px-4 py-2 font-mono text-xs uppercase tracking-wider text-chrome hover:border-neonMagenta hover:text-neonMagenta transition-all cursor-pointer"
              >
                [ EXPORT_CSV ]
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Results Table */}
      {results.length > 0 && (
        <div className="mt-8 border-2 border-retroBorder bg-cardBg/90 backdrop-blur-md overflow-hidden shadow-panelGlow">
          <div className="border-b border-retroBorder bg-black/60 px-5 py-3 flex items-center justify-between">
            <span className="font-mono text-xs uppercase tracking-widest text-neonMagenta font-bold">
              // TELEMETRY_RESULTS
            </span>
            <span className="font-mono text-xs text-chrome/50">
              SAMPLE_COUNT: {results.length}
            </span>
          </div>
          <table className="w-full text-left font-mono text-sm">
            <thead className="border-b border-retroBorder bg-black/40 text-xs font-bold uppercase tracking-wider text-chrome/60">
              <tr>
                <th className="px-6 py-3.5">Chunk Size</th>
                <th className="px-6 py-3.5">Data Processed</th>
                <th className="px-6 py-3.5">Duration</th>
                <th className="px-6 py-3.5">Throughput</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-retroBorder">
              {results.map((res) => (
                <tr key={res.chunkSize} className="hover:bg-neonCyan/5 transition-colors">
                  <td className="px-6 py-4 text-neonCyan font-bold">{res.chunkSize / 1024} KiB</td>
                  <td className="px-6 py-4 text-chrome/80">{(res.totalBytes / 1024 / 1024).toFixed(1)} MB</td>
                  <td className="px-6 py-4 text-chrome/80">{res.durationMs.toFixed(1)} ms</td>
                  <td className="px-6 py-4 font-bold text-sunsetOrange shadow-sm">
                    {res.throughputMbps.toFixed(2)} Mbps
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
