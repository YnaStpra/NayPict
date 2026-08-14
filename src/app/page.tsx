'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { photoList } from '@/request/photo'
import { type PhotoVo } from '@/server/entity/vo/photo'
import { Camera, FolderHeart, Image as ImageIcon, ArrowRight } from 'lucide-react'

const InfiniteGallery = dynamic(
  () => import('@/components/gallery/infinite-gallery').then((mod) => mod.InfiniteGallery),
  { ssr: false }
)

export default function Home() {
  const [photos, setPhotos] = useState<PhotoVo[]>([])

  useEffect(() => {
    photoList({ size: 40, shuffle: true })
      .then((res) => {
        if (res.list && res.list.length > 0) {
          setPhotos(res.list)
        }
      })
      .catch((err) => {
        console.error('Failed to load landing gallery photos:', err)
      })
  }, [])

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-black select-none">
      {/* Dynamic Infinite Canvas Background */}
      <div className="absolute inset-0 z-0">
        <InfiniteGallery
          photos={photos}
          driftAmount={0.3}
          dragSpeed={0.8}
          className="w-full h-full"
        />
        {/* Subtle Dark Gradient Overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/40 to-black/70 backdrop-blur-[2px] pointer-events-none" />
      </div>

      {/* Floating Centered Hero Card */}
      <div className="fixed inset-0 z-20 flex items-center justify-center p-4 pointer-events-none">
        <div className="pointer-events-auto max-w-sm sm:max-w-md w-full rounded-3xl bg-black/45 backdrop-blur-2xl border border-white/20 shadow-2xl p-6 sm:p-8 text-center text-white flex flex-col items-center gap-6 animate-in fade-in zoom-in-95 duration-500">
          
          {/* Logo & Icon */}
          <div className="relative">
            <div className="absolute -inset-1 rounded-full bg-gradient-to-r from-primary via-emerald-400 to-teal-400 opacity-75 blur-md animate-pulse" />
            <div className="relative size-16 sm:size-20 rounded-2xl bg-gradient-to-br from-neutral-900 to-black border border-white/20 flex items-center justify-center shadow-xl">
              <Camera className="size-8 sm:size-10 text-emerald-400" />
            </div>
          </div>

          {/* Title & Tagline */}
          <div className="space-y-2">
            <h1 className="text-4xl sm:text-5xl font-black tracking-tight bg-gradient-to-r from-white via-slate-100 to-emerald-200 bg-clip-text text-transparent drop-shadow-md">
              NayPict
            </h1>
            <p className="text-xs sm:text-sm text-slate-300 font-medium max-w-xs mx-auto leading-relaxed">
              Galeri Foto Indah & Koleksi Album Kenangan Estetik
            </p>
          </div>

          {/* Navigation Action Buttons */}
          <div className="flex flex-col gap-3 w-full pt-2">
            <Link
              href="/photos"
              className="group relative flex items-center justify-between w-full h-12 px-5 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-bold text-sm sm:text-base shadow-lg shadow-emerald-950/40 hover:shadow-emerald-500/30 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200"
            >
              <div className="flex items-center gap-3">
                <ImageIcon className="size-5" />
                <span>Jelajahi Galeri</span>
              </div>
              <ArrowRight className="size-4 opacity-75 group-hover:translate-x-1 transition-transform" />
            </Link>

            <Link
              href="/albums"
              className="group relative flex items-center justify-between w-full h-12 px-5 rounded-2xl bg-white/10 hover:bg-white/20 border border-white/20 text-white font-bold text-sm sm:text-base backdrop-blur-md hover:scale-[1.02] active:scale-[0.98] transition-all duration-200"
            >
              <div className="flex items-center gap-3">
                <FolderHeart className="size-5 text-amber-300" />
                <span>Lihat Album</span>
              </div>
              <ArrowRight className="size-4 opacity-75 group-hover:translate-x-1 transition-transform" />
            </Link>
          </div>

        </div>
      </div>
    </main>
  )
}
