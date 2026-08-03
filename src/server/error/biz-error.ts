// This module defines business exceptions that carry messages and business status codes。

class BizError extends Error {
  code: number;

  // Create business exceptions waiting for processing by the global error handler。
  constructor(message: string, code: number = 501) {
    super(message);
    this.code = code;
    this.name = 'BizError';
  }
}

export default BizError;
