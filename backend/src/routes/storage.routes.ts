import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { saveMedia, deleteMedia } from '../services/media';

const router = Router();
router.use(authMiddleware);

/**
 * Base64 medyayı diske yazar ve public URL döner.
 * Body: { data: <base64 (öneksiz)>, mimeType: string, filename?: string }
 * Sonuç: { url, path, mimeType, filename, size }
 */
router.post('/upload', async (req, res) => {
  try {
    const userId = (req as any).user.id as string;
    const { data, mimeType, filename } = req.body || {};

    if (!data || !mimeType) {
      return res.status(400).json({ message: 'data ve mimeType zorunlu' });
    }

    const saved = await saveMedia(userId, data, mimeType, filename);

    return res.json({
      url: saved.url,
      path: saved.path,
      mimeType,
      filename: filename || null,
      size: saved.size,
    });
  } catch (e: any) {
    return res.status(e.status || 500).json({ message: e.message });
  }
});

/** Kullanıcının kendi klasöründeki medyayı siler. */
router.delete('/media', async (req, res) => {
  try {
    const userId = (req as any).user.id as string;
    const { path: relative } = req.body || {};

    if (!relative || typeof relative !== 'string') {
      return res.status(400).json({ message: 'path zorunlu' });
    }

    const ok = await deleteMedia(userId, relative);
    if (!ok) {
      return res.status(403).json({ message: 'Sadece kendi medyanı silebilirsin' });
    }

    return res.json({ ok: true });
  } catch (e: any) {
    return res.status(500).json({ message: e.message });
  }
});

export default router;
