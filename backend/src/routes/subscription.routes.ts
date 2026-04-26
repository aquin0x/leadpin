import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { supabase } from '../utils/supabase';
import {
  getOrInitSubscription,
  getStoredLeadCount,
  redeemToken,
} from '../services/subscription';

const router = Router();

router.use(authMiddleware);

// Mevcut plan + kullanım + saklı lead sayısı
router.get('/status', async (req, res) => {
  try {
    const user = (req as any).user;
    const limits = await getOrInitSubscription(user);
    const leadCount = await getStoredLeadCount(user.id);
    res.json({ ...limits, lead_count: leadCount });
  } catch (e: any) {
    res.status(500).json({ message: e.message });
  }
});

// 7 gün içinde silinecek lead'ler (banner için)
router.get('/expiring-leads', async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const { data, error } = await supabase
      .from('businesses_expiring_soon')
      .select('id, name, created_at, expires_at')
      .eq('user_id', userId)
      .order('expires_at', { ascending: true })
      .limit(100);
    if (error) {
      // View yoksa migration uygulanmamış — sessiz boş dön
      if (/relation .* does not exist/i.test(error.message)) {
        return res.json({ rows: [], total: 0 });
      }
      throw error;
    }
    res.json({ rows: data || [], total: (data || []).length });
  } catch (e: any) {
    res.status(500).json({ message: e.message });
  }
});

// Plan kataloğu (Plan sekmesinde göstermek için)
router.get('/plans', async (_req, res) => {
  try {
    const { data, error } = await supabase
      .from('plans')
      .select('*')
      .order('display_order', { ascending: true });
    if (error) throw error;
    res.json(data || []);
  } catch (e: any) {
    res.status(500).json({ message: e.message });
  }
});

// Token redeem
router.post('/redeem', async (req, res) => {
  try {
    const user = (req as any).user;
    const { token } = req.body || {};
    const limits = await redeemToken(user, token);
    res.json({ ok: true, ...limits });
  } catch (e: any) {
    res.status(e.statusCode || 500).json({ message: e.message, code: e.code });
  }
});

export default router;
