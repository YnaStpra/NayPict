import { getApp } from '@/server/server'

// This route adapter forwards supported API methods to the configured Hono application.

export const runtime = 'nodejs'

// Forward a Next.js route request to a fresh Hono application instance.
const handler = (req: Request) => getApp().fetch(req)

export const GET = handler
export const POST = handler
export const OPTIONS = handler
