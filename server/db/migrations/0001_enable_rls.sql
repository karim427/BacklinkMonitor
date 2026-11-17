-- Supabase exposes the public schema through its REST API. Enable RLS (with no policies) so the
-- public/publishable key cannot read or write anything; the app connects as the postgres role, which bypasses RLS.
ALTER TABLE "clients" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "client_month_targets" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "workspace_month_targets" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "target_pages" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "donors" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "links" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "check_runs" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "citations" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "prospects" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "haro_requests" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "settings" ENABLE ROW LEVEL SECURITY;
