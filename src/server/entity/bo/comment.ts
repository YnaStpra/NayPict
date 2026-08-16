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

export type { CommentAddBo, CommentDeleteBo };
