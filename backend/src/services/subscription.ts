import { and, eq, sql, count } from 'drizzle-orm';
import { db } from '../db/client';
import { businesses, plans, subscriptions, subscriptionTokens } from '../db/schema';

export interface PlanLimits {
  plan_id: string;
  plan_name: string;
  scrape_limit: number;
  message_limit: number;
  lead_storage: number;
  scrape_used: number;
  message_used: number;
  current_period_start: string;
  current_period_end: string;
  is_admin: boolean;
}

const ADMIN_LIMIT = 999_999_999;
const PERIOD_MS = 30 * 24 * 3600 * 1000;

/**
 * Kimlik doğrulama middleware'inin req.user'a koyduğu şekil. is_admin eskiden
 * auth.users.raw_app_meta_data içinde JSON'du; artık users tablosunda kolon.
 */
export interface AppUser {
  id: string;
  isAdmin?: boolean;
}

function isAdmin(user: AppUser): boolean {
  return Boolean(user?.isAdmin);
}

function adminLimits(): PlanLimits {
  const now = new Date();
  return {
    plan_id: 'admin',
    plan_name: 'Admin',
    scrape_limit: ADMIN_LIMIT,
    message_limit: ADMIN_LIMIT,
    lead_storage: ADMIN_LIMIT,
    scrape_used: 0,
    message_used: 0,
    current_period_start: now.toISOString(),
    current_period_end: new Date(now.getTime() + 365 * 24 * 3600 * 1000).toISOString(),
    is_admin: true,
  };
}

/**
 * Kullanıcının mevcut plan + dönem + kullanım bilgisini döner.
 * - Kayıt yoksa 'free' plan ile oluşturur.
 * - Dönem bittiyse plan free'ye düşer ve sayaçlar sıfırlanır.
 */
export async function getOrInitSubscription(user: AppUser): Promise<PlanLimits> {
  if (isAdmin(user)) return adminLimits();

  let [sub] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.user_id, user.id))
    .limit(1);

  if (!sub) {
    const now = new Date();
    [sub] = await db
      .insert(subscriptions)
      .values({
        user_id: user.id,
        plan_id: 'free',
        current_period_start: now,
        current_period_end: new Date(now.getTime() + PERIOD_MS),
        scrape_used: 0,
        message_used: 0,
      })
      // İki istek aynı anda gelirse ikincisi çakışmasın.
      .onConflictDoNothing()
      .returning();

    if (!sub) {
      [sub] = await db
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.user_id, user.id))
        .limit(1);
    }
  }

  // Dönem bittiyse yenile. Ücretli plan da free'ye düşer — token süreliydi.
  const now = new Date();
  if (sub.current_period_end < now) {
    const [rolled] = await db
      .update(subscriptions)
      .set({
        plan_id: 'free',
        current_period_start: now,
        current_period_end: new Date(now.getTime() + PERIOD_MS),
        scrape_used: 0,
        message_used: 0,
        updated_at: now,
      })
      .where(eq(subscriptions.user_id, user.id))
      .returning();
    if (rolled) sub = rolled;
  }

  const [plan] = await db.select().from(plans).where(eq(plans.id, sub.plan_id)).limit(1);
  if (!plan) throw new Error(`Plan bulunamadı: ${sub.plan_id}`);

  return {
    plan_id: plan.id,
    plan_name: plan.name,
    scrape_limit: plan.scrape_limit,
    message_limit: plan.message_limit,
    lead_storage: plan.lead_storage,
    scrape_used: sub.scrape_used,
    message_used: sub.message_used,
    current_period_start: sub.current_period_start.toISOString(),
    current_period_end: sub.current_period_end.toISOString(),
    is_admin: false,
  };
}

export async function getStoredLeadCount(userId: string): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(businesses)
    .where(eq(businesses.user_id, userId));
  return row?.value ?? 0;
}

function limitError(message: string, code: string): Error & { code: string; statusCode: number } {
  const err = new Error(message) as Error & { code: string; statusCode: number };
  err.code = code;
  err.statusCode = 402;
  return err;
}

/** Tarama başlatma kontrolü — limit dolduysa fırlatır. */
export async function assertCanScrape(user: AppUser): Promise<PlanLimits> {
  const limits = await getOrInitSubscription(user);
  if (limits.is_admin) return limits;
  if (limits.scrape_used >= limits.scrape_limit) {
    throw limitError(
      `Aylık tarama hakkın doldu (${limits.scrape_used}/${limits.scrape_limit}). Yeni token gir veya bir sonraki dönemi bekle.`,
      'SCRAPE_LIMIT',
    );
  }
  return limits;
}

