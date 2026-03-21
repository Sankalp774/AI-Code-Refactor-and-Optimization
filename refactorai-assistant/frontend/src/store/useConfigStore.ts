import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type AppMode = 'local' | 'cloud'

interface ConfigState {
  mode: AppMode
  setMode: (mode: AppMode) => void
}

export const useConfigStore = create<ConfigState>()(
  persist(
    (set) => ({
      mode: 'local',
      setMode: (mode) => set({ mode }),
    }),
    {
      name: 'refactorai-config',
      version: 1,
      partialize: (s) => ({ mode: s.mode }),
    },
  ),
)

