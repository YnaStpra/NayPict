'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'

// Kuro's easter egg speech bubble messages
const KURO_MESSAGES = [
  "Meow! Hi there, I'm Kuro! 🐾",
  "Purrr... Kuro is guarding your photos! 📸",
  "Kuro loves watching this gallery ~ ✨",
  "Meow! Did you know Kuro is a grey tabby cat? 🐱",
  "Purrr... Feed Kuro a virtual fish! 🐟",
  "Kuro says: Stay aesthetic! 🌟",
  "Meow! Kuro is taking a cozy cat nap 💤",
  "Purrrr... Click me again for another surprise! 🎁",
  "Meow! NayPict is Kuro's favorite place! 💖",
]

type CatState = 'idle' | 'walk-left' | 'walk-right' | 'sleep' | 'happy'

export function PixelCat() {
  const [catState, setCatState] = useState<CatState>('idle')
  const [posX, setPosX] = useState<number>(0)
  const [bubbleText, setBubbleText] = useState<string | null>(null)
  const [isJumping, setIsJumping] = useState<boolean>(false)
  const [walkFrame, setWalkFrame] = useState<number>(0)
  const bubbleTimerRef = useRef<NodeJS.Timeout | null>(null)

  // Initialize position on mount (bottom-right area)
  useEffect(() => {
    setPosX(20)
  }, [])

  // Walk animation frame switcher
  useEffect(() => {
    if (catState === 'walk-left' || catState === 'walk-right') {
      const interval = setInterval(() => {
        setWalkFrame((prev) => (prev === 0 ? 1 : 0))
      }, 200)
      return () => clearInterval(interval)
    }
  }, [catState])

  // Random Autonomous Cat Action Loop
  useEffect(() => {
    const actionInterval = setInterval(() => {
      // Don't interrupt happy state triggered by click
      setCatState((currentState) => {
        if (currentState === 'happy' && bubbleText) return currentState

        const rand = Math.random()
        if (rand < 0.4) {
          return 'idle'
        } else if (rand < 0.65) {
          // Walk left
          setPosX((prev) => Math.max(10, prev - 40))
          return 'walk-left'
        } else if (rand < 0.85) {
          // Walk right
          setPosX((prev) => Math.min(220, prev + 40))
          return 'walk-right'
        } else {
          return 'sleep'
        }
      })
    }, 6000)

    return () => clearInterval(actionInterval)
  }, [bubbleText])

  // Click Handler - Kuro Easter Egg Bubble Chat
  const handleClickKuro = useCallback(() => {
    // Jump animation
    setIsJumping(true)
    setTimeout(() => setIsJumping(false), 300)

    // Trigger happy pose
    setCatState('happy')

    // Select random message
    const randomMsg = KURO_MESSAGES[Math.floor(Math.random() * KURO_MESSAGES.length)]
    setBubbleText(randomMsg)

    // Clear existing timer
    if (bubbleTimerRef.current) clearTimeout(bubbleTimerRef.current)

    // Hide bubble after 4 seconds
    bubbleTimerRef.current = setTimeout(() => {
      setBubbleText(null)
      setCatState('idle')
    }, 4000)
  }, [])

  return (
    <div
      className="fixed bottom-3 right-4 z-[99999] flex flex-col items-center select-none pointer-events-auto"
      style={{
        transform: `translateX(-${posX}px)`,
        transition: catState.startsWith('walk') ? 'transform 1.5s linear' : 'transform 0.3s ease',
      }}
    >
      {/* Easter Egg Speech Bubble */}
      {bubbleText && (
        <div className="absolute bottom-14 mb-1 px-3 py-1.5 rounded-2xl bg-black/85 text-white text-xs font-semibold backdrop-blur-md border border-white/20 shadow-xl max-w-[200px] text-center animate-in fade-in zoom-in-95 duration-200 whitespace-nowrap">
          {bubbleText}
          {/* Arrow indicator */}
          <div className="absolute left-1/2 -bottom-1 -translate-x-1/2 w-2 h-2 bg-black/85 border-r border-b border-white/20 rotate-45" />
        </div>
      )}

      {/* Interactive Pixel Art Cat Body */}
      <button
        type="button"
        onClick={handleClickKuro}
        title="Click Kuro the Cat!"
        className={`group relative cursor-pointer outline-none transition-transform ${
          isJumping ? '-translate-y-3' : 'hover:scale-110 active:scale-95'
        }`}
      >
        {/* SVG Pixel Art Cat Frame */}
        <svg
          width="44"
          height="44"
          viewBox="0 0 16 16"
          className="drop-shadow-md shape-rendering-crisp"
          style={{ imageRendering: 'pixelated' }}
        >
          {catState === 'sleep' ? (
            /* SLEEPING CAT FRAME */
            <g>
              {/* Ears */}
              <rect x="3" y="6" width="2" height="2" fill="#475569" />
              <rect x="4" y="7" width="1" height="1" fill="#f43f5e" />
              <rect x="11" y="6" width="2" height="2" fill="#475569" />
              <rect x="11" y="7" width="1" height="1" fill="#f43f5e" />
              {/* Body curled */}
              <rect x="2" y="8" width="12" height="6" rx="2" fill="#94a3b8" />
              {/* Tabby stripes */}
              <rect x="4" y="8" width="2" height="4" fill="#334155" />
              <rect x="8" y="8" width="2" height="4" fill="#334155" />
              {/* White belly & paws */}
              <rect x="3" y="11" width="10" height="3" fill="#ffffff" />
              {/* Closed Eyes */}
              <rect x="4" y="10" width="2" height="1" fill="#0f172a" />
              <rect x="10" y="10" width="2" height="1" fill="#0f172a" />
              {/* Nose */}
              <rect x="7" y="10" width="2" height="1" fill="#f43f5e" />
              {/* Zzz floating indicator */}
              <text x="11" y="5" fontSize="4" fill="#60a5fa" fontWeight="bold">z</text>
            </g>
          ) : catState === 'happy' ? (
            /* HAPPY MEOWING CAT FRAME */
            <g>
              {/* Ears */}
              <rect x="2" y="1" width="3" height="3" fill="#475569" />
              <rect x="3" y="2" width="1" height="1" fill="#f43f5e" />
              <rect x="11" y="1" width="3" height="3" fill="#475569" />
              <rect x="12" y="2" width="1" height="1" fill="#f43f5e" />
              {/* Head */}
              <rect x="2" y="3" width="12" height="6" fill="#94a3b8" />
              {/* Tabby forehead stripes */}
              <rect x="7" y="3" width="2" height="2" fill="#334155" />
              {/* Happy eyes ^ ^ */}
              <rect x="4" y="5" width="2" height="1" fill="#0f172a" />
              <rect x="10" y="5" width="2" height="1" fill="#0f172a" />
              {/* Nose & Open Mouth */}
              <rect x="7" y="6" width="2" height="1" fill="#f43f5e" />
              <rect x="7" y="7" width="2" height="1" fill="#0f172a" />
              {/* Body */}
              <rect x="3" y="9" width="10" height="5" fill="#94a3b8" />
              <rect x="5" y="9" width="6" height="5" fill="#ffffff" />
              {/* Paws */}
              <rect x="4" y="14" width="2" height="2" fill="#ffffff" />
              <rect x="10" y="14" width="2" height="2" fill="#ffffff" />
              {/* Tail up */}
              <rect x="13" y="6" width="2" height="6" fill="#475569" />
            </g>
          ) : catState === 'walk-left' ? (
            /* WALKING LEFT CAT FRAME */
            <g>
              {/* Ears */}
              <rect x="1" y="2" width="3" height="3" fill="#475569" />
              <rect x="2" y="3" width="1" height="1" fill="#f43f5e" />
              <rect x="9" y="2" width="3" height="3" fill="#475569" />
              <rect x="10" y="3" width="1" height="1" fill="#f43f5e" />
              {/* Head */}
              <rect x="1" y="4" width="11" height="5" fill="#94a3b8" />
              {/* Eye looking left */}
              <rect x="3" y="6" width="2" height="2" fill="#10b981" />
              <rect x="3" y="6" width="1" height="2" fill="#0f172a" />
              <rect x="8" y="6" width="2" height="2" fill="#10b981" />
              <rect x="8" y="6" width="1" height="2" fill="#0f172a" />
              {/* Nose */}
              <rect x="1" y="7" width="2" height="1" fill="#f43f5e" />
              {/* Body */}
              <rect x="4" y="8" width="10" height="5" fill="#94a3b8" />
              <rect x="5" y="9" width="7" height="4" fill="#ffffff" />
              {/* Alternating paws */}
              <rect x={walkFrame === 0 ? "3" : "5"} y="13" width="2" height="3" fill="#ffffff" />
              <rect x={walkFrame === 0 ? "11" : "9"} y="13" width="2" height="3" fill="#ffffff" />
              {/* Tail */}
              <rect x="13" y="7" width="2" height="4" fill="#334155" />
            </g>
          ) : catState === 'walk-right' ? (
            /* WALKING RIGHT CAT FRAME */
            <g>
              {/* Ears */}
              <rect x="4" y="2" width="3" height="3" fill="#475569" />
              <rect x="5" y="3" width="1" height="1" fill="#f43f5e" />
              <rect x="12" y="2" width="3" height="3" fill="#475569" />
              <rect x="13" y="3" width="1" height="1" fill="#f43f5e" />
              {/* Head */}
              <rect x="4" y="4" width="11" height="5" fill="#94a3b8" />
              {/* Eye looking right */}
              <rect x="6" y="6" width="2" height="2" fill="#10b981" />
              <rect x="7" y="6" width="1" height="2" fill="#0f172a" />
              <rect x="11" y="6" width="2" height="2" fill="#10b981" />
              <rect x="12" y="6" width="1" height="2" fill="#0f172a" />
              {/* Nose */}
              <rect x="13" y="7" width="2" height="1" fill="#f43f5e" />
              {/* Body */}
              <rect x="2" y="8" width="10" height="5" fill="#94a3b8" />
              <rect x="4" y="9" width="7" height="4" fill="#ffffff" />
              {/* Alternating paws */}
              <rect x={walkFrame === 0 ? "3" : "5"} y="13" width="2" height="3" fill="#ffffff" />
              <rect x={walkFrame === 0 ? "10" : "8"} y="13" width="2" height="3" fill="#ffffff" />
              {/* Tail */}
              <rect x="1" y="7" width="2" height="4" fill="#334155" />
            </g>
          ) : (
            /* DEFAULT IDLE SITTING CAT FRAME */
            <g>
              {/* Ears */}
              <rect x="2" y="2" width="3" height="3" fill="#475569" />
              <rect x="3" y="3" width="1" height="1" fill="#f43f5e" />
              <rect x="11" y="2" width="3" height="3" fill="#475569" />
              <rect x="12" y="3" width="1" height="1" fill="#f43f5e" />
              {/* Head */}
              <rect x="2" y="4" width="12" height="5" fill="#94a3b8" />
              {/* Tabby forehead stripes */}
              <rect x="7" y="4" width="2" height="2" fill="#334155" />
              {/* Eyes */}
              <rect x="4" y="6" width="2" height="2" fill="#10b981" />
              <rect x="4" y="6" width="1" height="2" fill="#0f172a" />
              <rect x="10" y="6" width="2" height="2" fill="#10b981" />
              <rect x="10" y="6" width="1" height="2" fill="#0f172a" />
              {/* Nose */}
              <rect x="7" y="7" width="2" height="1" fill="#f43f5e" />
              {/* Body */}
              <rect x="3" y="9" width="10" height="5" fill="#94a3b8" />
              {/* White chest & belly */}
              <rect x="5" y="9" width="6" height="5" fill="#ffffff" />
              {/* White paws */}
              <rect x="4" y="14" width="2" height="2" fill="#ffffff" />
              <rect x="10" y="14" width="2" height="2" fill="#ffffff" />
              {/* Tail on right */}
              <rect x="13" y="8" width="2" height="5" rx="1" fill="#334155" />
            </g>
          )}
        </svg>
      </button>
    </div>
  )
}
