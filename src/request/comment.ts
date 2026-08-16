import { http } from "@/request/request";
import { type CommentAddBo, type CommentDeleteBo } from "@/server/entity/bo/comment";
import { type CommentVo } from "@/server/entity/vo/comment";

// This module encapsulates photo comment interface requests.

// Fetch all comments for a specific photo (safe fetch without throwing intrusive error toasts).
export async function commentList(photoId: string): Promise<CommentVo[]> {
  try {
    const res = await fetch(`/api/photos/${encodeURIComponent(photoId)}/comments`, {
      method: 'GET',
      credentials: 'include',
    });
    const json = await res.json().catch(() => null);
    if (json && json.code === 200 && Array.isArray(json.data)) {
      return json.data;
    }
    return [];
  } catch {
    return [];
  }
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
