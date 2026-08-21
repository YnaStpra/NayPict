"use client";

import { useEffect, useRef, useState } from "react";
import { CornerDownRightIcon, Loader2Icon, MessageSquareIcon, PencilIcon, SendIcon, ShieldCheckIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { commentAdd, commentDelete, commentDeleteReply, commentList, commentReply } from "@/request/comment";
import { type CommentVo } from "@/server/entity/vo/comment";
import { useApp } from "@/app/provider";
import { UserTypeEnum } from "@/server/enums/user-enum";
import { useLocale } from "next-intl";
import { Turnstile } from "@/components/common/turnstile";

import { formatRelativeTime } from "@/lib/date";

interface PhotoCommentsProps {
  // Target photo ID to display and post comments for.
  photoId: string;
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
  // Real-time Server-Sent Events live status.
  const [isLiveConnected, setIsLiveConnected] = useState<boolean>(false);
  // Cloudflare Turnstile token.
  const [turnstileToken, setTurnstileToken] = useState<string>("");
  // Commenter name input value (initialized from localStorage).
  const [name, setName] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    try {
      return localStorage.getItem("naypict_comment_name") ?? "";
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

  // Admin reply states
  const [replyingCommentId, setReplyingCommentId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState<string>("");
  const [isSubmittingReply, setIsSubmittingReply] = useState<boolean>(false);

  // References to input elements for focus management.
  const nameInputRef = useRef<HTMLInputElement>(null);
  const contentInputRef = useRef<HTMLTextAreaElement>(null);
  // Reference to the scrollable comment list container.
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Fetch comments and establish real-time SSE listener whenever photoId changes.
  useEffect(() => {
    let isMounted = true;
    if (!photoId) return;

    // 1. Initial comments fetch
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

    // 2. Real-time Server-Sent Events (SSE) stream
    let eventSource: EventSource | null = null;
    try {
      eventSource = new EventSource(`/api/photos/${encodeURIComponent(photoId)}/comments/sse`);

      eventSource.addEventListener("connected", () => {
        if (isMounted) setIsLiveConnected(true);
      });

      eventSource.addEventListener("comment_added", (e: MessageEvent) => {
        if (!isMounted) return;
        try {
          const payload = JSON.parse(e.data);
          if (payload?.comment) {
            setComments((prev) => {
              if (prev.some((c) => c.commentId === payload.comment.commentId)) {
                return prev;
              }
              return [payload.comment, ...prev];
            });
          }
        } catch {}
      });

      eventSource.addEventListener("reply_added", (e: MessageEvent) => {
        if (!isMounted) return;
        try {
          const payload = JSON.parse(e.data);
          if (payload?.comment) {
            setComments((prev) =>
              prev.map((c) =>
                c.commentId === payload.comment.commentId
                  ? { ...c, replyContent: payload.comment.replyContent, replyTime: payload.comment.replyTime }
                  : c
              )
            );
          }
        } catch {}
      });

      eventSource.addEventListener("reply_deleted", (e: MessageEvent) => {
        if (!isMounted) return;
        try {
          const payload = JSON.parse(e.data);
          if (payload?.commentId) {
            setComments((prev) =>
              prev.map((c) =>
                c.commentId === payload.commentId
                  ? { ...c, replyContent: null, replyTime: null }
                  : c
              )
            );
          }
        } catch {}
      });

      eventSource.addEventListener("comment_deleted", (e: MessageEvent) => {
        if (!isMounted) return;
        try {
          const payload = JSON.parse(e.data);
          if (payload?.commentId) {
            setComments((prev) => prev.filter((c) => c.commentId !== payload.commentId));
          }
        } catch {}
      });

      eventSource.onerror = () => {
        if (isMounted) setIsLiveConnected(false);
      };
    } catch (sseErr) {
      console.warn("[SSE] EventSource init error:", sseErr);
    }

    return () => {
      isMounted = false;
      if (eventSource) {
        eventSource.close();
      }
    };
  }, [photoId]);

  // Handle comment form submission with strict mandatory field enforcement.
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    const trimmedContent = content.trim();

    if (!trimmedName) {
      nameInputRef.current?.focus();
      toast.error("Name is required to post a comment!");
      return;
    }
    if (!trimmedContent) {
      contentInputRef.current?.focus();
      toast.error("Comment content cannot be empty!");
      return;
    }

    setIsSubmitting(true);
    try {
      const newComment = await commentAdd({
        photoId,
        name: trimmedName,
        content: trimmedContent,
        turnstileToken: turnstileToken || undefined,
      });

      // Save valid name to local storage for convenience.
      try {
        localStorage.setItem("naypict_comment_name", trimmedName);
      } catch {
        // Ignore local storage write errors.
      }

      // Add new comment locally if not already received from SSE.
      setComments((prev) => {
        if (prev.some((c) => c.commentId === newComment.commentId)) {
          return prev;
        }
        return [newComment, ...prev];
      });
      setContent("");
      toast.success("Comment posted successfully");

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
      toast.success("Comment deleted");
    } catch {
      // Handled by request wrapper.
    } finally {
      setDeletingId(null);
    }
  };

  // Handle opening admin reply box
  const handleStartReply = (item: CommentVo) => {
    setReplyingCommentId(item.commentId);
    setReplyText(item.replyContent || "");
  };

  // Handle canceling admin reply
  const handleCancelReply = () => {
    setReplyingCommentId(null);
    setReplyText("");
  };

  // Handle submitting admin reply
  const handleSubmitReply = async (commentId: string) => {
    const trimmed = replyText.trim();
    if (!trimmed) {
      toast.error("Reply content cannot be empty");
      return;
    }

    setIsSubmittingReply(true);
    try {
      const updated = await commentReply({
        commentId,
        replyContent: trimmed,
      });

      setComments((prev) =>
        prev.map((c) =>
          c.commentId === commentId
            ? { ...c, replyContent: updated.replyContent, replyTime: updated.replyTime }
            : c
        )
      );
      toast.success("Reply posted");
      setReplyingCommentId(null);
      setReplyText("");
    } catch {
      // Handled by request wrapper
    } finally {
      setIsSubmittingReply(false);
    }
  };

  // Handle deleting admin reply
  const handleDeleteReply = async (commentId: string) => {
    try {
      await commentDeleteReply({ commentId });
      setComments((prev) =>
        prev.map((c) =>
          c.commentId === commentId
            ? { ...c, replyContent: null, replyTime: null }
            : c
        )
      );
      toast.success("Reply removed");
    } catch {
      // Handled by request wrapper
    }
  };

  return (
    <div className="flex flex-col flex-1 h-full min-h-0 px-4 py-2 text-left" onPointerDown={(e) => e.stopPropagation()}>
      {/* Header with comment count & real-time live indicator */}
      <div className="flex items-center justify-between pb-2 shrink-0">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-white/50 tracking-wider uppercase">
          <MessageSquareIcon className="size-3.5 text-white/60" />
          <span>Comments</span>
          {isLiveConnected && (
            <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400 font-bold px-1.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 ml-1">
              <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Live
            </span>
          )}
        </div>
        <span className="text-[11px] font-medium text-white/60 bg-white/10 px-2 py-0.5 rounded-full">
          {comments.length}
        </span>
      </div>

      {/* Independently scrollable comment list */}
      <div
        ref={scrollContainerRef}
        className="flex-1 min-h-[150px] space-y-2.5 overflow-y-auto pr-1 py-1 text-xs overscroll-contain scrollbar-thin scrollbar-thumb-white/20 scrollbar-track-transparent"
      >
        {isLoading && (
          <div className="flex items-center justify-center py-10 text-white/50 gap-2">
            <Loader2Icon className="size-4 animate-spin" />
            <span>Loading comments...</span>
          </div>
        )}

        {!isLoading && comments.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-center text-white/40 gap-2">
            <MessageSquareIcon className="size-8 stroke-1 text-white/25" />
            <p className="text-xs italic">No comments yet. Be the first to share your thoughts!</p>
          </div>
        )}

        {!isLoading &&
          comments.map((item) => (
            <div
              key={item.commentId}
              className="group relative rounded-xl border border-white/15 bg-white/5 p-3 backdrop-blur-sm transition-colors hover:bg-white/[0.08] space-y-1.5"
            >
              <div className="flex items-center justify-between gap-2 pb-0.5">
                <span className="font-semibold text-white/95 text-xs truncate">{item.name}</span>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[10px] text-white/40">
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
              <p className="text-white/85 whitespace-pre-wrap break-words text-xs leading-relaxed">
                {item.content}
              </p>

              {/* Display Public "Reply by Admin" Badge and Content */}
              {item.replyContent && replyingCommentId !== item.commentId && (
                <div className="mt-2 pl-2.5 border-l-2 border-emerald-500/70 bg-emerald-500/10 p-2 rounded-r-lg space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1 text-[11px] font-semibold text-emerald-400">
                      <ShieldCheckIcon className="size-3" />
                      <span>Reply by Admin</span>
                      {item.replyTime && (
                        <span className="text-[9px] text-white/40 font-normal ml-1">
                          ({formatRelativeTime(item.replyTime, locale)})
                        </span>
                      )}
                    </div>
                    {isAdmin && (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleStartReply(item)}
                          className="text-white/50 hover:text-emerald-300 p-0.5 rounded cursor-pointer"
                          title="Edit reply"
                        >
                          <PencilIcon className="size-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteReply(item.commentId)}
                          className="text-white/50 hover:text-red-400 p-0.5 rounded cursor-pointer"
                          title="Delete reply"
                        >
                          <Trash2Icon className="size-3" />
                        </button>
                      </div>
                    )}
                  </div>
                  <p className="text-white/90 whitespace-pre-wrap break-words text-[11px] leading-relaxed">
                    {item.replyContent}
                  </p>
                </div>
              )}

              {/* Inline Reply Form for Admin */}
              {isAdmin && replyingCommentId === item.commentId && (
                <div className="mt-2 pl-2.5 border-l-2 border-emerald-500 bg-white/10 p-2.5 rounded-r-lg space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
                    <CornerDownRightIcon className="size-3.5" />
                    <span>{item.replyContent ? "Edit Admin Reply" : "Reply by Admin"}</span>
                  </div>
                  <textarea
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder="Write your admin reply..."
                    maxLength={500}
                    rows={2}
                    disabled={isSubmittingReply}
                    className="w-full rounded-md border border-white/20 bg-white/10 p-2 text-xs text-white placeholder:text-white/40 focus:border-emerald-400 focus:outline-none resize-none"
                  />
                  <div className="flex items-center justify-end gap-1.5">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 text-[11px] px-2 text-white/60 hover:text-white"
                      disabled={isSubmittingReply}
                      onClick={handleCancelReply}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      className="h-6 text-[11px] px-2.5 gap-1 bg-emerald-600 hover:bg-emerald-500 text-white"
                      disabled={isSubmittingReply || !replyText.trim()}
                      onClick={() => handleSubmitReply(item.commentId)}
                    >
                      {isSubmittingReply ? (
                        <Loader2Icon className="size-3 animate-spin" />
                      ) : (
                        <SendIcon className="size-3" />
                      )}
                      <span>Reply</span>
                    </Button>
                  </div>
                </div>
              )}

              {/* Admin Quick Reply Trigger when not replied */}
              {isAdmin && !item.replyContent && replyingCommentId !== item.commentId && (
                <div className="pt-0.5">
                  <button
                    type="button"
                    onClick={() => handleStartReply(item)}
                    className="flex items-center gap-1 text-[11px] text-white/50 hover:text-emerald-400 transition-colors cursor-pointer"
                  >
                    <CornerDownRightIcon className="size-3" />
                    <span>Reply</span>
                  </button>
                </div>
              )}
            </div>
          ))}
      </div>

      {/* Comment submission form */}
      <form onSubmit={handleSubmit} className="mt-auto shrink-0 pt-3 space-y-2 border-t border-white/15">
        <div>
          <div className="flex items-center justify-between pb-1 text-[11px] font-medium text-white/70">
            <span>Your Name</span>
            <span className="text-amber-300 text-[10px]">* Required</span>
          </div>
          <input
            ref={nameInputRef}
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Enter your name (Required)"
            maxLength={50}
            disabled={isSubmitting}
            className="w-full rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-xs text-white placeholder:text-white/40 focus:border-white/40 focus:outline-none focus:ring-1 focus:ring-white/40 disabled:opacity-50 transition-all"
          />
        </div>

        <div>
          <div className="flex items-center justify-between pb-1 text-[11px] font-medium text-white/70">
            <span>Comment</span>
            <span className="text-amber-300 text-[10px]">* Required</span>
          </div>
          <textarea
            ref={contentInputRef}
            required
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Write your comment (Required)... (Ctrl+Enter to send)"
            maxLength={500}
            rows={2}
            disabled={isSubmitting}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                handleSubmit(e);
              }
            }}
            className="w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-xs text-white placeholder:text-white/40 focus:border-white/40 focus:outline-none focus:ring-1 focus:ring-white/40 resize-none min-h-[58px] disabled:opacity-50 transition-all"
          />
        </div>

        {/* Cloudflare Turnstile Bot Protection Widget */}
        <Turnstile
          onVerify={(token) => setTurnstileToken(token)}
          onExpire={() => setTurnstileToken("")}
          className="my-1.5"
        />

        <div className="flex justify-end pt-0.5">
          <Button
            type="submit"
            size="sm"
            disabled={isSubmitting || !name.trim() || !content.trim()}
            className="gap-1.5 bg-white/20 text-white hover:bg-white/30 border border-white/20 text-xs font-medium cursor-pointer disabled:cursor-not-allowed disabled:opacity-40 transition-all h-7.5 px-3.5 rounded-lg"
          >
            {isSubmitting ? (
              <>
                <Loader2Icon className="size-3.5 animate-spin" />
                <span>Sending...</span>
              </>
            ) : (
              <>
                <SendIcon className="size-3.5" />
                <span>Send</span>
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
