"use client"

import { create } from "zustand"

interface ShortcutsState {
  open: boolean
  openShortcuts: () => void
  closeShortcuts: () => void
  toggleShortcuts: () => void
  setOpen: (open: boolean) => void
}

export const useShortcutsStore = create<ShortcutsState>((set) => ({
  open: false,
  openShortcuts: () => set({ open: true }),
  closeShortcuts: () => set({ open: false }),
  toggleShortcuts: () => set((state) => ({ open: !state.open })),
  setOpen: (open: boolean) => set({ open }),
}))
