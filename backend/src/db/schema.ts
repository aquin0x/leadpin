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
 * Kural: TypeScript anahtarı = kolon adı (snake_case). Drizzle sorgu sonucunda
 * şemadaki TS anahtarını döndürdüğü için, bu sayede API yanıtlarının şekli
 * Supabase dönemiyle birebir aynı kalır ve frontend'de tek satır değişmez.
 * camelCase kullanılsaydı reviews_count / created_at gibi alanlar sessizce
 * undefined olurdu — uçtan uca tip kontrolü olmadığı için derleme de yakalamazdı.
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
  id: uuid().primaryKey().defaultRandom(),
  email: text().notNull().unique(),
  // scrypt: "<saltHex>:<hashHex>"
  password_hash: text().notNull(),
  // Eskiden auth.users.raw_app_meta_data içinde JSON'du, artık normal kolon.
  is_admin: boolean().notNull().default(false),
  link_owner: boolean().notNull().default(false),
  created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

// ============================================================================
// 1) ÇEKİRDEK TABLOLAR
// ============================================================================

export const businesses = pgTable(
  'businesses',
  {
    id: uuid().primaryKey().defaultRandom(),
    user_id: uuid().references(() => users.id, { onDelete: 'cascade' }),
    name: text().notNull().default(''),
    category: text(),
    city: text(),
    district: text(),
    neighborhood: text(),
    address: text(),
    phone: text(),
    website: text(),
    // mode:'number' ŞART. Drizzle numeric'i varsayılan olarak string döndürür;
    // PostgREST JSON sayısı döndürüyordu ve frontend Business.rating'i number
    // olarak okuyor. $type<number>() burada yetmez — o yalnızca derleme
    // zamanı bir iddiadır, runtime'da yine string gelir.
    rating: numeric({ precision: 3, scale: 2, mode: 'number' }),
    reviews_count: integer().default(0),
    google_maps_url: text().unique(),
    short_id: text().unique(),
    short_id_clicks: integer().notNull().default(0),
    short_id_last_click_at: timestamp({ withTimezone: true }),
    email: text(),
    instagram: text(),
    facebook: text(),
    source: text().notNull().default('scrape'),
    status: text().default('new'),
    created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_businesses_user').on(t.user_id),
    index('idx_businesses_user_source').on(t.user_id, t.source),
    index('idx_businesses_created').on(t.created_at),
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
    id: uuid().primaryKey().defaultRandom(),
    user_id: uuid().references(() => users.id, { onDelete: 'cascade' }),
    category: text().notNull(),
    city: text().notNull(),
    district: text(),
    neighborhood: text(),
    status: text().default('pending'),
    total_leads: integer().default(0),
    current_lead: integer().default(0),
    error_message: text(),
    created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_scrape_jobs_user').on(t.user_id, t.created_at.desc()),
    check(
      'scrape_jobs_status_check',
      sql`${t.status} in ('pending','running','completed','failed','stopped')`,
    ),
  ],
);

export const lists = pgTable(
  'lists',
  {
    id: uuid().primaryKey().defaultRandom(),
    user_id: uuid().references(() => users.id, { onDelete: 'cascade' }),
    name: text().notNull(),
    description: text(),
    created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('idx_lists_user').on(t.user_id, t.created_at.desc())],
);

export const outreachLogs = pgTable(
  'outreach_logs',
  {
    id: uuid().primaryKey().defaultRandom(),
    user_id: uuid().references(() => users.id, { onDelete: 'cascade' }),
    business_id: uuid().references(() => businesses.id, { onDelete: 'cascade' }),
    type: text().notNull(),
    status: text().default('sent'),
    message_content: text(),
    // Aynı toplu kampanyadan gelen log'lar aynı batch_id'yi paylaşır (tekilde null);
    // UI bunları tek satırda gruplar.
    batch_id: uuid(),
    list_id: uuid().references(() => lists.id, { onDelete: 'set null' }),
    created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_outreach_user').on(t.user_id, t.created_at.desc()),
    index('idx_outreach_biz').on(t.business_id),
    index('idx_outreach_batch').on(t.user_id, t.batch_id),
    check('outreach_logs_type_check', sql`${t.type} in ('whatsapp','email','instagram')`),
  ],
);

