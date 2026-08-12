CREATE TABLE "album_photo" (
	"id" text PRIMARY KEY NOT NULL,
	"photo_id" text NOT NULL,
	"album_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "album" (
	"album_id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"create_time" timestamp DEFAULT now() NOT NULL,
	"update_time" timestamp DEFAULT now() NOT NULL,
	"user_id" text NOT NULL,
	"cover_photo_id" text,
	"is_manual_cover" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cache" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"expire_time" integer
);
--> statement-breakpoint
CREATE TABLE "exif" (
	"photo_id" text PRIMARY KEY NOT NULL,
	"exif" text,
	"latitude" double precision,
	"longitude" double precision,
	"altitude" double precision
);
--> statement-breakpoint
CREATE TABLE "file" (
	"file_id" text PRIMARY KEY NOT NULL,
	"photo_id" text NOT NULL,
	"key" text NOT NULL,
	"type" integer NOT NULL,
	"file_type" text NOT NULL,
	"size" integer NOT NULL,
	CONSTRAINT "file_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "photo" (
	"photo_id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"thumb_hash" text,
	"checksum" text,
	"type" text NOT NULL,
	"type_desc" text NOT NULL,
	"size" integer NOT NULL,
	"width" integer,
	"height" integer,
	"taken_time" text,
	"create_time" timestamp DEFAULT now() NOT NULL,
	"recycle_time" text,
	"user_id" text NOT NULL,
	"status" integer DEFAULT 1 NOT NULL,
	"favorite" integer DEFAULT 1 NOT NULL,
	"storage_id" text,
	"allow_download" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "setting" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "storage" (
	"storage_id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"type" integer NOT NULL,
	"domain" text,
	"bucket" text,
	"region" text,
	"endpoint" text,
	"access_key" text,
	"secret_key" text,
	"user_id" text,
	"sort" integer DEFAULT 0 NOT NULL,
	"status" integer DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE "user" (
	"user_id" text PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"password" text NOT NULL,
	"salt" text NOT NULL,
	"avatar" text DEFAULT '' NOT NULL,
	"type" integer DEFAULT 2 NOT NULL,
	"status" integer DEFAULT 1 NOT NULL,
	"create_time" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_username_unique" UNIQUE("username")
);
