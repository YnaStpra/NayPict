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
  // Optional admin reply content.
  replyContent?: string | null;
  // Optional admin reply timestamp.
  replyTime?: string | null;
  // Comment creation timestamp.
  createTime: string;
}

interface CommentAdminVo {
  // Unique comment ID.
  commentId: string;
  // Associated photo ID.
  photoId: string;
  // Photo title / filename.
  photoName?: string;
  // Photo thumbnail URL.
  photoThumbnail?: string;
  // Photo preview URL.
  photoPreview?: string;
  // Photo ThumbHash for blurred placeholder.
  thumbHash?: string | null;
  // Photo type extension (e.g. jpg, png).
  typeDesc?: string;
  // Commenter name.
  name: string;
  // Comment content.
  content: string;
  // Optional admin reply content.
  replyContent?: string | null;
  // Optional admin reply timestamp.
  replyTime?: string | null;
  // Comment creation timestamp.
  createTime: string;
}

interface CommentAdminPageVo {
  // Paginated list of comments with photo metadata.
  list: CommentAdminVo[];
  // Total number of matched comments.
  total: number;
}

export type { CommentVo, CommentAdminVo, CommentAdminPageVo };
