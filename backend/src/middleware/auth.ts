import { Request, Response, NextFunction } from 'express';
import { verifyToken, findUserById } from '../services/auth';

/**
 * Bearer JWT doğrular ve req.user'a AuthUser yerleştirir.
 *
 * Not: jeton eskiden `?token=` query param'ı ile de kabul ediliyordu. Bu
 * kaldırıldı — ters vekilin access log'una JWT yazılmasına yol açıyordu.
 * Kullanan tek yer SSE endpoint'iydi, o da frontend tarafından kullanılmıyor.
 */
export const authMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7).trim() : null;

  if (!token) {
    return res.status(401).json({ message: 'Yetkilendirme tokenı bulunamadı' });
  }

  const payload = verifyToken(token);
  if (!payload) {
    return res.status(401).json({ message: 'Geçersiz veya süresi dolmuş oturum' });
  }

  try {
    const user = await findUserById(payload.sub);
    if (!user) {
      return res.status(401).json({ message: 'Kullanıcı bulunamadı' });
    }
    (req as any).user = user;
    next();
  } catch (err: any) {
    console.error('[auth] kullanıcı okunamadı:', err.message);
    return res.status(500).json({ message: 'Yetkilendirme sırasında hata oluştu' });
  }
};
