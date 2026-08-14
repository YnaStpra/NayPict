'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'

// Kuro's easter egg speech bubble messages
const KURO_MESSAGES = [
  "Meow! Hi, I'm Kuro the black-grey tabby cat! 🐾",
  "Nom nom... Kuro just caught a yummy fish! 🐟",
  "Wheee! Kuro is chasing a cute butterfly! 🦋",
  "Mmm... Kuro loves sniffing fresh flowers ~ 🌸",
  "Boing! Kuro loves patrolling the top navbar! 📸",
  "Purrr... NayPict gallery is Kuro's favorite spot! 💖",
  "Meow! Kuro is taking a cozy cat nap on the header 💤",
  "Purrrr... Click Kuro anytime for random fun! ✨",
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

export function PixelCat() {
  const [catState, setCatState] = useState<CatState>('idle')
  const [posX, setPosX] = useState<number>(180)
  const [bubbleText, setBubbleText] = useState<string | null>(null)
  const [isJumping, setIsJumping] = useState<boolean>(false)
  const [animFrame, setAnimFrame] = useState<number>(0)
  const bubbleTimerRef = useRef<NodeJS.Timeout | null>(null)

  // Initialize position safely on client side
  useEffect(() => {
    const screenWidth = typeof window !== 'undefined' ? window.innerWidth : 800
    const startX = Math.min(Math.max(140, screenWidth * 0.35), screenWidth - 220)
    setPosX(startX)
  }, [])

  // Animation frame toggle (for walking/running/chasing)
  useEffect(() => {
    const interval = setInterval(() => {
      setAnimFrame((prev) => (prev === 0 ? 1 : 0))
    }, catState.startsWith('run') ? 120 : 220)
    return () => clearInterval(interval)
  }, [catState])

  // Autonomous Random AI Activity Loop
  useEffect(() => {
    const actionInterval = setInterval(() => {
      setCatState((currentState) => {
        // Don't override click speech bubble state
        if (bubbleText && (currentState === 'happy' || currentState === 'fish' || currentState === 'flower')) {
          return currentState
        }

        const screenWidth = typeof window !== 'undefined' ? window.innerWidth : 800
        const minX = 140
        const maxX = Math.max(minX + 100, screenWidth - 240)

        const rand = Math.random()

        if (rand < 0.18) {
          // Walk Left
          setPosX((prev) => Math.max(minX, prev - Math.floor(Math.random() * 60 + 40)))
          return 'walk-left'
        } else if (rand < 0.36) {
          // Walk Right
          setPosX((prev) => Math.min(maxX, prev + Math.floor(Math.random() * 60 + 40)))
          return 'walk-right'
        } else if (rand < 0.48) {
          // Run fast
          const runLeft = Math.random() > 0.5
          if (runLeft) {
            setPosX((prev) => Math.max(minX, prev - Math.floor(Math.random() * 120 + 80)))
            return 'run-left'
          } else {
            setPosX((prev) => Math.min(maxX, prev + Math.floor(Math.random() * 120 + 80)))
            return 'run-right'
          }
        } else if (rand < 0.62) {
          // Chase butterfly
          return 'butterfly'
        } else if (rand < 0.74) {
          // Sniff flower
          return 'flower'
        } else if (rand < 0.86) {
          // Eat fish
          return 'fish'
        } else if (rand < 0.94) {
          // Jump
          setIsJumping(true)
          setTimeout(() => setIsJumping(false), 400)
          return 'jump'
        } else {
          // Sleep
          return 'sleep'
        }
      })
    }, 5500)

    return () => clearInterval(actionInterval)
  }, [bubbleText])

  // Click Handler - Kuro Easter Egg Speech Bubble
  const handleClickKuro = useCallback(() => {
    setIsJumping(true)
    setTimeout(() => setIsJumping(false), 350)

    // Select random activity state
    const states: CatState[] = ['happy', 'fish', 'flower', 'butterfly', 'jump']
    const pickedState = states[Math.floor(Math.random() * states.length)]
    setCatState(pickedState)

    // Select random message
    const randomMsg = KURO_MESSAGES[Math.floor(Math.random() * KURO_MESSAGES.length)]
    setBubbleText(randomMsg)

    if (bubbleTimerRef.current) clearTimeout(bubbleTimerRef.current)

    bubbleTimerRef.current = setTimeout(() => {
      setBubbleText(null)
      setCatState('idle')
    }, 4500)
  }, [])

  return (
    <div
      className="fixed top-1 z-[99999] flex flex-col items-center select-none pointer-events-auto transition-all duration-300"
      style={{
        left: `${posX}px`,
        transition: catState.startsWith('run')
          ? 'left 0.9s cubic-bezier(0.25, 1, 0.5, 1)'
          : catState.startsWith('walk')
          ? 'left 1.6s ease-in-out'
          : 'left 0.4s ease',
      }}
    >
      {/* Easter Egg Speech Bubble */}
      {bubbleText && (
        <div className="absolute top-11 px-3 py-1.5 rounded-2xl bg-black/90 text-white text-xs font-semibold backdrop-blur-md border border-white/20 shadow-xl max-w-[220px] text-center animate-in fade-in zoom-in-95 duration-200 whitespace-nowrap z-50">
          {/* Top Arrow indicator */}
          <div className="absolute left-1/2 -top-1 -translate-x-1/2 w-2 h-2 bg-black/90 border-l border-t border-white/20 rotate-45" />
          {bubbleText}
        </div>
      )}

      {/* Interactive Pixel Art Cat Body & Items */}
      <button
        type="button"
        onClick={handleClickKuro}
        title="Click Kuro the Black/Grey Tabby Cat!"
        className={`group relative cursor-pointer outline-none transition-transform flex items-center justify-center ${
          isJumping || catState === 'jump' ? '-translate-y-2 scale-110' : 'hover:scale-110 active:scale-95'
        }`}
      >
        {/* ITEM OVERLAYS (Butterfly, Flower, Fish, Zzz) */}
        {catState === 'butterfly' && (
          <div className="absolute -top-3 left-6 animate-bounce">
            {/* SVG Butterfly */}
            <svg width="14" height="14" viewBox="0 0 8 8" style={{ imageRendering: 'pixelated' }}>
              <rect x="3" y="2" width="2" height="4" fill="#0f172a" />
              <rect x={animFrame === 0 ? "1" : "0"} y="1" width="2" height="3" fill="#f43f5e" />
              <rect x={animFrame === 0 ? "5" : "6"} y="1" width="2" height="3" fill="#06b6d4" />
            </svg>
          </div>
        )}

        {catState === 'flower' && (
          <div className="absolute bottom-0 -left-4 animate-pulse">
            {/* SVG Flower */}
            <svg width="14" height="14" viewBox="0 0 8 8" style={{ imageRendering: 'pixelated' }}>
              <rect x="3" y="4" width="2" height="4" fill="#22c55e" />
              <rect x="2" y="2" width="4" height="3" fill="#f43f5e" />
              <rect x="3" y="3" width="2" height="1" fill="#fef08a" />
            </svg>
          </div>
        )}

        {catState === 'fish' && (
          <div className="absolute bottom-1 -right-4 animate-pulse">
            {/* SVG Fish */}
            <svg width="14" height="12" viewBox="0 0 8 6" style={{ imageRendering: 'pixelated' }}>
              <rect x="1" y="1" width="5" height="4" rx="1" fill="#3b82f6" />
              <rect x="6" y="0" width="2" height="6" fill="#60a5fa" />
              <rect x="2" y="2" width="1" height="1" fill="#0f172a" />
            </svg>
          </div>
        )}

        {/* SVG Kuro - Dark Grey & Black Tabby Pixel Art Cat */}
        <svg
          width="40"
          height="40"
          viewBox="0 0 16 16"
          className="drop-shadow-md"
          style={{ imageRendering: 'pixelated' }}
        >
          {catState === 'sleep' ? (
            /* SLEEPING BLACK/GREY TABBY */
            <g>
              {/* Ears */}
              <rect x="3" y="6" width="2" height="2" fill="#0f172a" />
              <rect x="4" y="7" width="1" height="1" fill="#f43f5e" />
              <rect x="11" y="6" width="2" height="2" fill="#0f172a" />
              <rect x="11" y="7" width="1" height="1" fill="#f43f5e" />
              {/* Dark Charcoal & Grey Body */}
              <rect x="2" y="8" width="12" height="6" rx="2" fill="#475569" />
              {/* Black Tabby Stripes */}
              <rect x="3" y="8" width="2" height="4" fill="#0f172a" />
              <rect x="7" y="8" width="2" height="4" fill="#0f172a" />
              <rect x="11" y="8" width="2" height="4" fill="#0f172a" />
              {/* White belly & paws */}
              <rect x="4" y="11" width="8" height="3" fill="#f8fafc" />
              {/* Closed Eyes */}
              <rect x="4" y="10" width="2" height="1" fill="#0f172a" />
              <rect x="10" y="10" width="2" height="1" fill="#0f172a" />
              {/* Nose */}
              <rect x="7" y="10" width="2" height="1" fill="#f43f5e" />
              {/* Floating Zzz */}
              <text x="12" y="5" fontSize="4" fill="#60a5fa" fontWeight="bold">z</text>
            </g>
          ) : catState === 'butterfly' || catState === 'happy' ? (
            /* HAPPY / BUTTERFLY POSE */
            <g>
              {/* Ears */}
              <rect x="2" y="1" width="3" height="3" fill="#0f172a" />
              <rect x="3" y="2" width="1" height="1" fill="#f43f5e" />
              <rect x="11" y="1" width="3" height="3" fill="#0f172a" />
              <rect x="12" y="2" width="1" height="1" fill="#f43f5e" />
              {/* Head */}
              <rect x="2" y="3" width="12" height="6" fill="#475569" />
              {/* Black Tabby stripes */}
              <rect x="6" y="3" width="4" height="2" fill="#0f172a" />
              {/* Happy eyes ^ ^ */}
              <rect x="4" y="5" width="2" height="1" fill="#0f172a" />
              <rect x="10" y="5" width="2" height="1" fill="#0f172a" />
              {/* Nose & Mouth */}
              <rect x="7" y="6" width="2" height="1" fill="#f43f5e" />
              <rect x="7" y="7" width="2" height="1" fill="#0f172a" />
              {/* Body */}
              <rect x="3" y="9" width="10" height="5" fill="#475569" />
              <rect x="5" y="9" width="6" height="5" fill="#f8fafc" />
              {/* Paws reaching up */}
              <rect x="3" y="13" width="3" height="3" fill="#f8fafc" />
              <rect x="10" y="13" width="3" height="3" fill="#f8fafc" />
              {/* Tail up */}
              <rect x="13" y="5" width="2" height="7" fill="#0f172a" />
            </g>
          ) : catState === 'walk-left' || catState === 'run-left' ? (
            /* WALKING / RUNNING LEFT */
            <g>
              {/* Ears */}
              <rect x="1" y="2" width="3" height="3" fill="#0f172a" />
              <rect x="2" y="3" width="1" height="1" fill="#f43f5e" />
              <rect x="9" y="2" width="3" height="3" fill="#0f172a" />
              <rect x="10" y="3" width="1" height="1" fill="#f43f5e" />
              {/* Head */}
              <rect x="1" y="4" width="11" height="5" fill="#475569" />
              <rect x="4" y="4" width="2" height="2" fill="#0f172a" />
              {/* Emerald Eye looking left */}
              <rect x="3" y="6" width="2" height="2" fill="#10b981" />
              <rect x="3" y="6" width="1" height="2" fill="#0f172a" />
              <rect x="8" y="6" width="2" height="2" fill="#10b981" />
              <rect x="8" y="6" width="1" height="2" fill="#0f172a" />
              {/* Nose */}
              <rect x="1" y="7" width="2" height="1" fill="#f43f5e" />
              {/* Body */}
              <rect x="4" y="8" width="10" height="5" fill="#475569" />
              <rect x="6" y="8" width="2" height="5" fill="#0f172a" />
              <rect x="5" y="9" width="6" height="4" fill="#f8fafc" />
              {/* Paws */}
              <rect x={animFrame === 0 ? "3" : "6"} y="13" width="2" height="3" fill="#f8fafc" />
              <rect x={animFrame === 0 ? "11" : "8"} y="13" width="2" height="3" fill="#f8fafc" />
              {/* Tail */}
              <rect x="13" y="6" width="2" height="5" fill="#0f172a" />
            </g>
          ) : catState === 'walk-right' || catState === 'run-right' ? (
            /* WALKING / RUNNING RIGHT */
            <g>
              {/* Ears */}
              <rect x="4" y="2" width="3" height="3" fill="#0f172a" />
              <rect x="5" y="3" width="1" height="1" fill="#f43f5e" />
              <rect x="12" y="2" width="3" height="3" fill="#0f172a" />
              <rect x="13" y="3" width="1" height="1" fill="#f43f5e" />
              {/* Head */}
              <rect x="4" y="4" width="11" height="5" fill="#475569" />
              <rect x="10" y="4" width="2" height="2" fill="#0f172a" />
              {/* Emerald Eye looking right */}
              <rect x="6" y="6" width="2" height="2" fill="#10b981" />
              <rect x="7" y="6" width="1" height="2" fill="#0f172a" />
              <rect x="11" y="6" width="2" height="2" fill="#10b981" />
              <rect x="12" y="6" width="1" height="2" fill="#0f172a" />
              {/* Nose */}
              <rect x="13" y="7" width="2" height="1" fill="#f43f5e" />
              {/* Body */}
              <rect x="2" y="8" width="10" height="5" fill="#475569" />
              <rect x="8" y="8" width="2" height="5" fill="#0f172a" />
              <rect x="4" y="9" width="6" height="4" fill="#f8fafc" />
              {/* Paws */}
              <rect x={animFrame === 0 ? "3" : "6"} y="13" width="2" height="3" fill="#f8fafc" />
              <rect x={animFrame === 0 ? "10" : "7"} y="13" width="2" height="3" fill="#f8fafc" />
              {/* Tail */}
              <rect x="1" y="6" width="2" height="5" fill="#0f172a" />
            </g>
          ) : (
            /* DEFAULT IDLE SITTING BLACK/GREY TABBY */
            <g>
              {/* Ears */}
              <rect x="2" y="2" width="3" height="3" fill="#0f172a" />
              <rect x="3" y="3" width="1" height="1" fill="#f43f5e" />
              <rect x="11" y="2" width="3" height="3" fill="#0f172a" />
              <rect x="12" y="3" width="1" height="1" fill="#f43f5e" />
              {/* Head */}
              <rect x="2" y="4" width="12" height="5" fill="#475569" />
              {/* Black Tabby forehead stripes */}
              <rect x="6" y="4" width="4" height="2" fill="#0f172a" />
              {/* Emerald Eyes */}
              <rect x="4" y="6" width="2" height="2" fill="#10b981" />
              <rect x="4" y="6" width="1" height="2" fill="#0f172a" />
              <rect x="10" y="6" width="2" height="2" fill="#10b981" />
              <rect x="10" y="6" width="1" height="2" fill="#0f172a" />
              {/* Nose */}
              <rect x="7" y="7" width="2" height="1" fill="#f43f5e" />
              {/* Body */}
              <rect x="3" y="9" width="10" height="5" fill="#475569" />
              <rect x="4" y="9" width="2" height="5" fill="#0f172a" />
              <rect x="10" y="9" width="2" height="5" fill="#0f172a" />
              {/* White chest & belly */}
              <rect x="6" y="9" width="4" height="5" fill="#f8fafc" />
              {/* White paws */}
              <rect x="4" y="14" width="2" height="2" fill="#f8fafc" />
              <rect x="10" y="14" width="2" height="2" fill="#f8fafc" />
              {/* Tail on right */}
              <rect x="13" y="8" width="2" height="5" rx="1" fill="#0f172a" />
            </g>
          )}
        </svg>
      </button>
    </div>
  )
}
