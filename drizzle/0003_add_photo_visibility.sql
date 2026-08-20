ALTER TABLE "photo" ADD COLUMN IF NOT EXISTS "visibility" integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "photo_visibility_idx" ON "photo" ("visibility");
