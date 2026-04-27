const { Pool } = require('pg');

function shouldUseSsl(connectionString) {
  if (!connectionString) {
    return false;
  }

  try {
    const url = new URL(connectionString);
    const sslMode = url.searchParams.get('sslmode');
    return sslMode !== 'disable';
  } catch (_error) {
    return true;
  }
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: shouldUseSsl(process.env.DATABASE_URL) ? { rejectUnauthorized: false } : false
});

pool.on('error', (err) => {
  console.error('PostgreSQL error:', err);
});

module.exports = { pool };
