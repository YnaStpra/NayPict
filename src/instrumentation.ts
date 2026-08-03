// This module is in Next.js Register server-side scheduled tasks when the service starts。

export async function register() {

  if (process.env.NEXT_RUNTIME === 'edge' || process.env.VERCEL) {
    return
  }

  const { migrate } = await import('@/server/infra/migrate');
  await migrate();

  const { userService } = await import('@/server/service/user-service');
  await userService.init();

  const { startTasks } = await import('@/server/task');
  startTasks();
}
