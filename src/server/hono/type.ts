// This module defines Hono The type of the shared variable in the request context.

interface HonoEnv {
  Variables: {
    locale: string;
    userId: string;
  };
}

export type { HonoEnv };
