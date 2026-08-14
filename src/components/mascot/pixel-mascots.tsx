'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { usePathname } from 'next/navigation'

// ==========================================
// KURO (CAT) MESSAGES
// ==========================================
const KURO_MESSAGES_GENERAL = [
  "Meow! Hi, I'm Kuro the black-grey tabby cat! 🐾",
  "Nom nom... Kuro just caught a yummy fish! 🐟",
  "Wheee! Kuro is chasing a cute butterfly! 🦋",
  "Mmm... Kuro loves sniffing fresh flowers ~ 🌸",
  "Boing! Kuro loves patrolling NayPict! 📸",
  "Purrr... NayPict gallery is Kuro's favorite spot! 💖",
  "Purrrr... Click Kuro anytime for random fun! ✨",
]

const KURO_MESSAGES_LANDING = [
  "Meow! Welcome to NayPict! Explore the gallery or browse albums! 📸",
  "Purrr... Kuro is chilling right on top of the hero card! ✨",
  "Meow! Click any button below to get started! 🚀",
  "Purrrr... Kuro loves this infinite floating canvas! 🎨",
]

const KURO_MESSAGES_PREVIEW = [
  "Purrr... Kuro loves watching this photo preview with you! 📸",
  "Meow! What a gorgeous photo! ✨",
  "Purrrr... Kuro is sitting right under your photo ~ 🐱",
  "Nom nom... Kuro brought a fish to eat while viewing photos! 🐟",
]

type CatState =
  | 'idle'
  | 'walk-left'
  | 'walk-right'
  | 'run-left'
  | 'run-right'
  | 'sleep'
  | 'happy'
  | 'butterfly'
  | 'flower'
  | 'fish'
  | 'jump'

type FacingDirection = 'left' | 'right'

