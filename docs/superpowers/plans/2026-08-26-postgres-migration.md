# Supabase → Postgres Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Supabase (PostgREST, GoTrue, Storage, Realtime) with self-hosted Postgres, own JWT auth, and disk-backed media, so LeadPin runs entirely on the user's VPS.

**Architecture:** One Express process serves the React SPA, the REST API, short links, and uploaded media. Data access goes through Drizzle ORM against a `leadpin` database on the server's existing central `postgres:18-alpine`. Authentication is our own: scrypt password hashes in a `users` table, HS256 JWTs valid 7 days. WhatsApp line metadata moves from a lock-free JSON file into Postgres, removing the single-process constraint.

**Tech Stack:** Drizzle ORM 0.45 + `pg` 8.23, drizzle-kit 0.31, `jsonwebtoken` 9, `node:crypto` scrypt, Express 5, React 19, Docker.

**Spec:** [docs/superpowers/specs/2026-08-26-postgres-migration-design.md](../specs/2026-08-26-postgres-migration-design.md)

## Global Constraints

- **No test runner exists in this repo.** `CLAUDE.md` states there is no test runner, linter, or formatter. Do not invent `npm test` or `npm run lint`. Verification in this plan is: `tsc` for types, plus `backend/scripts/smoke.mjs` (built in Task 1) for runtime behaviour against a real Postgres.
- **Every dependency must be pure JS.** The desktop build packages the backend with `@yao-pkg/pkg`; native modules break it. This rules out Prisma, `bcrypt`, and `argon2`.
- **Backend compiles to CommonJS** (`backend/tsconfig.json` → `"module": "CommonJS"`). Do not add ESM-only packages. `jose` v6 is ESM-only and must not be used; `jsonwebtoken` 9 is CJS.
- **Every query that reads user-owned rows must filter by `user_id`.** RLS is gone; application code is now the only access-control layer.
- Backend typecheck: `cd backend && npx tsc --noEmit`. Frontend typecheck: `npx tsc --noEmit` from the repo root. Both must exit 0 before any commit.
- Turkish is the language of user-facing strings and code comments in this repo. Match it.

---

## File Structure

**Created:**

| Path | Responsibility |
|---|---|
| `backend/src/db/schema.ts` | All Drizzle table definitions — single source of truth, replaces `schema.sql` |
| `backend/src/db/client.ts` | `pg` Pool + Drizzle instance, exported as `db` |
| `backend/drizzle.config.ts` | drizzle-kit configuration |
| `backend/drizzle/` | Generated migration SQL (committed) |
| `backend/src/services/auth.ts` | scrypt hashing, JWT issue/verify, user lookup, admin seed |
| `backend/src/controllers/auth.controller.ts` | signup / login / me / password / email handlers |
| `backend/src/routes/auth.routes.ts` | Auth route wiring |
| `backend/src/services/media.ts` | Disk-backed media store |
| `backend/src/services/cleanup.ts` | Daily cleanup jobs (replaces pg_cron) |
| `backend/scripts/smoke.mjs` | Runtime verification script |
| `backend/docker-compose.dev.yml` | Local Postgres for development |
| `src/lib/auth-client.ts` | Frontend auth, replaces `src/lib/supabase.ts` |

**Deleted:**

| Path | Why |
|---|---|
| `backend/src/utils/supabase.ts` | No Supabase client anymore |
| `backend/schema.sql` | Superseded by `schema.ts` + drizzle migrations |
| `src/lib/supabase.ts` | Superseded by `auth-client.ts` |

**Modified:** `backend/src/index.ts`, `backend/src/middleware/auth.ts`, all 9 files containing `supabase.from()`, `backend/src/routes/storage.routes.ts`, `Dockerfile`, and 8 frontend files listed in Task 4.

---

## Task 1: Database foundation

Sets up Postgres locally, defines the whole schema in Drizzle, generates the first migration, and builds the smoke-test harness the rest of the plan depends on.

**Files:**
- Create: `backend/docker-compose.dev.yml`
- Create: `backend/drizzle.config.ts`
- Create: `backend/src/db/schema.ts`
- Create: `backend/src/db/client.ts`
- Create: `backend/scripts/smoke.mjs`
- Modify: `backend/package.json` (deps + scripts)

**Interfaces:**
- Produces: `db` (Drizzle instance) from `backend/src/db/client.ts`; every table object from `backend/src/db/schema.ts` (`users`, `businesses`, `scrapeJobs`, `outreachLogs`, `lists`, `listItems`, `contacts`, `whatsappLines`, `whatsappAutoRules`, `whatsappGreetedContacts`, `whatsappRuleReplies`, `whatsappFeatureSettings`, `whatsappScheduledCampaigns`, `whatsappMessageTemplates`, `userSettings`, `plans`, `subscriptionTokens`, `subscriptions`); `closePool()` for graceful shutdown.

- [ ] **Step 1: Install dependencies**

```bash
cd backend
npm install drizzle-orm pg jsonwebtoken
npm install -D drizzle-kit @types/pg @types/jsonwebtoken
npm uninstall @supabase/supabase-js lucide-react
```

`lucide-react` is a frontend icon library that was installed into the backend by mistake; it has no importer in `backend/src`. Removing it here is not scope creep, it is deleting a dependency this task's `npm ci` would otherwise keep shipping into the image.

- [ ] **Step 2: Local Postgres for development**

Create `backend/docker-compose.dev.yml`:

```yaml
# Yerel geliştirme için Postgres. Sunucudaki merkezi örnekle aynı ana sürüm.
services:
  db:
    image: postgres:18-alpine
    environment:
      POSTGRES_USER: leadpin
      POSTGRES_PASSWORD: leadpin
      POSTGRES_DB: leadpin
    ports:
      - "55432:5432"
    volumes:
      - leadpin_pgdata:/var/lib/postgresql/data
volumes:
  leadpin_pgdata:
```

Run: `docker compose -f backend/docker-compose.dev.yml up -d`
Expected: container healthy; `docker exec` + `psql -c 'select 1'` returns 1.

- [ ] **Step 3: Drizzle config**

Create `backend/drizzle.config.ts`:

```ts
import type { Config } from 'drizzle-kit';

export default {
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL || 'postgres://leadpin:leadpin@localhost:55432/leadpin',
  },
} satisfies Config;
```

- [ ] **Step 4: Write the schema**

Create `backend/src/db/schema.ts`. Port every table from `backend/schema.sql`, with the Supabase-specific parts replaced per spec §5.2. Key points:

- `auth.users(id)` references become `users.id` references.
- Drop `auth.uid()` defaults on `scrapeJobs`, `outreachLogs`, `lists` — the backend supplies `user_id`.
- Add `users` (spec §5.3) and `whatsappLines` (spec §5.4).
- Keep `plans`, `subscriptions`, `subscriptionTokens` unchanged in shape.
- Keep the `check` constraints — Drizzle supports them via the third table argument.

Representative excerpt showing the conventions to follow throughout (camelCase TS name, snake_case column name):

