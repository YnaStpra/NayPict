/* eslint-disable react-hooks/set-state-in-effect, @typescript-eslint/no-unused-vars */
'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { AppSidebar } from '@/components/layout/app-sidebar'
import { Button } from '@/components/ui/button'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from '@/components/ui/breadcrumb'
import { Separator } from '@/components/ui/separator'
import {
  SidebarProvider,
  SidebarInset,
  SidebarTrigger,
} from '@/components/ui/sidebar'
import { useApp } from '@/app/provider'
import { UserTypeEnum } from '@/server/enums/user-enum'
import { type PhotoDuplicateGroupVo, type PhotoVo } from '@/server/entity/vo/photo'
import { photoGetDuplicates, photoRecycle } from '@/request/photo'
import { getThumbHashUrl } from '@/lib/thumb-hash'
import { toProxyMediaUrl } from '@/lib/url'
import { Check, CopyCheck, Eye, EyeOff, FolderIcon, Loader2, RefreshCw, Trash2, CheckCircle2, ShieldAlert } from 'lucide-react'
import { toast } from 'sonner'
import dynamic from 'next/dynamic'

const PhotoViewer = dynamic(
  () => import('@/components/photo/photo-viewer').then((mod) => mod.PhotoViewer),
  { ssr: false }
)

const STORAGE_KEY = 'naypict_ignored_duplicate_groups'

