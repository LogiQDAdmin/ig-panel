import pg from 'pg';

// La conexión sale de las variables PGHOST, PGPORT, PGDATABASE, PGUSER y PGPASSWORD.
export const pool = new pg.Pool({ max: 5, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 5_000 });

export const query = async <T extends pg.QueryResultRow = Record<string, unknown>>(
  text: string,
  values: unknown[] = [],
): Promise<T[]> => (await pool.query<T>(text, values)).rows;

/** Lee varios ajustes de ig_settings de una vez. */
export const settings = async (keys: string[]): Promise<Record<string, string>> => {
  const rows = await query<{ key: string; value: string }>(
    'SELECT key, value FROM ig_settings WHERE key = ANY($1::text[])',
    [keys],
  );
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
};
