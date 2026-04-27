const fs = require('fs/promises');
const path = require('path');
const { pool } = require('./db');

const schemaPath = path.join(__dirname, 'schema.sql');
let initializationPromise;

async function initializeDatabase() {
  if (!initializationPromise) {
    initializationPromise = (async () => {
      const schemaSql = await fs.readFile(schemaPath, 'utf8');
      await pool.query(schemaSql);
      console.log('Base de datos inicializada correctamente');
    })().catch((error) => {
      initializationPromise = null;
      throw error;
    });
  }

  return initializationPromise;
}

module.exports = { initializeDatabase };
