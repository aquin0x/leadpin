import { Request, Response } from 'express';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { db } from '../db/client';
import { lists, whatsappScheduledCampaigns } from '../db/schema';

function uid(req: Request): string {
  return (req as any).user.id;
}

export const listScheduled = async (req: Request, res: Response) => {
  try {
    // Frontend `item.lists?.name` okuyor — PostgREST'te gömülü ilişkiydi,
    // burada JOIN ile aynı iç içe şekil üretiliyor.
    const rows = await db
      .select({
        id: whatsappScheduledCampaigns.id,
        user_id: whatsappScheduledCampaigns.user_id,
        list_id: whatsappScheduledCampaigns.list_id,
        line_id: whatsappScheduledCampaigns.line_id,
        name: whatsappScheduledCampaigns.name,
        message_template: whatsappScheduledCampaigns.message_template,
        message_template_no_website: whatsappScheduledCampaigns.message_template_no_website,
        media: whatsappScheduledCampaigns.media,
        min_delay_sec: whatsappScheduledCampaigns.min_delay_sec,
        max_delay_sec: whatsappScheduledCampaigns.max_delay_sec,
        coffee_break_every: whatsappScheduledCampaigns.coffee_break_every,
        coffee_break_minutes: whatsappScheduledCampaigns.coffee_break_minutes,
        scheduled_at: whatsappScheduledCampaigns.scheduled_at,
        status: whatsappScheduledCampaigns.status,
        error: whatsappScheduledCampaigns.error,
        started_at: whatsappScheduledCampaigns.started_at,
        finished_at: whatsappScheduledCampaigns.finished_at,
        created_at: whatsappScheduledCampaigns.created_at,
        lists: { name: lists.name },
      })
      .from(whatsappScheduledCampaigns)
      .leftJoin(lists, eq(whatsappScheduledCampaigns.list_id, lists.id))
      .where(eq(whatsappScheduledCampaigns.user_id, uid(req)))
      .orderBy(desc(whatsappScheduledCampaigns.scheduled_at));

    return res.json({ scheduled: rows });
  } catch (e: any) {
    return res.status(500).json({ message: e.message });
  }
};

export const createScheduled = async (req: Request, res: Response) => {
  const userId = uid(req);
  const body = req.body || {};

  if (!body.list_id || !body.message_template) {
    return res.status(400).json({ message: 'list_id ve message_template zorunlu' });
  }

  const scheduledAt = new Date(body.scheduled_at);
  if (Number.isNaN(scheduledAt.getTime())) {
    return res.status(400).json({ message: 'Geçerli bir scheduled_at gerekli' });
  }

  try {
    // Liste sahipliği — başkasının listesine kampanya kurulamasın.
    const [ownedList] = await db
      .select({ id: lists.id })
      .from(lists)
      .where(and(eq(lists.id, String(body.list_id)), eq(lists.user_id, userId)))
      .limit(1);

    if (!ownedList) return res.status(404).json({ message: 'Liste bulunamadı' });

    const [row] = await db
      .insert(whatsappScheduledCampaigns)
      .values({
        user_id: userId,
        list_id: ownedList.id,
        line_id: body.line_id || null,
        name: body.name?.trim() || null,
        message_template: String(body.message_template),
        message_template_no_website: body.message_template_no_website || null,
        media: body.media ?? null,
        min_delay_sec: body.min_delay_sec ?? 60,
        max_delay_sec: body.max_delay_sec ?? 120,
        coffee_break_every: body.coffee_break_every ?? 20,
        coffee_break_minutes: body.coffee_break_minutes ?? 15,
        scheduled_at: scheduledAt,
        status: 'pending',
      })
      .returning();

    return res.status(201).json(row);
  } catch (e: any) {
    return res.status(400).json({ message: e.message });
  }
};

export const cancelScheduled = async (req: Request, res: Response) => {
  const userId = uid(req);
  const id = String(req.params.id);

  try {
    // Yalnızca henüz başlamamış kampanya iptal edilebilir; çalışan bir kampanya
    // WhatsApp panelinden durdurulur.
    const [row] = await db
      .update(whatsappScheduledCampaigns)
      .set({ status: 'cancelled', finished_at: new Date() })
      .where(
        and(
          eq(whatsappScheduledCampaigns.id, id),
          eq(whatsappScheduledCampaigns.user_id, userId),
          eq(whatsappScheduledCampaigns.status, 'pending'),
        ),
      )
      .returning();

    if (!row) {
      return res.status(404).json({ message: 'Bekleyen kampanya bulunamadı' });
    }
    return res.json(row);
  } catch (e: any) {
    return res.status(500).json({ message: e.message });
  }
};

export const deleteScheduled = async (req: Request, res: Response) => {
  const userId = uid(req);
  const id = String(req.params.id);

  try {
    // Çalışan kampanya silinemez — önce iptal/durdurulmalı.
    const deleted = await db
      .delete(whatsappScheduledCampaigns)
      .where(
        and(
          eq(whatsappScheduledCampaigns.id, id),
          eq(whatsappScheduledCampaigns.user_id, userId),
          inArray(whatsappScheduledCampaigns.status, [
            'pending',
            'completed',
            'cancelled',
            'failed',
          ]),
        ),
      )
      .returning({ id: whatsappScheduledCampaigns.id });

    if (deleted.length === 0) {
      return res.status(404).json({ message: 'Kampanya bulunamadı veya çalışıyor' });
    }
    return res.json({ message: 'Kampanya silindi' });
  } catch (e: any) {
    return res.status(500).json({ message: e.message });
  }
};
