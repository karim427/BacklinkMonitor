CREATE TABLE "check_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"link_id" integer NOT NULL,
	"ran_at" timestamp with time zone NOT NULL,
	"http_status" integer,
	"link_found" boolean,
	"rel" jsonb,
	"anchor_found" text,
	"target_matched" boolean,
	"indexed" boolean,
	"placement_detected" text,
	"outbound_links" integer,
	"result" text,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "citations" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"directory" text NOT NULL,
	"name" text NOT NULL,
	"address" text NOT NULL,
	"phone" text NOT NULL,
	"gbp_match" text DEFAULT 'Mismatch' NOT NULL,
	"status" text DEFAULT 'Logged' NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_month_targets" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"month" text NOT NULL,
	"target" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clients" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"domain" text NOT NULL,
	"slug" text NOT NULL,
	"cluster" text NOT NULL,
	"city" text,
	"state" text,
	"is_cash_buyer" boolean DEFAULT false NOT NULL,
	"default_monthly_target" integer DEFAULT 4 NOT NULL,
	"gbp_name" text,
	"gbp_address" text,
	"gbp_phone" text,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "clients_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "donors" (
	"id" serial PRIMARY KEY NOT NULL,
	"domain" text NOT NULL,
	"name" text,
	"dr" integer DEFAULT 0 NOT NULL,
	"us_traffic_pct" integer DEFAULT 0 NOT NULL,
	"organic_traffic" integer DEFAULT 0 NOT NULL,
	"referring_domains" integer DEFAULT 0 NOT NULL,
	"linked_domains" integer DEFAULT 0 NOT NULL,
	"cluster" text NOT NULL,
	"niche" text,
	"is_local" boolean DEFAULT false NOT NULL,
	"local_area" text,
	"last_used_at" timestamp with time zone,
	"ahrefs_synced_at" timestamp with time zone,
	"traffic_history" jsonb,
	"flags" jsonb,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "donors_domain_unique" UNIQUE("domain")
);
--> statement-breakpoint
CREATE TABLE "haro_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"raw_email" text NOT NULL,
	"outlet" text,
	"journalist" text,
	"category" text,
	"title" text,
	"question" text,
	"requirements" text,
	"deadline" timestamp with time zone,
	"status" text DEFAULT 'New' NOT NULL,
	"matches" jsonb,
	"responses" jsonb,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "links" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"target_page_id" integer,
	"donor_id" integer NOT NULL,
	"source_url" text NOT NULL,
	"target_url" text NOT NULL,
	"anchor_text" text DEFAULT '' NOT NULL,
	"anchor_type" text DEFAULT 'Natural' NOT NULL,
	"placement" text DEFAULT 'Unknown' NOT NULL,
	"reviewer" text,
	"placed_at" timestamp with time zone,
	"notes" text,
	"verdict" text DEFAULT 'Partly relevant' NOT NULL,
	"stage" text DEFAULT 'Intake' NOT NULL,
	"verification_status" text DEFAULT 'Unverified' NOT NULL,
	"action" text DEFAULT 'LIVE' NOT NULL,
	"reject_reasons" jsonb,
	"last_checked_at" timestamp with time zone,
	"next_check_at" timestamp with time zone,
	"next_check_kind" text,
	"fix_window_ends_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prospects" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"domain" text NOT NULL,
	"page_url" text,
	"page_title" text,
	"snippet" text,
	"score" integer DEFAULT 0 NOT NULL,
	"label" text DEFAULT 'Not' NOT NULL,
	"why_it_scored" text,
	"matched_keyword" text,
	"source_query" text,
	"score_source" text DEFAULT 'heuristic' NOT NULL,
	"status" text DEFAULT 'New' NOT NULL,
	"discovered_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb
);
--> statement-breakpoint
CREATE TABLE "target_pages" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"url" text NOT NULL,
	"keyword" text NOT NULL,
	"current_rds" integer DEFAULT 0 NOT NULL,
	"rds_needed" integer DEFAULT 0 NOT NULL,
	"links_needed" integer DEFAULT 0 NOT NULL,
	"months_to_close" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'Pending' NOT NULL,
	"approval_month" text,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspace_month_targets" (
	"month" text PRIMARY KEY NOT NULL,
	"target" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "check_runs" ADD CONSTRAINT "check_runs_link_id_links_id_fk" FOREIGN KEY ("link_id") REFERENCES "public"."links"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "citations" ADD CONSTRAINT "citations_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_month_targets" ADD CONSTRAINT "client_month_targets_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "links" ADD CONSTRAINT "links_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "links" ADD CONSTRAINT "links_target_page_id_target_pages_id_fk" FOREIGN KEY ("target_page_id") REFERENCES "public"."target_pages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "links" ADD CONSTRAINT "links_donor_id_donors_id_fk" FOREIGN KEY ("donor_id") REFERENCES "public"."donors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospects" ADD CONSTRAINT "prospects_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "target_pages" ADD CONSTRAINT "target_pages_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cmt_uq" ON "client_month_targets" USING btree ("client_id","month");