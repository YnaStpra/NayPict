"use client"

import { type PhotoVo } from "@/server/entity/vo/photo"

interface PhotoMasonrySkeletonProps {
  // photos is the initial data of the photo used to generate the initial zero-skeleton SSR/hydration frame
  photos?: PhotoVo[]
}

// Zero-Skeleton Instant Hydration & SSR Frame:
// Renders the real photo thumbnails directly inside responsive CSS columns,
// eliminating the jarring flash of gray skeleton blocks before Masonic attaches.
export function PhotoMasonrySkeleton({ photos }: PhotoMasonrySkeletonProps) {
  if (!photos || photos.length === 0) {
    return null
  }

  return (
    <div className="w-full overflow-x-hidden columns-2 gap-1 md:columns-[240px]">
      {photos.map((photo) => {
        const src = photo.thumbnail || photo.preview || photo.key
        const ratio = photo.width && photo.height ? `${photo.width} / ${photo.height}` : "1 / 1"
        return (
          <div
            key={photo.photoId}
            className="mb-1 w-full break-inside-avoid overflow-hidden bg-muted/10 relative"
            style={{
              aspectRatio: ratio,
            }}
          >
            {src && (
              <img
                src={src}
                alt={photo.name || ""}
                loading="eager"
                decoding="async"
                draggable={false}
                className="h-full w-full object-cover select-none pointer-events-none"
              />
            )}
          </div>
        )
      })}
    </div>
  )
}
