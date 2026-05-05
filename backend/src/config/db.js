import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

const {
  DB_HOST = '127.0.0.1',
  DB_USER = 'root',
  DB_PASSWORD = '',
  DB_NAME = 'datn',
  DB_PORT = '3306',
  DB_RETRY_COUNT = '5',
  DB_RETRY_DELAY = '2000',
} = process.env;

let pool = null;

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function connectDB(retries = Number(DB_RETRY_COUNT)) {
  let lastErr = null;
  for (let i = 0; i <= retries; i++) {
    try {
      pool = mysql.createPool({
        host: DB_HOST,
        user: DB_USER,
        password: DB_PASSWORD,
        database: DB_NAME,
        port: Number(DB_PORT),
        waitForConnections: true,
        connectionLimit: 10,
      });
      await pool.query('SELECT 1');
      console.log('Database connected.');
      return pool;
    } catch (err) {
      lastErr = err;
      console.error(`Database connection attempt ${i + 1} failed: ${err.message}`);
      if (i < retries) await wait(Number(DB_RETRY_DELAY));
    }
  }
  throw new Error(`Unable to connect to DB: ${lastErr?.message || lastErr}`);
}

export function getPool() {
  if (!pool) throw new Error('Database not connected. Call connectDB() first.');
  return pool;
}

export async function query(sql, params = []) {
  const p = getPool();
  const [rows] = await p.execute(sql, params);
  return rows;
}

export async function withTransaction(fn) {
  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    const result = await fn(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function testConnection() {
  const p = getPool();
  await p.query('SELECT 1');
}

// default export optional
export default {
  connectDB,
  getPool,
  query,
  withTransaction,
  testConnection,
};
