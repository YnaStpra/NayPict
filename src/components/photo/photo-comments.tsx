"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2Icon, MessageSquareIcon, SendIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { commentAdd, commentDelete, commentList } from "@/request/comment";
import { type CommentVo } from "@/server/entity/vo/comment";
import { useApp } from "@/app/provider";
import { UserTypeEnum } from "@/server/enums/user-enum";
import { useLocale } from "next-intl";

interface PhotoCommentsProps {
  // Target photo ID to display and post comments for.
  photoId: string;
}

// Format relative timestamp into user-friendly localized string.
function formatRelativeTime(dateStr: string, locale = "en"): string {
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) {
    return dateStr;
  }

  const now = Date.now();
  const diffMs = now - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 45) {
    return locale === "zh" ? "刚刚" : "Just now";
  }
  if (diffMin < 60) {
    return locale === "zh" ? `${diffMin}分钟前` : `${diffMin}m ago`;
  }
  if (diffHour < 24) {
    return locale === "zh" ? `${diffHour}小时前` : `${diffHour}h ago`;
  }
  if (diffDay < 7) {
    return locale === "zh" ? `${diffDay}天前` : `${diffDay}d ago`;
  }

  return new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    year: date.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined,
  }).format(date);
}

// Render the comments list and submission form for a specific photo.
export function PhotoComments({ photoId }: PhotoCommentsProps) {
  const locale = useLocale();
  const { userInfo } = useApp();
  // Check if current user is logged-in Administrator.
  const isAdmin = userInfo?.type === UserTypeEnum.ADMIN;

  // List of comments fetched from backend.
  const [comments, setComments] = useState<CommentVo[]>([]);
  // Initial loading state while fetching comments.
  const [isLoading, setIsLoading] = useState<boolean>(true);
  // Commenter name input value (initialized from localStorage).
  const [name, setName] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    try {
      return localStorage.getItem("pixtale_comment_name") ?? "";
    } catch {
      return "";
    }
  });
  // Comment body input value.
  const [content, setContent] = useState<string>("");
  // Submission pending state to prevent duplicate clicks.
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  // Comment ID currently being deleted.
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Reference to the scrollable comment list container.
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Fetch comments whenever photoId changes.
  useEffect(() => {
    let isMounted = true;
    if (!photoId) return;

    commentList(photoId)
      .then((data) => {
        if (isMounted) {
          setComments(data ?? []);
        }
      })
      .catch(() => {
        if (isMounted) {
          setComments([]);
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [photoId]);

  // Handle comment form submission.
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    const trimmedContent = content.trim();

    if (!trimmedName) {
      toast.error(locale === "zh" ? "请输入您的昵称" : "Please enter your name");
      return;
    }
    if (!trimmedContent) {
      toast.error(locale === "zh" ? "请输入评论内容" : "Please write a comment");
      return;
    }

    setIsSubmitting(true);
    try {
      const newComment = await commentAdd({
        photoId,
        name: trimmedName,
        content: trimmedContent,
      });

      // Save valid name to local storage for convenience.
      try {
        localStorage.setItem("pixtale_comment_name", trimmedName);
      } catch {
        // Ignore local storage write errors.
      }

      // Add new comment to the top of the list immediately.
      setComments((prev) => [newComment, ...prev]);
      setContent("");
      toast.success(locale === "zh" ? "评论已发送" : "Comment posted");

      // Smoothly scroll to the top of comment list.
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollTop = 0;
      }
    } catch {
      // Error toast is already displayed by http request wrapper.
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Admin deletion of a comment.
  const handleDeleteComment = async (commentId: string) => {
    if (!isAdmin || deletingId) return;

    setDeletingId(commentId);
    try {
      await commentDelete({ commentId });
      setComments((prev) => prev.filter((item) => item.commentId !== commentId));
      toast.success(locale === "zh" ? "评论已删除" : "Comment deleted");
    } catch {
      // Handled by request wrapper.
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="px-4 pt-4 pb-2 text-left" onPointerDown={(e) => e.stopPropagation()}>
      {/* Header with comment count */}
      <div className="flex items-center gap-1.5 pb-2.5 text-sm font-medium text-white/90">
        <MessageSquareIcon className="size-4 text-white/70" />
        <span>
          {locale === "zh" ? "评论" : "Comments"}
          {!isLoading && ` (${comments.length})`}
        </span>
      </div>

      {/* Independently scrollable comment list */}
      <div
        ref={scrollContainerRef}
        className="max-h-[280px] md:max-h-[340px] space-y-2 overflow-y-auto pr-1 text-xs overscroll-contain scrollbar-thin scrollbar-thumb-white/20 scrollbar-track-transparent"
      >
        {isLoading && (
          <div className="flex items-center justify-center py-6 text-white/50 gap-2">
            <Loader2Icon className="size-4 animate-spin" />
            <span>{locale === "zh" ? "正在加载评论..." : "Loading comments..."}</span>
          </div>
        )}

        {!isLoading && comments.length === 0 && (
          <div className="py-5 text-center text-white/40 italic">
            {locale === "zh" ? "暂无评论" : "No comments yet."}
          </div>
        )}

        {!isLoading &&
          comments.map((item) => (
            <div
              key={item.commentId}
              className="group relative rounded-lg border border-white/10 bg-white/5 p-2.5 backdrop-blur-sm transition-colors hover:bg-white/[0.08]"
            >
              <div className="flex items-center justify-between gap-2 pb-1">
                <span className="font-medium text-white/95 truncate">{item.name}</span>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[11px] text-white/50">
                    {formatRelativeTime(item.createTime, locale)}
                  </span>
                  {isAdmin && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-5 text-white/40 opacity-70 hover:opacity-100 hover:text-red-400 hover:bg-red-500/10 transition-all rounded"
                      disabled={deletingId === item.commentId}
                      onClick={() => handleDeleteComment(item.commentId)}
                      title="Delete comment"
                    >
                      {deletingId === item.commentId ? (
                        <Loader2Icon className="size-3 animate-spin" />
                      ) : (
                        <Trash2Icon className="size-3" />
                      )}
                      <span className="sr-only">Delete</span>
                    </Button>
                  )}
                </div>
              </div>
              <p className="text-white/80 whitespace-pre-wrap break-words text-[13px] leading-relaxed">
                {item.content}
              </p>
            </div>
          ))}
      </div>

      {/* Comment submission form */}
      <form onSubmit={handleSubmit} className="mt-3 space-y-2 border-t border-white/10 pt-3">
        <div>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={locale === "zh" ? "您的昵称" : "Your name"}
            maxLength={50}
            disabled={isSubmitting}
            className="w-full rounded-md border border-white/20 bg-white/10 px-3 py-1.5 text-xs text-white placeholder:text-white/40 focus:border-white/40 focus:outline-none focus:ring-1 focus:ring-white/40 disabled:opacity-50 transition-all"
          />
        </div>

        <div>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={locale === "zh" ? "写下您的评论..." : "Write a comment..."}
            maxLength={500}
            rows={2}
            disabled={isSubmitting}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                handleSubmit(e);
              }
            }}
            className="w-full rounded-md border border-white/20 bg-white/10 px-3 py-1.5 text-xs text-white placeholder:text-white/40 focus:border-white/40 focus:outline-none focus:ring-1 focus:ring-white/40 resize-none min-h-[56px] disabled:opacity-50 transition-all"
          />
        </div>

        <div className="flex justify-end">
          <Button
            type="submit"
            size="sm"
            disabled={isSubmitting || !name.trim() || !content.trim()}
            className="gap-1.5 bg-white/20 text-white hover:bg-white/30 border border-white/20 text-xs font-medium cursor-pointer disabled:cursor-not-allowed disabled:opacity-40 transition-all h-7 px-3"
          >
            {isSubmitting ? (
              <>
                <Loader2Icon className="size-3.5 animate-spin" />
                <span>{locale === "zh" ? "发送中..." : "Sending..."}</span>
              </>
            ) : (
              <>
                <SendIcon className="size-3.5" />
                <span>{locale === "zh" ? "发送" : "Send"}</span>
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