```ts
import { pgTable, uuid, text, integer, boolean, timestamp, numeric, jsonb, primaryKey, unique, index, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  isAdmin: boolean('is_admin').notNull().default(false),
  linkOwner: boolean('link_owner').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const businesses = pgTable('businesses', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull().default(''),
  category: text('category'),
  city: text('city'),
  district: text('district'),
  neighborhood: text('neighborhood'),
  address: text('address'),
  phone: text('phone'),
  website: text('website'),
  rating: numeric('rating', { precision: 3, scale: 2 }),
  reviewsCount: integer('reviews_count').default(0),
  googleMapsUrl: text('google_maps_url').unique(),
  shortId: text('short_id').unique(),
  shortIdClicks: integer('short_id_clicks').notNull().default(0),
  shortIdLastClickAt: timestamp('short_id_last_click_at', { withTimezone: true }),
  email: text('email'),
  instagram: text('instagram'),
  facebook: text('facebook'),
  source: text('source').notNull().default('scrape'),
  status: text('status').default('new'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_businesses_user').on(t.userId),
  index('idx_businesses_user_source').on(t.userId, t.source),
  check('businesses_source_check', sql`${t.source} in ('scrape','manual','excel')`),
  check('businesses_status_check', sql`${t.status} in ('new','contacted','replied','converted','rejected')`),
]);

export const whatsappLines = pgTable('whatsapp_lines', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  label: text('label').notNull(),
  phone: text('phone'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('idx_wa_lines_user').on(t.userId)]);
```

- [ ] **Step 5: Database client**

Create `backend/src/db/client.ts`:

```ts
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from './schema';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL tanımlı değil — veritabanı bağlantısı kurulamaz.');
}

const pool = new Pool({ connectionString, max: 10 });

pool.on('error', (err) => {
  // Havuzdaki boşta bir bağlantı koparsa süreç çökmesin.
  console.error('[db] beklenmeyen havuz hatası:', err.message);
});

export const db = drizzle(pool, { schema });
export const closePool = () => pool.end();
```

- [ ] **Step 6: Generate and apply the first migration**

```bash
cd backend
npx drizzle-kit generate --name init
npx drizzle-kit migrate
```

Expected: `backend/drizzle/0000_*.sql` created; `migrate` reports applied.

- [ ] **Step 7: Verify every table exists**

Run:
```bash
docker exec -i $(docker compose -f backend/docker-compose.dev.yml ps -q db) \
  psql -U leadpin -d leadpin -c "\dt"
```
Expected: 18 tables listed, including `users`, `whatsapp_lines`, `plans`, `subscriptions`.

- [ ] **Step 8: Seed the plan catalogue**

The `plans` table is a reference table with three fixed rows (`free`, `pro`, `unlimited`) that `subscription.ts` joins against. Add to `backend/src/db/client.ts`:

```ts
import { plans } from './schema';

/** plans referans tablosunu garanti eder — açılışta bir kez çağrılır. */
export async function seedPlans(): Promise<void> {
  const rows = [
    { id: 'free', name: 'Ücretsiz', priceUsd: '0', scrapeLimit: 250, messageLimit: 100, leadStorage: 500, displayOrder: 1 },
    { id: 'pro', name: 'Pro', priceUsd: '10', scrapeLimit: 1500, messageLimit: 1000, leadStorage: 500, displayOrder: 2 },
    { id: 'unlimited', name: 'Sınırsız', priceUsd: '20', scrapeLimit: 10000, messageLimit: 5000, leadStorage: 500, displayOrder: 3 },
  ];
  for (const p of rows) {
    await db.insert(plans).values(p).onConflictDoUpdate({ target: plans.id, set: p });
  }
}
```

- [ ] **Step 9: Smoke-test harness**

Create `backend/scripts/smoke.mjs`. This is the plan's substitute for a test runner: it drives the running server over HTTP and reports pass/fail per check.

```js
#!/usr/bin/env node
// Çalışan sunucuya karşı uçtan uca kontrol. Test runner'ı yok bu projenin;
// doğrulama buradan yapılır. Kullanım: node scripts/smoke.mjs [baseUrl]
const BASE = process.argv[2] || 'http://127.0.0.1:4000';
let pass = 0, fail = 0;

async function check(name, fn) {
  try {
    await fn();
    console.log(`  ok   ${name}`);
    pass++;
  } catch (e) {
    console.log(`  FAIL ${name}\n       ${e.message}`);
    fail++;
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const json = async (res) => {
  const t = await res.text();
  try { return JSON.parse(t); } catch { throw new Error(`JSON değil: ${t.slice(0, 120)}`); }
};

export { BASE, check, assert, json };

if (import.meta.url === `file://${process.argv[1]}`) {
  await check('health 200', async () => {
    const r = await fetch(`${BASE}/health`);
    assert(r.status === 200, `beklenen 200, gelen ${r.status}`);
    assert((await json(r)).status === 'ok', 'status ok değil');
  });

  await check('kimliksiz /api/stats 401', async () => {
    const r = await fetch(`${BASE}/api/stats`);
    assert(r.status === 401, `beklenen 401, gelen ${r.status}`);
  });

  console.log(`\n${pass} geçti, ${fail} kaldı`);
  process.exit(fail ? 1 : 0);
}
```

Add to `backend/package.json` scripts:

```json
"db:generate": "drizzle-kit generate",
"db:migrate": "drizzle-kit migrate",
"smoke": "node scripts/smoke.mjs"
```

- [ ] **Step 10: Typecheck**

Run: `cd backend && npx tsc --noEmit`
Expected: exit 0. (`index.ts` still imports Supabase at this point — that is fine, it is untouched so far.)

- [ ] **Step 11: Commit**

```bash
git add backend/src/db backend/drizzle backend/drizzle.config.ts \
        backend/docker-compose.dev.yml backend/scripts/smoke.mjs \
        backend/package.json backend/package-lock.json
git commit -m "feat: add Drizzle schema, Postgres client and smoke harness"
```

---

## Task 2: Authentication

Replaces Supabase Auth with scrypt + JWT.

**Files:**
- Create: `backend/src/services/auth.ts`
- Create: `backend/src/controllers/auth.controller.ts`
- Create: `backend/src/routes/auth.routes.ts`
- Modify: `backend/src/middleware/auth.ts`

**Interfaces:**
- Consumes: `db`, `users` from Task 1.
- Produces:
  - `hashPassword(plain: string): Promise<string>`
  - `verifyPassword(plain: string, stored: string): Promise<boolean>`
  - `issueToken(user: AuthUser): string`
  - `verifyToken(token: string): { sub: string; email: string } | null`
  - `seedAdminUser(): Promise<void>`
  - `AuthUser = { id: string; email: string; isAdmin: boolean; linkOwner: boolean }`
  - `authMiddleware` — sets `req.user` to an `AuthUser`

- [ ] **Step 1: Auth service**

Create `backend/src/services/auth.ts`:

```ts
import crypto from 'crypto';
import { promisify } from 'util';
import jwt from 'jsonwebtoken';
import { eq } from 'drizzle-orm';
import { db } from '../db/client';
import { users } from '../db/schema';

const scrypt = promisify(crypto.scrypt) as (p: string, s: Buffer, k: number) => Promise<Buffer>;
const KEYLEN = 64;
const TOKEN_TTL = '7d';

export interface AuthUser {
  id: string;
  email: string;
  isAdmin: boolean;
  linkOwner: boolean;
}

function jwtSecret(): string {
  const s = process.env.JWT_SECRET;
  if (!s || s.length < 32) {
    throw new Error('JWT_SECRET tanımlı değil veya 32 karakterden kısa.');
  }
  return s;
}

/** "<saltHex>:<hashHex>" üretir. */
export async function hashPassword(plain: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const derived = await scrypt(plain, salt, KEYLEN);
  return `${salt.toString('hex')}:${derived.toString('hex')}`;
}

