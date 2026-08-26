/**
 * LeadPin veritabanı şeması — tek kaynak.
 *
 * Eski backend/schema.sql'in yerini alır. Supabase'e özgü olan her şey burada
 * karşılığıyla değiştirilmiştir:
 *   - auth.users(id) referansları  → users tablosu
 *   - auth.uid() default'ları      → yok; user_id'yi backend yazar
 *   - RLS politikaları             → yok; erişim denetimi uygulama katmanında
 *   - storage.buckets              → diskte /data/media
 *   - pg_cron job'ları             → services/cleanup.ts
 *   - track_short_id_click() RPC   → silindi (kodda hiç çağrılmıyordu)
 *
 * Kolon adları snake_case kalır (mevcut veriyle ve API şekliyle uyum için),
 * TypeScript tarafında camelCase kullanılır.
 */
import {
  pgTable,
  pgView,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  numeric,
  jsonb,
  index,
  uniqueIndex,
  unique,
  primaryKey,
  check,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// ============================================================================
// 0) KULLANICILAR — Supabase auth.users'ın yerine
// ============================================================================

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  // scrypt: "<saltHex>:<hashHex>"
  passwordHash: text('password_hash').notNull(),
  // Eskiden auth.users.raw_app_meta_data içinde JSON'du, artık normal kolon.
  isAdmin: boolean('is_admin').notNull().default(false),
  linkOwner: boolean('link_owner').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ============================================================================
// 1) ÇEKİRDEK TABLOLAR
// ============================================================================

export const businesses = pgTable(
  'businesses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull().default(''),
    category: text('category'),
    city: text('city'),
    district: text('district'),
    neighborhood: text('neighborhood'),
    address: text('address'),
    phone: text('phone'),
    website: text('website'),
    rating: numeric('rating', { precision: 3, scale: 2 }),
    reviewsCount: integer('reviews_count').default(0),
    googleMapsUrl: text('google_maps_url').unique(),
    shortId: text('short_id').unique(),
    shortIdClicks: integer('short_id_clicks').notNull().default(0),
    shortIdLastClickAt: timestamp('short_id_last_click_at', { withTimezone: true }),
    email: text('email'),
    instagram: text('instagram'),
    facebook: text('facebook'),
    source: text('source').notNull().default('scrape'),
    status: text('status').default('new'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_businesses_user').on(t.userId),
    index('idx_businesses_user_source').on(t.userId, t.source),
    index('idx_businesses_created').on(t.createdAt),
    check('businesses_source_check', sql`${t.source} in ('scrape','manual','excel')`),
    check(
      'businesses_status_check',
      sql`${t.status} in ('new','contacted','replied','converted','rejected')`,
    ),
  ],
);

export const scrapeJobs = pgTable(
  'scrape_jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    category: text('category').notNull(),
    city: text('city').notNull(),
    district: text('district'),
    neighborhood: text('neighborhood'),
    status: text('status').default('pending'),
    totalLeads: integer('total_leads').default(0),
    currentLead: integer('current_lead').default(0),
    errorMessage: text('error_message'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_scrape_jobs_user').on(t.userId, t.createdAt.desc()),
    check(
      'scrape_jobs_status_check',
      sql`${t.status} in ('pending','running','completed','failed','stopped')`,
    ),
  ],
);

export const lists = pgTable(
  'lists',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('idx_lists_user').on(t.userId, t.createdAt.desc())],
);

export const outreachLogs = pgTable(
  'outreach_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    businessId: uuid('business_id').references(() => businesses.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    status: text('status').default('sent'),
    messageContent: text('message_content'),
    // Aynı toplu kampanyadan gelen log'lar aynı batch_id'yi paylaşır (tekilde null);
    // UI bunları tek satırda gruplar.
    batchId: uuid('batch_id'),
    listId: uuid('list_id').references(() => lists.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_outreach_user').on(t.userId, t.createdAt.desc()),
    index('idx_outreach_biz').on(t.businessId),
    index('idx_outreach_batch').on(t.userId, t.batchId),
    check('outreach_logs_type_check', sql`${t.type} in ('whatsapp','email','instagram')`),
  ],
);

export const listItems = pgTable(
  'list_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    listId: uuid('list_id').references(() => lists.id, { onDelete: 'cascade' }),
    businessId: uuid('business_id').references(() => businesses.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_list_items_list').on(t.listId),
    unique('list_items_list_business_key').on(t.listId, t.businessId),
  ],
);

