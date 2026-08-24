/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { toast } from 'sonner'
import {
  Archive,
  ArrowUpDown,
  Calendar,
  Camera,
  Check,
  CheckCircle2,
  Clock,
  Compass,
  Download,
  Eye,
  EyeOff,
  FolderOpen,
  FolderPlus,
  Globe,
  Grid,
  Image as ImageIcon,
  Images,
  LayoutGrid,
  List as ListIcon,
  Loader2,
  Lock,
  MapPin,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Shield,
  ShieldAlert,
  SlidersHorizontal,
  Sparkles,
  Table as TableIcon,
  Tag,
  Trash2,
  Unlock,
  X,
  Ban,
} from 'lucide-react'

import { AppSidebar } from '@/components/layout/app-sidebar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { Separator } from '@/components/ui/separator'
import {
  SidebarProvider,
  SidebarInset,
  SidebarTrigger,
} from '@/components/ui/sidebar'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

import { useApp } from '@/app/provider'
import { UserTypeEnum } from '@/server/enums/user-enum'
import { PhotoStatusEnum, PhotoVisibilityEnum } from '@/server/enums/photo-enum'
import { type PhotoVo } from '@/server/entity/vo/photo'
import { photoBatchEdit, photoList, photoRecycle } from '@/request/photo'
import { albumAddPhoto } from '@/request/album'
import { getThumbHashUrl } from '@/lib/thumb-hash'
import { formatPhotoTakenDate, formatRelativeTime } from '@/lib/date'
import { decimalToDms } from '@/lib/geo'
import { useLocale } from 'next-intl'

// Dynamic components
const PhotoViewer = dynamic(
  () => import('@/components/photo/photo-viewer').then((mod) => mod.PhotoViewer),
  { ssr: false }
)

const PhotoBatchEditDialog = dynamic(
  () => import('@/components/photo/photo-batch-edit-dialog').then((mod) => mod.PhotoBatchEditDialog),
  { ssr: false }
)

const AlbumSelectDialog = dynamic(
  () => import('@/components/album/album-select-dialog').then((mod) => mod.AlbumSelectDialog),
  { ssr: false }
)

