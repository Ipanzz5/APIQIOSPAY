import { neon, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema';

neonConfig.fetchConnectionCache = true;

// Lazy init: koneksi baru dibuat saat pertama dipakai, bukan saat module di-import.
// Ini mencegah crash 500 pada saat build/startup jika DATABASE_URL belum diset,
// dan error tertangkap oleh try/catch di masing-masing route handler.
let _db: ReturnType<typeof drizzle> | null = null;

function getDb() {
  if (_db) return _db;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL belum diset di Environment Variables.');
  _db = drizzle(neon(url), { schema });
  return _db;
}

export const db = new Proxy({} as ReturnType<typeof drizzle<typeof schema>>, {
  get(_t, prop) {
    return (getDb() as any)[prop];
  },
});
