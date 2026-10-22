CREATE TYPE "public"."verification_method" AS ENUM('university_email', 'card');--> statement-breakpoint
CREATE TYPE "public"."verification_request_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TABLE "verifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"method" "verification_method" NOT NULL,
	"university_email" text,
	"school" text,
	"student_number" text,
	"card_object_key" text,
	"status" "verification_request_status" DEFAULT 'pending' NOT NULL,
	"rejection_reason" text,
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "verifications" ADD CONSTRAINT "verifications_user_id_profiles_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "verifications_user_idx" ON "verifications" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verifications_status_idx" ON "verifications" USING btree ("status");