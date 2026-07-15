import { Toaster } from 'sonner';
import { Outlet } from 'react-router-dom';

import Nav from '../components/Nav';

export function BaseLayout() {
  return (
    <div className="min-h-screen bg-[var(--claude-canvas)] text-[var(--claude-ink)]">
      <main className="h-screen overflow-hidden flex flex-col">
        <Nav />
        <div className="flex-1 min-h-0 w-full">
          <Outlet />
        </div>
      </main>
      <Toaster
        richColors
        position="top-right"
        toastOptions={{
          style: {
            background: 'var(--claude-paper)',
            border: '1px solid var(--claude-border)',
            color: 'var(--claude-ink)',
          },
        }}
      />
    </div>
  );
}
