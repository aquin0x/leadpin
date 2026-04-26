import { supabase } from '../utils/supabase';

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

export interface AppUser {
  id: string;
  app_metadata?: Record<string, any> | null;
}

function isAdmin(user: AppUser): boolean {
  return Boolean(user?.app_metadata?.is_admin);
}

/**
 * Kullanıcının mevcut plan + dönem + kullanım bilgisini döner.
 * - Subscription kaydı yoksa otomatik 'free' plan ile oluşturur.
 * - Dönem bitmişse:
 *    free plan → period yeni 30 gün, sayaçlar 0
 *    paid plan → free'ye düşür, sayaçlar 0
 */
export async function getOrInitSubscription(user: AppUser): Promise<PlanLimits> {
  if (isAdmin(user)) {
    return {
      plan_id: 'admin',
      plan_name: 'Admin',
      scrape_limit: ADMIN_LIMIT,
      message_limit: ADMIN_LIMIT,
      lead_storage: ADMIN_LIMIT,
      scrape_used: 0,
      message_used: 0,
      current_period_start: new Date().toISOString(),
      current_period_end: new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString(),
      is_admin: true,
    };
  }

  // 1) Mevcut subscription'ı çek
  let { data: sub } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();

  // 2) Yoksa free olarak oluştur
  if (!sub) {
    const now = new Date();
    const end = new Date(now.getTime() + 30 * 24 * 3600 * 1000);
    const { data: created, error } = await supabase
      .from('subscriptions')
      .insert({
        user_id: user.id,
        plan_id: 'free',
        current_period_start: now.toISOString(),
        current_period_end: end.toISOString(),
        scrape_used: 0,
        message_used: 0,
      })
      .select()
      .single();
    if (error) throw new Error(`subscription init failed: ${error.message}`);
    sub = created;
  }

  // 3) Dönem bitmiş mi?
  const now = new Date();
  const periodEnd = new Date(sub.current_period_end);
  if (periodEnd < now) {
    // Paid plan ise free'ye düşür; free ise dönemi yenile
    const newPlan = sub.plan_id === 'free' ? 'free' : 'free';
    const newEnd = new Date(now.getTime() + 30 * 24 * 3600 * 1000);
    const { data: rolled } = await supabase
      .from('subscriptions')
      .update({
        plan_id: newPlan,
        current_period_start: now.toISOString(),
        current_period_end: newEnd.toISOString(),
        scrape_used: 0,
        message_used: 0,
        updated_at: now.toISOString(),
      })
      .eq('user_id', user.id)
      .select()
      .single();
    if (rolled) sub = rolled;
  }

  // 4) Plan limitlerini al
  const { data: plan } = await supabase
    .from('plans')
    .select('*')
    .eq('id', sub.plan_id)
    .single();

  if (!plan) throw new Error(`Plan not found: ${sub.plan_id}`);

  return {
    plan_id: plan.id,
    plan_name: plan.name,
    scrape_limit: plan.scrape_limit,
    message_limit: plan.message_limit,
    lead_storage: plan.lead_storage,
    scrape_used: sub.scrape_used,
    message_used: sub.message_used,
    current_period_start: sub.current_period_start,
    current_period_end: sub.current_period_end,
    is_admin: false,
  };
}

export async function getStoredLeadCount(userId: string): Promise<number> {
  const { count, error } = await supabase
    .from('businesses')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId);
  if (error) throw new Error(`lead count failed: ${error.message}`);
  return count || 0;
}

/** Tarama başlatma kontrolü — limit dolduysa fırlat. */
export async function assertCanScrape(user: AppUser): Promise<PlanLimits> {
  const limits = await getOrInitSubscription(user);
  if (limits.is_admin) return limits;
  if (limits.scrape_used >= limits.scrape_limit) {
    const err: any = new Error(
      `Aylık tarama hakkın doldu (${limits.scrape_used}/${limits.scrape_limit}). Yeni token gir veya bir sonraki dönemi bekle.`
    );
    err.code = 'SCRAPE_LIMIT';
    err.statusCode = 402;
    throw err;
  }
  return limits;
}

/** Toplu/manuel mesaj gönderim kontrolü. AutoReply ve karşılama saymaz. */
export async function assertCanSendMessages(user: AppUser, count: number): Promise<PlanLimits> {
  const limits = await getOrInitSubscription(user);
  if (limits.is_admin) return limits;
  if (limits.message_used + count > limits.message_limit) {
    const err: any = new Error(
      `Aylık mesaj hakkın yetmiyor (${limits.message_used}/${limits.message_limit}, gönderilecek: ${count}).`
    );
    err.code = 'MESSAGE_LIMIT';
    err.statusCode = 402;
    throw err;
  }
  return limits;
}

