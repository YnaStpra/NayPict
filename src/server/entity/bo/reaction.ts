// This module defines input business parameter types for photo reactions.

export type ReactionType = 'love' | 'fire' | 'camera' | 'place' | 'clap';

export interface PhotoReactionAddBo {
  photoId: string;
  visitorId: string;
  reactionType: ReactionType;
  count?: number;
}

export interface PhotoReactionsQueryBo {
  photoId: string;
  visitorId?: string;
}
