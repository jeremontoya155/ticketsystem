require('dotenv').config();
const { pool } = require('../config/db');
const { initializeDatabase } = require('../config/init-db');

async function run() {
  try {
    await initializeDatabase();
  } catch (error) {
    console.error('Error inicializando la base de datos:', error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

run();