// Helper: Format file size
function formatFileSize(size: number) {
  if (!size) return '0 B'
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`
  if (size < 1024 * 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`
  return `${(size / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

// Helper: Format date string YYYY-MM-DD
function formatSimpleDate(dateStr?: string | null) {
  if (!dateStr) return '—'
  try {
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return dateStr
    return d.toISOString().slice(0, 10)
  } catch {
    return dateStr
  }
}

export default function AdminPhotosPage() {
  const router = useRouter()
  const locale = useLocale()
  const { userInfo, sidebarOpen, setSidebarOpen } = useApp()
  const isAdmin = userInfo?.type === UserTypeEnum.ADMIN

  // Data state
  const [loading, setLoading] = useState(true)
  const [photos, setPhotos] = useState<PhotoVo[]>([])
  const [totalCount, setTotalCount] = useState<number>(0)

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [debouncedQuery, setDebouncedQuery] = useState<string>('')
  const [visibilityFilter, setVisibilityFilter] = useState<string>('all')
  const [downloadFilter, setDownloadFilter] = useState<string>('all')
  const [locationFilter, setLocationFilter] = useState<string>('all')
  const [sortBy, setSortBy] = useState<'takenTime' | 'createTime' | 'size' | 'name'>('takenTime')
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc')
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table')

  // Selection state
  const [selectedIds, setSelectedIds] = useState<string[]>([])

  // Dialog & Viewer states
  const [viewerOpen, setViewerOpen] = useState(false)
  const [viewerIndex, setViewerIndex] = useState(0)
  const [batchEditDialogOpen, setBatchEditDialogOpen] = useState(false)
  const [batchEditIds, setBatchEditIds] = useState<string[]>([])
  const [albumDialogOpen, setAlbumDialogOpen] = useState(false)
  const [albumTargetIds, setAlbumTargetIds] = useState<string[]>([])

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery.trim())
    }, 300)
    return () => clearTimeout(timer)
  }, [searchQuery])

  // Fetch photos from server with allowAllVisibility=true for full admin inventory
  const fetchPhotos = useCallback(async () => {
    if (!isAdmin) return
    setLoading(true)

    try {
      const res = await photoList({
        size: 500, // Retrieve up to 500 photos for high-density admin management
        allowAllVisibility: true,
        keyword: debouncedQuery || undefined,
        visibility: visibilityFilter !== 'all' ? Number(visibilityFilter) : undefined,
        allowDownload: downloadFilter === 'allowed' ? true : downloadFilter === 'protected' ? false : undefined,
        sortBy,
        sortOrder,
      })

      setPhotos(res?.list || [])
      setTotalCount(res?.total || res?.list?.length || 0)
    } catch (err: any) {
      console.error('Failed to fetch admin photo inventory:', err)
      toast.error('Failed to load photo inventory.')
    } finally {
      setLoading(false)
    }
  }, [isAdmin, debouncedQuery, visibilityFilter, downloadFilter, sortBy, sortOrder])

  useEffect(() => {
    fetchPhotos()
  }, [fetchPhotos])

  // Filter photos by client-side location criteria if needed
  const filteredPhotos = useMemo(() => {
    return photos.filter((photo) => {
      // Location filter
      if (locationFilter === 'tagged') {
        const hasGps = typeof photo.latitude === 'number' && typeof photo.longitude === 'number' && photo.latitude !== 999
        if (!hasGps) return false
      } else if (locationFilter === 'untagged') {
        const isUntagged = (photo.latitude === null || photo.longitude === null) && !photo.isLocationIgnored
        if (!isUntagged) return false
      } else if (locationFilter === 'ignored') {
        if (!photo.isLocationIgnored && photo.latitude !== 999) return false
      }

      return true
    })
  }, [photos, locationFilter])

  // Summary Metrics calculations
  const metrics = useMemo(() => {
    const total = photos.length
    const totalBytes = photos.reduce((acc, p) => acc + (p.size || 0), 0)
    const publicPhotos = photos.filter((p) => p.visibility === PhotoVisibilityEnum.BOTH || p.visibility === PhotoVisibilityEnum.GALLERY_ONLY).length
    const albumOnlyPhotos = photos.filter((p) => p.visibility === PhotoVisibilityEnum.ALBUM_ONLY).length
    const archivedPhotos = photos.filter((p) => p.visibility === PhotoVisibilityEnum.ARCHIVED).length
    const geotaggedPhotos = photos.filter((p) => typeof p.latitude === 'number' && typeof p.longitude === 'number' && p.latitude !== 999).length

    return {
      total,
      totalBytes: formatFileSize(totalBytes),
      publicPhotos,
      albumOnlyPhotos,
      archivedPhotos,
      geotaggedPhotos,
    }
  }, [photos])

  // Selection helpers
  const isAllSelected = filteredPhotos.length > 0 && selectedIds.length === filteredPhotos.length

  const toggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedIds([])
    } else {
      setSelectedIds(filteredPhotos.map((p) => p.photoId))
    }
  }

  const toggleSelect = (photoId: string) => {
    setSelectedIds((prev) =>
      prev.includes(photoId) ? prev.filter((id) => id !== photoId) : [...prev, photoId]
    )
  }

  // Open single/batch photo actions
  const handleOpenViewer = (photo: PhotoVo) => {
    const idx = filteredPhotos.findIndex((p) => p.photoId === photo.photoId)
    if (idx !== -1) {
      setViewerIndex(idx)
      setViewerOpen(true)
    }
  }

  const handleEditSingle = (photo: PhotoVo) => {
    setBatchEditIds([photo.photoId])
    setBatchEditDialogOpen(true)
  }

  const handleEditSelected = () => {
    if (!selectedIds.length) return
    setBatchEditIds(selectedIds)
    setBatchEditDialogOpen(true)
  }

  const handleAddToAlbumSelected = (targetIds: string[]) => {
    setAlbumTargetIds(targetIds)
    setAlbumDialogOpen(true)
  }

  const handleRecycleSingle = async (photo: PhotoVo) => {
    if (!confirm(`Are you sure you want to move "${photo.name}" to the recycle bin?`)) return
    try {
      await photoRecycle({ photoIds: [photo.photoId] })
      setPhotos((prev) => prev.filter((p) => p.photoId !== photo.photoId))
      setSelectedIds((prev) => prev.filter((id) => id !== photo.photoId))
      toast.success(`"${photo.name}" moved to recycle bin.`)
    } catch {
      toast.error('Failed to recycle photo.')
    }
  }

  const handleRecycleSelected = async () => {
    if (!selectedIds.length) return
    if (!confirm(`Are you sure you want to recycle ${selectedIds.length} selected photo(s)?`)) return
    try {
      await photoRecycle({ photoIds: selectedIds })
      setPhotos((prev) => prev.filter((p) => !selectedIds.includes(p.photoId)))
      setSelectedIds([])
      toast.success(`${selectedIds.length} photo(s) moved to recycle bin.`)
    } catch {
      toast.error('Failed to recycle selected photos.')
    }
  }

  const handleBatchVisibility = async (vis: number) => {
    if (!selectedIds.length) return
    try {
      await photoBatchEdit({
        photoIds: selectedIds,
        visibility: vis,
      })
      setPhotos((prev) =>
        prev.map((p) => (selectedIds.includes(p.photoId) ? { ...p, visibility: vis } : p))
      )
      toast.success(`Updated visibility for ${selectedIds.length} photo(s).`)
    } catch {
      toast.error('Failed to update visibility.')
    }
  }

  const handleBatchSuccess = (ids: string[], updates: Partial<PhotoVo>) => {
    setPhotos((prev) =>
      prev.map((p) => (ids.includes(p.photoId) ? { ...p, ...updates } : p))
    )
    fetchPhotos()
  }

  const handleAlbumSuccess = async (albumIds: string[]) => {
    if (!albumTargetIds.length || !albumIds.length) return
    try {
      await albumAddPhoto({ albumIds, photoIds: albumTargetIds })
      toast.success(`Added ${albumTargetIds.length} photo(s) to ${albumIds.length} album(s).`)
      setAlbumDialogOpen(false)
      fetchPhotos()
    } catch {
      toast.error('Failed to add photos to album.')
    }
  }

  if (!isAdmin) {
    return (
      <SidebarProvider defaultOpen={sidebarOpen} open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <AppSidebar />
        <SidebarInset>
          <div className="flex h-screen items-center justify-center p-6 text-center">
            <div className="max-w-md space-y-3">
              <ShieldAlert className="size-12 text-destructive mx-auto" />
              <h2 className="text-xl font-bold">Access Denied</h2>
              <p className="text-sm text-muted-foreground">
                This page is reserved exclusively for System Administrators.
              </p>
            </div>
          </div>
        </SidebarInset>
      </SidebarProvider>
    )
  }

  return (
    <SidebarProvider defaultOpen={sidebarOpen} open={sidebarOpen} onOpenChange={setSidebarOpen}>
      <AppSidebar />
      <SidebarInset className="bg-background min-h-screen flex flex-col">
        {/* Top Navbar Header */}
        <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between gap-2 border-b border-border/80 bg-background/85 px-4 backdrop-blur-md">
          <div className="flex items-center gap-2">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-2 h-4" />
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem className="hidden md:block">
                  <span className="text-xs text-muted-foreground font-medium">System</span>
                </BreadcrumbItem>
                <BreadcrumbSeparator className="hidden md:block" />
                <BreadcrumbItem>
                  <BreadcrumbPage className="flex items-center gap-1.5 font-semibold text-xs text-foreground">
                    <Images className="size-3.5 text-primary" />
                    <span>Photo Management</span>
                  </BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>

          {/* Right Action buttons */}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchPhotos()}
              disabled={loading}
              className="h-8 text-xs rounded-xl gap-1.5 border-border/80"
              title="Refresh photo inventory"
            >
              <RefreshCw className={`size-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Refresh</span>
            </Button>
          </div>
        </header>

        {/* Main Content Area */}
        <div className="flex-1 p-4 md:p-6 space-y-5 max-w-[1600px] w-full mx-auto">
          {/* Summary Metric Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="p-3.5 rounded-2xl bg-card border border-border/80 shadow-2xs space-y-1">
              <div className="flex items-center justify-between text-xs text-muted-foreground font-medium">
                <span>Total Inventory</span>
                <ImageIcon className="size-4 text-primary" />
              </div>
              <p className="text-xl font-bold text-foreground">
                {metrics.total.toLocaleString()}{' '}
                <span className="text-xs font-normal text-muted-foreground">photos</span>
              </p>
              <p className="text-[11px] text-muted-foreground">Storage: {metrics.totalBytes}</p>
            </div>

            <div className="p-3.5 rounded-2xl bg-card border border-border/80 shadow-2xs space-y-1">
              <div className="flex items-center justify-between text-xs text-muted-foreground font-medium">
                <span>Public Gallery</span>
                <Globe className="size-4 text-emerald-500" />
              </div>
              <p className="text-xl font-bold text-foreground">
                {metrics.publicPhotos.toLocaleString()}
              </p>
              <p className="text-[11px] text-emerald-600 dark:text-emerald-400">
                Visible to visitors
              </p>
            </div>

            <div className="p-3.5 rounded-2xl bg-card border border-border/80 shadow-2xs space-y-1">
              <div className="flex items-center justify-between text-xs text-muted-foreground font-medium">
                <span>Albums & Archive</span>
                <Archive className="size-4 text-amber-500" />
              </div>
              <p className="text-xl font-bold text-foreground">
                {metrics.albumOnlyPhotos + metrics.archivedPhotos}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {metrics.albumOnlyPhotos} album-only • {metrics.archivedPhotos} archived
              </p>
            </div>

            <div className="p-3.5 rounded-2xl bg-card border border-border/80 shadow-2xs space-y-1">
              <div className="flex items-center justify-between text-xs text-muted-foreground font-medium">
                <span>GPS Mapped</span>
                <MapPin className="size-4 text-sky-500" />
              </div>
              <p className="text-xl font-bold text-foreground">
                {metrics.geotaggedPhotos.toLocaleString()}
              </p>
              <p className="text-[11px] text-sky-600 dark:text-sky-400">
                Interactive Map ready
              </p>
            </div>
          </div>

          {/* Search, Filter, and View Mode Toolbar */}
          <div className="p-3.5 rounded-2xl bg-card border border-border/80 shadow-2xs space-y-3">
            <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
              {/* Search text input */}
              <div className="relative flex-1 min-w-[260px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Search photos by title, filename (.jpg, .png, .webp), date, or camera..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 pr-8 text-xs h-9 bg-muted/40 rounded-xl"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
                  >
                    <X className="size-3.5" />
                  </button>
                )}
              </div>

              {/* View Switcher & Sort */}
              <div className="flex items-center gap-2">
                <div className="flex items-center rounded-xl bg-muted/40 p-0.5 border border-border/60">
                  <button
                    type="button"
                    onClick={() => setViewMode('table')}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                      viewMode === 'table'
                        ? 'bg-background text-foreground shadow-2xs'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <TableIcon className="size-3.5" />
                    <span>Table</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode('grid')}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                      viewMode === 'grid'
                        ? 'bg-background text-foreground shadow-2xs'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <LayoutGrid className="size-3.5" />
                    <span>Grid</span>
                  </button>
                </div>

                <Select value={sortBy} onValueChange={(val: any) => setSortBy(val)}>
                  <SelectTrigger className="w-36 text-xs h-9 bg-muted/30 rounded-xl">
                    <SelectValue placeholder="Sort by" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="takenTime" className="text-xs">Date Taken</SelectItem>
                    <SelectItem value="createTime" className="text-xs">Upload Date</SelectItem>
                    <SelectItem value="size" className="text-xs">File Size</SelectItem>
                    <SelectItem value="name" className="text-xs">Photo Name</SelectItem>
                  </SelectContent>
                </Select>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSortOrder((prev) => (prev === 'desc' ? 'asc' : 'desc'))}
                  className="h-9 px-2.5 text-xs rounded-xl border-border/80"
                  title={sortOrder === 'desc' ? 'Descending Order' : 'Ascending Order'}
                >
                  <ArrowUpDown className="size-3.5" />
                  <span className="hidden sm:inline uppercase text-[10px] font-bold">
                    {sortOrder}
                  </span>
                </Button>
              </div>
            </div>

            {/* Filter Pills Bar */}
            <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-border/60">
              {/* Visibility Filter */}
              <div className="flex items-center gap-1.5 text-xs">
                <span className="text-muted-foreground font-medium text-[11px]">Visibility:</span>
                <Select value={visibilityFilter} onValueChange={setVisibilityFilter}>
                  <SelectTrigger className="h-7 text-xs bg-muted/20 border-border/70 rounded-lg w-auto min-w-[110px]">
                    <SelectValue placeholder="All Scopes" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all" className="text-xs">All Scopes</SelectItem>
                    <SelectItem value={PhotoVisibilityEnum.BOTH.toString()} className="text-xs">🌐 Both (Public)</SelectItem>
                    <SelectItem value={PhotoVisibilityEnum.GALLERY_ONLY.toString()} className="text-xs">🖼️ Gallery Only</SelectItem>
                    <SelectItem value={PhotoVisibilityEnum.ALBUM_ONLY.toString()} className="text-xs">📁 Album Only</SelectItem>
                    <SelectItem value={PhotoVisibilityEnum.ARCHIVED.toString()} className="text-xs">📦 Archived</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Download Filter */}
              <div className="flex items-center gap-1.5 text-xs">
                <span className="text-muted-foreground font-medium text-[11px]">Download:</span>
                <Select value={downloadFilter} onValueChange={setDownloadFilter}>
                  <SelectTrigger className="h-7 text-xs bg-muted/20 border-border/70 rounded-lg w-auto min-w-[100px]">
                    <SelectValue placeholder="All" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all" className="text-xs">All</SelectItem>
                    <SelectItem value="allowed" className="text-xs">✅ Allowed</SelectItem>
                    <SelectItem value="protected" className="text-xs">🔒 Protected</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Location Filter */}
              <div className="flex items-center gap-1.5 text-xs">
                <span className="text-muted-foreground font-medium text-[11px]">GPS:</span>
                <Select value={locationFilter} onValueChange={setLocationFilter}>
                  <SelectTrigger className="h-7 text-xs bg-muted/20 border-border/70 rounded-lg w-auto min-w-[100px]">
                    <SelectValue placeholder="All" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all" className="text-xs">All</SelectItem>
                    <SelectItem value="tagged" className="text-xs">📍 Geotagged</SelectItem>
                    <SelectItem value="untagged" className="text-xs">⚠️ Untagged</SelectItem>
                    <SelectItem value="ignored" className="text-xs">🚫 Ignored</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Reset filter button if any active */}
              {(visibilityFilter !== 'all' || downloadFilter !== 'all' || locationFilter !== 'all' || searchQuery) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setVisibilityFilter('all')
                    setDownloadFilter('all')
                    setLocationFilter('all')
                    setSearchQuery('')
                  }}
                  className="h-7 px-2 text-[11px] text-muted-foreground hover:text-foreground"
                >
                  Reset Filters
                </Button>
              )}
            </div>
          </div>

          {/* Batch Floating Action Bar */}
          {selectedIds.length > 0 && (
            <div className="sticky top-16 z-20 flex flex-wrap items-center justify-between gap-3 p-3 rounded-2xl bg-primary text-primary-foreground shadow-xl animate-in fade-in slide-in-from-top-2 duration-200">
              <div className="flex items-center gap-2">
                <div className="size-5 rounded-md bg-white/20 flex items-center justify-center font-bold text-xs">
                  {selectedIds.length}
                </div>
                <span className="text-xs font-semibold">
                  Photo{selectedIds.length > 1 ? 's' : ''} Selected
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedIds([])}
                  className="h-7 px-2 text-[11px] text-primary-foreground/80 hover:text-primary-foreground hover:bg-white/10"
                >
                  Deselect All
                </Button>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={handleEditSelected}
                  className="h-8 text-xs rounded-xl gap-1.5 font-semibold bg-white text-neutral-900 hover:bg-white/90 shadow-xs"
                >
                  <Pencil className="size-3.5" />
                  <span>Batch Edit</span>
                </Button>

                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => handleAddToAlbumSelected(selectedIds)}
                  className="h-8 text-xs rounded-xl gap-1.5 font-semibold bg-white text-neutral-900 hover:bg-white/90 shadow-xs"
                >
                  <FolderPlus className="size-3.5" />
                  <span>Add to Album</span>
                </Button>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      className="h-8 text-xs rounded-xl gap-1.5 font-semibold bg-white text-neutral-900 hover:bg-white/90 shadow-xs"
                    >
                      <Eye className="size-3.5" />
                      <span>Set Visibility</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-52">
                    <DropdownMenuLabel className="text-xs font-semibold">Set Visibility Scope</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => handleBatchVisibility(PhotoVisibilityEnum.BOTH)} className="text-xs">
                      🌐 Both Gallery & Albums (Public)
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleBatchVisibility(PhotoVisibilityEnum.GALLERY_ONLY)} className="text-xs">
                      🖼️ Main Gallery Only
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleBatchVisibility(PhotoVisibilityEnum.ALBUM_ONLY)} className="text-xs">
                      📁 Album Only (Hidden from Gallery)
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleBatchVisibility(PhotoVisibilityEnum.ARCHIVED)} className="text-xs text-amber-600">
                      📦 Archive (Hidden Everywhere)
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  onClick={handleRecycleSelected}
                  className="h-8 text-xs rounded-xl gap-1.5 font-semibold bg-rose-600 hover:bg-rose-500 text-white shadow-xs"
                >
                  <Trash2 className="size-3.5" />
                  <span>Recycle</span>
                </Button>
              </div>
            </div>
          )}

          {/* Photo Content: Table View vs Grid View */}
          {loading ? (
            <div className="py-20 flex flex-col items-center justify-center text-center space-y-3">
              <Loader2 className="size-8 animate-spin text-primary" />
              <p className="text-xs text-muted-foreground">Loading photo inventory...</p>
            </div>
          ) : filteredPhotos.length === 0 ? (
            <div className="py-20 flex flex-col items-center justify-center text-center space-y-3 rounded-2xl border border-dashed border-border/80 bg-card/50">
              <div className="p-3 rounded-2xl bg-muted/60 text-muted-foreground">
                <Images className="size-8" />
              </div>
              <div>
                <h4 className="font-bold text-sm text-foreground">No Photos Found</h4>
                <p className="text-xs text-muted-foreground mt-1 max-w-sm">
                  {searchQuery
                    ? `No photos matched your search term "${searchQuery}".`
                    : 'No photos match the selected filter criteria.'}
                </p>
              </div>
            </div>
          ) : viewMode === 'table' ? (
            /* High-Density Informative Table View */
            <div className="rounded-2xl border border-border/80 bg-card overflow-hidden shadow-2xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-muted/40 border-b border-border/80 text-muted-foreground font-semibold">
                    <tr>
                      <th className="py-3 px-3.5 w-10 text-center">
                        <button
                          type="button"
                          onClick={toggleSelectAll}
                          className={`size-4 rounded border flex items-center justify-center transition-colors ${
                            isAllSelected
                              ? 'bg-primary border-primary text-primary-foreground'
                              : 'border-muted-foreground/40 bg-background'
                          }`}
                        >
                          {isAllSelected && <Check className="size-3 stroke-[3]" />}
                        </button>
                      </th>
                      <th className="py-3 px-3 min-w-[220px]">Photo & Name</th>
                      <th className="py-3 px-3">Visibility Scope</th>
                      <th className="py-3 px-3">Public Download</th>
                      <th className="py-3 px-3">Albums</th>
                      <th className="py-3 px-3">Date Taken</th>
                      <th className="py-3 px-3">GPS Location</th>
                      <th className="py-3 px-3">Storage</th>
                      <th className="py-3 px-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {filteredPhotos.map((photo) => {
                      const isSelected = selectedIds.includes(photo.photoId)
                      const imgUrl = photo.thumbnail || photo.preview || ''
                      const thumbHashUrl = getThumbHashUrl(photo.thumbHash)

                      return (
                        <tr
                          key={photo.photoId}
                          className={`group hover:bg-muted/30 transition-colors ${
                            isSelected ? 'bg-primary/5' : ''
                          }`}
                        >
                          {/* Selection Checkbox */}
                          <td className="py-2.5 px-3.5 text-center">
                            <button
                              type="button"
                              onClick={() => toggleSelect(photo.photoId)}
                              className={`size-4 rounded border flex items-center justify-center transition-colors ${
                                isSelected
                                  ? 'bg-primary border-primary text-primary-foreground'
                                  : 'border-muted-foreground/40 bg-background group-hover:border-primary/60'
                              }`}
                            >
                              {isSelected && <Check className="size-3 stroke-[3]" />}
                            </button>
                          </td>

                          {/* Thumbnail & Photo Details */}
                          <td className="py-2.5 px-3">
                            <div className="flex items-center gap-3 min-w-0">
                              <div
                                onClick={() => handleOpenViewer(photo)}
                                className="relative size-11 rounded-xl overflow-hidden bg-neutral-950 shrink-0 border border-border/60 cursor-pointer group-hover:ring-2 group-hover:ring-primary/40 transition-all"
                              >
                                {thumbHashUrl && (
                                  <img
                                    src={thumbHashUrl}
                                    alt=""
                                    className="absolute inset-0 size-full object-cover blur-xs scale-110"
                                    aria-hidden
                                  />
                                )}
                                {imgUrl ? (
                                  <img
                                    src={imgUrl}
                                    alt={photo.name}
                                    loading="lazy"
                                    decoding="async"
                                    className="absolute inset-0 size-full object-cover group-hover:scale-105 transition-transform"
                                  />
                                ) : (
                                  <div className="size-full flex items-center justify-center text-muted-foreground">
                                    <ImageIcon className="size-4" />
                                  </div>
                                )}
                              </div>

                              <div className="min-w-0 space-y-0.5">
                                <p
                                  onClick={() => handleOpenViewer(photo)}
                                  className="font-semibold text-xs text-foreground truncate cursor-pointer hover:text-primary transition-colors max-w-[200px]"
                                  title={photo.name}
                                >
                                  {photo.name}
                                </p>
                                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground font-mono">
                                  <span className="uppercase px-1 rounded bg-muted/60 font-bold">
                                    {photo.typeDesc || 'IMG'}
                                  </span>
                                  <span>{formatFileSize(photo.size)}</span>
                                  {photo.width && photo.height && (
                                    <span>• {photo.width}×{photo.height}</span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </td>

                          {/* Visibility Badge */}
                          <td className="py-2.5 px-3">
                            {photo.visibility === PhotoVisibilityEnum.BOTH && (
                              <Badge variant="outline" className="text-[10px] px-2 py-0.5 rounded-md border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-medium">
                                🌐 Both (Public)
                              </Badge>
                            )}
                            {photo.visibility === PhotoVisibilityEnum.GALLERY_ONLY && (
                              <Badge variant="outline" className="text-[10px] px-2 py-0.5 rounded-md border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400 font-medium">
                                🖼️ Gallery Only
                              </Badge>
                            )}
                            {photo.visibility === PhotoVisibilityEnum.ALBUM_ONLY && (
                              <Badge variant="outline" className="text-[10px] px-2 py-0.5 rounded-md border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400 font-medium">
                                📁 Album Only
                              </Badge>
                            )}
                            {photo.visibility === PhotoVisibilityEnum.ARCHIVED && (
                              <Badge variant="outline" className="text-[10px] px-2 py-0.5 rounded-md border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400 font-medium">
                                📦 Archived
                              </Badge>
                            )}
                          </td>

                          {/* Download Permission Badge */}
                          <td className="py-2.5 px-3">
                            {photo.allowDownload === 1 ? (
                              <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                                <Unlock className="size-3 text-emerald-500" />
                                <span>Allowed</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                                <Lock className="size-3 text-muted-foreground" />
                                <span>Protected</span>
                              </span>
                            )}
                          </td>

                          {/* Albums Tag List */}
                          <td className="py-2.5 px-3">
                            {photo.albums && photo.albums.length > 0 ? (
                              <div className="flex flex-wrap gap-1 max-w-[150px]">
                                {photo.albums.map((alb) => (
                                  <Badge
                                    key={alb.albumId}
                                    variant="secondary"
                                    className="text-[10px] px-1.5 py-0 rounded bg-muted/60 font-normal truncate max-w-[120px]"
                                    title={alb.name}
                                  >
                                    📁 {alb.name}
                                  </Badge>
                                ))}
                              </div>
                            ) : (
                              <span className="text-[11px] text-muted-foreground/60">—</span>
                            )}
                          </td>

                          {/* Date Taken */}
                          <td className="py-2.5 px-3">
                            {photo.takenTime ? (
                              <div className="space-y-0.5 text-xs text-foreground">
                                <p className="font-medium">{formatSimpleDate(photo.takenTime)}</p>
                                <p className="text-[10px] text-muted-foreground">{formatRelativeTime(photo.takenTime, locale)}</p>
                              </div>
                            ) : (
                              <span className="text-[11px] text-muted-foreground/60">—</span>
                            )}
                          </td>

                          {/* GPS Coordinates */}
                          <td className="py-2.5 px-3">
                            {photo.isLocationIgnored || photo.latitude === 999 ? (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0.5 rounded-md border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400">
                                🚫 Ignored
                              </Badge>
                            ) : typeof photo.latitude === 'number' && typeof photo.longitude === 'number' ? (
                              <span
                                className="inline-flex items-center gap-1 text-[10px] font-mono text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20 max-w-[140px] truncate"
                                title={`${photo.latitude}, ${photo.longitude}`}
                              >
                                <MapPin className="size-3 text-emerald-500 shrink-0" />
                                <span className="truncate">{decimalToDms(photo.latitude, photo.longitude)}</span>
                              </span>
                            ) : (
                              <span className="text-[11px] text-muted-foreground/60">—</span>
                            )}
                          </td>

                          {/* Storage Provider */}
                          <td className="py-2.5 px-3">
                            <span className="text-[11px] text-muted-foreground font-medium">
                              {photo.storageName || photo.storageTypeDesc || 'Cloudflare R2'}
                            </span>
                          </td>

                          {/* Row Action Buttons */}
                          <td className="py-2.5 px-3 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => handleEditSingle(photo)}
                                className="size-7 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted"
                                title="Edit Metadata"
                              >
                                <Pencil className="size-3.5" />
                              </Button>

                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => handleAddToAlbumSelected([photo.photoId])}
                                className="size-7 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted"
                                title="Add to Album"
                              >
                                <FolderPlus className="size-3.5" />
                              </Button>

                              {photo.key && (
                                <a
                                  href={photo.key}
                                  download={photo.name}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center justify-center size-7 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted"
                                  title="Download Original"
                                >
                                  <Download className="size-3.5" />
                                </a>
                              )}

                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => handleRecycleSingle(photo)}
                                className="size-7 rounded-lg text-muted-foreground hover:text-rose-500 hover:bg-rose-500/10"
                                title="Move to Recycle Bin"
                              >
                                <Trash2 className="size-3.5" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            /* Visual Grid Cards View */
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
              {filteredPhotos.map((photo) => {
                const isSelected = selectedIds.includes(photo.photoId)
                const imgUrl = photo.thumbnail || photo.preview || ''
                const thumbHashUrl = getThumbHashUrl(photo.thumbHash)

                return (
                  <div
                    key={photo.photoId}
                    className={`group relative rounded-2xl overflow-hidden border bg-card transition-all duration-200 shadow-2xs hover:shadow-md ${
                      isSelected
                        ? 'border-primary ring-2 ring-primary/30'
                        : 'border-border/80 hover:border-primary/50'
                    }`}
                  >
                    {/* Photo Visual Box */}
                    <div
                      onClick={() => handleOpenViewer(photo)}
                      className="relative aspect-square bg-neutral-950 overflow-hidden cursor-pointer"
                    >
                      {thumbHashUrl && (
                        <img
                          src={thumbHashUrl}
                          alt=""
                          className="absolute inset-0 size-full object-cover blur-xs scale-110"
                          aria-hidden
                        />
                      )}
                      {imgUrl ? (
                        <img
                          src={imgUrl}
                          alt={photo.name}
                          loading="lazy"
                          decoding="async"
                          className="absolute inset-0 size-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                      ) : (
                        <div className="size-full flex items-center justify-center text-muted-foreground">
                          <ImageIcon className="size-6" />
                        </div>
                      )}

                      {/* Top Badges Overlay */}
                      <div className="absolute top-2 left-2 right-2 flex items-center justify-between pointer-events-none">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            toggleSelect(photo.photoId)
                          }}
                          className={`size-5 rounded-md border flex items-center justify-center transition-colors pointer-events-auto shadow-xs ${
                            isSelected
                              ? 'bg-primary border-primary text-primary-foreground'
                              : 'border-white/80 bg-black/40 text-transparent hover:border-white'
                          }`}
                        >
                          <Check className="size-3 stroke-[3]" />
                        </button>

                        <div className="flex items-center gap-1">
                          {photo.visibility === PhotoVisibilityEnum.ARCHIVED && (
                            <span className="px-1.5 py-0.5 rounded-md bg-black/70 text-rose-400 font-bold text-[9px] backdrop-blur-xs border border-rose-500/30">
                              📦 Archive
                            </span>
                          )}
                          {photo.visibility === PhotoVisibilityEnum.ALBUM_ONLY && (
                            <span className="px-1.5 py-0.5 rounded-md bg-black/70 text-amber-400 font-bold text-[9px] backdrop-blur-xs border border-amber-500/30">
                              📁 Album
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Card Info Footer */}
                    <div className="p-2.5 space-y-1">
                      <p className="font-semibold text-xs text-foreground truncate" title={photo.name}>
                        {photo.name}
                      </p>
                      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                        <span>{formatFileSize(photo.size)}</span>
                        {photo.takenTime ? (
                          <span>{formatSimpleDate(photo.takenTime)}</span>
                        ) : (
                          <span className="uppercase">{photo.typeDesc || 'IMG'}</span>
                        )}
                      </div>

                      {/* Action quick buttons */}
                      <div className="pt-1.5 flex items-center justify-end gap-1 border-t border-border/50">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEditSingle(photo)}
                          className="size-6 rounded-md text-muted-foreground hover:text-foreground"
                          title="Edit"
                        >
                          <Pencil className="size-3" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => handleRecycleSingle(photo)}
                          className="size-6 rounded-md text-muted-foreground hover:text-rose-500"
                          title="Recycle"
                        >
                          <Trash2 className="size-3" />
                        </Button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </SidebarInset>

      {/* Lightbox Photo Viewer */}
      {viewerOpen && (
        <PhotoViewer
          open={viewerOpen}
          photos={filteredPhotos}
          index={viewerIndex}
          onBack={() => setViewerOpen(false)}
          onPhotoDelete={(photoId: string) => {
            setPhotos((prev) => prev.filter((p) => p.photoId !== photoId))
            setSelectedIds((prev) => prev.filter((id) => id !== photoId))
          }}
          onPhotoUpdate={(updated: PhotoVo) => {
            setPhotos((prev) =>
              prev.map((p) => (p.photoId === updated.photoId ? { ...p, ...updated } : p))
            )
          }}
        />
      )}

      {/* Batch Metadata Edit Dialog */}
      {batchEditDialogOpen && (
        <PhotoBatchEditDialog
          open={batchEditDialogOpen}
          onOpenChange={(next) => {
            setBatchEditDialogOpen(next)
            if (!next) setBatchEditIds([])
          }}
          photoIds={batchEditIds}
          initialName={batchEditIds.length === 1 ? photos.find((p) => p.photoId === batchEditIds[0])?.name : undefined}
          onSuccess={handleBatchSuccess}
        />
      )}

      {/* Add to Album Dialog */}
      {albumDialogOpen && (
        <AlbumSelectDialog
          open={albumDialogOpen}
          onOpenChange={setAlbumDialogOpen}
          onAlbumSelect={handleAlbumSuccess}
        />
      )}
    </SidebarProvider>
  )
}
