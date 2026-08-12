import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { migrate as drizzleMigrate } from 'drizzle-orm/neon-http/migrator';
import { SETTING_KEY } from '@/server/const/global';
import { SettingPhotoDedupEnum, SettingSyncDeleteEnum } from '@/server/enums/setting-enum';

// This module runs Drizzle ORM migrations against the Neon PostgreSQL database on startup.

// Default values for the system settings table.
const settingDefaults = {
  syncDelete: SettingSyncDeleteEnum.ENABLE,
  clearLast: 7,
  photoDedup: SettingPhotoDedupEnum.ENABLE,
};

// Run all pending Drizzle migrations and seed required default rows.
export async function migrate(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required for database migration.');
  }

  const sql = neon(process.env.DATABASE_URL);
  const db = drizzle(sql);

  // Apply all pending migrations from the drizzle/ folder.
  await drizzleMigrate(db, { migrationsFolder: './drizzle' });

  // Seed default system settings row if it doesn't already exist.
  await sql`
    INSERT INTO setting (key, value)
    VALUES (${SETTING_KEY}, ${JSON.stringify(settingDefaults)})
    ON CONFLICT (key) DO NOTHING
  `;
}
