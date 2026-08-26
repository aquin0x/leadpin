/**
 * Medya deposu — Supabase Storage'ın (whatsapp-media bucket) yerine.
 *
 * Dosyalar kalıcı diskte /data/media/<userId>/<uuid>.<ext> altında tutulur ve
 * Express tarafından /media üzerinden servis edilir.
 */
import path from 'path';
import fs from 'fs/promises';
import crypto from 'crypto';

const APP_DATA_DIR = process.env.APP_DATA_DIR || process.cwd();
export const MEDIA_DIR = path.resolve(APP_DATA_DIR, 'media');

const MAX_BYTES = 16 * 1024 * 1024;

export interface SavedMedia {
  url: string;
  path: string;
  size: number;
}

function httpError(message: string, status: number): Error & { status: number } {
  const err = new Error(message) as Error & { status: number };
  err.status = status;
  return err;
}

export async function saveMedia(
  userId: string,
  base64: string,
  mimeType: string,
  filename?: string,
): Promise<SavedMedia> {
  const buffer = Buffer.from(base64, 'base64');
  if (buffer.length === 0) throw httpError('Geçersiz base64 verisi', 400);
  if (buffer.length > MAX_BYTES) throw httpError('Dosya 16 MB sınırını aşıyor', 413);

  const rawExt = (filename || '').split('.').pop()?.toLowerCase() || mimeType.split('/')[1] || 'bin';
  // Uzantı doğrudan yola giriyor: nokta veya ayırıcı içeren bir değer dizin
  // dışına çıkmaya yarayabilir. Yalnızca sade alfanümerik uzantı kabul edilir.
  const ext = /^[a-z0-9]{1,8}$/.test(rawExt) ? rawExt : 'bin';

  const relative = `${userId}/${crypto.randomUUID()}.${ext}`;
  await fs.mkdir(path.join(MEDIA_DIR, userId), { recursive: true });
  await fs.writeFile(path.join(MEDIA_DIR, relative), buffer);

  const base = (process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '');
  return { url: `${base}/media/${relative}`, path: relative, size: buffer.length };
}

/** Kullanıcı yalnızca kendi klasöründeki dosyayı silebilir. */
export async function deleteMedia(userId: string, relative: string): Promise<boolean> {
  const resolved = path.resolve(MEDIA_DIR, relative);
  const userRoot = path.resolve(MEDIA_DIR, userId);

  // path.resolve, "../" gibi parçaları çözer; sonuç kullanıcının klasörünün
  // altında değilse istek reddedilir.
  if (resolved !== userRoot && !resolved.startsWith(userRoot + path.sep)) {
    return false;
  }

  await fs.rm(resolved, { force: true });
  return true;
}
