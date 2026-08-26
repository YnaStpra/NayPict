import { clearExpiredCacheTask } from '@/server/task/cache-task';
import { clearExpiredPhotoTask } from '@/server/task/photo-task';

// This module starts server-side scheduled tasks.

const globalForTask = globalThis as typeof globalThis & { __albumTasksStarted?: boolean };

// Register and start all scheduled tasks, Only start once when developing hot updates.
function startTasks() {
  if (globalForTask.__albumTasksStarted) {
    return;
  }

  globalForTask.__albumTasksStarted = true;
  clearExpiredPhotoTask();
  clearExpiredCacheTask();
}

export { startTasks };
