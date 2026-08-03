// This module registers server-side initialization tasks when the Next.js app starts.

export async function register() {
  if (process.env.NEXT_RUNTIME === 'edge') {
    return
  }

  const { migrate } = await import('@/server/infra/migrate')
  await migrate()

  const { userService } = await import('@/server/service/user-service')
  await userService.init()

  // Background cron tasks are only started when NOT running on serverless Vercel
  if (!process.env.VERCEL) {
    const { startTasks } = await import('@/server/task')
    startTasks()
  }
}