export const contacts = pgTable(
  'contacts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id, { onDelete: 'cascade' }),
    email: text('email'),
    instagram: text('instagram'),
    whatsapp: text('whatsapp'),
    facebook: text('facebook'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('idx_contacts_business').on(t.businessId)],
);

// ============================================================================
// 2) WHATSAPP
// ============================================================================

/**
 * Hat üstverisi. Eskiden .wwebjs_auth/_lines.json içinde, kilitsiz bir dosyada
 * tutuluyordu; bu backend'in tek process olmasını zorunlu kılıyordu. Chromium
 * oturum klasörleri (.wwebjs_auth/session-<id>/) diskte kalmaya devam eder.
 */
export const whatsappLines = pgTable(
  'whatsapp_lines',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    label: text('label').notNull(),
    phone: text('phone'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('idx_wa_lines_user').on(t.userId)],
);

export const whatsappAutoRules = pgTable(
  'whatsapp_auto_rules',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    lineId: text('line_id'), // null = tüm hatlar
    type: text('type').notNull(),
    name: text('name').notNull(),
    keywords: text('keywords').array().default(sql`'{}'`),
    matchType: text('match_type').default('contains'),
    response: text('response').notNull(),
    mediaUrl: text('media_url'),
    enabled: boolean('enabled').notNull().default(true),
    priority: integer('priority').notNull().default(0),
    replyOncePerContact: boolean('reply_once_per_contact').notNull().default(false),
    cooldownMinutes: integer('cooldown_minutes').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_auto_rules_user').on(t.userId),
    index('idx_auto_rules_user_enabled').on(t.userId, t.enabled),
    check('auto_rules_type_check', sql`${t.type} in ('greeting','keyword')`),
    check(
      'auto_rules_match_type_check',
      sql`${t.matchType} in ('contains','exact','starts_with')`,
    ),
  ],
);

export const whatsappGreetedContacts = pgTable(
  'whatsapp_greeted_contacts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    lineId: text('line_id').notNull(),
    contactPhone: text('contact_phone').notNull(),
    greetedAt: timestamp('greeted_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_greeted_user').on(t.userId),
    unique('greeted_line_phone_key').on(t.lineId, t.contactPhone),
  ],
);

export const whatsappRuleReplies = pgTable(
  'whatsapp_rule_replies',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    ruleId: uuid('rule_id')
      .notNull()
      .references(() => whatsappAutoRules.id, { onDelete: 'cascade' }),
    lineId: text('line_id').notNull(),
    contactPhone: text('contact_phone').notNull(),
    repliedAt: timestamp('replied_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_rule_replies_rule_contact').on(t.ruleId, t.contactPhone, t.repliedAt.desc()),
    index('idx_rule_replies_user').on(t.userId),
  ],
);

export const whatsappFeatureSettings = pgTable(
  'whatsapp_feature_settings',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    feature: text('feature').notNull(),
    enabled: boolean('enabled').notNull().default(true),
    activeHoursStart: text('active_hours_start'), // "HH:MM" veya null = 24 saat
    activeHoursEnd: text('active_hours_end'),
    activeDays: integer('active_days').array().notNull().default(sql`'{0,1,2,3,4,5,6}'`),
    timezone: text('timezone').notNull().default('Europe/Istanbul'),
    singleReplyOnly: boolean('single_reply_only').notNull().default(false),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.feature] }),
    index('idx_feature_settings_user').on(t.userId),
    check(
      'feature_settings_feature_check',
      sql`${t.feature} in ('greeting','autoreply','scheduled')`,
    ),
  ],
);

export const whatsappScheduledCampaigns = pgTable(
  'whatsapp_scheduled_campaigns',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    listId: uuid('list_id')
      .notNull()
      .references(() => lists.id, { onDelete: 'cascade' }),
    lineId: text('line_id'),
    name: text('name'),
    messageTemplate: text('message_template').notNull(),
    messageTemplateNoWebsite: text('message_template_no_website'),
    media: jsonb('media'),
    minDelaySec: integer('min_delay_sec').default(60),
    maxDelaySec: integer('max_delay_sec').default(120),
    coffeeBreakEvery: integer('coffee_break_every').default(20),
    coffeeBreakMinutes: integer('coffee_break_minutes').default(15),
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }).notNull(),
    status: text('status').notNull().default('pending'),
    error: text('error'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_scheduled_pending').on(t.scheduledAt),
    index('idx_scheduled_user').on(t.userId),
    check(
      'scheduled_status_check',
      sql`${t.status} in ('pending','running','completed','cancelled','failed')`,
    ),
  ],
);

