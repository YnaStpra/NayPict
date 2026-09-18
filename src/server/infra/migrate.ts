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
        ALTER TABLE "comment" ADD COLUMN IF NOT EXISTS "is_hearted" integer DEFAULT 0 NOT NULL;
      `;
      await sql`
        ALTER TABLE "comment" ADD COLUMN IF NOT EXISTS "is_pinned" integer DEFAULT 0 NOT NULL;
      `;
      await sql`
        CREATE INDEX IF NOT EXISTS "comment_photo_id_idx" ON "comment" ("photo_id");
      `;
      await sql`
        CREATE INDEX IF NOT EXISTS "comment_pinned_idx" ON "comment" ("photo_id", "is_pinned");
      `;
    } catch (commentErr) {
      console.warn('[MIGRATE] Error ensuring comment table:', commentErr);
    }

    // Ensure photo_reaction table exists for emoji reactions and claps.
    try {
      await sql`
        CREATE TABLE IF NOT EXISTS "photo_reaction" (
          "id" text PRIMARY KEY NOT NULL,
          "photo_id" text NOT NULL REFERENCES "photo"("photo_id") ON DELETE CASCADE,
          "visitor_id" text NOT NULL,
          "reaction_type" text NOT NULL,
          "count" integer DEFAULT 1 NOT NULL,
          "created_at" timestamp DEFAULT now() NOT NULL,
          "updated_at" timestamp DEFAULT now() NOT NULL
        );
      `;
      await sql`
        CREATE UNIQUE INDEX IF NOT EXISTS "photo_reaction_unique_idx" ON "photo_reaction" ("photo_id", "visitor_id", "reaction_type");
      `;
      await sql`
        CREATE INDEX IF NOT EXISTS "photo_reaction_photo_id_idx" ON "photo_reaction" ("photo_id");
      `;
    } catch (reactionErr) {
      console.warn('[MIGRATE] Error ensuring photo_reaction table:', reactionErr);
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
        CREATE INDEX IF NOT EXISTS "photo_view_photo_type_idx" ON "photo_view" ("photo_id", "type");
      `;
      await sql`
        CREATE INDEX IF NOT EXISTS "photo_view_type_time_idx" ON "photo_view" ("type", "viewed_at");
      `;
      await sql`
        CREATE INDEX IF NOT EXISTS "photo_view_dedup_idx" ON "photo_view" ("photo_id", "visitor_id", "type", "viewed_at");
      `;
    } catch (viewErr) {
      console.warn('[MIGRATE] Error ensuring photo_view table:', viewErr);
    }

    // Ensure album table has is_archived column for album archiving.
    try {
      await sql`
        ALTER TABLE "album" ADD COLUMN IF NOT EXISTS "is_archived" integer DEFAULT 0 NOT NULL;
      `;
      await sql`
        CREATE INDEX IF NOT EXISTS "album_is_archived_idx" ON "album" ("is_archived");
      `;
    } catch (albumArchErr) {
      console.warn('[MIGRATE] Error updating album is_archived column:', albumArchErr);
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

    // Ensure user table has token_version column for session invalidation.
    try {
      await sql`
        ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "token_version" integer DEFAULT 1 NOT NULL;
      `;
    } catch (userTokenErr) {
      console.warn('[MIGRATE] Error updating user token_version column:', userTokenErr);
    }

    // Ensure visitor_session and visitor_activity tables exist for web visitor analytics.
    try {
      await sql`
        CREATE TABLE IF NOT EXISTS "visitor_session" (
          "id" text PRIMARY KEY NOT NULL,
          "visitor_id" text NOT NULL,
          "ip" text DEFAULT '' NOT NULL,
          "country" text DEFAULT '' NOT NULL,
          "city" text DEFAULT '' NOT NULL,
          "region" text DEFAULT '' NOT NULL,
          "browser" text DEFAULT '' NOT NULL,
          "browser_version" text DEFAULT '' NOT NULL,
          "os" text DEFAULT '' NOT NULL,
          "device" text DEFAULT 'Desktop' NOT NULL,
          "referrer" text DEFAULT 'Direct' NOT NULL,
          "landing_path" text DEFAULT '/' NOT NULL,
          "started_at" timestamptz DEFAULT now() NOT NULL,
          "last_active_at" timestamptz DEFAULT now() NOT NULL,
          "duration_seconds" integer DEFAULT 0 NOT NULL,
          "media_count" integer DEFAULT 0 NOT NULL,
          "is_admin" integer DEFAULT 0 NOT NULL,
          "user_lat" text DEFAULT '' NOT NULL,
          "user_lng" text DEFAULT '' NOT NULL,
          "user_location_name" text DEFAULT '' NOT NULL
        );
      `;
      await sql`CREATE INDEX IF NOT EXISTS "visitor_session_started_at_idx" ON "visitor_session" ("started_at");`;
      await sql`CREATE INDEX IF NOT EXISTS "visitor_session_last_active_idx" ON "visitor_session" ("last_active_at");`;
      await sql`CREATE INDEX IF NOT EXISTS "visitor_session_visitor_id_idx" ON "visitor_session" ("visitor_id");`;
      await sql`CREATE INDEX IF NOT EXISTS "visitor_session_ip_idx" ON "visitor_session" ("ip");`;

      await sql`ALTER TABLE "visitor_session" ADD COLUMN IF NOT EXISTS "user_lat" text DEFAULT '';`;
      await sql`ALTER TABLE "visitor_session" ADD COLUMN IF NOT EXISTS "user_lng" text DEFAULT '';`;
      await sql`ALTER TABLE "visitor_session" ADD COLUMN IF NOT EXISTS "user_location_name" text DEFAULT '';`;

      await sql`
        CREATE TABLE IF NOT EXISTS "visitor_activity" (
          "id" text PRIMARY KEY NOT NULL,
          "session_id" text NOT NULL REFERENCES "visitor_session"("id") ON DELETE CASCADE,
          "photo_id" text NOT NULL REFERENCES "photo"("photo_id") ON DELETE CASCADE,
          "action" text DEFAULT 'view' NOT NULL,
          "created_at" timestamptz DEFAULT now() NOT NULL
        );
      `;

      await sql`CREATE INDEX IF NOT EXISTS "visitor_activity_session_id_idx" ON "visitor_activity" ("session_id");`;
      await sql`CREATE INDEX IF NOT EXISTS "visitor_activity_photo_id_idx" ON "visitor_activity" ("photo_id");`;
      await sql`CREATE INDEX IF NOT EXISTS "visitor_activity_photo_action_idx" ON "visitor_activity" ("photo_id", "action");`;
      await sql`CREATE INDEX IF NOT EXISTS "visitor_activity_created_at_idx" ON "visitor_activity" ("created_at");`;
    } catch (analyticsErr) {
      console.warn('[MIGRATE] Error ensuring visitor analytics tables:', analyticsErr);
    }
  } catch (err) {
    console.warn('[MIGRATE] Could not run migration automatically:', err);
  }
}

