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
  "Boing! Kuro loves patrolling NayPict with C! 📸",
  "Purrr... C gives the best head pats! 💖",
  "Purrrr... Click Kuro anytime for random fun! ✨",
]

const KURO_MESSAGES_LANDING = [
  "Meow! Welcome to NayPict! Explore the gallery or browse albums! 📸",
  "Purrr... Kuro & C are chilling on the hero card! ✨",
  "Meow! Click any button below to get started! 🚀",
]

const KURO_MESSAGES_PREVIEW = [
  "Purrr... Kuro loves watching this photo preview with C! 📸",
  "Meow! What a gorgeous photo! ✨",
  "Purrrr... Kuro is sitting right under your photo ~ 🐱",
]

// ==========================================
// C (PRINCESS PEACH) MESSAGES
// ==========================================
const C_MESSAGES_GENERAL = [
  "Hi! I'm C 👑 Welcome to NayPict!",
  "C is taking a pretty photo of the gallery! 📸",
  "Mmm... C loves drinking warm tea while viewing photos ~ ☕",
  "C says: Have a magical & aesthetic day! ✨",
  "C is reading a cozy art book 📖",
  "Look! C and Kuro are exploring together! 💖",
  "C: Don't forget to check out the albums! 👑",
]

const C_MESSAGES_LANDING = [
  "Welcome! C & Kuro are here to guide your journey! 👑✨",
  "C loves this aesthetic infinite floating gallery! 🎨",
  "Explore photos or browse albums with C & Kuro! 🚀",
]

