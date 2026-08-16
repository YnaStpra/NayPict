'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
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
import { AppSidebar } from '@/components/layout/app-sidebar'
import { Button } from '@/components/ui/button'
import { useApp } from '@/app/provider'
import { UserTypeEnum } from '@/server/enums/user-enum'
import { commentAdminList, commentDelete, commentDeleteReply, commentReply } from '@/request/comment'
import { type CommentAdminVo } from '@/server/entity/vo/comment'
import { type PhotoVo } from '@/server/entity/vo/photo'
import {
  CornerDownRight,
  Loader2,
  MessageSquare,
  MessageSquareReply,
  Pencil,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  X,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { toast } from 'sonner'
import { useLocale } from 'next-intl'
import { getThumbHashUrl } from '@/lib/thumb-hash'

const PhotoViewer = dynamic(
  () => import('@/components/photo/photo-viewer').then((mod) => mod.PhotoViewer),
  { ssr: false }
)

// Format relative date-time nicely
function formatCommentTime(dateStr: string, locale = 'en'): string {
  const date = new Date(dateStr)
  if (Number.isNaN(date.getTime())) return dateStr

  const now = Date.now()
  const diffSec = Math.floor((now - date.getTime()) / 1000)
  if (diffSec < 45) return locale === 'zh' ? '刚刚' : 'Just now'
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return locale === 'zh' ? `${diffMin}分钟前` : `${diffMin}m ago`
  const diffHour = Math.floor(diffMin / 60)
  if (diffHour < 24) return locale === 'zh' ? `${diffHour}小时前` : `${diffHour}h ago`
  const diffDay = Math.floor(diffHour / 24)
  if (diffDay < 7) return locale === 'zh' ? `${diffDay}天前` : `${diffDay}d ago`

  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

export default function CommentsManagementPage() {
  const router = useRouter()
  const locale = useLocale()
  const { userInfo, sidebarOpen, setSidebarOpen } = useApp()
  const isAdmin = userInfo?.type === UserTypeEnum.ADMIN

  const [loading, setLoading] = useState(false)
  const [isInitialized, setIsInitialized] = useState(false)
  const [comments, setComments] = useState<CommentAdminVo[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize] = useState(15)

  // Filters
  const [keyword, setKeyword] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'unreplied' | 'replied'>('all')

  // Reply editing state (commentId -> current text)
  const [replyingCommentId, setReplyingCommentId] = useState<string | null>(null)
  const [replyText, setReplyText] = useState('')
  const [submittingReply, setSubmittingReply] = useState(false)
  const [deletingCommentId, setDeletingCommentId] = useState<string | null>(null)

  // Photo viewer modal state
  const [viewerOpen, setViewerOpen] = useState(false)
  const [viewerPhotos, setViewerPhotos] = useState<PhotoVo[]>([])
  const [viewerIndex, setViewerIndex] = useState(0)

  // Fetch comments on mount and filter changes
  useEffect(() => {
    let isMounted = true
    if (!isAdmin) {
      return
    }

    commentAdminList({
      page,
      size: pageSize,
      keyword: searchQuery.trim() || undefined,
      status: statusFilter,
    })
      .then((res) => {
        if (isMounted) {
          setComments(res?.list || [])
          setTotal(res?.total || 0)
        }
      })
      .catch((err) => {
        if (isMounted) {
          console.error('Failed to load comments for admin:', err)
          toast.error('Failed to load comments.')
        }
      })
      .finally(() => {
        if (isMounted) {
          setLoading(false)
          setIsInitialized(true)
        }
      })

    return () => {
      isMounted = false
    }
  }, [isAdmin, page, pageSize, searchQuery, statusFilter])

  // Manual refresh handler
  const handleRefresh = () => {
    setLoading(true)
    commentAdminList({
      page,
      size: pageSize,
      keyword: searchQuery.trim() || undefined,
      status: statusFilter,
    })
      .then((res) => {
        setComments(res?.list || [])
        setTotal(res?.total || 0)
      })
      .catch((err) => {
        console.error('Failed to refresh comments:', err)
        toast.error('Failed to refresh comments.')
      })
      .finally(() => {
        setLoading(false)
      })
  }

  // Handle Search submit
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setPage(1)
    setSearchQuery(keyword)
  }

  // Handle delete comment
  const handleDeleteComment = async (commentId: string) => {
    if (!isAdmin || deletingCommentId) return
    if (!window.confirm(locale === 'zh' ? '确定要删除这条评论吗？' : 'Are you sure you want to delete this comment?')) {
      return
    }

    setDeletingCommentId(commentId)
    try {
      await commentDelete({ commentId })
      setComments((prev) => prev.filter((item) => item.commentId !== commentId))
      setTotal((prev) => Math.max(0, prev - 1))
      toast.success(locale === 'zh' ? '评论已删除' : 'Comment deleted successfully')
    } catch {
      // Handled by request wrapper
    } finally {
      setDeletingCommentId(null)
    }
  }

  // Open reply box for a specific comment
  const handleOpenReplyBox = (item: CommentAdminVo) => {
    setReplyingCommentId(item.commentId)
    setReplyText(item.replyContent || '')
  }

  // Cancel replying
  const handleCancelReply = () => {
    setReplyingCommentId(null)
    setReplyText('')
  }

  // Submit Admin Reply
  const handleSubmitReply = async (commentId: string) => {
    const trimmed = replyText.trim()
    if (!trimmed) {
      toast.error(locale === 'zh' ? '回复内容不能为空' : 'Reply content cannot be empty')
      return
    }

    setSubmittingReply(true)
    try {
      const updated = await commentReply({
        commentId,
        replyContent: trimmed,
      })

      setComments((prev) =>
        prev.map((item) =>
          item.commentId === commentId
            ? { ...item, replyContent: updated.replyContent, replyTime: updated.replyTime }
            : item
        )
      )
      toast.success(locale === 'zh' ? '已回复评论' : 'Reply posted successfully')
      setReplyingCommentId(null)
      setReplyText('')
    } catch {
      // Handled by request wrapper
    } finally {
      setSubmittingReply(false)
    }
  }

  // Delete Admin Reply
  const handleDeleteReply = async (commentId: string) => {
    if (!window.confirm(locale === 'zh' ? '确定要删除此回复吗？' : 'Are you sure you want to remove this reply?')) {
      return
    }

    try {
      await commentDeleteReply({ commentId })
      setComments((prev) =>
        prev.map((item) =>
          item.commentId === commentId
            ? { ...item, replyContent: null, replyTime: null }
            : item
        )
      )
      toast.success(locale === 'zh' ? '回复已删除' : 'Reply removed')
    } catch {
      // Handled by request wrapper
    }
  }

  // Open photo in viewer modal
  const handlePreviewPhoto = (item: CommentAdminVo) => {
    const mockPhoto: PhotoVo = {
      photoId: item.photoId,
      name: item.photoName || 'Photo',
      thumbHash: item.thumbHash ?? null,
      checksum: null,
      type: 'image/jpeg',
      typeDesc: item.typeDesc || 'jpg',
      size: 0,
      width: 1920,
      height: 1080,
      takenTime: item.createTime,
      createTime: item.createTime,
      recycleTime: null,
      userId: '',
      status: 0,
      favorite: 0,
      storageId: null,
      allowDownload: 1,
      key: '',
      preview: `/api/photo/preview/${item.photoId}`,
      thumbnail: `/api/photo/preview/${item.photoId}`,
      exif: null,
      latitude: null,
      longitude: null,
      altitude: null,
      storageName: null,
      storageTypeDesc: null,
    }
    setViewerPhotos([mockPhoto])
    setViewerIndex(0)
    setViewerOpen(true)
  }

  const totalPages = Math.ceil(total / pageSize)
  const isPageLoading = loading || (!isInitialized && isAdmin)

  if (!isAdmin) {
    return (
      <SidebarProvider open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <AppSidebar />
        <SidebarInset>
          <div className="flex h-screen flex-col items-center justify-center p-6 text-center">
            <ShieldAlert className="size-12 text-destructive mb-3" />
            <h2 className="text-xl font-bold">Access Restricted</h2>
            <p className="text-sm text-muted-foreground mt-1 mb-4">
              You must be logged in as an Administrator to manage comments.
            </p>
            <Button onClick={() => router.push('/photos')}>Go to Photos</Button>
          </div>
        </SidebarInset>
      </SidebarProvider>
    )
  }

  return (
    <>
      <SidebarProvider open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <AppSidebar />
        <SidebarInset>
          {/* Top Bar Header */}
          <header className="flex h-12 shrink-0 items-center justify-between gap-2 border-b bg-background px-4">
            <div className="flex min-w-0 items-center gap-2">
              <SidebarTrigger className="-ml-1" />
              <Separator orientation="vertical" className="mr-2 data-vertical:h-4" />
              <Breadcrumb>
                <BreadcrumbList>
                  <BreadcrumbItem>
                    <BreadcrumbPage className="flex items-center gap-1.5 font-semibold">
                      <MessageSquare className="size-4 text-primary" />
                      <span>{locale === 'zh' ? '评论管理' : 'Comments Management'}</span>
                    </BreadcrumbPage>
                  </BreadcrumbItem>
                </BreadcrumbList>
              </Breadcrumb>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-xs h-8"
                onClick={handleRefresh}
                disabled={loading}
              >
                <RefreshCw className={`size-3.5 ${loading ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">{locale === 'zh' ? '刷新' : 'Refresh'}</span>
              </Button>
            </div>
          </header>

          {/* Main Dashboard Content */}
          <div className="flex-1 space-y-4 p-4 md:p-6 max-w-7xl mx-auto w-full">
            {/* Filter & Search Bar */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-muted/40 p-3 rounded-xl border">
              {/* Status Filter Tabs */}
              <div className="flex items-center p-1 rounded-lg bg-background border text-xs font-medium">
                <button
                  type="button"
                  onClick={() => {
                    setStatusFilter('all')
                    setPage(1)
                  }}
                  className={`px-3 py-1.5 rounded-md transition-colors cursor-pointer ${
                    statusFilter === 'all'
                      ? 'bg-primary text-primary-foreground font-semibold shadow-xs'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {locale === 'zh' ? '全部' : 'All'} ({total})
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setStatusFilter('unreplied')
                    setPage(1)
                  }}
                  className={`px-3 py-1.5 rounded-md transition-colors cursor-pointer ${
                    statusFilter === 'unreplied'
                      ? 'bg-primary text-primary-foreground font-semibold shadow-xs'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {locale === 'zh' ? '待回复' : 'Unreplied'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setStatusFilter('replied')
                    setPage(1)
                  }}
                  className={`px-3 py-1.5 rounded-md transition-colors cursor-pointer ${
                    statusFilter === 'replied'
                      ? 'bg-primary text-primary-foreground font-semibold shadow-xs'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {locale === 'zh' ? '已回复' : 'Replied'}
                </button>
              </div>

              {/* Search Form */}
              <form onSubmit={handleSearch} className="flex items-center gap-2 flex-1 sm:max-w-xs">
                <div className="relative w-full">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                  <input
                    type="text"
                    value={keyword}
                    onChange={(e) => setKeyword(e.target.value)}
                    placeholder={locale === 'zh' ? '搜索姓名、评论或照片...' : 'Search comment, name, photo...'}
                    className="w-full h-8 pl-8 pr-7 text-xs rounded-lg border bg-background placeholder:text-muted-foreground focus:outline-hidden focus:ring-1 focus:ring-primary"
                  />
                  {keyword && (
                    <button
                      type="button"
                      onClick={() => {
                        setKeyword('')
                        setSearchQuery('')
                        setPage(1)
                      }}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      <X className="size-3" />
                    </button>
                  )}
                </div>
                <Button type="submit" size="sm" variant="secondary" className="h-8 text-xs px-3">
                  {locale === 'zh' ? '搜索' : 'Search'}
                </Button>
              </form>
            </div>

            {/* Comments List */}
            {isPageLoading ? (
              <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
                <Loader2 className="size-8 animate-spin text-primary" />
                <span className="text-sm font-medium">
                  {locale === 'zh' ? '正在加载评论列表...' : 'Loading comments...'}
                </span>
              </div>
            ) : comments.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24 text-center border rounded-2xl bg-muted/20 p-6">
                <div className="size-16 rounded-full bg-primary/10 flex items-center justify-center text-primary mb-3">
                  <MessageSquare className="size-8 stroke-1" />
                </div>
                <h3 className="text-base font-semibold">
                  {searchQuery || statusFilter !== 'all'
                    ? locale === 'zh' ? '未找到符合条件的评论' : 'No comments found'
                    : locale === 'zh' ? '暂无任何照片评论' : 'No comments yet'}
                </h3>
                <p className="text-xs text-muted-foreground mt-1 max-w-sm">
                  {searchQuery || statusFilter !== 'all'
                    ? locale === 'zh' ? '尝试调整搜索词或重置筛选条件。' : 'Try clearing your search keyword or changing status filters.'
                    : locale === 'zh' ? '当访客在照片页面留下评论时，会显示在此处。' : 'When visitors leave comments on photos, they will appear here.'}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {comments.map((item) => (
                  <div
                    key={item.commentId}
                    className="flex flex-col sm:flex-row items-start gap-4 p-4 rounded-xl border bg-card hover:bg-muted/10 transition-colors shadow-xs"
                  >
                    {/* Photo Thumbnail */}
                    <div
                      onClick={() => handlePreviewPhoto(item)}
                      className="group relative size-20 sm:size-24 rounded-lg overflow-hidden shrink-0 bg-muted border cursor-pointer flex items-center justify-center"
                      title="Click to view photo"
                      style={
                        item.thumbHash
                          ? {
                              backgroundImage: `url(${getThumbHashUrl(item.thumbHash)})`,
                              backgroundSize: 'cover',
                              backgroundPosition: 'center',
                            }
                          : undefined
                      }
                    >
                      <img
                        src={`/api/photo/preview/${item.photoId}`}
                        alt={item.photoName || 'Photo'}
                        className="size-full object-cover group-hover:scale-105 transition-transform duration-300"
                        loading="lazy"
                        onError={(e) => {
                          e.currentTarget.style.opacity = '0'
                        }}
                      />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                        <ExternalLink className="size-4" />
                      </div>
                    </div>

                    {/* Main Content Area */}
                    <div className="flex-1 min-w-0 space-y-2 w-full">
                      {/* Top Header: Commenter & Photo Info */}
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <div className="size-7 rounded-full bg-primary/10 text-primary font-semibold flex items-center justify-center text-xs">
                            {item.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <span className="font-semibold text-sm text-foreground">
                              {item.name}
                            </span>
                            <span className="text-xs text-muted-foreground ml-2">
                              {formatCommentTime(item.createTime, locale)}
                            </span>
                          </div>
                        </div>

                        {/* Photo Name pill */}
                        {item.photoName && (
                          <button
                            type="button"
                            onClick={() => handlePreviewPhoto(item)}
                            className="text-[11px] font-medium text-muted-foreground hover:text-primary transition-colors truncate max-w-[200px] border px-2 py-0.5 rounded-md bg-muted/40 cursor-pointer"
                          >
                            📷 {item.photoName}
                          </button>
                        )}
                      </div>

                      {/* Comment Body */}
                      <p className="text-xs text-foreground/90 leading-relaxed whitespace-pre-wrap break-words bg-muted/30 p-2.5 rounded-lg border">
                        {item.content}
                      </p>

                      {/* Admin Reply Display or Form */}
                      {item.replyContent && replyingCommentId !== item.commentId && (
                        <div className="relative mt-2 ml-2 pl-3 border-l-2 border-primary/40 bg-primary/5 p-2.5 rounded-r-lg space-y-1">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5 text-xs font-semibold text-primary">
                              <ShieldCheck className="size-3.5" />
                              <span>{locale === 'zh' ? '管理员回复' : 'Reply by Admin'}</span>
                              {item.replyTime && (
                                <span className="text-[10px] font-normal text-muted-foreground ml-1">
                                  ({formatCommentTime(item.replyTime, locale)})
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-6 text-muted-foreground hover:text-primary rounded"
                                onClick={() => handleOpenReplyBox(item)}
                                title={locale === 'zh' ? '编辑回复' : 'Edit reply'}
                              >
                                <Pencil className="size-3" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-6 text-muted-foreground hover:text-destructive rounded"
                                onClick={() => handleDeleteReply(item.commentId)}
                                title={locale === 'zh' ? '删除回复' : 'Delete reply'}
                              >
                                <Trash2 className="size-3" />
                              </Button>
                            </div>
                          </div>
                          <p className="text-xs text-foreground/90 whitespace-pre-wrap break-words">
                            {item.replyContent}
                          </p>
                        </div>
                      )}

                      {/* Inline Reply Box when replying */}
                      {replyingCommentId === item.commentId && (
                        <div className="mt-2 ml-2 pl-3 border-l-2 border-primary bg-muted/40 p-3 rounded-r-lg space-y-2">
                          <div className="flex items-center gap-1.5 text-xs font-semibold text-primary">
                            <MessageSquareReply className="size-3.5" />
                            <span>
                              {item.replyContent
                                ? locale === 'zh' ? '修改管理员回复' : 'Edit Admin Reply'
                                : locale === 'zh' ? '回复此评论' : 'Reply to Comment'}
                            </span>
                          </div>
                          <textarea
                            value={replyText}
                            onChange={(e) => setReplyText(e.target.value)}
                            placeholder={locale === 'zh' ? '写下您的管理员回复...' : 'Write your admin reply...'}
                            maxLength={500}
                            rows={2}
                            disabled={submittingReply}
                            className="w-full text-xs p-2 rounded-md border bg-background resize-none focus:outline-hidden focus:ring-1 focus:ring-primary"
                          />
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs px-2.5"
                              disabled={submittingReply}
                              onClick={handleCancelReply}
                            >
                              {locale === 'zh' ? '取消' : 'Cancel'}
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              className="h-7 text-xs px-3 gap-1"
                              disabled={submittingReply || !replyText.trim()}
                              onClick={() => handleSubmitReply(item.commentId)}
                            >
                              {submittingReply ? (
                                <Loader2 className="size-3 animate-spin" />
                              ) : (
                                <CornerDownRight className="size-3" />
                              )}
                              <span>{locale === 'zh' ? '发布回复' : 'Post Reply'}</span>
                            </Button>
                          </div>
                        </div>
                      )}

                      {/* Action Bar */}
                      {replyingCommentId !== item.commentId && (
                        <div className="flex items-center justify-between pt-1 border-t border-muted/60">
                          <div>
                            {!item.replyContent && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs gap-1 text-primary hover:text-primary hover:bg-primary/10 border-primary/20"
                                onClick={() => handleOpenReplyBox(item)}
                              >
                                <MessageSquareReply className="size-3" />
                                <span>{locale === 'zh' ? '回复' : 'Reply'}</span>
                              </Button>
                            )}
                          </div>

                          <div className="flex items-center gap-1.5">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs text-destructive hover:text-destructive hover:bg-destructive/10 gap-1"
                              disabled={deletingCommentId === item.commentId}
                              onClick={() => handleDeleteComment(item.commentId)}
                            >
                              {deletingCommentId === item.commentId ? (
                                <Loader2 className="size-3 animate-spin" />
                              ) : (
                                <Trash2 className="size-3" />
                              )}
                              <span>{locale === 'zh' ? '删除评论' : 'Delete'}</span>
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Pagination Controls */}
            {!loading && totalPages > 1 && (
              <div className="flex items-center justify-between border-t pt-4 text-xs text-muted-foreground">
                <span>
                  {locale === 'zh'
                    ? `第 ${page} / ${totalPages} 页 (共 ${total} 条)`
                    : `Page ${page} of ${totalPages} (${total} total)`}
                </span>
                <div className="flex items-center gap-1.5">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 px-2.5 text-xs"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    <ChevronLeft className="size-3.5 mr-1" />
                    <span>{locale === 'zh' ? '上一页' : 'Previous'}</span>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 px-2.5 text-xs"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  >
                    <span>{locale === 'zh' ? '下一页' : 'Next'}</span>
                    <ChevronRight className="size-3.5 ml-1" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        </SidebarInset>
      </SidebarProvider>

      {/* Photo Viewer Modal for Previews */}
      <PhotoViewer
        open={viewerOpen}
        photos={viewerPhotos}
        index={viewerIndex}
        onBack={() => setViewerOpen(false)}
        onBrowserBack={() => setViewerOpen(false)}
      />
    </>
  )
}
