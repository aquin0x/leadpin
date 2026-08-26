import { Request, Response } from 'express';
import { and, eq, desc, sql, inArray } from 'drizzle-orm';
import { db } from '../db/client';
import { lists, listItems, businesses, outreachLogs } from '../db/schema';

/** Listenin çağıran kullanıcıya ait olduğunu doğrular. */
async function ownsList(listId: string, userId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: lists.id })
    .from(lists)
    .where(and(eq(lists.id, listId), eq(lists.user_id, userId)))
    .limit(1);
  return !!row;
}

export const getLists = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id as string;

    // Eskiden üç ayrı sorguydu (listeler, gönderilmiş log'lar, list_items) ve
    // sayım JavaScript tarafında yapılıyordu. Tek sorguda toplanıyor.
    const rows = await db
      .select({
        id: lists.id,
        user_id: lists.user_id,
        name: lists.name,
        description: lists.description,
        created_at: lists.created_at,
        items: sql<number>`count(distinct ${listItems.business_id})`.mapWith(Number),
        sent: sql<number>`count(distinct ${listItems.business_id}) filter (where ${outreachLogs.id} is not null)`.mapWith(
          Number,
        ),
      })
      .from(lists)
      .leftJoin(listItems, eq(listItems.list_id, lists.id))
      .leftJoin(
        outreachLogs,
        and(
          eq(outreachLogs.business_id, listItems.business_id),
          eq(outreachLogs.user_id, userId),
          eq(outreachLogs.type, 'whatsapp'),
          eq(outreachLogs.status, 'sent'),
        ),
      )
      .where(eq(lists.user_id, userId))
      .groupBy(lists.id)
      .orderBy(desc(lists.created_at));

    // items_count, PostgREST'in `list_items(count)` gömülü sayımıyla aynı
    // şekilde dönmeli: frontend `list.items_count?.[0]?.count` okuyor.
    const enriched = rows.map(({ items, sent, ...list }) => ({
      ...list,
      items_count: [{ count: items }],
      sent_count: sent,
    }));

    return res.json(enriched);
  } catch (error: any) {
    console.error('[getLists] hata:', error.message);
    return res.status(500).json({ message: error.message });
  }
};

export const createList = async (req: Request, res: Response) => {
  try {
    const { name } = req.body;
    const userId = (req as any).user.id as string;

    if (!name || !String(name).trim()) {
      return res.status(400).json({ message: 'Liste adı zorunlu' });
    }

    const [row] = await db
      .insert(lists)
      .values({ name: String(name).trim(), user_id: userId })
      .returning();

    return res.status(201).json(row);
  } catch (error: any) {
    return res.status(500).json({ message: error.message });
  }
};

export const addItemsToList = async (req: Request, res: Response) => {
  try {
    const { listId } = req.params;
    const { businessIds } = req.body;
    const userId = (req as any).user.id as string;

    if (!Array.isArray(businessIds) || businessIds.length === 0) {
      return res.status(400).json({ message: 'businessIds zorunlu' });
    }

    // Liste sahipliği doğrulanmıyordu — herkes başkasının listesine ekleyebilirdi.
    if (!(await ownsList(String(listId), userId))) {
      return res.status(404).json({ message: 'Liste bulunamadı' });
    }

    // Eklenen işletmeler de kullanıcıya ait olmalı; aksi halde başkasının
    // işletmeleri kendi listesine kopyalanabilirdi.
    const owned = await db
      .select({ id: businesses.id })
      .from(businesses)
      .where(and(inArray(businesses.id, businessIds), eq(businesses.user_id, userId)));

    if (owned.length === 0) {
      return res.status(400).json({ message: 'Eklenebilecek işletme bulunamadı' });
    }

    await db
      .insert(listItems)
      .values(owned.map((b) => ({ list_id: String(listId), business_id: b.id })))
      .onConflictDoNothing();

    return res.json({
      message: 'İşletmeler başarıyla listeye eklendi',
      added: owned.length,
      skipped: businessIds.length - owned.length,
    });
  } catch (error: any) {
    console.error('[addItemsToList] hata:', error.message);
    return res.status(500).json({ message: error.message });
  }
};

export const getListById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user.id as string;

    const [list] = await db
      .select()
      .from(lists)
      .where(and(eq(lists.id, String(id)), eq(lists.user_id, userId)))
      .limit(1);

    if (!list) return res.status(404).json({ message: 'Liste bulunamadı' });

    // Eskiden `select('business:businesses(*)')` idi — gömülü ilişki seçimi
    // JOIN'e çevrildi, dönen şekil (düz işletme dizisi) korunuyor.
    const rows = await db
      .select({ business: businesses })
      .from(listItems)
      .innerJoin(businesses, eq(listItems.business_id, businesses.id))
      .where(eq(listItems.list_id, list.id));

    return res.json({ ...list, businesses: rows.map((r) => r.business) });
  } catch (error: any) {
    console.error('[getListById] hata:', error.message);
    return res.status(500).json({ message: error.message });
  }
};

export const removeItemFromList = async (req: Request, res: Response) => {
  try {
    const { listId, businessId } = req.params;
    const userId = (req as any).user.id as string;

    // Sahiplik doğrulanmıyordu.
    if (!(await ownsList(String(listId), userId))) {
      return res.status(404).json({ message: 'Liste bulunamadı' });
    }

    await db
      .delete(listItems)
      .where(
        and(eq(listItems.list_id, String(listId)), eq(listItems.business_id, String(businessId))),
      );

    return res.json({ message: 'İşletme listeden çıkarıldı' });
  } catch (error: any) {
    return res.status(500).json({ message: error.message });
  }
};

export const deleteList = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user.id as string;

    // Burada hiç user_id filtresi yoktu: kimliği doğrulanmış herhangi bir
    // kullanıcı, id'sini bildiği her listeyi silebiliyordu.
    const deleted = await db
      .delete(lists)
      .where(and(eq(lists.id, String(id)), eq(lists.user_id, userId)))
      .returning({ id: lists.id });

    if (deleted.length === 0) {
      return res.status(404).json({ message: 'Liste bulunamadı' });
    }

    return res.json({ message: 'Liste silindi' });
  } catch (error: any) {
    return res.status(500).json({ message: error.message });
  }
};
