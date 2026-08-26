/**
 * WhatsApp otomasyon motoru — karşılama ve anahtar kelime oto-cevapları.
 *
 * Her hat için client'a bir `message` dinleyicisi bağlanır. Gelen mesajda
 * sırayla: aktif pencere kontrolü → karşılama → anahtar kelime kuralları.
 *
 * Karar verilen davranışlar:
 *  - Karşılama YALNIZCA bize ilk kez yazan ve daha önce bizim mesaj
 *    göndermediğimiz kişilere gider. Kampanya alıcısı cevap yazdığında
 *    "hoşgeldiniz" demek tuhaf kaçardı.
 *  - Bir mesaj hem karşılamayı hem bir kelimeyi tetiklerse yalnızca karşılama
 *    gider; kelime cevabı bir sonraki mesaja kalır. Kişi arka arkaya iki
 *    mesaj almaz.
 */
import type { Client as WAClient, Message } from 'whatsapp-web.js';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { db } from '../db/client';
import {
  businesses,
  outreachLogs,
  whatsappAutoRules,
  whatsappFeatureSettings,
  whatsappGreetedContacts,
  whatsappRuleReplies,
} from '../db/schema';

export type AutomationFeature = 'greeting' | 'autoreply' | 'scheduled';

export interface FeatureSettings {
  user_id: string;
  feature: AutomationFeature;
  enabled: boolean;
  active_hours_start: string | null;
  active_hours_end: string | null;
  active_days: number[];
  timezone: string;
  single_reply_only: boolean;
}

const DEFAULT_SETTINGS = (userId: string, feature: AutomationFeature): FeatureSettings => ({
  user_id: userId,
  feature,
  enabled: true,
  active_hours_start: null,
  active_hours_end: null,
  active_days: [0, 1, 2, 3, 4, 5, 6],
  timezone: 'Europe/Istanbul',
  single_reply_only: false,
});

export async function loadFeatureSettings(
  userId: string,
  feature: AutomationFeature,
): Promise<FeatureSettings> {
  const [row] = await db
    .select()
    .from(whatsappFeatureSettings)
    .where(
      and(
        eq(whatsappFeatureSettings.user_id, userId),
        eq(whatsappFeatureSettings.feature, feature),
      ),
    )
    .limit(1);

  if (!row) return DEFAULT_SETTINGS(userId, feature);

  return {
    user_id: row.user_id,
    feature: row.feature as AutomationFeature,
    enabled: row.enabled,
    active_hours_start: row.active_hours_start,
    active_hours_end: row.active_hours_end,
    active_days: row.active_days ?? [0, 1, 2, 3, 4, 5, 6],
    timezone: row.timezone,
    single_reply_only: row.single_reply_only,
  };
}

/** Verilen zaman diliminde "şu an" için gün (0=Pazar) ve dakika cinsinden saat. */
function localDayAndMinutes(timezone: string, now: Date): { day: number; minutes: number } {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(now);
  } catch {
    // Geçersiz timezone — sunucu saatine düş, otomasyon büsbütün durmasın.
    return { day: now.getDay(), minutes: now.getHours() * 60 + now.getMinutes() };
  }

  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const hour = Number(get('hour'));
  const minute = Number(get('minute'));

  return {
    day: dayMap[get('weekday')] ?? now.getDay(),
    // Bazı ortamlar gece yarısını "24" olarak biçimlendirir.
    minutes: (hour % 24) * 60 + minute,
  };
}

