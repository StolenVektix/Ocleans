CREATE TYPE "public"."booking_status" AS ENUM('pending', 'accepted', 'declined', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."meal_status" AS ENUM('open', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('student', 'host', 'admin');--> statement-breakpoint
CREATE TYPE "public"."verification_status" AS ENUM('none', 'pending', 'verified', 'rejected');--> statement-breakpoint
CREATE TABLE "bookings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"meal_id" uuid NOT NULL,
	"student_id" text NOT NULL,
	"request_message" text DEFAULT '' NOT NULL,
	"status" "booking_status" DEFAULT 'pending' NOT NULL,
	"cancelled_by" text,
	"cancel_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bookings_meal_student_unique" UNIQUE("meal_id","student_id")
);
--> statement-breakpoint
CREATE TABLE "meals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"host_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"neighborhood" text NOT NULL,
	"address" text NOT NULL,
	"seats_total" integer NOT NULL,
	"diet_tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"allergens" text DEFAULT '' NOT NULL,
	"status" "meal_status" DEFAULT 'open' NOT NULL,
	"cancel_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"user_id" text PRIMARY KEY NOT NULL,
	"role" "role" NOT NULL,
	"first_name" text NOT NULL,
	"bio" text DEFAULT '' NOT NULL,
	"school" text,
	"verification_status" "verification_status" DEFAULT 'none' NOT NULL,
	"suspended" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_meal_id_meals_id_fk" FOREIGN KEY ("meal_id") REFERENCES "public"."meals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_student_id_profiles_user_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meals" ADD CONSTRAINT "meals_host_id_profiles_user_id_fk" FOREIGN KEY ("host_id") REFERENCES "public"."profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bookings_student_idx" ON "bookings" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "meals_starts_at_idx" ON "meals" USING btree ("starts_at");--> statement-breakpoint
CREATE INDEX "meals_host_idx" ON "meals" USING btree ("host_id");