import { Router } from 'express';
import { asc, eq } from 'drizzle-orm';
import { authMiddleware } from '../middleware/auth';
import { db } from '../db/client';
import { plans, businessesExpiringSoon } from '../db/schema';
import { getOrInitSubscription, getStoredLeadCount, redeemToken } from '../services/subscription';

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

// 7 gün içinde otomatik temizliğe takılacak lead'ler (banner için)
router.get('/expiring-leads', async (req, res) => {
  try {
    const userId = (req as any).user.id as string;
    const rows = await db
      .select({
        id: businessesExpiringSoon.id,
        name: businessesExpiringSoon.name,
        created_at: businessesExpiringSoon.created_at,
        expires_at: businessesExpiringSoon.expires_at,
      })
      .from(businessesExpiringSoon)
      .where(eq(businessesExpiringSoon.user_id, userId))
      .orderBy(asc(businessesExpiringSoon.expires_at))
      .limit(100);

    res.json({ rows, total: rows.length });
  } catch (e: any) {
    res.status(500).json({ message: e.message });
  }
});

// Plan kataloğu (Plan sekmesinde göstermek için)
router.get('/plans', async (_req, res) => {
  try {
    const rows = await db.select().from(plans).orderBy(asc(plans.display_order));
    res.json(rows);
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
