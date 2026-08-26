import { Request, Response } from 'express';
import { and, eq, ilike, gte, lte, ne, isNotNull, asc, desc, count, sql, SQL } from 'drizzle-orm';
import { db } from '../db/client';
import { businesses, scrapeJobs, outreachLogs, contacts } from '../db/schema';
import { ScraperService } from '../services/scraper';

/**
 * sortBy doğrudan query string'den geliyor. ORDER BY'a interpolasyonla değil,
 * bu izin listesinden geçirilerek konur — aksi halde sıralama ifadesi
 * dışarıdan yönlendirilebilirdi.
 */
const SORTABLE = {
  created_at: businesses.created_at,
  name: businesses.name,
  rating: businesses.rating,
  reviews_count: businesses.reviews_count,
  city: businesses.city,
} as const;

export const getBusinesses = async (req: Request, res: Response) => {
  const {
    city,
    district,
    neighborhood,
    category,
    hasEmail,
    hasWebsite,
    hasPhone,
    minRating,
    maxRating,
    minReviews,
    sortBy = 'created_at',
    sortOrder = 'desc',
    page = 1,
    limit = 20,
  } = req.query;

  const userId = (req as any).user.id as string;
  const offset = (Number(page) - 1) * Number(limit);

  // Eskiden `.or('user_id.eq.X,user_id.is.null')` idi: user_id'si null olan her
  // kayıt bütün kullanıcılara görünüyordu. Düz eşitliğe çevrildi.
  const filters: SQL[] = [eq(businesses.user_id, userId)];

  if (city) filters.push(ilike(businesses.city, `%${city}%`));
  if (district) filters.push(ilike(businesses.district, `%${district}%`));
  if (neighborhood) filters.push(ilike(businesses.neighborhood, `%${neighborhood}%`));
  if (category) {
    const first = String(category)
      .split(',')
      .map((c) => c.trim())
      .filter(Boolean)[0];
    if (first) filters.push(ilike(businesses.category, `%${first}%`));
  }

  if (hasEmail === 'true') {
    filters.push(isNotNull(businesses.email), ne(businesses.email, ''));
  }
  if (hasWebsite === 'true') {
    filters.push(isNotNull(businesses.website), ne(businesses.website, ''));
  }
  if (hasPhone === 'true') {
    filters.push(isNotNull(businesses.phone), ne(businesses.phone, ''));
  }

  if (minRating) filters.push(gte(businesses.rating, Number(minRating)));
  if (maxRating) filters.push(lte(businesses.rating, Number(maxRating)));
  if (minReviews) filters.push(gte(businesses.reviews_count, Number(minReviews)));

  const where = and(...filters);
  const sortCol = SORTABLE[String(sortBy) as keyof typeof SORTABLE] ?? businesses.created_at;
  const direction = sortOrder === 'asc' ? asc : desc;

  try {
    const [rows, totalRows] = await Promise.all([
      db
        .select()
        .from(businesses)
        .where(where)
        .orderBy(direction(sortCol))
        .limit(Number(limit))
        .offset(offset),
      db.select({ value: count() }).from(businesses).where(where),
    ]);

    const total = totalRows[0]?.value ?? 0;

    return res.json({
      data: rows,
      total,
      page: Number(page),
      limit: Number(limit),
      totalPages: Math.ceil(total / Number(limit)),
    });
  } catch (error: any) {
    console.error('[getBusinesses] hata:', error.message);
    return res.status(500).json({ message: error.message });
  }
};

export const getBusiness = async (req: Request, res: Response) => {
  const { id } = req.params;
  const userId = (req as any).user.id as string;

  try {
    const [business] = await db
      .select()
      .from(businesses)
      .where(and(eq(businesses.id, String(id)), eq(businesses.user_id, userId)))
      .limit(1);

    if (!business) {
      return res.status(404).json({ message: 'İşletme bulunamadı' });
    }

    const [contactRows, logRows] = await Promise.all([
      db.select().from(contacts).where(eq(contacts.business_id, business.id)),
      db
        .select()
        .from(outreachLogs)
        .where(and(eq(outreachLogs.business_id, business.id), eq(outreachLogs.user_id, userId)))
        .orderBy(desc(outreachLogs.created_at)),
    ]);

    return res.json({
      ...business,
      contacts: contactRows,
      outreach_logs: logRows,
    });
  } catch (error: any) {
    console.error('[getBusiness] hata:', error.message);
    return res.status(500).json({ message: error.message });
  }
};

export const getStats = async (req: Request, res: Response) => {
  const userId = (req as any).user.id as string;
  const now = new Date();
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  try {
    // Dört ayrı COUNT sorgusu yerine tek taramada filtreli sayım.
    const [row] = await db
      .select({
        total: count(),
        withWebsite:
          sql<number>`count(*) filter (where ${businesses.website} is not null and ${businesses.website} <> '')`.mapWith(
            Number,
          ),
        withPhone:
          sql<number>`count(*) filter (where ${businesses.phone} is not null and ${businesses.phone} <> '')`.mapWith(
            Number,
          ),
        thisMonth:
          sql<number>`count(*) filter (where ${businesses.created_at} >= ${firstOfMonth})`.mapWith(
            Number,
          ),
      })
      .from(businesses)
      .where(eq(businesses.user_id, userId));

    return res.json({
      total: row?.total ?? 0,
      withWebsite: row?.withWebsite ?? 0,
      withPhone: row?.withPhone ?? 0,
      thisMonth: row?.thisMonth ?? 0,
    });
  } catch (error: any) {
    console.error('[getStats] hata:', error.message);
    return res.status(500).json({ message: error.message });
  }
};

