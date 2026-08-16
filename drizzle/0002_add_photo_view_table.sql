CREATE TABLE IF NOT EXISTS "photo_view" (
	"id" text PRIMARY KEY NOT NULL,
	"photo_id" text NOT NULL,
	"visitor_id" text NOT NULL,
	"type" text DEFAULT 'view' NOT NULL,
	"viewed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "photo_view" ADD CONSTRAINT "photo_view_photo_id_photo_photo_id_fk" FOREIGN KEY ("photo_id") REFERENCES "public"."photo"("photo_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "photo_view_photo_id_idx" ON "photo_view" ("photo_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "photo_view_viewed_at_idx" ON "photo_view" ("viewed_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "photo_view_dedup_idx" ON "photo_view" ("photo_id", "visitor_id", "type", "viewed_at");
