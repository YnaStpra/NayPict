"use client"

import React, { useMemo } from "react"
import { Aperture, Camera, Timer, SlidersHorizontal, Sparkles } from "lucide-react"
import { getPhotoAnalogExif, type PhotoAnalogExif } from "@/lib/viewer-field"
import { cn } from "@/lib/utils"

interface AnalogFilmStripProps {
  exif?: string | null
  parsedExif?: PhotoAnalogExif
  className?: string
  onClick?: () => void
}

/**
 * Identify camera brand accent & vintage film stock brand aesthetic
 */
function getCameraAesthetics(camera: string | null, make: string | null) {
  const text = `${make || ""} ${camera || ""}`.toLowerCase()

  if (text.includes("leica")) {
    return {
      brandTag: "LEICA M SYSTEM",
      brandColor: "text-red-400 border-red-500/40 bg-red-500/10",
      accentDot: "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]",
      filmStock: "LEICA SUMMILUX 35mm",
    }
  }
  if (text.includes("fuji")) {
    return {
      brandTag: "FUJIFILM",
      brandColor: "text-emerald-400 border-emerald-500/40 bg-emerald-500/10",
      accentDot: "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]",
      filmStock: "FUJICHROME PROVIA 100F",
    }
  }
  if (text.includes("sony")) {
    return {
      brandTag: "SONY α",
      brandColor: "text-orange-400 border-orange-500/40 bg-orange-500/10",
      accentDot: "bg-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.6)]",
      filmStock: "SONY G MASTER 35mm",
    }
  }
  if (text.includes("canon")) {
    return {
      brandTag: "CANON EOS",
      brandColor: "text-rose-400 border-rose-500/40 bg-rose-500/10",
      accentDot: "bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.6)]",
      filmStock: "CANON L-SERIES 35mm",
    }
  }
  if (text.includes("nikon")) {
    return {
      brandTag: "NIKON Z",
      brandColor: "text-yellow-400 border-yellow-500/40 bg-yellow-500/10",
      accentDot: "bg-yellow-400 shadow-[0_0_8px_rgba(250,204,21,0.6)]",
      filmStock: "NIKON NIKKOR 35mm",
    }
  }
  if (text.includes("apple") || text.includes("iphone")) {
    return {
      brandTag: "SHOT ON IPHONE",
      brandColor: "text-sky-300 border-sky-400/40 bg-sky-500/10",
      accentDot: "bg-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.6)]",
      filmStock: "PRO COMPUTATIONAL RAW",
    }
  }
  if (text.includes("hasselblad")) {
    return {
      brandTag: "HASSELBLAD",
      brandColor: "text-amber-200 border-amber-300/40 bg-amber-400/10",
      accentDot: "bg-amber-300 shadow-[0_0_8px_rgba(252,211,77,0.6)]",
      filmStock: "MEDIUM FORMAT 6x6",
    }
  }

  // Classic analog Kodak amber default
  return {
    brandTag: "ANALOG 35MM",
    brandColor: "text-amber-400 border-amber-500/40 bg-amber-500/10",
    accentDot: "bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.6)]",
    filmStock: "KODAK PORTRA 400",
  }
}

/**
 * 35mm Sprocket Holes Rail
 */
function FilmSprocketRail({ isTop = true }: { isTop?: boolean }) {
  return (
    <div
      className={cn(
        "flex items-center justify-between px-3 py-1.5 select-none pointer-events-none opacity-60",
        isTop ? "border-b border-white/[0.08]" : "border-t border-white/[0.08]"
      )}
      aria-hidden
    >
      <div className="flex items-center gap-2 overflow-hidden w-full justify-between">
        {[...Array(9)].map((_, i) => (
          <div
            key={i}
            className="w-3.5 h-2 rounded-[2px] bg-black border border-white/20 shadow-inner shrink-0"
          />
        ))}
      </div>
    </div>
  )
}

/**
 * Full Analog 35mm Film Strip Card for Photo Info Sidebar
 */