export const startScrape = async (req: Request, res: Response) => {
  const { category, city, district, neighborhood } = req.body;

  if (!category || !city) {
    return res.status(400).json({ message: 'Kategori ve şehir zorunludur' });
  }

  const user = (req as any).user;
  const userId = user.id as string;

  // Plan limiti kontrolü
  try {
    const { assertCanScrape, incrementScrape } = await import('../services/subscription');
    await assertCanScrape(user);
    // Tarama BAŞLATILDIĞI an sayılır (kullanıcı limitten fazla iş başlatamaz)
    await incrementScrape(userId, 1);
  } catch (e: any) {
    return res.status(e.statusCode || 500).json({ message: e.message, code: e.code });
  }

  try {
    const [job] = await db
      .insert(scrapeJobs)
      .values({ category, city, district, neighborhood, status: 'pending', user_id: userId })
      .returning();

    // Tarayıcı arka planda çalışır; isteği bekletmez.
    ScraperService.startScraping({
      jobId: job.id,
      userId,
      category,
      city,
      district,
      neighborhood,
    });

    return res.status(202).json({ jobId: job.id, message: 'Tarama başlatıldı' });
  } catch (error: any) {
    console.error('[startScrape] hata:', error.message);
    return res.status(500).json({ message: error.message });
  }
};

export const getScrapeJob = async (req: Request, res: Response) => {
  const { id } = req.params;
  const userId = (req as any).user.id as string;

  const [job] = await db
    .select()
    .from(scrapeJobs)
    .where(and(eq(scrapeJobs.id, String(id)), eq(scrapeJobs.user_id, userId)))
    .limit(1);

  if (!job) return res.status(404).json({ message: 'İş bulunamadı' });
  return res.json(job);
};

export const getScrapeJobs = async (req: Request, res: Response) => {
  const userId = (req as any).user.id as string;

  try {
    const rows = await db
      .select()
      .from(scrapeJobs)
      .where(eq(scrapeJobs.user_id, userId))
      .orderBy(desc(scrapeJobs.created_at));
    return res.json(rows);
  } catch (error: any) {
    return res.status(500).json({ message: error.message });
  }
};

export const deleteScrapeJob = async (req: Request, res: Response) => {
  const { id } = req.params;
  const userId = (req as any).user.id as string;

  try {
    await db
      .delete(scrapeJobs)
      .where(and(eq(scrapeJobs.id, String(id)), eq(scrapeJobs.user_id, userId)));
    return res.json({ message: 'İş başarıyla silindi' });
  } catch (error: any) {
    return res.status(500).json({ message: error.message });
  }
};

export const stopScrapeJob = async (req: Request, res: Response) => {
  const { id } = req.params;
  const userId = (req as any).user.id as string;

  try {
    await db
      .update(scrapeJobs)
      .set({ status: 'failed', error_message: 'Kullanıcı tarafından durduruldu' })
      .where(and(eq(scrapeJobs.id, String(id)), eq(scrapeJobs.user_id, userId)));
    return res.json({ message: 'İş durduruldu' });
  } catch (error: any) {
    return res.status(500).json({ message: error.message });
  }
};

export const logOutreach = async (req: Request, res: Response) => {
  const { businessId, type, message_content } = req.body;
  const userId = (req as any).user.id as string;

  try {
    // İşletmenin gerçekten bu kullanıcıya ait olduğunu doğrula — aksi halde
    // başkasının işletmesine log yazılabilirdi.
    const [business] = await db
      .select({ id: businesses.id, phone: businesses.phone })
      .from(businesses)
      .where(and(eq(businesses.id, String(businessId)), eq(businesses.user_id, userId)))
      .limit(1);

    if (!business) {
      return res.status(404).json({ message: 'İşletme bulunamadı' });
    }

    const [log] = await db
      .insert(outreachLogs)
      .values({
        business_id: business.id,
        type: type || 'whatsapp',
        message_content,
        status: 'sent',
        user_id: userId,
      })
      .returning();

    const waLink = business.phone
      ? `https://api.whatsapp.com/send?phone=${business.phone.replace(/\D/g, '')}&text=${encodeURIComponent(message_content)}`
      : null;

    return res.status(201).json({ ...log, waLink });
  } catch (error: any) {
    console.error('[logOutreach] hata:', error.message);
    return res.status(500).json({ message: error.message });
  }
};

export const clearAllData = async (req: Request, res: Response) => {
  const userId = (req as any).user.id as string;

  try {
    // Sıra önemli: outreach_logs ve list_items businesses'a FK ile bağlı.
    await db.delete(outreachLogs).where(eq(outreachLogs.user_id, userId));
    await db.delete(scrapeJobs).where(eq(scrapeJobs.user_id, userId));
    await db.delete(businesses).where(eq(businesses.user_id, userId));

    return res.json({ message: 'Kendi verileriniz başarıyla temizlendi' });
  } catch (error: any) {
    return res.status(500).json({ message: error.message });
  }
};
