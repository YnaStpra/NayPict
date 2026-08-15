'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { usePathname } from 'next/navigation'
import { settingGet } from '@/request/setting'
import type { Setting } from '@/server/entity/setting'

// ==========================================
// VSCODE POKEMON PETS & CAT MESSAGES
// ==========================================
const KURO_MESSAGES = [
  "Meow! Hi, I'm Kuro, an Indonesian alley cat! 🐾",
  "Nom nom... Kuro just caught a yummy fish! 🐟",
  "Wheee! Kuro is chasing a cute butterfly! 🦋",
  "Mmm... Kuro loves sniffing fresh flowers ~ 🌸",
  "Purrr... Kuro is playing with a yarn ball! 🧶",
  "Meow! Patrolling NayPict with my Pokemon friends! ⚡🐾",
]

const PIKACHU_MESSAGES = [
  "Pika pika! Pikachu loves exploring NayPict! ⚡💛",
  "Pikachuuuu! Electric energy for your gallery! ⚡✨",
  "Pika pika! Kuro and Pikachu are best buddies! ⚡🐾",
  "Chaaaa! Pikachu is super excited today! ⚡🌟",
]

const CHARMANDER_MESSAGES = [
  "Char char! Charmander loves warm aesthetic photos! 🔥🧡",
  "Charmander's tail flame burns brightly for NayPict! 🔥✨",
  "Char char! Watch out for my fiery Ember attack! 🔥💥",
]

const BULBASAUR_MESSAGES = [
  "Saur saur! Bulbasaur is soaking up the sun! 🍃💚",
  "Bulbasaur's plant bulb is blooming beautifully! 🌸🍃",
  "Saur! Fresh green vibes for your photo collection! 🌿✨",
]

const SQUIRTLE_MESSAGES = [
  "Squirtle squirt! Water Squad reporting for duty! 💧🐢",
  "Squirtle loves splashing around in NayPict gallery! 🌊✨",
  "Squirtle! Hydro Pump energy activated! 💧💥",
]

const EEVEE_MESSAGES = [
  "Vee vee! Eevee is ready for infinite evolution! 🦊✨",
  "Eevee loves cuddling next to Kuro the cat! 💖🐾",
  "Vee! Eevee brings good fortune to your albums! ⭐✨",
]

const GENGAR_MESSAGES = [
  "Hehehe! Gengar is lurking in the dark mode shadows! 👻🔮",
  "Gengar loves dark aesthetic galleries! 🔮✨",
  "Boo! Gengar unleashes a spooky Shadow Ball! 👻💥",
]

const PIKACHU_ULTIMATE = [
  "PIKAAACHUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUU! 100,000 VOLT THUNDERBOLT! ⚡⚡⚡⚡⚡🔥",
]

type MascotKey = 'kuro' | 'pikachu' | 'charmander' | 'bulbasaur' | 'squirtle' | 'eevee' | 'gengar'
type FacingDirection = 'left' | 'right'

