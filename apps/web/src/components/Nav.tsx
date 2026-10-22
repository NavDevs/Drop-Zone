import { Link } from 'react-router';

/** Top navigation: Retro-futuristic Cyberpunk/Vaporwave Terminal bar. */
export function Nav() {
  return (
    <nav className="sticky top-0 z-40 border-b-2 border-retroBorder bg-void/90 backdrop-blur-md px-4 py-3">
      <div className="mx-auto flex max-w-6xl items-center justify-between">
        <Link
          to="/"
          className="flex items-center gap-2 group focus:outline-none"
        >
          <span className="flex h-7 w-7 items-center justify-center bg-neonMagenta text-black font-heading font-black text-sm -skew-x-12 group-hover:skew-x-0 transition-transform shadow-[0_0_10px_#FF00FF]">
            ▲
          </span>
          <span className="font-heading text-xl font-black tracking-widest text-white group-hover:text-neonCyan transition-colors">
            DROPZONE<span className="text-neonCyan font-mono text-base font-normal">.SYS</span>
          </span>
        </Link>
        <div className="flex items-center gap-4 text-sm font-mono uppercase tracking-wider">
          <Link
            to="/benchmark"
            className="px-2 py-1 text-chrome/80 hover:text-neonCyan hover:border-b-2 hover:border-neonCyan transition-all"
          >
            [ BENCHMARK ]
          </Link>
          <Link
            to="/about"
            className="px-2 py-1 text-chrome/80 hover:text-neonMagenta hover:border-b-2 hover:border-neonMagenta transition-all"
          >
            [ ABOUT ]
          </Link>
          <span className="hidden sm:inline-block border border-neonCyan/50 px-2 py-0.5 text-xs text-neonCyan bg-neonCyan/10">
            ONLINE
          </span>
        </div>
      </div>
    </nav>
  );
}
