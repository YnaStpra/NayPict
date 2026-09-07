import { http } from "@/request/request";
import { type PhotoReactionAddBo, type PhotoReactionsQueryBo } from "@/server/entity/bo/reaction";
import { type PhotoReactionsVo } from "@/server/entity/vo/reaction";

// This module encapsulates photo micro-reactions and public claps/likes API requests.

// Fetch aggregated reaction totals and visitor personal state.
export function photoReactionsGet(params: PhotoReactionsQueryBo) {
  return http.post<PhotoReactionsVo>('/photo/reactions', params);
}

// Add or toggle a reaction/clap on a photo.
export function photoReactionAdd(params: PhotoReactionAddBo) {
  return http.post<PhotoReactionsVo>('/photo/reaction/add', params);
}
