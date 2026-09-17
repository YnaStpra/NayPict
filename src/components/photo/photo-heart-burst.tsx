"use client"

import { useEffect, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Heart } from "lucide-react"

interface Particle {
  id: number
  x: number
  y: number
  scale: number
  rotation: number
  emoji: string
}

interface PhotoHeartBurstProps {
  // Whether the animation is currently active.
  show: boolean
  // Optional specific coordinates for the burst center.
  coords?: { x: number; y: number } | null
  // Callback when burst animation completes.
  onComplete?: () => void
  // Optional custom className for outer wrapper.
  className?: string
  // Size of the central heart in pixels.
  size?: number
}

// Ultra-smooth, GPU-composited Instagram-style Heart Burst animation with particle fountain.
export function PhotoHeartBurst({
  show,
  coords,
  onComplete,
  className = "",
  size = 80,
}: PhotoHeartBurstProps) {
  const [particles, setParticles] = useState<Particle[]>([])

  useEffect(() => {
    if (!show) {
      setParticles([])
      return
    }

    // Generate randomized celebration particles
    const particleCount = 6
    const emojis = ["✨", "💖", "✨", "💫", "✨", "❤️"]
    const newParticles: Particle[] = []

    for (let i = 0; i < particleCount; i++) {
      const angle = (i / particleCount) * 2 * Math.PI + (Math.random() * 0.4 - 0.2)
      const distance = size * 0.7 + Math.random() * (size * 0.45)
      newParticles.push({
        id: i,
        x: Math.cos(angle) * distance,
        y: Math.sin(angle) * distance - (size * 0.2), // Bias upward for floating feel
        scale: 0.8 + Math.random() * 0.4,
        rotation: (Math.random() - 0.5) * 60,
        emoji: emojis[i % emojis.length],
      })
    }

    setParticles(newParticles)

    const timer = setTimeout(() => {
      onComplete?.()
    }, 850)

    return () => clearTimeout(timer)
  }, [show, onComplete, size])

  if (!show) return null

  const positionStyle: React.CSSProperties = coords
    ? {
        position: "absolute",
        left: coords.x,
        top: coords.y,
        transform: "translate(-50%, -50%)",
      }
    : {
        position: "absolute",
        left: "50%",
        top: "50%",
        transform: "translate(-50%, -50%)",
      }

  return (
    <div
      style={positionStyle}
      className={`pointer-events-none select-none z-50 flex items-center justify-center ${className}`}
    >
      <AnimatePresence>
        {/* Floating Sparkle Particles */}
        {particles.map((p) => (
          <motion.div
            key={p.id}
            initial={{ opacity: 1, x: 0, y: 0, scale: 0.2, rotate: 0 }}
            animate={{
              opacity: [0, 1, 1, 0],
              x: p.x,
              y: p.y,
              scale: p.scale,
              rotate: p.rotation,
            }}
            transition={{
              duration: 0.75,
              ease: [0.22, 1, 0.36, 1],
            }}
            className="absolute text-sm drop-shadow-md pointer-events-none"
          >
            {p.emoji}
          </motion.div>
        ))}

        {/* Central Heart Pop with Elastic Spring & Drop Shadow Glow */}
        <motion.div
          key="central-heart"
          initial={{ scale: 0, rotate: -15, opacity: 0 }}
          animate={{
            scale: [0, 1.32, 0.95, 1.05, 0],
            rotate: [-15, 6, -3, 0, 0],
            opacity: [0, 1, 1, 0.9, 0],
          }}
          transition={{
            duration: 0.82,
            times: [0, 0.3, 0.55, 0.75, 1],
            ease: [0.175, 0.885, 0.32, 1.275],
          }}
          className="relative flex items-center justify-center filter drop-shadow-[0_0_24px_rgba(244,63,94,0.65)]"
        >
          {/* Radial Glow Halo Behind Heart */}
          <div
            className="absolute rounded-full bg-rose-500/35 blur-xl pointer-events-none"
            style={{ width: size * 1.4, height: size * 1.4 }}
          />

          {/* Glowing Vector Heart */}
          <Heart
            style={{ width: size, height: size }}
            className="fill-rose-500 text-white stroke-[1.5] drop-shadow-lg"
          />
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
