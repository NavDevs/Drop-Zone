import { Link, useLocation } from 'react-router';

/** Top navigation: Retro-futuristic Cyberpunk/Vaporwave Terminal bar. */
export function Nav() {
  const location = useLocation();
  const isCurrent = (path: string) => location.pathname === path;

  return (
    <nav className="sticky top-0 z-40 border-b-2 border-retroBorder bg-void/90 backdrop-blur-md px-4 py-3">
      <div className="mx-auto flex max-w-6xl items-center justify-between">

        {/* Logo */}
        <Link to="/" className="group flex items-center gap-2.5 focus:outline-none">
          <span className="flex h-8 w-8 -skew-x-12 items-center justify-center bg-neonMagenta font-heading font-black text-sm text-black shadow-[0_0_12px_#FF00FF] transition-all duration-200 group-hover:skew-x-0 group-hover:rotate-6 group-hover:bg-neonCyan group-hover:shadow-[0_0_22px_#00FFFF]">
            ▲
          </span>
          <span className="font-heading text-xl font-black tracking-widest text-white transition-colors group-hover:text-neonCyan">
            DROPZONE<span className="text-neonCyan font-mono text-base font-normal">.SYS</span>
          </span>
        </Link>

        {/* Nav links */}
        <div className="flex items-center gap-3 font-mono text-xs uppercase tracking-wider">

          {/* BENCHMARK link */}
          <Link
            to="/benchmark"
            className={[
              '-skew-x-6 hover:skew-x-0 border px-4 py-1.5 transition-all duration-200 cursor-pointer font-bold',
              isCurrent('/benchmark')
                ? 'vapor-button-cyan'
                : 'border-retroBorder bg-black/60 text-chrome/80 hover-vapor-cyan',
            ].join(' ')}
          >
            <span className="inline-block skew-x-6 hover:skew-x-0">[ BENCHMARK ]</span>
          </Link>

          {/* ABOUT link */}
          <Link
            to="/about"
            className={[
              '-skew-x-6 hover:skew-x-0 border px-4 py-1.5 transition-all duration-200 cursor-pointer font-bold',
              isCurrent('/about')
                ? 'vapor-button-magenta'
                : 'border-retroBorder bg-black/60 text-chrome/80 hover-vapor-magenta',
            ].join(' ')}
          >
            <span className="inline-block skew-x-6 hover:skew-x-0">[ ABOUT ]</span>
          </Link>

          {/* Status indicator */}
          <span className="hidden sm:inline-flex items-center gap-1.5 border border-neonCyan/50 bg-neonCyan/10 px-2.5 py-1 text-xs text-neonCyan">
            <span className="h-1.5 w-1.5 rounded-full bg-neonCyan animate-ping" />
            GRID_ONLINE
          </span>

        </div>
      </div>
    </nav>
  );
}