function parseHHMM(value: string | null): number | null {
  if (!value) return null;
  const m = value.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** Özellik şu anda aktif pencerede mi? */
export function isWithinActiveWindow(settings: FeatureSettings, now = new Date()): boolean {
  if (!settings.enabled) return false;

  const { day, minutes } = localDayAndMinutes(settings.timezone, now);
  if (!settings.active_days.includes(day)) return false;

  const start = parseHHMM(settings.active_hours_start);
  const end = parseHHMM(settings.active_hours_end);
  // İkisinden biri yoksa 24 saat açık kabul edilir.
  if (start === null || end === null) return true;

  // Gece yarısını aşan pencere (ör. 22:00–06:00) da desteklenir.
  return start <= end ? minutes >= start && minutes < end : minutes >= start || minutes < end;
}

function matches(body: string, keywords: string[], matchType: string): boolean {
  // Türkçe'ye duyarlı küçültme: "İ" -> "i", "I" -> "ı".
  const text = (body || '').toLocaleLowerCase('tr-TR').trim();
  if (!text) return false;

  return keywords.some((raw) => {
    const kw = (raw || '').toLocaleLowerCase('tr-TR').trim();
    if (!kw) return false;
    if (matchType === 'exact') return text === kw;
    if (matchType === 'starts_with') return text.startsWith(kw);
    return text.includes(kw);
  });
}

/** WhatsApp kimliğinden ("905321112233@c.us") sadece rakamlar. */
function phoneFromChatId(chatId: string): string {
  return chatId.split('@')[0].replace(/\D/g, '');
}

/**
 * Bu kişiye daha önce biz mesaj göndermiş miyiz?
 *
 * outreach_logs business_id ile tutuluyor, telefonla değil; bu yüzden önce
 * kullanıcının aynı numaraya sahip işletmeleri bulunur. Numaralar serbest
 * biçimde saklandığı için (ör. "0532 111 22 33") son 10 hane karşılaştırılır.
 */
async function hasOutboundHistory(userId: string, phoneDigits: string): Promise<boolean> {
  const last10 = phoneDigits.slice(-10);
  if (last10.length < 10) return false;

  const [row] = await db
    .select({ id: outreachLogs.id })
    .from(outreachLogs)
    .innerJoin(businesses, eq(outreachLogs.business_id, businesses.id))
    .where(
      and(
        eq(outreachLogs.user_id, userId),
        eq(outreachLogs.status, 'sent'),
        sql`right(regexp_replace(${businesses.phone}, '\\D', '', 'g'), 10) = ${last10}`,
      ),
    )
    .limit(1);

  return !!row;
}

async function buildMedia(mediaUrl: string | null) {
  if (!mediaUrl) return null;
  try {
    const { MessageMedia } = await import('whatsapp-web.js');
    return await MessageMedia.fromUrl(mediaUrl, { unsafeMime: true });
  } catch (e: any) {
    // Medya alınamazsa cevabı büsbütün iptal etmek yerine metin olarak gönder.
    console.warn('[automation] medya alınamadı, metin olarak gönderiliyor:', e?.message);
    return null;
  }
}

async function reply(client: WAClient, chatId: string, text: string, mediaUrl: string | null) {
  const media = await buildMedia(mediaUrl);
  if (media) {
    await client.sendMessage(chatId, media, { caption: text });
  } else {
    await client.sendMessage(chatId, text);
  }
}

/** Karşılama denendi mi? Gönderildiyse true döner. */
async function tryGreeting(
  client: WAClient,
  lineId: string,
  userId: string,
  chatId: string,
  phoneDigits: string,
): Promise<boolean> {
  const settings = await loadFeatureSettings(userId, 'greeting');
  if (!isWithinActiveWindow(settings)) return false;

  const [rule] = await db
    .select()
    .from(whatsappAutoRules)
    .where(
      and(
        eq(whatsappAutoRules.user_id, userId),
        eq(whatsappAutoRules.type, 'greeting'),
        eq(whatsappAutoRules.enabled, true),
      ),
    )
    .orderBy(desc(whatsappAutoRules.priority), asc(whatsappAutoRules.created_at))
    .limit(1);

  if (!rule) return false;
  if (rule.line_id && rule.line_id !== lineId) return false;

  // Daha önce bu hatta karşılanmış mı? unique(line_id, contact_phone) sayesinde
  // yarış durumunda da tek kayıt kalır.
  const inserted = await db
    .insert(whatsappGreetedContacts)
    .values({ user_id: userId, line_id: lineId, contact_phone: phoneDigits })
    .onConflictDoNothing()
    .returning({ id: whatsappGreetedContacts.id });

  if (inserted.length === 0) return false;

  // Biz bu kişiye daha önce yazdıysak karşılama gitmez; ama yukarıdaki kayıt
  // kalır, böylece bir daha denenmez.
  if (await hasOutboundHistory(userId, phoneDigits)) return false;

  await reply(client, chatId, rule.response, rule.media_url);
  console.log(`[automation:${lineId}] karşılama gönderildi -> ${phoneDigits}`);
  return true;
}

async function tryKeywordRules(
  client: WAClient,
  lineId: string,
  userId: string,
  chatId: string,
  phoneDigits: string,
  body: string,
): Promise<boolean> {
  const settings = await loadFeatureSettings(userId, 'autoreply');
  if (!isWithinActiveWindow(settings)) return false;

  // "Kişi başına 1 oto-cevap" — kural bazlı ayarların üstünde çalışır.
  if (settings.single_reply_only) {
    const [seen] = await db
      .select({ id: whatsappRuleReplies.id })
      .from(whatsappRuleReplies)
      .where(
        and(
          eq(whatsappRuleReplies.user_id, userId),
          eq(whatsappRuleReplies.contact_phone, phoneDigits),
        ),
      )
      .limit(1);
    if (seen) return false;
  }

  const rules = await db
    .select()
    .from(whatsappAutoRules)
    .where(
      and(
        eq(whatsappAutoRules.user_id, userId),
        eq(whatsappAutoRules.type, 'keyword'),
        eq(whatsappAutoRules.enabled, true),
      ),
    )
    .orderBy(desc(whatsappAutoRules.priority), asc(whatsappAutoRules.created_at));

  for (const rule of rules) {
    if (rule.line_id && rule.line_id !== lineId) continue;
    if (!matches(body, rule.keywords ?? [], rule.match_type ?? 'contains')) continue;

    const [last] = await db
      .select({ replied_at: whatsappRuleReplies.replied_at })
      .from(whatsappRuleReplies)
      .where(
        and(
          eq(whatsappRuleReplies.rule_id, rule.id),
          eq(whatsappRuleReplies.contact_phone, phoneDigits),
        ),
      )
      .orderBy(desc(whatsappRuleReplies.replied_at))
      .limit(1);

    if (last) {
      if (rule.reply_once_per_contact) continue;
      const cooldownMs = (rule.cooldown_minutes ?? 0) * 60_000;
      if (cooldownMs > 0 && Date.now() - last.replied_at.getTime() < cooldownMs) continue;
    }

    await reply(client, chatId, rule.response, rule.media_url);
    await db.insert(whatsappRuleReplies).values({
      user_id: userId,
      rule_id: rule.id,
      line_id: lineId,
      contact_phone: phoneDigits,
    });

    console.log(`[automation:${lineId}] "${rule.name}" cevabı gönderildi -> ${phoneDigits}`);
    return true;
  }

  return false;
}

/**
 * Bir hattın client'ına otomasyon dinleyicisini bağlar.
 * createSession içinden, oturum kurulurken çağrılır.
 */
export function attachAutomation(client: WAClient, lineId: string, userId: string): void {
  client.on('message', (msg: Message) => {
    void handleMessage(client, lineId, userId, msg);
  });
}

async function handleMessage(
  client: WAClient,
  lineId: string,
  userId: string,
  msg: Message,
): Promise<void> {
  try {
    // Yalnızca birebir sohbetler: gruplar (@g.us), durum yayınları ve kendi
    // gönderdiklerimiz kapsam dışı.
    if (msg.fromMe) return;
    if (!msg.from.endsWith('@c.us')) return;

    const phoneDigits = phoneFromChatId(msg.from);
    if (!phoneDigits) return;

    const body = msg.body ?? '';

    // Karşılama gittiyse aynı mesaja bir de kelime cevabı gönderilmez.
    const greeted = await tryGreeting(client, lineId, userId, msg.from, phoneDigits);
    if (greeted) return;

    await tryKeywordRules(client, lineId, userId, msg.from, phoneDigits, body);
  } catch (err: any) {
    // Dinleyici içindeki hata süreci düşürmemeli.
    console.error(`[automation:${lineId}] mesaj işlenemedi:`, err?.message);
  }
}