export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  const [saltHex, hashHex] = (stored || '').split(':');
  if (!saltHex || !hashHex) return false;
  const derived = await scrypt(plain, Buffer.from(saltHex, 'hex'), KEYLEN);
  const expected = Buffer.from(hashHex, 'hex');
  // Uzunluklar farklıysa timingSafeEqual fırlatır; önce kontrol et.
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
    const p = jwt.verify(token, jwtSecret()) as any;
    return { sub: String(p.sub), email: String(p.email) };
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
  const [row] = await db
    .select()
    .from(users)
    .where(eq(users.email, email.trim().toLowerCase()))
    .limit(1);
  return row ?? null;
}

/**
 * Kayıt kapalıyken bile ilk girişin mümkün olması için: users tablosu boşsa
 * ve SEED_ADMIN_* env'leri verilmişse admin kullanıcıyı oluşturur.
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
  console.log(`[auth] admin kullanıcı oluşturuldu: ${email}`);
}
```

- [ ] **Step 2: Auth middleware**

Replace the body of `backend/src/middleware/auth.ts`:

```ts
import { Request, Response, NextFunction } from 'express';
import { verifyToken, findUserById } from '../services/auth';

/**
 * Bearer JWT doğrular ve req.user'a AuthUser yerleştirir.
 *
 * Not: eskiden token `?token=` query param'ı ile de kabul ediliyordu; bu, ters
 * vekil access log'una JWT yazdığı için kaldırıldı.
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

  const user = await findUserById(payload.sub);
  if (!user) {
    return res.status(401).json({ message: 'Kullanıcı bulunamadı' });
  }

  (req as any).user = user;
  next();
};
```

- [ ] **Step 3: Auth controller**

Create `backend/src/controllers/auth.controller.ts`:

```ts
import { Request, Response } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../db/client';
import { users } from '../db/schema';
import {
  hashPassword, verifyPassword, issueToken,
  findUserByEmail, AuthUser,
} from '../services/auth';

const publicUser = (u: AuthUser) => ({
  id: u.id, email: u.email, is_admin: u.isAdmin, link_owner: u.linkOwner,
});

export const signup = async (req: Request, res: Response) => {
  if (process.env.SIGNUP_ENABLED !== 'true') {
    return res.status(403).json({ message: 'Yeni kayıt kapalı.' });
  }
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  if (!email || !password) {
    return res.status(400).json({ message: 'E-posta ve şifre zorunlu' });
  }
  if (password.length < 8) {
    return res.status(400).json({ message: 'Şifre en az 8 karakter olmalı' });
  }
  if (await findUserByEmail(email)) {
    return res.status(409).json({ message: 'Bu e-posta zaten kayıtlı' });
  }

  const [row] = await db.insert(users)
    .values({ email, passwordHash: await hashPassword(password) })
    .returning();

  const user: AuthUser = { id: row.id, email: row.email, isAdmin: row.isAdmin, linkOwner: row.linkOwner };
  return res.status(201).json({ token: issueToken(user), user: publicUser(user) });
};

export const login = async (req: Request, res: Response) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  const row = await findUserByEmail(email);

  // Kullanıcı yoksa da hash doğrulaması çalıştırılır ki cevap süresi
  // "kayıtlı e-posta" ile "kayıtsız e-posta" arasında fark yaratmasın.
  const ok = row
    ? await verifyPassword(password, row.passwordHash)
    : await verifyPassword(password, `${'0'.repeat(32)}:${'0'.repeat(128)}`);

  if (!row || !ok) {
    return res.status(401).json({ message: 'E-posta veya şifre hatalı' });
  }

  const user: AuthUser = { id: row.id, email: row.email, isAdmin: row.isAdmin, linkOwner: row.linkOwner };
  return res.json({ token: issueToken(user), user: publicUser(user) });
};

export const me = async (req: Request, res: Response) =>
  res.json({ user: publicUser((req as any).user) });

export const changePassword = async (req: Request, res: Response) => {
  const current = (req as any).user as AuthUser;
  const { currentPassword, newPassword } = req.body || {};
  if (!newPassword || String(newPassword).length < 8) {
    return res.status(400).json({ message: 'Yeni şifre en az 8 karakter olmalı' });
  }
  const row = await findUserByEmail(current.email);
  if (!row || !(await verifyPassword(String(currentPassword || ''), row.passwordHash))) {
    return res.status(401).json({ message: 'Mevcut şifre hatalı' });
  }
  await db.update(users)
    .set({ passwordHash: await hashPassword(String(newPassword)), updatedAt: new Date() })
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
  if (!row || !(await verifyPassword(String(currentPassword || ''), row.passwordHash))) {
    return res.status(401).json({ message: 'Mevcut şifre hatalı' });
  }
  if (await findUserByEmail(email)) {
    return res.status(409).json({ message: 'Bu e-posta zaten kayıtlı' });
  }
  await db.update(users).set({ email, updatedAt: new Date() }).where(eq(users.id, current.id));
  const user: AuthUser = { ...current, email };
  return res.json({ token: issueToken(user), user: publicUser(user) });
};
```

- [ ] **Step 4: Auth routes**

Create `backend/src/routes/auth.routes.ts`:

```ts
import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { signup, login, me, changePassword, changeEmail } from '../controllers/auth.controller';

const router = Router();

router.post('/signup', signup);
router.post('/login', login);
router.get('/me', authMiddleware, me);
router.put('/password', authMiddleware, changePassword);
router.put('/email', authMiddleware, changeEmail);

export default router;
```

Wire it in `backend/src/index.ts` next to the other `app.use('/api/...')` lines:

```ts
import authRoutes from './routes/auth.routes';
app.use('/api/auth', authRoutes);
```

- [ ] **Step 5: Seed on boot**

In `backend/src/index.ts`, inside the `app.listen` callback, before the WhatsApp bootstrap:

```ts
import { seedPlans } from './db/client';
import { seedAdminUser } from './services/auth';

// ... inside listen callback:
seedPlans()
  .then(() => seedAdminUser())
  .catch((e) => console.error('[boot] seed başarısız:', e?.message));
```

- [ ] **Step 6: Typecheck**

Run: `cd backend && npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 7: Add auth checks to the smoke script**

Append to `backend/scripts/smoke.mjs`'s main block:

```js
let TOKEN = null;

await check('login ile jeton alınıyor', async () => {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: process.env.SEED_ADMIN_EMAIL,
      password: process.env.SEED_ADMIN_PASSWORD,
    }),
  });
  assert(r.status === 200, `beklenen 200, gelen ${r.status}`);
  const d = await json(r);
  assert(typeof d.token === 'string' && d.token.length > 20, 'jeton yok');
  assert(d.user.is_admin === true, 'seed kullanıcı admin değil');
  TOKEN = d.token;
});

await check('yanlış şifre 401', async () => {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: process.env.SEED_ADMIN_EMAIL, password: 'yanlis-sifre' }),
  });
  assert(r.status === 401, `beklenen 401, gelen ${r.status}`);
});

await check('kayıt kapalıyken signup 403', async () => {
  const r = await fetch(`${BASE}/api/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'yeni@ornek.com', password: 'parola12345' }),
  });
  assert(r.status === 403, `beklenen 403, gelen ${r.status}`);
});

await check('jetonla /api/auth/me', async () => {
  const r = await fetch(`${BASE}/api/auth/me`, { headers: { Authorization: `Bearer ${TOKEN}` } });
  assert(r.status === 200, `beklenen 200, gelen ${r.status}`);
});

await check('bozuk jeton 401', async () => {
  const r = await fetch(`${BASE}/api/auth/me`, { headers: { Authorization: 'Bearer bozuk.jeton.x' } });
  assert(r.status === 401, `beklenen 401, gelen ${r.status}`);
});
```

- [ ] **Step 8: Run the smoke test**

```bash
cd backend
DATABASE_URL=postgres://leadpin:leadpin@localhost:55432/leadpin \
JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))") \
SEED_ADMIN_EMAIL=admin@leadpin.local SEED_ADMIN_PASSWORD=parola12345 \
SIGNUP_ENABLED=false \
npm run dev &
sleep 5
SEED_ADMIN_EMAIL=admin@leadpin.local SEED_ADMIN_PASSWORD=parola12345 npm run smoke
```

Expected: all auth checks pass. The `/api/stats` check still fails at this point because that route still uses Supabase — that is expected and gets fixed in Task 5.

- [ ] **Step 9: Commit**

```bash
git add backend/src/services/auth.ts backend/src/controllers/auth.controller.ts \
        backend/src/routes/auth.routes.ts backend/src/middleware/auth.ts \
        backend/src/index.ts backend/scripts/smoke.mjs
git commit -m "feat: replace Supabase Auth with scrypt + JWT"
```

---

## Task 3: Frontend auth client

**Files:**
- Create: `src/lib/auth-client.ts`
- Delete: `src/lib/supabase.ts`
- Modify: `src/components/ProtectedRoute.tsx`, `src/pages/AuthPage.tsx`, `src/components/dashboard/AccountDialog.tsx`, `src/hooks/useIsLinkOwner.ts`, `src/hooks/useScrapeJob.ts`, `src/lib/api-client.ts`, `src/pages/DashboardPage.tsx`

**Interfaces:**
- Consumes: `/api/auth/*` from Task 2.
- Produces: `auth` object with `getSession()`, `getUser()`, `signIn()`, `signUp()`, `signOut()`, `updateUser()`, `onAuthStateChange()`.

- [ ] **Step 1: Write the auth client**

Create `src/lib/auth-client.ts`. The surface deliberately mirrors the parts of
`supabase.auth` this app used, so the 13 call sites change as little as possible.

```ts
const API_URL = (import.meta.env.VITE_API_URL || "http://localhost:4000").replace(/\/$/, "")
const STORAGE_KEY = "leadpin.session"

export interface AuthUser {
  id: string
  email: string
  is_admin: boolean
  link_owner: boolean
}

export interface Session {
  access_token: string
  user: AuthUser
}

type Listener = (session: Session | null) => void
const listeners = new Set<Listener>()

function read(): Session | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Session) : null
  } catch {
    return null
  }
}

function write(session: Session | null) {
  try {
    if (session) localStorage.setItem(STORAGE_KEY, JSON.stringify(session))
    else localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Gizli sekmede localStorage yazılamayabilir; oturum bellekte kalır.
  }
  listeners.forEach((l) => l(session))
}

async function post<T>(path: string, body: unknown, token?: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((data as any)?.message || `Hata (${res.status})`)
  return data as T
}

export const auth = {
  getSession: async (): Promise<Session | null> => read(),

  getUser: async (): Promise<AuthUser | null> => read()?.user ?? null,

  signIn: async (email: string, password: string): Promise<Session> => {
    const d = await post<{ token: string; user: AuthUser }>("/api/auth/login", { email, password })
    const session = { access_token: d.token, user: d.user }
    write(session)
    return session
  },

  signUp: async (email: string, password: string): Promise<Session> => {
    const d = await post<{ token: string; user: AuthUser }>("/api/auth/signup", { email, password })
    const session = { access_token: d.token, user: d.user }
    write(session)
    return session
  },

  signOut: async (): Promise<void> => write(null),

  updatePassword: async (currentPassword: string, newPassword: string): Promise<void> => {
    const token = read()?.access_token
    await fetch(`${API_URL}/api/auth/password`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ currentPassword, newPassword }),
    }).then(async (r) => {
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message || "Şifre değiştirilemedi")
    })
  },

  updateEmail: async (currentPassword: string, newEmail: string): Promise<void> => {
    const token = read()?.access_token
    const res = await fetch(`${API_URL}/api/auth/email`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ currentPassword, newEmail }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error((data as any)?.message || "E-posta değiştirilemedi")
    write({ access_token: data.token, user: data.user })
  },

  /** Supabase'in onAuthStateChange'ine karşılık gelir; aboneliği iptal eden fonksiyon döner. */
  onAuthStateChange: (cb: Listener): (() => void) => {
    listeners.add(cb)
    return () => listeners.delete(cb)
  },
}
```

- [ ] **Step 2: Update `api-client.ts`**

Replace the Supabase import and `getAuthHeaders`:

```ts
import { auth } from "@/lib/auth-client"

