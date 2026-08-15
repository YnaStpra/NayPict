'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { usePathname } from 'next/navigation'

// ==========================================
// KURO (INDONESIAN ALLEY CAT) MESSAGES
// ==========================================
const KURO_MESSAGES_GENERAL = [
  "Meow! Hi, I'm Kuro, an Indonesian alley cat (kucing kampung)! 🐾",
  "Nom nom... Kuro just caught a yummy fish! 🐟",
  "Wheee! Kuro is chasing a cute butterfly! 🦋",
  "Mmm... Kuro loves sniffing fresh flowers ~ 🌸",
  "Purrr... Kuro is playing with a colorful yarn ball! 🧶",
  "Wash wash... Kuro is grooming his paws & face! 🧹",
  "Peek-a-boo! Kuro loves hiding inside cardboard boxes! 📦",
  "Big stretch ~ Kuro feels so relaxed & happy! 🐾",
  "Meow! Kuro and Pikachu are patrolling NayPict together! ⚡🐾",
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

const KURO_MESSAGES_ANNOYED = [
  "Hmph! Stop poking Kuro so fast! 😼💢",
  "Meow! Kuro is getting dizzy from all this clicking! 😵",
  "Hey! Kuro is trying to rest, stop spamming! 😾",
  "Purr... Please give Kuro a break! 🐾💢",
]

const KURO_MESSAGES_ANGRY = [
  "HISSSS! THAT'S IT! Kuro is ANGRY now! 😾🔥",
  "GRRRR... HISS! Leave Kuro alone for a moment! ⚡💢",
  "HISS! Kuro needs a 4-second timeout! 😾💥",
  "Rawrrr! Kuro will bite your finger if you keep poking! 😼🔥",
]

// ==========================================
// PIKACHU (POKEMON MASCOT) MESSAGES
// ==========================================
const PIKACHU_MESSAGES_GENERAL = [
  "Pika pika! Pikachu loves exploring NayPict with Kuro! ⚡💛",
  "Pikachuuuu! Electric energy for your photo gallery! ⚡✨",
  "Pika pika! Kuro and Pikachu are best buddies! ⚡🐾",
  "Pika? Click Pikachu for a cute electric spark! 💛⚡",
  "Chaaaa! Pikachu is super excited today! ⚡🌟",
]

const PIKACHU_MESSAGES_LANDING = [
  "Pika pika! Welcome to NayPict hero card! 📸⚡",
  "Pikachuuuu! Explore gallery photos or check albums below! 🚀⚡",
]

const PIKACHU_MESSAGES_PREVIEW = [
  "Pika! What an electric photo preview! ⚡📸",
  "Pikachuuuu! Watching photos with Kuro! ✨💛",
]

const PIKACHU_MESSAGES_SPAM = [
  "Pika pika... Don't poke Pikachu's red cheeks too hard! ⚡😲",
  "PIKACHUUUU! 100,000 Volt Electric Attack incoming! ⚡🔥",
]

type CatState =
  | 'idle'
  | 'walk-left'
  | 'walk-right'
  | 'run-left'
  | 'run-right'
  | 'sleep'
  | 'happy'
  | 'annoyed'
  | 'angry'
  | 'butterfly'
  | 'flower'
  | 'fish'
  | 'yarn'
  | 'groom'
  | 'box'
  | 'stretch'
  | 'jump'

type PikachuState =
  | 'idle'
  | 'walk-left'
  | 'walk-right'
  | 'happy'
  | 'spark'
  | 'jump'

type FacingDirection = 'left' | 'right'
type GazeDirection = 'center' | 'up' | 'down' | 'left' | 'right'

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
  const [isBlinking, setIsBlinking] = useState<boolean>(false)
  const [kuroGaze, setKuroGaze] = useState<GazeDirection>('center')

  // Pikachu State
  const [pikachuState, setPikachuState] = useState<PikachuState>('idle')
  const [pikachuFacing, setPikachuFacing] = useState<FacingDirection>('right')
  const [pikachuBubble, setPikachuBubble] = useState<string | null>(null)
  const [pikachuJumping, setPikachuJumping] = useState<boolean>(false)
  const [pikachuGaze, setPikachuGaze] = useState<GazeDirection>('center')

  const [animFrame, setAnimFrame] = useState<number>(0)

  const kuroXRef = useRef<number>(0)
  const kuroTargetXRef = useRef<number>(0)
  const animFrameIdRef = useRef<number | null>(null)
  const kuroTimerRef = useRef<NodeJS.Timeout | null>(null)
  const pikachuTimerRef = useRef<NodeJS.Timeout | null>(null)

  // Mood escalation click tracking
  const clickCountRef = useRef<number>(0)
  const lastClickTimeRef = useRef<number>(0)
  const coolDownTimerRef = useRef<NodeJS.Timeout | null>(null)
  const pikachuClickCountRef = useRef<number>(0)

  // Dynamic Gaze Direction Engine: Tracks nearby objects & wandering gaze
  useEffect(() => {
    if (kuroState === 'butterfly') {
      setKuroGaze('up')
    } else if (kuroState === 'flower') {
      setKuroGaze('left')
    } else if (kuroState === 'fish' || kuroState === 'yarn') {
      setKuroGaze('right')
    } else if (kuroState === 'groom') {
      setKuroGaze('down')
    } else if (kuroState === 'box') {
      setKuroGaze(animFrame === 0 ? 'left' : 'right')
    } else if (kuroState.startsWith('walk') || kuroState.startsWith('run')) {
      setKuroGaze('right')
    } else {
      const dirs: GazeDirection[] = ['center', 'up', 'down', 'left', 'right']
      setKuroGaze(dirs[Math.floor(Math.random() * dirs.length)])
    }
  }, [kuroState, animFrame])

  useEffect(() => {
    if (pikachuState === 'spark') {
      setPikachuGaze('up')
    } else if (pikachuState.startsWith('walk')) {
      setPikachuGaze('left')
    } else {
      setPikachuGaze(animFrame === 0 ? 'left' : 'center')
    }
  }, [pikachuState, animFrame])

  // Eye blinking animation timer
  useEffect(() => {
    const blinkInterval = setInterval(() => {
      setIsBlinking(true)
      setTimeout(() => setIsBlinking(false), 220)
    }, 3800)
    return () => clearInterval(blinkInterval)
  }, [])

  // Track directional facing for Kuro & Pikachu
  useEffect(() => {
    if (kuroState === 'walk-left' || kuroState === 'run-left') {
      setKuroFacing('left')
      setPikachuFacing('left')
    } else if (kuroState === 'walk-right' || kuroState === 'run-right') {
      setKuroFacing('right')
      setPikachuFacing('right')
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
          const nextK: CatState[] = ['idle', 'butterfly', 'flower', 'fish', 'yarn', 'groom', 'box', 'stretch', 'sleep']
          setKuroState(nextK[Math.floor(Math.random() * nextK.length)])
          setPikachuState('idle')
        } else {
          kuroXRef.current += diffK > 0 ? speedK : -speedK
          setKuroX(kuroXRef.current)
          setPikachuState(diffK > 0 ? 'walk-right' : 'walk-left')
        }
      }

      animFrameIdRef.current = requestAnimationFrame(moveLoop)
    }

    animFrameIdRef.current = requestAnimationFrame(moveLoop)
    return () => {
      if (animFrameIdRef.current) cancelAnimationFrame(animFrameIdRef.current)
    }
  }, [kuroState])

  // Autonomous Decision Engine (Every 3.8s) - paused if Kuro is angry or annoyed
  useEffect(() => {
    const decisionInterval = setInterval(() => {
      const { minX, maxX } = getBounds()

      if (!kuroBubble && kuroState !== 'angry' && kuroState !== 'annoyed' && !kuroState.startsWith('walk') && !kuroState.startsWith('run')) {
        if (Math.random() < 0.45) {
          const newTargetK = Math.floor(Math.random() * (maxX - minX)) + minX
          kuroTargetXRef.current = newTargetK
          const isRun = Math.random() < 0.3
          setKuroState(newTargetK < kuroXRef.current ? (isRun ? 'run-left' : 'walk-left') : (isRun ? 'run-right' : 'walk-right'))
        } else {
          const actsK: CatState[] = ['butterfly', 'flower', 'fish', 'yarn', 'groom', 'box', 'stretch', 'sleep', 'idle']
          setKuroState(actsK[Math.floor(Math.random() * actsK.length)])
        }
      }
    }, 3800)

    return () => clearInterval(decisionInterval)
  }, [kuroState, kuroBubble, getBounds])

  // Click Kuro Handler with Mood Escalation & Auto Cool-Down Reset
  const handleClickKuro = useCallback(() => {
    const now = Date.now()
    if (now - lastClickTimeRef.current < 2000) {
      clickCountRef.current += 1
    } else {
      clickCountRef.current = 1
    }
    lastClickTimeRef.current = now

    setKuroJumping(true)
    setTimeout(() => setKuroJumping(false), 350)

    if (coolDownTimerRef.current) clearTimeout(coolDownTimerRef.current)
    if (kuroTimerRef.current) clearTimeout(kuroTimerRef.current)

    const count = clickCountRef.current

    if (count >= 6) {
      // Level 3: ANGRY / FURIOUS SPAM!
      setKuroState('angry')
      const msg = KURO_MESSAGES_ANGRY[Math.floor(Math.random() * KURO_MESSAGES_ANGRY.length)]
      setKuroBubble(msg)

      coolDownTimerRef.current = setTimeout(() => {
        clickCountRef.current = 0
        setKuroBubble(null)
        setKuroState('idle')
      }, 4500)
    } else if (count >= 3) {
      // Level 2: ANNOYED / JENGKEL!
      setKuroState('annoyed')
      const msg = KURO_MESSAGES_ANNOYED[Math.floor(Math.random() * KURO_MESSAGES_ANNOYED.length)]
      setKuroBubble(msg)

      coolDownTimerRef.current = setTimeout(() => {
        clickCountRef.current = 0
        setKuroBubble(null)
        setKuroState('idle')
      }, 3800)
    } else {
      // Level 1: HAPPY / KEGIRANGAN!
      setKuroState('happy')
      let pool = KURO_MESSAGES_GENERAL
      if (isLightboxOpen) pool = KURO_MESSAGES_PREVIEW
      else if (isLandingPage) pool = KURO_MESSAGES_LANDING

      setKuroBubble(pool[Math.floor(Math.random() * pool.length)])

      kuroTimerRef.current = setTimeout(() => {
        clickCountRef.current = 0
        setKuroBubble(null)
        setKuroState('idle')
      }, 4000)
    }
  }, [isLightboxOpen, isLandingPage])

  // Click Pikachu Handler
  const handleClickPikachu = useCallback(() => {
    pikachuClickCountRef.current += 1
    setPikachuJumping(true)
    setTimeout(() => setPikachuJumping(false), 350)
    setPikachuState('spark')

    let pool = PIKACHU_MESSAGES_GENERAL
    if (pikachuClickCountRef.current > 4) pool = PIKACHU_MESSAGES_SPAM
    else if (isLightboxOpen) pool = PIKACHU_MESSAGES_PREVIEW
    else if (isLandingPage) pool = PIKACHU_MESSAGES_LANDING

    setPikachuBubble(pool[Math.floor(Math.random() * pool.length)])

    if (pikachuTimerRef.current) clearTimeout(pikachuTimerRef.current)
    pikachuTimerRef.current = setTimeout(() => {
      setPikachuBubble(null)
      setPikachuState('idle')
    }, 4000)
  }, [isLightboxOpen, isLandingPage])

  // Container styling configuration
  const getContainerStyle = (x: number, isPikachu = false): { className: string; style: React.CSSProperties } => {
    const screenWidth = typeof window !== 'undefined' ? window.innerWidth : 800
    const isMobile = screenWidth < 640
    const offset = isPikachu ? (isMobile ? 42 : 52) : 0
    const finalX = x + offset

    if (isLightboxOpen) {
      return {
        className: 'fixed bottom-[46px] md:bottom-[75px] left-1/2 z-[1000000] flex flex-col items-center select-none pointer-events-auto touch-manipulation',
        style: { transform: `translateX(calc(-50% + ${finalX}px))` },
      }
    }
    if (isLandingPage) {
      const cardEl = typeof document !== 'undefined' ? document.getElementById('landing-hero-card') : null
      const cardRect = cardEl ? cardEl.getBoundingClientRect() : null
      const topY = cardRect ? cardRect.top - (isMobile ? 32 : 36) : undefined

      return {
        className: 'fixed left-1/2 z-[99999] flex flex-col items-center select-none pointer-events-auto touch-manipulation',
        style: cardRect && topY !== undefined ? {
          top: `${topY}px`,
          transform: `translateX(calc(-50% + ${finalX}px))`,
        } : {
          top: '50%',
          transform: `translate(calc(-50% + ${finalX}px), -245px)`,
        },
      }
    }
    return {
      className: 'fixed bottom-0 z-[99999] flex flex-col items-center select-none pointer-events-auto touch-manipulation',
      style: { left: `${finalX}px` },
    }
  }

  // Dynamic Speech Bubble Clamping calculation for Kuro & Pikachu
  const getBubbleAlignment = (curX: number) => {
    const { isRelative } = getBounds()
    const screenWidth = typeof window !== 'undefined' ? window.innerWidth : 800

    if (isRelative) {
      if (curX < -45) {
        return {
          bubbleClass: 'absolute bottom-[100%] mb-6 sm:mb-7 left-0 translate-x-0 px-2.5 sm:px-3 py-1.5 rounded-2xl text-[11px] sm:text-xs font-semibold backdrop-blur-md border shadow-xl w-max max-w-[180px] sm:max-w-[250px] text-center animate-in fade-in zoom-in-95 duration-200 z-50 leading-tight sm:leading-snug break-words',
          arrowClass: 'absolute left-4 -bottom-1 w-2 h-2 border-r border-b rotate-45',
        }
      }
      if (curX > 45) {
        return {
          bubbleClass: 'absolute bottom-[100%] mb-6 sm:mb-7 right-0 left-auto translate-x-0 px-2.5 sm:px-3 py-1.5 rounded-2xl text-[11px] sm:text-xs font-semibold backdrop-blur-md border shadow-xl w-max max-w-[180px] sm:max-w-[250px] text-center animate-in fade-in zoom-in-95 duration-200 z-50 leading-tight sm:leading-snug break-words',
          arrowClass: 'absolute right-4 left-auto -bottom-1 w-2 h-2 border-r border-b rotate-45',
        }
      }
    } else {
      if (curX < 110) {
        return {
          bubbleClass: 'absolute bottom-[100%] mb-6 sm:mb-7 left-0 translate-x-0 px-2.5 sm:px-3 py-1.5 rounded-2xl text-[11px] sm:text-xs font-semibold backdrop-blur-md border shadow-xl w-max max-w-[180px] sm:max-w-[250px] text-center animate-in fade-in zoom-in-95 duration-200 z-50 leading-tight sm:leading-snug break-words',
          arrowClass: 'absolute left-4 -bottom-1 w-2 h-2 border-r border-b rotate-45',
        }
      }
      if (curX > screenWidth - 140) {
        return {
          bubbleClass: 'absolute bottom-[100%] mb-6 sm:mb-7 right-0 left-auto translate-x-0 px-2.5 sm:px-3 py-1.5 rounded-2xl text-[11px] sm:text-xs font-semibold backdrop-blur-md border shadow-xl w-max max-w-[180px] sm:max-w-[250px] text-center animate-in fade-in zoom-in-95 duration-200 z-50 leading-tight sm:leading-snug break-words',
          arrowClass: 'absolute right-4 left-auto -bottom-1 w-2 h-2 border-r border-b rotate-45',
        }
      }
    }

    return {
      bubbleClass: 'absolute bottom-[100%] mb-6 sm:mb-7 left-1/2 -translate-x-1/2 px-2.5 sm:px-3 py-1.5 rounded-2xl text-[11px] sm:text-xs font-semibold backdrop-blur-md border shadow-xl w-max max-w-[190px] sm:max-w-[280px] text-center animate-in fade-in zoom-in-95 duration-200 z-50 leading-tight sm:leading-snug break-words',
      arrowClass: 'absolute left-1/2 -bottom-1 -translate-x-1/2 w-2 h-2 border-r border-b rotate-45',
    }
  }

  const kuroStyle = getContainerStyle(kuroX, false)
  const pikachuStyle = getContainerStyle(kuroX, true)

  const isKuroMoving = kuroState.startsWith('walk') || kuroState.startsWith('run')
  const isPikachuMoving = pikachuState.startsWith('walk')

  const kuroBubbleAlign = getBubbleAlignment(kuroX)
  const pikachuBubbleAlign = getBubbleAlignment(kuroX + 45)

  // Helper for Kuro Pupil Position Coordinates
  const getKuroPupilX = (baseX: number) => {
    if (kuroGaze === 'left') return baseX - 1
    if (kuroGaze === 'right') return baseX + 1
    return baseX
  }

  const getKuroPupilY = (baseY: number) => {
    if (kuroGaze === 'up') return baseY - 1
    if (kuroGaze === 'down') return baseY + 1
    return baseY
  }

  // Helper for Pikachu Pupil Position Coordinates
  const getPikachuPupilX = (baseX: number) => {
    if (pikachuGaze === 'left') return baseX - 1
    if (pikachuGaze === 'right') return baseX + 1
    return baseX
  }

  const getPikachuPupilY = (baseY: number) => {
    if (pikachuGaze === 'up') return baseY - 1
    if (pikachuGaze === 'down') return baseY + 1
    return baseY
  }

  return (
    <>
      {/* ========================================== */}
      {/* KURO (INDONESIAN ALLEY CAT MASCOT)         */}
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
            className={kuroBubbleAlign.bubbleClass}
            style={{
              backgroundColor: kuroState === 'angry' ? 'rgba(220, 38, 38, 0.95)' : kuroState === 'annoyed' ? 'rgba(217, 119, 6, 0.95)' : 'rgba(10, 10, 10, 0.92)',
              color: '#ffffff',
              borderColor: kuroState === 'angry' ? 'rgba(248, 113, 113, 0.5)' : kuroState === 'annoyed' ? 'rgba(251, 191, 36, 0.5)' : 'rgba(255, 255, 255, 0.2)',
              forcedColorAdjust: 'none',
              colorScheme: 'normal',
            }}
          >
            <div
              className={kuroBubbleAlign.arrowClass}
              style={{
                backgroundColor: kuroState === 'angry' ? 'rgba(220, 38, 38, 0.95)' : kuroState === 'annoyed' ? 'rgba(217, 119, 6, 0.95)' : 'rgba(10, 10, 10, 0.92)',
                borderColor: kuroState === 'angry' ? 'rgba(248, 113, 113, 0.5)' : kuroState === 'annoyed' ? 'rgba(251, 191, 36, 0.5)' : 'rgba(255, 255, 255, 0.2)',
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
            kuroJumping || kuroState === 'jump' ? '-translate-y-3 scale-125' : 'hover:scale-110 active:scale-95'
          }`}
          style={{
            transform: `${kuroFacing === 'left' ? 'scaleX(-1)' : 'scaleX(1)'} translateY(${isKuroMoving && animFrame === 1 ? '-1px' : '0px'})`,
            transition: 'transform 0.15s ease',
            forcedColorAdjust: 'none',
            colorScheme: 'normal',
          }}
        >
          {/* VISUAL OVERLAYS & ANIMATION SYMBOLS */}
          {kuroState === 'happy' && (
            <div className="absolute -top-4 left-1/2 -translate-x-1/2 flex items-center gap-1 animate-bounce">
              <span className="text-xs">💖</span>
              <span className="text-xs">✨</span>
            </div>
          )}

          {kuroState === 'annoyed' && (
            <div className="absolute -top-3 right-0 animate-ping text-xs">
              💢
            </div>
          )}

          {kuroState === 'angry' && (
            <div className="absolute -top-4 left-1/2 -translate-x-1/2 flex items-center gap-1 animate-pulse">
              <span className="text-xs animate-bounce">💨</span>
              <span className="text-xs">💢</span>
            </div>
          )}

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

          {kuroState === 'yarn' && (
            <div className="absolute bottom-0 -right-4 animate-bounce">
              <svg width="12" height="12" viewBox="0 0 6 6" style={{ imageRendering: 'pixelated', forcedColorAdjust: 'none' }}>
                <circle cx="3" cy="3" r="2.5" fill="#ec4899" />
                <path d="M 1 2 L 5 4 M 2 5 L 4 1" stroke="#f472b6" strokeWidth="0.5" />
              </svg>
            </div>
          )}

          {kuroState === 'box' && (
            <div className="absolute -bottom-1 left-0 z-30 pointer-events-none">
              <svg width="40" height="24" viewBox="0 0 16 10" style={{ imageRendering: 'pixelated', forcedColorAdjust: 'none' }}>
                <rect x="1" y="2" width="14" height="8" rx="1" fill="#b45309" stroke="#78350f" strokeWidth="0.5" />
                <rect x="2" y="1" width="5" height="2" fill="#d97706" />
                <rect x="9" y="1" width="5" height="2" fill="#d97706" />
              </svg>
            </div>
          )}

          {/* SVG KURO (BLACK/DARK GREY TABBY ALLEY CAT WITH DYNAMIC GAZE TRACKING) */}
          <svg width="38" height="38" viewBox="0 0 16 16" className="drop-shadow-md" style={{ imageRendering: 'pixelated', forcedColorAdjust: 'none', colorScheme: 'normal' }}>
            {kuroState === 'angry' ? (
              /* ANGRY / FURIOUS CAT SPRITE */
              <g>
                <rect x="1" y="4" width="3" height="2" fill="#020617" />
                <rect x="12" y="4" width="3" height="2" fill="#020617" />
                <rect x="2" y="4" width="12" height="5" fill="#334155" />
                <rect x="6" y="4" width="4" height="2" fill="#0f172a" />
                <rect x="4" y="6" width="3" height="2" fill="#ef4444" />
                <rect x="5" y="6" width="1" height="2" fill="#020617" />
                <rect x="9" y="6" width="3" height="2" fill="#ef4444" />
                <rect x="10" y="6" width="1" height="2" fill="#020617" />
                <rect x="7" y="7" width="2" height="1" fill="#f43f5e" />
                <rect x="3" y="9" width="10" height="5" fill="#334155" />
                <rect x="4" y="14" width="2" height="2" fill="#1e293b" />
                <rect x="10" y="14" width="2" height="2" fill="#1e293b" />
                <rect x="13" y="2" width="2" height="9" rx="1" fill="#020617" />
              </g>
            ) : kuroState === 'annoyed' ? (
              /* ANNOYED CAT SPRITE */
              <g>
                <rect x="2" y="2" width="3" height="3" fill="#020617" />
                <rect x="3" y="3" width="1" height="1" fill="#f43f5e" />
                <rect x="11" y="2" width="3" height="3" fill="#020617" />
                <rect x="12" y="3" width="1" height="1" fill="#f43f5e" />
                <rect x="2" y="4" width="12" height="5" fill="#334155" />
                <rect x="6" y="4" width="4" height="2" fill="#0f172a" />
                <rect x="4" y="6" width="2" height="1" fill="#f59e0b" />
                <rect x="10" y="6" width="2" height="1" fill="#f59e0b" />
                <rect x="7" y="7" width="2" height="1" fill="#f43f5e" />
                <rect x="3" y="9" width="10" height="5" fill="#334155" />
                <rect x="4" y="14" width="2" height="2" fill="#1e293b" />
                <rect x="10" y="14" width="2" height="2" fill="#1e293b" />
                <rect x="13" y={animFrame === 0 ? "7" : "9"} width="3" height="4" rx="1" fill="#020617" />
              </g>
            ) : kuroState === 'happy' ? (
              /* JOYFUL HAPPY CAT SPRITE */
              <g>
                <rect x="2" y="1" width="3" height="3" fill="#020617" />
                <rect x="3" y="2" width="1" height="1" fill="#f43f5e" />
                <rect x="11" y="1" width="3" height="3" fill="#020617" />
                <rect x="12" y="2" width="1" height="1" fill="#f43f5e" />
                <rect x="2" y="3" width="12" height="6" fill="#334155" />
                <rect x="6" y="3" width="4" height="2" fill="#0f172a" />
                <rect x={getKuroPupilX(4)} y={getKuroPupilY(5)} width="2" height="2" fill={isBlinking ? "#020617" : "#10b981"} />
                <rect x={getKuroPupilX(10)} y={getKuroPupilY(5)} width="2" height="2" fill={isBlinking ? "#020617" : "#10b981"} />
                <rect x="7" y="6" width="2" height="1" fill="#f43f5e" />
                <rect x="7" y="7" width="2" height="1" fill="#020617" />
                <rect x="3" y="9" width="10" height="5" fill="#334155" />
                <rect x="4" y="14" width="2" height="2" fill="#1e293b" />
                <rect x="10" y="14" width="2" height="2" fill="#1e293b" />
                <rect x="13" y="6" width="2" height="7" fill="#020617" />
              </g>
            ) : kuroState === 'sleep' ? (
              /* SLEEPING ALLEY CAT */
              <g>
                <rect x="3" y="6" width="2" height="2" fill="#020617" />
                <rect x="4" y="7" width="1" height="1" fill="#f43f5e" />
                <rect x="11" y="6" width="2" height="2" fill="#020617" />
                <rect x="11" y="7" width="1" height="1" fill="#f43f5e" />
                <rect x="2" y="8" width="12" height="6" rx="2" fill="#334155" />
                <rect x="3" y="8" width="2" height="4" fill="#0f172a" />
                <rect x="7" y="8" width="2" height="4" fill="#0f172a" />
                <rect x="11" y="8" width="2" height="4" fill="#0f172a" />
                <rect x="4" y="11" width="8" height="3" fill="#475569" />
                <rect x="4" y="10" width="2" height="1" fill="#0f172a" />
                <rect x="10" y="10" width="2" height="1" fill="#0f172a" />
                <rect x="7" y="10" width="2" height="1" fill="#f43f5e" />
                <text x="12" y="5" fontSize="4" fill="#60a5fa" fontWeight="bold">z</text>
              </g>
            ) : kuroState === 'groom' ? (
              /* GROOMING PAW & FACE CAT */
              <g>
                <rect x="2" y="2" width="3" height="3" fill="#020617" />
                <rect x="3" y="3" width="1" height="1" fill="#f43f5e" />
                <rect x="11" y="2" width="3" height="3" fill="#020617" />
                <rect x="12" y="3" width="1" height="1" fill="#f43f5e" />
                <rect x="2" y="4" width="12" height="5" fill="#334155" />
                <rect x="6" y="4" width="4" height="2" fill="#0f172a" />
                <rect x={getKuroPupilX(4)} y={getKuroPupilY(6)} width="2" height="2" fill={isBlinking ? "#020617" : "#10b981"} />
                <rect x={getKuroPupilX(10)} y={getKuroPupilY(6)} width="2" height="2" fill={isBlinking ? "#020617" : "#10b981"} />
                <rect x="7" y="7" width="2" height="2" fill="#f43f5e" />
                <rect x={animFrame === 0 ? "5" : "7"} y="7" width="3" height="4" rx="1" fill="#475569" />
                <rect x="3" y="9" width="10" height="5" fill="#334155" />
                <rect x="4" y="14" width="2" height="2" fill="#1e293b" />
                <rect x="10" y="14" width="2" height="2" fill="#1e293b" />
                <rect x="13" y="8" width="2" height="5" rx="1" fill="#020617" />
              </g>
            ) : kuroState === 'stretch' ? (
              /* ARCHED BACK CAT STRETCH */
              <g>
                <rect x="1" y="4" width="3" height="3" fill="#020617" />
                <rect x="2" y="5" width="1" height="1" fill="#f43f5e" />
                <rect x="10" y="3" width="3" height="3" fill="#020617" />
                <rect x="1" y="6" width="12" height="5" fill="#334155" />
                <rect x="4" y="3" width="6" height="3" fill="#0f172a" />
                <rect x={getKuroPupilX(11)} y={getKuroPupilY(7)} width="2" height="2" fill={isBlinking ? "#020617" : "#10b981"} />
                <rect x="2" y="11" width="3" height="5" fill="#1e293b" />
                <rect x="11" y="11" width="3" height="5" fill="#1e293b" />
                <rect x="0" y="4" width="2" height="6" rx="1" fill="#020617" />
              </g>
            ) : isKuroMoving ? (
              /* QUADRUPED BLACK/DARK GREY TABBY WALKING/RUNNING */
              <g>
                <rect x="10" y="2" width="3" height="3" fill="#020617" />
                <rect x="11" y="3" width="1" height="1" fill="#f43f5e" />
                <rect x="9" y="4" width="6" height="5" fill="#334155" />
                <rect x="11" y="4" width="2" height="2" fill="#0f172a" />
                <rect x={getKuroPupilX(12)} y={getKuroPupilY(6)} width="2" height="2" fill={isBlinking ? "#020617" : "#10b981"} />
                <rect x={getKuroPupilX(13)} y={getKuroPupilY(6)} width="1" height="2" fill="#020617" />
                <rect x="14" y="7" width="2" height="1" fill="#f43f5e" />
                <rect x="2" y="7" width="9" height="5" fill="#334155" />
                <rect x="5" y="7" width="2" height="5" fill="#0f172a" />
                <rect x="4" y="8" width="6" height="4" fill="#475569" />
                <rect x={animFrame === 0 ? "3" : "5"} y="12" width="2" height="4" fill="#1e293b" />
                <rect x={animFrame === 0 ? "9" : "7"} y="12" width="2" height="4" fill="#1e293b" />
                <rect x="0" y={animFrame === 0 ? "5" : "6"} width="3" height="4" rx="1" fill="#020617" />
              </g>
            ) : (
              /* IDLE / SITTING CAT WITH DYNAMIC PUPIL GAZE */
              <g>
                <rect x="2" y="2" width="3" height="3" fill="#020617" />
                <rect x="3" y="3" width="1" height="1" fill="#f43f5e" />
                <rect x="11" y="2" width="3" height="3" fill="#020617" />
                <rect x="12" y="3" width="1" height="1" fill="#f43f5e" />
                <rect x="2" y="4" width="12" height="5" fill="#334155" />
                <rect x="6" y="4" width="4" height="2" fill="#0f172a" />
                {/* Left Eye Base & Pupil */}
                <rect x="4" y="6" width="2" height="2" fill={isBlinking ? "#020617" : "#10b981"} />
                {!isBlinking && <rect x={getKuroPupilX(4)} y={getKuroPupilY(6)} width="1" height="2" fill="#020617" />}
                {/* Right Eye Base & Pupil */}
                <rect x="10" y="6" width="2" height="2" fill={isBlinking ? "#020617" : "#10b981"} />
                {!isBlinking && <rect x={getKuroPupilX(10)} y={getKuroPupilY(6)} width="1" height="2" fill="#020617" />}
                <rect x="7" y="7" width="2" height="1" fill="#f43f5e" />
                <rect x="3" y="9" width="10" height="5" fill="#334155" />
                <rect x="4" y="9" width="2" height="5" fill="#0f172a" />
                <rect x="10" y="9" width="2" height="5" fill="#0f172a" />
                <rect x="6" y="9" width="4" height="5" fill="#475569" />
                <rect x="4" y="14" width="2" height="2" fill="#1e293b" />
                <rect x="10" y="14" width="2" height="2" fill="#1e293b" />
                <rect x="13" y="8" width="2" height="5" rx="1" fill="#020617" />
              </g>
            )}
          </svg>
        </button>
      </div>

      {/* ========================================== */}
      {/* PIKACHU (POKEMON ELECTRIC MASCOT)          */}
      {/* ========================================== */}
      <div
        className={pikachuStyle.className}
        style={{
          ...pikachuStyle.style,
          forcedColorAdjust: 'none',
          colorScheme: 'normal',
        }}
      >
        {pikachuBubble && (
          <div
            className={pikachuBubbleAlign.bubbleClass}
            style={{
              backgroundColor: 'rgba(234, 179, 8, 0.95)',
              color: '#0f172a',
              borderColor: 'rgba(250, 204, 21, 0.8)',
              forcedColorAdjust: 'none',
              colorScheme: 'normal',
            }}
          >
            <div
              className={pikachuBubbleAlign.arrowClass}
              style={{
                backgroundColor: 'rgba(234, 179, 8, 0.95)',
                borderColor: 'rgba(250, 204, 21, 0.8)',
                forcedColorAdjust: 'none',
              }}
            />
            {pikachuBubble}
          </div>
        )}

        <button
          type="button"
          onClick={handleClickPikachu}
          title="Click Pikachu!"
          className={`group relative cursor-pointer outline-none flex items-center justify-center transition-all ${
            pikachuJumping || pikachuState === 'jump' ? '-translate-y-3 scale-125' : 'hover:scale-110 active:scale-95'
          }`}
          style={{
            transform: `${pikachuFacing === 'left' ? 'scaleX(-1)' : 'scaleX(1)'} translateY(${isPikachuMoving && animFrame === 1 ? '-1px' : '0px'})`,
            transition: 'transform 0.15s ease',
            forcedColorAdjust: 'none',
            colorScheme: 'normal',
          }}
        >
          {/* PIKACHU ELECTRIC SPARK OVERLAY */}
          {pikachuState === 'spark' && (
            <div className="absolute -top-4 left-1/2 -translate-x-1/2 flex items-center gap-1 animate-bounce">
              <span className="text-xs">⚡</span>
              <span className="text-xs">✨</span>
            </div>
          )}

          {/* SVG PIKACHU PIXEL ART SPRITE WITH GAZE TRACKING */}
          <svg width="36" height="36" viewBox="0 0 16 16" className="drop-shadow-md" style={{ imageRendering: 'pixelated', forcedColorAdjust: 'none', colorScheme: 'normal' }}>
            <g>
              {/* Pointy Ear Left with Black Tip */}
              <rect x="2" y="0" width="2" height="2" fill="#0f172a" />
              <rect x="3" y="2" width="2" height="3" fill="#facc15" />
              {/* Pointy Ear Right with Black Tip */}
              <rect x="12" y="0" width="2" height="2" fill="#0f172a" />
              <rect x="11" y="2" width="2" height="3" fill="#facc15" />

              {/* Head Base */}
              <rect x="3" y="4" width="10" height="5" fill="#facc15" />
              
              {/* Dynamic Sparkle Eyes with Gaze Tracking */}
              <rect x={getPikachuPupilX(4)} y={getPikachuPupilY(5)} width="2" height="2" fill="#020617" />
              <rect x={getPikachuPupilX(4)} y={getPikachuPupilY(5)} width="1" height="1" fill="#ffffff" />
              <rect x={getPikachuPupilX(10)} y={getPikachuPupilY(5)} width="2" height="2" fill="#020617" />
              <rect x={getPikachuPupilX(10)} y={getPikachuPupilY(5)} width="1" height="1" fill="#ffffff" />

              {/* Nose & Cute Mouth */}
              <rect x="7" y="6" width="2" height="1" fill="#020617" />
              <rect x="7" y="7" width="2" height="1" fill="#ef4444" />

              {/* Iconic Red Electric Cheek Pouches */}
              <rect x="3" y="6" width="2" height="2" rx="1" fill="#ef4444" />
              <rect x="11" y="6" width="2" height="2" rx="1" fill="#ef4444" />

              {/* Pikachu Body */}
              <rect x="4" y="9" width="8" height="5" fill="#facc15" />

              {/* Brown Back Stripes */}
              <rect x="6" y="10" width="4" height="1" fill="#78350f" />
              <rect x="6" y="12" width="4" height="1" fill="#78350f" />

              {/* Paws */}
              <rect x={isPikachuMoving && animFrame === 0 ? "4" : "5"} y="14" width="2" height="2" fill="#eab308" />
              <rect x={isPikachuMoving && animFrame === 0 ? "10" : "9"} y="14" width="2" height="2" fill="#eab308" />

              {/* Lightning Bolt Tail */}
              <rect x="12" y="7" width="2" height="2" fill="#78350f" />
              <rect x="13" y="5" width="2" height="3" fill="#facc15" />
              <rect x="14" y="3" width="2" height="3" fill="#facc15" />
            </g>
          </svg>
        </button>
      </div>
    </>
  )
}

// Export alias for backward compatibility
export { PixelMascots as PixelCat }
