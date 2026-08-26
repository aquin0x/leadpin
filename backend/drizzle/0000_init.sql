CREATE TABLE "businesses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"name" text DEFAULT '' NOT NULL,
	"category" text,
	"city" text,
	"district" text,
	"neighborhood" text,
	"address" text,
	"phone" text,
	"website" text,
	"rating" numeric(3, 2),
	"reviews_count" integer DEFAULT 0,
	"google_maps_url" text,
	"short_id" text,
	"short_id_clicks" integer DEFAULT 0 NOT NULL,
	"short_id_last_click_at" timestamp with time zone,
	"email" text,
	"instagram" text,
	"facebook" text,
	"source" text DEFAULT 'scrape' NOT NULL,
	"status" text DEFAULT 'new',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "businesses_google_maps_url_unique" UNIQUE("google_maps_url"),
	CONSTRAINT "businesses_short_id_unique" UNIQUE("short_id"),
	CONSTRAINT "businesses_source_check" CHECK ("businesses"."source" in ('scrape','manual','excel')),
	CONSTRAINT "businesses_status_check" CHECK ("businesses"."status" in ('new','contacted','replied','converted','rejected'))
);
--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"email" text,
	"instagram" text,
	"whatsapp" text,
	"facebook" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "list_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"list_id" uuid,
	"business_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "list_items_list_business_key" UNIQUE("list_id","business_id")
);
--> statement-breakpoint
CREATE TABLE "lists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outreach_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"business_id" uuid,
	"type" text NOT NULL,
	"status" text DEFAULT 'sent',
	"message_content" text,
	"batch_id" uuid,
	"list_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "outreach_logs_type_check" CHECK ("outreach_logs"."type" in ('whatsapp','email','instagram'))
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"price_usd" numeric(8, 2) DEFAULT '0' NOT NULL,
	"scrape_limit" integer NOT NULL,
	"message_limit" integer NOT NULL,
	"lead_storage" integer DEFAULT 500 NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scrape_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"category" text NOT NULL,
	"city" text NOT NULL,
	"district" text,
	"neighborhood" text,
	"status" text DEFAULT 'pending',
	"total_leads" integer DEFAULT 0,
	"current_lead" integer DEFAULT 0,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scrape_jobs_status_check" CHECK ("scrape_jobs"."status" in ('pending','running','completed','failed','stopped'))
);
--> statement-breakpoint
CREATE TABLE "subscription_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token" text NOT NULL,
	"plan_id" text NOT NULL,
	"status" text DEFAULT 'unredeemed' NOT NULL,
	"duration_days" integer DEFAULT 30 NOT NULL,
	"note" text,
	"redeemed_by" uuid,
	"redeemed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscription_tokens_token_unique" UNIQUE("token"),
	CONSTRAINT "tokens_status_check" CHECK ("subscription_tokens"."status" in ('unredeemed','redeemed','expired','cancelled'))
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"plan_id" text DEFAULT 'free' NOT NULL,
	"current_period_start" timestamp with time zone DEFAULT now() NOT NULL,
	"current_period_end" timestamp with time zone DEFAULT now() + interval '30 days' NOT NULL,
	"redeemed_token_id" uuid,
	"scrape_used" integer DEFAULT 0 NOT NULL,
	"message_used" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_settings" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"short_link_public_url" text,
	"short_link_redirect_url" text,
	"whatsapp_proxy_host" text,
	"whatsapp_proxy_port" integer,
	"whatsapp_proxy_type" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_settings_proxy_type_check" CHECK ("user_settings"."whatsapp_proxy_type" is null or "user_settings"."whatsapp_proxy_type" in ('http','socks5'))
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"is_admin" boolean DEFAULT false NOT NULL,
	"link_owner" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "whatsapp_auto_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"line_id" text,
	"type" text NOT NULL,
	"name" text NOT NULL,
	"keywords" text[] DEFAULT '{}',
	"match_type" text DEFAULT 'contains',
	"response" text NOT NULL,
	"media_url" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"reply_once_per_contact" boolean DEFAULT false NOT NULL,
	"cooldown_minutes" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auto_rules_type_check" CHECK ("whatsapp_auto_rules"."type" in ('greeting','keyword')),
	CONSTRAINT "auto_rules_match_type_check" CHECK ("whatsapp_auto_rules"."match_type" in ('contains','exact','starts_with'))
);
--> statement-breakpoint
CREATE TABLE "whatsapp_feature_settings" (
	"user_id" uuid NOT NULL,
	"feature" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"active_hours_start" text,
	"active_hours_end" text,
	"active_days" integer[] DEFAULT '{0,1,2,3,4,5,6}' NOT NULL,
	"timezone" text DEFAULT 'Europe/Istanbul' NOT NULL,
	"single_reply_only" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "whatsapp_feature_settings_user_id_feature_pk" PRIMARY KEY("user_id","feature"),
	CONSTRAINT "feature_settings_feature_check" CHECK ("whatsapp_feature_settings"."feature" in ('greeting','autoreply','scheduled'))
);
--> statement-breakpoint
CREATE TABLE "whatsapp_greeted_contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"line_id" text NOT NULL,
	"contact_phone" text NOT NULL,
	"greeted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "greeted_line_phone_key" UNIQUE("line_id","contact_phone")
);
--> statement-breakpoint
CREATE TABLE "whatsapp_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"label" text NOT NULL,
	"phone" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whatsapp_message_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"content" text NOT NULL,
	"media" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whatsapp_rule_replies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"rule_id" uuid NOT NULL,
	"line_id" text NOT NULL,
	"contact_phone" text NOT NULL,
	"replied_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whatsapp_scheduled_campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"list_id" uuid NOT NULL,
	"line_id" text,
	"name" text,
	"message_template" text NOT NULL,
	"message_template_no_website" text,
	"media" jsonb,
	"min_delay_sec" integer DEFAULT 60,
	"max_delay_sec" integer DEFAULT 120,
	"coffee_break_every" integer DEFAULT 20,
	"coffee_break_minutes" integer DEFAULT 15,
	"scheduled_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"error" text,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scheduled_status_check" CHECK ("whatsapp_scheduled_campaigns"."status" in ('pending','running','completed','cancelled','failed'))
);
--> statement-breakpoint
ALTER TABLE "businesses" ADD CONSTRAINT "businesses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "list_items" ADD CONSTRAINT "list_items_list_id_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."lists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "list_items" ADD CONSTRAINT "list_items_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lists" ADD CONSTRAINT "lists_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outreach_logs" ADD CONSTRAINT "outreach_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outreach_logs" ADD CONSTRAINT "outreach_logs_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outreach_logs" ADD CONSTRAINT "outreach_logs_list_id_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."lists"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scrape_jobs" ADD CONSTRAINT "scrape_jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_tokens" ADD CONSTRAINT "subscription_tokens_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_tokens" ADD CONSTRAINT "subscription_tokens_redeemed_by_users_id_fk" FOREIGN KEY ("redeemed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_redeemed_token_id_subscription_tokens_id_fk" FOREIGN KEY ("redeemed_token_id") REFERENCES "public"."subscription_tokens"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_auto_rules" ADD CONSTRAINT "whatsapp_auto_rules_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_feature_settings" ADD CONSTRAINT "whatsapp_feature_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_greeted_contacts" ADD CONSTRAINT "whatsapp_greeted_contacts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_lines" ADD CONSTRAINT "whatsapp_lines_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_message_templates" ADD CONSTRAINT "whatsapp_message_templates_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_rule_replies" ADD CONSTRAINT "whatsapp_rule_replies_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_rule_replies" ADD CONSTRAINT "whatsapp_rule_replies_rule_id_whatsapp_auto_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."whatsapp_auto_rules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_scheduled_campaigns" ADD CONSTRAINT "whatsapp_scheduled_campaigns_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_scheduled_campaigns" ADD CONSTRAINT "whatsapp_scheduled_campaigns_list_id_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."lists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_businesses_user" ON "businesses" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_businesses_user_source" ON "businesses" USING btree ("user_id","source");--> statement-breakpoint
CREATE INDEX "idx_businesses_created" ON "businesses" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_contacts_business" ON "contacts" USING btree ("business_id");--> statement-breakpoint
CREATE INDEX "idx_list_items_list" ON "list_items" USING btree ("list_id");--> statement-breakpoint
CREATE INDEX "idx_lists_user" ON "lists" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_outreach_user" ON "outreach_logs" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_outreach_biz" ON "outreach_logs" USING btree ("business_id");--> statement-breakpoint
CREATE INDEX "idx_outreach_batch" ON "outreach_logs" USING btree ("user_id","batch_id");--> statement-breakpoint
CREATE INDEX "idx_scrape_jobs_user" ON "scrape_jobs" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_tokens_status" ON "subscription_tokens" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_tokens_redeemed_by" ON "subscription_tokens" USING btree ("redeemed_by");--> statement-breakpoint
CREATE INDEX "idx_auto_rules_user" ON "whatsapp_auto_rules" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_auto_rules_user_enabled" ON "whatsapp_auto_rules" USING btree ("user_id","enabled");--> statement-breakpoint
CREATE INDEX "idx_feature_settings_user" ON "whatsapp_feature_settings" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_greeted_user" ON "whatsapp_greeted_contacts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_wa_lines_user" ON "whatsapp_lines" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_msg_templates_user" ON "whatsapp_message_templates" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_rule_replies_rule_contact" ON "whatsapp_rule_replies" USING btree ("rule_id","contact_phone","replied_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_rule_replies_user" ON "whatsapp_rule_replies" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_scheduled_pending" ON "whatsapp_scheduled_campaigns" USING btree ("scheduled_at");--> statement-breakpoint
CREATE INDEX "idx_scheduled_user" ON "whatsapp_scheduled_campaigns" USING btree ("user_id");--> statement-breakpoint
CREATE VIEW "public"."businesses_expiring_soon" AS (select "user_id", "id", "name", "created_at", "created_at" + interval '60 days' as "expires_at" from "businesses" where "businesses"."created_at" < now() - interval '53 days'
        and "businesses"."created_at" >= now() - interval '60 days'
        and not exists (select 1 from list_items li where li.business_id = "businesses"."id")
        and not exists (select 1 from outreach_logs ol where ol.business_id = "businesses"."id"));