export function AnalogFilmStripCard({
  exif,
  parsedExif: inputParsed,
  className,
}: AnalogFilmStripProps) {
  const data = useMemo(() => {
    return inputParsed ?? getPhotoAnalogExif(exif)
  }, [exif, inputParsed])

  if (!data.hasExif) return null

  const aesthetics = getCameraAesthetics(data.camera, data.cameraMake)

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border border-white/15 bg-gradient-to-b from-[#18181c] via-[#121215] to-[#0c0c0e] text-white shadow-2xl transition-all duration-300 hover:border-white/25",
        className
      )}
    >
      {/* Top 35mm Film Sprocket Strip */}
      <FilmSprocketRail isTop={true} />

      {/* Camera & Lens Title Banner - Direct Hero Display */}
      <div className="px-3.5 pt-2.5 pb-1">
        {data.camera && (
          <div className="text-sm font-semibold text-white tracking-tight flex items-center gap-1.5 truncate">
            <Camera className="size-3.5 text-white/60 shrink-0" />
            <span className="truncate font-semibold">{data.camera}</span>
          </div>
        )}
        {data.lens && (
          <div className="text-[11px] text-white/50 truncate font-mono mt-0.5" title={data.lens}>
            {data.lens}
          </div>
        )}
      </div>

      {/* Tactile Photographic Exposure Readout Blocks */}
      {data.hasShootingParams && (
        <div className="px-3 py-2.5 grid grid-cols-4 gap-1.5">
          {/* Shutter Speed */}
          <div
            className="flex flex-col items-center justify-center p-1 sm:p-1.5 rounded-lg bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.08] transition-colors"
            title={`Shutter Speed: ${data.shutter || "—"}`}
          >
            <span className="text-[8px] sm:text-[9px] font-mono uppercase text-white/40 flex items-center gap-1 mb-0.5 tracking-wider max-w-full">
              <Timer className="size-2.5 text-amber-400/80 shrink-0" />
              <span className="truncate">SHUTTER</span>
            </span>
            <span className="text-[11px] sm:text-[12px] font-bold font-mono text-amber-300 tracking-tight truncate max-w-full">
              {data.shutter || "—"}
            </span>
          </div>

          {/* Aperture */}
          <div
            className="flex flex-col items-center justify-center p-1 sm:p-1.5 rounded-lg bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.08] transition-colors"
            title={`Aperture: ${data.aperture ? (data.aperture.startsWith("f/") ? data.aperture.replace("f/", "ƒ/") : `ƒ/${data.aperture}`) : "—"}`}
          >
            <span className="text-[8px] sm:text-[9px] font-mono uppercase text-white/40 flex items-center gap-1 mb-0.5 tracking-wider max-w-full">
              <Aperture className="size-2.5 text-emerald-400/80 shrink-0" />
              <span className="truncate">APERTURE</span>
            </span>
            <span className="text-[11px] sm:text-[12px] font-bold font-mono text-emerald-300 tracking-tight italic truncate max-w-full">
              {data.aperture ? (data.aperture.startsWith("f/") ? data.aperture.replace("f/", "ƒ/") : `ƒ/${data.aperture}`) : "—"}
            </span>
          </div>

          {/* Focal Length */}
          <div
            className="flex flex-col items-center justify-center p-1 sm:p-1.5 rounded-lg bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.08] transition-colors"
            title={`Focal Length: ${data.focalLength || "—"}`}
          >
            <span className="text-[8px] sm:text-[9px] font-mono uppercase text-white/40 flex items-center gap-1 mb-0.5 tracking-wider max-w-full">
              <Camera className="size-2.5 text-sky-400/80 shrink-0" />
              <span className="truncate">FOCAL</span>
            </span>
            <span className="text-[11px] sm:text-[12px] font-bold font-mono text-sky-300 tracking-tight truncate max-w-full">
              {data.focalLength || "—"}
            </span>
          </div>

          {/* ISO */}
          <div
            className="flex flex-col items-center justify-center p-1 sm:p-1.5 rounded-lg bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.08] transition-colors"
            title={`ISO: ${data.iso || "—"}`}
          >
            <span className="text-[8px] sm:text-[9px] font-mono uppercase text-white/40 flex items-center gap-1 mb-0.5 tracking-wider max-w-full">
              <SlidersHorizontal className="size-2.5 text-rose-400/80 shrink-0" />
              <span className="truncate">ISO</span>
            </span>
            <span className="text-[11px] sm:text-[12px] font-bold font-mono text-rose-300 tracking-tight truncate max-w-full">
              {data.iso || "—"}
            </span>
          </div>
        </div>
      )}

      {/* EV Bias (If non-zero or present) */}
      {data.exposureBias && (
        <div className="px-3.5 pb-2 pt-0 flex items-center justify-between text-[10px] font-mono text-white/50">
          <span>EXP COMP</span>
          <span className="text-white/80 font-medium">{data.exposureBias}</span>
        </div>
      )}

      {/* Bottom 35mm Film Sprocket Strip */}
      <FilmSprocketRail isTop={false} />
    </div>
  )
}

/**
 * Compact Film Strip HUD Badge for Photo Viewer Overlay (Bottom-left or toolbar)
 */
export function AnalogFilmStripCompact({
  exif,
  parsedExif: inputParsed,
  className,
  onClick,
}: AnalogFilmStripProps) {
  const data = useMemo(() => {
    return inputParsed ?? getPhotoAnalogExif(exif)
  }, [exif, inputParsed])

  if (!data.hasExif) return null

  const aesthetics = getCameraAesthetics(data.camera, data.cameraMake)

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        onClick?.()
      }}
      className={cn(
        "group relative flex items-center gap-2 rounded-full border border-white/20 bg-black/75 px-3 py-1 text-xs font-mono text-white backdrop-blur-xl shadow-xl transition-all duration-200 hover:scale-[1.02] hover:bg-black/90 hover:border-amber-400/50 cursor-pointer pointer-events-auto",
        className
      )}
      title="Click to view camera & photo details"
    >
      <span className={cn("size-2 rounded-full shrink-0", aesthetics.accentDot)} />

      {/* Camera Name or Brand */}
      <span className="font-bold text-white/90 tracking-tight truncate max-w-[140px] sm:max-w-[200px]">
        {data.camera || aesthetics.brandTag}
      </span>

      {/* Exposure specs separator */}
      {data.hasShootingParams && (
        <>
          <span className="text-white/30 select-none">•</span>
          <div className="flex items-center gap-1.5 text-[11px] text-white/80">
            {data.focalLength && (
              <span className="text-sky-300 font-semibold">{data.focalLength}</span>
            )}
            {data.aperture && (
              <span className="text-emerald-300 font-semibold italic">
                {data.aperture.startsWith("f/") ? data.aperture.replace("f/", "ƒ/") : `ƒ/${data.aperture}`}
              </span>
            )}
            {data.shutter && (
              <span className="text-amber-300 font-semibold">{data.shutter}</span>
            )}
            {data.iso && (
              <span className="text-rose-300 font-semibold">ISO {data.iso}</span>
            )}
          </div>
        </>
      )}

      {/* Film Stamp subtle icon */}
      <Sparkles className="size-3 text-amber-400 opacity-60 group-hover:opacity-100 transition-opacity ml-0.5" />
    </button>
  )
}
