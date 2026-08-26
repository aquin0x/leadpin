import { Request, Response } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../db/client';
import { users } from '../db/schema';
import {
  hashPassword,
  verifyPassword,
  issueToken,
  findUserByEmail,
  AuthUser,
} from '../services/auth';

/** Frontend'e dönen kullanıcı şekli — snake_case, api-client bunu bekliyor. */
const publicUser = (u: AuthUser) => ({
  id: u.id,
  email: u.email,
  is_admin: u.isAdmin,
  link_owner: u.linkOwner,
});

const MIN_PASSWORD = 8;

// scrypt keylen 64 bayt => 128 hex karakter. Kullanıcı bulunamadığında
// karşılaştırılacak sahte hash bu uzunlukta olmalı ki doğrulama maliyeti
// gerçek bir hash'inkiyle aynı olsun.
const KEYLEN_HEX = 128;

export const signup = async (req: Request, res: Response) => {
  if (process.env.SIGNUP_ENABLED !== 'true') {
    return res.status(403).json({ message: 'Yeni kayıt kapalı.' });
  }

  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');

  if (!email || !password) {
    return res.status(400).json({ message: 'E-posta ve şifre zorunlu' });
  }
  if (!email.includes('@')) {
    return res.status(400).json({ message: 'Geçerli bir e-posta girin' });
  }
  if (password.length < MIN_PASSWORD) {
    return res.status(400).json({ message: `Şifre en az ${MIN_PASSWORD} karakter olmalı` });
  }
  if (await findUserByEmail(email)) {
    return res.status(409).json({ message: 'Bu e-posta zaten kayıtlı' });
  }

  const [row] = await db
    .insert(users)
    .values({ email, password_hash: await hashPassword(password) })
    .returning();

  const user: AuthUser = {
    id: row.id,
    email: row.email,
    isAdmin: row.is_admin,
    linkOwner: row.link_owner,
  };
  return res.status(201).json({ token: issueToken(user), user: publicUser(user) });
};

export const login = async (req: Request, res: Response) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');

  const row = await findUserByEmail(email);

  // Kullanıcı bulunamasa da bir hash doğrulaması çalıştırılır: aksi halde
  // cevap süresi "kayıtlı e-posta" ile "kayıtsız e-posta" arasında ölçülebilir
  // fark yaratır ve hangi adreslerin kayıtlı olduğu sızar.
  const dummyHash = `${'0'.repeat(32)}:${'0'.repeat(KEYLEN_HEX)}`;
  const ok = await verifyPassword(password, row ? row.password_hash : dummyHash);

  if (!row || !ok) {
    return res.status(401).json({ message: 'E-posta veya şifre hatalı' });
  }

  const user: AuthUser = {
    id: row.id,
    email: row.email,
    isAdmin: row.is_admin,
    linkOwner: row.link_owner,
  };
  return res.json({ token: issueToken(user), user: publicUser(user) });
};

export const me = async (req: Request, res: Response) => {
  return res.json({ user: publicUser((req as any).user as AuthUser) });
};

export const changePassword = async (req: Request, res: Response) => {
  const current = (req as any).user as AuthUser;
  const { currentPassword, newPassword } = req.body || {};

  if (!newPassword || String(newPassword).length < MIN_PASSWORD) {
    return res.status(400).json({ message: `Yeni şifre en az ${MIN_PASSWORD} karakter olmalı` });
  }

  const row = await findUserByEmail(current.email);
  if (!row || !(await verifyPassword(String(currentPassword || ''), row.password_hash))) {
    return res.status(401).json({ message: 'Mevcut şifre hatalı' });
  }

  await db
    .update(users)
    .set({ password_hash: await hashPassword(String(newPassword)), updated_at: new Date() })
    .where(eq(users.id, current.id));

  return res.json({ ok: true });
};

export const changeEmail = async (req: Request, res: Response) => {
  const current = (req as any).user as AuthUser;
  const { currentPassword, newEmail } = req.body || {};
  const email = String(newEmail || '').trim().toLowerCase();

  if (!email.includes('@')) {
    return res.status(400).json({ message: 'Geçerli bir e-posta girin' });
  }

  const row = await findUserByEmail(current.email);
  if (!row || !(await verifyPassword(String(currentPassword || ''), row.password_hash))) {
    return res.status(401).json({ message: 'Mevcut şifre hatalı' });
  }
  if (email !== current.email && (await findUserByEmail(email))) {
    return res.status(409).json({ message: 'Bu e-posta zaten kayıtlı' });
  }

  await db.update(users).set({ email, updated_at: new Date() }).where(eq(users.id, current.id));

  // Jeton payload'ında e-posta var; değiştiği için yenisi verilir.
  const user: AuthUser = { ...current, email };
  return res.json({ token: issueToken(user), user: publicUser(user) });
};
