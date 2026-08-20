// This module registers server-side initialization tasks when the Next.js app starts.

export async function register() {
  if (process.env.NEXT_RUNTIME === 'edge') {
    return;
  }

  // 1. Enforce strict JWT_SECRET validation on startup (fail fast in production)
  const jwtSecret = process.env.JWT_SECRET?.trim();
  if (process.env.NODE_ENV === 'production' && !process.env.NEXT_PHASE?.includes('build')) {
    if (!jwtSecret || jwtSecret.length < 16) {
      const errorMsg = 'FATAL: [SECURITY] JWT_SECRET environment variable is missing or too short (minimum 16 characters). Application startup aborted for security.';
      console.error(`\n==================================================================\n${errorMsg}\n==================================================================\n`);
      throw new Error(errorMsg);
    }
  } else if (!jwtSecret) {
    console.warn('[SECURITY WARNING] JWT_SECRET environment variable is not configured. Authentication will fail until JWT_SECRET is set in .env.');
  }

  // 2. Run Drizzle ORM PostgreSQL migrations on startup.
  const { migrate } = await import('@/server/infra/migrate');
  await migrate();

  // 3. Initialize admin user from ADMIN + PASSWORD env vars.
  const { userService } = await import('@/server/service/user-service');
  await userService.init();

  // 4. Background cron tasks are only started when NOT running on serverless Vercel.
  if (!process.env.VERCEL) {
    const { startTasks } = await import('@/server/task');
    startTasks();
  }
}
