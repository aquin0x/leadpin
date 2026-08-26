import type { Config } from 'drizzle-kit';

// Şema tek kaynak: src/db/schema.ts. Migration'lar drizzle/ altında sürümlenir
// ve commit edilir — bu projede daha önce migration altyapısı yoktu, schema.sql
// elle çalıştırılıyordu.
export default {
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL || 'postgres://leadpin:leadpin@localhost:55432/leadpin',
  },
} satisfies Config;