async function getAuthHeaders(): Promise<HeadersInit> {
  const session = await auth.getSession()
  const headers: HeadersInit = { "Content-Type": "application/json" }
  if (session?.access_token) {
    headers["Authorization"] = `Bearer ${session.access_token}`
  }
  return headers
}
```

- [ ] **Step 3: Update the remaining call sites**

- `ProtectedRoute.tsx`: `supabase.auth.getSession()` → `auth.getSession()`; `supabase.auth.onAuthStateChange((_e, s) => ...)` returns `{ data: { subscription } }` today — the new API returns an unsubscribe function directly, so the cleanup becomes `return unsubscribe`.
- `AuthPage.tsx:26` `signInWithPassword({email, password})` → `auth.signIn(email, password)`; `:51` `signUp({email, password})` → `auth.signUp(email, password)`.
- `AccountDialog.tsx:103,113` (password change) → single `auth.updatePassword(currentPassword, newPassword)` call; `:142,152` (email change) → `auth.updateEmail(currentPassword, newEmail)`. The old code signed in again to verify the current password; the new endpoints verify it server-side, so the extra sign-in call is removed.
- `AccountDialog.tsx:63` `supabase.auth.getUser()` → `auth.getUser()`.
- `useIsLinkOwner.ts`: read `link_owner` from `auth.getUser()` instead of `app_metadata`.
- `useScrapeJob.ts:13` → `auth.getSession()`.
- `DashboardPage.tsx:124` `supabase.auth.signOut()` → `auth.signOut()`.

- [ ] **Step 4: Delete the Supabase client**

```bash
rm src/lib/supabase.ts
```

- [ ] **Step 5: Verify nothing still imports it**

Run: `grep -rn "lib/supabase\|supabase\." src/`
Expected: no matches.

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit` (repo root)
Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add src/lib/auth-client.ts src/components src/pages src/hooks src/lib
git commit -m "feat: swap frontend from Supabase Auth to own auth client"
```

---

## Task 4: Convert `business.controller.ts`

18 queries, including all five `.or()` leaks and five `count: 'exact'` conversions.

**Files:**
- Modify: `backend/src/controllers/business.controller.ts`

**Interfaces:**
- Consumes: `db`, `businesses`, `scrapeJobs`, `outreachLogs`, `contacts` from Task 1; `AuthUser` from Task 2.

- [ ] **Step 1: Convert `getBusinesses`**

Dynamic filters plus a total count. Note the `.or(...)` removal — see Global Constraints.

```ts
import { and, eq, ilike, gte, lte, isNotNull, ne, asc, desc, count, SQL } from 'drizzle-orm';
import { db } from '../db/client';
import { businesses } from '../db/schema';

