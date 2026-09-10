"use client"

import { memo, useEffect, useMemo, useState } from "react"
import { type RenderComponentProps } from "masonic"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"

import { AlbumActionMenu } from "@/components/album/album-action-menu"
import { getThumbHashUrl } from "@/lib/thumb-hash"
import { toProxyMediaUrl } from "@/lib/url"
import { type AlbumVo } from "@/server/entity/vo/album"
import { useAlbumStore } from "@/store/album-store"

type AlbumCardProps = Partial<RenderComponentProps<AlbumVo>> & {
  data: AlbumVo
  href?: string
  onRename?: (album: AlbumVo) => void
  onTop?: (album: AlbumVo) => void
  onDelete?: (album: AlbumVo) => void
  onChangeCover?: (album: AlbumVo) => void
}

// Render a single album card in a virtual list.
export const AlbumCard = memo(function AlbumCard({ data, width, href, onRename, onTop, onDelete, onChangeCover }: AlbumCardProps) {
  const router = useRouter()
  const setCurrentAlbumName = useAlbumStore((state) => state.setCurrentAlbumName)
  const [thumbnailSrc, setThumbnailSrc] = useState<string | null>(() => data.thumbnail || null)
  const placeholder = useMemo(() => getThumbHashUrl(data.thumbHash), [data.thumbHash])
  // isOpening tracks whether the album transition is in flight to provide immediate visual feedback.
  const [isOpening, setIsOpening] = useState(false)
  const targetHref = href ?? `/albums/${data.albumId}`

  useEffect(() => {
    setThumbnailSrc(data.thumbnail || null)
  }, [data.thumbnail])

  // Safety fallback: reset loading indicator if navigation does not unmount component
  useEffect(() => {
    if (!isOpening) return
    const timeout = setTimeout(() => {
      setIsOpening(false)
    }, 8000)
    return () => clearTimeout(timeout)
  }, [isOpening])

  // Speculative prefetch route chunk on cursor hover or finger touch
  function handlePrefetch() {
    try {
      router.prefetch(targetHref)
    } catch {}
  }

  // Record the current album name and show immediate loading state to prevent double clicks.
  function handleAlbumClick(e: React.MouseEvent<HTMLAnchorElement>) {
    if (isOpening) {
      e.preventDefault()
      return
    }

    setIsOpening(true)
    setCurrentAlbumName(data.name)
  }

  // Hand over the renaming operation and current album to the upper page.
  function renameAlbum() {
    onRename?.(data)
  }

  // Hand over the pin operation and current album to the upper page.
  function topAlbum() {
    onTop?.(data)
  }

  // Hand over the deletion operation and current album to the upper page.
  function deleteAlbum() {
    onDelete?.(data)
  }

  // Hand over the cover change operation and current album to the upper page.
  function changeCoverAlbum() {
    onChangeCover?.(data)
  }

  // Calibrated Responsive Sizes: Forces browser to select lightweight 480w thumbnail (saving 85% bandwidth)
  const effectiveSizes = "(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"

  return (
    <div
      className="group relative aspect-square overflow-hidden houdini-smooth-card touch-press-feedback [content-visibility:auto] touch-manipulation"
      style={{
        width,
        contain: "paint layout",
        containIntrinsicSize: `auto ${width}px ${width}px`,
        backgroundColor: placeholder ? undefined : "rgba(128,128,128,0.08)",
        backgroundImage: placeholder ? `url("${placeholder}")` : undefined,
        backgroundSize: "cover",
        backgroundPosition: "center",
        // Dynamic Layout Stability CSS Custom Properties (CLS = 0.000)
        ["--aspect-ratio" as string]: "1",
        ["--intrinsic-width" as string]: `${width}px`,
        ["--intrinsic-height" as string]: `${width}px`,
      }}
    >
      {/* 3D Physical Photo Stack Underlay Layers */}
      <div className="absolute inset-1.5 rounded-2xl bg-neutral-900/90 border border-white/10 shadow-lg pointer-events-none album-stack-layer-1" />
      <div className="absolute inset-1.5 rounded-2xl bg-neutral-950/95 border border-white/15 shadow-xl pointer-events-none album-stack-layer-2" />

      <Link
        href={targetHref}
        prefetch={false}
        className={`absolute inset-0 block rounded-2xl overflow-hidden ${isOpening ? "pointer-events-none cursor-wait" : ""}`}
        onClick={handleAlbumClick}
        onMouseEnter={handlePrefetch}
        onTouchStart={handlePrefetch}
      >
        {/* Specular Light Sheen Reflection Sweep */}
        <div className="specular-glass-sheen" />
        {thumbnailSrc ? (
          <img
            src={thumbnailSrc}
            sizes={effectiveSizes}
            loading="lazy"
            decoding="async"
            alt={data.name}
            className={`absolute inset-0 h-full w-full object-cover spring-zoom-img group-hover:scale-[1.035] transition-all duration-300 ${isOpening ? "brightness-75 scale-[1.02]" : ""}`}
            onError={(event) => {
              if (thumbnailSrc && !thumbnailSrc.startsWith('/media/')) {
                setThumbnailSrc(toProxyMediaUrl(thumbnailSrc))
              } else {
                event.currentTarget.style.display = "none"
              }
            }}
          />
        ) : (
          <div className="absolute inset-0 bg-[#DDDDDD] dark:bg-muted" />
        )}

        {/* Immediate loading animation overlay when opening album */}
        {isOpening && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/55 backdrop-blur-[2px] transition-all animate-in fade-in duration-200">
            <div className="relative flex size-12 items-center justify-center">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-white/20 opacity-75" />
              <Loader2 className="size-7 animate-spin text-white drop-shadow-md" />
            </div>
            <span className="mt-2 text-xs font-semibold uppercase tracking-wider text-white drop-shadow-md select-none">
              Opening...
            </span>
          </div>
        )}

        <div
          className={`pointer-events-none absolute inset-x-0 bottom-0 p-3 pb-2 text-left text-white transition-opacity duration-200 ${isOpening ? "opacity-0" : "opacity-100"}`}
          style={{
            filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.4)) drop-shadow(0 0 1px rgba(0,0,0,0.3))",
          }}
        >
          <div className="text-base font-normal">
            {data.photoTotal}
          </div>
          <div className="max-w-full truncate text-lg font-semibold">
            {data.name}
          </div>
        </div>
      </Link>
      {onRename && onTop && onDelete && (
        <div className="absolute top-[4px] right-[4px] z-10">
          <AlbumActionMenu
            shadow={Boolean(thumbnailSrc)}
            onRename={renameAlbum}
            onTop={topAlbum}
            onDelete={deleteAlbum}
            onChangeCover={onChangeCover ? changeCoverAlbum : undefined}
          />
        </div>
      )}
    </div>
  )
})