export const listItems = pgTable(
  'list_items',
  {
    id: uuid().primaryKey().defaultRandom(),
    list_id: uuid().references(() => lists.id, { onDelete: 'cascade' }),
    business_id: uuid().references(() => businesses.id, { onDelete: 'cascade' }),
    created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_list_items_list').on(t.list_id),
    unique('list_items_list_business_key').on(t.list_id, t.business_id),
  ],
);

export const contacts = pgTable(
  'contacts',
  {
    id: uuid().primaryKey().defaultRandom(),
    business_id: uuid()
      .notNull()
      .references(() => businesses.id, { onDelete: 'cascade' }),
    email: text(),
    instagram: text(),
    whatsapp: text(),
    facebook: text(),
    created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('idx_contacts_business').on(t.business_id)],
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
    id: uuid().primaryKey().defaultRandom(),
    user_id: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    label: text().notNull(),
    phone: text(),
    created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('idx_wa_lines_user').on(t.user_id)],
);

export const whatsappAutoRules = pgTable(
  'whatsapp_auto_rules',
  {
    id: uuid().primaryKey().defaultRandom(),
    user_id: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    line_id: text(), // null = tüm hatlar
    type: text().notNull(),
    name: text().notNull(),
    keywords: text().array().default(sql`'{}'`),
    match_type: text().default('contains'),
    response: text().notNull(),
    media_url: text(),
    enabled: boolean().notNull().default(true),
    priority: integer().notNull().default(0),
    reply_once_per_contact: boolean().notNull().default(false),
    cooldown_minutes: integer().notNull().default(0),
    created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_auto_rules_user').on(t.user_id),
    index('idx_auto_rules_user_enabled').on(t.user_id, t.enabled),
    check('auto_rules_type_check', sql`${t.type} in ('greeting','keyword')`),
    check(
      'auto_rules_match_type_check',
      sql`${t.match_type} in ('contains','exact','starts_with')`,
    ),
  ],
);

export const whatsappGreetedContacts = pgTable(
  'whatsapp_greeted_contacts',
  {
    id: uuid().primaryKey().defaultRandom(),
    user_id: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    line_id: text().notNull(),
    contact_phone: text().notNull(),
    greeted_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_greeted_user').on(t.user_id),
    unique('greeted_line_phone_key').on(t.line_id, t.contact_phone),
  ],
);

export const whatsappRuleReplies = pgTable(
  'whatsapp_rule_replies',
  {
    id: uuid().primaryKey().defaultRandom(),
    user_id: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    rule_id: uuid()
      .notNull()
      .references(() => whatsappAutoRules.id, { onDelete: 'cascade' }),
    line_id: text().notNull(),
    contact_phone: text().notNull(),
    replied_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_rule_replies_rule_contact').on(t.rule_id, t.contact_phone, t.replied_at.desc()),
    index('idx_rule_replies_user').on(t.user_id),
  ],
);

export const whatsappFeatureSettings = pgTable(
  'whatsapp_feature_settings',
  {
    user_id: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    feature: text().notNull(),
    enabled: boolean().notNull().default(true),
    active_hours_start: text(), // "HH:MM" veya null = 24 saat
    active_hours_end: text(),
    active_days: integer().array().notNull().default(sql`'{0,1,2,3,4,5,6}'`),
    timezone: text().notNull().default('Europe/Istanbul'),
    single_reply_only: boolean().notNull().default(false),
    updated_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.user_id, t.feature] }),
    index('idx_feature_settings_user').on(t.user_id),
    check(
      'feature_settings_feature_check',
      sql`${t.feature} in ('greeting','autoreply','scheduled')`,
    ),
  ],
);