const C_MESSAGES_PREVIEW = [
  "C: Wow, this photo is absolutely breathtaking! 💖",
  "C is taking notes on this beautiful memory ~ 📖",
  "C & Kuro love previewing photos with you! 👑",
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

type HumanState =
  | 'idle'
  | 'walk-left'
  | 'walk-right'
  | 'run-left'
  | 'run-right'
  | 'tea'
  | 'book'
  | 'camera'
  | 'wave'
  | 'pet-kuro'
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

  // C (Princess Peach) State
  const [cState, setCState] = useState<HumanState>('idle')
  const [cX, setCX] = useState<number>(60)
  const [cFacing, setCFacing] = useState<FacingDirection>('right')
  const [cBubble, setCBubble] = useState<string | null>(null)
  const [cJumping, setCJumping] = useState<boolean>(false)

  const [animFrame, setAnimFrame] = useState<number>(0)

  const kuroXRef = useRef<number>(0)
  const kuroTargetXRef = useRef<number>(0)

  const cXRef = useRef<number>(60)
  const cTargetXRef = useRef<number>(60)

  const animFrameIdRef = useRef<number | null>(null)
  const kuroTimerRef = useRef<NodeJS.Timeout | null>(null)
  const cTimerRef = useRef<NodeJS.Timeout | null>(null)

  // Track directional facing for Kuro
  useEffect(() => {
    if (kuroState === 'walk-left' || kuroState === 'run-left') {
      setKuroFacing('left')
    } else if (kuroState === 'walk-right' || kuroState === 'run-right') {
      setKuroFacing('right')
    }
  }, [kuroState])

  // Track directional facing for C
  useEffect(() => {
    if (cState === 'walk-left' || cState === 'run-left') {
      setCFacing('left')
    } else if (cState === 'walk-right' || cState === 'run-right') {
      setCFacing('right')
    }
  }, [cState])

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
      return { minX: isMobile ? -90 : -140, maxX: isMobile ? 90 : 140, isRelative: true }
    }
    if (isLandingPage) {
      return { minX: isMobile ? -85 : -130, maxX: isMobile ? 85 : 130, isRelative: true }
    }
    const minX = isMobile ? 40 : 130
    const maxX = Math.max(minX + 60, screenWidth - (isMobile ? 70 : 180))
    return { minX, maxX, isRelative: false }
  }, [isLightboxOpen, isLandingPage])

  // Reset positions safely when mode changes
  useEffect(() => {
    const { minX, maxX, isRelative } = getBounds()
    if (isRelative) {
      kuroXRef.current = -40
      kuroTargetXRef.current = -40
      setKuroX(-40)

      cXRef.current = 40
      cTargetXRef.current = 40
      setCX(40)
    } else {
      const startKuro = Math.min(Math.max(minX, 150), maxX - 60)
      const startC = Math.min(Math.max(minX + 60, 220), maxX)

      kuroXRef.current = startKuro
      kuroTargetXRef.current = startKuro
      setKuroX(startKuro)

      cXRef.current = startC
      cTargetXRef.current = startC
      setCX(startC)
    }
  }, [isLightboxOpen, isLandingPage, getBounds])

  // Animation leg/arm frame switcher (fast for smooth gait)
  useEffect(() => {
    const interval = setInterval(() => {
      setAnimFrame((prev) => (prev === 0 ? 1 : 0))
    }, 160)
    return () => clearInterval(interval)
  }, [])

  // Smooth Movement Loop for both Kuro & C (60 FPS)
  useEffect(() => {
    const moveLoop = () => {
      // Kuro Movement
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

      // C (Princess Peach) Movement
      if (cState.startsWith('walk') || cState.startsWith('run')) {
        const diffC = cTargetXRef.current - cXRef.current
        const speedC = cState.startsWith('run') ? 2.0 : 1.0

        if (Math.abs(diffC) <= speedC) {
          cXRef.current = cTargetXRef.current
          setCX(cTargetXRef.current)
          const nextC: HumanState[] = ['idle', 'tea', 'book', 'camera', 'wave']
          setCState(nextC[Math.floor(Math.random() * nextC.length)])
        } else {
          cXRef.current += diffC > 0 ? speedC : -speedC
          setCX(cXRef.current)
        }
      }

      animFrameIdRef.current = requestAnimationFrame(moveLoop)
    }

    animFrameIdRef.current = requestAnimationFrame(moveLoop)
    return () => {
      if (animFrameIdRef.current) cancelAnimationFrame(animFrameIdRef.current)
    }
  }, [kuroState, cState])

  // Autonomous Decision & Interaction Engine (Every 3.8s)
  useEffect(() => {
    const decisionInterval = setInterval(() => {
      const { minX, maxX } = getBounds()
      const rand = Math.random()

      // Occasional Duo Interaction if close to each other
      const dist = Math.abs(kuroXRef.current - cXRef.current)
      if (dist < 65 && rand < 0.35 && !kuroBubble && !cBubble) {
        setCState('pet-kuro')
        setKuroState('happy')
        setCBubble("C: Good kitty Kuro ~ 💕")
        setKuroBubble("Kuro: Purrrrr! 💖")

        setTimeout(() => {
          setCBubble(null)
          setKuroBubble(null)
          setCState('idle')
          setKuroState('idle')
        }, 3500)
        return
      }

      // Kuro Decision
      if (!kuroBubble && !kuroState.startsWith('walk') && !kuroState.startsWith('run')) {
        if (Math.random() < 0.5) {
          let newTargetK = Math.floor(Math.random() * (maxX - minX)) + minX
          if (Math.abs(newTargetK - cXRef.current) < 45) {
            newTargetK = newTargetK < cXRef.current ? newTargetK - 50 : newTargetK + 50
            newTargetK = Math.min(Math.max(minX, newTargetK), maxX)
          }
          kuroTargetXRef.current = newTargetK
          const isRun = Math.random() < 0.3
          setKuroState(newTargetK < kuroXRef.current ? (isRun ? 'run-left' : 'walk-left') : (isRun ? 'run-right' : 'walk-right'))
        } else {
          const actsK: CatState[] = ['butterfly', 'flower', 'fish', 'sleep', 'idle']
          setKuroState(actsK[Math.floor(Math.random() * actsK.length)])
        }
      }

      // C Decision
      if (!cBubble && !cState.startsWith('walk') && !cState.startsWith('run')) {
        if (Math.random() < 0.5) {
          let newTargetC = Math.floor(Math.random() * (maxX - minX)) + minX
          if (Math.abs(newTargetC - kuroXRef.current) < 45) {
            newTargetC = newTargetC < kuroXRef.current ? newTargetC - 50 : newTargetC + 50
            newTargetC = Math.min(Math.max(minX, newTargetC), maxX)
          }
          cTargetXRef.current = newTargetC
          const isRun = Math.random() < 0.3
          setCState(newTargetC < cXRef.current ? (isRun ? 'run-left' : 'walk-left') : (isRun ? 'run-right' : 'walk-right'))
        } else {
          const actsC: HumanState[] = ['tea', 'book', 'camera', 'wave', 'idle']
          setCState(actsC[Math.floor(Math.random() * actsC.length)])
        }
      }
    }, 3800)

    return () => clearInterval(decisionInterval)
  }, [kuroState, cState, kuroBubble, cBubble, getBounds])

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

  // Click C (Princess Peach) Handler
  const handleClickC = useCallback(() => {
    setCJumping(true)
    setTimeout(() => setCJumping(false), 350)
    setCState('wave')

    let pool = C_MESSAGES_GENERAL
    if (isLightboxOpen) pool = C_MESSAGES_PREVIEW
    else if (isLandingPage) pool = C_MESSAGES_LANDING

    setCBubble(pool[Math.floor(Math.random() * pool.length)])

    if (cTimerRef.current) clearTimeout(cTimerRef.current)
    cTimerRef.current = setTimeout(() => {
      setCBubble(null)
      setCState('idle')
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
      className: 'fixed top-1 z-[99999] flex flex-col items-center select-none pointer-events-auto touch-manipulation',
      style: { left: `${x}px` },
    }
  }

  const kuroStyle = getContainerStyle(kuroX)
  const cStyle = getContainerStyle(cX)

  const isKuroMoving = kuroState.startsWith('walk') || kuroState.startsWith('run')
  const isCMoving = cState.startsWith('walk') || cState.startsWith('run')

  const isDuoBubble = Boolean(kuroBubble && cBubble)
  const isKuroLeft = kuroX <= cX

  // Dynamic non-overlapping speech bubble styling for Kuro
  const getKuroBubbleClass = () => {
    if (isDuoBubble) {
      return isKuroLeft
        ? 'absolute top-11 right-3 px-2.5 sm:px-3 py-1.5 rounded-2xl bg-black/90 text-white text-[11px] sm:text-xs font-semibold backdrop-blur-md border border-white/20 shadow-xl w-max max-w-[160px] sm:max-w-[220px] text-center animate-in fade-in zoom-in-95 duration-200 z-50 leading-tight sm:leading-snug break-words'
        : 'absolute top-20 left-3 px-2.5 sm:px-3 py-1.5 rounded-2xl bg-black/90 text-white text-[11px] sm:text-xs font-semibold backdrop-blur-md border border-white/20 shadow-xl w-max max-w-[160px] sm:max-w-[220px] text-center animate-in fade-in zoom-in-95 duration-200 z-50 leading-tight sm:leading-snug break-words'
    }
    return 'absolute top-11 left-1/2 -translate-x-1/2 px-2.5 sm:px-3 py-1.5 rounded-2xl bg-black/90 text-white text-[11px] sm:text-xs font-semibold backdrop-blur-md border border-white/20 shadow-xl w-max max-w-[190px] sm:max-w-[280px] text-center animate-in fade-in zoom-in-95 duration-200 z-50 leading-tight sm:leading-snug break-words'
  }

  // Dynamic non-overlapping speech bubble styling for C
  const getCBubbleClass = () => {
    if (isDuoBubble) {
      return isKuroLeft
        ? 'absolute top-20 left-3 px-2.5 sm:px-3 py-1.5 rounded-2xl bg-black/90 text-white text-[11px] sm:text-xs font-semibold backdrop-blur-md border border-pink-400/40 shadow-xl w-max max-w-[160px] sm:max-w-[220px] text-center animate-in fade-in zoom-in-95 duration-200 z-50 leading-tight sm:leading-snug break-words'
        : 'absolute top-11 right-3 px-2.5 sm:px-3 py-1.5 rounded-2xl bg-black/90 text-white text-[11px] sm:text-xs font-semibold backdrop-blur-md border border-pink-400/40 shadow-xl w-max max-w-[160px] sm:max-w-[220px] text-center animate-in fade-in zoom-in-95 duration-200 z-50 leading-tight sm:leading-snug break-words'
    }
    return 'absolute top-11 left-1/2 -translate-x-1/2 px-2.5 sm:px-3 py-1.5 rounded-2xl bg-black/90 text-white text-[11px] sm:text-xs font-semibold backdrop-blur-md border border-pink-400/40 shadow-xl w-max max-w-[190px] sm:max-w-[280px] text-center animate-in fade-in zoom-in-95 duration-200 z-50 leading-tight sm:leading-snug break-words'
  }

  return (
    <>
      {/* ========================================== */}
      {/* KURO (CAT MASCOT)                          */}
      {/* ========================================== */}
      <div className={kuroStyle.className} style={kuroStyle.style}>
        {kuroBubble && (
          <div className={getKuroBubbleClass()}>
            <div className="absolute left-1/2 -top-1 -translate-x-1/2 w-2 h-2 bg-black/90 border-l border-t border-white/20 rotate-45" />
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
          }}
        >
          {kuroState === 'butterfly' && (
            <div className="absolute -top-3 left-6 animate-bounce">
              <svg width="14" height="14" viewBox="0 0 8 8" style={{ imageRendering: 'pixelated' }}>
                <rect x="3" y="2" width="2" height="4" fill="#0f172a" />
                <rect x={animFrame === 0 ? "1" : "0"} y="1" width="2" height="3" fill="#f43f5e" />
                <rect x={animFrame === 0 ? "5" : "6"} y="1" width="2" height="3" fill="#06b6d4" />
              </svg>
            </div>
          )}

          {kuroState === 'flower' && (
            <div className="absolute bottom-0 -left-4 animate-pulse">
              <svg width="14" height="14" viewBox="0 0 8 8" style={{ imageRendering: 'pixelated' }}>
                <rect x="3" y="4" width="2" height="4" fill="#22c55e" />
                <rect x="2" y="2" width="4" height="3" fill="#f43f5e" />
                <rect x="3" y="3" width="2" height="1" fill="#fef08a" />
              </svg>
            </div>
          )}

          {kuroState === 'fish' && (
            <div className="absolute bottom-1 -right-4 animate-pulse">
              <svg width="14" height="12" viewBox="0 0 8 6" style={{ imageRendering: 'pixelated' }}>
                <rect x="1" y="1" width="5" height="4" rx="1" fill="#3b82f6" />
                <rect x="6" y="0" width="2" height="6" fill="#60a5fa" />
                <rect x="2" y="2" width="1" height="1" fill="#0f172a" />
              </svg>
            </div>
          )}

          {/* SVG KURO (BLACK/GREY TABBY CAT WITH DIRECTIONAL WALKING SILHOUETTE) */}
          <svg width="38" height="38" viewBox="0 0 16 16" className="drop-shadow-md" style={{ imageRendering: 'pixelated' }}>
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

      {/* ========================================== */}
      {/* C (PRINCESS PEACH HUMAN MASCOT)             */}
      {/* ========================================== */}
      <div className={cStyle.className} style={cStyle.style}>
        {cBubble && (
          <div className={getCBubbleClass()}>
            <div className="absolute left-1/2 -top-1 -translate-x-1/2 w-2 h-2 bg-black/90 border-l border-t border-pink-400/40 rotate-45" />
            {cBubble}
          </div>
        )}

        <button
          type="button"
          onClick={handleClickC}
          title="Click C (Princess Peach)!"
          className={`group relative cursor-pointer outline-none flex items-center justify-center transition-all ${
            cJumping || cState === 'jump' ? '-translate-y-2 scale-110' : 'hover:scale-110 active:scale-95'
          }`}
          style={{
            transform: `${cFacing === 'left' ? 'scaleX(-1)' : 'scaleX(1)'} translateY(${isCMoving && animFrame === 1 ? '-1px' : '0px'})`,
            transition: 'transform 0.15s ease',
          }}
        >
          {/* C ITEM OVERLAYS (Tea, Book, Camera) */}
          {cState === 'tea' && (
            <div className="absolute bottom-1 -right-4 animate-bounce">
              <svg width="12" height="12" viewBox="0 0 6 6" style={{ imageRendering: 'pixelated' }}>
                <rect x="1" y="2" width="4" height="4" rx="1" fill="#ffffff" />
                <rect x="2" y="1" width="2" height="1" fill="#93c5fd" />
              </svg>
            </div>
          )}

          {cState === 'book' && (
            <div className="absolute bottom-1 -left-4 animate-pulse">
              <svg width="12" height="12" viewBox="0 0 6 6" style={{ imageRendering: 'pixelated' }}>
                <rect x="1" y="1" width="4" height="4" fill="#ec4899" />
                <rect x="2" y="2" width="2" height="2" fill="#ffffff" />
              </svg>
            </div>
          )}

          {cState === 'camera' && (
            <div className="absolute -top-3 right-0 animate-ping">
              <span className="text-[10px]">✨</span>
            </div>
          )}

          {/* SVG C (100% IDENTICAL TO USER REFERENCE IMAGE PIXEL ART) */}
          <svg width="42" height="70" viewBox="0 0 38 68" className="drop-shadow-md" style={{ imageRendering: 'pixelated' }}>
            {/* === BLACK OUTLINE & BASE SHAPE === */}
            {/* Crown Spikes */}
            <rect x="14" y="2" width="10" height="7" fill="#000000" />
            <rect x="15" y="3" width="8" height="5" fill="#f5a623" />
            <rect x="18" y="4" width="2" height="3" fill="#e60000" />
            <rect x="15" y="4" width="2" height="2" fill="#0091ff" />
            <rect x="21" y="4" width="2" height="2" fill="#0091ff" />

            {/* Hair Flaring Outline & Golden Yellow Fill */}
            {/* Top Hair Dome */}
            <path d="M 10 7 L 28 7 L 31 10 L 33 14 L 35 17 L 32 17 L 36 21 L 30 21 L 33 26 L 29 26 L 31 33 L 7 33 L 9 26 L 5 26 L 8 21 L 2 21 L 6 17 L 3 17 L 5 14 L 7 10 Z" fill="#ffe57f" stroke="#000000" strokeWidth="1" />

            {/* Cyan Earrings */}
            <rect x="12" y="20" width="3" height="3" rx="1" fill="#0091ff" stroke="#000000" strokeWidth="0.5" />
            <rect x="23" y="20" width="3" height="3" rx="1" fill="#0091ff" stroke="#000000" strokeWidth="0.5" />

            {/* Peach Face Front */}
            <rect x="14" y="10" width="10" height="11" fill="#fedac2" />
            {/* Black Eyebrows */}
            <rect x="15" y="11" width="3" height="1" fill="#000000" />
            <rect x="20" y="11" width="3" height="1" fill="#000000" />
            {/* Ocean Blue Eyes */}
            <rect x="15" y="13" width="3" height="4" fill="#0091ff" stroke="#000000" strokeWidth="0.5" />
            <rect x="16" y="13" width="1" height="2" fill="#000000" />
            <rect x="20" y="13" width="3" height="4" fill="#0091ff" stroke="#000000" strokeWidth="0.5" />
            <rect x="21" y="13" width="1" height="2" fill="#000000" />
            {/* Nose Dot */}
            <rect x="18.5" y="17" width="1" height="1.5" fill="#000000" />
            {/* Red Lips */}
            <rect x="17.5" y="19" width="3" height="1" fill="#e60000" />

            {/* Light Pink Puff Sleeves & Bodice */}
            <rect x="10" y="22" width="6" height="5" rx="1" fill="#ff9ebb" stroke="#000000" strokeWidth="1" />
            <rect x="22" y="22" width="6" height="5" rx="1" fill="#ff9ebb" stroke="#000000" strokeWidth="1" />

            {/* Cyan Brooch with Gold Ring */}
            <ellipse cx="19" cy="24" rx="2.5" ry="3" fill="#0091ff" stroke="#f5a623" strokeWidth="1" />

            {/* White V-Lace Bodice Panel */}
            <path d="M 16 26 L 22 26 L 20 33 L 18 33 Z" fill="#ffffff" stroke="#000000" strokeWidth="0.5" />

            {/* Hot Pink Hip Peplum / Panniers */}
            <path d="M 9 32 C 9 32, 14 30, 18 33 C 14 38, 9 37, 9 32 Z" fill="#ff3b7c" stroke="#000000" strokeWidth="1" />
            <path d="M 29 32 C 29 32, 24 30, 20 33 C 24 38, 29 37, 29 32 Z" fill="#ff3b7c" stroke="#000000" strokeWidth="1" strokeLinecap="round" />

            {/* Long White Gloves */}
            {cState === 'wave' ? (
              <g>
                <path d="M 7 30 L 10 26 L 11 36 L 8 36 Z" fill="#ffffff" stroke="#000000" strokeWidth="1" />
                {/* Waving Arm Raised */}
                <path d="M 28 26 L 31 16 L 33 16 L 30 26 Z" fill="#ffffff" stroke="#000000" strokeWidth="1" />
              </g>
            ) : (
              <g>
                <path d="M 7 30 L 10 26 L 11 38 L 8 38 Z" fill="#ffffff" stroke="#000000" strokeWidth="1" />
                <path d="M 31 30 L 28 26 L 27 38 L 30 38 Z" fill="#ffffff" stroke="#000000" strokeWidth="1" />
              </g>
            )}

            {/* Main Sweeping Gown Skirt */}
            {/* Outer Skirt Mid-Pink */}
            <path d="M 8 34 L 30 34 L 36 64 L 2 64 Z" fill="#f06292" stroke="#000000" strokeWidth="1" />
            {/* Center Panel Pastel Pink */}
            <path d="M 16 33 L 22 33 L 26 64 L 12 64 Z" fill="#ff9ebb" />

            {/* Flanking White Lace Trim Borders */}
            <path d="M 15 33 L 16 33 L 13 64 L 11 64 Z" fill="#ffffff" />
            <path d="M 22 33 L 23 33 L 27 64 L 25 64 Z" fill="#ffffff" />

            {/* Gold Embroidery Pattern along Trim */}
            <path d="M 14 34 L 15 34 L 12 64 L 11.5 64 Z" fill="#ffc107" />
            <path d="M 23 34 L 24 34 L 26.5 64 L 26 64 Z" fill="#ffc107" />

            {/* Bottom Hem White Lace & Gold Embroidery */}
            <path d="M 2 62 L 36 62 L 37 66 L 1 66 Z" fill="#ffffff" stroke="#000000" strokeWidth="0.5" />
            <path d="M 2 65 L 36 65 L 36 67 L 2 67 Z" fill="#ff3b7c" />
            <path d="M 3 66 L 35 66 L 35 67 L 3 67 Z" fill="#ffc107" />
          </svg>
        </button>
      </div>
    </>
  )
}
