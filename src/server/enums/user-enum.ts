// This module defines user-related enumeration values。

const UserStatusEnum = {
  DEFAULT: 0,
  NORMAL: 1,
  DISABLE: 2
} as const;

const UserTypeEnum = {
  ADMIN: 1,
  NORMAL: 2
} as const;

const UserTypeOptions = [
  { label: "Ordinary user", value: UserTypeEnum.NORMAL },
  { label: "administrator", value: UserTypeEnum.ADMIN }
];

export { UserStatusEnum, UserTypeEnum, UserTypeOptions };
