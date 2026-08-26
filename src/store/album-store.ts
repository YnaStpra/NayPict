"use client"

import { create } from "zustand"
import { type AlbumVo } from "@/server/entity/vo/album"

// This module manages the currently entering album status.

interface AlbumState {
  albums: AlbumVo[]
  currentAlbumName: string
  setAlbums: (albums: AlbumVo[]) => void
  setCurrentAlbumName: (name: string) => void
}

// Read and update the current album name.
const useAlbumStore = create<AlbumState>((set) => ({
  albums: [],
  currentAlbumName: "",

  // Set global album list.
  setAlbums: (albums) => set({ albums }),

  // Set current album name.
  setCurrentAlbumName: (name) => set({ currentAlbumName: name }),
}))

export { useAlbumStore }
