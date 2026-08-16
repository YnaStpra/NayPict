// This module defines input parameter types for comment business operations.

interface CommentAddBo {
  // Photo ID to comment on.
  photoId: string;
  // Commenter name.
  name: string;
  // Comment body text.
  content: string;
}

interface CommentDeleteBo {
  // Comment ID to delete.
  commentId: string;
}

interface CommentReplyBo {
  // Target comment ID.
  commentId: string;
  // Admin reply text.
  replyContent: string;
}

interface CommentListAdminBo {
  // Current page number (1-based).
  page?: number;
  // Number of items per page.
  size?: number;
  // Optional photo ID filter.
  photoId?: string;
  // Search keyword (commenter name, content, photo name).
  keyword?: string;
  // Status filter ('all' | 'replied' | 'unreplied').
  status?: 'all' | 'replied' | 'unreplied';
}

export type { CommentAddBo, CommentDeleteBo, CommentReplyBo, CommentListAdminBo };
