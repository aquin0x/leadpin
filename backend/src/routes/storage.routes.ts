import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { supabase } from '../utils/supabase';
import crypto from 'crypto';

const router = Router();
router.use(authMiddleware);

/**
 * Base64 medyayı whatsapp-media bucket'ına yükler ve public URL döner.
 * Body: { data: <base64 (no prefix)>, mimeType: string, filename?: string }
 *
 * Sonuç: { url, path, mimeType, filename }
 *
 * Şu an aktif kullanılmıyor — Scheduled / Template medya feature'ları
 * implement edildiğinde base64'ü DB'ye yazmak yerine bu endpoint çağrılır.
 */
router.post('/upload', async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const { data, mimeType, filename } = req.body || {};

    if (!data || !mimeType) {
      return res.status(400).json({ message: 'data ve mimeType zorunlu' });
    }

    // Base64 → Buffer
    const buffer = Buffer.from(data, 'base64');
    if (buffer.length === 0) {
      return res.status(400).json({ message: 'Geçersiz base64 verisi' });
    }
    if (buffer.length > 16 * 1024 * 1024) {
      return res.status(413).json({ message: 'Dosya 16 MB sınırını aşıyor' });
    }

    // Path: <userId>/<uuid>.<ext>
    const ext = (filename || '').split('.').pop()?.toLowerCase() || mimeType.split('/')[1] || 'bin';
    const path = `${userId}/${crypto.randomUUID()}.${ext}`;

    const { error: uploadErr } = await supabase.storage
      .from('whatsapp-media')
      .upload(path, buffer, {
        contentType: mimeType,
        upsert: false,
      });

    if (uploadErr) {
      return res.status(500).json({ message: `Upload başarısız: ${uploadErr.message}` });
    }

    const { data: pub } = supabase.storage.from('whatsapp-media').getPublicUrl(path);

    return res.json({
      url: pub.publicUrl,
      path,
      mimeType,
      filename: filename || null,
      size: buffer.length,
    });
  } catch (e: any) {
    return res.status(500).json({ message: e.message });
  }
});

/** Bucket'tan medya sil (kullanıcı kendi klasörü) */
router.delete('/media', async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const { path } = req.body || {};
    if (!path || typeof path !== 'string') {
      return res.status(400).json({ message: 'path zorunlu' });
    }
    if (!path.startsWith(`${userId}/`)) {
      return res.status(403).json({ message: 'Sadece kendi medyanı silebilirsin' });
    }
    const { error } = await supabase.storage.from('whatsapp-media').remove([path]);
    if (error) return res.status(500).json({ message: error.message });
    return res.json({ ok: true });
  } catch (e: any) {
    return res.status(500).json({ message: e.message });
  }
});

export default router;