export function PixelMascots() {
  const pathname = usePathname()
  const isLandingPage = pathname === '/'
  const [isLightboxOpen, setIsLightboxOpen] = useState<boolean>(false)

  // Kuro State
  const [kuroState, setKuroState] = useState<CatState>('idle')
  const [kuroX, setKuroX] = useState<number>(0)
  const [kuroFacing, setKuroFacing] = useState<FacingDirection>('right')
  const [kuroBubble, setKuroBubble] = useState<string | null>(null)
  const [kuroJumping, setKuroJumping] = useState<boolean>(false)

  const [animFrame, setAnimFrame] = useState<number>(0)

  const kuroXRef = useRef<number>(0)
  const kuroTargetXRef = useRef<number>(0)
  const animFrameIdRef = useRef<number | null>(null)
  const kuroTimerRef = useRef<NodeJS.Timeout | null>(null)

  // Track directional facing for Kuro
  useEffect(() => {
    if (kuroState === 'walk-left' || kuroState === 'run-left') {
      setKuroFacing('left')
    } else if (kuroState === 'walk-right' || kuroState === 'run-right') {
      setKuroFacing('right')
    }
  }, [kuroState])

  // Detect Lightbox Photo Viewer
  useEffect(() => {
    const checkLightbox = () => {
      const portal = document.querySelector('.yarl__portal')
      setIsLightboxOpen(!!portal)
    }

    checkLightbox()
    const observer = new MutationObserver(checkLightbox)
    observer.observe(document.body, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [])

  // Calculate territory bounds for current mode, fully responsive for mobile phones
  const getBounds = useCallback(() => {
    const screenWidth = typeof window !== 'undefined' ? window.innerWidth : 800
    const isMobile = screenWidth < 640

    if (isLightboxOpen) {
      return { minX: isMobile ? -100 : -140, maxX: isMobile ? 100 : 140, isRelative: true }
    }
    if (isLandingPage) {
      return { minX: isMobile ? -90 : -130, maxX: isMobile ? 90 : 130, isRelative: true }
    }
    const minX = isMobile ? 40 : 130
    const maxX = Math.max(minX + 60, screenWidth - (isMobile ? 70 : 180))
    return { minX, maxX, isRelative: false }
  }, [isLightboxOpen, isLandingPage])

  // Reset position safely when mode changes
  useEffect(() => {
    const { minX, maxX, isRelative } = getBounds()
    if (isRelative) {
      kuroXRef.current = 0
      kuroTargetXRef.current = 0
      setKuroX(0)
    } else {
      const startKuro = Math.min(Math.max(minX, 150), maxX - 60)
      kuroXRef.current = startKuro
      kuroTargetXRef.current = startKuro
      setKuroX(startKuro)
    }
  }, [isLightboxOpen, isLandingPage, getBounds])

  // Animation leg/arm frame switcher
  useEffect(() => {
    const interval = setInterval(() => {
      setAnimFrame((prev) => (prev === 0 ? 1 : 0))
    }, 150)
    return () => clearInterval(interval)
  }, [])

  // Smooth Movement Loop for Kuro (60 FPS)
  useEffect(() => {
    const moveLoop = () => {
      if (kuroState.startsWith('walk') || kuroState.startsWith('run')) {
        const diffK = kuroTargetXRef.current - kuroXRef.current
        const speedK = kuroState.startsWith('run') ? 2.2 : 1.1

        if (Math.abs(diffK) <= speedK) {
          kuroXRef.current = kuroTargetXRef.current
          setKuroX(kuroTargetXRef.current)
          const nextK: CatState[] = ['idle', 'butterfly', 'flower', 'fish', 'sleep']
          setKuroState(nextK[Math.floor(Math.random() * nextK.length)])
        } else {
          kuroXRef.current += diffK > 0 ? speedK : -speedK
          setKuroX(kuroXRef.current)
        }
      }

      animFrameIdRef.current = requestAnimationFrame(moveLoop)
    }

    animFrameIdRef.current = requestAnimationFrame(moveLoop)
    return () => {
      if (animFrameIdRef.current) cancelAnimationFrame(animFrameIdRef.current)
    }
  }, [kuroState])

  // Autonomous Decision Engine (Every 3.8s)
  useEffect(() => {
    const decisionInterval = setInterval(() => {
      const { minX, maxX } = getBounds()

      if (!kuroBubble && !kuroState.startsWith('walk') && !kuroState.startsWith('run')) {
        if (Math.random() < 0.5) {
          const newTargetK = Math.floor(Math.random() * (maxX - minX)) + minX
          kuroTargetXRef.current = newTargetK
          const isRun = Math.random() < 0.3
          setKuroState(newTargetK < kuroXRef.current ? (isRun ? 'run-left' : 'walk-left') : (isRun ? 'run-right' : 'walk-right'))
        } else {
          const actsK: CatState[] = ['butterfly', 'flower', 'fish', 'sleep', 'idle']
          setKuroState(actsK[Math.floor(Math.random() * actsK.length)])
        }
      }
    }, 3800)

    return () => clearInterval(decisionInterval)
  }, [kuroState, kuroBubble, getBounds])

  // Click Kuro Handler
  const handleClickKuro = useCallback(() => {
    setKuroJumping(true)
    setTimeout(() => setKuroJumping(false), 350)
    setKuroState('happy')

    let pool = KURO_MESSAGES_GENERAL
    if (isLightboxOpen) pool = KURO_MESSAGES_PREVIEW
    else if (isLandingPage) pool = KURO_MESSAGES_LANDING

    setKuroBubble(pool[Math.floor(Math.random() * pool.length)])

    if (kuroTimerRef.current) clearTimeout(kuroTimerRef.current)
    kuroTimerRef.current = setTimeout(() => {
      setKuroBubble(null)
      setKuroState('idle')
    }, 4500)
  }, [isLightboxOpen, isLandingPage])

  // Container styling configuration
  const getContainerStyle = (x: number): { className: string; style: React.CSSProperties } => {
    const screenWidth = typeof window !== 'undefined' ? window.innerWidth : 800
    const isMobile = screenWidth < 640

    if (isLightboxOpen) {
      // Photo Preview Mode: Standing exactly on top of the thumbnail photo list bar (46px mobile / 75px desktop)
      return {
        className: 'fixed bottom-[46px] md:bottom-[75px] left-1/2 z-[1000000] flex flex-col items-center select-none pointer-events-auto touch-manipulation',
        style: { transform: `translateX(calc(-50% + ${x}px))` },
      }
    }
    if (isLandingPage) {
      // Landing Page Mode: Standing exactly on top of the hero card's top border line as their ground
      const cardEl = typeof document !== 'undefined' ? document.getElementById('landing-hero-card') : null
      const cardRect = cardEl ? cardEl.getBoundingClientRect() : null
      const topY = cardRect ? cardRect.top - (isMobile ? 32 : 36) : undefined

      return {
        className: 'fixed left-1/2 z-[99999] flex flex-col items-center select-none pointer-events-auto touch-manipulation',
        style: cardRect && topY !== undefined ? {
          top: `${topY}px`,
          transform: `translateX(calc(-50% + ${x}px))`,
        } : {
          top: '50%',
          transform: `translate(calc(-50% + ${x}px), -245px)`,
        },
      }
    }
    return {
      className: 'fixed bottom-2 sm:bottom-4 z-[99999] flex flex-col items-center select-none pointer-events-auto touch-manipulation',
      style: { left: `${x}px` },
    }
  }

  // Dynamic Speech Bubble Clamping calculation - placed above Kuro's head with downward pointing arrow
  const getBubbleAlignment = () => {
    const { isRelative } = getBounds()
    const screenWidth = typeof window !== 'undefined' ? window.innerWidth : 800

    if (isRelative) {
      if (kuroX < -45) {
        return {
          bubbleClass: 'absolute bottom-[100%] mb-2.5 left-0 translate-x-0 px-2.5 sm:px-3 py-1.5 rounded-2xl text-[11px] sm:text-xs font-semibold backdrop-blur-md border shadow-xl w-max max-w-[180px] sm:max-w-[250px] text-center animate-in fade-in zoom-in-95 duration-200 z-50 leading-tight sm:leading-snug break-words',
          arrowClass: 'absolute left-4 -bottom-1 w-2 h-2 border-r border-b rotate-45',
        }
      }
      if (kuroX > 45) {
        return {
          bubbleClass: 'absolute bottom-[100%] mb-2.5 right-0 left-auto translate-x-0 px-2.5 sm:px-3 py-1.5 rounded-2xl text-[11px] sm:text-xs font-semibold backdrop-blur-md border shadow-xl w-max max-w-[180px] sm:max-w-[250px] text-center animate-in fade-in zoom-in-95 duration-200 z-50 leading-tight sm:leading-snug break-words',
          arrowClass: 'absolute right-4 left-auto -bottom-1 w-2 h-2 border-r border-b rotate-45',
        }
      }
    } else {
      if (kuroX < 110) {
        return {
          bubbleClass: 'absolute bottom-[100%] mb-2.5 left-0 translate-x-0 px-2.5 sm:px-3 py-1.5 rounded-2xl text-[11px] sm:text-xs font-semibold backdrop-blur-md border shadow-xl w-max max-w-[180px] sm:max-w-[250px] text-center animate-in fade-in zoom-in-95 duration-200 z-50 leading-tight sm:leading-snug break-words',
          arrowClass: 'absolute left-4 -bottom-1 w-2 h-2 border-r border-b rotate-45',
        }
      }
      if (kuroX > screenWidth - 140) {
        return {
          bubbleClass: 'absolute bottom-[100%] mb-2.5 right-0 left-auto translate-x-0 px-2.5 sm:px-3 py-1.5 rounded-2xl text-[11px] sm:text-xs font-semibold backdrop-blur-md border shadow-xl w-max max-w-[180px] sm:max-w-[250px] text-center animate-in fade-in zoom-in-95 duration-200 z-50 leading-tight sm:leading-snug break-words',
          arrowClass: 'absolute right-4 left-auto -bottom-1 w-2 h-2 border-r border-b rotate-45',
        }
      }
    }

    return {
      bubbleClass: 'absolute bottom-[100%] mb-2.5 left-1/2 -translate-x-1/2 px-2.5 sm:px-3 py-1.5 rounded-2xl text-[11px] sm:text-xs font-semibold backdrop-blur-md border shadow-xl w-max max-w-[190px] sm:max-w-[280px] text-center animate-in fade-in zoom-in-95 duration-200 z-50 leading-tight sm:leading-snug break-words',
      arrowClass: 'absolute left-1/2 -bottom-1 -translate-x-1/2 w-2 h-2 border-r border-b rotate-45',
    }
  }

  const kuroStyle = getContainerStyle(kuroX)
  const isKuroMoving = kuroState.startsWith('walk') || kuroState.startsWith('run')
  const bubbleAlign = getBubbleAlignment()

  return (
    <>
      {/* ========================================== */}
      {/* KURO (CAT MASCOT)                          */}
      {/* ========================================== */}
      <div
        className={kuroStyle.className}
        style={{
          ...kuroStyle.style,
          forcedColorAdjust: 'none',
          colorScheme: 'normal',
        }}
      >
        {kuroBubble && (
          <div
            className={bubbleAlign.bubbleClass}
            style={{
              backgroundColor: 'rgba(10, 10, 10, 0.92)',
              color: '#ffffff',
              borderColor: 'rgba(255, 255, 255, 0.2)',
              forcedColorAdjust: 'none',
              colorScheme: 'normal',
            }}
          >
            <div
              className={bubbleAlign.arrowClass}
              style={{
                backgroundColor: 'rgba(10, 10, 10, 0.92)',
                borderColor: 'rgba(255, 255, 255, 0.2)',
                forcedColorAdjust: 'none',
              }}
            />
            {kuroBubble}
          </div>
        )}

        <button
          type="button"
          onClick={handleClickKuro}
          title="Click Kuro!"
          className={`group relative cursor-pointer outline-none flex items-center justify-center transition-all ${
            kuroJumping || kuroState === 'jump' ? '-translate-y-2 scale-110' : 'hover:scale-110 active:scale-95'
          }`}
          style={{
            transform: `${kuroFacing === 'left' ? 'scaleX(-1)' : 'scaleX(1)'} translateY(${isKuroMoving && animFrame === 1 ? '-1px' : '0px'})`,
            transition: 'transform 0.15s ease',
            forcedColorAdjust: 'none',
            colorScheme: 'normal',
          }}
        >
          {kuroState === 'butterfly' && (
            <div className="absolute -top-3 left-6 animate-bounce">
              <svg width="14" height="14" viewBox="0 0 8 8" style={{ imageRendering: 'pixelated', forcedColorAdjust: 'none' }}>
                <rect x="3" y="2" width="2" height="4" fill="#0f172a" />
                <rect x={animFrame === 0 ? "1" : "0"} y="1" width="2" height="3" fill="#f43f5e" />
                <rect x={animFrame === 0 ? "5" : "6"} y="1" width="2" height="3" fill="#06b6d4" />
              </svg>
            </div>
          )}

          {kuroState === 'flower' && (
            <div className="absolute bottom-0 -left-4 animate-pulse">
              <svg width="14" height="14" viewBox="0 0 8 8" style={{ imageRendering: 'pixelated', forcedColorAdjust: 'none' }}>
                <rect x="3" y="4" width="2" height="4" fill="#22c55e" />
                <rect x="2" y="2" width="4" height="3" fill="#f43f5e" />
                <rect x="3" y="3" width="2" height="1" fill="#fef08a" />
              </svg>
            </div>
          )}

          {kuroState === 'fish' && (
            <div className="absolute bottom-1 -right-4 animate-pulse">
              <svg width="14" height="12" viewBox="0 0 8 6" style={{ imageRendering: 'pixelated', forcedColorAdjust: 'none' }}>
                <rect x="1" y="1" width="5" height="4" rx="1" fill="#3b82f6" />
                <rect x="6" y="0" width="2" height="6" fill="#60a5fa" />
                <rect x="2" y="2" width="1" height="1" fill="#0f172a" />
              </svg>
            </div>
          )}

          {/* SVG KURO (BLACK/GREY TABBY CAT WITH DIRECTIONAL WALKING SILHOUETTE) */}
          <svg width="38" height="38" viewBox="0 0 16 16" className="drop-shadow-md" style={{ imageRendering: 'pixelated', forcedColorAdjust: 'none', colorScheme: 'normal' }}>
            {kuroState === 'sleep' ? (
              /* SLEEPING CAT */
              <g>
                <rect x="3" y="6" width="2" height="2" fill="#0f172a" />
                <rect x="4" y="7" width="1" height="1" fill="#f43f5e" />
                <rect x="11" y="6" width="2" height="2" fill="#0f172a" />
                <rect x="11" y="7" width="1" height="1" fill="#f43f5e" />
                <rect x="2" y="8" width="12" height="6" rx="2" fill="#475569" />
                <rect x="3" y="8" width="2" height="4" fill="#0f172a" />
                <rect x="7" y="8" width="2" height="4" fill="#0f172a" />
                <rect x="11" y="8" width="2" height="4" fill="#0f172a" />
                <rect x="4" y="11" width="8" height="3" fill="#f8fafc" />
                <rect x="4" y="10" width="2" height="1" fill="#0f172a" />
                <rect x="10" y="10" width="2" height="1" fill="#0f172a" />
                <rect x="7" y="10" width="2" height="1" fill="#f43f5e" />
                <text x="12" y="5" fontSize="4" fill="#60a5fa" fontWeight="bold">z</text>
              </g>
            ) : isKuroMoving ? (
              /* QUADRUPED CAT WALKING / RUNNING SPRITE (SIDE PROFILE) */
              <g>
                {/* Ears */}
                <rect x="10" y="2" width="3" height="3" fill="#0f172a" />
                <rect x="11" y="3" width="1" height="1" fill="#f43f5e" />
                {/* Head */}
                <rect x="9" y="4" width="6" height="5" fill="#475569" />
                <rect x="11" y="4" width="2" height="2" fill="#0f172a" />
                {/* Eye looking forward */}
                <rect x="12" y="6" width="2" height="2" fill="#10b981" />
                <rect x="13" y="6" width="1" height="2" fill="#0f172a" />
                {/* Snout & Nose */}
                <rect x="14" y="7" width="2" height="1" fill="#f43f5e" />
                {/* Quadruped Cat Body */}
                <rect x="2" y="7" width="9" height="5" fill="#475569" />
                <rect x="5" y="7" width="2" height="5" fill="#0f172a" />
                <rect x="4" y="8" width="6" height="4" fill="#f8fafc" />
                {/* Rhythmic Quadruped Paws Walking Motion */}
                <rect x={animFrame === 0 ? "3" : "5"} y="12" width="2" height="4" fill="#f8fafc" />
                <rect x={animFrame === 0 ? "9" : "7"} y="12" width="2" height="4" fill="#f8fafc" />
                {/* Swishing Tail */}
                <rect x="0" y={animFrame === 0 ? "5" : "6"} width="3" height="4" rx="1" fill="#0f172a" />
              </g>
            ) : (
              /* IDLE / HAPPY SITTING CAT */
              <g>
                <rect x="2" y="2" width="3" height="3" fill="#0f172a" />
                <rect x="3" y="3" width="1" height="1" fill="#f43f5e" />
                <rect x="11" y="2" width="3" height="3" fill="#0f172a" />
                <rect x="12" y="3" width="1" height="1" fill="#f43f5e" />
                <rect x="2" y="4" width="12" height="5" fill="#475569" />
                <rect x="6" y="4" width="4" height="2" fill="#0f172a" />
                <rect x="4" y="6" width="2" height="2" fill="#10b981" />
                <rect x="4" y="6" width="1" height="2" fill="#0f172a" />
                <rect x="10" y="6" width="2" height="2" fill="#10b981" />
                <rect x="10" y="6" width="1" height="2" fill="#0f172a" />
                <rect x="7" y="7" width="2" height="1" fill="#f43f5e" />
                <rect x="3" y="9" width="10" height="5" fill="#475569" />
                <rect x="4" y="9" width="2" height="5" fill="#0f172a" />
                <rect x="10" y="9" width="2" height="5" fill="#0f172a" />
                <rect x="6" y="9" width="4" height="5" fill="#f8fafc" />
                <rect x="4" y="14" width="2" height="2" fill="#f8fafc" />
                <rect x="10" y="14" width="2" height="2" fill="#f8fafc" />
                <rect x="13" y="8" width="2" height="5" rx="1" fill="#0f172a" />
              </g>
            )}
          </svg>
        </button>
      </div>
    </>
  )
}

// Export alias for backward compatibility
export { PixelMascots as PixelCat }
