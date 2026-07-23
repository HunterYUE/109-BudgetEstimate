import pg from 'pg';

// PostgreSQL NUMERIC 类型默认返回字符串，注册解析器自动转为 number
// NUMERIC OID = 1700, FLOAT8 OID = 701, FLOAT4 OID = 700
pg.types.setTypeParser(1700, (val: string) => parseFloat(val));
pg.types.setTypeParser(701, (val: string) => parseFloat(val));
pg.types.setTypeParser(700, (val: string) => parseFloat(val));

const {
  DB_HOST = '127.0.0.1',
  DB_PORT = '5432',
  DB_NAME = 'budget_estimate',
  DB_USER = 'budget_app',
  DB_PASSWORD,
} = process.env;

if (!DB_PASSWORD) {
  console.error('[DB] FATAL: DB_PASSWORD environment variable is required');
  process.exit(1);
}

const pool = new pg.Pool({
  host: DB_HOST,
  port: parseInt(DB_PORT),
  database: DB_NAME,
  user: DB_USER,
  password: DB_PASSWORD,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('[DB] Unexpected pool error:', err.message);
});

export async function query<T extends pg.QueryResultRow = any>(text: string, params?: unknown[]): Promise<pg.QueryResult<T>> {
  const start = Date.now();
  const result = await pool.query<T>(text, params);
  const elapsed = Date.now() - start;
  if (elapsed > 1000) {
    console.warn(`[DB] Slow query (${elapsed}ms):`, text.slice(0, 120));
  }
  return result;
}

export async function getClient() {
  const client = await pool.connect();
  return client;
}

export default pool;
