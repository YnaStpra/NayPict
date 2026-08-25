'use client'

import { useEffect, useState, useRef, useTransition, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { Camera, FolderHeart, Image as ImageIcon, ArrowRight, Loader2, MapPin, Compass } from 'lucide-react'
import { type PhotoVo } from '@/server/entity/vo/photo'
import { photoList } from '@/request/photo'

// Dynamic import InfiniteGallery with ssr: false for smooth client canvas initialization
const InfiniteGallery = dynamic(
  () => import('@/components/gallery/infinite-gallery').then((mod) => mod.InfiniteGallery),
  { ssr: false }
)

interface LandingClientProps {
  initialPhotos: PhotoVo[]
}

export function LandingClient({ initialPhotos }: LandingClientProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [photos, setPhotos] = useState<PhotoVo[]>(initialPhotos || [])
  const [isMobileScreen, setIsMobileScreen] = useState(false)

  // Direct DOM Refs for Zero-Overhead 120 FPS Spotlight & 3D Tilt without React re-renders
  const cardRef = useRef<HTMLDivElement>(null)
  const glareRef = useRef<HTMLDivElement>(null)
  const spotlightRef = useRef<HTMLDivElement>(null)
  const canvasContainerRef = useRef<HTMLDivElement>(null)
  const rafTiltRef = useRef<number | null>(null)

  // Handle direct photo share URL redirect (e.g. /?photoId=123 -> /photos?photoId=123)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const photoId = new URLSearchParams(window.location.search).get('photoId')
      if (photoId) {
        window.location.href = `/photos?photoId=${photoId}`
        return
      }
      setIsMobileScreen(window.innerWidth < 640)
      const handleResize = () => setIsMobileScreen(window.innerWidth < 640)
      window.addEventListener('resize', handleResize, { passive: true })
      return () => window.removeEventListener('resize', handleResize)
    }
  }, [])

  // Eager route prefetching
  useEffect(() => {
    router.prefetch('/photos')
    router.prefetch('/albums')
    router.prefetch('/map')
  }, [router])

  // Fetch client-side if initialPhotos was empty
  useEffect(() => {
    if (initialPhotos && initialPhotos.length > 0) return

    photoList({ size: 40, shuffle: true })
      .then((res) => {
        if (res?.list && res.list.length > 0) {
          setPhotos(res.list)
        }
      })
      .catch((err) => {
        console.error('[Landing] Failed to fetch gallery photos:', err)
      })
  }, [initialPhotos])

  // Gyroscope 3D Tilt Parallax on Mobile Devices
  useEffect(() => {
    if (typeof window === 'undefined' || !window.DeviceOrientationEvent) return

    const handleOrientation = (e: DeviceOrientationEvent) => {
      if (e.gamma === null || e.beta === null || !canvasContainerRef.current) return
      const clampedGamma = Math.max(-25, Math.min(25, e.gamma)) / 25
      const clampedBeta = Math.max(-25, Math.min(25, e.beta - 45)) / 25
      canvasContainerRef.current.style.transform = `translate3d(${clampedGamma * 16}px, ${clampedBeta * 16}px, 0)`
    }

    window.addEventListener('deviceorientation', handleOrientation, { passive: true })
    return () => window.removeEventListener('deviceorientation', handleOrientation)
  }, [])

  // Zero-React-Rerender Hardware-Accelerated Spotlight & 3D Tilt Tracking
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const clientX = e.clientX
    const clientY = e.clientY

    if (rafTiltRef.current !== null) {
      cancelAnimationFrame(rafTiltRef.current)
    }

    rafTiltRef.current = requestAnimationFrame(() => {
      // 1. Move Spotlight Halo on Compositor Thread (0ms React overhead)
      if (spotlightRef.current) {
        spotlightRef.current.style.transform = `translate3d(${clientX - 325}px, ${clientY - 325}px, 0)`
        spotlightRef.current.style.opacity = '1'
      }

      // 2. Compute 3D Perspective Tilt on Card (Desktop only)
      if (!cardRef.current || isMobileScreen) return

      const rect = cardRef.current.getBoundingClientRect()
      const cardCenterX = rect.left + rect.width / 2
      const cardCenterY = rect.top + rect.height / 2

      const dx = (clientX - cardCenterX) / (rect.width / 2)
      const dy = (clientY - cardCenterY) / (rect.height / 2)

      const maxTilt = 8
      const rotateX = Math.max(-maxTilt, Math.min(maxTilt, -dy * maxTilt))
      const rotateY = Math.max(-maxTilt, Math.min(maxTilt, dx * maxTilt))

      cardRef.current.style.transform = `rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(2)}deg) translateZ(8px)`
      cardRef.current.style.boxShadow = `0 24px 48px -12px rgba(0, 0, 0, 0.85), ${(-rotateY * 2).toFixed(1)}px ${(rotateX * 2).toFixed(1)}px 32px 0px rgba(255, 255, 255, 0.05)`

      if (glareRef.current) {
        const glareX = (((clientX - rect.left) / rect.width) * 100).toFixed(1)
        const glareY = (((clientY - rect.top) / rect.height) * 100).toFixed(1)
        glareRef.current.style.background = `radial-gradient(350px circle at ${glareX}% ${glareY}%, rgba(255, 255, 255, 0.2), transparent 70%)`
      }
    })
  }, [isMobileScreen])

  const handleMouseLeave = useCallback(() => {
    if (rafTiltRef.current !== null) {
      cancelAnimationFrame(rafTiltRef.current)
    }

    if (spotlightRef.current) {
      spotlightRef.current.style.opacity = '0'
    }

    if (cardRef.current) {
      cardRef.current.style.transform = 'rotateX(0deg) rotateY(0deg) translateZ(0px)'
      cardRef.current.style.boxShadow = '0 24px 48px -12px rgba(0, 0, 0, 0.85)'
    }
  }, [])

  const handleNavigate = (href: string) => {
    startTransition(() => {
      router.push(href)
    })
  }

  const displayPhotos = photos.length > 0 ? photos : initialPhotos

  return (
    <main
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className="relative w-screen h-screen overflow-hidden bg-black select-none perspective-1000"
    >
      {/* Zero-Overhead Hardware-Composited Spotlight Glow Follower */}
      <div
        ref={spotlightRef}
        className="pointer-events-none absolute top-0 left-0 size-[650px] rounded-full opacity-0 transition-opacity duration-300 z-10 will-change-transform"
        style={{
          background: 'radial-gradient(circle, rgba(255, 255, 255, 0.075) 0%, rgba(255, 255, 255, 0.02) 45%, transparent 70%)',
        }}
      />

      {/* Dynamic Infinite Canvas Background with Hardware Parallax */}
      <div
        ref={canvasContainerRef}
        className="absolute inset-0 z-0 will-change-transform"
      >
        <InfiniteGallery
          photos={displayPhotos}
          driftAmount={0.3}
          dragSpeed={0.8}
          className="w-full h-full"
        />
        {/* Subtle Dark Radial Vignette */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/40 to-black/70 backdrop-blur-[1.5px] pointer-events-none" />
      </div>

      {/* =========================================================================
          DESKTOP: Apple-Inspired 3D Glassmorphism Hero Card with Conic Aura Beam
         ========================================================================= */}
      <div className="hidden sm:flex fixed inset-0 z-20 items-center justify-center p-4 pointer-events-none">
        <div
          ref={cardRef}
          id="landing-hero-card"
          className="pointer-events-auto border-beam-container max-w-md w-full rounded-[32px] p-[1.5px] shadow-2xl perspective-card-inner will-change-transform"
          style={{
            transform: 'rotateX(0deg) rotateY(0deg) translateZ(0px)',
            boxShadow: '0 24px 48px -12px rgba(0, 0, 0, 0.85)',
          }}
        >
          {/* Conic Gradient Animated Border Beam Ray */}
          <div className="border-beam-ray" />

          {/* Glassmorphism Inner Content Card */}
          <div className="relative z-10 w-full rounded-[31px] bg-black/60 backdrop-blur-3xl border border-white/20 p-8 text-center text-white flex flex-col items-center gap-6 overflow-hidden">
            {/* Dynamic Surface Glare Reflection */}
            <div
              ref={glareRef}
              className="pointer-events-none absolute inset-0 opacity-40 transition-opacity duration-300"
            />

            {/* Glowing Logo & Camera Icon */}
            <div className="relative">
              <div className="absolute -inset-2 rounded-2xl bg-gradient-to-r from-blue-500/20 via-purple-500/20 to-pink-500/20 opacity-80 blur-lg animate-pulse" />
              <div className="relative size-20 rounded-2xl bg-gradient-to-br from-neutral-900 via-black to-neutral-950 border border-white/25 flex items-center justify-center shadow-2xl">
                <Camera className="size-10 text-white drop-shadow-md" />
              </div>
            </div>

            {/* Title & Tagline */}
            <div className="space-y-2">
              <h1 className="text-4xl sm:text-5xl font-black tracking-tight text-white drop-shadow-lg">
                NayPict
              </h1>
              <p className="text-xs sm:text-sm text-slate-300 font-medium max-w-xs mx-auto leading-relaxed">
                Aesthetic Photo Gallery & Curated Album Collection
              </p>
            </div>

            {/* Magnetic Action Buttons with Shimmer Sweep */}
            <div className="flex flex-col gap-3 w-full pt-1">
              <Link
                href="/photos"
                prefetch={true}
                onMouseEnter={() => router.prefetch('/photos')}
                onPointerDown={() => router.prefetch('/photos')}
                onClick={(e) => {
                  e.preventDefault()
                  handleNavigate('/photos')
                }}
                className="btn-shimmer-interactive group relative flex items-center justify-between w-full h-12 px-5 rounded-2xl bg-white/10 hover:bg-white/20 border border-white/25 text-white font-bold text-sm sm:text-base backdrop-blur-md hover:scale-[1.02] active:scale-[0.98] cursor-pointer shadow-lg"
              >
                <div className="flex items-center gap-3">
                  <ImageIcon className="size-5 text-white/90" />
                  <span>Explore Gallery</span>
                </div>
                <div className="flex items-center">
                  {isPending ? (
                    <Loader2 className="size-4 animate-spin opacity-80" />
                  ) : (
                    <ArrowRight className="size-4 opacity-75 group-hover:translate-x-1 transition-transform" />
                  )}
                </div>
              </Link>

              <Link
                href="/albums"
                prefetch={true}
                onMouseEnter={() => router.prefetch('/albums')}
                onPointerDown={() => router.prefetch('/albums')}
                onClick={(e) => {
                  e.preventDefault()
                  handleNavigate('/albums')
                }}
                className="btn-shimmer-interactive group relative flex items-center justify-between w-full h-12 px-5 rounded-2xl bg-white/10 hover:bg-white/20 border border-white/25 text-white font-bold text-sm sm:text-base backdrop-blur-md hover:scale-[1.02] active:scale-[0.98] cursor-pointer shadow-lg"
              >
                <div className="flex items-center gap-3">
                  <FolderHeart className="size-5 text-white/90" />
                  <span>Browse Albums</span>
                </div>
                <div className="flex items-center">
                  {isPending ? (
                    <Loader2 className="size-4 animate-spin opacity-80" />
                  ) : (
                    <ArrowRight className="size-4 opacity-75 group-hover:translate-x-1 transition-transform" />
                  )}
                </div>
              </Link>

              <Link
                href="/map"
                prefetch={true}
                onMouseEnter={() => router.prefetch('/map')}
                onPointerDown={() => router.prefetch('/map')}
                onClick={(e) => {
                  e.preventDefault()
                  handleNavigate('/map')
                }}
                className="btn-shimmer-interactive group relative flex items-center justify-between w-full h-12 px-5 rounded-2xl bg-white/10 hover:bg-white/20 border border-white/25 text-white font-bold text-sm sm:text-base backdrop-blur-md hover:scale-[1.02] active:scale-[0.98] cursor-pointer shadow-lg"
              >
                <div className="flex items-center gap-3">
                  <MapPin className="size-5 text-white/90" />
                  <span>Photo Map Explorer</span>
                </div>
                <div className="flex items-center">
                  {isPending ? (
                    <Loader2 className="size-4 animate-spin opacity-80" />
                  ) : (
                    <ArrowRight className="size-4 opacity-75 group-hover:translate-x-1 transition-transform" />
                  )}
                </div>
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* =========================================================================
          MOBILE: Floating Minimalist Brand Header + Dynamic Island Bottom Dock
         ========================================================================= */}
      <div className="sm:hidden fixed inset-x-0 top-5 z-20 flex justify-center pointer-events-none px-4">
        <div className="pointer-events-auto flex items-center gap-2.5 px-4 py-2 rounded-full bg-black/60 backdrop-blur-2xl border border-white/20 shadow-2xl text-white">
          <div className="size-6 rounded-full bg-white/15 flex items-center justify-center border border-white/20">
            <Camera className="size-3.5 text-white" />
          </div>
          <span className="font-extrabold text-sm tracking-tight">NayPict</span>
          <span className="text-[10px] text-slate-400 font-medium pl-1 border-l border-white/20">
            Swipe canvas to explore
          </span>
        </div>
      </div>

      <div className="sm:hidden fixed inset-x-0 bottom-6 z-20 flex justify-center pointer-events-none px-4">
        <div className="pointer-events-auto dynamic-island-dock max-w-xs w-full rounded-[28px] p-2 flex items-center justify-between gap-1 shadow-2xl">
          <button
            onClick={() => handleNavigate('/photos')}
            className="flex-1 flex flex-col items-center justify-center gap-1 py-2 px-2 rounded-2xl bg-white/10 active:bg-white/25 text-white font-semibold text-[11px] transition-all"
          >
            <ImageIcon className="size-4 text-white" />
            <span>Gallery</span>
          </button>

          <button
            onClick={() => handleNavigate('/albums')}
            className="flex-1 flex flex-col items-center justify-center gap-1 py-2 px-2 rounded-2xl bg-white/10 active:bg-white/25 text-white font-semibold text-[11px] transition-all"
          >
            <FolderHeart className="size-4 text-white" />
            <span>Albums</span>
          </button>

          <button
            onClick={() => handleNavigate('/map')}
            className="flex-1 flex flex-col items-center justify-center gap-1 py-2 px-2 rounded-2xl bg-white/10 active:bg-white/25 text-white font-semibold text-[11px] transition-all"
          >
            <Compass className="size-4 text-white" />
            <span>Map</span>
          </button>
        </div>
      </div>
    </main>
  )
}