export default function DuplicatesPage() {
  const router = useRouter()
  const { userInfo, sidebarOpen, setSidebarOpen } = useApp()
  const isAdmin = userInfo?.type === UserTypeEnum.ADMIN

  const [loading, setLoading] = useState(true)
  const [groups, setGroups] = useState<PhotoDuplicateGroupVo[]>([])
  const [ignoredGroupIds, setIgnoredGroupIds] = useState<Set<string>>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem(STORAGE_KEY)
        if (saved) {
          const parsed = JSON.parse(saved)
          if (Array.isArray(parsed)) return new Set(parsed)
        }
      } catch (err) {
        console.error('Failed to load ignored duplicate groups:', err)
      }
    }
    return new Set()
  })

  // Photo viewer modal state
  const [viewerOpen, setViewerOpen] = useState(false)
  const [viewerPhotos, setViewerPhotos] = useState<PhotoVo[]>([])
  const [viewerIndex, setViewerIndex] = useState(0)

  const fetchDuplicates = useCallback(() => {
    setLoading(true)
    photoGetDuplicates()
      .then((res) => {
        setGroups(res || [])
      })
      .catch((err) => {
        console.error('Failed to fetch duplicate media groups:', err)
        toast.error('Failed to load duplicate media list.')
      })
      .finally(() => {
        setLoading(false)
      })
  }, [])

  useEffect(() => {
    if (isAdmin) {
      fetchDuplicates()
    } else {
      setLoading(false)
    }
  }, [isAdmin, fetchDuplicates])

  // Recycle specific photo(s)
  const handleRecyclePhotos = useCallback((photoIds: string[], groupId: string) => {
    if (!photoIds.length) return

    photoRecycle({ photoIds })
      .then(() => {
        toast.success(`${photoIds.length} duplicate item(s) moved to recycle bin.`)
        // Update local state by removing recycled photoIds from groups
        setGroups((prevGroups) =>
          prevGroups
            .map((grp) => {
              if (grp.groupId !== groupId) return grp
              const remainingPhotos = grp.photos.filter((p) => !photoIds.includes(p.photoId))
              return { ...grp, photos: remainingPhotos }
            })
            .filter((grp) => grp.photos.length >= 2)
        )
      })
      .catch((err) => {
        console.error('Failed to recycle photos:', err)
        toast.error('Failed to delete duplicate items.')
      })
  }, [])

  // Ignore/Keep group permanently
  const handleIgnoreGroup = useCallback((groupId: string) => {
    setIgnoredGroupIds((prev) => {
      const next = new Set(prev).add(groupId)
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(next)))
      } catch (err) {
        console.error('Failed to persist ignored duplicate group:', err)
      }
      return next
    })
    toast.info('Grup duplikat disimpan & diabaikan. Tidak akan muncul lagi.')
  }, [])

  // Restore all ignored groups
  const handleRestoreIgnored = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {}
    setIgnoredGroupIds(new Set())
    toast.success('Semua grup duplikat yang diabaikan telah dipulihkan.')
  }, [])

  // 1-Click Clean All Duplicates across all groups
  const handleRecycleAllDuplicates = useCallback(() => {
    const activeGrps = groups.filter((grp) => !ignoredGroupIds.has(grp.groupId) && grp.photos.length >= 2)
    const allDuplicateIds: string[] = []

    for (const grp of activeGrps) {
      const dupIds = grp.photos.slice(1).map((p) => p.photoId)
      allDuplicateIds.push(...dupIds)
    }

    if (!allDuplicateIds.length) {
      toast.info('No duplicate items to delete.')
      return
    }

    photoRecycle({ photoIds: allDuplicateIds })
      .then(() => {
        toast.success(`Successfully cleaned ${allDuplicateIds.length} duplicate items!`)
        fetchDuplicates()
      })
      .catch((err) => {
        console.error('Failed to clean all duplicates:', err)
        toast.error('Failed to clean duplicate items.')
      })
  }, [groups, ignoredGroupIds, fetchDuplicates])

  // Open photo in viewer
  const handlePreviewPhoto = useCallback((photo: PhotoVo, groupPhotos: PhotoVo[]) => {
    const idx = groupPhotos.findIndex((p) => p.photoId === photo.photoId)
    setViewerPhotos(groupPhotos)
    setViewerIndex(idx >= 0 ? idx : 0)
    setViewerOpen(true)
  }, [])

  if (!isAdmin) {
    return (
      <SidebarProvider open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <AppSidebar />
        <SidebarInset>
          <div className="flex h-[80vh] flex-col items-center justify-center gap-3 text-center px-4">
            <ShieldAlert className="size-12 text-destructive" />
            <h1 className="text-xl font-semibold">Access Denied</h1>
            <p className="text-sm text-muted-foreground max-w-sm">
              Duplicate media detection is only available for Admin users.
            </p>
            <Button onClick={() => router.push('/photos')}>Back to Gallery</Button>
          </div>
        </SidebarInset>
      </SidebarProvider>
    )
  }

  const activeGroups = groups.filter((grp) => !ignoredGroupIds.has(grp.groupId) && grp.photos.length >= 2)
  const totalDuplicatesCount = activeGroups.reduce((acc, grp) => acc + grp.photos.length, 0)
  const deletableCount = activeGroups.reduce((acc, grp) => acc + (grp.photos.length - 1), 0)

  return (
    <>
      <SidebarProvider open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <AppSidebar />
        <SidebarInset>
          <header className="sticky top-0 z-30 flex h-12 shrink-0 items-center justify-between gap-2 bg-background/95 backdrop-blur-md border-b px-4 transition-[width,height] ease-linear">
            <div className="flex items-center gap-2">
              <SidebarTrigger className="-ml-1" />
              <Separator orientation="vertical" className="mr-2 data-vertical:h-4" />
              <Breadcrumb>
                <BreadcrumbList>
                  <BreadcrumbItem>
                    <BreadcrumbPage className="flex items-center gap-2 font-medium">
                      <CopyCheck className="size-4 text-primary" />
                      <span>Duplicate Media Detection</span>
                    </BreadcrumbPage>
                  </BreadcrumbItem>
                </BreadcrumbList>
              </Breadcrumb>
            </div>
            <div className="flex items-center gap-2">
              {ignoredGroupIds.size > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleRestoreIgnored}
                  className="gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
                  title="Restore hidden/ignored duplicate groups"
                >
                  <Eye className="size-3.5 text-primary" />
                  <span>Restore {ignoredGroupIds.size} Ignored</span>
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={fetchDuplicates}
                disabled={loading}
                className="gap-1.5 text-xs font-medium"
              >
                <RefreshCw className={`size-3.5 ${loading ? 'animate-spin' : ''}`} />
                <span>Rescan</span>
              </Button>
            </div>
          </header>

          <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
            {/* Header info banner */}
            <div className="rounded-xl border bg-card p-5 shadow-2xs">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div>
                  <h1 className="text-lg font-bold flex items-center gap-2">
                    <CopyCheck className="size-5 text-primary" />
                    Visual & File-Based Duplicate Media Detector
                  </h1>
                  <p className="text-xs md:text-sm text-muted-foreground mt-1">
                    Automatically analyzes visual pixel fingerprints (*thumbHash*), file checksums, resolution, and size to detect all duplicate photos and videos without missing any.
                  </p>
                </div>
                {!loading && activeGroups.length > 0 && (
                  <div className="flex flex-wrap items-center gap-3 shrink-0">
                    <div className="flex items-center gap-3 bg-muted/60 px-4 py-2.5 rounded-lg border">
                      <div className="text-center">
                        <div className="text-lg font-bold text-primary">{activeGroups.length}</div>
                        <div className="text-[11px] text-muted-foreground">Duplicate Groups</div>
                      </div>
                      <Separator orientation="vertical" className="h-8" />
                      <div className="text-center">
                        <div className="text-lg font-bold text-foreground">{totalDuplicatesCount}</div>
                        <div className="text-[11px] text-muted-foreground">Total Media</div>
                      </div>
                    </div>

                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      className="gap-1.5 h-10 px-4 text-xs font-semibold shadow-xs"
                      onClick={handleRecycleAllDuplicates}
                    >
                      <Trash2 className="size-4" />
                      <span>Clean {deletableCount} Duplicate Items at Once</span>
                    </Button>
                  </div>
                )}
              </div>
            </div>

            {/* Content area */}
            {loading ? (
              <div className="flex h-64 flex-col items-center justify-center gap-3 text-center">
                <Loader2 className="size-8 animate-spin text-primary" />
                <p className="text-sm font-medium text-muted-foreground">
                  Scanning and analyzing media appearance...
                </p>
              </div>
            ) : activeGroups.length === 0 ? (
              <div className="flex h-64 flex-col items-center justify-center gap-3 text-center border rounded-xl bg-card/40 p-8">
                <CheckCircle2 className="size-12 text-emerald-500" />
                <h2 className="text-base font-semibold">No Duplicate Media Found</h2>
                <p className="text-xs md:text-sm text-muted-foreground max-w-md">
                  {ignoredGroupIds.size > 0
                    ? `All active items have unique visuals (${ignoredGroupIds.size} duplicate group${ignoredGroupIds.size > 1 ? 's' : ''} kept/ignored).`
                    : 'All items in your gallery have unique visuals! No duplicate media detected.'}
                </p>
                {ignoredGroupIds.size > 0 && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleRestoreIgnored}
                    className="gap-1.5 text-xs mt-2"
                  >
                    <Eye className="size-3.5" />
                    <span>Restore {ignoredGroupIds.size} Ignored Group{ignoredGroupIds.size > 1 ? 's' : ''}</span>
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-6">
                {activeGroups.map((group, idx) => {
                  const firstPhoto = group.photos[0]
                  const duplicatePhotoIds = group.photos.slice(1).map((p) => p.photoId)

                  return (
                    <div key={group.groupId} className="rounded-xl border bg-card overflow-hidden shadow-2xs transition hover:border-border">
                      {/* Group Header */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-muted/40 px-4 py-3 border-b">
                        <div className="flex items-center gap-2">
                          <span className="flex size-6 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold">
                            {idx + 1}
                          </span>
                          <div>
                            <div className="text-sm font-bold flex items-center gap-2">
                              <span>Duplicate Group #{idx + 1}</span>
                              <span className="text-[11px] font-normal px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                                {group.similarityType === 'visual' ? 'Visual Match' : 'Identical File'}
                              </span>
                            </div>
                            <div className="text-xs text-muted-foreground">
                              Detected {group.photos.length} items with identical appearance
                            </div>
                          </div>
                        </div>

                        {/* Group Actions */}
                        <div className="flex items-center gap-2 shrink-0">
                          <Button
                            type="button"
                            variant="destructive"
                            size="sm"
                            className="text-xs h-8 gap-1.5"
                            onClick={() => handleRecyclePhotos(duplicatePhotoIds, group.groupId)}
                          >
                            <Trash2 className="size-3.5" />
                            <span>Delete Duplicates (Keep 1 Main)</span>
                          </Button>

                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="text-xs h-8 gap-1 text-muted-foreground hover:text-foreground"
                            onClick={() => handleIgnoreGroup(group.groupId)}
                            title="Ignore this group"
                          >
                            <EyeOff className="size-3.5" />
                            <span>Keep / Ignore</span>
                          </Button>
                        </div>
                      </div>

                      {/* Photo Grid inside Group */}
                      <div className="p-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                        {group.photos.map((photo, pIdx) => (
                          <DuplicatePhotoCardItem
                            key={photo.photoId}
                            photo={photo}
                            pIdx={pIdx}
                            isPrimary={pIdx === 0}
                            allGroupPhotos={group.photos}
                            groupId={group.groupId}
                            onPreview={handlePreviewPhoto}
                            onRecycle={handleRecyclePhotos}
                          />
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </SidebarInset>
      </SidebarProvider>

      {/* Lightbox Viewer for Previewing Duplicate Group Photos */}
      <PhotoViewer
        open={viewerOpen}
        index={viewerIndex}
        photos={viewerPhotos}
        onBack={() => setViewerOpen(false)}
        onBrowserBack={() => setViewerOpen(false)}
        onPhotoDelete={(photoId) => {
          const grp = activeGroups.find((g) => g.photos.some((p) => p.photoId === photoId))
          if (grp) {
            handleRecyclePhotos([photoId], grp.groupId)
          }
        }}
      />
    </>
  )
}

interface DuplicatePhotoCardItemProps {
  photo: PhotoVo
  pIdx: number
  isPrimary: boolean
  allGroupPhotos: PhotoVo[]
  groupId: string
  onPreview: (photo: PhotoVo, photos: PhotoVo[]) => void
  onRecycle: (photoIds: string[], groupId: string) => void
}

function DuplicatePhotoCardItem({
  photo,
  pIdx,
  isPrimary,
  allGroupPhotos,
  groupId,
  onPreview,
  onRecycle,
}: DuplicatePhotoCardItemProps) {
  const initialSrc = photo.thumbnail || photo.preview || photo.key || ""
  const [imgSrc, setImgSrc] = useState(initialSrc)
  const [isLoaded, setIsLoaded] = useState(false)
  const [hasError, setHasError] = useState(false)

  const placeholderUrl = photo.thumbHash ? getThumbHashUrl(photo.thumbHash) : undefined

  return (
    <div
      className={`group relative flex flex-col rounded-lg border overflow-hidden bg-background transition-all ${
        isPrimary ? 'ring-2 ring-primary/40 border-primary/30' : 'hover:border-primary/40'
      }`}
    >
      {/* Primary / Dupe Badge */}
      <div className="absolute top-2 left-2 z-20 pointer-events-none">
        {isPrimary ? (
          <span className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2 py-0.5 text-[10px] font-semibold text-white shadow-xs">
            <Check className="size-3" /> Main Media
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/90 px-2 py-0.5 text-[10px] font-semibold text-white shadow-xs">
            Duplicate #{pIdx}
          </span>
        )}
      </div>

      {/* Photo Thumbnail Container */}
      <div
        className="relative aspect-4/3 w-full bg-neutral-900 cursor-pointer overflow-hidden"
        onClick={() => onPreview(photo, allGroupPhotos)}
        style={{
          backgroundColor: 'rgba(128, 128, 128, 0.08)',
          backgroundImage: !isLoaded && placeholderUrl ? `url("${placeholderUrl}")` : undefined,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      >
        {imgSrc && !hasError ? (
          <img
            src={imgSrc}
            alt={photo.name || 'Media'}
            loading="eager"
            decoding="async"
            onLoad={() => setIsLoaded(true)}
            onError={() => {
              // Progressive fallback cascade: preview -> key -> /media/ proxy
              if (photo.preview && imgSrc !== photo.preview) {
                setImgSrc(photo.preview)
              } else if (photo.key && imgSrc !== photo.key) {
                setImgSrc(photo.key)
              } else if (imgSrc && !imgSrc.includes('/media/')) {
                setImgSrc(toProxyMediaUrl(photo.thumbnail || photo.preview || photo.key))
              } else {
                setHasError(true)
              }
            }}
            className={`absolute inset-0 size-full object-cover transition-all duration-300 group-hover:scale-105 ${
              isLoaded ? 'opacity-100' : 'opacity-0'
            }`}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-muted text-muted-foreground text-xs">
            {placeholderUrl ? (
              <img
                src={placeholderUrl}
                alt=""
                className="absolute inset-0 size-full object-cover"
              />
            ) : (
              <span>No Image Available</span>
            )}
          </div>
        )}

        {/* Hover preview indicator */}
        <div className="absolute inset-0 bg-black/25 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center z-10 pointer-events-none">
          <span className="flex items-center gap-1.5 rounded-full bg-black/75 px-3 py-1 text-xs text-white backdrop-blur-xs font-medium shadow-sm">
            <Eye className="size-3.5" /> Inspect Photo
          </span>
        </div>
      </div>

      {/* Photo Metadata */}
      <div className="p-3 text-xs space-y-1 flex-1 flex flex-col justify-between">
        <div>
          <div className="font-semibold truncate text-foreground" title={photo.name}>
            {photo.name}
          </div>
          <div className="text-[11px] text-muted-foreground mt-0.5">
            {photo.width && photo.height ? `${photo.width}×${photo.height}` : 'Resolution n/a'} • {(photo.size / 1024 / 1024).toFixed(1)}MB
          </div>
          {photo.storageName && (
            <div className="text-[10px] text-muted-foreground/80 truncate mt-0.5">
              Storage: {photo.storageName}
            </div>
          )}
          {photo.albums && photo.albums.length > 0 ? (
            <div
              className="mt-1.5 flex items-center gap-1 text-[10px] text-primary bg-primary/10 px-2 py-0.5 rounded-md font-medium truncate"
              title={photo.albums.map((a) => a.name).join(', ')}
            >
              <FolderIcon className="size-3 shrink-0" />
              <span className="truncate">Album: {photo.albums.map((a) => a.name).join(', ')}</span>
            </div>
          ) : (
            <div className="mt-1.5 inline-flex items-center gap-1 text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded-md font-medium">
              <span>Main Gallery</span>
            </div>
          )}
        </div>

        {/* Action button per photo */}
        <div className="pt-2 border-t mt-2 flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full text-xs h-7 text-destructive hover:bg-destructive/10 hover:text-destructive border-destructive/30"
            onClick={() => onRecycle([photo.photoId], groupId)}
          >
            <Trash2 className="size-3" />
            <span>Delete This Photo</span>
          </Button>
        </div>
      </div>
    </div>
  )
}

