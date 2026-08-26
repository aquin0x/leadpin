/**
 * Kimlik doğrulama — Supabase Auth (GoTrue) yerine.
 *
 * Şifreler node:crypto scrypt ile saklanır (bcrypt/argon2 native derleme
 * gerektirdiği için masaüstü `pkg` paketlemesini bozardı). Oturum, 7 gün ömürlü
 * HS256 JWT ile taşınır; refresh token yok — tek kullanıcılı bir iç araç için
 * gereksiz karmaşıklık olurdu.
 */
import crypto from 'crypto';
import { promisify } from 'util';
import jwt from 'jsonwebtoken';
import { eq } from 'drizzle-orm';
import { db } from '../db/client';
import { users } from '../db/schema';

const scrypt = promisify(crypto.scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>;

const KEYLEN = 64;
const TOKEN_TTL = '7d';

export interface AuthUser {
  id: string;
  email: string;
  isAdmin: boolean;
  linkOwner: boolean;
}

function jwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('JWT_SECRET tanımlı değil veya 32 karakterden kısa.');
  }
  return secret;
}

/** "<saltHex>:<hashHex>" biçiminde saklanabilir bir değer üretir. */
export async function hashPassword(plain: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const derived = await scrypt(plain, salt, KEYLEN);
  return `${salt.toString('hex')}:${derived.toString('hex')}`;
}

export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  const [saltHex, hashHex] = (stored || '').split(':');
  if (!saltHex || !hashHex) return false;

  let expected: Buffer;
  let derived: Buffer;
  try {
    expected = Buffer.from(hashHex, 'hex');
    derived = await scrypt(plain, Buffer.from(saltHex, 'hex'), KEYLEN);
  } catch {
    return false;
  }

  // timingSafeEqual uzunluklar farklıysa fırlatır — önce kontrol et.
  if (expected.length !== derived.length) return false;
  return crypto.timingSafeEqual(derived, expected);
}

export function issueToken(user: AuthUser): string {
  return jwt.sign({ email: user.email }, jwtSecret(), {
    subject: user.id,
    expiresIn: TOKEN_TTL,
  });
}

export function verifyToken(token: string): { sub: string; email: string } | null {
  try {
    const payload = jwt.verify(token, jwtSecret()) as jwt.JwtPayload;
    if (!payload.sub) return null;
    return { sub: String(payload.sub), email: String(payload.email ?? '') };
  } catch {
    return null;
  }
}

export async function findUserById(id: string): Promise<AuthUser | null> {
  const [row] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (!row) return null;
  return { id: row.id, email: row.email, isAdmin: row.isAdmin, linkOwner: row.linkOwner };
}

export async function findUserByEmail(email: string) {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return null;
  const [row] = await db.select().from(users).where(eq(users.email, normalized)).limit(1);
  return row ?? null;
}

/**
 * Kayıt kapalıyken bile ilk girişin mümkün olması için: users tablosu boşsa ve
 * SEED_ADMIN_* env'leri verilmişse admin kullanıcıyı oluşturur. Tablo doluysa
 * hiçbir şey yapmaz, yani mevcut şifreyi ezmez.
 */
export async function seedAdminUser(): Promise<void> {
  const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!email || !password) return;

  const existing = await db.select({ id: users.id }).from(users).limit(1);
  if (existing.length > 0) return;

  await db.insert(users).values({
    email,
    passwordHash: await hashPassword(password),
    isAdmin: true,
    linkOwner: true,
  });
  console.log(`[auth] ilk admin kullanıcı oluşturuldu: ${email}`);
}
