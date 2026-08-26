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
    { id: 'free', name: 'Ücretsiz', priceUsd: '0', scrapeLimit: 250, messageLimit: 100, leadStorage: 500, displayOrder: 1 },
    { id: 'pro', name: 'Pro', priceUsd: '10', scrapeLimit: 1500, messageLimit: 1000, leadStorage: 500, displayOrder: 2 },
    { id: 'unlimited', name: 'Sınırsız', priceUsd: '20', scrapeLimit: 10000, messageLimit: 5000, leadStorage: 500, displayOrder: 3 },
  ];
  for (const p of rows) {
    await db.insert(plans).values(p).onConflictDoUpdate({ target: plans.id, set: p });
  }
}
