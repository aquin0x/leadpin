import { Request, Response } from 'express';
import { and, asc, desc, eq } from 'drizzle-orm';
import { db } from '../db/client';
import { whatsappAutoRules, whatsappFeatureSettings } from '../db/schema';
import { loadFeatureSettings, AutomationFeature } from '../services/automation';

const FEATURES: AutomationFeature[] = ['greeting', 'autoreply', 'scheduled'];
const MATCH_TYPES = ['contains', 'exact', 'starts_with'];

function uid(req: Request): string {
  return (req as any).user.id;
}

function isValidFeature(v: unknown): v is AutomationFeature {
  return typeof v === 'string' && (FEATURES as string[]).includes(v);
}

/** "HH:MM" veya null; başka her şey null'a düşer. */
function timeOrNull(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(v.trim()) ? v.trim() : null;
}

// ─── Özellik ayarları ────────────────────────────────────────────────────────

export const getSettings = async (req: Request, res: Response) => {
  const feature = req.params.feature;
  if (!isValidFeature(feature)) {
    return res.status(400).json({ message: 'Geçersiz özellik' });
  }
  try {
    // Kayıt yoksa varsayılanlar döner; frontend her zaman dolu bir nesne bekliyor.
    return res.json(await loadFeatureSettings(uid(req), feature));
  } catch (e: any) {
    return res.status(500).json({ message: e.message });
  }
};

export const updateSettings = async (req: Request, res: Response) => {
  const feature = req.params.feature;
  if (!isValidFeature(feature)) {
    return res.status(400).json({ message: 'Geçersiz özellik' });
  }

  const userId = uid(req);
  const body = req.body || {};

  const days = Array.isArray(body.active_days)
    ? [...new Set(body.active_days.map(Number).filter((d: number) => d >= 0 && d <= 6))].sort()
    : undefined;

  const patch = {
    enabled: typeof body.enabled === 'boolean' ? body.enabled : undefined,
    active_hours_start: 'active_hours_start' in body ? timeOrNull(body.active_hours_start) : undefined,
    active_hours_end: 'active_hours_end' in body ? timeOrNull(body.active_hours_end) : undefined,
    active_days: days,
    timezone: typeof body.timezone === 'string' && body.timezone.trim() ? body.timezone.trim() : undefined,
    single_reply_only:
      typeof body.single_reply_only === 'boolean' ? body.single_reply_only : undefined,
    updated_at: new Date(),
  };

  // undefined alanlar gönderilmemiş demektir; onConflictDoUpdate'e girmesinler.
  const set = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));

  try {
    await db
      .insert(whatsappFeatureSettings)
      .values({ user_id: userId, feature, ...set } as any)
      .onConflictDoUpdate({
        target: [whatsappFeatureSettings.user_id, whatsappFeatureSettings.feature],
        set,
      });

    return res.json(await loadFeatureSettings(userId, feature));
  } catch (e: any) {
    return res.status(400).json({ message: e.message });
  }
};

// ─── Oto-cevap kuralları ─────────────────────────────────────────────────────

export const listRules = async (req: Request, res: Response) => {
  try {
    const rules = await db
      .select()
      .from(whatsappAutoRules)
      .where(eq(whatsappAutoRules.user_id, uid(req)))
      .orderBy(desc(whatsappAutoRules.priority), asc(whatsappAutoRules.created_at));
    return res.json({ rules });
  } catch (e: any) {
    return res.status(500).json({ message: e.message });
  }
};

function ruleFields(body: any) {
  const keywords = Array.isArray(body.keywords)
    ? body.keywords.map((k: unknown) => String(k).trim()).filter(Boolean)
    : undefined;

  const matchType =
    typeof body.match_type === 'string' && MATCH_TYPES.includes(body.match_type)
      ? body.match_type
      : undefined;

  return {
    name: typeof body.name === 'string' ? body.name.trim() : undefined,
    keywords,
    match_type: matchType,
    response: typeof body.response === 'string' ? body.response : undefined,
    media_url: 'media_url' in body ? (body.media_url || null) : undefined,
    enabled: typeof body.enabled === 'boolean' ? body.enabled : undefined,
    priority: Number.isFinite(Number(body.priority)) ? Number(body.priority) : undefined,
    reply_once_per_contact:
      typeof body.reply_once_per_contact === 'boolean' ? body.reply_once_per_contact : undefined,
    cooldown_minutes: Number.isFinite(Number(body.cooldown_minutes))
      ? Math.max(0, Number(body.cooldown_minutes))
      : undefined,
    line_id: 'line_id' in body ? (body.line_id || null) : undefined,
  };
}

export const createRule = async (req: Request, res: Response) => {
  const userId = uid(req);
  const body = req.body || {};

  const type = body.type;
  if (type !== 'greeting' && type !== 'keyword') {
    return res.status(400).json({ message: "type 'greeting' veya 'keyword' olmalı" });
  }

  const fields = ruleFields(body);
  if (!fields.response || !fields.response.trim()) {
    return res.status(400).json({ message: 'response zorunlu' });
  }
  if (type === 'keyword' && (!fields.keywords || fields.keywords.length === 0)) {
    return res.status(400).json({ message: 'Anahtar kelime kuralı için en az bir kelime gerekli' });
  }

  try {
    const [rule] = await db
      .insert(whatsappAutoRules)
      .values({
        user_id: userId,
        type,
        name: fields.name || (type === 'greeting' ? 'Karşılama' : 'Kural'),
        keywords: fields.keywords ?? [],
        match_type: fields.match_type ?? 'contains',
        response: fields.response,
        media_url: fields.media_url ?? null,
        enabled: fields.enabled ?? true,
        priority: fields.priority ?? 0,
        reply_once_per_contact: fields.reply_once_per_contact ?? false,
        cooldown_minutes: fields.cooldown_minutes ?? 0,
        line_id: fields.line_id ?? null,
      })
      .returning();

    return res.status(201).json(rule);
  } catch (e: any) {
    return res.status(400).json({ message: e.message });
  }
};

export const updateRule = async (req: Request, res: Response) => {
  const userId = uid(req);
  const id = String(req.params.id);

  const fields = ruleFields(req.body || {});
  const set = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined));
  if (Object.keys(set).length === 0) {
    return res.status(400).json({ message: 'Güncellenecek alan yok' });
  }

  try {
    const [rule] = await db
      .update(whatsappAutoRules)
      .set({ ...set, updated_at: new Date() })
      .where(and(eq(whatsappAutoRules.id, id), eq(whatsappAutoRules.user_id, userId)))
      .returning();

    if (!rule) return res.status(404).json({ message: 'Kural bulunamadı' });
    return res.json(rule);
  } catch (e: any) {
    return res.status(400).json({ message: e.message });
  }
};

export const deleteRule = async (req: Request, res: Response) => {
  const userId = uid(req);
  const id = String(req.params.id);

  try {
    const deleted = await db
      .delete(whatsappAutoRules)
      .where(and(eq(whatsappAutoRules.id, id), eq(whatsappAutoRules.user_id, userId)))
      .returning({ id: whatsappAutoRules.id });

    if (deleted.length === 0) return res.status(404).json({ message: 'Kural bulunamadı' });
    return res.json({ message: 'Kural silindi' });
  } catch (e: any) {
    return res.status(500).json({ message: e.message });
  }
};
