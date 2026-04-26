-- ============================================================================
-- LeadPin — Tek dosya Supabase şeması
-- ============================================================================
-- Yeni bir Supabase projesinde sıfırdan kurulum için bu dosyayı SQL Editor'da
-- yukarıdan aşağıya çalıştır. Mevcut bir projede de güvenli — IF NOT EXISTS ile
-- yazıldığı için tabloları/sütunları üzerine yazmaz.
--
-- En sondaki "ÖNEMLİ — link_owner flag" bölümünü dikkatle oku.
-- ============================================================================


-- ============================================================================
-- 1) ÇEKIRDEK TABLOLAR
-- ============================================================================

-- 1.1) businesses — taranan + manuel/excel ile import edilen işletmeler/numaralar
create table if not exists public.businesses (
  id                       uuid primary key default gen_random_uuid(),
  user_id                  uuid references auth.users(id) on delete cascade,
  name                     text not null default '',
  category                 text,
  city                     text,
  district                 text,
  neighborhood             text,
  address                  text,
  phone                    text,
  website                  text,
  rating                   decimal(3,2),
  reviews_count            integer default 0,
  google_maps_url          text unique,
  short_id                 text unique,
  short_id_clicks          integer not null default 0,
  short_id_last_click_at   timestamptz,
  email                    text,
  instagram                text,
  facebook                 text,
  source                   text not null default 'scrape'
                           check (source in ('scrape', 'manual', 'excel')),
  status                   text default 'new'
                           check (status in ('new','contacted','replied','converted','rejected')),
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create index if not exists idx_businesses_user        on public.businesses (user_id);
create index if not exists idx_businesses_user_source on public.businesses (user_id, source);
create index if not exists idx_businesses_short_id    on public.businesses (short_id) where short_id is not null;


-- 1.2) scrape_jobs — Google Maps tarama görevleri
create table if not exists public.scrape_jobs (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid default auth.uid() references auth.users(id) on delete cascade,
  category        text not null,
  city            text not null,
  district        text,
  neighborhood    text,
  status          text default 'pending'
                  check (status in ('pending','running','completed','failed','stopped')),
  total_leads     integer default 0,
  current_lead    integer default 0,
  error_message   text,
  created_at      timestamptz not null default now()
);

create index if not exists idx_scrape_jobs_user on public.scrape_jobs (user_id, created_at desc);


-- 1.3) outreach_logs — gönderilen WhatsApp/email mesajlarının log'u
-- batch_id: aynı toplu kampanyadan gelen tüm log'lar aynı UUID'ye sahip olur
--           (tekil gönderimde NULL); UI bunları tek satırda grupluyor.
-- list_id : kampanya hangi listeden çalıştırıldıysa o liste (görsellik için).
create table if not exists public.outreach_logs (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid default auth.uid() references auth.users(id) on delete cascade,
  business_id      uuid references public.businesses(id) on delete cascade,
  type             text not null check (type in ('whatsapp','email','instagram')),
  status           text default 'sent',
  message_content  text,
  batch_id         uuid,
  list_id          uuid references public.lists(id) on delete set null,
  created_at       timestamptz not null default now()
);

create index if not exists idx_outreach_user  on public.outreach_logs (user_id, created_at desc);
create index if not exists idx_outreach_biz   on public.outreach_logs (business_id);
create index if not exists idx_outreach_batch on public.outreach_logs (user_id, batch_id) where batch_id is not null;

-- Migration: mevcut kurulumlara kolonları ekle (idempotent)
alter table public.outreach_logs add column if not exists batch_id uuid;
alter table public.outreach_logs add column if not exists list_id uuid references public.lists(id) on delete set null;


-- 1.4) lists — kullanıcı tarafından oluşturulan işletme listeleri
create table if not exists public.lists (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid default auth.uid() references auth.users(id) on delete cascade,
  name         text not null,
  description  text,
  created_at   timestamptz not null default now()
);

create index if not exists idx_lists_user on public.lists (user_id, created_at desc);


