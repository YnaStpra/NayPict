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
    console.warn('[MIGRATE] DATABASE_URL is not set — skipping migration during build or initialization.');
    return;
  }

  try {
    const sql = neon(process.env.DATABASE_URL);
    const db = drizzle(sql);

    // Apply all pending migrations from the drizzle/ folder (if available in current runtime environment).
    try {
      await drizzleMigrate(db, { migrationsFolder: './drizzle' });
    } catch (migErr) {
      console.warn('[MIGRATE] drizzleMigrate skipped or folder not found (normal on serverless):', migErr);
    }

    // Seed default system settings row if it doesn't already exist.
    try {
      await sql`
        INSERT INTO setting (key, value)
        VALUES (${SETTING_KEY}, ${JSON.stringify(settingDefaults)})
        ON CONFLICT (key) DO NOTHING
      `;
    } catch (settingErr) {
      console.warn('[MIGRATE] Error seeding settingDefaults:', settingErr);
    }

    // Ensure comment table and index exist in PostgreSQL.
    try {
      await sql`
        CREATE TABLE IF NOT EXISTS "comment" (
          "comment_id" text PRIMARY KEY NOT NULL,
          "photo_id" text NOT NULL,
          "name" text NOT NULL,
          "content" text NOT NULL,
          "reply_content" text,
          "reply_time" timestamp,
          "create_time" timestamp DEFAULT now() NOT NULL
        );
      `;
      await sql`
        ALTER TABLE "comment" ADD COLUMN IF NOT EXISTS "reply_content" text;
      `;
      await sql`
        ALTER TABLE "comment" ADD COLUMN IF NOT EXISTS "reply_time" timestamp;
      `;
      await sql`
        CREATE INDEX IF NOT EXISTS "comment_photo_id_idx" ON "comment" ("photo_id");
      `;
    } catch (commentErr) {
      console.warn('[MIGRATE] Error ensuring comment table:', commentErr);
    }

    // Ensure photo_view table and indexes exist in PostgreSQL for insights.
    try {
      await sql`
        CREATE TABLE IF NOT EXISTS "photo_view" (
          "id" text PRIMARY KEY NOT NULL,
          "photo_id" text NOT NULL REFERENCES "photo"("photo_id") ON DELETE CASCADE,
          "visitor_id" text NOT NULL,
          "type" text DEFAULT 'view' NOT NULL,
          "viewed_at" timestamp DEFAULT now() NOT NULL
        );
      `;
      await sql`
        CREATE INDEX IF NOT EXISTS "photo_view_photo_id_idx" ON "photo_view" ("photo_id");
      `;
      await sql`
        CREATE INDEX IF NOT EXISTS "photo_view_viewed_at_idx" ON "photo_view" ("viewed_at");
      `;
      await sql`
        CREATE INDEX IF NOT EXISTS "photo_view_dedup_idx" ON "photo_view" ("photo_id", "visitor_id", "type", "viewed_at");
      `;
    } catch (viewErr) {
      console.warn('[MIGRATE] Error ensuring photo_view table:', viewErr);
    }

    // Ensure album_photo table has is_pinned and pinned_at columns.
    try {
      await sql`
        ALTER TABLE "album_photo" ADD COLUMN IF NOT EXISTS "is_pinned" integer DEFAULT 0 NOT NULL;
      `;
      await sql`
        ALTER TABLE "album_photo" ADD COLUMN IF NOT EXISTS "pinned_at" timestamp;
      `;
    } catch (albumPhotoErr) {
      console.warn('[MIGRATE] Error updating album_photo columns:', albumPhotoErr);
    }

    // Ensure photo table has visibility column for display scope control.
    try {
      await sql`
        ALTER TABLE "photo" ADD COLUMN IF NOT EXISTS "visibility" integer DEFAULT 1 NOT NULL;
      `;
    } catch (photoVisErr) {
      console.warn('[MIGRATE] Error updating photo visibility column:', photoVisErr);
    }
  } catch (err) {
    console.warn('[MIGRATE] Could not run migration automatically:', err);
  }
}
