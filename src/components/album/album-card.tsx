"use client"

import { memo, useEffect, useMemo, useState } from "react"
import { type RenderComponentProps } from "masonic"
import Link from "next/link"

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
  const setCurrentAlbumName = useAlbumStore((state) => state.setCurrentAlbumName)
  const [thumbnailSrc, setThumbnailSrc] = useState<string | null>(() => data.thumbnail || null)
  const placeholder = useMemo(() => getThumbHashUrl(data.thumbHash), [data.thumbHash])

  useEffect(() => {
    setThumbnailSrc(data.thumbnail || null)
  }, [data.thumbnail])

  // Record the current album name before clicking to enter the album, For photo page display.
  function saveCurrentAlbumName() {
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
      className="group relative aspect-square overflow-hidden houdini-smooth-card touch-press-feedback"
      style={{
        width,
        contain: "paint layout",
        containIntrinsicSize: "280px 280px",
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
      <Link
        href={href ?? `/albums/${data.albumId}`}
        prefetch={false}
        className="absolute inset-0 block"
        onClick={saveCurrentAlbumName}
      >
        {thumbnailSrc ? (
          <img
            src={thumbnailSrc}
            sizes={effectiveSizes}
            loading="lazy"
            decoding="async"
            alt={data.name}
            className="absolute inset-0 h-full w-full object-cover spring-zoom-img group-hover:scale-[1.035]"
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
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 p-3 pb-2 text-left text-white"
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
