/**
 * Zamanlanmış kampanya çalıştırıcı.
 *
 * Dakikada bir, vakti gelmiş 'pending' kampanyaları alır ve mevcut
 * startCampaign akışına devreder.
 *
 * Aktif saat penceresi kapalıysa kampanya 'failed' olur (beklemez) — bu
 * bilinçli bir karar. Hata mesajı sebebi açıkça yazar ki kullanıcı sessiz bir
 * başarısızlıkla karşılaşmasın.
 */
import { and, eq, lte } from 'drizzle-orm';
import { db } from '../db/client';
import { whatsappScheduledCampaigns } from '../db/schema';
import { isWithinActiveWindow, loadFeatureSettings } from './automation';
import { startCampaign } from './whatsapp';

const TICK_MS = 60_000;

async function finish(id: string, status: 'failed' | 'running' | 'completed', error?: string) {
  await db
    .update(whatsappScheduledCampaigns)
    .set({
      status,
      error: error ?? null,
      ...(status === 'running' ? { started_at: new Date() } : { finished_at: new Date() }),
    })
    .where(eq(whatsappScheduledCampaigns.id, id));
}

async function runDue(): Promise<void> {
  const due = await db
    .select()
    .from(whatsappScheduledCampaigns)
    .where(
      and(
        eq(whatsappScheduledCampaigns.status, 'pending'),
        lte(whatsappScheduledCampaigns.scheduled_at, new Date()),
      ),
    );

  for (const campaign of due) {
    // Durumu önce 'running' yap ve bunu yalnızca hâlâ 'pending' ise başar:
    // iki tick üst üste binerse kampanya iki kez başlamaz.
    const claimed = await db
      .update(whatsappScheduledCampaigns)
      .set({ status: 'running', started_at: new Date() })
      .where(
        and(
          eq(whatsappScheduledCampaigns.id, campaign.id),
          eq(whatsappScheduledCampaigns.status, 'pending'),
        ),
      )
      .returning({ id: whatsappScheduledCampaigns.id });

    if (claimed.length === 0) continue;

    try {
      const settings = await loadFeatureSettings(campaign.user_id, 'scheduled');
      if (!isWithinActiveWindow(settings)) {
        const window =
          settings.active_hours_start && settings.active_hours_end
            ? `${settings.active_hours_start}–${settings.active_hours_end}`
            : 'seçili günler';
        await finish(
          campaign.id,
          'failed',
          `Kampanya vakti geldi ama aktif gönderim penceresi (${window}, ${settings.timezone}) kapalıydı. ` +
            `Yeni bir zaman seçip tekrar kurun veya Ayarlar'dan pencereyi genişletin.`,
        );
        console.warn(`[scheduler] ${campaign.id} pencere kapalı — iptal edildi`);
        continue;
      }

      await startCampaign({
        userId: campaign.user_id,
        listId: campaign.list_id,
        lineId: campaign.line_id ?? undefined,
        messageTemplate: campaign.message_template,
        messageTemplateNoWebsite: campaign.message_template_no_website ?? undefined,
        minDelaySec: campaign.min_delay_sec ?? 60,
        maxDelaySec: campaign.max_delay_sec ?? 120,
        coffeeBreakEvery: campaign.coffee_break_every ?? 20,
        coffeeBreakMinutes: campaign.coffee_break_minutes ?? 15,
        media: (campaign.media as any) ?? undefined,
      });

      // startCampaign gönderimi arka planda sürdürür; kuyruk açısından iş
      // burada tamamlanmıştır.
      await finish(campaign.id, 'completed');
      console.log(`[scheduler] ${campaign.id} başlatıldı`);
    } catch (err: any) {
      await finish(campaign.id, 'failed', err?.message || 'Kampanya başlatılamadı');
      console.error(`[scheduler] ${campaign.id} başarısız:`, err?.message);
    }
  }
}

export function startScheduler(): () => void {
  const tick = async () => {
    try {
      await runDue();
    } catch (e: any) {
      console.error('[scheduler] tick başarısız:', e?.message);
    }
  };

  void tick();
  const timer = setInterval(() => void tick(), TICK_MS);
  timer.unref();

  return () => clearInterval(timer);
}
