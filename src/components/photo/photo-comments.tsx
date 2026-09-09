"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, CornerDownRightIcon, Heart, Loader2Icon, MessageSquareIcon, PencilIcon, Pin, SendIcon, ShieldCheckIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { commentAdd, commentDelete, commentDeleteReply, commentList, commentReply, commentToggleHeart, commentTogglePin } from "@/request/comment";
import { type CommentVo } from "@/server/entity/vo/comment";
import { useApp } from "@/app/provider";
import { UserTypeEnum } from "@/server/enums/user-enum";
import { useLocale } from "next-intl";
import { Turnstile } from "@/components/common/turnstile";

import { formatRelativeTime } from "@/lib/date";
import { photoSse } from "@/lib/photo-sse";

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
  // Invisible honeypot field for bot spam defense (must remain empty).
  const [honeypot, setHoneypot] = useState<string>("");
  // Form initialization timestamp for minimum interaction time validation.
  const [formLoadedAt, setFormLoadedAt] = useState<number>(() => Date.now());
  // Submission pending state to prevent duplicate clicks.
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  // Comment ID currently being deleted.
  const [deletingId, setDeletingId] = useState<string | null>(null);
  // Admin heart & pin loading states.
  const [pinningId, setPinningId] = useState<string | null>(null);
  const [heartingId, setHeartingId] = useState<string | null>(null);

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

    // Reset form initialization timestamp on photo change
    setFormLoadedAt(Date.now());

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

    // 2. Real-time Server-Sent Events (SSE) stream via shared photoSse manager
    const unsubs = [
      photoSse.subscribe(photoId, "comment_added", (payload) => {
        if (!isMounted || !payload?.comment) return;
        setComments((prev) => {
          if (prev.some((c) => c.commentId === payload.comment.commentId)) {
            return prev;
          }
          return [payload.comment, ...prev];
        });
      }),

      photoSse.subscribe(photoId, "reply_added", (payload) => {
        if (!isMounted || !payload?.comment) return;
        setComments((prev) =>
          prev.map((c) =>
            c.commentId === payload.comment.commentId
              ? { ...c, replyContent: payload.comment.replyContent, replyTime: payload.comment.replyTime }
              : c
          )
        );
      }),

      photoSse.subscribe(photoId, "reply_deleted", (payload) => {
        if (!isMounted || !payload?.commentId) return;
        setComments((prev) =>
          prev.map((c) =>
            c.commentId === payload.commentId
              ? { ...c, replyContent: null, replyTime: null }
              : c
          )
        );
      }),

      photoSse.subscribe(photoId, "comment_deleted", (payload) => {
        if (!isMounted || !payload?.commentId) return;
        setComments((prev) => prev.filter((c) => c.commentId !== payload.commentId));
      }),

      photoSse.subscribe(photoId, "heart_updated", (payload) => {
        if (!isMounted || !payload?.commentId) return;
        setComments((prev) =>
          prev.map((c) =>
            c.commentId === payload.commentId
              ? { ...c, isHearted: Boolean(payload.isHearted) }
              : c
          )
        );
      }),

      photoSse.subscribe(photoId, "pin_updated", (payload) => {
        if (!isMounted || !payload?.commentId) return;
        setComments((prev) => {
          const updated = prev.map((c) => {
            if (c.commentId === payload.commentId) {
              return { ...c, isPinned: Boolean(payload.isPinned) };
            }
            if (payload.isPinned) {
              return { ...c, isPinned: false };
            }
            return c;
          });
          return [...updated].sort((a, b) => {
            if (a.isPinned && !b.isPinned) return -1;
            if (!a.isPinned && b.isPinned) return 1;
            return new Date(b.createTime).getTime() - new Date(a.createTime).getTime();
          });
        });
      }),
    ];

    // Adaptive low-frequency polling while comments drawer is actively open (8s interval, only when tab is visible)
    const pollInterval = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        commentList(photoId)
          .then((data) => {
            if (isMounted && Array.isArray(data)) {
              setComments(data);
            }
          })
          .catch(() => {});
      }
    }, 8000);

    return () => {
      isMounted = false;
      clearInterval(pollInterval);
      unsubs.forEach((unsub) => unsub());
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
    const tempId = `optimistic_${Date.now()}`;
    const optimisticComment: CommentVo = {
      commentId: tempId,
      photoId,
      name: trimmedName,
      content: trimmedContent,
      createTime: new Date().toISOString(),
    };

    // Instant Optimistic UI: Prepend comment immediately
    setComments((prev) => [optimisticComment, ...prev]);
    setContent("");
    setHoneypot("");
    setFormLoadedAt(Date.now());

    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }

    try {
      const newComment = await commentAdd({
        photoId,
        name: trimmedName,
        content: trimmedContent,
        website: honeypot || undefined,
        timestamp: formLoadedAt,
        turnstileToken: turnstileToken || undefined,
      });

      // Save valid name to local storage for convenience.
      try {
        localStorage.setItem("naypict_comment_name", trimmedName);
      } catch {
        // Ignore local storage write errors.
      }

      // Replace optimistic comment with confirmed server response
      setComments((prev) =>
        prev.map((c) => (c.commentId === tempId ? newComment : c))
      );
      toast.success("Comment posted successfully");
    } catch {
      // Rollback optimistic comment on failure and restore content
      setComments((prev) => prev.filter((c) => c.commentId !== tempId));
      setContent(trimmedContent);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Admin deletion of a comment with Instant Optimistic UI.
  const handleDeleteComment = async (commentId: string) => {
    if (!isAdmin || deletingId) return;

    const previousComments = [...comments];
    setDeletingId(commentId);
    // Instant Optimistic UI removal
    setComments((prev) => prev.filter((item) => item.commentId !== commentId));

    try {
      await commentDelete({ commentId });
      toast.success("Comment deleted");
    } catch {
      // Rollback on error
      setComments(previousComments);
      toast.error("Failed to delete comment");
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

  // Handle submitting admin reply with Instant Optimistic UI
  const handleSubmitReply = async (commentId: string) => {
    const trimmed = replyText.trim();
    if (!trimmed) {
      toast.error("Reply content cannot be empty");
      return;
    }

    const previousComments = [...comments];
    setIsSubmittingReply(true);

    // Instant Optimistic UI update
    setComments((prev) =>
      prev.map((c) =>
        c.commentId === commentId
          ? { ...c, replyContent: trimmed, replyTime: new Date().toISOString() }
          : c
      )
    );
    setReplyingCommentId(null);

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
      toast.success("Reply saved");
    } catch {
      // Rollback on error
      setComments(previousComments);
      setReplyingCommentId(commentId);
      toast.error("Failed to save reply");
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

  // Admin toggles photographer heart on a comment
  const handleToggleHeart = async (commentId: string) => {
    if (heartingId) return;
    setHeartingId(commentId);
    try {
      const res = await commentToggleHeart({ commentId });
      setComments((prev) =>
        prev.map((c) =>
          c.commentId === commentId ? { ...c, isHearted: res.isHearted } : c
        )
      );
      toast.success(res.isHearted ? "Comment hearted by photographer! ❤️" : "Heart removed");
    } catch (err: unknown) {
      toast.error((err as Error)?.message || "Failed to toggle heart");
    } finally {
      setHeartingId(null);
    }
  };

  // Admin toggles pin on a comment (at most 1 pinned comment per photo)
  const handleTogglePin = async (commentId: string) => {
    if (pinningId) return;
    setPinningId(commentId);
    try {
      const res = await commentTogglePin({ commentId });
      setComments((prev) => {
        const updated = prev.map((c) => {
          if (c.commentId === commentId) {
            return { ...c, isPinned: res.isPinned };
          }
          // If newly pinned, unpin all others
          if (res.isPinned) {
            return { ...c, isPinned: false };
          }
          return c;
        });
        // Sort so pinned comment is at the top
        return [...updated].sort((a, b) => {
          if (a.isPinned && !b.isPinned) return -1;
          if (!a.isPinned && b.isPinned) return 1;
          return new Date(b.createTime).getTime() - new Date(a.createTime).getTime();
        });
      });
      toast.success(res.isPinned ? "Comment pinned to top! 📌" : "Comment unpinned");
    } catch (err: unknown) {
      toast.error((err as Error)?.message || "Failed to toggle pin");
    } finally {
      setPinningId(null);
    }
  };

  return (
    <div className="flex flex-col flex-1 h-full min-h-0 px-4 py-2 text-left" onPointerDown={(e) => e.stopPropagation()}>
      {/* Header with comment count */}
      <div className="flex items-center justify-between pb-2 shrink-0">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-white/50 tracking-wider uppercase">
          <MessageSquareIcon className="size-3.5 text-white/60" />
          <span>Comments</span>
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
              className={`group relative rounded-xl border p-3 backdrop-blur-sm transition-all space-y-1.5 ${
                item.isPinned
                  ? "border-amber-500/40 bg-amber-500/[0.07] hover:bg-amber-500/[0.10] shadow-[0_0_15px_rgba(245,158,11,0.08)]"
                  : "border-white/15 bg-white/5 hover:bg-white/[0.08]"
              }`}
            >
              {/* Pinned comment banner */}
              {item.isPinned && (
                <div className="flex items-center gap-1.5 text-[10px] font-bold text-amber-400 bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 rounded-full w-fit mb-1 tracking-wide uppercase shadow-xs">
                  <Pin className="size-2.5 fill-amber-400 text-amber-400" />
                  <span>Pinned by Photographer</span>
                </div>
              )}

              <div className="flex items-center justify-between gap-2 pb-0.5">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="font-semibold text-white/95 text-xs truncate">{item.name}</span>
                  {item.isHearted && (
                    <span
                      className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded-full text-[9px] font-semibold bg-rose-500/20 text-rose-300 border border-rose-500/30 shadow-xs"
                      title="Hearted by the photographer"
                    >
                      <Heart className="size-2.5 fill-rose-500 text-rose-500" />
                      <span className="hidden sm:inline">Author Heart</span>
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-[10px] text-white/40">
                    {formatRelativeTime(item.createTime, locale)}
                  </span>
                  {isAdmin && (
                    <div className="flex items-center gap-1">
                      {/* Heart toggle button */}
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className={`size-5 transition-all rounded cursor-pointer ${
                          item.isHearted
                            ? "text-rose-400 hover:text-rose-300 hover:bg-rose-500/20"
                            : "text-white/40 hover:text-rose-400 hover:bg-rose-500/10"
                        }`}
                        disabled={heartingId === item.commentId}
                        onClick={() => handleToggleHeart(item.commentId)}
                        title={item.isHearted ? "Remove photographer heart" : "Award photographer heart"}
                      >
                        {heartingId === item.commentId ? (
                          <Loader2Icon className="size-2.5 animate-spin" />
                        ) : (
                          <Heart className={`size-3 ${item.isHearted ? "fill-rose-500 text-rose-500" : ""}`} />
                        )}
                        <span className="sr-only">Heart</span>
                      </Button>

                      {/* Pin toggle button */}
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className={`size-5 transition-all rounded cursor-pointer ${
                          item.isPinned
                            ? "text-amber-400 hover:text-amber-300 hover:bg-amber-500/20"
                            : "text-white/40 hover:text-amber-400 hover:bg-amber-500/10"
                        }`}
                        disabled={pinningId === item.commentId}
                        onClick={() => handleTogglePin(item.commentId)}
                        title={item.isPinned ? "Unpin comment" : "Pin comment to top"}
                      >
                        {pinningId === item.commentId ? (
                          <Loader2Icon className="size-2.5 animate-spin" />
                        ) : (
                          <Pin className={`size-3 ${item.isPinned ? "fill-amber-400 text-amber-400" : ""}`} />
                        )}
                        <span className="sr-only">Pin</span>
                      </Button>

                      {/* Delete button */}
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-5 text-white/40 opacity-70 hover:opacity-100 hover:text-red-400 hover:bg-red-500/10 transition-all rounded cursor-pointer"
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
                    </div>
                  )}
                </div>
              </div>
              <p className="text-white/85 whitespace-pre-wrap break-words text-xs leading-relaxed">
                {item.content}
              </p>

              {/* Display Public "Reply by Photographer" Badge and Content */}
              {item.replyContent && replyingCommentId !== item.commentId && (
                <div className="mt-2 pl-2.5 border-l-2 border-amber-500/70 bg-gradient-to-r from-amber-500/10 to-transparent p-2.5 rounded-r-xl space-y-1.5 shadow-[inset_0_0_12px_rgba(245,158,11,0.05)]">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-gradient-to-r from-amber-500/25 to-orange-500/25 border border-amber-500/40 text-amber-300 text-[10px] font-bold tracking-wider uppercase shadow-xs">
                        <CheckCircle2 className="size-3 text-amber-400 fill-amber-400/20" />
                        <span>Photographer</span>
                      </div>
                      {item.replyTime && (
                        <span className="text-[9px] text-white/40 font-normal">
                          {formatRelativeTime(item.replyTime, locale)}
                        </span>
                      )}
                    </div>
                    {isAdmin && (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleStartReply(item)}
                          className="text-white/50 hover:text-amber-300 p-0.5 rounded cursor-pointer"
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
                  <p className="text-white/95 whitespace-pre-wrap break-words text-[11px] leading-relaxed font-medium">
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
        {/* Invisible Honeypot Field for Automated Bot Spam Protection */}
        <div className="absolute opacity-0 -z-50 pointer-events-none select-none h-0 w-0 overflow-hidden" aria-hidden="true" tabIndex={-1}>
          <label htmlFor="hp_comment_website">Website</label>
          <input
            id="hp_comment_website"
            type="text"
            name="website"
            autoComplete="off"
            tabIndex={-1}
            value={honeypot}
            onChange={(e) => setHoneypot(e.target.value)}
          />
        </div>

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