export const whatsappScheduledCampaigns = pgTable(
  'whatsapp_scheduled_campaigns',
  {
    id: uuid().primaryKey().defaultRandom(),
    user_id: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    list_id: uuid()
      .notNull()
      .references(() => lists.id, { onDelete: 'cascade' }),
    line_id: text(),
    name: text(),
    message_template: text().notNull(),
    message_template_no_website: text(),
    media: jsonb(),
    min_delay_sec: integer().default(60),
    max_delay_sec: integer().default(120),
    coffee_break_every: integer().default(20),
    coffee_break_minutes: integer().default(15),
    scheduled_at: timestamp({ withTimezone: true }).notNull(),
    status: text().notNull().default('pending'),
    error: text(),
    started_at: timestamp({ withTimezone: true }),
    finished_at: timestamp({ withTimezone: true }),
    created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_scheduled_pending').on(t.scheduled_at),
    index('idx_scheduled_user').on(t.user_id),
    check(
      'scheduled_status_check',
      sql`${t.status} in ('pending','running','completed','cancelled','failed')`,
    ),
  ],
);

export const whatsappMessageTemplates = pgTable(
  'whatsapp_message_templates',
  {
    id: uuid().primaryKey().defaultRandom(),
    user_id: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text().notNull(),
    content: text().notNull(),
    media: jsonb(),
    created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('idx_msg_templates_user').on(t.user_id)],
);

// ============================================================================
// 3) KULLANICI AYARLARI
// ============================================================================

export const userSettings = pgTable(
  'user_settings',
  {
    user_id: uuid()
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
    short_link_public_url: text(),
    short_link_redirect_url: text(),
    whatsapp_proxy_host: text(),
    whatsapp_proxy_port: integer(),
    whatsapp_proxy_type: text(),
    updated_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      'user_settings_proxy_type_check',
      sql`${t.whatsapp_proxy_type} is null or ${t.whatsapp_proxy_type} in ('http','socks5')`,
    ),
  ],
);

// ============================================================================
// 4) PLAN / ABONELİK / TOKEN
// ============================================================================

export const plans = pgTable('plans', {
  id: text().primaryKey(), // 'free' | 'pro' | 'unlimited'
  name: text().notNull(),
  price_usd: numeric({ precision: 8, scale: 2, mode: 'number' }).notNull().default(0),
  scrape_limit: integer().notNull(),
  message_limit: integer().notNull(),
  lead_storage: integer().notNull().default(500),
  display_order: integer().notNull().default(0),
});

export const subscriptionTokens = pgTable(
  'subscription_tokens',
  {
    id: uuid().primaryKey().defaultRandom(),
    token: text().notNull().unique(),
    plan_id: text()
      .notNull()
      .references(() => plans.id),
    status: text().notNull().default('unredeemed'),
    duration_days: integer().notNull().default(30),
    note: text(),
    redeemed_by: uuid().references(() => users.id, { onDelete: 'set null' }),
    redeemed_at: timestamp({ withTimezone: true }),
    created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_tokens_status').on(t.status),
    index('idx_tokens_redeemed_by').on(t.redeemed_by),
    check(
      'tokens_status_check',
      sql`${t.status} in ('unredeemed','redeemed','expired','cancelled')`,
    ),
  ],
);

export const subscriptions = pgTable('subscriptions', {
  user_id: uuid()
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  plan_id: text()
    .notNull()
    .default('free')
    .references(() => plans.id),
  current_period_start: timestamp({ withTimezone: true })
    .notNull()
    .defaultNow(),
  current_period_end: timestamp({ withTimezone: true })
    .notNull()
    .default(sql`now() + interval '30 days'`),
  redeemed_token_id: uuid().references(() => subscriptionTokens.id, {
    onDelete: 'set null',
  }),
  scrape_used: integer().notNull().default(0),
  message_used: integer().notNull().default(0),
  updated_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
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
      user_id: businesses.user_id,
      id: businesses.id,
      name: businesses.name,
      created_at: businesses.created_at,
      expires_at: sql<Date>`${businesses.created_at} + interval '60 days'`.as('expires_at'),
    })
    .from(businesses)
    .where(
      sql`${businesses.created_at} < now() - interval '53 days'
        and ${businesses.created_at} >= now() - interval '60 days'
        and not exists (select 1 from list_items li where li.business_id = ${businesses.id})
        and not exists (select 1 from outreach_logs ol where ol.business_id = ${businesses.id})`,
    ),
);
