"use client"

import { create } from "zustand"
import { persist } from "zustand/middleware"
import { type PhotoVo } from "@/server/entity/vo/photo"

// This module manages the photo upload pop-up window status, Information sidebar switch and successfully uploaded photo queue.

interface UploadedPhoto extends PhotoVo {
  // uploadAlbumId Record the album to which this newly uploaded photo has been added id.
  uploadAlbumId: string | null
}

interface PhotoState {
  uploadOpen: boolean
  uploadAlbumId: string | null
  infoOpen: boolean
  uploadedPhotos: UploadedPhoto[]
  photoCache: Map<string, string>
  openUpload: (albumId: string | null) => void
  closeUpload: () => void
  setInfoOpen: (open: boolean) => void
  toggleInfoOpen: () => void
  addUploadedPhoto: (photo: PhotoVo, albumId: string | null) => void
  takeUploadedPhotos: () => UploadedPhoto[]
  getPhotoCache: (photoId: string) => string | undefined
  setPhotoCache: (photoId: string, src: string) => void
}

// Read and update global status related to photo upload, infoOpen pass persist Write to local storage.
const usePhotoStore = create<PhotoState>()(persist((set, get) => ({
  uploadOpen: false,
  uploadAlbumId: null,
  infoOpen: true,
  uploadedPhotos: [],
  photoCache: new Map(),

  // Open the upload pop-up window, And record the album used when adding new photos this time id.
  openUpload: (albumId) => set({
    uploadOpen: true,
    uploadAlbumId: albumId,
  }),

  // Close upload pop-up window, Keep local status in upload list.
  closeUpload: () => set({ uploadOpen: false }),

  // Set the expansion state of the information sidebar.
  setInfoOpen: (open) => set({ infoOpen: open }),

  // Toggle the expanded state of the information sidebar.
  toggleInfoOpen: () => set({ infoOpen: !get().infoOpen }),

  // Record the photos returned after successful upload, Waiting for photo list page consumption.
  addUploadedPhoto: (photo, albumId) => set((state) => ({
    uploadedPhotos: [...state.uploadedPhotos, {
      ...photo,
      uploadAlbumId: albumId,
    }],
  })),

  // Remove successfully uploaded photos from the queue, And clear the queue synchronously.
  takeUploadedPhotos: () => {
    const photos = get().uploadedPhotos

    set({ uploadedPhotos: [] })
    return photos
  },

  // Read the loaded photo cache.
  getPhotoCache: (photoId) => get().photoCache.get(photoId),

  // Save the loaded photo cache.
  setPhotoCache: (photoId, src) => set((state) => {
    const photoCache = new Map(state.photoCache)

    photoCache.set(photoId, src)
    return { photoCache }
  }),
}), {
  name: "photo-store",
  // Only persist the information sidebar switch, Upload queue and cache are not written locally.
  partialize: (state) => ({ infoOpen: state.infoOpen }),
}))

export { usePhotoStore }
