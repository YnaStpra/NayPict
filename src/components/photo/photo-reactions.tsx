"use client"

import { useEffect, useState, useRef, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Flame, Heart, Camera, MapPin, Sparkles } from "lucide-react"
import { photoReactionsGet, photoReactionAdd } from "@/request/reaction"
import { type ReactionTotalsVo, type UserReactionsVo } from "@/server/entity/vo/reaction"
import { type ReactionType } from "@/server/entity/bo/reaction"

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
    type: "camera",
    label: "Great Shot",
    emoji: "📸",
    icon: Camera,
    color: "text-sky-400 hover:text-sky-300 hover:bg-sky-500/15",
    activeColor: "bg-sky-500/25 text-sky-300 border-sky-500/40 shadow-[0_0_12px_rgba(14,165,233,0.3)]",
  },
  {
    type: "place",
    label: "Want to Visit",
    emoji: "📍",
    icon: MapPin,
    color: "text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/15",
    activeColor: "bg-emerald-500/25 text-emerald-300 border-emerald-500/40 shadow-[0_0_12px_rgba(16,185,129,0.3)]",
  },
]

// Render interactive quick emoji reactions and public claps for a photo.
export function PhotoReactions({ photoId, className = "", compact = false }: PhotoReactionsProps) {
  const [totals, setTotals] = useState<ReactionTotalsVo>({
    love: 0,
    fire: 0,
    camera: 0,
    place: 0,
    clap: 0,
  })
  const [userReactions, setUserReactions] = useState<UserReactionsVo>({
    love: false,
    fire: false,
    camera: false,
    place: false,
    clap: 0,
  })
  const [particles, setParticles] = useState<Particle[]>([])
  const particleIdRef = useRef(0)

  // Fetch initial reactions for the photo
  useEffect(() => {
    let isMounted = true
    if (!photoId) return

    photoReactionsGet({ photoId })
      .then((res) => {
        if (isMounted && res) {
          setTotals(res.totals)
          setUserReactions(res.userReactions)
        }
      })
      .catch(() => {})

    return () => {
      isMounted = false
    }
  }, [photoId])

  // Spawn floating emoji particles on tap
  const triggerParticle = useCallback((emoji: string, e: React.MouseEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const newId = ++particleIdRef.current
    const particle: Particle = {
      id: newId,
      emoji,
      x: rect.left + rect.width / 2 + (Math.random() * 20 - 10),
      y: rect.top - 10,
    }

    setParticles((prev) => [...prev.slice(-10), particle])

    setTimeout(() => {
      setParticles((prev) => prev.filter((p) => p.id !== newId))
    }, 1200)
  }, [])

  // Handle emoji reaction toggle (Love, Fire, Camera, Place)
  const handleEmojiReaction = async (type: ReactionType, emoji: string, e: React.MouseEvent<HTMLButtonElement>) => {
    if (type === "clap") return

    // Haptic feedback
    if (typeof navigator !== "undefined" && navigator.vibrate) {
      navigator.vibrate(10)
    }

    triggerParticle(emoji, e)

    const isCurrentlyActive = Boolean(userReactions[type as keyof UserReactionsVo])
    const diff = isCurrentlyActive ? -1 : 1

    // Optimistic UI update
    setUserReactions((prev) => ({
      ...prev,
      [type]: !isCurrentlyActive,
    }))
    setTotals((prev) => ({
      ...prev,
      [type]: Math.max(0, prev[type] + diff),
    }))

    try {
      const updated = await photoReactionAdd({
        photoId,
        visitorId: "",
        reactionType: type,
      })
      if (updated) {
        setTotals(updated.totals)
        setUserReactions(updated.userReactions)
      }
    } catch {
      // Rollback on network error
      setUserReactions((prev) => ({
        ...prev,
        [type]: isCurrentlyActive,
      }))
      setTotals((prev) => ({
        ...prev,
        [type]: Math.max(0, prev[type] - diff),
      }))
    }
  }

  // Handle Claps / Likes (up to 5 claps per visitor)
  const handleClap = async (e: React.MouseEvent<HTMLButtonElement>) => {
    if (userReactions.clap >= 5) {
      triggerParticle("🎉", e)
      return
    }

    // Haptic feedback
    if (typeof navigator !== "undefined" && navigator.vibrate) {
      navigator.vibrate(15)
    }

    triggerParticle("👏", e)

    // Optimistic UI update
    setUserReactions((prev) => ({
      ...prev,
      clap: Math.min(5, prev.clap + 1),
    }))
    setTotals((prev) => ({
      ...prev,
      clap: prev.clap + 1,
    }))

    try {
      const updated = await photoReactionAdd({
        photoId,
        visitorId: "",
        reactionType: "clap",
        count: 1,
      })
      if (updated) {
        setTotals(updated.totals)
        setUserReactions(updated.userReactions)
      }
    } catch {
      // Rollback
      setUserReactions((prev) => ({
        ...prev,
        clap: Math.max(0, prev.clap - 1),
      }))
      setTotals((prev) => ({
        ...prev,
        clap: Math.max(0, prev.clap - 1),
      }))
    }
  }

  return (
    <div className={`${compact ? "space-y-0" : "space-y-2.5"} select-none ${className}`}>
      {/* Floating Particles Portal */}
      <div className="fixed inset-0 pointer-events-none z-[99999] overflow-hidden">
        <AnimatePresence>
          {particles.map((p) => (
            <motion.div
              key={p.id}
              initial={{ opacity: 1, y: p.y, x: p.x, scale: 0.8 }}
              animate={{
                opacity: 0,
                y: p.y - 70 - Math.random() * 30,
                x: p.x + (Math.random() * 30 - 15),
                scale: 1.4,
              }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.9, ease: "easeOut" }}
              className="fixed text-xl drop-shadow-lg"
            >
              {p.emoji}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <div className={`flex items-center ${compact ? "gap-1 flex-nowrap" : "justify-between gap-1.5 flex-wrap"}`}>
        {/* Emoji Reactions Cluster */}
        <div className={`flex items-center ${compact ? "gap-1" : "gap-1.5 flex-wrap"}`}>
          {REACTION_CONFIG.map((item) => {
            const Icon = item.icon
            const isActive = Boolean(userReactions[item.type as keyof UserReactionsVo])
            const count = totals[item.type as keyof ReactionTotalsVo] || 0

            return (
              <button
                key={item.type}
                type="button"
                onClick={(e) => handleEmojiReaction(item.type, item.emoji, e)}
                title={item.label}
                aria-label={item.label}
                className={`group relative flex items-center gap-1 rounded-full text-xs font-medium border transition-all duration-200 active:scale-95 cursor-pointer backdrop-blur-md ${
                  compact ? "px-1.5 py-0.5 text-[10px]" : "px-2.5 py-1"
                } ${
                  isActive
                    ? item.activeColor
                    : "border-white/10 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white"
                }`}
              >
                <Icon className={`${compact ? "size-3" : "size-3.5"} transition-transform group-hover:scale-120 ${isActive ? "scale-110" : ""}`} />
                {count > 0 && (
                  <span className={`${compact ? "text-[10px]" : "text-[11px]"} font-semibold tabular-nums ${isActive ? "text-white" : "text-white/80"}`}>
                    {count}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* Public Claps / Likes Button */}
        <button
          type="button"
          onClick={handleClap}
          title="Applaud this photo"
          aria-label="Applaud this photo"
          className={`group relative flex items-center gap-1 rounded-full text-xs font-semibold border transition-all duration-200 active:scale-95 cursor-pointer backdrop-blur-md ${
            compact ? "px-2 py-0.5 text-[10px]" : "px-3 py-1"
          } ${
            userReactions.clap > 0
              ? "bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-[0_0_12px_rgba(245,158,11,0.25)]"
              : "border-white/10 bg-white/5 text-white/80 hover:bg-white/10 hover:text-white"
          }`}
        >
          <span className={`${compact ? "text-xs" : "text-sm"} transition-transform group-hover:scale-125`}>👏</span>
          <span className={`${compact ? "text-[10px]" : "text-[11px]"} font-bold tabular-nums text-white`}>
            {totals.clap || 0}
          </span>
          {userReactions.clap > 0 && (
            <span className="text-[9px] px-1 py-0.2 rounded-full bg-amber-400/25 text-amber-200 font-semibold">
              +{userReactions.clap}
            </span>
          )}
        </button>
      </div>
    </div>
  )
}
