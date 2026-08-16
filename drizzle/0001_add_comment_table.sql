CREATE TABLE IF NOT EXISTS "comment" (
	"comment_id" text PRIMARY KEY NOT NULL,
	"photo_id" text NOT NULL,
	"name" text NOT NULL,
	"content" text NOT NULL,
	"create_time" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "comment" ADD CONSTRAINT "comment_photo_id_photo_photo_id_fk" FOREIGN KEY ("photo_id") REFERENCES "public"."photo"("photo_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "comment_photo_id_idx" ON "comment" ("photo_id");