export const getBusinesses = async (req: Request, res: Response) => {
  const {
    city, district, neighborhood, category,
    hasEmail, hasWebsite, hasPhone,
    minRating, maxRating, minReviews,
    sortBy = 'created_at', sortOrder = 'desc',
    page = 1, limit = 20,
  } = req.query;

  const userId = (req as any).user.id as string;
  const offset = (Number(page) - 1) * Number(limit);

  // Eskiden `.or('user_id.eq.X,user_id.is.null')` idi; user_id null olan her
  // kayıt tüm kullanıcılara görünüyordu. Düz eşitliğe çevrildi.
  const filters: SQL[] = [eq(businesses.userId, userId)];

  if (city) filters.push(ilike(businesses.city, `%${city}%`));
  if (district) filters.push(ilike(businesses.district, `%${district}%`));
  if (neighborhood) filters.push(ilike(businesses.neighborhood, `%${neighborhood}%`));
  if (category) {
    const first = String(category).split(',').map((c) => c.trim()).filter(Boolean)[0];
    if (first) filters.push(ilike(businesses.category, `%${first}%`));
  }
  if (hasEmail === 'true') filters.push(isNotNull(businesses.email), ne(businesses.email, ''));
  if (hasWebsite === 'true') filters.push(isNotNull(businesses.website), ne(businesses.website, ''));
  if (hasPhone === 'true') filters.push(isNotNull(businesses.phone), ne(businesses.phone, ''));
  if (minRating) filters.push(gte(businesses.rating, String(minRating)));
  if (maxRating) filters.push(lte(businesses.rating, String(maxRating)));
  if (minReviews) filters.push(gte(businesses.reviewsCount, Number(minReviews)));

  const where = and(...filters);

  const sortable: Record<string, any> = {
    created_at: businesses.createdAt,
    name: businesses.name,
    rating: businesses.rating,
    reviews_count: businesses.reviewsCount,
    city: businesses.city,
  };
  const sortCol = sortable[String(sortBy)] ?? businesses.createdAt;
  const direction = sortOrder === 'asc' ? asc : desc;

  const [rows, [{ value: total }]] = await Promise.all([
    db.select().from(businesses).where(where)
      .orderBy(direction(sortCol)).limit(Number(limit)).offset(offset),
    db.select({ value: count() }).from(businesses).where(where),
  ]);

  return res.json({
    data: rows,
    total,
    page: Number(page),
    limit: Number(limit),
    totalPages: Math.ceil(total / Number(limit)),
  });
};
```

> `sortBy` comes straight from the query string. Mapping it through the
> `sortable` allow-list rather than interpolating it keeps an attacker from
> steering the ORDER BY clause.

- [ ] **Step 2: Convert `getBusiness`**

```ts
export const getBusiness = async (req: Request, res: Response) => {
  const { id } = req.params;
  const userId = (req as any).user.id as string;

  const [business] = await db.select().from(businesses)
    .where(and(eq(businesses.id, String(id)), eq(businesses.userId, userId))).limit(1);

  if (!business) return res.status(404).json({ message: 'İşletme bulunamadı' });

  const [contactRows, logRows] = await Promise.all([
    db.select().from(contacts).where(eq(contacts.businessId, business.id)),
    db.select().from(outreachLogs)
      .where(and(eq(outreachLogs.businessId, business.id), eq(outreachLogs.userId, userId)))
      .orderBy(desc(outreachLogs.createdAt)),
  ]);

  return res.json({ ...business, contacts: contactRows, outreach_logs: logRows });
};
```

- [ ] **Step 3: Convert `getStats`**

Four counts become one grouped query:

```ts
export const getStats = async (req: Request, res: Response) => {
  const userId = (req as any).user.id as string;
  const now = new Date();
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [row] = await db
    .select({
      total: count(),
      withWebsite: sql<number>`count(*) filter (where ${businesses.website} is not null and ${businesses.website} <> '')`.mapWith(Number),
      withPhone: sql<number>`count(*) filter (where ${businesses.phone} is not null and ${businesses.phone} <> '')`.mapWith(Number),
      thisMonth: sql<number>`count(*) filter (where ${businesses.createdAt} >= ${firstOfMonth})`.mapWith(Number),
    })
    .from(businesses)
    .where(eq(businesses.userId, userId));

  return res.json({
    total: row?.total ?? 0,
    withWebsite: row?.withWebsite ?? 0,
    withPhone: row?.withPhone ?? 0,
    thisMonth: row?.thisMonth ?? 0,
  });
};
```

- [ ] **Step 4: Convert the scrape-job handlers**

`startScrape`, `getScrapeJob`, `getScrapeJobs`, `deleteScrapeJob`, `stopScrapeJob` — each is a direct translation. Every one keeps its `eq(scrapeJobs.userId, userId)` filter. Example:

```ts
export const getScrapeJobs = async (req: Request, res: Response) => {
  const userId = (req as any).user.id as string;
  const rows = await db.select().from(scrapeJobs)
    .where(eq(scrapeJobs.userId, userId))
    .orderBy(desc(scrapeJobs.createdAt));
  return res.json(rows);
};

export const stopScrapeJob = async (req: Request, res: Response) => {
  const userId = (req as any).user.id as string;
  await db.update(scrapeJobs)
    .set({ status: 'failed', errorMessage: 'Kullanıcı tarafından durduruldu' })
    .where(and(eq(scrapeJobs.id, String(req.params.id)), eq(scrapeJobs.userId, userId)));
  return res.json({ message: 'İş durduruldu' });
};
```

`startScrape` keeps its existing subscription check, then:

```ts
const [job] = await db.insert(scrapeJobs)
  .values({ category, city, district, neighborhood, status: 'pending', userId })
  .returning();
```

- [ ] **Step 5: Convert `logOutreach` and `clearAllData`**

```ts
export const clearAllData = async (req: Request, res: Response) => {
  const userId = (req as any).user.id as string;
  // Sıra önemli: outreach_logs ve list_items businesses'a FK ile bağlı.
  await db.delete(outreachLogs).where(eq(outreachLogs.userId, userId));
  await db.delete(scrapeJobs).where(eq(scrapeJobs.userId, userId));
  await db.delete(businesses).where(eq(businesses.userId, userId));
  return res.json({ message: 'Kendi verileriniz başarıyla temizlendi' });
};
```

- [ ] **Step 6: Typecheck**

Run: `cd backend && npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add backend/src/controllers/business.controller.ts
git commit -m "refactor: move business controller to Drizzle, close user_id leak"
```

---

## Task 5: Convert `list.controller.ts`

9 queries, including the `business:businesses(*)` embedded select.

**Files:**
- Modify: `backend/src/controllers/list.controller.ts`

- [ ] **Step 1: Convert the embedded select to a JOIN**

`list.controller.ts:109` currently returns rows shaped `{ business: {...} }`. The
frontend reads `item.business.name`, so the shape must be preserved:

```ts
const items = await db
  .select({ business: businesses })
  .from(listItems)
  .leftJoin(businesses, eq(listItems.businessId, businesses.id))
  .where(eq(listItems.listId, listId));
// items: { business: Business | null }[] — aynı şekil korunur
```

- [ ] **Step 2: Convert the remaining handlers**

`getLists`, `getListById`, `createList`, `addItemsToList`, `removeItemFromList`,
`deleteList`. All filter by `user_id`. `addItemsToList` inserts many rows and must
tolerate duplicates, which the `unique (list_id, business_id)` constraint enforces:

```ts
await db.insert(listItems)
  .values(businessIds.map((businessId: string) => ({ listId, businessId })))
  .onConflictDoNothing();
```

`getListById` must verify ownership of the list before returning its items:

```ts
const [list] = await db.select().from(lists)
  .where(and(eq(lists.id, listId), eq(lists.userId, userId))).limit(1);
