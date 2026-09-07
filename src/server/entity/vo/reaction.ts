// This module defines output response types for photo reactions.

export interface ReactionTotalsVo {
  love: number;
  fire: number;
  camera: number;
  place: number;
  clap: number;
}

export interface UserReactionsVo {
  love: boolean;
  fire: boolean;
  camera: boolean;
  place: boolean;
  clap: number; // Number of claps given by this visitor (0 to 5)
}

export interface PhotoReactionsVo {
  photoId: string;
  totals: ReactionTotalsVo;
  userReactions: UserReactionsVo;
}
