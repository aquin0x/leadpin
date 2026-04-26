import { Request, Response } from 'express';
import { supabase } from '../utils/supabase';

export const getLists = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { data: lists, error } = await supabase
      .from('lists')
      .select('*, items_count:list_items(count)')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    if (!lists || lists.length === 0) return res.json([]);

    // Mesaj gönderilen iş­letmeleri liste başına say
    const { data: sentLogs } = await supabase
      .from('outreach_logs')
      .select('business_id')
      .eq('user_id', userId)
      .eq('type', 'whatsapp')
      .eq('status', 'sent');

    const sentBusinessIds = new Set((sentLogs || []).map((l: any) => l.business_id));

    let sentByList = new Map<string, Set<string>>();
    if (sentBusinessIds.size > 0) {
      const listIds = lists.map((l: any) => l.id);
      const { data: items } = await supabase
        .from('list_items')
        .select('list_id, business_id')
        .in('list_id', listIds)
        .in('business_id', Array.from(sentBusinessIds));

      for (const it of items || []) {
        const set = sentByList.get(it.list_id) || new Set<string>();
        set.add(it.business_id);
        sentByList.set(it.list_id, set);
      }
    }

    const enriched = lists.map((l: any) => ({
      ...l,
      sent_count: sentByList.get(l.id)?.size || 0,
    }));

    res.json(enriched);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const createList = async (req: Request, res: Response) => {
  try {
    const { name } = req.body;
    const userId = (req as any).user.id;
    
    const { data, error } = await supabase
      .from('lists')
      .insert({ name, user_id: userId })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const addItemsToList = async (req: Request, res: Response) => {
  try {
    const { listId } = req.params;
    const { businessIds } = req.body;

    const items = businessIds.map((id: string) => ({
      list_id: listId,
      business_id: id
    }));

    const { error } = await supabase
      .from('list_items')
      .upsert(items, { onConflict: 'list_id,business_id' });

    if (error) throw error;
    res.json({ message: 'İşletmeler başarıyla listeye eklendi' });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const getListById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user.id;

    const { data: list, error: listError } = await supabase
      .from('lists')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (listError) throw listError;
    if (!list) return res.status(404).json({ message: 'Liste bulunamadı' });

    const { data: items, error: itemsError } = await supabase
      .from('list_items')
      .select('business:businesses(*)')
      .eq('list_id', id);

    if (itemsError) throw itemsError;

    const businesses = (items || [])
      .map((item: any) => item.business)
      .filter(Boolean);

    res.json({ ...list, businesses });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const removeItemFromList = async (req: Request, res: Response) => {
  try {
    const { listId, businessId } = req.params;
    const { error } = await supabase
      .from('list_items')
      .delete()
      .eq('list_id', listId)
      .eq('business_id', businessId);

    if (error) throw error;
    res.json({ message: 'İşletme listeden çıkarıldı' });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const deleteList = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { error } = await supabase
      .from('lists')
      .delete()
      .eq('id', id);

    if (error) throw error;
    res.json({ message: 'Liste silindi' });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};