if (!list) return res.status(404).json({ message: 'Liste bulunamadı' });
```

- [ ] **Step 3: Typecheck**

Run: `cd backend && npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add backend/src/controllers/list.controller.ts
git commit -m "refactor: move list controller to Drizzle"
```

---

## Task 6: Convert `subscription.ts` and `subscription.routes.ts`

16 queries. Behaviour is unchanged — the plan/quota system is being kept.

**Files:**
- Modify: `backend/src/services/subscription.ts`, `backend/src/routes/subscription.routes.ts`

- [ ] **Step 1: Change the admin check**

`isAdmin()` reads `user.app_metadata.is_admin` today. `AuthUser` now carries the
flag directly:

```ts
export interface AppUser {
  id: string;
  isAdmin?: boolean;
}

function isAdmin(user: AppUser): boolean {
  return Boolean(user?.isAdmin);
}
```

- [ ] **Step 2: Convert `getOrInitSubscription`**

```ts
let [sub] = await db.select().from(subscriptions)
  .where(eq(subscriptions.userId, user.id)).limit(1);

if (!sub) {
  const now = new Date();
  [sub] = await db.insert(subscriptions).values({
    userId: user.id,
    planId: 'free',
    currentPeriodStart: now,
    currentPeriodEnd: new Date(now.getTime() + 30 * 24 * 3600 * 1000),
    scrapeUsed: 0,
    messageUsed: 0,
  }).returning();
}
```

The period-rollover branch and the `plans` lookup translate directly.

- [ ] **Step 3: Convert the counter updates**

`incrementScrape`, `incrementMessages`, `refundMessages` currently read then write,
which can lose updates under concurrency. Use a single atomic statement:

```ts
export async function incrementMessages(userId: string, by: number): Promise<void> {
  if (by <= 0) return;
  await db.update(subscriptions)
    .set({ messageUsed: sql`${subscriptions.messageUsed} + ${by}`, updatedAt: new Date() })
    .where(eq(subscriptions.userId, userId));
}

export async function refundMessages(userId: string, by: number): Promise<void> {
  if (by <= 0) return;
  await db.update(subscriptions)
    .set({
      messageUsed: sql`greatest(0, ${subscriptions.messageUsed} - ${by})`,
      updatedAt: new Date(),
    })
    .where(eq(subscriptions.userId, userId));
}
```

- [ ] **Step 4: Convert `redeemToken` and the routes**

`redeemToken` translates directly. In `subscription.routes.ts`, the
`businesses_expiring_soon` view is queried; define it in `schema.ts` as a view and
select from it, keeping the "view yoksa boş dön" fallback since the view now always
exists after migration.

- [ ] **Step 5: Typecheck**

Run: `cd backend && npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add backend/src/services/subscription.ts backend/src/routes/subscription.routes.ts
git commit -m "refactor: move subscription service to Drizzle with atomic counters"
```

---

## Task 7: Convert `scraper.ts`

8 queries. The scraper runs in the background and must not crash the process.

**Files:**
- Modify: `backend/src/services/scraper.ts`

- [ ] **Step 1: Convert the job status read/write**

```ts
await db.update(scrapeJobs)
  .set({ totalLeads: results.length, status: 'running' })
  .where(eq(scrapeJobs.id, jobId));

const [jobStatus] = await db.select({ status: scrapeJobs.status })
  .from(scrapeJobs).where(eq(scrapeJobs.id, jobId)).limit(1);
if (!jobStatus || jobStatus.status !== 'running') return;
```

- [ ] **Step 2: Convert the business upsert**

The current code does a manual select-then-insert-or-update with a retry loop on
`short_id` collisions. `google_maps_url` is unique, so this becomes one statement:

```ts
await db.insert(businesses)
  .values({ ...businessData, shortId: generateShortId() })
  .onConflictDoUpdate({
    target: businesses.googleMapsUrl,
    // short_id bilerek dışarıda: paylaşılmış linkler bozulmasın.
    set: businessData,
  });
```

Keep the `short_id` retry loop, because `short_id` has its own unique constraint and
a collision there is a different conflict than `google_maps_url`.

- [ ] **Step 3: Typecheck**

Run: `cd backend && npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add backend/src/services/scraper.ts
git commit -m "refactor: move scraper to Drizzle"
```

---

## Task 8: WhatsApp lines in Postgres

Replaces `_lines.json`, removing the single-process constraint.

**Files:**
- Modify: `backend/src/services/whatsapp.ts`, `backend/src/controllers/whatsapp.controller.ts`

- [ ] **Step 1: Replace the JSON file helpers**

Delete `loadLines`, `saveLines`, `LINES_FILE`, and the `ensureRoot` call that only
served them. Replace the four accessors:

```ts
async function getUserLines(userId: string): Promise<LineMeta[]> {
  const rows = await db.select().from(whatsappLines)
    .where(eq(whatsappLines.userId, userId))
    .orderBy(asc(whatsappLines.createdAt));
  return rows.map((r) => ({
    id: r.id,
    userId: r.userId,
    label: r.label,
    phone: r.phone ?? undefined,
    createdAt: r.createdAt.getTime(),
  }));
}

async function upsertLine(meta: LineMeta): Promise<void> {
  await db.insert(whatsappLines)
    .values({ id: meta.id, userId: meta.userId, label: meta.label, phone: meta.phone })
    .onConflictDoUpdate({
      target: whatsappLines.id,
      set: { label: meta.label, phone: meta.phone },
    });
}

async function deleteLineMeta(userId: string, lineId: string): Promise<void> {
  await db.delete(whatsappLines)
    .where(and(eq(whatsappLines.id, lineId), eq(whatsappLines.userId, userId)));
}

async function allLines(): Promise<LineMeta[]> {
  const rows = await db.select().from(whatsappLines);
  return rows.map((r) => ({
    id: r.id, userId: r.userId, label: r.label,
    phone: r.phone ?? undefined, createdAt: r.createdAt.getTime(),
  }));
}
```

- [ ] **Step 2: Make the callers async**

`listLines` and `getLineStatus` are currently synchronous and are called from
`whatsapp.controller.ts` and from `sendSingleMessage`. They become `async` and every
call site gains `await`. `bootstrapLines` uses `allLines()` instead of iterating the
JSON object.

- [ ] **Step 3: Keep the session directory**

`SESSION_ROOT` stays: Chromium profile directories under
`/data/.wwebjs_auth/session-<lineId>/` are still on disk. Only the metadata moved.

- [ ] **Step 4: Typecheck**

Run: `cd backend && npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/whatsapp.ts backend/src/controllers/whatsapp.controller.ts
git commit -m "refactor: store WhatsApp line metadata in Postgres"
```

---

## Task 9: Convert `index.ts` and `user-settings.controller.ts`

8 queries, including the grouped-outreach JOIN — the most intricate conversion.

**Files:**
- Modify: `backend/src/index.ts`, `backend/src/controllers/user-settings.controller.ts`

- [ ] **Step 1: Convert the grouped outreach feed**

`index.ts:117` selects `business:businesses(...)` and `list:lists(...)`. The
grouping logic below it reads `r.business.id` and `r.list.name`, so the query must
produce nested objects:

```ts
const rows = await db
  .select({
    id: outreachLogs.id,
    status: outreachLogs.status,
    message_content: outreachLogs.messageContent,
    created_at: outreachLogs.createdAt,
    batch_id: outreachLogs.batchId,
    list_id: outreachLogs.listId,
    business: {
      id: businesses.id,
      name: businesses.name,
      phone: businesses.phone,
      short_id: businesses.shortId,
      short_id_clicks: businesses.shortIdClicks,
      short_id_last_click_at: businesses.shortIdLastClickAt,
    },
    list: { id: lists.id, name: lists.name },
  })
  .from(outreachLogs)
  .leftJoin(businesses, eq(outreachLogs.businessId, businesses.id))
  .leftJoin(lists, eq(outreachLogs.listId, lists.id))
  .where(and(eq(outreachLogs.type, 'whatsapp'), eq(outreachLogs.userId, userId)))
  .orderBy(desc(outreachLogs.createdAt))
  .limit(500);
