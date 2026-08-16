import { http } from "@/request/request";
import { type CommentAddBo, type CommentDeleteBo } from "@/server/entity/bo/comment";
import { type CommentVo } from "@/server/entity/vo/comment";

// This module encapsulates photo comment interface requests.

// Fetch all comments for a specific photo.
export function commentList(photoId: string) {
  return http.get<CommentVo[]>(`/photos/${encodeURIComponent(photoId)}/comments`);
}

// Add a new comment to a photo.
export function commentAdd(params: CommentAddBo) {
  return http.post<CommentVo>(`/photos/${encodeURIComponent(params.photoId)}/comments`, {
    name: params.name,
    content: params.content,
  });
}

// Delete a comment (Admin only).
export function commentDelete(params: CommentDeleteBo) {
  return http.post<void>('/photo/comment/delete', params);
}
