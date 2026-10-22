import { Link } from 'react-router';
import { ThemeToggle } from './ThemeToggle.js';

/** Top navigation: brand link + About + theme toggle. */
export function Nav() {
  return (
    <nav className="sticky top-0 z-10 border-b border-gray-200 bg-white/80 backdrop-blur dark:border-gray-800 dark:bg-gray-950/80">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        <Link
          to="/"
          className="text-lg font-bold tracking-tight text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500 rounded dark:text-gray-100"
        >
          DropZone
        </Link>
        <div className="flex items-center gap-3">
          <Link
            to="/benchmark"
            className="text-sm font-medium text-gray-600 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500 rounded dark:text-gray-400 dark:hover:text-gray-100"
          >
            Benchmark
          </Link>
          <Link
            to="/about"
            className="text-sm font-medium text-gray-600 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500 rounded dark:text-gray-400 dark:hover:text-gray-100"
          >
            About
          </Link>
          <ThemeToggle />
        </div>
      </div>
    </nav>
  );
}