-- 1.5) list_items — list ↔ business many-to-many junction
create table if not exists public.list_items (
  id           uuid primary key default gen_random_uuid(),
  list_id      uuid references public.lists(id) on delete cascade,
  business_id  uuid references public.businesses(id) on delete cascade,
  created_at   timestamptz not null default now(),
  unique (list_id, business_id)
);

create index if not exists idx_list_items_list on public.list_items (list_id);


-- 1.6) contacts — bir işletmeye bağlı ek iletişim kanalları
-- (businesses tablosundaki phone/website/email ana kayıt; contacts ise ekstra
-- kişiler veya kanallar için — business detay sayfasında listelenir)
create table if not exists public.contacts (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references public.businesses(id) on delete cascade,
  email        text,
  instagram    text,
  whatsapp     text,
  facebook     text,
  created_at   timestamptz not null default now()
);

create index if not exists idx_contacts_business on public.contacts (business_id);


-- ============================================================================
-- 2) WHATSAPP OTOMASYON
-- ============================================================================

-- 2.1) whatsapp_auto_rules — karşılama + keyword bazlı oto-cevap kuralları
create table if not exists public.whatsapp_auto_rules (
  id                       uuid primary key default gen_random_uuid(),
  user_id                  uuid not null references auth.users(id) on delete cascade,
  line_id                  text,                              -- null = tüm hatlar
  type                     text not null check (type in ('greeting','keyword')),
  name                     text not null,
  keywords                 text[] default '{}',               -- sadece keyword için
  match_type               text default 'contains'
                           check (match_type in ('contains','exact','starts_with')),
  response                 text not null,
  media_url                text,
  enabled                  boolean not null default true,
  priority                 int     not null default 0,
  reply_once_per_contact   boolean not null default false,
  cooldown_minutes         int     not null default 0,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create index if not exists idx_auto_rules_user           on public.whatsapp_auto_rules (user_id);
create index if not exists idx_auto_rules_user_enabled   on public.whatsapp_auto_rules (user_id, enabled) where enabled = true;


-- 2.2) whatsapp_greeted_contacts — karşılama mesajı alan kişiler (idempotency)
create table if not exists public.whatsapp_greeted_contacts (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  line_id        text not null,
  contact_phone  text not null,
  greeted_at     timestamptz not null default now(),
  unique (line_id, contact_phone)
);

create index if not exists idx_greeted_user on public.whatsapp_greeted_contacts (user_id);


-- 2.3) whatsapp_rule_replies — keyword kural cevap geçmişi
-- (reply_once_per_contact + cooldown hesabı için)
create table if not exists public.whatsapp_rule_replies (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  rule_id        uuid not null references public.whatsapp_auto_rules(id) on delete cascade,
  line_id        text not null,
  contact_phone  text not null,
  replied_at     timestamptz not null default now()
);

create index if not exists idx_rule_replies_rule_contact
  on public.whatsapp_rule_replies (rule_id, contact_phone, replied_at desc);
create index if not exists idx_rule_replies_user
  on public.whatsapp_rule_replies (user_id);


-- 2.4) whatsapp_feature_settings — özellik bazlı (greeting/autoreply/scheduled) ayarlar
create table if not exists public.whatsapp_feature_settings (
  user_id              uuid not null references auth.users(id) on delete cascade,
  feature              text not null check (feature in ('greeting','autoreply','scheduled')),
  enabled              boolean not null default true,
  active_hours_start   text,                                       -- "HH:MM" veya null = 24h
  active_hours_end     text,
  active_days          int[]   not null default '{0,1,2,3,4,5,6}', -- 0=Paz, 6=Cmt
  timezone             text    not null default 'Europe/Istanbul',
  single_reply_only    boolean not null default false,             -- sadece autoreply için
  updated_at           timestamptz not null default now(),
  primary key (user_id, feature)
);

create index if not exists idx_feature_settings_user on public.whatsapp_feature_settings (user_id);


