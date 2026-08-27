import { type User } from '@/server/entity/user';

// This module defines the user interface return object.

interface UserVo extends Omit<User, 'password' | 'salt' | 'tokenVersion'> {
  photoTotal: number;
  usedCapacity: number;
}

interface UserInfoVo {
  userId: string;
  username: string;
  avatar: string;
  type: number;
}

export type { UserVo, UserInfoVo };
