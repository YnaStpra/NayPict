"use client"

import { Skeleton } from "@/components/ui/skeleton"
import { type PhotoVo } from "@/server/entity/vo/photo"

interface PhotoMasonrySkeletonProps {
  // photos is the initial data of the photo used to generate the height of the skeleton..
  photos: PhotoVo[]
}

// Render photo waterfall flow loading skeleton screen, Photos less than 20 Not displayed when opening.
export function PhotoMasonrySkeleton({ photos }: PhotoMasonrySkeletonProps) {
  if (photos.length < 20) {
    return null
  }

  return (
    <div className="w-full overflow-x-hidden columns-2 gap-1 md:columns-[240px]">
      {photos.map((photo) => (
        <Skeleton
          key={photo.photoId}
          className="mb-1 w-full break-inside-avoid rounded-none animate-none"
          style={{
            aspectRatio: `${photo.width || 1} / ${photo.height || 1}`,
          }}
        />
      ))}
    </div>
  )
}
