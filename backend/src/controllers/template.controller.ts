import { Request, Response } from 'express';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '../db/client';
import { whatsappMessageTemplates } from '../db/schema';

function uid(req: Request): string {
  return (req as any).user.id;
}

export const listTemplates = async (req: Request, res: Response) => {
  try {
    // Frontend düz dizi bekliyor (sarmalayıcı nesne değil).
    const rows = await db
      .select()
      .from(whatsappMessageTemplates)
      .where(eq(whatsappMessageTemplates.user_id, uid(req)))
      .orderBy(desc(whatsappMessageTemplates.created_at));
    return res.json(rows);
  } catch (e: any) {
    return res.status(500).json({ message: e.message });
  }
};

export const createTemplate = async (req: Request, res: Response) => {
  const { name, content, media } = req.body || {};

  if (!name || !String(name).trim()) {
    return res.status(400).json({ message: 'Şablon adı zorunlu' });
  }
  if (!content || !String(content).trim()) {
    return res.status(400).json({ message: 'Şablon içeriği zorunlu' });
  }

  try {
    const [row] = await db
      .insert(whatsappMessageTemplates)
      .values({
        user_id: uid(req),
        name: String(name).trim(),
        content: String(content),
        media: media ?? null,
      })
      .returning();
    return res.status(201).json(row);
  } catch (e: any) {
    return res.status(400).json({ message: e.message });
  }
};

export const updateTemplate = async (req: Request, res: Response) => {
  const userId = uid(req);
  const id = String(req.params.id);
  const body = req.body || {};

  const set: Record<string, unknown> = { updated_at: new Date() };
  if (typeof body.name === 'string') set.name = body.name.trim();
  if (typeof body.content === 'string') set.content = body.content;
  // media açıkça null gönderilebilir (medyayı kaldırmak için).
  if ('media' in body) set.media = body.media ?? null;

  if (Object.keys(set).length === 1) {
    return res.status(400).json({ message: 'Güncellenecek alan yok' });
  }

  try {
    const [row] = await db
      .update(whatsappMessageTemplates)
      .set(set)
      .where(
        and(eq(whatsappMessageTemplates.id, id), eq(whatsappMessageTemplates.user_id, userId)),
      )
      .returning();

    if (!row) return res.status(404).json({ message: 'Şablon bulunamadı' });
    return res.json(row);
  } catch (e: any) {
    return res.status(400).json({ message: e.message });
  }
};

export const deleteTemplate = async (req: Request, res: Response) => {
  const userId = uid(req);
  const id = String(req.params.id);

  try {
    const deleted = await db
      .delete(whatsappMessageTemplates)
      .where(
        and(eq(whatsappMessageTemplates.id, id), eq(whatsappMessageTemplates.user_id, userId)),
      )
      .returning({ id: whatsappMessageTemplates.id });

    if (deleted.length === 0) return res.status(404).json({ message: 'Şablon bulunamadı' });
    return res.json({ message: 'Şablon silindi' });
  } catch (e: any) {
    return res.status(500).json({ message: e.message });
  }
};
