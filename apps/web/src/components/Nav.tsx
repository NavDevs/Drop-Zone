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
          <img
            src="/favicon.svg"
            alt="DropZone Logo"
            className="h-8 w-8 -skew-x-12 rounded-sm transition-all duration-200 group-hover:skew-x-0 group-hover:rotate-6 group-hover:scale-110 drop-shadow-[0_0_12px_#00FFFF]"
          />
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

          {/* Status indicator with Scanline Inner Glow & Tilt */}
          <div className="-skew-x-6 hover:skew-x-0 border px-3 py-1.5 transition-all duration-200 font-bold vapor-button-cyan select-none cursor-default">
            <span className="inline-flex items-center gap-2 skew-x-6 hover:skew-x-0">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-80" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-white shadow-[0_0_8px_#FFFFFF]" />
              </span>
              GRID_ONLINE
            </span>
          </div>

        </div>
      </div>
    </nav>
  );
}
