CREATE SCHEMA "authcore";
--> statement-breakpoint
CREATE TABLE "authcore"."users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
