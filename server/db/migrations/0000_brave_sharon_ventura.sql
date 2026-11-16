CREATE TABLE `check_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`link_id` integer NOT NULL,
	`ran_at` integer NOT NULL,
	`http_status` integer,
	`link_found` integer,
	`rel` text,
	`anchor_found` text,
	`target_matched` integer,
	`indexed` integer,
	`placement_detected` text,
	`outbound_links` integer,
	`result` text,
	`error` text,
	FOREIGN KEY (`link_id`) REFERENCES `links`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `citations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`client_id` integer NOT NULL,
	`directory` text NOT NULL,
	`name` text NOT NULL,
	`address` text NOT NULL,
	`phone` text NOT NULL,
	`gbp_match` text DEFAULT 'Mismatch' NOT NULL,
	`status` text DEFAULT 'Logged' NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `client_month_targets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`client_id` integer NOT NULL,
	`month` text NOT NULL,
	`target` integer NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cmt_uq` ON `client_month_targets` (`client_id`,`month`);--> statement-breakpoint
CREATE TABLE `clients` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`domain` text NOT NULL,
	`slug` text NOT NULL,
	`cluster` text NOT NULL,
	`city` text,
	`state` text,
	`is_cash_buyer` integer DEFAULT false NOT NULL,
	`default_monthly_target` integer DEFAULT 4 NOT NULL,
	`gbp_name` text,
	`gbp_address` text,
	`gbp_phone` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `clients_slug_unique` ON `clients` (`slug`);--> statement-breakpoint
CREATE TABLE `donors` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`domain` text NOT NULL,
	`name` text,
	`dr` integer DEFAULT 0 NOT NULL,
	`us_traffic_pct` integer DEFAULT 0 NOT NULL,
	`organic_traffic` integer DEFAULT 0 NOT NULL,
	`referring_domains` integer DEFAULT 0 NOT NULL,
	`linked_domains` integer DEFAULT 0 NOT NULL,
	`cluster` text NOT NULL,
	`niche` text,
	`is_local` integer DEFAULT false NOT NULL,
	`local_area` text,
	`last_used_at` integer,
	`ahrefs_synced_at` integer,
	`traffic_history` text,
	`flags` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `donors_domain_unique` ON `donors` (`domain`);--> statement-breakpoint
CREATE TABLE `haro_requests` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`raw_email` text NOT NULL,
	`outlet` text,
	`journalist` text,
	`category` text,
	`title` text,
	`question` text,
	`requirements` text,
	`deadline` integer,
	`status` text DEFAULT 'New' NOT NULL,
	`matches` text,
	`responses` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `links` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`client_id` integer NOT NULL,
	`target_page_id` integer,
	`donor_id` integer NOT NULL,
	`source_url` text NOT NULL,
	`target_url` text NOT NULL,
	`anchor_text` text DEFAULT '' NOT NULL,
	`anchor_type` text DEFAULT 'Natural' NOT NULL,
	`placement` text DEFAULT 'Unknown' NOT NULL,
	`reviewer` text,
	`placed_at` integer,
	`notes` text,
	`verdict` text DEFAULT 'Partly relevant' NOT NULL,
	`stage` text DEFAULT 'Intake' NOT NULL,
	`verification_status` text DEFAULT 'Unverified' NOT NULL,
	`action` text DEFAULT 'LIVE' NOT NULL,
	`reject_reasons` text,
	`last_checked_at` integer,
	`next_check_at` integer,
	`next_check_kind` text,
	`fix_window_ends_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`target_page_id`) REFERENCES `target_pages`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`donor_id`) REFERENCES `donors`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `prospects` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`client_id` integer NOT NULL,
	`domain` text NOT NULL,
	`page_url` text,
	`page_title` text,
	`snippet` text,
	`score` integer DEFAULT 0 NOT NULL,
	`label` text DEFAULT 'Not' NOT NULL,
	`why_it_scored` text,
	`matched_keyword` text,
	`source_query` text,
	`score_source` text DEFAULT 'heuristic' NOT NULL,
	`status` text DEFAULT 'New' NOT NULL,
	`discovered_at` integer NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text
);
--> statement-breakpoint
CREATE TABLE `target_pages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`client_id` integer NOT NULL,
	`url` text NOT NULL,
	`keyword` text NOT NULL,
	`current_rds` integer DEFAULT 0 NOT NULL,
	`rds_needed` integer DEFAULT 0 NOT NULL,
	`links_needed` integer DEFAULT 0 NOT NULL,
	`months_to_close` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'Pending' NOT NULL,
	`approval_month` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `workspace_month_targets` (
	`month` text PRIMARY KEY NOT NULL,
	`target` integer NOT NULL
);
