"use client"

import { useEffect, useState, useRef, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Flame, Heart, ThumbsUp } from "lucide-react"
import { type ReactionTotalsVo, type UserReactionsVo } from "@/server/entity/vo/reaction"
import { type ReactionType } from "@/server/entity/bo/reaction"
import { reactionSync } from "@/lib/reaction-sync"

interface PhotoReactionsProps {
  photoId: string
  className?: string
  compact?: boolean
}

interface Particle {
  id: number
  emoji: string
  x: number
  y: number
  targetX: number
  targetY: number
  rotate: number
  scale: number
  duration: number
}

const REACTION_CONFIG: {
  type: ReactionType
  label: string
  emoji: string
  icon: typeof Heart
  color: string
  activeColor: string
}[] = [
  {
    type: "love",
    label: "Love",
    emoji: "❤️",
    icon: Heart,
    color: "text-rose-400 hover:text-rose-300 hover:bg-rose-500/15",
    activeColor: "bg-rose-500/25 text-rose-300 border-rose-500/40 shadow-[0_0_12px_rgba(244,63,94,0.3)]",
  },
  {
    type: "fire",
    label: "Fire",
    emoji: "🔥",
    icon: Flame,
    color: "text-amber-400 hover:text-amber-300 hover:bg-amber-500/15",
    activeColor: "bg-amber-500/25 text-amber-300 border-amber-500/40 shadow-[0_0_12px_rgba(245,158,11,0.3)]",
  },
  {
    type: "clap",
    label: "Like",
    emoji: "👍",
    icon: ThumbsUp,
    color: "text-sky-400 hover:text-sky-300 hover:bg-sky-500/15",
    activeColor: "bg-sky-500/25 text-sky-300 border-sky-500/40 shadow-[0_0_12px_rgba(14,165,233,0.3)]",
  },
]

