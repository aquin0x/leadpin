/**
 * Açılışta migration uygulayıcı.
 *
 * drizzle-kit bir devDependency olduğu için üretim imajında bulunmaz; onun
 * yerine drizzle-orm'un kendi migrator'ı kullanılır. Uygulanmış migration'lar
 * atlandığından her açılışta güvenle çalıştırılabilir — böylece yeni bir
 * veritabanına deploy edilirken tabloları elle kurmak gerekmez.
 */
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import path from 'path';

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('[migrate] DATABASE_URL tanımlı değil — migration uygulanamaz.');
    process.exit(1);
  }

  const pool = new Pool({ connectionString, max: 1 });

  try {
    // dist/db/migrate.js konumundan bakınca migration klasörü ../../drizzle
    const migrationsFolder = path.resolve(__dirname, '../../drizzle');
    await migrate(drizzle(pool), { migrationsFolder });
    console.log('[migrate] migrationlar uygulandı');
  } catch (err: any) {
    console.error('[migrate] başarısız:', err.message);
    await pool.end().catch(() => {});
    process.exit(1);
  }

  await pool.end();
}

main();
