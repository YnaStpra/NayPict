// This module defines the user interface input parameter object.

interface UserAddBo {
  username: string;
  password: string;
  type: number;
}

interface UserSetBo {
  userId: string;
  username: string;
  password?: string;
  type: number;
}

interface UserPasswordBo {
  password: string;
}

interface UserToggleStatusBo {
  userId: string;
}

interface UserSetAvatarBo {
  avatar: string;
}

interface UserDeleteBo {
  userId: string;
}

export type { UserAddBo, UserDeleteBo, UserPasswordBo, UserSetAvatarBo, UserSetBo, UserToggleStatusBo };
