import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { getBusinesses, getBusiness, getStats, startScrape, getScrapeJob, getScrapeJobs, deleteScrapeJob, stopScrapeJob, logOutreach } from './controllers/business.controller';
import { getLists, getListById, createList, addItemsToList, removeItemFromList, deleteList } from './controllers/list.controller';
import { authMiddleware } from './middleware/auth';
import { supabase } from './utils/supabase';
import whatsappRoutes from './routes/whatsapp.routes';
import userSettingsRoutes from './routes/user-settings.routes';
import subscriptionRoutes from './routes/subscription.routes';
import storageRoutes from './routes/storage.routes';

// Tauri prod modunda ENV_FILE_PATH env'i ile bundle'ın resource klasöründeki
// backend.env'i geçer; dev modunda dosya backend/.env'den okunur.
if (process.env.ENV_FILE_PATH) {
  dotenv.config({ path: process.env.ENV_FILE_PATH });
} else {
  dotenv.config();
}

const app = express();
const port = process.env.PORT || 4000;

// Masaüstü (Tauri) origin'leri her zaman izinli — Tauri 2 webview Windows'ta
// http://tauri.localhost, macOS'ta tauri://localhost, Linux'ta http://tauri.localhost
// kullanır. Sunucu dağıtımında ALLOWED_ORIGINS ile ek origin tanımlanır.
//
// Not: tek container dağıtımında panel ve API aynı origin'de olduğu için tarayıcı
// zaten CORS ön kontrolü yapmaz; bu liste masaüstü modu ve olası ayrı-origin
// kurulumları içindir.
const defaultOrigins = [
  'tauri://localhost',
  'https://tauri.localhost',
  'http://tauri.localhost',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
];

