import { v7 as uuidv7 } from 'uuid';

// This module provides services ID Generate method。

// Generate time-ordered UUID v7 business ID。
function createId(): string {
  return uuidv7();
}

export { createId };