export const whatsappMessageTemplates = pgTable(
  'whatsapp_message_templates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    content: text('content').notNull(),
    media: jsonb('media'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('idx_msg_templates_user').on(t.userId)],
);

// ============================================================================
// 3) KULLANICI AYARLARI
// ============================================================================

export const userSettings = pgTable(
  'user_settings',
  {
    userId: uuid('user_id')
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
    shortLinkPublicUrl: text('short_link_public_url'),
    shortLinkRedirectUrl: text('short_link_redirect_url'),
    whatsappProxyHost: text('whatsapp_proxy_host'),
    whatsappProxyPort: integer('whatsapp_proxy_port'),
    whatsappProxyType: text('whatsapp_proxy_type'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      'user_settings_proxy_type_check',
      sql`${t.whatsappProxyType} is null or ${t.whatsappProxyType} in ('http','socks5')`,
    ),
  ],
);

// ============================================================================
// 4) PLAN / ABONELİK / TOKEN
// ============================================================================

export const plans = pgTable('plans', {
  id: text('id').primaryKey(), // 'free' | 'pro' | 'unlimited'
  name: text('name').notNull(),
  priceUsd: numeric('price_usd', { precision: 8, scale: 2 }).notNull().default('0'),
  scrapeLimit: integer('scrape_limit').notNull(),
  messageLimit: integer('message_limit').notNull(),
  leadStorage: integer('lead_storage').notNull().default(500),
  displayOrder: integer('display_order').notNull().default(0),
});

export const subscriptionTokens = pgTable(
  'subscription_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    token: text('token').notNull().unique(),
    planId: text('plan_id')
      .notNull()
      .references(() => plans.id),
    status: text('status').notNull().default('unredeemed'),
    durationDays: integer('duration_days').notNull().default(30),
    note: text('note'),
    redeemedBy: uuid('redeemed_by').references(() => users.id, { onDelete: 'set null' }),
    redeemedAt: timestamp('redeemed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_tokens_status').on(t.status),
    index('idx_tokens_redeemed_by').on(t.redeemedBy),
    check(
      'tokens_status_check',
      sql`${t.status} in ('unredeemed','redeemed','expired','cancelled')`,
    ),
  ],
);

export const subscriptions = pgTable('subscriptions', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  planId: text('plan_id')
    .notNull()
    .default('free')
    .references(() => plans.id),
  currentPeriodStart: timestamp('current_period_start', { withTimezone: true })
    .notNull()
    .defaultNow(),
  currentPeriodEnd: timestamp('current_period_end', { withTimezone: true })
    .notNull()
    .default(sql`now() + interval '30 days'`),
  redeemedTokenId: uuid('redeemed_token_id').references(() => subscriptionTokens.id, {
    onDelete: 'set null',
  }),
  scrapeUsed: integer('scrape_used').notNull().default(0),
  messageUsed: integer('message_used').notNull().default(0),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ============================================================================
// 5) GÖRÜNÜM — silinme uyarısı banner'ı için
// ============================================================================

/**
 * 7 gün içinde otomatik temizliğe takılacak lead'ler.
 * Kriterler cleanup.ts'teki silme sorgusuyla aynı olmalı: 60 günden eski,
 * hiçbir listede değil, hiç mesaj atılmamış.
 */
export const businessesExpiringSoon = pgView('businesses_expiring_soon').as((qb) =>
  qb
    .select({
      userId: businesses.userId,
      id: businesses.id,
      name: businesses.name,
      createdAt: businesses.createdAt,
      expiresAt: sql<Date>`${businesses.createdAt} + interval '60 days'`.as('expires_at'),
    })
    .from(businesses)
    .where(
      sql`${businesses.createdAt} < now() - interval '53 days'
        and ${businesses.createdAt} >= now() - interval '60 days'
        and not exists (select 1 from list_items li where li.business_id = ${businesses.id})
        and not exists (select 1 from outreach_logs ol where ol.business_id = ${businesses.id})`,
    ),
);
