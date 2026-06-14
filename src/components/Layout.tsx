import type { ReactNode } from 'react';
import { useAuthStore } from '@/stores/authStore';
import Sidebar from './Sidebar';

export default function Layout({ children }: { children: ReactNode }) {
  const { user } = useAuthStore();

  if (!user) return null;

  return (
    <div className="flex h-screen bg-slate-50">
      <Sidebar />
      <main className="flex-1 overflow-y-auto p-6">
        {children}
      </main>
    </div>
  );
}