-- 2.5) whatsapp_scheduled_campaigns — zamanlı kampanya kuyruğu
create table if not exists public.whatsapp_scheduled_campaigns (
  id                            uuid primary key default gen_random_uuid(),
  user_id                       uuid not null references auth.users(id) on delete cascade,
  list_id                       uuid not null references public.lists(id) on delete cascade,
  line_id                       text,
  name                          text,
  message_template              text not null,
  message_template_no_website   text,
  media                         jsonb,
  min_delay_sec                 int default 60,
  max_delay_sec                 int default 120,
  coffee_break_every            int default 20,
  coffee_break_minutes          int default 15,
  scheduled_at                  timestamptz not null,
  status                        text not null default 'pending'
                                check (status in ('pending','running','completed','cancelled','failed')),
  error                         text,
  started_at                    timestamptz,
  finished_at                   timestamptz,
  created_at                    timestamptz not null default now()
);

create index if not exists idx_scheduled_pending
  on public.whatsapp_scheduled_campaigns (scheduled_at) where status = 'pending';
create index if not exists idx_scheduled_user
  on public.whatsapp_scheduled_campaigns (user_id);


-- 2.6) whatsapp_message_templates — yeniden kullanılabilir mesaj şablonları
create table if not exists public.whatsapp_message_templates (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  content     text not null,
  media       jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_msg_templates_user on public.whatsapp_message_templates (user_id);


-- ============================================================================
-- 3) KULLANICI AYARLARI (short link domain vs.)
-- ============================================================================

create table if not exists public.user_settings (
  user_id                  uuid primary key references auth.users(id) on delete cascade,
  short_link_public_url    text,    -- mesajda görünecek domain (örn. https://ugra.io)
  short_link_redirect_url  text,    -- tıklayınca yönlendirilecek landing
  whatsapp_proxy_host      text,    -- Termux/telefon proxy host (boşsa kullanılmaz)
  whatsapp_proxy_port      integer, -- Proxy port (1-65535)
  whatsapp_proxy_type      text     -- 'http' | 'socks5' (default 'http')
                           check (whatsapp_proxy_type is null
                             or whatsapp_proxy_type in ('http','socks5')),
  updated_at               timestamptz not null default now()
);

-- Mevcut kurulumlara migration için (idempotent — yoksa kolon ekler)
alter table public.user_settings
  add column if not exists whatsapp_proxy_host text;
alter table public.user_settings
  add column if not exists whatsapp_proxy_port integer;
alter table public.user_settings
  add column if not exists whatsapp_proxy_type text;


-- ============================================================================
-- 4) RPC: TIKLAMA TAKİBİ (anon role'den çağrılır — public click)
-- ============================================================================

drop function if exists public.track_short_id_click(text);

create or replace function public.track_short_id_click(p_short_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.businesses
  set
    short_id_clicks        = coalesce(short_id_clicks, 0) + 1,
    short_id_last_click_at = now()
  where short_id = p_short_id;
end;
$$;

grant execute on function public.track_short_id_click(text) to anon, authenticated;


-- ============================================================================
-- 5) ROW LEVEL SECURITY (RLS) POLİTİKALARI
-- ============================================================================

-- 5.1) Çekirdek tablolar
alter table public.businesses     enable row level security;
alter table public.scrape_jobs    enable row level security;
alter table public.outreach_logs  enable row level security;
alter table public.lists          enable row level security;
alter table public.list_items     enable row level security;
alter table public.contacts       enable row level security;

drop policy if exists "businesses_select_own" on public.businesses;
drop policy if exists "businesses_insert_own" on public.businesses;
drop policy if exists "businesses_update_own" on public.businesses;
drop policy if exists "businesses_delete_own" on public.businesses;
create policy "businesses_select_own" on public.businesses for select to authenticated
  using (auth.uid() = user_id or user_id is null);
create policy "businesses_insert_own" on public.businesses for insert to authenticated
  with check (auth.uid() = user_id or user_id is null);
create policy "businesses_update_own" on public.businesses for update to authenticated
  using (auth.uid() = user_id);
