import { Link, useLocation } from 'react-router';

/** Top navigation: Retro-futuristic Cyberpunk/Vaporwave Terminal bar. */
export function Nav() {
  const location = useLocation();

  const isCurrent = (path: string) => location.pathname === path;

  return (
    <nav className="sticky top-0 z-40 border-b-2 border-retroBorder bg-void/90 backdrop-blur-md px-4 py-3">
      <div className="mx-auto flex max-w-6xl items-center justify-between">
        <Link
          to="/"
          className="flex items-center gap-2.5 group focus:outline-none"
        >
          {/* Custom Vaporwave DropZone Logo */}
          <div className="relative flex h-8 w-8 items-center justify-center rounded-sm bg-gradient-to-br from-neonMagenta to-neonCyan p-0.5 shadow-[0_0_12px_rgba(255,0,255,0.7)] group-hover:shadow-[0_0_20px_#00FFFF] transition-all">
            <div className="flex h-full w-full items-center justify-center bg-black/90">
              <svg viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-neonCyan stroke-2 group-hover:stroke-white transition-colors" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 3v12" />
                <path d="m6 10 6 6 6-6" />
                <path d="M5 21h14" />
              </svg>
            </div>
          </div>
          <span className="font-heading text-xl font-black tracking-widest text-white group-hover:text-neonCyan transition-colors">
            DROPZONE<span className="text-neonCyan font-mono text-base font-normal">.SYS</span>
          </span>
        </Link>
        <div className="flex items-center gap-3 font-mono text-xs uppercase tracking-wider">
          <Link
            to="/benchmark"
            className={`border px-3 py-1.5 transition-all cursor-pointer ${
              isCurrent('/benchmark')
                ? 'border-neonCyan bg-neonCyan text-black font-bold shadow-[0_0_15px_rgba(0,255,255,0.6)]'
                : 'border-retroBorder bg-black/50 text-chrome/80 hover:border-neonCyan hover:text-neonCyan hover:bg-neonCyan/10'
            }`}
          >
            [ BENCHMARK ]
          </Link>
          <Link
            to="/about"
            className={`border px-3 py-1.5 transition-all cursor-pointer ${
              isCurrent('/about')
                ? 'border-neonMagenta bg-neonMagenta text-black font-bold shadow-[0_0_15px_rgba(255,0,255,0.6)]'
                : 'border-retroBorder bg-black/50 text-chrome/80 hover:border-neonMagenta hover:text-neonMagenta hover:bg-neonMagenta/10'
            }`}
          >
            [ ABOUT ]
          </Link>
          <span className="hidden sm:inline-flex items-center gap-1.5 border border-neonCyan/50 px-2.5 py-1 text-xs text-neonCyan bg-neonCyan/10">
            <span className="h-1.5 w-1.5 rounded-full bg-neonCyan animate-ping" />
            GRID_ONLINE
          </span>
        </div>
      </div>
    </nav>
  );
}