export function PixelMascots() {
  const pathname = usePathname()
  const isLandingPage = pathname === '/'
  const [isLightboxOpen, setIsLightboxOpen] = useState<boolean>(false)

  // Active Public Mascots (Admin Configured from SQLite DB via /api/setting/get)
  const [activeMascots, setActiveMascots] = useState<string[]>(['kuro', 'pikachu'])

  // Fetch admin settings on mount
  useEffect(() => {
    settingGet()
      .then((res: Setting) => {
        if (res && res.activeMascots && Array.isArray(res.activeMascots) && res.activeMascots.length > 0) {
          setActiveMascots(res.activeMascots)
        }
      })
      .catch(() => {
        // Fallback default
        setActiveMascots(['kuro', 'pikachu'])
      })
  }, [])

  // Mascot States & Positions
  const [mascotState, setMascotState] = useState<Record<string, string>>({
    kuro: 'idle',
    pikachu: 'idle',
    charmander: 'idle',
    bulbasaur: 'idle',
    squirtle: 'idle',
    eevee: 'idle',
    gengar: 'idle',
  })

  const [mascotX, setMascotX] = useState<Record<string, number>>({
    kuro: 0,
    pikachu: 60,
    charmander: 120,
    bulbasaur: 180,
    squirtle: 240,
    eevee: 300,
    gengar: 360,
  })

  const [mascotFacing, setMascotFacing] = useState<Record<string, FacingDirection>>({
    kuro: 'right',
    pikachu: 'right',
    charmander: 'right',
    bulbasaur: 'right',
    squirtle: 'right',
    eevee: 'right',
    gengar: 'right',
  })

  const [mascotBubbles, setMascotBubbles] = useState<Record<string, string | null>>({})
  const [isThunderboltActive, setIsThunderboltActive] = useState<boolean>(false)
  const [animFrame, setAnimFrame] = useState<number>(0)

  // Refs for smooth animation loops
  const mascotXRefs = useRef<Record<string, number>>({
    kuro: 0,
    pikachu: 60,
    charmander: 120,
    bulbasaur: 180,
    squirtle: 240,
    eevee: 300,
    gengar: 360,
  })

  const mascotTargetRefs = useRef<Record<string, number>>({
    kuro: 0,
    pikachu: 60,
    charmander: 120,
    bulbasaur: 180,
    squirtle: 240,
    eevee: 300,
    gengar: 360,
  })

  const clickCountsRef = useRef<Record<string, number>>({})
  const lastClickTimesRef = useRef<Record<string, number>>({})

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

  // Calculate territory bounds
  const getBounds = useCallback(() => {
    const screenWidth = typeof window !== 'undefined' ? window.innerWidth : 800
    const isMobile = screenWidth < 640

    if (isLightboxOpen) {
      return { minX: isMobile ? -100 : -140, maxX: isMobile ? 100 : 140, isRelative: true }
    }
    if (isLandingPage) {
      return { minX: isMobile ? -90 : -130, maxX: isMobile ? 90 : 130, isRelative: true }
    }
    const minX = isMobile ? 30 : 60
    const maxX = Math.max(minX + 60, screenWidth - (isMobile ? 50 : 100))
    return { minX, maxX, isRelative: false }
  }, [isLightboxOpen, isLandingPage])

  // Distribute spawn locations for active mascots
  useEffect(() => {
    const { minX, maxX, isRelative } = getBounds()
    const screenWidth = typeof window !== 'undefined' ? window.innerWidth : 800
    const keys: MascotKey[] = ['kuro', 'pikachu', 'charmander', 'bulbasaur', 'squirtle', 'eevee', 'gengar']

    const newX: Record<string, number> = {}

    keys.forEach((key, idx) => {
      if (isRelative) {
        const offset = (idx - Math.floor(keys.length / 2)) * 36
        newX[key] = offset
      } else {
        const spacing = (maxX - minX) / (activeMascots.length + 1)
        const activeIdx = activeMascots.indexOf(key)
        const pos = activeIdx >= 0 ? minX + spacing * (activeIdx + 1) : minX + idx * 40
        newX[key] = Math.min(Math.max(minX, pos), maxX - 40)
      }
      mascotXRefs.current[key] = newX[key]
      mascotTargetRefs.current[key] = newX[key]
    })

    setMascotX(newX)
  }, [isLightboxOpen, isLandingPage, activeMascots, getBounds])

  // Frame switcher
  useEffect(() => {
    const interval = setInterval(() => {
      setAnimFrame((prev) => (prev === 0 ? 1 : 0))
    }, 150)
    return () => clearInterval(interval)
  }, [])

  // Smooth Movement Loop for Active Mascots (60 FPS)
  useEffect(() => {
    let animId: number

    const moveLoop = () => {
      activeMascots.forEach((key) => {
        const state = mascotState[key] || 'idle'
        if (state.startsWith('walk')) {
          const diff = mascotTargetRefs.current[key] - mascotXRefs.current[key]
          const speed = 1.2

          if (Math.abs(diff) <= speed) {
            mascotXRefs.current[key] = mascotTargetRefs.current[key]
            setMascotX((prev) => ({ ...prev, [key]: mascotTargetRefs.current[key] }))
            setMascotState((prev) => ({ ...prev, [key]: 'idle' }))
          } else {
            mascotXRefs.current[key] += diff > 0 ? speed : -speed
            setMascotX((prev) => ({ ...prev, [key]: mascotXRefs.current[key] }))
            setMascotFacing((prev) => ({ ...prev, [key]: diff > 0 ? 'right' : 'left' }))
          }
        }
      })

      animId = requestAnimationFrame(moveLoop)
    }

    animId = requestAnimationFrame(moveLoop)
    return () => cancelAnimationFrame(animId)
  }, [activeMascots, mascotState])

  // Autonomous Decision Engine
  useEffect(() => {
    const decisionInterval = setInterval(() => {
      const { minX, maxX } = getBounds()

      activeMascots.forEach((key) => {
        if (!mascotBubbles[key] && !mascotState[key]?.startsWith('walk')) {
          if (Math.random() < 0.4) {
            const newTarget = Math.floor(Math.random() * (maxX - minX)) + minX
            mascotTargetRefs.current[key] = newTarget
            setMascotState((prev) => ({
              ...prev,
              [key]: newTarget < mascotXRefs.current[key] ? 'walk-left' : 'walk-right',
            }))
          }
        }
      })
    }, 3800)

    return () => clearInterval(decisionInterval)
  }, [activeMascots, mascotBubbles, mascotState, getBounds])

  // Click Mascot Handler
  const handleClickMascot = useCallback((key: MascotKey) => {
    const now = Date.now()
    const last = lastClickTimesRef.current[key] || 0
    const count = (now - last < 2000 ? (clickCountsRef.current[key] || 0) + 1 : 1)

    clickCountsRef.current[key] = count
    lastClickTimesRef.current[key] = now

    setMascotState((prev) => ({ ...prev, [key]: 'jump' }))
    setTimeout(() => setMascotState((prev) => ({ ...prev, [key]: 'idle' })), 350)

    let pool = KURO_MESSAGES
    if (key === 'pikachu') pool = PIKACHU_MESSAGES
    else if (key === 'charmander') pool = CHARMANDER_MESSAGES
    else if (key === 'bulbasaur') pool = BULBASAUR_MESSAGES
    else if (key === 'squirtle') pool = SQUIRTLE_MESSAGES
    else if (key === 'eevee') pool = EEVEE_MESSAGES
    else if (key === 'gengar') pool = GENGAR_MESSAGES

    if (key === 'pikachu' && count >= 7) {
      setIsThunderboltActive(true)
      const ultMsg = PIKACHU_ULTIMATE[0]
      setMascotBubbles((prev) => ({ ...prev, pikachu: ultMsg }))
      setTimeout(() => setIsThunderboltActive(false), 2000)
    } else {
      const msg = pool[Math.floor(Math.random() * pool.length)]
      setMascotBubbles((prev) => ({ ...prev, [key]: msg }))
    }

    setTimeout(() => {
      setMascotBubbles((prev) => ({ ...prev, [key]: null }))
    }, 4000)
  }, [])

  // Container styling configuration
  const getContainerStyle = (x: number): { className: string; style: React.CSSProperties } => {
    const screenWidth = typeof window !== 'undefined' ? window.innerWidth : 800
    const isMobile = screenWidth < 640

    if (isLightboxOpen) {
      return {
        className: 'fixed bottom-[46px] md:bottom-[75px] left-1/2 z-[1000000] flex flex-col items-center select-none pointer-events-auto touch-manipulation',
        style: { transform: `translateX(calc(-50% + ${x}px))` },
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
          transform: `translateX(calc(-50% + ${x}px))`,
        } : {
          top: '50%',
          transform: `translate(calc(-50% + ${x}px), -245px)`,
        },
      }
    }
    return {
      className: 'fixed bottom-0 z-[99999] flex flex-col items-center select-none pointer-events-auto touch-manipulation',
      style: { left: `${x}px` },
    }
  }

  // Dynamic Speech Bubble Clamping
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

  // Render SVG Mascot Icon helper
  const renderMascotSvg = (key: MascotKey) => {
    switch (key) {
      case 'kuro':
        return (
          <svg width="38" height="38" viewBox="0 0 16 16" className="drop-shadow-md" style={{ imageRendering: 'pixelated' }}>
            <g>
              <rect x="2" y="2" width="3" height="3" fill="#020617" />
              <rect x="3" y="3" width="1" height="1" fill="#f43f5e" />
              <rect x="11" y="2" width="3" height="3" fill="#020617" />
              <rect x="12" y="3" width="1" height="1" fill="#f43f5e" />
              <rect x="2" y="4" width="12" height="5" fill="#334155" />
              <rect x="6" y="4" width="4" height="2" fill="#0f172a" />
              <rect x="4" y="6" width="2" height="2" fill="#10b981" />
              <rect x="4" y="6" width="1" height="2" fill="#020617" />
              <rect x="10" y="6" width="2" height="2" fill="#10b981" />
              <rect x="10" y="6" width="1" height="2" fill="#020617" />
              <rect x="7" y="7" width="2" height="1" fill="#f43f5e" />
              <rect x="3" y="9" width="10" height="5" fill="#334155" />
              <rect x="4" y="9" width="2" height="5" fill="#0f172a" />
              <rect x="10" y="9" width="2" height="5" fill="#0f172a" />
              <rect x="6" y="9" width="4" height="5" fill="#475569" />
              <rect x="4" y="14" width="2" height="2" fill="#1e293b" />
              <rect x="10" y="14" width="2" height="2" fill="#1e293b" />
              <rect x="13" y="8" width="2" height="5" rx="1" fill="#020617" />
            </g>
          </svg>
        )
      case 'pikachu':
        return (
          <svg width="36" height="36" viewBox="0 0 16 16" className="drop-shadow-md" style={{ imageRendering: 'pixelated' }}>
            <g>
              <rect x="2" y={animFrame === 1 ? "1" : "0"} width="2" height="2" fill="#0f172a" />
              <rect x="3" y={animFrame === 1 ? "3" : "2"} width="2" height="3" fill="#facc15" />
              <rect x="12" y={animFrame === 0 ? "1" : "0"} width="2" height="2" fill="#0f172a" />
              <rect x="11" y={animFrame === 0 ? "3" : "2"} width="2" height="3" fill="#facc15" />
              <rect x="3" y="4" width="10" height="5" fill="#facc15" />
              <rect x="4" y="5" width="2" height="2" fill="#020617" />
              <rect x="4" y="5" width="1" height="1" fill="#ffffff" />
              <rect x="10" y="5" width="2" height="2" fill="#020617" />
              <rect x="10" y="5" width="1" height="1" fill="#ffffff" />
              <rect x="7" y="6" width="2" height="1" fill="#020617" />
              <rect x="7" y="7" width="2" height="1" fill="#ef4444" />
              <rect x="3" y="6" width="2" height="2" rx="1" fill="#ef4444" />
              <rect x="11" y="6" width="2" height="2" rx="1" fill="#ef4444" />
              <rect x="4" y="9" width="8" height="5" fill="#facc15" />
              <rect x="6" y="10" width="4" height="1" fill="#78350f" />
              <rect x="6" y="12" width="4" height="1" fill="#78350f" />
              <rect x={animFrame === 0 ? "3" : "5"} y="14" width="2" height="2" fill="#eab308" />
              <rect x={animFrame === 0 ? "11" : "9"} y="14" width="2" height="2" fill="#eab308" />
              <rect x="12" y="7" width="2" height="2" fill="#78350f" />
              <rect x="13" y={animFrame === 1 ? "4" : "5"} width="2" height="3" fill="#facc15" />
              <rect x="14" y={animFrame === 1 ? "2" : "3"} width="2" height="3" fill="#facc15" />
            </g>
          </svg>
        )
      case 'charmander':
        return (
          <svg width="36" height="36" viewBox="0 0 16 16" className="drop-shadow-md" style={{ imageRendering: 'pixelated' }}>
            <g>
              <rect x="4" y="3" width="8" height="6" rx="2" fill="#ea580c" />
              <rect x="5" y="5" width="2" height="2" fill="#020617" />
              <rect x="5" y="5" width="1" height="1" fill="#60a5fa" />
              <rect x="9" y="5" width="2" height="2" fill="#020617" />
              <rect x="9" y="5" width="1" height="1" fill="#60a5fa" />
              <rect x="7" y="7" width="2" height="1" fill="#451a03" />
              <rect x="5" y="9" width="6" height="5" fill="#ea580c" />
              <rect x="6" y="9" width="4" height="4" fill="#fef08a" />
              <rect x="4" y="14" width="2" height="2" fill="#c2410c" />
              <rect x="10" y="14" width="2" height="2" fill="#c2410c" />
              <rect x="11" y="10" width="3" height="3" rx="1" fill="#ea580c" />
              {/* Flaming Tail */}
              <circle cx="14" cy="9" r="2" fill="#ef4444" />
              <circle cx="14" cy="9" r="1" fill="#facc15" />
            </g>
          </svg>
        )
      case 'bulbasaur':
        return (
          <svg width="36" height="36" viewBox="0 0 16 16" className="drop-shadow-md" style={{ imageRendering: 'pixelated' }}>
            <g>
              {/* Plant Bulb on Back */}
              <path d="M 6 2 L 10 2 L 11 5 L 5 5 Z" fill="#15803d" />
              <rect x="7" y="3" width="2" height="2" fill="#22c55e" />
              <rect x="3" y="5" width="10" height="5" rx="1" fill="#0d9488" />
              <rect x="5" y="6" width="2" height="2" fill="#ef4444" />
              <rect x="9" y="6" width="2" height="2" fill="#ef4444" />
              <rect x="4" y="10" width="8" height="4" fill="#0d9488" />
              <rect x="5" y="10" width="2" height="2" fill="#115e59" />
              <rect x="9" y="10" width="2" height="2" fill="#115e59" />
              <rect x="3" y="14" width="2" height="2" fill="#0f766e" />
              <rect x="11" y="14" width="2" height="2" fill="#0f766e" />
            </g>
          </svg>
        )
      case 'squirtle':
        return (
          <svg width="36" height="36" viewBox="0 0 16 16" className="drop-shadow-md" style={{ imageRendering: 'pixelated' }}>
            <g>
              <rect x="4" y="3" width="8" height="6" rx="2" fill="#38bdf8" />
              <rect x="5" y="5" width="2" height="2" fill="#78350f" />
              <rect x="9" y="5" width="2" height="2" fill="#78350f" />
              <rect x="7" y="7" width="2" height="1" fill="#020617" />
              {/* Turtle Shell Body */}
              <rect x="4" y="9" width="8" height="5" rx="1" fill="#b45309" stroke="#78350f" strokeWidth="0.5" />
              <rect x="6" y="9" width="4" height="4" fill="#fef08a" />
              <rect x="4" y="14" width="2" height="2" fill="#0284c7" />
              <rect x="10" y="14" width="2" height="2" fill="#0284c7" />
              {/* Curly Tail */}
              <rect x="12" y="10" width="3" height="3" rx="1" fill="#38bdf8" />
            </g>
          </svg>
        )
      case 'eevee':
        return (
          <svg width="36" height="36" viewBox="0 0 16 16" className="drop-shadow-md" style={{ imageRendering: 'pixelated' }}>
            <g>
              {/* Ears */}
              <polygon points="3,1 5,1 4,5" fill="#78350f" />
              <polygon points="11,1 13,1 12,5" fill="#78350f" />
              <rect x="4" y="4" width="8" height="5" rx="1" fill="#b45309" />
              <rect x="5" y="5" width="2" height="2" fill="#451a03" />
              <rect x="9" y="5" width="2" height="2" fill="#451a03" />
              <rect x="7" y="7" width="2" height="1" fill="#020617" />
              {/* Fluffy White Collar */}
              <rect x="4" y="9" width="8" height="2" rx="1" fill="#fef08a" />
              <rect x="5" y="11" width="6" height="3" fill="#b45309" />
              <rect x="4" y="14" width="2" height="2" fill="#78350f" />
              <rect x="10" y="14" width="2" height="2" fill="#78350f" />
              {/* Bushy Tail */}
              <rect x="12" y="8" width="3" height="5" rx="1" fill="#fef08a" />
            </g>
          </svg>
        )
      case 'gengar':
        return (
          <svg width="36" height="36" viewBox="0 0 16 16" className="drop-shadow-md" style={{ imageRendering: 'pixelated' }}>
            <g>
              {/* Spikes & Body */}
              <polygon points="2,2 4,4 2,6" fill="#7e22ce" />
              <polygon points="14,2 12,4 14,6" fill="#7e22ce" />
              <rect x="3" y="4" width="10" height="10" rx="3" fill="#6b21a8" />
              {/* Glowing Red Eyes */}
              <rect x="4" y="6" width="3" height="2" fill="#ef4444" />
              <rect x="9" y="6" width="3" height="2" fill="#ef4444" />
              {/* Tooth Grin */}
              <rect x="5" y="9" width="6" height="2" fill="#ffffff" />
              <rect x="6" y="9" width="1" height="2" fill="#020617" />
              <rect x="8" y="9" width="1" height="2" fill="#020617" />
              <rect x="4" y="14" width="2" height="2" fill="#581c87" />
              <rect x="10" y="14" width="2" height="2" fill="#581c87" />
            </g>
          </svg>
        )
      default:
        return null
    }
  }

  return (
    <>
      {/* ========================================== */}
      {/* SCREEN-WIDE 100,000 VOLT THUNDERBOLT FLASH */}
      {/* ========================================== */}
      {isThunderboltActive && (
        <div className="fixed inset-0 z-[1000001] pointer-events-none flex items-center justify-center overflow-hidden bg-yellow-400/25 backdrop-blur-[1px] animate-pulse">
          <svg className="w-full h-full opacity-90 animate-bounce" viewBox="0 0 100 100" preserveAspectRatio="none">
            <polygon points="45,0 55,0 40,40 60,40 30,100 45,50 35,50" fill="#fef08a" filter="drop-shadow(0 0 12px #facc15)" />
            <polygon points="15,0 25,0 10,40 30,40 0,100 15,50 5,50" fill="#ffffff" filter="drop-shadow(0 0 10px #facc15)" />
            <polygon points="75,0 85,0 70,40 90,40 60,100 75,50 65,50" fill="#fef08a" filter="drop-shadow(0 0 12px #facc15)" />
          </svg>
        </div>
      )}

      {/* ========================================== */}
      {/* PUBLIC GALLERY MASCOTS (ADMIN MANAGED)     */}
      {/* ========================================== */}
      {activeMascots.map((keyStr) => {
        const key = keyStr as MascotKey
        const posX = mascotX[key] ?? 0
        const styleObj = getContainerStyle(posX)
        const facing = mascotFacing[key] ?? 'right'
        const bubble = mascotBubbles[key]
        const align = getBubbleAlignment(posX)
        const isMoving = mascotState[key]?.startsWith('walk')

        return (
          <div
            key={key}
            className={styleObj.className}
            style={{
              ...styleObj.style,
              forcedColorAdjust: 'none',
              colorScheme: 'normal',
            }}
          >
            {bubble && (
              <div
                className={align.bubbleClass}
                style={{
                  backgroundColor: key === 'pikachu' ? 'rgba(234, 179, 8, 0.95)' : key === 'charmander' ? 'rgba(234, 88, 12, 0.95)' : key === 'gengar' ? 'rgba(126, 34, 206, 0.95)' : 'rgba(10, 10, 10, 0.92)',
                  color: key === 'pikachu' ? '#0f172a' : '#ffffff',
                  borderColor: 'rgba(255, 255, 255, 0.25)',
                  forcedColorAdjust: 'none',
                  colorScheme: 'normal',
                }}
              >
                <div
                  className={align.arrowClass}
                  style={{
                    backgroundColor: key === 'pikachu' ? 'rgba(234, 179, 8, 0.95)' : key === 'charmander' ? 'rgba(234, 88, 12, 0.95)' : key === 'gengar' ? 'rgba(126, 34, 206, 0.95)' : 'rgba(10, 10, 10, 0.92)',
                    borderColor: 'rgba(255, 255, 255, 0.25)',
                    forcedColorAdjust: 'none',
                  }}
                />
                {bubble}
              </div>
            )}

            <button
              type="button"
              onClick={() => handleClickMascot(key)}
              title={`Click ${key}!`}
              className={`group relative cursor-pointer outline-none flex items-center justify-center transition-all ${
                mascotState[key] === 'jump' ? '-translate-y-3 scale-125' : 'hover:scale-110 active:scale-95'
              }`}
              style={{
                transform: `${facing === 'left' ? 'scaleX(-1)' : 'scaleX(1)'} translateY(${isMoving && animFrame === 1 ? '-1px' : '0px'})`,
                transition: 'transform 0.15s ease',
                forcedColorAdjust: 'none',
                colorScheme: 'normal',
              }}
            >
              {renderMascotSvg(key)}
            </button>
          </div>
        )
      })}
    </>
  )
}

// Export alias for backward compatibility
export { PixelMascots as PixelCat }