```

Delete the "migration uygulanmadıysa eski şemayla retry et" fallback below it — it
existed because `batch_id`/`list_id` might be missing on un-migrated Supabase
projects. Migrations now guarantee the columns.

- [ ] **Step 2: Convert the flat outreach feed and the short-link handler**

`index.ts:234` (flat feed, with `count: 'exact'`) and `index.ts:74` (`/r/:shortId`,
which reads `businesses` then `user_settings`) translate directly.

- [ ] **Step 3: Delete the SSE endpoint**

`/api/scrape/:id/stream` uses `supabase.channel('postgres_changes')`. There is no
replacement and no consumer: `useScrapeJob.ts` polls every 2 seconds. Remove the
route.

- [ ] **Step 4: Convert `user-settings.controller.ts`**

Three queries. The upsert:

```ts
const [row] = await db.insert(userSettings)
  .values({ userId: uid, ...patch, updatedAt: new Date() })
  .onConflictDoUpdate({ target: userSettings.userId, set: { ...patch, updatedAt: new Date() } })
  .returning();
```

- [ ] **Step 5: Remove the Supabase client**

```bash
rm backend/src/utils/supabase.ts backend/schema.sql
grep -rn "supabase" backend/src/
```
Expected: no matches.

- [ ] **Step 6: Close the pool on shutdown**

In the shutdown handler added during step A, after `shutdownAll()`:

```ts
await closePool();
```

- [ ] **Step 7: Typecheck**

Run: `cd backend && npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 8: Commit**

```bash
git add backend/src/index.ts backend/src/controllers/user-settings.controller.ts
git rm backend/src/utils/supabase.ts backend/schema.sql
git commit -m "refactor: move index and user-settings to Drizzle, drop Supabase client"
```

---

## Task 10: Media on disk

**Files:**
- Create: `backend/src/services/media.ts`
- Modify: `backend/src/routes/storage.routes.ts`, `backend/src/index.ts`

**Interfaces:**
- Produces: `saveMedia(userId, base64, mimeType, filename)` → `{ url, path, size }`; `deleteMedia(userId, path)` → `boolean`; `MEDIA_DIR`.

- [ ] **Step 1: Media service**

Create `backend/src/services/media.ts`:

```ts
import path from 'path';
import fs from 'fs/promises';
import crypto from 'crypto';

const APP_DATA_DIR = process.env.APP_DATA_DIR || process.cwd();
export const MEDIA_DIR = path.resolve(APP_DATA_DIR, 'media');
const MAX_BYTES = 16 * 1024 * 1024;

export async function saveMedia(
  userId: string, base64: string, mimeType: string, filename?: string
): Promise<{ url: string; path: string; size: number }> {
  const buffer = Buffer.from(base64, 'base64');
  if (buffer.length === 0) throw Object.assign(new Error('Geçersiz base64 verisi'), { status: 400 });
  if (buffer.length > MAX_BYTES) throw Object.assign(new Error('Dosya 16 MB sınırını aşıyor'), { status: 413 });

  const ext = (filename || '').split('.').pop()?.toLowerCase() || mimeType.split('/')[1] || 'bin';
  // Uzantıyı sadeleştir: yol ayırıcı veya nokta içeren bir uzantı dizin dışına çıkabilir.
  const safeExt = /^[a-z0-9]{1,8}$/.test(ext) ? ext : 'bin';
  const rel = `${userId}/${crypto.randomUUID()}.${safeExt}`;

  await fs.mkdir(path.join(MEDIA_DIR, userId), { recursive: true });
  await fs.writeFile(path.join(MEDIA_DIR, rel), buffer);

  const base = (process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '');
  return { url: `${base}/media/${rel}`, path: rel, size: buffer.length };
}

export async function deleteMedia(userId: string, rel: string): Promise<boolean> {
  // Kullanıcı kendi klasörü dışına çıkamaz.
  const resolved = path.resolve(MEDIA_DIR, rel);
  const userRoot = path.resolve(MEDIA_DIR, userId);
  if (!resolved.startsWith(userRoot + path.sep)) return false;
  await fs.rm(resolved, { force: true });
  return true;
}
```

- [ ] **Step 2: Rewrite the storage routes**

`storage.routes.ts` keeps its two endpoints and its shapes; only the implementation
changes from `supabase.storage` to `saveMedia`/`deleteMedia`.

- [ ] **Step 3: Serve the directory**

In `index.ts`, before the SPA static middleware:

```ts
import { MEDIA_DIR } from './services/media';
app.use('/media', express.static(MEDIA_DIR, { maxAge: '7d', index: false }));
```

Add `r\/` sibling `media\/` to the SPA fallback exclusion regex:

```ts
app.get(/^\/(?!api\/|health(?:\/|$)|r\/|media\/).*/, (_req, res) => {
  res.sendFile(indexHtml);
});
```

- [ ] **Step 4: Typecheck and commit**

Run: `cd backend && npx tsc --noEmit`

```bash
git add backend/src/services/media.ts backend/src/routes/storage.routes.ts backend/src/index.ts
git commit -m "feat: store WhatsApp media on disk instead of Supabase Storage"
```

---

## Task 11: Cleanup scheduler

Replaces the two `pg_cron` jobs, which `postgres:18-alpine` cannot run.

**Files:**
- Create: `backend/src/services/cleanup.ts`
- Modify: `backend/src/index.ts`

- [ ] **Step 1: Cleanup service**

Create `backend/src/services/cleanup.ts`:

```ts
import { sql } from 'drizzle-orm';
import { db } from '../db/client';

const DAY_MS = 24 * 60 * 60 * 1000;

/** 60 günden eski, hiçbir listede olmayan ve hiç mesaj atılmamış lead'ler. */
export async function cleanupUnusedBusinesses(): Promise<number> {
  const result = await db.execute(sql`
    delete from businesses b
    where b.created_at < now() - interval '60 days'
      and not exists (select 1 from list_items li where li.business_id = b.id)
      and not exists (select 1 from outreach_logs ol where ol.business_id = b.id)
  `);
  return result.rowCount ?? 0;
}

export async function cleanupOldOutreachLogs(): Promise<number> {
  const result = await db.execute(sql`
    delete from outreach_logs where created_at < now() - interval '60 days'
  `);
  return result.rowCount ?? 0;
}

async function runOnce(): Promise<void> {
  try {
    const b = await cleanupUnusedBusinesses();
    const l = await cleanupOldOutreachLogs();
    console.log(`[cleanup] ${b} lead, ${l} log silindi`);
  } catch (e: any) {
    console.error('[cleanup] başarısız:', e?.message);
  }
}

/**
 * pg_cron yerine geçer — Supabase'de günlük iki job olarak kuruluydu,
 * postgres:18-alpine'da pg_cron yok.
 */
export function startCleanupScheduler(): () => void {
  void runOnce();
  const timer = setInterval(() => void runOnce(), DAY_MS);
  timer.unref();
  return () => clearInterval(timer);
}
```

- [ ] **Step 2: Start it on boot**

In `index.ts`'s listen callback, after the seeds:

```ts
import { startCleanupScheduler } from './services/cleanup';
startCleanupScheduler();
```

- [ ] **Step 3: Verify against seeded data**

```bash
docker exec -i $(docker compose -f backend/docker-compose.dev.yml ps -q db) \
  psql -U leadpin -d leadpin -c \
  "insert into businesses (user_id, name, created_at) select id, 'eski-kayit', now() - interval '90 days' from users limit 1;"
```
Restart the server and confirm the log line reports `1 lead` deleted, then confirm a
recent business row still exists.

