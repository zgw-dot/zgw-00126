import { create } from 'zustand';
import { api } from '@/utils/api';
import type { User } from '@/types';

interface AuthState {
  user: User | null;
  token: string | null;
  loading: boolean;
  error: string | null;
  login: (username: string, password: string, role: 'student' | 'teacher' | 'admin') => Promise<void>;
  logout: () => void;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: JSON.parse(localStorage.getItem('user') || 'null'),
  token: localStorage.getItem('token'),
  loading: false,
  error: null,

  login: async (username, password, role) => {
    set({ loading: true, error: null });
    try {
      const result = await api.post<{ token: string; user: User }>('/auth/login', {
        username,
        password,
        role,
      });
      localStorage.setItem('token', result.token);
      localStorage.setItem('user', JSON.stringify(result.user));
      set({ user: result.user, token: result.token, loading: false });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : '登录失败',
        loading: false,
      });
      throw err;
    }
  },

  logout: () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    set({ user: null, token: null, error: null });
  },

  clearError: () => set({ error: null }),
}));
