// This module defines output response types for comment business operations.

interface CommentVo {
  // Unique comment ID.
  commentId: string;
  // Associated photo ID.
  photoId: string;
  // Commenter name.
  name: string;
  // Comment content.
  content: string;
  // Comment creation timestamp.
  createTime: string;
}

export type { CommentVo };