const allowedOrigins = [
  ...defaultOrigins,
  ...(process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((o) => o.trim().replace(/\/$/, ''))
    .filter(Boolean),
];

app.use(cors({
  origin: (origin, callback) => {
    if (
      !origin ||
      allowedOrigins.includes(origin.replace(/\/$/, '')) ||
      /^https?:\/\/tauri\.localhost(:\d+)?$/.test(origin) ||
      /^tauri:\/\/localhost(:\d+)?$/.test(origin)
    ) {
      callback(null, true);
    } else {
      callback(new Error(`Not allowed by CORS: ${origin}`));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '25mb' }));

// Public health check
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// Public short-link redirect: ugra.io/{shortId} -> logs the click, then 302s to landing.
// Target URL comes from SHORT_LINK_REDIRECT_URL env (shortId appended as ?lead=).
app.get('/r/:shortId', async (req, res) => {
  const { shortId } = req.params;
  // Hedef URL önceliği: işletme sahibinin kendi ayarı > global env > varsayılan.
  // Tıklama sayacı hedef bulunamasa bile artar; yönlendirme her hâlükârda yapılır.
  let base: string | null = null;

  try {
    const { data: biz } = await supabase
      .from('businesses')
      .select('id, user_id, short_id_clicks')
      .eq('short_id', shortId)
      .maybeSingle();

    if (biz) {
      await supabase
        .from('businesses')
        .update({
          short_id_clicks: (biz.short_id_clicks || 0) + 1,
          short_id_last_click_at: new Date().toISOString(),
        })
        .eq('id', biz.id);

      if (biz.user_id) {
        const { data: settings } = await supabase
          .from('user_settings')
          .select('short_link_redirect_url')
          .eq('user_id', biz.user_id)
          .maybeSingle();
        const userUrl = settings?.short_link_redirect_url?.trim();
        if (userUrl) base = userUrl;
      }
    }
  } catch (e) {
    console.error('short-link click log failed:', e);
  }

  base = base || process.env.SHORT_LINK_REDIRECT_URL || 'https://ugra.io';
  const sep = base.includes('?') ? '&' : '?';
  return res.redirect(302, `${base}${sep}lead=${encodeURIComponent(shortId)}`);
});

// WhatsApp outreach feed — gruplu (kampanya batch'leri tek satır, tekiller bireysel).
// Sidebar mesaj geçmişi bunu kullanır.
app.get('/api/outreach/whatsapp/grouped', authMiddleware, async (req, res) => {
  const userId = (req as any).user.id;
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  try {
    // Yakın geçmişten yeterli ham log çek (gruplama sonrası satır sayısı azalacak)
    // Önce yeni kolonlarla dene; migration'ı henüz çalıştırmamış kullanıcılar için
    // kolonlar yoksa eski şemayla retry et — log'lar yine de görünsün.
    let data: any[] | null = null;
    let error: any = null;

    {
      const r = await supabase
        .from('outreach_logs')
        .select(`
          id, status, message_content, created_at, batch_id, list_id,
          business:businesses(id, name, phone, short_id, short_id_clicks, short_id_last_click_at),
          list:lists(id, name)
        `)
        .eq('type', 'whatsapp')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(500);
      data = r.data as any[] | null;
      error = r.error;
    }

    // Migration uygulanmadıysa kolon yok hatası — eski şemayla tekrar dene
    if (error && /batch_id|list_id|column .* does not exist/i.test(error.message || '')) {
      console.warn('[outreach/grouped] new columns missing, falling back:', error.message);
      const r = await supabase
        .from('outreach_logs')
        .select(`
          id, status, message_content, created_at,
          business:businesses(id, name, phone, short_id, short_id_clicks, short_id_last_click_at)
        `)
        .eq('type', 'whatsapp')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(500);
      data = r.data as any[] | null;
      error = r.error;
      // Eski şemada batch_id/list_id null kabul et
      if (data) data = data.map((row: any) => ({ ...row, batch_id: null, list_id: null, list: null }));
    }

    if (error) return res.status(400).json({ message: error.message });

    const rows: any[] = data || [];
    const grouped: any[] = [];
    const batchMap = new Map<string, any>();

    for (const r of rows) {
      if (r.batch_id) {
        const existing = batchMap.get(r.batch_id);
        if (existing) {
          existing.total++;
          if (r.status === 'sent') existing.sent++;
          else if (r.status === 'failed') existing.failed++;
          else if (r.status === 'skipped') existing.skipped++;
          // Tıklamayı tekil işletme bazında topla
          const bId = (r.business as any)?.id;
          const clicks = (r.business as any)?.short_id_clicks || 0;
          if (bId && !existing._bizSeen.has(bId)) {
            existing._bizSeen.add(bId);
            existing.totalClicks += clicks;
          }
          if (new Date(r.created_at) > new Date(existing.created_at)) {
            existing.created_at = r.created_at;
          }
        } else {
          const list = r.list as any;
          const bId = (r.business as any)?.id;
          const clicks = (r.business as any)?.short_id_clicks || 0;
          const entry: any = {
            kind: 'batch',
            batch_id: r.batch_id,
            list_id: r.list_id,
            list_name: list?.name ?? null,
            created_at: r.created_at,
            total: 1,
            sent: r.status === 'sent' ? 1 : 0,
            failed: r.status === 'failed' ? 1 : 0,
            skipped: r.status === 'skipped' ? 1 : 0,
            totalClicks: bId ? clicks : 0,
            _bizSeen: new Set<string>(bId ? [bId] : []),
          };
          batchMap.set(r.batch_id, entry);
          grouped.push(entry);
        }
      } else {
        grouped.push({
          kind: 'single',
          id: r.id,
          status: r.status,
          message_content: r.message_content,
          created_at: r.created_at,
          business: r.business,
        });
      }
    }

    // _bizSeen Set'lerini temizle (JSON'a çıkmasın)
    for (const g of grouped) {
      if (g.kind === 'batch') delete g._bizSeen;
    }

    grouped.sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    return res.json({ rows: grouped.slice(0, limit) });
  } catch (e: any) {
    return res.status(500).json({ message: e.message });
  }
});

// WhatsApp outreach feed (auth) — used by the "Gönderilen Mesajlar" panel.
app.get('/api/outreach/whatsapp', authMiddleware, async (req, res) => {
  const userId = (req as any).user.id;
  const { search, limit = 50, offset = 0 } = req.query;
  try {
    let query = supabase
      .from('outreach_logs')
      .select('id, status, message_content, created_at, business:businesses(id, name, phone, short_id, short_id_clicks, short_id_last_click_at)', { count: 'exact' })
      .eq('type', 'whatsapp')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(Number(offset), Number(offset) + Number(limit) - 1);

    const { data, error, count } = await query;
    if (error) return res.status(400).json({ message: error.message });

    let rows = data || [];
    if (search) {
      const q = String(search).toLowerCase();
      rows = rows.filter((r: any) => {
        const b = r.business;
        if (!b) return false;
        return (
          (b.short_id || '').toLowerCase().includes(q) ||
          (b.name || '').toLowerCase().includes(q) ||
          (b.phone || '').toLowerCase().includes(q)
        );
      });
    }

    return res.json({ rows, total: count });
  } catch (e: any) {
    return res.status(500).json({ message: e.message });
  }
});

// Auth protected routes
app.get('/api/stats', authMiddleware, getStats);
app.get('/api/businesses', authMiddleware, getBusinesses);
app.get('/api/businesses/:id', authMiddleware, getBusiness);
app.post('/api/scrape', authMiddleware, startScrape);
app.get('/api/scrape-jobs', authMiddleware, getScrapeJobs);
app.delete('/api/scrape/:id', authMiddleware, deleteScrapeJob);
app.post('/api/scrape/:id/stop', authMiddleware, stopScrapeJob);
app.get('/api/scrape/:id', authMiddleware, getScrapeJob);
app.get('/api/scrape/:id/status', authMiddleware, getScrapeJob);
app.post('/api/outreach/whatsapp-log', authMiddleware, logOutreach);
app.post('/api/admin/clear-data', authMiddleware, (req, res) => {
  const { clearAllData } = require('./controllers/business.controller');
  return clearAllData(req, res);
});

// WhatsApp Campaign Routes
app.use('/api/whatsapp', whatsappRoutes);

// User Settings (short link domain + WhatsApp proxy)
app.use('/api/user-settings', userSettingsRoutes);

// Plan / abonelik / token redeem
app.use('/api/subscription', subscriptionRoutes);

// Medya yükleme (whatsapp-media bucket)
app.use('/api/storage', storageRoutes);

// List Management Routes
app.get('/api/lists', authMiddleware, getLists);
app.get('/api/lists/:id', authMiddleware, getListById);
app.post('/api/lists', authMiddleware, createList);
app.post('/api/lists/:listId/items', authMiddleware, addItemsToList);
app.delete('/api/lists/:listId/items/:businessId', authMiddleware, removeItemFromList);
app.delete('/api/lists/:id', authMiddleware, deleteList);

// SSE for Scrape Status Updates (EventSource always uses GET)
app.get('/api/scrape/:id/stream', authMiddleware, (req, res) => {
  const { id } = req.params;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Content-Encoding', 'none'); 
  res.flushHeaders();

  console.log(`SSE Client connected for job: ${id}`);

  // Listen for real-time changes in Supabase for this specific job
  const subscription = supabase
    .channel(`job-status-${id}`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'scrape_jobs',
        filter: `id=eq.${id}`
      },
      (payload) => {
        res.write(`data: ${JSON.stringify(payload.new)}\n\n`);
      }
    )
    .subscribe();

  req.on('close', () => {
    console.log(`SSE Client disconnected for job: ${id}`);
    supabase.removeChannel(subscription);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SPA servisi (sunucu dağıtımı)
//
// Tek container dağıtımında panel ve API aynı süreçten servis edilir; bu sayede
// aynı origin'de olurlar ve CORS devreye girmez. Masaüstü (Tauri sidecar) modunda
// PUBLIC_DIR tanımlı olmaz — SPA'yı webview kendi yükler, bu blok atlanır.
// ─────────────────────────────────────────────────────────────────────────────
const publicDir = process.env.PUBLIC_DIR;

if (publicDir && fs.existsSync(publicDir)) {
  const indexHtml = path.join(publicDir, 'index.html');
  app.use(express.static(publicDir));

  // React Router fallback: API / health / short-link dışındaki her GET index.html'e.
  //
  // Express 5 path-to-regexp v8 kullanıyor; Express 4'teki app.get('*') kalıbı
  // burada hata fırlatır. Bu yüzden RegExp ile yazılmıştır.
  app.get(/^\/(?!api\/|health(?:\/|$)|r\/).*/, (_req, res) => {
    res.sendFile(indexHtml);
  });

  console.log(`📦 SPA servisi aktif: ${publicDir}`);
} else {
  console.log('📦 PUBLIC_DIR tanımlı değil — SPA servisi kapalı (masaüstü sidecar modu)');
}

// Global error handler — TÜM route'lardan sonra gelmeli, aksi halde hiç tetiklenmez.
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled Error:', err);
  res.status(err.status || 500).json({
    message: err.message || 'Bir iç sunucu hatası oluştu',
    error: process.env.NODE_ENV === 'development' ? err : {}
  });
});

const server = app.listen(Number(port), '0.0.0.0', () => {
  console.log(`🚀 LeadPin API runs on port ${port}`);
  import('./services/whatsapp').then(({ bootstrapLines }) => {
    bootstrapLines().catch((e) => console.error('WA bootstrap failed:', e?.message));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Graceful shutdown
//
// Coolify her deploy'da SIGTERM gönderir. Kampanya kotası kampanya BAŞLARKEN
// peşin düşüldüğü için (whatsapp.controller.ts), süreç iade yapmadan ölürse
// kullanıcı kotayı kaybeder. Masaüstünde nadir; sunucuda her deploy'da olur.
// ─────────────────────────────────────────────────────────────────────────────
const SHUTDOWN_TIMEOUT_MS = 15_000;
let shuttingDown = false;

async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n${signal} alındı — kapanış başlıyor...`);

  // Süre aşılırsa zorla çık; Coolify'ın SIGKILL'inden önce bitmeli.
  const forceExit = setTimeout(() => {
    console.error('Kapanış zaman aşımına uğradı, zorla çıkılıyor.');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  forceExit.unref();

  server.close();

  try {
    const { shutdownAll } = await import('./services/whatsapp');
    await shutdownAll();
  } catch (e: any) {
    console.error('WhatsApp kapanışı başarısız:', e?.message);
  }

  clearTimeout(forceExit);
  console.log('Kapanış tamamlandı.');
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