- [ ] **Step 4: Commit**

```bash
git add backend/src/services/cleanup.ts backend/src/index.ts
git commit -m "feat: replace pg_cron jobs with a backend cleanup scheduler"
```

---

## Task 12: Container, environment, and deployment handoff

**Files:**
- Modify: `Dockerfile`, `docs/deploy-coolify.md`
- Modify: `backend/scripts/smoke.mjs`

- [ ] **Step 1: Drop the Supabase build arguments**

In `Dockerfile`, remove `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` (both `ARG`
and `ENV`) and the two `test -n` guards that check them. `VITE_API_URL=/` stays.

- [ ] **Step 2: Full-stack smoke checks**

Add to `backend/scripts/smoke.mjs`:

```js
await check('lead listesi ve toplam sayı', async () => {
  const r = await fetch(`${BASE}/api/businesses?limit=5`, { headers: { Authorization: `Bearer ${TOKEN}` } });
  assert(r.status === 200, `beklenen 200, gelen ${r.status}`);
  const d = await json(r);
  assert(Array.isArray(d.data), 'data dizi değil');
  assert(typeof d.total === 'number', 'total sayı değil');
});

await check('istatistikler', async () => {
  const r = await fetch(`${BASE}/api/stats`, { headers: { Authorization: `Bearer ${TOKEN}` } });
  const d = await json(r);
  assert(typeof d.total === 'number', 'total sayı değil');
});

await check('gruplu mesaj geçmişi (JOIN dönüşümü)', async () => {
  const r = await fetch(`${BASE}/api/outreach/whatsapp/grouped?limit=5`, { headers: { Authorization: `Bearer ${TOKEN}` } });
  assert(r.status === 200, `beklenen 200, gelen ${r.status}`);
  assert(Array.isArray((await json(r)).rows), 'rows dizi değil');
});

await check('abonelik durumu', async () => {
  const r = await fetch(`${BASE}/api/subscription/status`, { headers: { Authorization: `Bearer ${TOKEN}` } });
  const d = await json(r);
  assert(d.plan_id === 'free' || d.is_admin === true, 'plan çözülemedi');
});

await check('WhatsApp hatları listesi', async () => {
  const r = await fetch(`${BASE}/api/whatsapp/lines`, { headers: { Authorization: `Bearer ${TOKEN}` } });
  assert(r.status === 200, `beklenen 200, gelen ${r.status}`);
  assert(Array.isArray((await json(r)).lines), 'lines dizi değil');
});

await check('SPA fallback', async () => {
  const r = await fetch(`${BASE}/dashboard`);
  assert(r.status === 200, `beklenen 200, gelen ${r.status}`);
  assert((r.headers.get('content-type') || '').includes('text/html'), 'HTML değil');
});
```

- [ ] **Step 3: Build and run the image against local Postgres**

```bash
docker build --build-arg VITE_API_URL=/ -t leadpin:local .
docker run -d --name leadpin-local -p 4097:4000 \
  --add-host=host.docker.internal:host-gateway \
  -e DATABASE_URL=postgres://leadpin:leadpin@host.docker.internal:55432/leadpin \
  -e JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))") \
  -e SEED_ADMIN_EMAIL=admin@leadpin.local -e SEED_ADMIN_PASSWORD=parola12345 \
  -e SIGNUP_ENABLED=false -e PUBLIC_BASE_URL=http://127.0.0.1:4097 \
  leadpin:local
SEED_ADMIN_EMAIL=admin@leadpin.local SEED_ADMIN_PASSWORD=parola12345 \
  node backend/scripts/smoke.mjs http://127.0.0.1:4097
```
Expected: every check passes, `0 kaldı`.

- [ ] **Step 4: Verify Chrome still launches in the image**

```bash
docker exec leadpin-local node -e "
const p=require('/app/backend/node_modules/puppeteer');
p.launch({headless:true,executablePath:process.env.PUPPETEER_EXECUTABLE_PATH,args:['--no-sandbox','--disable-dev-shm-usage']})
 .then(async b=>{console.log('Chrome OK', await b.version()); await b.close();})
 .catch(e=>{console.error('HATA:',e.message);process.exit(1)});"
```

- [ ] **Step 5: Verify the desktop build still compiles**

Run: `cd backend && npx tsc --noEmit && cd .. && npx tsc --noEmit && npm run build`
Expected: exit 0. This is the regression guard for the `pkg` sidecar path.

- [ ] **Step 6: Rewrite the deployment guide**

Update `docs/deploy-coolify.md`: replace the Supabase environment section with
`DATABASE_URL`, `JWT_SECRET`, `SIGNUP_ENABLED`, `SEED_ADMIN_*`, `PUBLIC_BASE_URL`;
add the step that creates the `leadpin` database and role on the existing central
`postgres:18-alpine`; drop the "disable Supabase signup" step, which is now
`SIGNUP_ENABLED=false`.

- [ ] **Step 7: Commit and push**

```bash
git add Dockerfile docs/deploy-coolify.md backend/scripts/smoke.mjs
git commit -m "feat: drop Supabase from the image and document Postgres deployment"
git push origin main
```

- [ ] **Step 8: Handoff**

The following require credentials the assistant cannot enter and must be done by the
user, following `docs/deploy-coolify.md`:

1. Create the `leadpin` database and role on the central Postgres
2. Create the Coolify application resource from `aquin0x/leadpin`
3. Enter `DATABASE_URL`, `JWT_SECRET`, and `SEED_ADMIN_*` as Coolify environment variables
4. Add the `leadpin-data` persistent volume at `/data`
5. Deploy, then run the verification checklist in spec §13

---

## Self-Review

**Spec coverage:**

| Spec section | Task |
|---|---|
| §4 tech choices | 1 (Drizzle/pg), 2 (scrypt/jsonwebtoken) |
| §5.1 database location | 1 (local), 12 step 8 (server) |
| §5.2 schema conversion | 1 |
| §5.3 `users` | 1, 2 |
| §5.4 `whatsapp_lines` | 1, 8 |
| §5.5 subscription system kept | 6 |
| §6.1 auth backend | 2 |
| §6.2 auth frontend | 3 |
| §7 cleanup scheduler | 11 |
| §8 media | 10 |
| §9 query inventory (64) | 4, 5, 6, 7, 8, 9 |
| §9.1 embedded selects | 5, 9 |
| §9.2 `user_id` leak | 4 |
| §9.3 counts | 4, 6 |
| §10 desktop compiles | 12 step 5 |
| §11 environment variables | 12 |
| §13 verification | smoke.mjs across 1, 2, 12 |

No gaps.

**Naming consistency:** `db`, `closePool`, `seedPlans` (Task 1) are used as defined
in Tasks 2, 4–11. `AuthUser`, `issueToken`, `verifyToken`, `findUserById`,
`findUserByEmail`, `seedAdminUser`, `hashPassword`, `verifyPassword` (Task 2) are
used as defined in Tasks 2 and 3. `saveMedia`, `deleteMedia`, `MEDIA_DIR` (Task 10)
match their use in Tasks 10 and 12. Frontend `auth` methods defined in Task 3 step 1
match the call sites listed in Task 3 step 3.

**Known deviation from the skill's default:** the standard red/green TDD cycle is
not used, because this repo has no test runner and the Global Constraints forbid
inventing one. Each task instead ends with a typecheck, and behavioural verification
is centralised in `backend/scripts/smoke.mjs`, which grows as the surface grows.
