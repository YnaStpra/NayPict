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

  // Reject legacy or native public R2 domains so originals cannot bypass the media authorization proxy.
  if (process.env.NODE_ENV === 'production' && !process.env.NEXT_PHASE?.includes('build')) {
    const legacyPublicUrl = process.env.R2_PUBLIC_URL?.trim();
    const mediaGatewayUrl = process.env.R2_MEDIA_GATEWAY_URL?.trim();
    const gatewayHost = mediaGatewayUrl ? new URL(mediaGatewayUrl).hostname.toLowerCase() : '';

    if (legacyPublicUrl || gatewayHost === 'r2.dev' || gatewayHost.endsWith('.r2.dev')) {
      throw new Error('FATAL: [SECURITY] Disable native R2 public access, remove R2_PUBLIC_URL, and configure R2_MEDIA_GATEWAY_URL with the allowlisted Worker gateway.');
    }
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
