import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from './schema';
import { plans } from './schema';


const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL tanımlı değil — veritabanı bağlantısı kurulamaz.');
}

const pool = new Pool({ connectionString, max: 10 });

pool.on('error', (err) => {
  // Havuzdaki boşta bir bağlantı koparsa (ör. Postgres yeniden başladı) süreç
  // çökmesin; bir sonraki sorgu yeni bağlantı açar.
  console.error('[db] beklenmeyen havuz hatası:', err.message);
});

export const db = drizzle(pool, { schema });

export const closePool = () => pool.end();

/**
 * plans referans tablosunu garanti eder. subscription.ts bu tabloya join
 * attığı için boş olamaz; açılışta bir kez çağrılır.
 */
export async function seedPlans(): Promise<void> {
  const rows = [
    { id: 'free', name: 'Ücretsiz', price_usd: 0, scrape_limit: 250, message_limit: 100, lead_storage: 500, display_order: 1 },
    { id: 'pro', name: 'Pro', price_usd: 10, scrape_limit: 1500, message_limit: 1000, lead_storage: 500, display_order: 2 },
    { id: 'unlimited', name: 'Sınırsız', price_usd: 20, scrape_limit: 10000, message_limit: 5000, lead_storage: 500, display_order: 3 },
  ];
  for (const p of rows) {
    await db.insert(plans).values(p).onConflictDoUpdate({ target: plans.id, set: p });
  }
}
