import { Link } from 'react-router';

/** Top navigation: hand-drawn sketchbook theme. */
export function Nav() {
  return (
    <nav className="sticky top-0 z-20 border-b-[3px] border-lead bg-paper/90 backdrop-blur px-4 py-3">
      <div className="mx-auto flex max-w-4xl items-center justify-between">
        <Link
          to="/"
          className="font-heading text-2xl font-bold tracking-wide text-lead hover:text-markerRed transition-colors -rotate-1 inline-block"
        >
          ✏️ DropZone
        </Link>
        <div className="flex items-center gap-3 text-lg font-medium">
          <Link
            to="/benchmark"
            className="rounded px-2 py-1 text-lead hover:text-ballpointBlue hover:underline decoration-wavy decoration-2 transition"
          >
            Benchmark
          </Link>
          <Link
            to="/about"
            className="rounded px-2 py-1 text-lead hover:text-ballpointBlue hover:underline decoration-wavy decoration-2 transition"
          >
            About
          </Link>
        </div>
      </div>
    </nav>
  );
}
