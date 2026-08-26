/**
 * Günlük temizlik görevleri — pg_cron'un yerine.
 *
 * Supabase'de bu iki iş pg_cron ile kuruluyordu. postgres:18-alpine imajında
 * pg_cron yok (Supabase'e özgü bir kolaylıktı), bu yüzden zamanlama backend'e
 * taşındı. Kriterler businesses_expiring_soon görünümüyle aynı olmalı —
 * frontend'in "yakında silinecek" banner'ı o görünüme bakıyor.
 */
import { sql } from 'drizzle-orm';
import { db } from '../db/client';

const DAY_MS = 24 * 60 * 60 * 1000;

/** 60 günden eski, hiçbir listede olmayan ve hiç mesaj atılmamış lead'ler. */
export async function cleanupUnusedBusinesses(): Promise<number> {
  const result = await db.execute(sql`
    delete from businesses b
    where b.created_at < now() - interval '60 days'
      and not exists (select 1 from list_items li where li.business_id = b.id)
      and not exists (select 1 from outreach_logs ol where ol.business_id = b.id)
  `);
  return result.rowCount ?? 0;
}

/** 60 günden eski mesaj log'ları. */
export async function cleanupOldOutreachLogs(): Promise<number> {
  const result = await db.execute(sql`
    delete from outreach_logs where created_at < now() - interval '60 days'
  `);
  return result.rowCount ?? 0;
}

export async function runCleanupOnce(): Promise<{ businesses: number; logs: number }> {
  const businesses = await cleanupUnusedBusinesses();
  const logs = await cleanupOldOutreachLogs();
  return { businesses, logs };
}

/**
 * Açılışta bir kez, sonra 24 saatte bir çalışır. Hata yutulur: temizlik
 * başarısız olsa da sunucu ayakta kalmalı.
 */
export function startCleanupScheduler(): () => void {
  const tick = async () => {
    try {
      const { businesses, logs } = await runCleanupOnce();
      if (businesses || logs) {
        console.log(`[cleanup] ${businesses} lead, ${logs} log silindi`);
      }
    } catch (e: any) {
      console.error('[cleanup] başarısız:', e?.message);
    }
  };

  void tick();
  const timer = setInterval(() => void tick(), DAY_MS);
  // Zamanlayıcı sürecin kapanmasını engellemesin.
  timer.unref();

  return () => clearInterval(timer);
}
