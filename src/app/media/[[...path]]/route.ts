import { media } from '@/server/server'

// This route adapter forwards read-only media requests and CORS preflights to Hono.

export const runtime = 'nodejs'

// Forward a Next.js route request to the shared Hono media handler.
const handler = (req: Request) => media.fetch(req)

export const GET = handler
export const OPTIONS = handler