/** Toplu/manuel mesaj gönderim kontrolü. Otomatik yanıt ve karşılama saymaz. */
export async function assertCanSendMessages(user: AppUser, count: number): Promise<PlanLimits> {
  const limits = await getOrInitSubscription(user);
  if (limits.is_admin) return limits;
  if (limits.message_used + count > limits.message_limit) {
    throw limitError(
      `Aylık mesaj hakkın yetmiyor (${limits.message_used}/${limits.message_limit}, gönderilecek: ${count}).`,
      'MESSAGE_LIMIT',
    );
  }
  return limits;
}

/** Lead saklama limiti — plan sınırının üstüne yeni lead eklenmesin. */
export async function assertCanStoreLeads(user: AppUser, addCount: number): Promise<void> {
  if (isAdmin(user)) return;
  const limits = await getOrInitSubscription(user);
  if (limits.is_admin) return;
  const current = await getStoredLeadCount(user.id);
  if (current + addCount > limits.lead_storage) {
    throw limitError(
      `Lead saklama limiti aşıldı (${current}/${limits.lead_storage}). Önce kullanılmayan leadleri temizle.`,
      'STORAGE_LIMIT',
    );
  }
}

// Sayaçlar tek ifadede güncellenir. Eskiden önce okunup sonra yazılıyordu;
// eşzamanlı iki gönderim arasında güncelleme kaybolabiliyordu.
export async function incrementScrape(userId: string, by = 1): Promise<void> {
  if (by <= 0) return;
  await db
    .update(subscriptions)
    .set({ scrape_used: sql`${subscriptions.scrape_used} + ${by}`, updated_at: new Date() })
    .where(eq(subscriptions.user_id, userId));
}

export async function incrementMessages(userId: string, by: number): Promise<void> {
  if (by <= 0) return;
  await db
    .update(subscriptions)
    .set({ message_used: sql`${subscriptions.message_used} + ${by}`, updated_at: new Date() })
    .where(eq(subscriptions.user_id, userId));
}

/** Gönderilmeyen mesajların kotasını iade eder. Sıfırın altına inmez. */
export async function refundMessages(userId: string, by: number): Promise<void> {
  if (by <= 0) return;
  await db
    .update(subscriptions)
    .set({
      message_used: sql`greatest(0, ${subscriptions.message_used} - ${by})`,
      updated_at: new Date(),
    })
    .where(eq(subscriptions.user_id, userId));
}

/**
 * Token redeem akışı: token unredeemed olmalı; subscription'ın planı ve dönemi
 * güncellenir, sayaçlar sıfırlanır, token kullanılmış işaretlenir.
 */
export async function redeemToken(user: AppUser, rawToken: string): Promise<PlanLimits> {
  if (isAdmin(user)) {
    const err = new Error('Admin hesabında token gerekmez.') as Error & { statusCode: number };
    err.statusCode = 400;
    throw err;
  }

  const tokenStr = (rawToken || '').trim().toUpperCase();
  if (!tokenStr) {
    const err = new Error('Token boş olamaz.') as Error & { statusCode: number };
    err.statusCode = 400;
    throw err;
  }

  const [token] = await db
    .select()
    .from(subscriptionTokens)
    .where(eq(subscriptionTokens.token, tokenStr))
    .limit(1);

  if (!token) {
    const err = new Error('Geçersiz token.') as Error & { statusCode: number };
    err.statusCode = 404;
    throw err;
  }

  const now = new Date();
  const end = new Date(now.getTime() + (token.duration_days || 30) * 24 * 3600 * 1000);

  // Abonelik kaydının var olduğundan emin ol.
  await getOrInitSubscription(user);

  // Token'ı yalnızca hâlâ unredeemed ise tüket. Koşul UPDATE'in içinde
  // olduğu için iki eşzamanlı redeem denemesinden yalnızca biri kazanır.
  const claimed = await db
    .update(subscriptionTokens)
    .set({ status: 'redeemed', redeemed_by: user.id, redeemed_at: now })
    .where(
      and(eq(subscriptionTokens.id, token.id), eq(subscriptionTokens.status, 'unredeemed')),
    )
    .returning({ id: subscriptionTokens.id });

  if (claimed.length === 0) {
    const err = new Error(`Token kullanılamaz (durum: ${token.status}).`) as Error & {
      statusCode: number;
    };
    err.statusCode = 409;
    throw err;
  }

  await db
    .update(subscriptions)
    .set({
      plan_id: token.plan_id,
      current_period_start: now,
      current_period_end: end,
      redeemed_token_id: token.id,
      scrape_used: 0,
      message_used: 0,
      updated_at: now,
    })
    .where(eq(subscriptions.user_id, user.id));

  return getOrInitSubscription(user);
}
