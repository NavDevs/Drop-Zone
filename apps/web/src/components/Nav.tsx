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
              'border px-4 py-1.5 transition-all duration-200 cursor-pointer',
              isCurrent('/benchmark')
                ? 'border-neonCyan bg-neonCyan shadow-[0_0_18px_rgba(0,255,255,0.9)]'
                : 'border-retroBorder bg-black/60 text-chrome/80 hover:border-neonCyan hover:text-neonCyan hover:shadow-[0_0_12px_rgba(0,255,255,0.4)]',
            ].join(' ')}
          >
            <span className={isCurrent('/benchmark') ? 'text-black font-extrabold' : ''}>
              [ BENCHMARK ]
            </span>
          </Link>

          {/* ABOUT link */}
          <Link
            to="/about"
            className={[
              'border px-4 py-1.5 transition-all duration-200 cursor-pointer',
              isCurrent('/about')
                ? 'border-neonMagenta bg-neonMagenta shadow-[0_0_18px_rgba(255,0,255,0.9)]'
                : 'border-retroBorder bg-black/60 text-chrome/80 hover:border-neonMagenta hover:text-neonMagenta hover:shadow-[0_0_12px_rgba(255,0,255,0.4)]',
            ].join(' ')}
          >
            <span className={isCurrent('/about') ? 'text-black font-extrabold' : ''}>
              [ ABOUT ]
            </span>
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