/** Lead saklama limiti — 500 üstüne yeni lead eklenmesin. */
export async function assertCanStoreLeads(user: AppUser, addCount: number): Promise<void> {
  if (isAdmin(user)) return;
  const limits = await getOrInitSubscription(user);
  if (limits.is_admin) return;
  const current = await getStoredLeadCount(user.id);
  if (current + addCount > limits.lead_storage) {
    const err: any = new Error(
      `Lead saklama limiti aşıldı (${current}/${limits.lead_storage}). Önce kullanılmayan leadleri temizle.`
    );
    err.code = 'STORAGE_LIMIT';
    err.statusCode = 402;
    throw err;
  }
}

export async function incrementScrape(userId: string, by = 1): Promise<void> {
  const { data: sub } = await supabase
    .from('subscriptions')
    .select('scrape_used')
    .eq('user_id', userId)
    .maybeSingle();
  if (!sub) return; // admin yoksa zaten çağrılmaz; init ediliyor
  await supabase
    .from('subscriptions')
    .update({ scrape_used: (sub.scrape_used || 0) + by, updated_at: new Date().toISOString() })
    .eq('user_id', userId);
}

export async function incrementMessages(userId: string, by: number): Promise<void> {
  if (by <= 0) return;
  const { data: sub } = await supabase
    .from('subscriptions')
    .select('message_used')
    .eq('user_id', userId)
    .maybeSingle();
  if (!sub) return;
  await supabase
    .from('subscriptions')
    .update({ message_used: (sub.message_used || 0) + by, updated_at: new Date().toISOString() })
    .eq('user_id', userId);
}

/**
 * Skipped/iade edilecek mesajlar için kotayı geri yükler.
 * Negatife düşmez (alt sınır 0).
 */
export async function refundMessages(userId: string, by: number): Promise<void> {
  if (by <= 0) return;
  const { data: sub } = await supabase
    .from('subscriptions')
    .select('message_used')
    .eq('user_id', userId)
    .maybeSingle();
  if (!sub) return;
  const newValue = Math.max(0, (sub.message_used || 0) - by);
  await supabase
    .from('subscriptions')
    .update({ message_used: newValue, updated_at: new Date().toISOString() })
    .eq('user_id', userId);
}

/**
 * Token redeem akışı:
 * - Token unredeemed olmalı
 * - Mevcut subscription güncellenir: plan_id = token.plan_id,
 *   period_start = now, period_end = now + duration_days, sayaçlar 0
 * - Token status → redeemed
 */
export async function redeemToken(user: AppUser, rawToken: string): Promise<PlanLimits> {
  if (isAdmin(user)) {
    const err: any = new Error('Admin hesabında token gerekmez.');
    err.statusCode = 400;
    throw err;
  }
  const tokenStr = (rawToken || '').trim().toUpperCase();
  if (!tokenStr) {
    const err: any = new Error('Token boş olamaz.');
    err.statusCode = 400;
    throw err;
  }

  const { data: token, error: tokenErr } = await supabase
    .from('subscription_tokens')
    .select('*')
    .eq('token', tokenStr)
    .maybeSingle();

  if (tokenErr) throw new Error(tokenErr.message);
  if (!token) {
    const err: any = new Error('Geçersiz token.');
    err.statusCode = 404;
    throw err;
  }
  if (token.status !== 'unredeemed') {
    const err: any = new Error(`Token kullanılamaz (durum: ${token.status}).`);
    err.statusCode = 409;
    throw err;
  }

  const now = new Date();
  const end = new Date(now.getTime() + (token.duration_days || 30) * 24 * 3600 * 1000);

  // Subscription'ı upsert
  await getOrInitSubscription(user); // var mı kontrol + oluştur
  const { error: subErr } = await supabase
    .from('subscriptions')
    .update({
      plan_id: token.plan_id,
      current_period_start: now.toISOString(),
      current_period_end: end.toISOString(),
      redeemed_token_id: token.id,
      scrape_used: 0,
      message_used: 0,
      updated_at: now.toISOString(),
    })
    .eq('user_id', user.id);
  if (subErr) throw new Error(subErr.message);

  // Token'ı kullanılmış işaretle
  await supabase
    .from('subscription_tokens')
    .update({
      status: 'redeemed',
      redeemed_by: user.id,
      redeemed_at: now.toISOString(),
    })
    .eq('id', token.id);

  return await getOrInitSubscription(user);
}
