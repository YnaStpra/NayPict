import { getApp } from '@/server/server'

export const runtime = 'nodejs'

const handler = (req: Request) => getApp().fetch(req)

export const GET = handler
export const POST = handler
