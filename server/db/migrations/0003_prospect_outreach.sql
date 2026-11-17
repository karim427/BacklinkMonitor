ALTER TABLE "prospects" ADD COLUMN "contact_name" text;--> statement-breakpoint
ALTER TABLE "prospects" ADD COLUMN "contact_email" text;--> statement-breakpoint
ALTER TABLE "prospects" ADD COLUMN "owner" text;--> statement-breakpoint
ALTER TABLE "prospects" ADD COLUMN "notes" text;--> statement-breakpoint
ALTER TABLE "prospects" ADD COLUMN "last_contacted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "prospects" ADD COLUMN "follow_up_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "prospects" ADD COLUMN "link_id" integer;--> statement-breakpoint
ALTER TABLE "prospects" ADD CONSTRAINT "prospects_link_id_links_id_fk" FOREIGN KEY ("link_id") REFERENCES "public"."links"("id") ON DELETE set null ON UPDATE no action;