// Render interactive quick emoji reactions and likes for a photo.
export function PhotoReactions({ photoId, className = "", compact = false }: PhotoReactionsProps) {
  const [totals, setTotals] = useState<ReactionTotalsVo>(() => {
    const cached = reactionSync.getCached(photoId)
    return cached?.totals || { love: 0, fire: 0, camera: 0, place: 0, clap: 0 }
  })

  const [userReactions, setUserReactions] = useState<UserReactionsVo>(() => {
    const cached = reactionSync.getCached(photoId)
    return cached?.userReactions || { love: false, fire: false, camera: false, place: false, clap: 0 }
  })

  const [particles, setParticles] = useState<Particle[]>([])
  const particleIdRef = useRef(0)

  // Subscribe to real-time synchronized reaction state
  useEffect(() => {
    if (!photoId) return

    // Immediately reflect cached data or reset clean state to prevent stale photo flash
    const cached = reactionSync.getCached(photoId)
    if (cached) {
      setTotals(cached.totals)
      setUserReactions(cached.userReactions)
    } else {
      setTotals({ love: 0, fire: 0, camera: 0, place: 0, clap: 0 })
      setUserReactions({ love: false, fire: false, camera: false, place: false, clap: 0 })
    }

    const unsubscribe = reactionSync.subscribe(photoId, (data) => {
      setTotals(data.totals)
      setUserReactions(data.userReactions)
    })

    return () => {
      unsubscribe()
    }
  }, [photoId])

  // Spawn celebratory fountain of floating emoji particles on tap
  const triggerParticleBurst = useCallback((emoji: string, e: React.MouseEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const centerX = rect.left + rect.width / 2
    const startY = rect.top - 6

    const newParticles: Particle[] = []
    const count = 6
    const emojis = [emoji, emoji, "✨", emoji, emoji, "✨"]

    for (let i = 0; i < count; i++) {
      const newId = ++particleIdRef.current
      const progress = (i / (count - 1)) - 0.5 // -0.5 to +0.5
      const spreadX = progress * (60 + Math.random() * 20)
      const liftY = -(70 + Math.random() * 45)

      newParticles.push({
        id: newId,
        emoji: emojis[i % emojis.length],
        x: centerX + (Math.random() * 10 - 5),
        y: startY,
        targetX: centerX + spreadX,
        targetY: startY + liftY,
        rotate: (Math.random() - 0.5) * 50,
        scale: 1.1 + Math.random() * 0.45,
        duration: 0.85 + Math.random() * 0.35,
      })
    }

    setParticles((prev) => [...prev.slice(-24), ...newParticles])

    setTimeout(() => {
      const idsToRemove = new Set(newParticles.map((p) => p.id))
      setParticles((prev) => prev.filter((p) => !idsToRemove.has(p.id)))
    }, 1400)
  }, [])

  // Handle reaction toggle with mutual exclusivity
  const handleReaction = async (type: ReactionType, emoji: string, e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation()
    if (!photoId) return

    // Safe haptic feedback
    try {
      if (typeof navigator !== "undefined" && navigator.vibrate) {
        navigator.vibrate(10)
      }
    } catch {}

    const isCurrentlyActive = type === "clap"
      ? userReactions.clap > 0
      : Boolean(userReactions[type as keyof UserReactionsVo])

    if (!isCurrentlyActive) {
      triggerParticleBurst(emoji, e)
    }

    // Immediately toggle reaction via synchronized reactive store
    await reactionSync.toggleReaction(photoId, type)
  }

  return (
    <div className={`${compact ? "space-y-0" : "space-y-2.5"} select-none ${className}`}>
      {/* Celebratory Floating Particles Portal */}
      <div className="fixed inset-0 pointer-events-none z-[99999] overflow-hidden">
        <AnimatePresence>
          {particles.map((p) => (
            <motion.div
              key={p.id}
              initial={{ opacity: 1, y: p.y, x: p.x, scale: 0.5, rotate: 0 }}
              animate={{
                opacity: [1, 1, 0],
                y: p.targetY,
                x: p.targetX,
                scale: p.scale,
                rotate: p.rotate,
              }}
              exit={{ opacity: 0 }}
              transition={{ duration: p.duration, ease: [0.22, 1, 0.36, 1] }}
              className="fixed text-xl drop-shadow-lg pointer-events-none"
            >
              {p.emoji}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Unified Reaction Cluster (Love, Fire, Like) */}
      <div className={`flex items-center ${compact ? "gap-1 flex-nowrap" : "gap-1.5 flex-wrap"}`}>
        {REACTION_CONFIG.map((item) => {
          const Icon = item.icon
          const isActive = item.type === "clap"
            ? userReactions.clap > 0
            : Boolean(userReactions[item.type as keyof UserReactionsVo])
          const count = totals[item.type as keyof ReactionTotalsVo] || 0

          return (
            <button
              key={item.type}
              type="button"
              onClick={(e) => handleReaction(item.type, item.emoji, e)}
              title={isActive ? `Remove ${item.label}` : item.label}
              aria-label={item.label}
              className={`group relative flex items-center gap-1 rounded-full text-xs font-medium border transition-all duration-200 active:scale-95 cursor-pointer touch-manipulation min-h-[28px] ${
                compact ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 backdrop-blur-md"
              } ${
                isActive
                  ? item.activeColor
                  : "border-white/10 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white"
              }`}
            >
              <Icon className={`${compact ? "size-3" : "size-3.5"} transition-transform group-hover:scale-120 ${isActive ? "scale-110" : ""}`} />
              {count > 0 && (
                <motion.span
                  key={count}
                  initial={{ scale: 1.4, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: "spring", stiffness: 500, damping: 25 }}
                  className={`${compact ? "text-[10px]" : "text-[11px]"} font-semibold tabular-nums ${isActive ? "text-white" : "text-white/80"}`}
                >
                  {count}
                </motion.span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
