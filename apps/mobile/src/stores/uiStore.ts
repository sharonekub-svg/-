import { create } from 'zustand';

type Toast = { id: number; message: string; kind: 'info' | 'success' | 'error' };

type State = {
  toasts: Toast[];
  pushToast: (message: string, kind?: Toast['kind']) => void;
  dismissToast: (id: number) => void;
};

let nextId = 1;

export const useUiStore = create<State>((set) => ({
  toasts: [],
  pushToast: (message, kind = 'info') =>
    set((s) => ({ toasts: [...s.toasts, { id: nextId++, message, kind }] })),
  dismissToast: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));
