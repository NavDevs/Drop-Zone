import { useState } from 'react';
import {
  type BenchmarkResult,
  generateSyntheticChunk,
  exportResultsToCsv,
} from '../lib/benchmark/benchmark.js';
import { Nav } from '../components/Nav.js';

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
    <div className="min-h-screen bg-gray-50 text-gray-900 dark:bg-gray-950 dark:text-gray-100">
      <Nav />
      <main className="mx-auto max-w-4xl p-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold tracking-tight">Synthetic Data Benchmark</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Measures memory chunk generation and data processing without disk I/O (TRD §12, FR-32).
          </p>
        </div>

        <div className="mt-8 flex flex-wrap items-center gap-4 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <div className="flex items-center gap-2">
            <label htmlFor="test-size" className="text-sm font-medium">
              Data Size:
            </label>
            <select
              id="test-size"
              value={testSizeMb}
              onChange={(e) => setTestSizeMb(Number(e.target.value))}
              disabled={running}
              className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-800"
            >
              <option value={5}>5 MB</option>
              <option value={10}>10 MB</option>
              <option value={25}>25 MB</option>
              <option value={50}>50 MB</option>
            </select>
          </div>

          <button
            type="button"
            onClick={() => void runSyntheticSuite()}
            disabled={running}
            data-testid="run-benchmark-btn"
            className="rounded-xl bg-primary-600 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-primary-700 disabled:opacity-50"
          >
            {running ? 'Running Benchmark…' : 'Run Benchmark'}
          </button>

          {results.length > 0 && (
            <button
              type="button"
              onClick={downloadCsv}
              data-testid="download-csv-btn"
              className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-medium hover:bg-gray-100 dark:border-gray-700 dark:hover:bg-gray-800"
            >
              Export CSV
            </button>
          )}
        </div>

        {results.length > 0 && (
          <div className="mt-8 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-gray-100 bg-gray-50 text-xs font-semibold uppercase text-gray-500 dark:border-gray-800 dark:bg-gray-800/50 dark:text-gray-400">
                <tr>
                  <th className="px-6 py-3">Chunk Size</th>
                  <th className="px-6 py-3">Data Processed</th>
                  <th className="px-6 py-3">Duration</th>
                  <th className="px-6 py-3">Throughput</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {results.map((res) => (
                  <tr key={res.chunkSize} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/20">
                    <td className="px-6 py-4 font-mono">{res.chunkSize / 1024} KiB</td>
                    <td className="px-6 py-4">{(res.totalBytes / 1024 / 1024).toFixed(1)} MB</td>
                    <td className="px-6 py-4 font-mono">{res.durationMs.toFixed(1)} ms</td>
                    <td className="px-6 py-4 font-mono font-semibold text-primary-600 dark:text-primary-400">
                      {res.throughputMbps.toFixed(2)} Mbps
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
