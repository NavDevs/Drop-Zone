import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Outlet } from 'react-router';
import './index.css';
import { Landing } from './routes/Landing.js';
import { Room } from './routes/Room.js';
import { About } from './routes/About.js';
import { Nav } from './components/Nav.js';
import { applyTheme, useSettingsStore } from './state/settingsStore.js';

function Layout() {
  return (
    <div className="min-h-screen bg-white text-gray-900 dark:bg-gray-950 dark:text-gray-100">
      <Nav />
      <Outlet />
    </div>
  );
}

function ThemeBootstrap() {
  const theme = useSettingsStore((s) => s.theme);
  const watchSystemTheme = useSettingsStore((s) => s.watchSystemTheme);
  useEffect(() => {
    applyTheme(theme);
    return watchSystemTheme();
  }, [theme, watchSystemTheme]);
  return null;
}

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Root element not found');

createRoot(rootEl).render(
  <StrictMode>
    <ThemeBootstrap />
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Landing />} />
          <Route path="/r/:code" element={<Room />} />
          <Route path="/about" element={<About />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