create policy "businesses_delete_own" on public.businesses for delete to authenticated
  using (auth.uid() = user_id);

drop policy if exists "scrape_jobs_own" on public.scrape_jobs;
create policy "scrape_jobs_own" on public.scrape_jobs for all to authenticated
  using (auth.uid() = user_id);

drop policy if exists "outreach_logs_own" on public.outreach_logs;
create policy "outreach_logs_own" on public.outreach_logs for all to authenticated
  using (auth.uid() = user_id);

drop policy if exists "lists_own" on public.lists;
create policy "lists_own" on public.lists for all to authenticated
  using (auth.uid() = user_id);

drop policy if exists "list_items_own" on public.list_items;
create policy "list_items_own" on public.list_items for all to authenticated
  using (exists (select 1 from public.lists where id = list_id and user_id = auth.uid()));

drop policy if exists "contacts_own" on public.contacts;
create policy "contacts_own" on public.contacts for all to authenticated
  using (exists (select 1 from public.businesses
                 where id = business_id and user_id = auth.uid()));


-- 5.2) WhatsApp otomasyon tabloları
alter table public.whatsapp_auto_rules            enable row level security;
alter table public.whatsapp_greeted_contacts      enable row level security;
alter table public.whatsapp_rule_replies          enable row level security;
alter table public.whatsapp_feature_settings      enable row level security;
alter table public.whatsapp_scheduled_campaigns   enable row level security;
alter table public.whatsapp_message_templates     enable row level security;

drop policy if exists "auto_rules_own" on public.whatsapp_auto_rules;
create policy "auto_rules_own" on public.whatsapp_auto_rules for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "greeted_select_own" on public.whatsapp_greeted_contacts;
drop policy if exists "greeted_insert_own" on public.whatsapp_greeted_contacts;
create policy "greeted_select_own" on public.whatsapp_greeted_contacts for select to authenticated
  using (auth.uid() = user_id);
create policy "greeted_insert_own" on public.whatsapp_greeted_contacts for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "rule_replies_select_own" on public.whatsapp_rule_replies;
drop policy if exists "rule_replies_insert_own" on public.whatsapp_rule_replies;
create policy "rule_replies_select_own" on public.whatsapp_rule_replies for select to authenticated
  using (auth.uid() = user_id);
create policy "rule_replies_insert_own" on public.whatsapp_rule_replies for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "feature_settings_own" on public.whatsapp_feature_settings;
create policy "feature_settings_own" on public.whatsapp_feature_settings for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "scheduled_own" on public.whatsapp_scheduled_campaigns;
create policy "scheduled_own" on public.whatsapp_scheduled_campaigns for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "templates_own" on public.whatsapp_message_templates;
create policy "templates_own" on public.whatsapp_message_templates for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);


-- 5.3) Kullanıcı ayarları
alter table public.user_settings enable row level security;

drop policy if exists "user_settings_own" on public.user_settings;
create policy "user_settings_own" on public.user_settings for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);


-- ============================================================================
-- 6) ÖNEMLİ — link_owner flag (sadece kendi hesabında çalıştır)
-- ============================================================================
-- Short link / {link} özelliği sadece bu flag'e sahip hesaplara açılır.
-- AŞAĞIDAKİ E-POSTAYI KENDİ E-POSTAN İLE DEĞİŞTİRİP YORUMU AÇ:
--
-- update auth.users
-- set raw_app_meta_data =
--   coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('link_owner', true)
-- where email = 'sizin@email.com';
--
-- Kaldırmak için:
-- update auth.users
-- set raw_app_meta_data = raw_app_meta_data - 'link_owner'
-- where email = 'sizin@email.com';
-- ============================================================================


-- ============================================================================
-- KURULUM KONTROLÜ
-- ============================================================================
-- Bu sorgular ile her şeyin yerinde olduğunu doğrula:
--
-- select table_name from information_schema.tables
-- where table_schema = 'public' order by table_name;
--
-- select proname from pg_proc where proname = 'track_short_id_click';
-- ============================================================================
