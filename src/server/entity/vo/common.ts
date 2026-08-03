// This module defines a common interface that returns objects。

interface PageVo<T> {
  list: T[];
  total: number;
}

export type { PageVo };
